import { useEffect, useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Capture beforeinstallprompt at module load so events fired during the 5s splash screen are never missed
let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let cachedAppInstalled = false;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb());
  });
  window.addEventListener('appinstalled', () => {
    cachedAppInstalled = true;
    cachedDeferredPrompt = null;
    promptListeners.forEach((cb) => cb());
  });
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isAppleTouch =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('macintosh') && 'ontouchend' in document);
  return isAppleTouch;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedDeferredPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(
    () => cachedAppInstalled || checkIsStandalone(),
  );
  const [isIOS, setIsIOS] = useState<boolean>(() => checkIsIOS());

  useEffect(() => {
    setIsInstalled(cachedAppInstalled || checkIsStandalone());
    setIsIOS(checkIsIOS());
    setDeferredPrompt(cachedDeferredPrompt);

    const sync = () => {
      setDeferredPrompt(cachedDeferredPrompt);
      if (cachedAppInstalled || checkIsStandalone()) {
        setIsInstalled(true);
      }
    };
    promptListeners.add(sync);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) setIsInstalled(true);
    };
    mediaQuery.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      promptListeners.delete(sync);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = async () => {
    const promptEvent = deferredPrompt || cachedDeferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      cachedAppInstalled = true;
      cachedDeferredPrompt = null;
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

interface PWAInstallButtonProps {
  compact?: boolean;
  showSettingsCard?: boolean;
  fullWidth?: boolean;
  appName?: string;
  variant?: 'arena' | 'admin';
}

export function PWAInstallButton({
  compact = false,
  showSettingsCard = false,
  fullWidth = false,
  appName = 'NEXUS FF ARENA',
  variant = 'arena',
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Hide completely once installed as a standalone app
  if (isInstalled) {
    return null;
  }

  const handleClick = () => {
    if (isInstallable) {
      void install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const canTriggerAction = isInstallable || isIOS;
  const accentBtn =
    variant === 'admin'
      ? 'bg-[#D4AF37] hover:bg-[#F5C451] text-black'
      : 'bg-[#FF1E38] hover:bg-[#E11D48] text-white';

  const iosModal = showIOSGuide && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${appName} on iPhone or iPad`}
    >
      <div className="w-full max-w-sm nexus-card rounded-2xl p-6 space-y-4 border border-[#D4AF37]/40 bg-[#0D1017]">
        <div className="flex items-center gap-2.5">
          <Share className="w-5 h-5 text-[#F5C451] shrink-0" />
          <h3 className="font-display text-2xl font-bold text-white">Install {appName}</h3>
        </div>
        <ol className="text-xs text-slate-300 leading-relaxed space-y-2 list-decimal list-inside">
          <li>
            Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
          </li>
          <li>
            Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
          </li>
        </ol>
        <button
          type="button"
          onClick={() => setShowIOSGuide(false)}
          className="w-full min-h-[42px] rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );

  if (showSettingsCard) {
    return (
      <>
        <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Smartphone className="w-4 h-4 text-[#F5C451] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-white">Install {appName}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isInstallable
                  ? 'Add to your home screen for full-screen launch and offline support.'
                  : isIOS
                    ? 'On iPhone/Safari: tap Share → Add to Home Screen.'
                    : 'Use your browser menu (⋮ → Install app / Add to Home screen) to install.'}
              </p>
            </div>
          </div>
          {canTriggerAction && (
            <button
              type="button"
              onClick={handleClick}
              className={`min-h-[38px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors ${accentBtn}`}
            >
              {isIOS && !isInstallable ? (
                <Share className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Install App</span>
            </button>
          )}
        </div>
        {iosModal}
      </>
    );
  }

  if (!canTriggerAction) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? variant === 'admin'
              ? 'min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/50 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 px-2.5 py-1 text-xs font-semibold text-[#F5C451] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
              : 'min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[#FF1E38]/40 bg-[#FF1E38]/15 hover:bg-[#FF1E38]/25 px-2.5 py-1 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : `${fullWidth ? 'w-full justify-center ' : ''}min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${accentBtn}`
        }
        aria-label={`Install ${appName} app`}
      >
        {isIOS && !isInstallable ? (
          <Share className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{compact ? 'Install App' : `Install ${variant === 'admin' ? appName : 'App'}`}</span>
      </button>
      {iosModal}
    </>
  );
}
