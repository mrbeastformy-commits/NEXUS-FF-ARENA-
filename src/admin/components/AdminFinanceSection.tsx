import React, { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Check, Coins, Eye, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import {
  formatTimestamp,
  toMillis,
  type DepositRequest,
  type UserPublicProfile,
  type WalletTransaction,
  type WithdrawalRequest,
} from '../../shared/types';

export function AdminDepositsView() {
  const { firebaseUser } = useAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [viewerTarget, setViewerTarget] = useState<{ imageId?: string; src?: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DepositRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'depositRequests'), orderBy('createdAt', 'desc')), (snap) => {
      setDeposits(snap.docs.map((d) => d.data() as DepositRequest));
    });
    return () => unsub();
  }, []);

  const reviewDeposit = async (reqId: string, action: 'approve' | 'reject', reason = '') => {
    if (!firebaseUser) return;
    setFeedback(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(reqId)}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, reason }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Review failed.');
      setFeedback({ type: 'ok', text: `Deposit ${action === 'approve' ? 'approved & credited' : 'rejected'}.` });
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Action failed.' });
    }
  };

  const filtered = deposits.filter((d) => filter === 'all' || d.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-white">Deposit &amp; Screenshot Verification</h2>
        <div className="flex gap-1.5">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                filter === tab ? 'bg-[#D4AF37] text-black' : 'bg-[#0D1017] border border-white/10 text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl p-3.5 text-xs flex items-center gap-2 border ${feedback.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'}`}>
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="nexus-card rounded-2xl p-8 text-center text-xs text-slate-400">
          No {filter} deposit requests.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((d) => (
            <div key={d.id} className="nexus-card rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => setViewerTarget({ imageId: d.screenshotImageId, src: d.screenshotUrl })}
                className="w-full sm:w-32 h-40 rounded-xl overflow-hidden bg-[#07090E] border border-white/10 relative group shrink-0 cursor-pointer"
              >
                <SafeMediaImage
                  imageId={d.screenshotImageId}
                  src={d.screenshotUrl}
                  alt="Payment proof"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white gap-1">
                  <Eye className="w-4 h-4" />
                  <span>View</span>
                </div>
              </button>

              <div className="flex-1 flex flex-col justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-white">
                      {d.inGameName} ({d.playerId})
                    </span>
                    <span className="capitalize font-semibold text-[#F5C451]">{d.status}</span>
                  </div>
                  <p className="font-mono text-[#F5C451] font-bold">
                    PKR {d.amountPkr} -&gt; {d.coins} Coins
                  </p>
                  <p className="text-slate-300 font-medium">{d.method}</p>
                  {d.rejectionReason && <p className="text-[#FF1E38]">Rejection: {d.rejectionReason}</p>}
                  <p className="text-[11px] text-slate-500">{formatTimestamp(d.createdAt)}</p>
                </div>

                  {d.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => reviewDeposit(d.id, 'approve')}
                        className="flex-1 min-h-[38px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve &amp; Credit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectTarget(d)}
                        className="flex-1 min-h-[38px] rounded-lg bg-[#FF1E38]/20 border border-[#FF1E38]/40 text-[#FF1E38] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
          ))}
        </div>
      )}

      {/* Full-size Screenshot Lightbox */}
      {viewerTarget && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setViewerTarget(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
            aria-label="Close full-size screenshot"
          >
            <X className="w-5 h-5" />
          </button>
          <SafeMediaImage
            imageId={viewerTarget.imageId}
            src={viewerTarget.src}
            eager
            alt="Full payment screenshot"
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
          />
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reviewDeposit(rejectTarget.id, 'reject', rejectReason);
            }}
            className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-2xl font-bold text-white">Reject Deposit Request</h3>
            <p className="text-xs text-slate-400">
              Player {rejectTarget.playerId} · {rejectTarget.method} (PKR {rejectTarget.amountPkr})
            </p>
            <textarea
              required
              minLength={3}
              maxLength={300}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter clear rejection reason (e.g. Unclear or edited payment screenshot)..."
              className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRejectTarget(null)} className="min-h-[42px] rounded-xl bg-white/10 text-xs text-white cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="min-h-[42px] rounded-xl bg-[#FF1E38] text-xs font-bold text-white cursor-pointer">
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminWithdrawalsView() {
  const { firebaseUser } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'withdrawalRequests'), orderBy('createdAt', 'desc')), (snap) => {
      setWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRequest));
    });
    return () => unsub();
  }, []);

  const review = async (id: string, action: 'approve' | 'reject', reason = '') => {
    if (!firebaseUser) return;
    setFeedback(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/withdrawals/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      setFeedback(`Withdrawal ${action === 'approve' ? 'approved' : 'rejected'}.`);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed.');
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold text-white">Withdrawal Requests</h2>
      {feedback && <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 p-3 text-xs text-white">{feedback}</div>}
      {withdrawals.length === 0 ? (
        <div className="nexus-card rounded-2xl p-8 text-center text-xs text-slate-400">No withdrawal requests yet.</div>
      ) : (
        <div className="divide-y divide-white/10 nexus-card rounded-2xl">
          {withdrawals.map((w) => (
            <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-white">
                  {w.inGameName} ({w.playerId}) — {w.coinsAmount} Coins (PKR {w.pkrAmount})
                </p>
                <p className="font-mono text-slate-300">
                  {w.method} · {w.accountNumber} · {w.accountTitle}
                </p>
                <p className="text-slate-400">
                  Status: <span className="capitalize text-[#F5C451]">{w.status}</span> · {formatTimestamp(w.createdAt)}
                </p>
                {w.rejectionReason && <p className="text-[#FF1E38]">Reason: {w.rejectionReason}</p>}
              </div>
              {w.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => review(w.id, 'approve')}
                    className="min-h-[38px] px-4 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                  >
                    Approve Payout
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectTarget(w)}
                    className="min-h-[38px] px-4 rounded-lg bg-[#FF1E38]/20 text-[#FF1E38] font-semibold cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              review(rejectTarget.id, 'reject', rejectReason);
            }}
            className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-2xl font-bold text-white">Reject Withdrawal</h3>
            <textarea
              required
              minLength={3}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason..."
              className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRejectTarget(null)} className="min-h-[42px] rounded-xl bg-white/10 text-xs text-white cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="min-h-[42px] rounded-xl bg-[#FF1E38] text-xs font-bold text-white cursor-pointer">
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminManualCoinsView() {
  const { firebaseUser } = useAuth();
  const [searchId, setSearchId] = useState('');
  const [targetUser, setTargetUser] = useState<UserPublicProfile | null>(null);
  const [playerTxs, setPlayerTxs] = useState<WalletTransaction[]>([]);
  const [mode, setMode] = useState<'manual_credit' | 'manual_debit' | 'reward'>('manual_credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const lookupPlayer = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFeedback(null);
    const pid = searchId.trim().toUpperCase();
    if (!pid) return;
    const snap = await getDocs(query(collection(db, 'users'), where('playerId', '==', pid)));
    if (snap.empty) {
      setTargetUser(null);
      setPlayerTxs([]);
      setFeedback({ type: 'error', text: `No player found with ID ${pid}.` });
      return;
    }
    const found = snap.docs[0].data() as UserPublicProfile;
    setTargetUser(found);
    const txSnap = await getDocs(query(collection(db, 'walletTransactions'), where('uid', '==', found.uid)));
    setPlayerTxs(
      txSnap.docs
        .map((d) => d.data() as WalletTransaction)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
    );
  };

  const executeAdjustment = async () => {
    if (!firebaseUser || !targetUser) return;
    setConfirmOpen(false);
    setFeedback(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/coins/adjust', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUid: targetUser.uid,
          mode,
          amount: Number(amount),
          reason: reason.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; newBalance?: number; error?: string };
      if (!res.ok) throw new Error(data.error || 'Coin adjustment failed.');
      setFeedback({ type: 'ok', text: `Updated balance: ${data.newBalance} Coins (logged in audit trail).` });
      setAmount('');
      setReason('');
      await lookupPlayer();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
        <Coins className="w-5 h-5 text-[#F5C451]" />
        <span>Manual Coins &amp; Player Rewards</span>
      </h2>

      <form onSubmit={lookupPlayer} className="nexus-card rounded-2xl p-5 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          placeholder="Search Player ID (e.g. NX-849201)"
          className="flex-1 min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-4 text-sm font-mono text-white"
        />
        <button type="submit" className="min-h-[44px] px-5 rounded-xl bg-[#FF1E38] text-white text-xs font-semibold cursor-pointer">
          Load Player Wallet
        </button>
      </form>

      {feedback && (
        <div className={`rounded-xl p-3.5 text-xs border ${feedback.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'}`}>
          {feedback.text}
        </div>
      )}

      {targetUser && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-6 nexus-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="font-semibold text-white">{targetUser.inGameName}</p>
                <p className="text-xs font-mono text-slate-400">{targetUser.playerId}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400">Current Balance</p>
                <p className="font-mono text-xl font-bold text-[#F5C451]">{targetUser.balance} Coins</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'manual_credit', label: 'Add Coins' },
                  { id: 'manual_debit', label: 'Deduct Coins' },
                  { id: 'reward', label: 'Send Reward' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer ${
                    mode === m.id ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'bg-[#07090E] border-white/10 text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Coin Amount *</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Audit Reason (required) *</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. MVP Achievement Reward / Chargeback adjustment"
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
              />
            </div>

            <button
              type="button"
              disabled={!amount || Number(amount) <= 0 || reason.trim().length < 3}
              onClick={() => setConfirmOpen(true)}
              className="w-full min-h-[44px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-bold cursor-pointer disabled:opacity-40"
            >
              Review &amp; Confirm Coin Action
            </button>
          </section>

          <section className="lg:col-span-6 nexus-card rounded-2xl p-5 space-y-3">
            <h3 className="font-display text-xl font-bold text-white">Player Coin History</h3>
            {playerTxs.length === 0 ? (
              <p className="text-xs text-slate-400 py-6">No transactions for this player yet.</p>
            ) : (
              <div className="divide-y divide-white/10 max-h-[380px] overflow-y-auto">
                {playerTxs.map((tx) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-white capitalize">{tx.type.replace('_', ' ')}</p>
                      <p className="text-slate-400">{tx.reason}</p>
                    </div>
                    <span className={`font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-[#FF1E38]'}`}>
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} C
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {confirmOpen && targetUser && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#D4AF37]/40">
            <h3 className="font-display text-2xl font-bold text-white">Confirm Immutable Coin Action</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are about to <strong className="text-[#F5C451]">{mode.replace('_', ' ')}</strong>{' '}
              <strong className="text-white">{amount} Coins</strong> for{' '}
              <strong className="text-white">{targetUser.inGameName} ({targetUser.playerId})</strong>.
              <br />
              Reason: <span className="italic">{reason}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="min-h-[42px] rounded-xl bg-white/10 text-xs text-white cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={executeAdjustment} className="min-h-[42px] rounded-xl bg-[#D4AF37] text-black text-xs font-bold cursor-pointer">
                Execute &amp; Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminAllTransactionsView() {
  const [txs, setTxs] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'walletTransactions'), orderBy('createdAt', 'desc')), (snap) => {
      setTxs(snap.docs.map((d) => d.data() as WalletTransaction));
    });
    return () => unsub();
  }, []);

  return (
    <div className="nexus-card rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h2 className="font-display text-2xl font-bold text-white">Global Transaction History</h2>
      </div>
      {txs.length === 0 ? (
        <p className="text-xs text-slate-400 p-8 text-center">No wallet transactions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#121621] text-slate-400 border-b border-white/10">
              <tr>
                <th className="py-3 px-4">Player ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {txs.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-2.5 px-4 font-mono text-white">{tx.playerId || tx.uid.slice(0, 8)}</td>
                  <td className="py-2.5 px-4 capitalize text-slate-300">{tx.type.replace('_', ' ')}</td>
                  <td className="py-2.5 px-4 text-slate-400">{tx.reason}</td>
                  <td className={`py-2.5 px-4 text-right font-mono font-bold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-[#FF1E38]'}`}>
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-200">{tx.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
