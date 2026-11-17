import { useEffect, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Trophy,
  Swords,
  Users,
  Bell,
  LifeBuoy,
  ArrowRight,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import { toMillis, type Banner, type Friendship, type LeaderboardEntry, type Tournament, type UserPublicProfile } from '../../shared/types';
import { TournamentDetailModal } from '../components/TournamentDetailModal';

export type PlayerTab = 'home' | 'tournaments' | 'social' | 'wallet' | 'profile';

export function HomePage({ onNavigate }: { onNavigate: (tab: PlayerTab, sub?: string) => void }) {
  const { firebaseUser, profile } = useAuth();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [friendsOnline, setFriendsOnline] = useState<UserPublicProfile[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsubBanners = onSnapshot(
      query(collection(db, 'banners'), where('active', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Banner)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setBanners(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners'),
    );

    const unsubTourneys = onSnapshot(
      query(collection(db, 'tournaments'), where('status', 'in', ['open', 'closed', 'live', 'completed', 'cancelled'])),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Tournament)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 12);
        setTournaments(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tournaments'),
    );

    const unsubLb = onSnapshot(
      query(collection(db, 'leaderboard'), where('arenaPoints', '>=', 0), orderBy('arenaPoints', 'desc'), limit(3)),
      (snap) => {
        setLeaderboard(snap.docs.map((d) => d.data() as LeaderboardEntry));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'leaderboard'),
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('targetUid', '==', firebaseUser.uid)),
      (snap) => {
        setUnreadNotifs(snap.docs.filter((d) => !d.data().read).length);
      },
      () => {},
    );

    let cancelled = false;
    const unsubFriends = onSnapshot(
      query(collection(db, 'friends'), where('users', 'array-contains', firebaseUser.uid)),
      (snap) => {
        const friendUids = snap.docs
          .map((d) => d.data() as Friendship)
          .filter((f) => f.status === 'accepted')
          .map((f) => f.users.find((u) => u !== firebaseUser.uid))
          .filter((u): u is string => Boolean(u));

        if (friendUids.length === 0) {
          setFriendsOnline([]);
          return;
        }
        void Promise.all(
          friendUids.slice(0, 10).map((uid) =>
            getDoc(doc(db, 'users', uid))
              .then((d) => (d.exists() ? (d.data() as UserPublicProfile) : null))
              .catch(() => null),
          ),
        ).then((profiles) => {
          if (!cancelled) {
            setFriendsOnline(profiles.filter((u): u is UserPublicProfile => Boolean(u && u.isOnline)));
          }
        });
      },
      () => {},
    );

    return () => {
      cancelled = true;
      unsubBanners();
      unsubTourneys();
      unsubLb();
      unsubNotifs();
      unsubFriends();
    };
  }, [firebaseUser]);

  // Auto-advance banner carousel
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const activeTournaments = tournaments.filter((t) => ['open', 'live'].includes(t.status));
  const recentWinners = tournaments.filter((t) => t.resultsAnnounced && t.winners && t.winners.length > 0).slice(0, 3);
  const currentBanner = banners[bannerIdx % Math.max(1, banners.length)];

  return (
    <div className="space-y-8">
      {/* Top Quick Bar: Wallet Summary + Notifications + Support */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Sliding Banner Carousel */}
        <section className="lg:col-span-8 nexus-card rounded-2xl overflow-hidden relative min-h-[210px] sm:min-h-[250px] flex flex-col justify-end">
          {banners.length > 0 && currentBanner ? (
            <>
              <SafeMediaImage
                imageId={currentBanner.imageId}
                src={currentBanner.imageUrl}
                alt={currentBanner.title}
                className="absolute inset-0 w-full h-full object-cover"
                fallbackTitle={currentBanner.title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#06070A] via-[#06070A]/60 to-transparent" />
              <div className="relative z-10 p-5 sm:p-7 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#F5C451]">Featured Arena Announcement</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1">
                    {currentBanner.title}
                  </h2>
                  {currentBanner.subtitle && (
                    <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">{currentBanner.subtitle}</p>
                  )}
                </div>
                {banners.length > 1 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBannerIdx((i) => (i - 1 + banners.length) % banners.length)}
                      className="w-9 h-9 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer"
                      aria-label="Previous banner"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerIdx((i) => (i + 1) % banners.length)}
                      className="w-9 h-9 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer"
                      aria-label="Next banner"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6 sm:p-8 flex flex-col justify-between h-full bg-gradient-to-br from-[#0D1017] to-[#140A0E]">
              <div>
                <p className="text-xs font-semibold text-[#F5C451] uppercase tracking-widest">NEXUS FF ARENA</p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1">
                  Welcome, {profile?.inGameName || 'Survivor'}
                </h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  No featured banners published yet. Browse live tournaments or check the leaderboard below.
                </p>
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => onNavigate('tournaments')}
                  className="min-h-[42px] px-4 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Browse Tournaments</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Wallet Summary & Quick Actions */}
        <aside className="lg:col-span-4 nexus-card rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Arena Coin Wallet</span>
              <span className="font-mono text-slate-300">{profile?.playerId || '—'}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <Coins className="w-5 h-5 text-[#F5C451] self-center" />
              <span className="font-display text-4xl font-bold font-mono tabular-nums text-white">
                {profile?.balance ?? 0}
              </span>
              <span className="text-xs text-[#F5C451] font-semibold">COINS</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Matches {profile?.matches ?? 0} · Wins {profile?.wins ?? 0} · Points {profile?.arenaPoints ?? 0}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => onNavigate('wallet')}
              className="min-h-[44px] rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/30 text-[#F5C451] text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer"
            >
              <Coins className="w-4 h-4" />
              <span>Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profile', 'notifications')}
              className="min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer relative"
            >
              <Bell className="w-4 h-4" />
              <span>Alerts{unreadNotifs > 0 ? ` (${unreadNotifs})` : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profile', 'support')}
              className="min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>Support</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Featured / Live / Upcoming Tournaments */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Swords className="w-5 h-5 text-[#FF1E38]" />
            <h3 className="font-display text-2xl font-bold text-white">Live &amp; Upcoming Tournaments</h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tournaments')}
            className="text-xs font-semibold text-[#F5C451] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            View All
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="nexus-card rounded-2xl h-56 animate-pulse bg-[#111520]" />
            ))}
          </div>
        ) : activeTournaments.length === 0 ? (
          <div className="nexus-card rounded-2xl p-8 text-center space-y-2">
            <p className="text-sm font-medium text-white">No tournaments yet</p>
            <p className="text-xs text-slate-400">
              Upcoming tournaments published by Arena Admins will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTournaments.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTournament(t)}
                className="text-left nexus-card nexus-card-hover rounded-2xl overflow-hidden flex flex-col cursor-pointer"
              >
                <div className="h-36 w-full relative overflow-hidden">
                  <SafeMediaImage
                    imageId={t.thumbnailImageId || t.coverImageId}
                    src={t.thumbnailUrl || t.coverUrl}
                    alt={t.title}
                    className="w-full h-full object-cover"
                    fallbackTitle={t.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D1017] via-transparent to-transparent" />
                </div>
                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="text-[#F5C451] font-medium">{t.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{t.status}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t.teamSize}v{t.teamSize}</span>
                    </div>
                    <h4 className="font-display text-xl font-bold text-white mt-1 line-clamp-1">{t.title}</h4>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-300">
                      Entry: {t.entryFee === 0 ? 'Free' : `${t.entryFee} C`}
                    </span>
                    <span className="text-[#F5C451] font-semibold">Prize: {t.prizePool} C</span>
                    <span className="text-slate-400">
                      {t.registeredCount}/{t.maxPlayers}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Grid: Leaderboard Preview + Recent Winners + Friends Online */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Leaderboard Preview */}
        <section className="nexus-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#F5C451]" />
              <span>Leaderboard Top 3</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('tournaments', 'leaderboard')}
              className="text-xs text-[#F5C451] hover:underline cursor-pointer"
            >
              Full Rankings
            </button>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No verified match rankings yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {leaderboard.map((entry, idx) => (
                <div key={entry.uid} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono font-bold text-[#F5C451] w-5">#{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{entry.inGameName}</p>
                      <p className="text-[11px] font-mono text-slate-400">{entry.playerId}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <p className="text-white font-semibold">{entry.arenaPoints} pts</p>
                    <p className="text-[11px] text-slate-400">{entry.wins} wins</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Winners */}
        <section className="nexus-card rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-xl font-bold text-white">Recent Winners</h3>
          {recentWinners.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No tournament winners announced yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {recentWinners.map((t) => {
                const top = t.winners?.[0];
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{top?.inGameName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{t.title}</p>
                    </div>
                    <span className="font-mono tabular-nums text-[#F5C451] shrink-0">
                      +{top?.prizeCoins ?? 0} C
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Friends Online */}
        <section className="nexus-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#FF1E38]" />
              <span>Friends Online</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('social')}
              className="text-xs text-[#F5C451] hover:underline cursor-pointer"
            >
              Open Social
            </button>
          </div>
          {friendsOnline.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No accepted friends online right now.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {friendsOnline.map((f) => (
                <button
                  key={f.uid}
                  type="button"
                  onClick={() => onNavigate('social')}
                  className="w-full py-2.5 flex items-center justify-between text-left hover:bg-white/5 rounded-lg px-2 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{f.inGameName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{f.playerId}</p>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-medium">Online</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedTournament && (
        <TournamentDetailModal
          tournament={selectedTournament}
          onClose={() => setSelectedTournament(null)}
        />
      )}
    </div>
  );
}
