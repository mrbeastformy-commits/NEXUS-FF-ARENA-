import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchImageDataUrl, getCachedImageDataUrl } from './imageUpload';

export function NexusLogo({
  size = 36,
  variant = 'arena',
  className = '',
}: {
  size?: number;
  variant?: 'arena' | 'admin';
  className?: string;
}) {
  const [iconMissing, setIconMissing] = useState(false);
  const accent = variant === 'admin' ? '#F5C451' : '#FF1E38';

  if (!iconMissing) {
    return (
      <img
        src="/icon.png"
        alt={variant === 'admin' ? 'NEXUS FF ADMIN' : 'NEXUS FF ARENA'}
        width={size}
        height={size}
        onError={() => setIconMissing(true)}
        className={`shrink-0 rounded-xl object-cover select-none ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d="M32 4L56 16V35C56 48.2 45.8 57.6 32 61C18.2 57.6 8 48.2 8 35V16L32 4Z"
        fill="#0D1017"
        stroke="#D4AF37"
        strokeWidth="2.5"
      />
      <path
        d="M32 10L50 19.5V34.5C50 44.6 42.3 51.8 32 54.8C21.7 51.8 14 44.6 14 34.5V19.5L32 10Z"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.2"
      />
      <path
        d="M22 43V21H27.2L36.8 34.5V21H42V43H36.8L27.2 29.5V43H22Z"
        fill={accent}
      />
      <path d="M32 12L35.2 16.5H28.8L32 12Z" fill="#D4AF37" />
    </svg>
  );
}

export function SafeMediaImage({
  imageId,
  src,
  alt,
  className = '',
  fallbackTitle,
  eager = false,
}: {
  imageId?: string | null;
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  eager?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState<boolean>(eager);
  const [loadedDataUrl, setLoadedDataUrl] = useState<string | null>(() =>
    imageId ? getCachedImageDataUrl(imageId) || null : null,
  );
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  // Sync immediate cache hit and reset failure when props change
  useEffect(() => {
    setFailed(false);
    if (!imageId) {
      setLoadedDataUrl(null);
      setLoadingImage(false);
      return;
    }
    const cached = getCachedImageDataUrl(imageId);
    if (cached) {
      setLoadedDataUrl(cached);
      setLoadingImage(false);
    } else {
      setLoadedDataUrl(null);
    }
  }, [imageId, src]);

  // Lazy trigger when image element nears viewport (or immediately when eager)
  useEffect(() => {
    if (!imageId || loadedDataUrl || eager) {
      if (eager) setInView(true);
      return;
    }
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageId, loadedDataUrl, eager]);

  // Fetch base64 image document on demand from Firestore `images/{imageId}`
  useEffect(() => {
    if (!imageId || !inView || loadedDataUrl) return;
    let cancelled = false;
    setLoadingImage(true);
    void fetchImageDataUrl(imageId).then((url) => {
      if (cancelled) return;
      setLoadingImage(false);
      if (url) {
        setLoadedDataUrl(url);
      } else if (!src) {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [imageId, inView, loadedDataUrl, src]);

  const resolvedSrc = loadedDataUrl || (!imageId ? src : loadingImage || inView ? null : src) || (!loadedDataUrl && failed ? src : null);

  if (imageId && !loadedDataUrl && !failed) {
    return (
      <div
        ref={containerRef}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#121621] via-[#0B0D13] to-[#1A0D12] animate-pulse border border-white/5 ${className}`}
        aria-label={alt}
      >
        {fallbackTitle && (
          <span className="text-[11px] font-medium text-slate-400 px-3 text-center truncate max-w-full">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  if (!resolvedSrc || failed) {
    return (
      <div
        ref={containerRef}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#121621] via-[#0B0D13] to-[#1A0D12] text-slate-500 border border-white/5 ${className}`}
        aria-label={alt}
      >
        <ImageOff className="w-6 h-6 text-[#D4AF37]/60 mb-1" />
        {fallbackTitle && (
          <span className="text-[11px] font-medium text-slate-400 px-3 text-center truncate max-w-full">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
