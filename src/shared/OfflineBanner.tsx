import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { NexusLogo } from './NexusLogo';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-40 rounded-xl border border-amber-500/40 bg-[#0D1017]/95 backdrop-blur-md px-3.5 py-2.5 text-xs text-amber-200 shadow-xl flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="truncate">Offline — Reconnect for live matches, wallet &amp; chat.</span>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold cursor-pointer"
      >
        Retry
      </button>
    </div>
  );
}

export function OfflineScreen({ variant = 'arena' }: { variant?: 'arena' | 'admin' }) {
  const title = variant === 'admin' ? 'NEXUS FF ADMIN' : 'NEXUS FF ARENA';
  return (
    <div className="min-h-screen nexus-grid-bg bg-[#06070A] flex items-center justify-center p-6">
      <div className="w-full max-w-sm nexus-card rounded-2xl p-6 sm:p-7 text-center space-y-5 border border-white/10">
        <div className="flex justify-center">
          <NexusLogo size={72} variant={variant} />
        </div>
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <WifiOff className="w-4 h-4" />
            <span>No Internet Connection</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            You are currently offline. Reconnect to sign in and load live tournaments, wallet transactions, room credentials, and chat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full min-h-[44px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
