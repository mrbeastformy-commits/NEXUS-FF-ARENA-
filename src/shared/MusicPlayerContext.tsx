import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { loadSongObjectUrl } from './songStorage';
import type { MusicSettings } from './types';

// Bundled local fallback background music asset served directly from public/audio/
export const DEFAULT_ARENA_AUDIO_PATH = '/audio/arena-theme.m4a';
export const DEFAULT_TRACK_TITLE = 'Riogeovn - AINSI BAS LA VIDA (Super Slowed) HARDTEKK PHONK MUSIC';

interface MusicContextValue {
  trackTitle: string;
  audioUrl: string;
  activeSongId: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  autoplayBlocked: boolean;
  callPaused: boolean;
  musicReady: boolean;
  startAfterLoading: () => void;
  togglePlay: () => void;
  enableMusic: () => void;
  toggleMute: () => void;
  setVolume: (vol: number) => void;
  pauseForCall: () => void;
  resumeAfterCall: () => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

const VOLUME_STORAGE_KEY = 'nexus_arena_music_volume';
const MUTED_STORAGE_KEY = 'nexus_arena_music_muted';
const FADE_IN_MS = 850;

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const fadeRafRef = useRef<number>(0);
  const wasPlayingBeforeCallRef = useRef<boolean>(false);
  const playbackAllowedRef = useRef<boolean>(false);
  const callPausedRef = useRef<boolean>(false);

