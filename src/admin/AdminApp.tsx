import React, { useCallback, useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  LayoutDashboard,
  Swords,
  Image as ImageIcon,
  Users,
  CheckSquare,
  ArrowUpFromLine,
  Coins,
  Trophy,
  Flag,
  UserCheck,
  MessageSquare,
  Bell,
  History,
  FileText,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Lock,
} from 'lucide-react';
import { auth, db } from '../shared/firebase';
import { AuthProvider, useAuth } from '../shared/AuthContext';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { NexusLogo } from '../shared/NexusLogo';
import { NexusSplashScreen } from '../shared/NexusSplashScreen';
import { OfflineIndicator, OfflineScreen, useOnlineStatus } from '../shared/OfflineBanner';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import {
  AdminBannersView,
  AdminResultsView,
  AdminTournamentsView,
} from './components/AdminTournamentsSection';
import {
  AdminAllTransactionsView,
  AdminDepositsView,
  AdminManualCoinsView,
  AdminWithdrawalsView,
} from './components/AdminFinanceSection';
import {
  AdminModeratorsView,
  AdminPlayersAndBansView,
  AdminReportsView,
  AdminSupportAndNotifsView,
} from './components/AdminModerationSection';
import { AdminSecuritySettingsView } from './components/AdminSecuritySection';

type AdminNavId =
  | 'overview'
  | 'tournaments'
  | 'banners'
  | 'players'
  | 'deposits'
  | 'withdrawals'
  | 'coins'
  | 'results'
  | 'reports'
  | 'moderators'
  | 'support'
  | 'notifications'
  | 'transactions'
  | 'logs'
  | 'security';

