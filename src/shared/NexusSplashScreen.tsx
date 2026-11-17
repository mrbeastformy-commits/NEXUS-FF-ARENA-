import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { NexusLogo } from './NexusLogo';

interface NexusSplashScreenProps {
  variant: 'arena' | 'admin';
  isReady: boolean;
  statusText?: string;
  minDurationMs?: number;
  onComplete: () => void;
}

const FADE_OUT_MS = 500;

export function NexusSplashScreen({
  variant,
  isReady,
  statusText,
  minDurationMs = 5000,
  onComplete,
}: NexusSplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startRef = useRef<number>(performance.now());
  const readyRef = useRef<boolean>(isReady);
  const onCompleteRef = useRef<() => void>(onComplete);
  const completedRef = useRef<boolean>(false);

  useEffect(() => {
    readyRef.current = isReady;
  }, [isReady]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Play public/video/loading.mp4 with original sound; fall back to muted + pulsing button if blocked
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoFailed) return;

    let cancelled = false;
    video.loop = true;
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;

    const startPlayback = async () => {
      try {
        await video.play();
        if (!cancelled) {
          setSoundBlocked(false);
        }
      } catch {
        // Browser blocked unmuted autoplay before first user gesture
        if (cancelled) return;
        video.muted = true;
        setSoundBlocked(true);
        try {
          await video.play();
        } catch {
          // Video playback blocked entirely; splash visuals & progress still proceed cleanly
        }
      }
    };

    void startPlayback();

    return () => {
      cancelled = true;
    };
  }, [videoFailed]);

  const handleTapForSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    setSoundBlocked(false);
    if (video.paused) {
      video.play().catch(() => {});
    }
  };

  // Smooth ~5s progress loop + 0.5s audio & visual fade-out handover
  useEffect(() => {
    let rafId = 0;
    let audioFadeRafId = 0;
    let fadeTimer = 0;
    let holdTimer = 0;

    const fadeOutAndComplete = () => {
      setFadingOut(true);

      const video = videoRef.current;
      if (video && !video.muted && !video.paused && video.volume > 0) {
        const startVol = Math.min(1, Math.max(0, video.volume));
        const fadeStart = performance.now();
        const stepAudioFade = (now: number) => {
          const t = Math.min(1, Math.max(0, (now - fadeStart) / FADE_OUT_MS));
          video.volume = Math.min(1, Math.max(0, startVol * (1 - t)));
          if (t < 1) {
            audioFadeRafId = requestAnimationFrame(stepAudioFade);
          } else {
            video.volume = 0;
            video.pause();
          }
        };
        audioFadeRafId = requestAnimationFrame(stepAudioFade);
      }

      fadeTimer = window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.pause();
        }
        onCompleteRef.current();
      }, FADE_OUT_MS);
    };

    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startRef.current);
      const timeFraction = Math.min(1, elapsed / minDurationMs);
      const easedTime = 1 - Math.pow(1 - timeFraction, 2.1);

      if (elapsed < minDurationMs) {
        const target = readyRef.current
          ? Math.min(98, Math.round(easedTime * 98))
          : Math.min(92, Math.round(easedTime * 92));
        setProgress((prev) => (target > prev ? target : prev));
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (!readyRef.current) {
        setProgress((prev) => Math.max(prev, 96));
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (!completedRef.current) {
        completedRef.current = true;
        setProgress(100);
        holdTimer = window.setTimeout(fadeOutAndComplete, 160);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(audioFadeRafId);
      window.clearTimeout(holdTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [minDurationMs]);

  const title = variant === 'admin' ? 'NEXUS FF ADMIN' : 'NEXUS FF ARENA';
  const defaultStatus =
    progress >= 100
      ? 'Ready'
      : isReady
        ? 'Preparing arena interface...'
        : statusText || 'Loading account, data & audio...';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${title}`}
      className={`fixed inset-0 z-[100] bg-[#050608] flex flex-col items-center justify-center px-6 select-none transition-opacity duration-500 ease-out overflow-hidden ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Full-bleed background loading video with original sound */}
      {!videoFailed && (
        <video
          ref={videoRef}
          src="/video/loading.mp4"
          loop
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Dark gradient overlay for logo, tagline, and progress bar readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,6,8,0.78) 0%, rgba(5,6,8,0.52) 45%, rgba(5,6,8,0.88) 100%)',
        }}
      />

      {/* Subtle atmospheric red & gold halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(255, 30, 56, 0.16) 0%, rgba(212, 175, 55, 0.10) 28%, rgba(5, 6, 8, 0) 64%)',
        }}
      />

      {/* Pulsing Tap for sound button if browser blocked unmuted autoplay */}
      {soundBlocked && !videoFailed && !fadingOut && (
        <button
          type="button"
          onClick={handleTapForSound}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 rounded-full border border-[#F5C451]/60 bg-black/80 backdrop-blur-md px-4 py-2 text-xs font-semibold text-[#F5C451] shadow-[0_0_24px_rgba(245,196,81,0.4)] animate-pulse cursor-pointer hover:bg-black/95"
        >
          <Volume2 className="w-4 h-4 text-[#FF1E38]" />
          <span>Tap for sound</span>
        </button>
      )}

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center space-y-7">
        {/* Glowing Logo */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute w-32 h-32 rounded-full blur-2xl opacity-75 animate-pulse motion-reduce:animate-none"
            style={{
              background:
                variant === 'admin'
                  ? 'radial-gradient(circle, rgba(245,196,81,0.55) 0%, rgba(255,30,56,0.28) 60%, transparent 100%)'
                  : 'radial-gradient(circle, rgba(255,30,56,0.55) 0%, rgba(212,175,55,0.3) 60%, transparent 100%)',
            }}
          />
          <div
            className="relative p-2.5 rounded-2xl border border-[#D4AF37]/40 bg-[#0B0D13]/85 backdrop-blur-sm"
            style={{
              boxShadow:
                variant === 'admin'
                  ? '0 0 40px -8px rgba(245, 196, 81, 0.55), 0 0 18px -4px rgba(255, 30, 56, 0.35)'
                  : '0 0 42px -8px rgba(255, 30, 56, 0.6), 0 0 20px -4px rgba(212, 175, 55, 0.35)',
            }}
          >
            <NexusLogo size={88} variant={variant} />
          </div>
        </div>

        {/* Brand & Tagline */}
        <div className="space-y-2">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-[0.06em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
            {title}
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-[0.28em] text-[#F5C451] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            PLAY • COMPETE • CONQUER
          </p>
        </div>

        {/* Neon Red & Gold Progress Bar + Percentage */}
        <div className="w-full space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-200 truncate pr-3 drop-shadow">{defaultStatus}</span>
            <span className="font-mono tabular-nums font-bold text-[#F5C451] shrink-0">
              {progress}%
            </span>
          </div>

          <div className="h-2.5 w-full rounded-full bg-white/15 border border-white/15 overflow-hidden p-[1px] backdrop-blur-sm">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out relative"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #FF1E38 0%, #FF4D4D 52%, #F5C451 100%)',
                boxShadow: '0 0 16px rgba(255, 30, 56, 0.75), 0 0 12px rgba(245, 196, 81, 0.5)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
