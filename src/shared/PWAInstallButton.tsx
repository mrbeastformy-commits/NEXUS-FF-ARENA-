import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[#FF1E38]/40 bg-[#FF1E38]/15 hover:bg-[#FF1E38]/25 px-2.5 py-1 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer'
        }
        aria-label="Install NEXUS FF ARENA app"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer'
              : 'min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer'
          }
        >
          <Share className="w-3.5 h-3.5 shrink-0" />
          <span>{compact ? 'Add App' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm nexus-card rounded-2xl p-6 space-y-4 border border-[#D4AF37]/40">
              <h3 className="font-display text-2xl font-bold text-white">Install on iPhone / iPad</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[42px] rounded-xl bg-[#D4AF37] text-black text-xs font-bold cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
