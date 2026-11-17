import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { X, Trophy, Shield, Lock, KeyRound, Copy, Check, AlertCircle, Users, Coins } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import type { Registration, SecuritySettings, Tournament } from '../../shared/types';

export function TournamentDetailModal({
  tournament,
  onClose,
}: {
  tournament: Tournament;
  onClose: () => void;
}) {
  const { firebaseUser, profile, emailVerified } = useAuth();
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [teamName, setTeamName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const [roomCreds, setRoomCreds] = useState<{ roomId: string; roomPassword: string; notes?: string } | null>(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const regRef = doc(db, 'registrations', `${tournament.id}_${firebaseUser.uid}`);
    const unsubReg = onSnapshot(
      regRef,
      (snap) => {
        setRegistration(snap.exists() ? (snap.data() as Registration) : null);
      },
      () => setRegistration(null),
    );
    const unsubSec = onSnapshot(
      doc(db, 'appSettings', 'security'),
      (snap) => {
        setSecurity(snap.exists() ? (snap.data() as SecuritySettings) : null);
      },
      () => {},
    );
    return () => {
      unsubReg();
      unsubSec();
    };
  }, [firebaseUser, tournament.id]);

  const handleRegister = async () => {
    if (!firebaseUser) return;
    setRegError(null);
    setRegSuccess(null);
    setRegistering(true);
    try {
      const token = await firebaseUser.getIdToken();
      const idempotencyKey = `${tournament.id}_${firebaseUser.uid}_${Date.now()}`;
      const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamName: teamName.trim(),
          idempotencyKey,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; alreadyRegistered?: boolean };
      if (!res.ok) {
        throw new Error(data.error || 'Could not complete registration.');
      }
      setRegSuccess(
        data.alreadyRegistered
          ? 'You are already registered for this tournament.'
          : 'Registration confirmed! Your slot is locked.',
      );
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  const handleFetchRoomCreds = async () => {
    if (!firebaseUser) return;
    setCredsError(null);
    setCredsLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/room-credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { roomId?: string; roomPassword?: string; notes?: string; error?: string };
      if (!res.ok || !data.roomId) {
        throw new Error(data.error || 'Room credentials are not published yet.');
      }
      setRoomCreds({
        roomId: data.roomId,
        roomPassword: data.roomPassword || '',
        notes: data.notes,
      });
    } catch (err) {
      setCredsError(err instanceof Error ? err.message : 'Unable to load room credentials.');
    } finally {
      setCredsLoading(false);
    }
  };

  const copyText = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const slotsPct = Math.min(100, Math.round((tournament.registeredCount / Math.max(1, tournament.maxPlayers)) * 100));
  const paidBlocked = tournament.entryFee > 0 && !security?.paidEntriesEnabled;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto nexus-card rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0B0D13]">
        {/* Cover */}
        <div className="relative h-48 sm:h-56 w-full overflow-hidden">
          <SafeMediaImage
            imageId={tournament.coverImageId || tournament.thumbnailImageId}
            src={tournament.coverUrl || tournament.thumbnailUrl}
            alt={tournament.title}
            className="w-full h-full object-cover"
            fallbackTitle={tournament.title}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D13] via-[#0B0D13]/50 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer"
            aria-label="Close tournament details"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-5 right-5">
            <div className="flex items-center gap-2 text-xs text-[#F5C451] font-medium">
              <span>{tournament.category}</span>
              <span aria-hidden="true">·</span>
              <span>{tournament.teamSize}v{tournament.teamSize}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{tournament.status}</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-white mt-0.5">{tournament.title}</h2>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Core Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#121621] border border-white/8 p-3">
              <p className="text-[11px] text-slate-400">Entry Fee</p>
              <p className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                {tournament.entryFee === 0 ? 'FREE' : `${tournament.entryFee} Coins`}
              </p>
            </div>
            <div className="rounded-xl bg-[#121621] border border-white/8 p-3">
              <p className="text-[11px] text-slate-400">Prize Pool</p>
              <p className="text-base font-bold font-mono tabular-nums text-[#F5C451] mt-0.5">
                {tournament.prizePool} Coins
              </p>
            </div>
            <div className="rounded-xl bg-[#121621] border border-white/8 p-3">
              <p className="text-[11px] text-slate-400">Players</p>
              <p className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                {tournament.registeredCount} / {tournament.maxPlayers}
              </p>
            </div>
            <div className="rounded-xl bg-[#121621] border border-white/8 p-3">
              <p className="text-[11px] text-slate-400">Match Time</p>
              <p className="text-xs font-medium text-white mt-1 truncate" title={tournament.startTime}>
                {tournament.startTime ? new Date(tournament.startTime).toLocaleString() : 'TBA'}
              </p>
            </div>
          </div>

          {/* Slots Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Registration Capacity</span>
              </span>
              <span className="font-mono tabular-nums">{slotsPct}% filled</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF1E38] to-[#F5C451]"
                style={{ width: `${slotsPct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Deadline: {tournament.registrationDeadline ? new Date(tournament.registrationDeadline).toLocaleString() : 'Until full'}
            </p>
          </div>

          {/* Prize & Rules */}
          {tournament.prizeDistribution && (
            <div className="rounded-xl bg-[#121621] border border-white/8 p-4 space-y-1">
              <h4 className="text-xs font-semibold text-[#F5C451] flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                <span>Prize Distribution</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {tournament.prizeDistribution}
              </p>
            </div>
          )}

          {tournament.rulesText && (
            <div className="rounded-xl bg-[#121621] border border-white/8 p-4 space-y-1">
              <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#FF1E38]" />
                <span>Tournament Rules</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {tournament.rulesText}
              </p>
            </div>
          )}

          {/* Announced Winners */}
          {tournament.resultsAnnounced && tournament.winners && tournament.winners.length > 0 && (
            <div className="rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/5 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-[#F5C451]">Verified Match Results</h4>
              <div className="divide-y divide-white/10">
                {tournament.winners.map((w, idx) => (
                  <div key={`${w.uid}_${idx}`} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#F5C451] mr-2">#{w.placement}</span>
                      <span className="font-semibold text-white">{w.inGameName}</span>
                      <span className="text-slate-400 ml-2 font-mono">{w.playerId}</span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-200">
                      {w.kills} Kills · +{w.prizeCoins} Coins
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Registration & Protected Room Credentials */}
          {registration ? (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Registered &amp; Confirmed</p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Fee Paid: {registration.entryFeePaid} Coins · {registration.teamName || profile?.inGameName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFetchRoomCreds}
                  disabled={credsLoading}
                  className="min-h-[40px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{credsLoading ? 'Loading...' : 'View Room ID & Password'}</span>
                </button>
              </div>

              {credsError && (
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{credsError}</span>
                </p>
              )}

              {roomCreds && (
                <div className="rounded-xl bg-[#07090E] border border-white/10 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Room ID</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">{roomCreds.roomId}</span>
                      <button
                        type="button"
                        onClick={() => copyText('id', roomCreds.roomId)}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                        aria-label="Copy Room ID"
                      >
                        {copiedField === 'id' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Password</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#F5C451] text-sm">{roomCreds.roomPassword}</span>
                      <button
                        type="button"
                        onClick={() => copyText('pw', roomCreds.roomPassword)}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                        aria-label="Copy Room Password"
                      >
                        {copiedField === 'pw' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  {roomCreds.notes && <p className="text-[11px] text-slate-400 pt-1 border-t border-white/5">{roomCreds.notes}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#121621] p-4 space-y-3">
              {!emailVerified ? (
                <p className="text-xs text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Please verify your email in Profile → Settings before joining tournaments.</span>
                </p>
              ) : profile?.banStatus !== 'none' || profile?.tournamentRestricted ? (
                <p className="text-xs text-[#FF1E38] flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Your account is currently restricted from tournament entry.</span>
                </p>
              ) : paidBlocked ? (
                <p className="text-xs text-amber-300 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Paid tournament entries are currently disabled by Security Settings.</span>
                </p>
              ) : tournament.status !== 'open' ? (
                <p className="text-xs text-slate-400">Registration is currently {tournament.status}.</p>
              ) : (
                <>
                  {tournament.teamSize > 1 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Squad / Team Name (optional)
                      </label>
                      <input
                        type="text"
                        maxLength={64}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="Enter team name"
                        className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white focus:outline-none focus:border-[#FF1E38]"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-[#F5C451]" />
                      <span>Your Balance: {profile?.balance ?? 0} Coins</span>
                    </span>
                    <span className="font-mono">
                      Entry: {tournament.entryFee === 0 ? 'Free' : `${tournament.entryFee} Coins`}
                    </span>
                  </div>

                  {regError && (
                    <p className="text-xs text-[#FF1E38] flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{regError}</span>
                    </p>
                  )}
                  {regSuccess && <p className="text-xs text-emerald-400">{regSuccess}</p>}

                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={registering || tournament.registeredCount >= tournament.maxPlayers}
                    className="w-full min-h-[48px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {registering
                      ? 'Confirming Entry...'
                      : tournament.registeredCount >= tournament.maxPlayers
                        ? 'Tournament Full'
                        : tournament.entryFee === 0
                          ? 'Register Free'
                          : `Pay ${tournament.entryFee} Coins & Register`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
