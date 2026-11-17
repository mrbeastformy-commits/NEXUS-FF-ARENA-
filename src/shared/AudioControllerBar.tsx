import { Volume2, VolumeX, Play, Pause, Music } from 'lucide-react';
import { useMusicPlayer } from './MusicPlayerContext';

export function AudioControllerBar({ compact = false }: { compact?: boolean }) {
  const {
    trackTitle,
    isPlaying,
    isMuted,
    volume,
    autoplayBlocked,
    callPaused,
    togglePlay,
    enableMusic,
    toggleMute,
    setVolume,
  } = useMusicPlayer();

  if (autoplayBlocked && !isPlaying) {
    return (
      <button
        type="button"
        onClick={enableMusic}
        className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-semibold text-[#F5C451] hover:bg-[#D4AF37]/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        aria-label="Enable background music"
      >
        <Music className="w-3.5 h-3.5" />
        <span>Enable Music</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0D1017] px-2.5 py-1.5">
      <button
        type="button"
        onClick={togglePlay}
        disabled={callPaused}
        className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors shrink-0 cursor-pointer disabled:opacity-40"
        aria-label={isPlaying ? 'Pause music' : 'Play music'}
        title={trackTitle}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#FF1E38]" /> : <Play className="w-3.5 h-3.5 text-[#F5C451]" />}
      </button>

      {!compact && (
        <span className="hidden xl:block max-w-[140px] truncate text-[11px] font-medium text-slate-300">
          {callPaused ? 'Paused (Call)' : trackTitle}
        </span>
      )}

      <button
        type="button"
        onClick={toggleMute}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
        aria-label={isMuted ? 'Unmute music' : 'Mute music'}
      >
        {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-slate-400" /> : <Volume2 className="w-3.5 h-3.5 text-[#F5C451]" />}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={isMuted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-14 sm:w-16 accent-[#FF1E38] cursor-pointer h-1.5"
        aria-label="Music volume"
      />
    </div>
  );
}