function AdminOverview({ onSelect }: { onSelect: (id: AdminNavId) => void }) {
  const { role } = useAuth();
  const [counts, setCounts] = useState({
    players: 0,
    tournaments: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    openReports: 0,
    openTickets: 0,
  });

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'users'), (s) => setCounts((c) => ({ ...c, players: s.size })), () => {}),
      onSnapshot(collection(db, 'tournaments'), (s) => setCounts((c) => ({ ...c, tournaments: s.size })), () => {}),
      onSnapshot(query(collection(db, 'reports'), where('status', '==', 'open')), (s) => setCounts((c) => ({ ...c, openReports: s.size })), () => {}),
      onSnapshot(query(collection(db, 'supportTickets'), where('status', '==', 'open')), (s) => setCounts((c) => ({ ...c, openTickets: s.size })), () => {}),
    ];
    if (role === 'owner') {
      unsubs.push(
        onSnapshot(query(collection(db, 'depositRequests'), where('status', '==', 'pending')), (s) => setCounts((c) => ({ ...c, pendingDeposits: s.size })), () => {}),
        onSnapshot(query(collection(db, 'withdrawalRequests'), where('status', '==', 'pending')), (s) => setCounts((c) => ({ ...c, pendingWithdrawals: s.size })), () => {}),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [role]);

  const cards = [
    { label: 'Registered Players', val: counts.players, target: 'players' as AdminNavId },
    { label: 'Total Tournaments', val: counts.tournaments, target: 'tournaments' as AdminNavId },
    ...(role === 'owner'
      ? [
          { label: 'Pending Deposits', val: counts.pendingDeposits, target: 'deposits' as AdminNavId },
          { label: 'Pending Withdrawals', val: counts.pendingWithdrawals, target: 'withdrawals' as AdminNavId },
        ]
      : []),
    { label: 'Open Reports', val: counts.openReports, target: 'reports' as AdminNavId },
    { label: 'Open Support Tickets', val: counts.openTickets, target: 'support' as AdminNavId },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-white">Operations Overview</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Live Firestore metrics · Role: <span className="uppercase font-semibold text-[#F5C451]">{role}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onSelect(c.target)}
            className="text-left nexus-card nexus-card-hover rounded-2xl p-5 cursor-pointer"
          >
            <p className="text-xs text-slate-400">{c.label}</p>
            <p className="font-display text-4xl font-bold font-mono tabular-nums text-white mt-2">{c.val}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminLoginGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen nexus-grid-bg bg-[#06070A] flex items-center justify-center p-6">
      <div className="max-w-md w-full nexus-card rounded-2xl p-6 sm:p-8 space-y-6 border border-[#D4AF37]/40">
        <div className="flex items-center gap-3">
          <NexusLogo size={40} variant="admin" />
          <div>
            <h1 className="font-display text-3xl font-bold text-white">NEXUS FF ADMIN</h1>
            <p className="text-xs text-[#F5C451]">Authorized Staff Console</p>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          No public admin registration. Sign in with an authorized Owner or approved Moderator account.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full min-h-[46px] rounded-xl bg-white hover:bg-slate-200 text-black font-semibold text-xs cursor-pointer"
        >
          Sign In with Google
        </button>

        <form onSubmit={handleEmail} className="space-y-3 pt-3 border-t border-white/10">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Staff email"
            className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
          />
          {error && <p className="text-xs text-[#FF1E38]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] rounded-xl bg-[#D4AF37] text-black font-bold text-xs cursor-pointer"
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminShell() {
  const { firebaseUser, role, permissions, authReady, roleVerified, logout } = useAuth();
  const isOnline = useOnlineStatus();
  const [showSplash, setShowSplash] = useState(true);
  const [activeNav, setActiveNav] = useState<AdminNavId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSplashComplete = useCallback(() => setShowSplash(false), []);
  const appReady = authReady && roleVerified;

  const isOwner = role === 'owner';

  const navItems: Array<{ id: AdminNavId; label: string; icon: React.ComponentType<{ className?: string }>; visible: boolean }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'tournaments', label: 'Tournaments & Rooms', icon: Swords, visible: isOwner || Boolean(permissions.manageTournaments) },
    { id: 'banners', label: 'Banners', icon: ImageIcon, visible: isOwner || Boolean(permissions.manageTournaments) },
    { id: 'players', label: 'Players & Bans', icon: Users, visible: true },
    { id: 'deposits', label: 'Deposits & Proofs', icon: CheckSquare, visible: isOwner },
    { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, visible: isOwner },
    { id: 'coins', label: 'Manual Coins & Rewards', icon: Coins, visible: isOwner },
    { id: 'results', label: 'Results & Leaderboard', icon: Trophy, visible: isOwner || Boolean(permissions.verifyResults) },
    { id: 'reports', label: 'Reports & Chat', icon: Flag, visible: isOwner || Boolean(permissions.reviewReports) },
    { id: 'moderators', label: 'Moderators', icon: UserCheck, visible: isOwner },
    { id: 'support', label: 'Support Tickets', icon: MessageSquare, visible: isOwner || Boolean(permissions.assistSupport) },
    { id: 'notifications', label: 'Notifications', icon: Bell, visible: true },
    { id: 'transactions', label: 'Transaction Ledger', icon: History, visible: isOwner },
    { id: 'logs', label: 'Admin Audit Logs', icon: FileText, visible: isOwner },
    { id: 'security', label: 'Security & Music', icon: ShieldCheck, visible: isOwner },
  ];

  const visibleNav = navItems.filter((n) => n.visible);

  const renderAdminContent = () => {
    if (!appReady) {
      return <div className="min-h-screen bg-[#050608]" />;
    }

    if (!firebaseUser) {
      if (!isOnline) {
        return <OfflineScreen variant="admin" />;
      }
      return <AdminLoginGate />;
    }

    if (role !== 'owner' && role !== 'moderator') {
      return (
        <div className="min-h-screen bg-[#06070A] flex items-center justify-center p-6">
          <div className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#FF1E38]/50 text-center">
            <Lock className="w-10 h-10 text-[#FF1E38] mx-auto" />
            <h1 className="font-display text-3xl font-bold text-white">Access Denied</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your verified account does not hold Owner or Moderator privileges on the server allowlist.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href="/"
                className="min-h-[42px] rounded-xl bg-white/10 text-xs font-semibold text-white flex items-center justify-center"
              >
                Return to Arena
              </a>
              <button
                type="button"
                onClick={logout}
                className="min-h-[42px] rounded-xl bg-[#FF1E38] text-xs font-semibold text-white cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#06070A] text-slate-100 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#090B10]">
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-white/10">
          <NexusLogo size={28} variant="admin" />
          <span className="font-display text-xl font-bold tracking-wide text-white">NEXUS FF ADMIN</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
                  active ? 'bg-[#D4AF37] text-black font-bold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          <a
            href="/"
            className="w-full min-h-[38px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 flex items-center justify-between"
          >
            <span>Open Player App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[38px] px-3 rounded-lg hover:bg-[#FF1E38]/15 text-xs text-slate-400 hover:text-[#FF1E38] flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 sm:px-6 border-b border-white/10 bg-[#090B10] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white cursor-pointer"
              aria-label="Open admin menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs font-medium text-slate-400">
              NEXUS FF ADMIN / <strong className="text-white capitalize">{activeNav}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isOwner && (
              <PWAInstallButton appName="NEXUS FF ADMIN" variant="admin" compact />
            )}
            <span className="text-xs font-mono font-bold text-[#F5C451] uppercase">{role}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          {activeNav === 'overview' && <AdminOverview onSelect={setActiveNav} />}
          {activeNav === 'tournaments' && <AdminTournamentsView />}
          {activeNav === 'banners' && <AdminBannersView />}
          {activeNav === 'players' && <AdminPlayersAndBansView />}
          {activeNav === 'deposits' && isOwner && <AdminDepositsView />}
          {activeNav === 'withdrawals' && isOwner && <AdminWithdrawalsView />}
          {activeNav === 'coins' && isOwner && <AdminManualCoinsView />}
          {activeNav === 'results' && <AdminResultsView />}
          {activeNav === 'reports' && <AdminReportsView />}
          {activeNav === 'moderators' && isOwner && <AdminModeratorsView />}
          {activeNav === 'support' && <AdminSupportAndNotifsView mode="support" />}
          {activeNav === 'notifications' && <AdminSupportAndNotifsView mode="notifications" />}
          {activeNav === 'transactions' && isOwner && <AdminAllTransactionsView />}
          {activeNav === 'logs' && isOwner && <AdminSupportAndNotifsView mode="logs" />}
          {activeNav === 'security' && isOwner && <AdminSecuritySettingsView />}
        </main>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-black/80 flex">
          <aside className="w-72 bg-[#090B10] h-full p-4 flex flex-col border-r border-white/10">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <span className="font-display text-xl font-bold text-white">NEXUS FF ADMIN</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full min-h-[42px] px-3 rounded-xl text-xs font-medium flex items-center gap-2.5 cursor-pointer ${
                      activeNav === item.id ? 'bg-[#D4AF37] text-black font-bold' : 'text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="space-y-2 pt-2 border-t border-white/10">
              {isOwner && (
                <PWAInstallButton appName="NEXUS FF ADMIN" variant="admin" fullWidth />
              )}
              <a href="/" className="min-h-[40px] px-3 rounded-lg bg-white/5 text-xs text-white flex items-center justify-center">
                Open Player App
              </a>
            </div>
          </aside>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
      <OfflineIndicator />
      </div>
    );
  };

  return (
    <>
      {showSplash && (
        <NexusSplashScreen
          variant="admin"
          isReady={appReady}
          statusText={!appReady ? 'Verifying staff credentials...' : 'Loading admin console...'}
          onComplete={handleSplashComplete}
        />
      )}
      {renderAdminContent()}
    </>
  );
}

export default function AdminApp() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AdminShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
