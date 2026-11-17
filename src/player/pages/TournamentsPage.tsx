import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Search, Swords, Trophy } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import { toMillis, TOURNAMENT_CATEGORIES, type Tournament } from '../../shared/types';
import { TournamentDetailModal } from '../components/TournamentDetailModal';
import { LeaderboardPage } from './LeaderboardPage';

export function TournamentsPage({ initialSubTab = 'tournaments' }: { initialSubTab?: string }) {
  const { firebaseUser } = useAuth();
  const [subView, setSubView] = useState<'tournaments' | 'leaderboard'>(
    initialSubTab === 'leaderboard' ? 'leaderboard' : 'tournaments',
  );
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'live' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Tournament | null>(null);

  useEffect(() => {
    if (initialSubTab === 'leaderboard') setSubView('leaderboard');
  }, [initialSubTab]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'tournaments'), where('status', 'in', ['open', 'closed', 'live', 'completed', 'cancelled'])),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Tournament)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setTournaments(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tournaments'),
    );
    return () => unsub();
  }, [firebaseUser]);

  const filtered = tournaments.filter((t) => {
    if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Sub-navigation switcher: Tournaments vs Leaderboard */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D1017] border border-white/10">
          <button
            type="button"
            onClick={() => setSubView('tournaments')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subView === 'tournaments' ? 'bg-[#FF1E38] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Swords className="w-4 h-4" />
            <span>Tournaments</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('leaderboard')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subView === 'leaderboard' ? 'bg-[#D4AF37] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard</span>
          </button>
        </div>

        {subView === 'tournaments' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tournaments..."
              className="w-full min-h-[42px] rounded-xl bg-[#0D1017] border border-white/10 pl-10 pr-3.5 text-xs text-white focus:outline-none focus:border-[#FF1E38]"
            />
          </div>
        )}
      </div>

      {subView === 'leaderboard' ? (
        <LeaderboardPage />
      ) : (
        <>
          {/* Status Filter + Category Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {(['all', 'open', 'live', 'completed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    statusFilter === st
                      ? 'bg-white text-black'
                      : 'bg-[#0D1017] border border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {['All', ...TOURNAMENT_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    categoryFilter === cat
                      ? 'bg-[#FF1E38]/20 border border-[#FF1E38]/60 text-white'
                      : 'bg-[#0D1017] border border-white/8 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="nexus-card rounded-2xl h-64 animate-pulse bg-[#111520]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="nexus-card rounded-2xl p-10 text-center space-y-2">
              <p className="text-base font-semibold text-white">No tournaments yet</p>
              <p className="text-xs text-slate-400">
                Try adjusting your filters or wait for an Arena Admin to publish a new tournament.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className="text-left nexus-card nexus-card-hover rounded-2xl overflow-hidden flex flex-col cursor-pointer"
                >
                  <div className="h-40 w-full relative overflow-hidden">
                    <SafeMediaImage
                      imageId={t.thumbnailImageId || t.coverImageId}
                      src={t.thumbnailUrl || t.coverUrl}
                      alt={t.title}
                      className="w-full h-full object-cover"
                      fallbackTitle={t.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0D1017] via-transparent to-transparent" />
                  </div>
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="text-[#F5C451] font-medium">{t.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{t.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t.teamSize}v{t.teamSize}</span>
                      </div>
                      <h3 className="font-display text-2xl font-bold text-white mt-1 line-clamp-1">{t.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Starts: {t.startTime ? new Date(t.startTime).toLocaleString() : 'TBA'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-200">
                        {t.entryFee === 0 ? 'Free Entry' : `${t.entryFee} Coins`}
                      </span>
                      <span className="text-[#F5C451] font-bold">Prize {t.prizePool} C</span>
                      <span className="text-slate-400">
                        {t.registeredCount}/{t.maxPlayers}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {selected && <TournamentDetailModal tournament={selected} onClose={() => setSelected(null)} />}
        </>
      )}
    </div>
  );
}
