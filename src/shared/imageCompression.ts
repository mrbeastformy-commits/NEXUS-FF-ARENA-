export type ImageCompressionPurpose = 'deposit' | 'avatar' | 'chat' | 'banner' | 'tournament';

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export interface CompressImageOptions {
  purpose?: ImageCompressionPurpose;
  maxDimension?: number;
  initialQuality?: number;
  targetMaxBytes?: number;
  maxDataUrlLength?: number;
  squareCrop?: boolean;
}

const PURPOSE_PRESETS: Record<
  ImageCompressionPurpose,
  {
    maxDimension: number;
    initialQuality: number;
    targetMaxBytes: number;
    squareCrop: boolean;
  }
> = {
  deposit: { maxDimension: 1280, initialQuality: 0.72, targetMaxBytes: 295 * 1024, squareCrop: false },
  avatar: { maxDimension: 256, initialQuality: 0.78, targetMaxBytes: 220 * 1024, squareCrop: true },
  chat: { maxDimension: 1024, initialQuality: 0.74, targetMaxBytes: 290 * 1024, squareCrop: false },
  banner: { maxDimension: 1280, initialQuality: 0.76, targetMaxBytes: 295 * 1024, squareCrop: false },
  tournament: { maxDimension: 1280, initialQuality: 0.76, targetMaxBytes: 295 * 1024, squareCrop: false },
};

const HARD_MAX_DATA_URL_LENGTH = 440000; // Keeps Firestore doc well below 1 MB limit (~300 KB binary)

async function loadImageSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image file.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode compressed image as base64.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read compressed image data.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resizes and compresses an image on-device into a compact base64 Data URL
 * strictly under ~300 KB so Firestore `images/{imageId}` documents stay safely
 * below Firestore's 1 MB document size limit while preserving text legibility.
 */
export async function compressImageForFirestore(
  file: File,
  options: CompressImageOptions = {},
): Promise<CompressedImageResult> {
  const preset = options.purpose ? PURPOSE_PRESETS[options.purpose] : PURPOSE_PRESETS.deposit;
  const baseMaxDimension = options.maxDimension ?? preset.maxDimension;
  const initialQuality = options.initialQuality ?? preset.initialQuality;
  const targetMaxBytes = options.targetMaxBytes ?? preset.targetMaxBytes;
  const maxDataUrlLength = options.maxDataUrlLength ?? HARD_MAX_DATA_URL_LENGTH;
  const squareCrop = options.squareCrop ?? preset.squareCrop;

  const { source, width: origW, height: origH, cleanup } = await loadImageSource(file);

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable for image compression.');
    }

    const renderVariant = async (
      maxDim: number,
      mimeType: string,
      quality: number,
    ): Promise<{ blob: Blob; dataUrl: string; w: number; h: number }> => {
      let sx = 0;
      let sy = 0;
      let sw = origW;
      let sh = origH;
      let targetW: number;
      let targetH: number;

      if (squareCrop) {
        const side = Math.min(origW, origH);
        sx = Math.max(0, Math.floor((origW - side) / 2));
        sy = Math.max(0, Math.floor((origH - side) / 2));
        sw = side;
        sh = side;
        targetW = maxDim;
        targetH = maxDim;
      } else {
        const longest = Math.max(origW, origH);
        const scale = longest > maxDim ? maxDim / longest : 1;
        targetW = Math.max(1, Math.round(origW * scale));
        targetH = Math.max(1, Math.round(origH * scale));
      }

      canvas.width = targetW;
      canvas.height = targetH;

      // Solid white background preserves text contrast on transparent PNG receipts
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);

      const encoded = await canvasToBlob(canvas, mimeType, quality);
      if (!encoded) {
        throw new Error('Image compression failed.');
      }
      const dataUrl = await blobToDataUrl(encoded);
      return { blob: encoded, dataUrl, w: targetW, h: targetH };
    };

    // Prefer WebP when supported by the browser for best text sharpness per KB; fall back to JPEG
    const probe = await renderVariant(baseMaxDimension, 'image/webp', initialQuality);
    const supportsWebp = probe.blob.type === 'image/webp' && probe.dataUrl.startsWith('data:image/webp;base64,');
    const mimeType = supportsWebp ? 'image/webp' : 'image/jpeg';
    const extension = supportsWebp ? 'webp' : 'jpg';

    let best = supportsWebp ? probe : await renderVariant(baseMaxDimension, mimeType, initialQuality);

    const fitsLimits = (candidate: { blob: Blob; dataUrl: string }) =>
      candidate.blob.size <= targetMaxBytes && candidate.dataUrl.length <= maxDataUrlLength;

    // Step 1: Reduce quality progressively while keeping full target resolution
    const qualitySteps = [0.68, 0.6, 0.52, 0.44, 0.36].filter((q) => q < initialQuality);
    for (const q of qualitySteps) {
      if (fitsLimits(best)) break;
      const next = await renderVariant(baseMaxDimension, mimeType, q);
      if (next.blob.size < best.blob.size) {
        best = next;
      }
    }

    // Step 2: Reduce dimensions progressively only if dense content still exceeds ~300 KB
    if (!fitsLimits(best)) {
      const dimMultipliers = [0.8, 0.65, 0.5];
      for (const mult of dimMultipliers) {
        if (fitsLimits(best)) break;
        const nextDim = Math.max(128, Math.round(baseMaxDimension * mult));
        for (const q of [0.65, 0.52, 0.4]) {
          const next = await renderVariant(nextDim, mimeType, q);
          if (next.blob.size < best.blob.size) {
            best = next;
          }
          if (fitsLimits(best)) break;
        }
      }
    }

    if (best.dataUrl.length > maxDataUrlLength || best.blob.size > 307200) {
      throw new Error(
        `Compressed image (${Math.round(best.blob.size / 1024)} KB) still exceeds the 300 KB limit. Please choose a smaller image.`,
      );
    }

    return {
      blob: best.blob,
      dataUrl: best.dataUrl,
      mimeType,
      extension,
      width: best.w,
      height: best.h,
      originalSize: file.size,
      compressedSize: best.blob.size,
    };
  } finally {
    cleanup();
  }
}
