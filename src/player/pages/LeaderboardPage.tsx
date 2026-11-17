import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Crown, Trophy } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import type { LeaderboardEntry } from '../../shared/types';

type LeaderboardMode =
  | 'global'
  | 'weekly'
  | 'monthly'
  | 'wins'
  | 'matches'
  | 'mvp'
  | 'eliminations'
  | 'arenaPoints';

const MODE_LABELS: Record<LeaderboardMode, string> = {
  global: 'Global',
  weekly: 'Weekly',
  monthly: 'Monthly',
  wins: 'Tournament Wins',
  matches: 'Total Matches',
  mvp: 'MVP',
  eliminations: 'Eliminations',
  arenaPoints: 'Arena Points',
};

export function LeaderboardPage() {
  const { firebaseUser } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [mode, setMode] = useState<LeaderboardMode>('global');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'leaderboard'), where('arenaPoints', '>=', 0), orderBy('arenaPoints', 'desc')),
      (snap) => {
        setEntries(snap.docs.map((d) => d.data() as LeaderboardEntry));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'leaderboard'),
    );
    return () => unsub();
  }, [firebaseUser]);

  const sorted = [...entries].sort((a, b) => {
    switch (mode) {
      case 'weekly':
        return b.weeklyPoints - a.weeklyPoints;
      case 'monthly':
        return b.monthlyPoints - a.monthlyPoints;
      case 'wins':
        return b.wins - a.wins;
      case 'matches':
        return b.matches - a.matches;
      case 'mvp':
        return b.mvpCount - a.mvpCount;
      case 'eliminations':
        return b.eliminations - a.eliminations;
      case 'arenaPoints':
      case 'global':
      default:
        return b.arenaPoints - a.arenaPoints;
    }
  });

  const getMetricValue = (entry: LeaderboardEntry): number => {
    switch (mode) {
      case 'weekly':
        return entry.weeklyPoints;
      case 'monthly':
        return entry.monthlyPoints;
      case 'wins':
        return entry.wins;
      case 'matches':
        return entry.matches;
      case 'mvp':
        return entry.mvpCount;
      case 'eliminations':
        return entry.eliminations;
      default:
        return entry.arenaPoints;
    }
  };

  const topThree = sorted.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-white">Verified Arena Leaderboard</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Rankings are generated strictly from admin-verified tournament match results.
        </p>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(Object.keys(MODE_LABELS) as LeaderboardMode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              mode === key
                ? 'bg-[#D4AF37] text-black'
                : 'bg-[#0D1017] border border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="nexus-card rounded-2xl h-64 animate-pulse bg-[#111520]" />
      ) : sorted.length === 0 ? (
        <div className="nexus-card rounded-2xl p-10 text-center space-y-2">
          <Trophy className="w-8 h-8 text-[#D4AF37]/60 mx-auto" />
          <p className="text-base font-semibold text-white">No leaderboard rankings yet</p>
          <p className="text-xs text-slate-400">
            Rankings populate automatically after verified match results are published.
          </p>
        </div>
      ) : (
        <>
          {/* Animated Top-3 Podium */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            {[topThree[1], topThree[0], topThree[2]].map((player, visualIdx) => {
              if (!player) return <div key={`empty-${visualIdx}`} className="hidden sm:block" />;
              const actualRank = visualIdx === 1 ? 1 : visualIdx === 0 ? 2 : 3;
              const isFirst = actualRank === 1;
              return (
                <motion.div
                  key={player.uid}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: actualRank * 0.08 }}
                  className={`nexus-card rounded-2xl p-5 text-center space-y-3 ${
                    isFirst ? 'border-[#D4AF37]/60 nexus-gold-ring sm:order-2 sm:py-7' : visualIdx === 0 ? 'sm:order-1' : 'sm:order-3'
                  }`}
                >
                  <div className="inline-flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-[#F5C451]">
                    {isFirst && <Crown className="w-4 h-4 text-[#F5C451]" />}
                    <span>RANK #{actualRank}</span>
                  </div>
                  <div className="w-16 h-16 rounded-full mx-auto overflow-hidden border-2 border-[#D4AF37]/40 bg-[#121621]">
                    <SafeMediaImage
                      imageId={player.avatarImageId}
                      src={player.avatarUrl}
                      alt={player.inGameName}
                      className="w-full h-full object-cover"
                      fallbackTitle={player.inGameName.slice(0, 2).toUpperCase()}
                    />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-white truncate">{player.inGameName}</p>
                    <p className="text-[11px] font-mono text-slate-400">{player.playerId} · {player.country || 'Global'}</p>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <p className="font-mono tabular-nums text-xl font-bold text-[#F5C451]">
                      {getMetricValue(player)}
                    </p>
                    <p className="text-[11px] text-slate-400">{MODE_LABELS[mode]}</p>
                  </div>
                  {player.badges && player.badges.length > 0 && (
                    <p className="text-[11px] text-slate-300">{player.badges.join(' · ')}</p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Full Rankings Table */}
          <div className="nexus-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#121621] text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Rank</th>
                    <th className="py-3 px-4 font-semibold">Player</th>
                    <th className="py-3 px-4 font-semibold text-right">Wins</th>
                    <th className="py-3 px-4 font-semibold text-right">Matches</th>
                    <th className="py-3 px-4 font-semibold text-right">Elims</th>
                    <th className="py-3 px-4 font-semibold text-right">MVP</th>
                    <th className="py-3 px-4 font-semibold text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {sorted.map((p, idx) => (
                    <tr key={p.uid} className="hover:bg-white/[0.03]">
                      <td className="py-3 px-4 font-mono tabular-nums font-bold text-[#F5C451]">#{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-[#121621] shrink-0">
                            <SafeMediaImage
                              imageId={p.avatarImageId}
                              src={p.avatarUrl}
                              alt={p.inGameName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-white">{p.inGameName}</p>
                            <p className="text-[11px] font-mono text-slate-400">{p.playerId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">{p.wins}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">{p.matches}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">{p.eliminations}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">{p.mvpCount}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#F5C451]">
                        {getMetricValue(p)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
