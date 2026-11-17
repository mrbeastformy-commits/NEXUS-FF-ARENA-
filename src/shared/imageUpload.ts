import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { compressImageForFirestore, type ImageCompressionPurpose } from './imageCompression';
import type { ImagePurpose } from './types';

export type ManagedUploadState = 'idle' | 'compressing' | 'uploading' | 'done' | 'error';

export interface ImageUploadProgress {
  state: ManagedUploadState;
  progress: number;
  fileName?: string;
  originalKb?: number;
  compressedKb?: number;
  width?: number;
  height?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface StartImageUploadOptions {
  file: File;
  purpose: Exclude<ImagePurpose, 'healthcheck'>;
  imageId?: string;
  chatId?: string;
  maxDimension?: number;
  initialQuality?: number;
  targetMaxBytes?: number;
  squareCrop?: boolean;
  timeoutMs?: number;
}

export interface ImageUploadSuccess {
  imageId: string;
  dataUrl: string;
  contentType: string;
  size: number;
  extension: string;
  width: number;
  height: number;
}

export class FirestoreImageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirestoreImageError';
    this.code = code;
  }
}

export const DEFAULT_SAVE_TIMEOUT_MS = 20000;

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

// ==================== IN-MEMORY LAZY IMAGE CACHE ====================
const imageCache = new Map<string, string>();
const inflightFetches = new Map<string, Promise<string | null>>();

export function getCachedImageDataUrl(imageId: string): string | undefined {
  return imageCache.get(imageId);
}

export function cacheImageDataUrl(imageId: string, dataUrl: string): void {
  if (!imageId || !dataUrl) return;
  imageCache.set(imageId, dataUrl);
}

export function fetchImageDataUrl(imageId: string): Promise<string | null> {
  if (!imageId) return Promise.resolve(null);
  const cached = imageCache.get(imageId);
  if (cached) return Promise.resolve(cached);

  const existing = inflightFetches.get(imageId);
  if (existing) return existing;

  const p = getDoc(doc(db, 'images', imageId))
    .then((snap) => {
      if (!snap.exists()) return null;
      const dataUrl = (snap.data()?.dataUrl as string | undefined) || null;
      if (dataUrl) {
        imageCache.set(imageId, dataUrl);
      }
      return dataUrl;
    })
    .catch(() => null)
    .finally(() => {
      inflightFetches.delete(imageId);
    });

  inflightFetches.set(imageId, p);
  return p;
}

export function formatFirestoreImageError(err: unknown): { code: string; message: string } {
  if (err instanceof FirestoreImageError) {
    return { code: err.code, message: err.message };
  }
  const raw = err as { code?: string; message?: string };
  const code = typeof raw?.code === 'string' && raw.code.length > 0 ? raw.code : 'firestore/save-failed';
  const rawMsg = typeof raw?.message === 'string' && raw.message.length > 0 ? raw.message : 'Image save failed.';
  const message = rawMsg.includes(code) ? rawMsg : `${code}: ${rawMsg}`;
  return { code, message };
}

interface PreparedImageDoc {
  imageId: string;
  purpose: ImagePurpose;
  chatId?: string;
  dataUrl: string;
  contentType: string;
  extension: string;
  sizeBytes: number;
  originalKb: number;
  compressedKb: number;
  width: number;
  height: number;
}

function generateImageDocId(purpose: ImagePurpose, uid: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `img_${purpose}_${uid.slice(0, 6)}_${Date.now()}_${rand}`;
}