  const [audioUrl, setAudioUrl] = useState<string>(DEFAULT_ARENA_AUDIO_PATH);
  const [activeSongId, setActiveSongId] = useState<string>('');
  const [activeRevision, setActiveRevision] = useState<number>(0);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TRACK_TITLE);
  const [playbackAllowed, setPlaybackAllowed] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [callPaused, setCallPaused] = useState(false);
  const [musicSettingsLoaded, setMusicSettingsLoaded] = useState(false);
  const [audioBufferReady, setAudioBufferReady] = useState(false);

  const [volume, setVolumeState] = useState<number>(() => {
    const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsed = saved ? Number(saved) : 0.45;
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.45;
  });
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  });
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;

  const cancelFadeIn = useCallback(() => {
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = 0;
    }
  }, []);

  const fadeInAudio = useCallback(
    (audio: HTMLAudioElement, targetVol: number) => {
      cancelFadeIn();
      const safeTarget = Number.isFinite(targetVol) ? Math.min(1, Math.max(0, targetVol)) : 0;
      if (isMutedRef.current || safeTarget <= 0) {
        audio.volume = safeTarget;
        return;
      }
      audio.volume = 0;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / FADE_IN_MS));
        audio.volume = Math.min(1, Math.max(0, safeTarget * t));
        if (t < 1 && !audio.paused) {
          fadeRafRef.current = requestAnimationFrame(step);
        } else {
          fadeRafRef.current = 0;
          audio.volume = Math.min(1, Math.max(0, volumeRef.current));
        }
      };
      fadeRafRef.current = requestAnimationFrame(step);
    },
    [cancelFadeIn],
  );

  // Listen to owner-controlled active song in appSettings/music
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'appSettings', 'music'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<MusicSettings>;
          const nextSongId = typeof data.activeSongId === 'string' ? data.activeSongId.trim() : '';
          const nextRevision = typeof data.revision === 'number' ? data.revision : 0;
          setActiveSongId(nextSongId);
          setActiveRevision(nextRevision);

          if (!nextSongId) {
            const rawUrl = typeof data.audioUrl === 'string' ? data.audioUrl.trim() : '';
            setAudioUrl(rawUrl.startsWith('/audio/') ? rawUrl : DEFAULT_ARENA_AUDIO_PATH);
          }

          if (data.trackTitle && data.trackTitle.trim().length > 0) {
            setTrackTitle(data.trackTitle);
          }
        } else {
          setActiveSongId('');
          setActiveRevision(0);
          setAudioUrl(DEFAULT_ARENA_AUDIO_PATH);
          setTrackTitle(DEFAULT_TRACK_TITLE);
        }
        setMusicSettingsLoaded(true);
      },
      () => {
        setActiveSongId('');
        setAudioUrl(DEFAULT_ARENA_AUDIO_PATH);
        setMusicSettingsLoaded(true);
      },
    );
    return () => unsub();
  }, []);

  // Load active song from IndexedDB cache or Firestore chunks without re-encoding
  useEffect(() => {
    if (!musicSettingsLoaded) return;
    if (!activeSongId) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setAudioBufferReady(false);

    void loadSongObjectUrl(activeSongId, activeRevision || undefined)
      .then((loaded) => {
        if (cancelled) {
          URL.revokeObjectURL(loaded.objectUrl);
          return;
        }
        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        }
        activeObjectUrlRef.current = loaded.objectUrl;
        setAudioUrl(loaded.objectUrl);
        if (loaded.title) {
          setTrackTitle(loaded.title);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback cleanly to bundled audio if active custom song chunks are unavailable
        setAudioUrl(DEFAULT_ARENA_AUDIO_PATH);
        setAudioBufferReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [musicSettingsLoaded, activeSongId, activeRevision]);

  // Cleanup any Blob URL on full unmount
  useEffect(() => {
    return () => {
      cancelFadeIn();
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, [cancelFadeIn]);

  // Configure persistent HTML5 Audio element directly (preserves bit-for-bit original song)
  useEffect(() => {
    const audio = audioRef.current || new Audio();
    audio.preload = 'auto';
    audio.loop = true;
    audio.muted = isMutedRef.current;

    const targetHref = audioUrl.startsWith('blob:') ? audioUrl : new URL(audioUrl, window.location.origin).href;
    if (audio.src !== targetHref) {
      audio.src = audioUrl;
      audio.load();
    }
    audioRef.current = audio;

    const handlePlay = () => {
      setIsPlaying(true);
      setAutoplayBlocked(false);
    };
    const handlePause = () => setIsPlaying(false);
    const markAudioReady = () => setAudioBufferReady(true);

    if (audio.readyState >= 1) {
      setAudioBufferReady(true);
    }

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', markAudioReady);
    audio.addEventListener('loadeddata', markAudioReady);
    audio.addEventListener('canplay', markAudioReady);
    audio.addEventListener('error', markAudioReady);

    const fallbackTimer = window.setTimeout(() => setAudioBufferReady(true), 3500);

    // Play ONLY after the loading screen has finished and handed over audio focus
    if (playbackAllowedRef.current && !callPausedRef.current) {
      audio.volume = 0;
      audio
        .play()
        .then(() => {
          fadeInAudio(audio, volumeRef.current);
        })
        .catch(() => {
          setAutoplayBlocked(true);
          setIsPlaying(false);
        });
    } else {
      audio.volume = volumeRef.current;
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', markAudioReady);
      audio.removeEventListener('loadeddata', markAudioReady);
      audio.removeEventListener('canplay', markAudioReady);
      audio.removeEventListener('error', markAudioReady);
    };
  }, [audioUrl, fadeInAudio]);

  // Keep live volume/mute synced without interrupting active fade unless user changes them
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
  }, [isMuted]);

  const startAfterLoading = useCallback(() => {
    if (playbackAllowedRef.current) return;
    playbackAllowedRef.current = true;
    setPlaybackAllowed(true);

    const audio = audioRef.current;
    if (!audio || callPausedRef.current) return;

    audio.muted = isMutedRef.current;
    audio.volume = 0;
    audio
      .play()
      .then(() => {
        setAutoplayBlocked(false);
        setIsPlaying(true);
        fadeInAudio(audio, volumeRef.current);
      })
      .catch(() => {
        audio.volume = volumeRef.current;
        setAutoplayBlocked(true);
        setIsPlaying(false);
      });
  }, [fadeInAudio]);

  const setVolume = useCallback(
    (vol: number) => {
      cancelFadeIn();
      const clamped = Math.min(1, Math.max(0, vol));
      setVolumeState(clamped);
      volumeRef.current = clamped;
      localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
      if (audioRef.current) {
        audioRef.current.volume = clamped;
      }
      if (clamped > 0 && isMutedRef.current) {
        setIsMuted(false);
        isMutedRef.current = false;
        localStorage.setItem(MUTED_STORAGE_KEY, 'false');
      }
    },
    [cancelFadeIn],
  );

  const toggleMute = useCallback(() => {
    cancelFadeIn();
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      localStorage.setItem(MUTED_STORAGE_KEY, String(next));
      if (audioRef.current) {
        audioRef.current.muted = next;
        if (!next) {
          audioRef.current.volume = volumeRef.current;
        }
      }
      return next;
    });
  }, [cancelFadeIn]);

  const enableMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    playbackAllowedRef.current = true;
    setPlaybackAllowed(true);
    audio.muted = isMutedRef.current;
    audio.volume = 0;
    audio
      .play()
      .then(() => {
        setAutoplayBlocked(false);
        setIsPlaying(true);
        fadeInAudio(audio, volumeRef.current);
      })
      .catch(() => {
        audio.volume = volumeRef.current;
        setAutoplayBlocked(true);
      });
  }, [fadeInAudio]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      playbackAllowedRef.current = true;
      setPlaybackAllowed(true);
      audio.muted = isMutedRef.current;
      audio.volume = volumeRef.current;
      audio
        .play()
        .then(() => {
          setAutoplayBlocked(false);
          setIsPlaying(true);
        })
        .catch(() => setAutoplayBlocked(true));
    } else {
      cancelFadeIn();
      audio.pause();
    }
  }, [cancelFadeIn]);

  const pauseForCall = useCallback(() => {
    cancelFadeIn();
    const audio = audioRef.current;
    callPausedRef.current = true;
    setCallPaused(true);
    if (audio && !audio.paused) {
      wasPlayingBeforeCallRef.current = true;
      audio.pause();
    } else {
      wasPlayingBeforeCallRef.current = false;
    }
  }, [cancelFadeIn]);

  const resumeAfterCall = useCallback(() => {
    const audio = audioRef.current;
    callPausedRef.current = false;
    setCallPaused(false);
    if (audio && playbackAllowedRef.current && wasPlayingBeforeCallRef.current) {
      audio.volume = volumeRef.current;
      audio.play().catch(() => setAutoplayBlocked(true));
    }
    wasPlayingBeforeCallRef.current = false;
  }, []);

  const musicReady = musicSettingsLoaded && audioBufferReady;

  return (
    <MusicContext.Provider
      value={{
        trackTitle,
        audioUrl,
        activeSongId,
        isPlaying: playbackAllowed && isPlaying,
        isMuted,
        volume,
        autoplayBlocked,
        callPaused,
        musicReady,
        startAfterLoading,
        togglePlay,
        enableMusic,
        toggleMute,
        setVolume,
        pauseForCall,
        resumeAfterCall,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusicPlayer(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    throw new Error('useMusicPlayer must be used inside MusicPlayerProvider');
  }
  return ctx;
}
