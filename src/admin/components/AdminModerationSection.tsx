import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Search, ShieldAlert, UserCheck, MessageSquare, Bell, FileText, Users } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import {
  formatTimestamp,
  toMillis,
  type AdminLog,
  type BanRecord,
  type ChatMessage,
  type ModeratorPermissions,
  type ModeratorRecord,
  type Report,
  type SupportTicket,
  type UserPublicProfile,
} from '../../shared/types';

export function AdminPlayersAndBansView() {
  const { firebaseUser, role } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [players, setPlayers] = useState<UserPublicProfile[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<UserPublicProfile | null>(null);
  const [banHistory, setBanHistory] = useState<BanRecord[]>([]);

  const [actionType, setActionType] = useState<BanRecord['type']>('temporary_suspend');
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState('24');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
      setPlayers(snap.docs.map((d) => d.data() as UserPublicProfile));
    });
    const unsubBans = onSnapshot(query(collection(db, 'bans'), orderBy('createdAt', 'desc')), (snap) => {
      setBanHistory(snap.docs.map((d) => d.data() as BanRecord));
    });
    return () => {
      unsub();
      unsubBans();
    };
  }, []);

  const filtered = players.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return p.playerId.toLowerCase().includes(q) || p.inGameName.toLowerCase().includes(q);
  });

  const applyModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedPlayer) return;
    setMsg(null);
    try {
      const banId = `ban_${Date.now()}_${selectedPlayer.uid.slice(0, 6)}`;
      const hours = Number(durationHours || 24);
      const expiresAt =
        actionType === 'temporary_suspend' ? new Date(Date.now() + hours * 3600000).toISOString() : '';

      const userPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (actionType === 'temporary_suspend') {
        userPatch.banStatus = 'suspended';
        userPatch.banReason = reason.trim();
        userPatch.banExpiresAt = expiresAt;
      } else if (actionType === 'permanent_ban') {
        userPatch.banStatus = 'banned';
        userPatch.banReason = reason.trim();
        userPatch.banExpiresAt = '';
      } else if (actionType === 'chat_restrict') {
        userPatch.chatRestricted = true;
      } else if (actionType === 'tournament_restrict') {
        userPatch.tournamentRestricted = true;
      } else if (actionType === 'unban') {
        userPatch.banStatus = 'none';
        userPatch.chatRestricted = false;
        userPatch.tournamentRestricted = false;
        userPatch.banReason = '';
        userPatch.banExpiresAt = '';
      }

      await updateDoc(doc(db, 'users', selectedPlayer.uid), userPatch);
      await setDoc(doc(db, 'bans', banId), {
        id: banId,
        uid: selectedPlayer.uid,
        playerId: selectedPlayer.playerId,
        type: actionType,
        reason: reason.trim().slice(0, 500),
        durationHours: actionType === 'temporary_suspend' ? hours : 0,
        expiresAt,
        issuedBy: firebaseUser.uid,
        issuedByRole: role === 'owner' ? 'owner' : 'moderator',
        createdAt: serverTimestamp(),
      });

      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, 'adminLogs', logId), {
        id: logId,
        actorUid: firebaseUser.uid,
        actorRole: role === 'owner' ? 'owner' : 'moderator',
        action: `MODERATION_${actionType.toUpperCase()}`,
        targetType: 'user',
        targetId: selectedPlayer.uid,
        reason: reason.trim().slice(0, 500),
        details: selectedPlayer.playerId,
        createdAt: serverTimestamp(),
      });

      setReason('');
      setMsg(`Applied ${actionType.replace('_', ' ')} to ${selectedPlayer.inGameName}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Moderation action failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-[#FF1E38]" />
          <span>Players, Moderation &amp; Ban History</span>
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Player ID or IGN..."
            className="w-full min-h-[40px] rounded-xl bg-[#0D1017] border border-white/10 pl-9 pr-3 text-xs text-white"
          />
        </div>
      </div>

      {msg && <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 p-3 text-xs text-white">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Players Table */}
        <section className="lg:col-span-7 nexus-card rounded-2xl overflow-hidden">
          <div className="max-h-[460px] overflow-y-auto divide-y divide-white/10">
            {filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No players found.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => setSelectedPlayer(p)}
                  className={`w-full p-3.5 text-left flex items-center justify-between gap-3 text-xs hover:bg-white/[0.03] cursor-pointer ${
                    selectedPlayer?.uid === p.uid ? 'bg-[#FF1E38]/10' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold text-white">{p.inGameName}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {p.playerId} · {p.country} · {p.balance} C
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={p.banStatus === 'none' ? 'text-emerald-400' : 'text-[#FF1E38] font-semibold'}>
                      {p.banStatus === 'none' ? 'Active' : p.banStatus}
                    </span>
                    {(p.chatRestricted || p.tournamentRestricted) && (
                      <p className="text-[10px] text-amber-300">
                        {p.chatRestricted ? 'No Chat ' : ''}
                        {p.tournamentRestricted ? 'No Tourney' : ''}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Moderation Controls */}
        <section className="lg:col-span-5 nexus-card rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#FF1E38]" />
            <span>Moderation Action</span>
          </h3>
          {!selectedPlayer ? (
            <p className="text-xs text-slate-400 py-6">Select a player from the list to inspect or moderate.</p>
          ) : (
            <form onSubmit={applyModeration} className="space-y-3 text-xs">
              <div className="rounded-xl bg-[#07090E] p-3 border border-white/10">
                <p className="font-semibold text-white">{selectedPlayer.inGameName}</p>
                <p className="font-mono text-slate-400">
                  {selectedPlayer.playerId} · FF UID: {selectedPlayer.ffUid || '—'} · Wins: {selectedPlayer.wins}
                </p>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Action</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as BanRecord['type'])}
                  className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-white"
                >
                  <option value="temporary_suspend">Temporary Suspend</option>
                  <option value="permanent_ban">Permanent Ban</option>
                  <option value="chat_restrict">Restrict Chat</option>
                  <option value="tournament_restrict">Restrict Tournament Registration</option>
                  <option value="unban">Unban &amp; Lift Restrictions</option>
                </select>
              </div>
              {actionType === 'temporary_suspend' && (
                <div>
                  <label className="block text-slate-300 mb-1">Duration (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={8760}
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 font-mono text-white"
                  />
                </div>
              )}
              <div>
                <label className="block text-slate-300 mb-1">Reason / Moderation Note *</label>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-white"
                />
              </div>
              <button type="submit" className="w-full min-h-[42px] rounded-xl bg-[#FF1E38] text-white font-semibold cursor-pointer">
                Apply &amp; Log Action
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Ban History */}
      <section className="nexus-card rounded-2xl p-5 space-y-3">
        <h3 className="font-display text-xl font-bold text-white">Recent Moderation &amp; Ban History</h3>
        {banHistory.length === 0 ? (
          <p className="text-xs text-slate-400">No ban records yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {banHistory.slice(0, 20).map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-[#F5C451] mr-2">{b.playerId || b.uid.slice(0, 8)}</span>
                  <span className="capitalize font-semibold text-white">{b.type.replace('_', ' ')}</span>
                  <span className="text-slate-400 ml-2">— {b.reason}</span>
                </div>
                <span className="text-[11px] text-slate-500">{formatTimestamp(b.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function AdminReportsView() {
  const { firebaseUser, role, permissions } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatMessage[]>([]);
  const [viewingChatId, setViewingChatId] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), (snap) => {
      setReports(snap.docs.map((d) => d.data() as Report));
    });
    return () => unsub();
  }, []);

  const loadChatEvidence = async (chatId: string) => {
    setViewingChatId(chatId);
    const snap = await getDocs(collection(db, 'messages', chatId, 'items'));
    setChatLogs(
      snap.docs
        .map((d) => d.data() as ChatMessage)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)),
    );
  };

  const updateReport = async (r: Report, status: Report['status']) => {
    if (!firebaseUser) return;
    await updateDoc(doc(db, 'reports', r.id), {
      status,
      moderatorNotes: (notesMap[r.id] || r.moderatorNotes || '').slice(0, 1000),
      reviewedBy: firebaseUser.uid,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold text-white">Friends &amp; Chat Reports</h2>
      {reports.length === 0 ? (
        <div className="nexus-card rounded-2xl p-8 text-center text-xs text-slate-400">No reports submitted yet.</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="nexus-card rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {r.reporterPlayerId || r.reporterUid.slice(0, 8)} reported {r.targetPlayerId || r.targetUid.slice(0, 8)} ({r.category.replace('_', ' ')})
                </span>
                <span className="capitalize font-semibold text-[#F5C451]">{r.status}</span>
              </div>
              <p className="text-slate-300">{r.reason}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={notesMap[r.id] ?? r.moderatorNotes ?? ''}
                  onChange={(e) => setNotesMap((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Moderator notes..."
                  className="flex-1 min-w-[200px] min-h-[38px] rounded-lg bg-[#07090E] border border-white/10 px-3 text-white"
                />
                {r.chatId && (role === 'owner' || permissions.monitorChat) && (
                  <button
                    type="button"
                    onClick={() => loadChatEvidence(r.chatId!)}
                    className="min-h-[38px] px-3 rounded-lg bg-white/10 text-white cursor-pointer"
                  >
                    Inspect Chat
                  </button>
                )}
                <button type="button" onClick={() => updateReport(r, 'resolved')} className="min-h-[38px] px-3 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer">
                  Resolve
                </button>
                <button type="button" onClick={() => updateReport(r, 'dismissed')} className="min-h-[38px] px-3 rounded-lg bg-white/10 text-slate-300 cursor-pointer">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingChatId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-lg w-full nexus-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-white">Chat Evidence</h3>
              <button type="button" onClick={() => setViewingChatId(null)} className="text-xs text-slate-400 hover:text-white cursor-pointer">
                Close
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2 text-xs">
              {chatLogs.length === 0 ? (
                <p className="text-slate-400">No chat messages in this thread.</p>
              ) : (
                chatLogs.map((m) => (
                  <div key={m.id} className="rounded-lg bg-[#07090E] p-2.5 border border-white/10 space-y-2">
                    <div>
                      <span className="font-mono text-[#F5C451] mr-2">{m.senderUid.slice(0, 8)}:</span>
                      <span className="text-slate-200">{m.text || `[${m.type}]`}</span>
                    </div>
                    {m.type === 'image' && (m.mediaImageId || m.mediaUrl) && (
                      <SafeMediaImage
                        imageId={m.mediaImageId}
                        src={m.mediaUrl}
                        alt="Reported chat image"
                        className="rounded-lg max-h-48 object-contain"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminModeratorsView() {
  const { firebaseUser } = useAuth();
  const [mods, setMods] = useState<ModeratorRecord[]>([]);
  const [playerIdInput, setPlayerIdInput] = useState('');
  const [perms, setPerms] = useState<ModeratorPermissions>({
    reviewReports: true,
    monitorChat: true,
    manageTournaments: true,
    verifyResults: false,
    assistSupport: true,
    flagSuspicious: true,
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'moderators'), (snap) => {
      setMods(snap.docs.map((d) => d.data() as ModeratorRecord));
    });
    return () => unsub();
  }, []);

  const addModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setMsg(null);
    const pid = playerIdInput.trim().toUpperCase();
    const snap = await getDocs(query(collection(db, 'users'), where('playerId', '==', pid)));
    if (snap.empty) {
      setMsg(`Player ID "${pid}" not found.`);
      return;
    }
    const p = snap.docs[0].data() as UserPublicProfile;
    await setDoc(doc(db, 'moderators', p.uid), {
      uid: p.uid,
      playerId: p.playerId,
      inGameName: p.inGameName,
      status: 'active',
      permissions: perms,
      addedBy: firebaseUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setPlayerIdInput('');
    setMsg(`Added ${p.inGameName} (${p.playerId}) as Moderator.`);
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
        <UserCheck className="w-5 h-5 text-[#F5C451]" />
        <span>Moderator Management (Owner Only)</span>
      </h2>

      {msg && <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 p-3 text-xs text-white">{msg}</div>}

      <form onSubmit={addModerator} className="nexus-card rounded-2xl p-5 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={playerIdInput}
            onChange={(e) => setPlayerIdInput(e.target.value)}
            placeholder="Enter Player ID (e.g. NX-849201)"
            className="flex-1 min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 font-mono text-white"
          />
          <button type="submit" className="min-h-[42px] px-5 rounded-xl bg-[#D4AF37] text-black font-bold cursor-pointer">
            Approve Moderator
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
          {(Object.keys(perms) as Array<keyof ModeratorPermissions>).map((k) => (
            <label key={k} className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={perms[k]}
                onChange={(e) => setPerms((prev) => ({ ...prev, [k]: e.target.checked }))}
                className="accent-[#D4AF37]"
              />
              <span>{k}</span>
            </label>
          ))}
        </div>
      </form>

      <div className="nexus-card rounded-2xl divide-y divide-white/10">
        {mods.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">No moderators assigned yet.</p>
        ) : (
          mods.map((m) => (
            <div key={m.uid} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-white">
                  {m.inGameName} ({m.playerId}) — <span className="capitalize text-[#F5C451]">{m.status}</span>
                </p>
                <p className="text-slate-400 mt-0.5">
                  Permissions: {Object.entries(m.permissions || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateDoc(doc(db, 'moderators', m.uid), {
                      status: m.status === 'active' ? 'suspended' : 'active',
                      updatedAt: serverTimestamp(),
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white cursor-pointer"
                >
                  {m.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteDoc(doc(db, 'moderators', m.uid))}
                  className="px-3 py-1.5 rounded-lg bg-[#FF1E38]/20 text-[#FF1E38] cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AdminSupportAndNotifsView({ mode }: { mode: 'support' | 'notifications' | 'logs' }) {
  const { firebaseUser, role } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<AdminLog[]>([]);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifTargetUid, setNotifTargetUid] = useState('ALL');
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'support') {
      return onSnapshot(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')), (snap) => {
        setTickets(snap.docs.map((d) => d.data() as SupportTicket));
      });
    }
    if (mode === 'logs') {
      return onSnapshot(query(collection(db, 'adminLogs'), orderBy('createdAt', 'desc')), (snap) => {
        setLogs(snap.docs.map((d) => d.data() as AdminLog));
      });
    }
  }, [mode]);

  if (mode === 'notifications') {
    return (
      <div className="space-y-5 max-w-2xl">
        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#F5C451]" />
          <span>Send Arena Notification</span>
        </h2>
        {notifMsg && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notifMsg}</div>}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const id = `notif_${Date.now()}`;
            await setDoc(doc(db, 'notifications', id), {
              id,
              targetUid: notifTargetUid.trim() || 'ALL',
              type: 'announcement',
              title: notifTitle.trim().slice(0, 120),
              body: notifBody.trim().slice(0, 500),
              read: false,
              createdAt: serverTimestamp(),
            });
            setNotifTitle('');
            setNotifBody('');
            setNotifMsg('Notification published.');
          }}
          className="nexus-card rounded-2xl p-5 space-y-4 text-xs"
        >
          <div>
            <label className="block text-slate-300 mb-1">Target UID (or ALL for global announcement)</label>
            <input
              type="text"
              value={notifTargetUid}
              onChange={(e) => setNotifTargetUid(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-slate-300 mb-1">Title *</label>
            <input
              type="text"
              required
              maxLength={120}
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-300 mb-1">Message *</label>
            <textarea
              required
              maxLength={500}
              rows={3}
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-white"
            />
          </div>
          <button type="submit" className="min-h-[42px] px-5 rounded-xl bg-[#FF1E38] text-white font-semibold cursor-pointer">
            Publish Notification
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'logs') {
    return (
      <div className="nexus-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#F5C451]" />
          <h2 className="font-display text-2xl font-bold text-white">Immutable Admin Activity Logs</h2>
        </div>
        {logs.length === 0 ? (
          <p className="p-8 text-center text-xs text-slate-400">No admin actions logged yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {logs.map((l) => (
              <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-mono font-bold text-[#F5C451] mr-2">{l.action}</span>
                  <span className="text-slate-300">{l.reason || l.details}</span>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Actor: {l.actorRole} ({l.actorUid.slice(0, 8)}) · Target: {l.targetType}/{l.targetId}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500 shrink-0">{formatTimestamp(l.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-[#FF1E38]" />
        <span>Support Tickets</span>
      </h2>
      {tickets.length === 0 ? (
        <div className="nexus-card rounded-2xl p-8 text-center text-xs text-slate-400">No support tickets yet.</div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="nexus-card rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-white">
                  {t.subject} — {t.playerId}
                </span>
                <span className="capitalize text-[#F5C451] font-semibold">{t.status.replace('_', ' ')}</span>
              </div>
              <p className="text-slate-300">{t.message}</p>
              {t.replies?.map((r, i) => (
                <div key={i} className="rounded-lg bg-[#07090E] p-2.5 text-[11px]">
                  <strong className="text-[#F5C451] uppercase mr-2">{r.senderRole}:</strong>
                  <span>{r.text}</span>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <input
                  type="text"
                  value={replyText[t.id] || ''}
                  onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  placeholder="Write staff reply..."
                  className="flex-1 min-w-[200px] min-h-[38px] rounded-lg bg-[#07090E] border border-white/10 px-3 text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!firebaseUser || !(replyText[t.id] || '').trim()) return;
                    const nextReplies = [
                      ...(t.replies || []),
                      {
                        senderUid: firebaseUser.uid,
                        senderRole: role === 'owner' ? 'owner' : 'moderator',
                        text: replyText[t.id].trim(),
                        createdAt: new Date().toISOString(),
                      },
                    ];
                    await updateDoc(doc(db, 'supportTickets', t.id), {
                      replies: nextReplies,
                      status: 'in_progress',
                      updatedAt: serverTimestamp(),
                    });
                    setReplyText((prev) => ({ ...prev, [t.id]: '' }));
                  }}
                  className="min-h-[38px] px-4 rounded-lg bg-[#D4AF37] text-black font-bold cursor-pointer"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => updateDoc(doc(db, 'supportTickets', t.id), { status: 'resolved', updatedAt: serverTimestamp() })}
                  className="min-h-[38px] px-3 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