async function writePreparedImageDoc(
  payload: PreparedImageDoc,
  fileName: string,
  timeoutMs: number,
  onProgress?: (info: ImageUploadProgress) => void,
  isStale?: () => boolean,
): Promise<ImageUploadSuccess> {
  const user = auth.currentUser;
  if (!user) {
    throw new FirestoreImageError('firestore/unauthenticated', 'firestore/unauthenticated: Sign in before saving images.');
  }

  onProgress?.({
    state: 'uploading',
    progress: 35,
    fileName,
    originalKb: payload.originalKb,
    compressedKb: payload.compressedKb,
    width: payload.width,
    height: payload.height,
  });

  // Gentle progress pulse while Firestore commit completes
  let currentPct = 35;
  const tickTimer = window.setInterval(() => {
    if (isStale?.()) return;
    currentPct = Math.min(90, currentPct + 12);
    onProgress?.({
      state: 'uploading',
      progress: currentPct,
      fileName,
      originalKb: payload.originalKb,
      compressedKb: payload.compressedKb,
      width: payload.width,
      height: payload.height,
    });
  }, 350);

  let timeoutHandle: number | null = null;
  try {
    const docPayload: Record<string, unknown> = {
      ownerUid: user.uid,
      purpose: payload.purpose,
      dataUrl: payload.dataUrl,
      sizeBytes: payload.sizeBytes,
      createdAt: serverTimestamp(),
    };
    if (payload.chatId) {
      docPayload.chatId = payload.chatId;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = window.setTimeout(() => {
        reject(
          new FirestoreImageError(
            'firestore/deadline-exceeded',
            `firestore/deadline-exceeded: Saving image timed out after ${Math.round(timeoutMs / 1000)} seconds. Tap Retry to try again.`,
          ),
        );
      }, timeoutMs);
    });

    await Promise.race([setDoc(doc(db, 'images', payload.imageId), docPayload), timeoutPromise]);

    if (isStale?.()) {
      throw new FirestoreImageError('firestore/cancelled', 'firestore/cancelled: Superseded by a newer image.');
    }

    cacheImageDataUrl(payload.imageId, payload.dataUrl);

    onProgress?.({
      state: 'done',
      progress: 100,
      fileName,
      originalKb: payload.originalKb,
      compressedKb: payload.compressedKb,
      width: payload.width,
      height: payload.height,
    });

    return {
      imageId: payload.imageId,
      dataUrl: payload.dataUrl,
      contentType: payload.contentType,
      size: payload.sizeBytes,
      extension: payload.extension,
      width: payload.width,
      height: payload.height,
    };
  } catch (err) {
    const formatted = formatFirestoreImageError(err);
    if (!isStale?.() && formatted.code !== 'firestore/cancelled') {
      onProgress?.({
        state: 'error',
        progress: 0,
        fileName,
        originalKb: payload.originalKb,
        compressedKb: payload.compressedKb,
        width: payload.width,
        height: payload.height,
        errorCode: formatted.code,
        errorMessage: formatted.message,
      });
    }
    throw new FirestoreImageError(formatted.code, formatted.message);
  } finally {
    window.clearInterval(tickTimer);
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Shared React hook for compressing images on-device and saving them to the
 * Firestore `images` collection (< 300 KB), returning a light image document ID.
 */
export function useFirestoreImageUpload() {
  const [status, setStatus] = useState<ImageUploadProgress>({ state: 'idle', progress: 0 });
  const [result, setResult] = useState<ImageUploadSuccess | null>(null);

  const sessionIdRef = useRef<number>(0);
  const cachedRef = useRef<{
    payload: PreparedImageDoc;
    fileName: string;
    timeoutMs: number;
  } | null>(null);
  const lastOptionsRef = useRef<StartImageUploadOptions | null>(null);

  const cancel = useCallback(() => {
    sessionIdRef.current += 1;
  }, []);

  const reset = useCallback(() => {
    cancel();
    cachedRef.current = null;
    lastOptionsRef.current = null;
    setResult(null);
    setStatus({ state: 'idle', progress: 0 });
  }, [cancel]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  const startUpload = useCallback(async (options: StartImageUploadOptions): Promise<ImageUploadSuccess> => {
    const user = auth.currentUser;
    if (!user) {
      const err = new FirestoreImageError(
        'firestore/unauthenticated',
        'firestore/unauthenticated: Sign in before uploading images.',
      );
      setStatus({
        state: 'error',
        progress: 0,
        fileName: options.file.name,
        errorCode: err.code,
        errorMessage: err.message,
      });
      throw err;
    }

    const mySession = ++sessionIdRef.current;
    cachedRef.current = null;
    lastOptionsRef.current = options;
    setResult(null);

    const timeoutMs = options.timeoutMs ?? DEFAULT_SAVE_TIMEOUT_MS;
    const isStale = () => sessionIdRef.current !== mySession;
    const originalKb = Math.max(1, Math.round(options.file.size / 1024));

    setStatus({
      state: 'compressing',
      progress: 10,
      fileName: options.file.name,
      originalKb,
    });

    try {
      const compressed = await compressImageForFirestore(options.file, {
        purpose: options.purpose as ImageCompressionPurpose,
        maxDimension: options.maxDimension,
        initialQuality: options.initialQuality,
        targetMaxBytes: options.targetMaxBytes,
        squareCrop: options.squareCrop,
      });

      if (isStale()) {
        throw new FirestoreImageError('firestore/cancelled', 'firestore/cancelled: Superseded by a new image.');
      }

      const imageId = options.imageId || generateImageDocId(options.purpose, user.uid);
      const prepared: PreparedImageDoc = {
        imageId,
        purpose: options.purpose,
        chatId: options.chatId,
        dataUrl: compressed.dataUrl,
        contentType: compressed.mimeType,
        extension: compressed.extension,
        sizeBytes: compressed.compressedSize,
        originalKb,
        compressedKb: Math.max(1, Math.round(compressed.compressedSize / 1024)),
        width: compressed.width,
        height: compressed.height,
      };

      cachedRef.current = {
        payload: prepared,
        fileName: options.file.name,
        timeoutMs,
      };

      const saved = await writePreparedImageDoc(
        prepared,
        options.file.name,
        timeoutMs,
        (info) => {
          if (!isStale()) setStatus(info);
        },
        isStale,
      );

      if (!isStale()) {
        setResult(saved);
      }
      return saved;
    } catch (err) {
      const formatted = formatFirestoreImageError(err);
      if (!isStale() && formatted.code !== 'firestore/cancelled') {
        setStatus((prev) => ({
          ...prev,
          state: 'error',
          fileName: options.file.name,
          errorCode: formatted.code,
          errorMessage: formatted.message,
        }));
      }
      throw new FirestoreImageError(formatted.code, formatted.message);
    }
  }, []);

  const retry = useCallback(async (): Promise<ImageUploadSuccess> => {
    if (!cachedRef.current) {
      if (lastOptionsRef.current) {
        return startUpload(lastOptionsRef.current);
      }
      throw new FirestoreImageError('firestore/invalid-argument', 'No previous image selected to retry.');
    }

    const { payload, fileName, timeoutMs } = cachedRef.current;
    const mySession = ++sessionIdRef.current;
    setResult(null);

    const isStale = () => sessionIdRef.current !== mySession;
    const saved = await writePreparedImageDoc(
      payload,
      fileName,
      timeoutMs,
      (info) => {
        if (!isStale()) setStatus(info);
      },
      isStale,
    );
    if (!isStale()) {
      setResult(saved);
    }
    return saved;
  }, [startUpload]);

  return {
    status,
    result,
    startUpload,
    retry,
    cancel,
    reset,
  };
}

// Valid 67-byte 1x1 transparent PNG encoded as base64 Data URL for admin Image Save Check
const TINY_TEST_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

export interface FirestoreImageCheckResult {
  ok: boolean;
  imageId?: string;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  details: string;
}

/**
 * Admin diagnostic check: writes a tiny 1x1 PNG document to Firestore `images`,
 * reads it back to confirm security rules & persistence, and deletes it cleanly.
 */
export async function runFirestoreImageCheck(): Promise<FirestoreImageCheckResult> {
  const started = performance.now();
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - started),
      errorCode: 'firestore/unauthenticated',
      errorMessage: 'Sign in as Owner Admin before running Image Save Check.',
      details: 'No active Firebase Auth session.',
    };
  }

  const probeId = `img_healthcheck_${user.uid.slice(0, 6)}_${Date.now()}`;
  const probeRef = doc(db, 'images', probeId);

  try {
    await setDoc(probeRef, {
      ownerUid: user.uid,
      purpose: 'healthcheck',
      dataUrl: TINY_TEST_PNG_DATA_URL,
      sizeBytes: 67,
      createdAt: serverTimestamp(),
    });

    const snap = await getDoc(probeRef);
    if (!snap.exists() || snap.data()?.dataUrl !== TINY_TEST_PNG_DATA_URL) {
      throw new FirestoreImageError(
        'firestore/data-loss',
        'Image document was written but could not be verified on read-back.',
      );
    }

    await deleteDoc(probeRef);

    return {
      ok: true,
      imageId: probeId,
      durationMs: Math.round(performance.now() - started),
      details: `Saved 67-byte PNG test document (${probeId}), read it back from Firestore, and deleted it cleanly.`,
    };
  } catch (err) {
    const formatted = formatFirestoreImageError(err);
    return {
      ok: false,
      imageId: probeId,
      durationMs: Math.round(performance.now() - started),
      errorCode: formatted.code,
      errorMessage: formatted.message,
      details: formatted.message,
    };
  }
}
