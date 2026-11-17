import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  Coins,
  Upload,
  Lock,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { isImageFile, useFirestoreImageUpload } from '../../shared/imageUpload';
import { UploadStatusBanner } from '../../shared/UploadStatusBanner';
import {
  COIN_PACKAGES,
  formatTimestamp,
  toMillis,
  type DepositRequest,
  type PaymentAccountSettings,
  type SecuritySettings,
  type WalletTransaction,
  type WithdrawalRequest,
} from '../../shared/types';

function toSortMillis(ts: unknown): number {
  const ms = toMillis(ts);
  return ms > 0 ? ms : Date.now() + 1000;
}

export function WalletPage() {
  const { firebaseUser, profile, emailVerified } = useAuth();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountSettings | null>(null);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  // Deposit Form
  const [selectedPkgId, setSelectedPkgId] = useState<string>(COIN_PACKAGES[0].id);
  const [method, setMethod] = useState<'EasyPaisa' | 'JazzCash'>('EasyPaisa');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingReqId, setPendingReqId] = useState<string | null>(null);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  const {
    status: uploadStatus,
    result: uploadResult,
    startUpload,
    retry: retryUpload,
    reset: resetUpload,
  } = useFirestoreImageUpload();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const submittingDepositRef = useRef<boolean>(false);

  // Withdrawal Form
  const [wdCoins, setWdCoins] = useState('200');
  const [wdMethod, setWdMethod] = useState<'EasyPaisa' | 'JazzCash'>('EasyPaisa');
  const [wdAccountNumber, setWdAccountNumber] = useState('');
  const [wdAccountTitle, setWdAccountTitle] = useState('');
  const [submittingWd, setSubmittingWd] = useState(false);

  const [msg, setMsg] = useState<{ type: 'error' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsubSec = onSnapshot(
      doc(db, 'appSettings', 'security'),
      (snap) => {
        setSecurity(snap.exists() ? (snap.data() as SecuritySettings) : null);
      },
      () => {},
    );

    const unsubDep = onSnapshot(
      query(collection(db, 'depositRequests'), where('uid', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as DepositRequest)
          .sort((a, b) => toSortMillis(b.createdAt) - toSortMillis(a.createdAt));
        setDeposits(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'depositRequests'),
    );

    const unsubWd = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('uid', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as WithdrawalRequest)
          .sort((a, b) => toSortMillis(b.createdAt) - toSortMillis(a.createdAt));
        setWithdrawals(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawalRequests'),
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'walletTransactions'), where('uid', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as WalletTransaction)
          .sort((a, b) => toSortMillis(b.createdAt) - toSortMillis(a.createdAt));
        setTransactions(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'walletTransactions'),
    );

    return () => {
      unsubSec();
      unsubDep();
      unsubWd();
      unsubTx();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !security?.depositsEnabled) {
      setPaymentAccounts(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'appSettings', 'paymentAccounts'),
      (snap) => setPaymentAccounts(snap.exists() ? (snap.data() as PaymentAccountSettings) : null),
      () => setPaymentAccounts(null),
    );
    return () => unsub();
  }, [firebaseUser, security?.depositsEnabled]);

  const selectedPkg = COIN_PACKAGES.find((p) => p.id === selectedPkgId) || COIN_PACKAGES[0];

  const resetScreenshotUpload = () => {
    resetUpload();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setScreenshotFile(null);
    setPendingReqId(null);
  };

  const handleScreenshotSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setMsg(null);

    if (!isImageFile(file)) {
      setMsg({ type: 'error', text: 'Please select a valid payment screenshot image (PNG, JPG, or WebP).' });
      return;
    }
    if (!firebaseUser) {
      setMsg({ type: 'error', text: 'Sign in before uploading a deposit screenshot.' });
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextPreview = URL.createObjectURL(file);
    previewUrlRef.current = nextPreview;

    const reqId = `dep_${firebaseUser.uid.slice(0, 6)}_${Date.now()}`;
    setPreviewUrl(nextPreview);
    setScreenshotFile(file);
    setPendingReqId(reqId);

    void startUpload({
      file,
      purpose: 'deposit',
      maxDimension: 1280,
      initialQuality: 0.72,
      targetMaxBytes: 295 * 1024,
    }).catch(() => {
      // Error details are captured cleanly in uploadStatus for inline retry UI
    });
  };

  const handleRetryUpload = () => {
    void retryUpload().catch(() => {});
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDepositRef.current) return;
    if (!firebaseUser || !profile) return;
    setMsg(null);

    if (!emailVerified) {
      setMsg({ type: 'error', text: 'Verify your email address before submitting a deposit.' });
      return;
    }
    if (!security?.depositsEnabled) {
      setMsg({ type: 'error', text: 'Deposits are currently disabled in Security Settings.' });
      return;
    }
    if (uploadStatus.state === 'compressing' || uploadStatus.state === 'uploading') {
      setMsg({ type: 'error', text: 'Please wait a moment while your screenshot finishes uploading.' });
      return;
    }
    if (!uploadResult?.imageId || !pendingReqId) {
      setMsg({ type: 'error', text: 'Please select your EasyPaisa/JazzCash payment screenshot and wait for compression & save.' });
      return;
    }

    submittingDepositRef.current = true;
    setSubmittingDeposit(true);
    try {
      await setDoc(doc(db, 'depositRequests', pendingReqId), {
        id: pendingReqId,
        uid: firebaseUser.uid,
        playerId: profile.playerId,
        inGameName: profile.inGameName,
        amountPkr: selectedPkg.amountPkr,
        coins: selectedPkg.coins,
        method,
        screenshotImageId: uploadResult.imageId,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetScreenshotUpload();
      if (statusFilter === 'approved' || statusFilter === 'rejected') {
        setStatusFilter('all');
      }
      setMsg({
        type: 'ok',
        text: 'Deposit request submitted! It is now Pending for Owner Admin verification.',
      });
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Deposit submission failed.' });
    } finally {
      submittingDepositRef.current = false;
      setSubmittingDeposit(false);
    }
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) return;
    setMsg(null);

    if (!emailVerified) {
      setMsg({ type: 'error', text: 'Verify your email address first.' });
      return;
    }
    if (!security?.withdrawalsEnabled) {
      setMsg({ type: 'error', text: 'Withdrawals are currently disabled by Security Settings.' });
      return;
    }

    const coinsNum = Math.floor(Number(wdCoins));
    if (coinsNum < 100) {
      setMsg({ type: 'error', text: 'Minimum withdrawal is 100 Coins.' });
      return;
    }
    if (coinsNum > profile.balance) {
      setMsg({ type: 'error', text: 'Insufficient coin balance.' });
      return;
    }

    setSubmittingWd(true);
    try {
      const reqId = `wd_${firebaseUser.uid.slice(0, 6)}_${Date.now()}`;
      await setDoc(doc(db, 'withdrawalRequests', reqId), {
        id: reqId,
        uid: firebaseUser.uid,
        playerId: profile.playerId,
        inGameName: profile.inGameName,
        coinsAmount: coinsNum,
        pkrAmount: Math.floor(coinsNum * 0.8),
        method: wdMethod,
        accountNumber: wdAccountNumber.trim().slice(0, 32),
        accountTitle: wdAccountTitle.trim().slice(0, 64),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setWdAccountNumber('');
      setWdAccountTitle('');
      setMsg({ type: 'ok', text: 'Withdrawal request submitted for Owner Admin review.' });
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Withdrawal submission failed.' });
    } finally {
      setSubmittingWd(false);
    }
  };

  const filteredDeposits = deposits.filter((d) => statusFilter === 'all' || d.status === statusFilter);
  const filteredWithdrawals = withdrawals.filter((w) => statusFilter === 'all' || w.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Wallet Hero Card */}
      <section className="nexus-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#0D1017] via-[#10131C] to-[#1A1308]">
        <div>
          <p className="text-xs text-slate-400">Available Arena Balance</p>
          <div className="flex items-baseline gap-2.5 mt-1">
            <Coins className="w-6 h-6 text-[#F5C451] self-center" />
            <span className="font-display text-5xl font-bold font-mono tabular-nums text-white">
              {profile?.balance ?? 0}
            </span>
            <span className="text-sm font-bold text-[#F5C451]">COINS</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Coins are credited exclusively after Admin verification of real payments or verified match prizes.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#07090E] border border-white/10 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveTab('deposit')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'deposit' ? 'bg-[#D4AF37] text-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Buy Coins</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('withdraw')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'withdraw' ? 'bg-[#FF1E38] text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            <span>Withdraw</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === 'history' ? 'bg-white text-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>Ledger</span>
          </button>
        </div>
      </section>

      {msg && (
        <div
          className={`rounded-xl border p-4 text-xs flex items-start gap-2.5 ${
            msg.type === 'error'
              ? 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {msg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {activeTab === 'deposit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 nexus-card rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-display text-2xl font-bold text-white">Select Coin Package</h3>
              <p className="text-xs text-slate-400">EasyPaisa &amp; JazzCash manual screenshot verification</p>
            </div>

            {!security?.depositsEnabled ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-5 flex items-start gap-3 text-xs text-amber-200">
                <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-white">Deposits Currently Disabled</p>
                  <p className="mt-1 leading-relaxed">
                    Real-money deposits are gated behind the server-side Security Settings feature flag until payment provider and regional compliance verification are enabled by the Owner.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitDeposit} className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {COIN_PACKAGES.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`text-left rounded-xl p-3.5 border transition-colors cursor-pointer ${
                        selectedPkgId === pkg.id
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15'
                          : 'border-white/10 bg-[#07090E] hover:border-white/25'
                      }`}
                    >
                      <p className="font-mono tabular-nums text-lg font-bold text-[#F5C451]">{pkg.coins} Coins</p>
                      <p className="text-xs font-semibold text-white mt-0.5">Rs. {pkg.amountPkr.toLocaleString()}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{pkg.bonusLabel}</p>
                    </button>
                  ))}
                </div>

                {/* Method + Instructions */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['EasyPaisa', 'JazzCash'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={`flex-1 min-h-[42px] rounded-xl text-xs font-semibold border cursor-pointer ${
                          method === m
                            ? 'bg-[#FF1E38] border-[#FF1E38] text-white'
                            : 'bg-[#07090E] border-white/10 text-slate-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 text-xs space-y-1.5">
                    <p className="font-semibold text-[#F5C451]">{method} Account Details</p>
                    {paymentAccounts ? (
                      <>
                        <p className="text-slate-300">
                          Account Title:{' '}
                          <span className="text-white font-semibold">
                            {method === 'EasyPaisa' ? paymentAccounts.easyPaisaTitle || 'Not set' : paymentAccounts.jazzCashTitle || 'Not set'}
                          </span>
                        </p>
                        <p className="text-slate-300">
                          Account Number:{' '}
                          <span className="font-mono text-white font-semibold">
                            {method === 'EasyPaisa' ? paymentAccounts.easyPaisaNumber || 'Not set' : paymentAccounts.jazzCashNumber || 'Not set'}
                          </span>
                        </p>
                        <p className="text-slate-400 pt-1">
                          {method === 'EasyPaisa' ? paymentAccounts.easyPaisaInstructions : paymentAccounts.jazzCashInstructions}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-400">Admin has not configured payment account details yet.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Payment Screenshot *
                  </label>

                  <label className="w-full min-h-[46px] rounded-xl bg-[#07090E] border border-dashed border-white/20 hover:border-[#D4AF37] px-3.5 flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
                    <span className="flex items-center gap-2 truncate">
                      <Upload className="w-4 h-4 text-[#F5C451] shrink-0" />
                      <span className="truncate">
                        {screenshotFile ? screenshotFile.name : 'Select payment screenshot (compresses & saves immediately)'}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold text-[#F5C451] shrink-0">
                      {screenshotFile ? 'Change' : 'Choose'}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshotSelected}
                    />
                  </label>

                  {previewUrl && (
                    <div className="rounded-xl bg-[#07090E] border border-white/10 p-3 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-20 h-24 rounded-lg overflow-hidden bg-black/70 border border-white/10 shrink-0">
                          <img
                            src={previewUrl}
                            alt="Selected payment screenshot preview"
                            className="w-full h-full object-contain"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-white truncate">
                              {screenshotFile?.name || 'Payment screenshot'}
                            </p>
                            <button
                              type="button"
                              onClick={resetScreenshotUpload}
                              aria-label="Remove screenshot"
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <UploadStatusBanner
                            status={uploadStatus}
                            compact
                            successText="Screenshot compressed & saved! Tap Submit to send your request."
                            onRetry={handleRetryUpload}
                            onChooseAnother={() => fileInputRef.current?.click()}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={
                    submittingDeposit ||
                    uploadStatus.state === 'compressing' ||
                    uploadStatus.state === 'uploading' ||
                    uploadStatus.state === 'error' ||
                    !uploadResult?.imageId
                  }
                  className="w-full min-h-[48px] rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingDeposit
                    ? 'Submitting Request...'
                    : uploadStatus.state === 'compressing'
                      ? 'Compressing Screenshot...'
                      : uploadStatus.state === 'uploading'
                        ? `Saving Screenshot (${uploadStatus.progress}%)...`
                        : uploadStatus.state === 'error'
                          ? 'Save Failed — Retry or Choose Another Image'
                          : `Submit Rs. ${selectedPkg.amountPkr} -> ${selectedPkg.coins} Coins Request`}
                </button>
              </form>
            )}
          </section>

          {/* Deposit History */}
          <section className="lg:col-span-5 nexus-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold text-white">Deposit Requests</h3>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-lg bg-[#07090E] border border-white/10 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {filteredDeposits.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No deposit requests found.</p>
            ) : (
              <div className="divide-y divide-white/10 max-h-[440px] overflow-y-auto">
                {filteredDeposits.map((d) => (
                  <div key={d.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {d.coins} Coins · Rs. {d.amountPkr}
                      </span>
                      <span
                        className={`font-semibold capitalize ${
                          d.status === 'approved'
                            ? 'text-emerald-400'
                            : d.status === 'rejected'
                              ? 'text-[#FF1E38]'
                              : 'text-[#F5C451]'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {d.method}
                    </p>
                    {d.rejectionReason && (
                      <p className="text-[11px] text-[#FF1E38]">Reason: {d.rejectionReason}</p>
                    )}
                    <p className="text-[10px] text-slate-500">{formatTimestamp(d.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-6 nexus-card rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="font-display text-2xl font-bold text-white">Request Withdrawal</h3>
            {!security?.withdrawalsEnabled ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-5 flex items-start gap-3 text-xs text-amber-200">
                <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-white">Withdrawals Currently Disabled</p>
                  <p className="mt-1 leading-relaxed">
                    Payouts remain behind the server-side Security Settings feature flag until authorized by Owner Admin.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitWithdrawal} className="space-y-3.5">
                <div className="flex gap-2">
                  {(['EasyPaisa', 'JazzCash'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setWdMethod(m)}
                      className={`flex-1 min-h-[42px] rounded-xl text-xs font-semibold border cursor-pointer ${
                        wdMethod === m ? 'bg-[#FF1E38] border-[#FF1E38] text-white' : 'bg-[#07090E] border-white/10 text-slate-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Coins to Withdraw (min 100) *</label>
                  <input
                    type="number"
                    min={100}
                    max={profile?.balance || 100}
                    required
                    value={wdCoins}
                    onChange={(e) => setWdCoins(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Account Title *</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={wdAccountTitle}
                    onChange={(e) => setWdAccountTitle(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">{wdMethod} Account Number *</label>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={32}
                    value={wdAccountNumber}
                    onChange={(e) => setWdAccountNumber(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingWd}
                  className="w-full min-h-[46px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                >
                  {submittingWd ? 'Submitting...' : 'Submit Withdrawal Request'}
                </button>
              </form>
            )}
          </section>

          <section className="lg:col-span-6 nexus-card rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-xl font-bold text-white">Withdrawal History</h3>
            {filteredWithdrawals.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No withdrawal requests yet.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {filteredWithdrawals.map((w) => (
                  <div key={w.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {w.coinsAmount} Coins (PKR {w.pkrAmount})
                      </span>
                      <span
                        className={`font-semibold capitalize ${
                          w.status === 'approved'
                            ? 'text-emerald-400'
                            : w.status === 'rejected'
                              ? 'text-[#FF1E38]'
                              : 'text-[#F5C451]'
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {w.method} · {w.accountNumber} ({w.accountTitle})
                    </p>
                    {w.rejectionReason && <p className="text-[11px] text-[#FF1E38]">Reason: {w.rejectionReason}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'history' && (
        <section className="nexus-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-display text-xl font-bold text-white">Wallet Transaction History</h3>
          </div>
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-400 p-8 text-center">No wallet transactions yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-white capitalize">{tx.type.replace('_', ' ')}</p>
                    <p className="text-slate-400 mt-0.5">{tx.reason}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{formatTimestamp(tx.createdAt)}</p>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <p className={`text-sm font-bold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-[#FF1E38]'}`}>
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} C
                    </p>
                    <p className="text-[11px] text-slate-400">Bal: {tx.balanceAfter} C</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
