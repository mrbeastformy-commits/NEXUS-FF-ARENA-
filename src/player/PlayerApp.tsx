import { useCallback, useState } from 'react';
import { Home, Swords, Users, Coins, User, ShieldAlert, MailWarning, RefreshCw } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { AuthProvider, useAuth } from '../shared/AuthContext';
import { MusicPlayerProvider, useMusicPlayer } from '../shared/MusicPlayerContext';
import { WebRtcCallProvider } from '../shared/WebRtcCallContext';
import { AudioControllerBar } from '../shared/AudioControllerBar';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { NexusLogo } from '../shared/NexusLogo';
import { NexusSplashScreen } from '../shared/NexusSplashScreen';
import { OfflineIndicator, OfflineScreen, useOnlineStatus } from '../shared/OfflineBanner';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import { AuthScreen } from './pages/AuthScreen';
import { HomePage, type PlayerTab } from './pages/HomePage';
import { TournamentsPage } from './pages/TournamentsPage';
import { SocialPage } from './pages/SocialPage';
import { WalletPage } from './pages/WalletPage';
import { ProfilePage } from './pages/ProfilePage';
import { VideoCallOverlay } from './components/VideoCallOverlay';

function ArenaShell() {
  const { firebaseUser, profile, authReady, roleVerified, emailVerified, refreshSession, logout } = useAuth();
  const { musicReady, startAfterLoading } = useMusicPlayer();
  const isOnline = useOnlineStatus();
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<PlayerTab>('home');
  const [subContext, setSubContext] = useState<string | undefined>(undefined);
  const [verifSent, setVerifSent] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    startAfterLoading();
  }, [startAfterLoading]);

  const navigate = (tab: PlayerTab, sub?: string) => {
    setActiveTab(tab);
    setSubContext(sub);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const appReady = authReady && roleVerified && musicReady;
  const splashStatusText =
    !authReady || !roleVerified
      ? 'Loading account & arena profile...'
      : !musicReady
        ? 'Loading arena soundtrack...'
        : 'Entering NEXUS FF ARENA...';

  // Full Ban / Active Temporary Suspension Screen
  const isSuspended =
    profile?.banStatus === 'banned' ||
    (profile?.banStatus === 'suspended' &&
      (!profile.banExpiresAt || new Date(profile.banExpiresAt).getTime() > Date.now()));

  const renderAppContent = () => {
    if (!authReady || !roleVerified) {
      return <div className="min-h-screen bg-[#050608]" />;
    }

    if (!firebaseUser) {
      if (!isOnline) {
        return <OfflineScreen variant="arena" />;
      }
      return <AuthScreen />;
    }

    if (isSuspended) {
      return (
        <div className="min-h-screen bg-[#06070A] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#FF1E38]/50">
            <div className="flex items-center gap-3 text-[#FF1E38]">
              <ShieldAlert className="w-7 h-7 shrink-0" />
              <h1 className="font-display text-3xl font-bold uppercase">
                {profile?.banStatus === 'banned' ? 'Account Permanently Banned' : 'Account Suspended'}
              </h1>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Reason: {profile?.banReason || 'Violation of NEXUS FF ARENA competitive rules.'}
            </p>
            {profile?.banExpiresAt && profile.banStatus === 'suspended' && (
              <p className="text-xs font-mono text-[#F5C451]">
                Suspension ends: {new Date(profile.banExpiresAt).toLocaleString()}
              </p>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen nexus-grid-bg bg-[#06070A] text-slate-100 flex flex-col pb-20 lg:pb-8">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-14 border-b border-white/10 bg-[#06070A]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <NexusLogo size={30} variant="arena" />
            <span className="font-display text-xl sm:text-2xl font-bold tracking-wide text-white">
              NEXUS FF ARENA
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
            {(
              [
                { id: 'home', label: 'Home' },
                { id: 'tournaments', label: 'Arena' },
                { id: 'social', label: 'Squad & Chat' },
                { id: 'wallet', label: 'Wallet' },
                { id: 'profile', label: 'Profile' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'border-[#FF1E38] text-white font-semibold'
                    : 'border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <PWAInstallButton compact />
            <AudioControllerBar compact />
            <button
              type="button"
              onClick={() => navigate('wallet')}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 px-3 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-xs font-mono font-bold text-[#F5C451] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Coins className="w-3.5 h-3.5" />
              <span className="tabular-nums">{profile?.balance ?? 0}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Email Verification Notice */}
      {!emailVerified && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <span className="inline-flex items-center gap-2">
              <MailWarning className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Verify your email address to unlock tournament registration, deposits, and squad chat.</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await sendEmailVerification(firebaseUser);
                  setVerifSent(true);
                }}
                className="underline font-semibold cursor-pointer"
              >
                {verifSent ? 'Verification Sent' : 'Resend Link'}
              </button>
              <button
                type="button"
                onClick={refreshSession}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-400 text-black font-bold cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'home' && <HomePage onNavigate={navigate} />}
        {activeTab === 'tournaments' && <TournamentsPage initialSubTab={subContext} />}
        {activeTab === 'social' && <SocialPage />}
        {activeTab === 'wallet' && <WalletPage />}
        {activeTab === 'profile' && <ProfilePage initialSection={subContext} />}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-[#06070A]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-5 items-center">
        {(
          [
            { id: 'home', label: 'Home', icon: Home },
            { id: 'tournaments', label: 'Arena', icon: Swords },
            { id: 'social', label: 'Social', icon: Users },
            { id: 'wallet', label: 'Wallet', icon: Coins },
            { id: 'profile', label: 'Profile', icon: User },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 cursor-pointer ${
                active ? 'text-[#FF1E38]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <VideoCallOverlay />
      <OfflineIndicator />
      </div>
    );
  };

  return (
    <>
      {showSplash && (
        <NexusSplashScreen
          variant="arena"
          isReady={appReady}
          statusText={splashStatusText}
          onComplete={handleSplashComplete}
        />
      )}
      {renderAppContent()}
    </>
  );
}

export default function PlayerApp() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MusicPlayerProvider>
          <WebRtcCallProvider>
            <ArenaShell />
          </WebRtcCallProvider>
        </MusicPlayerProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
