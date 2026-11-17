import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Lock,
  Music,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { db } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { DEFAULT_TRACK_TITLE } from '../../shared/MusicPlayerContext';
import {
  runFirestoreImageCheck,
  type FirestoreImageCheckResult,
} from '../../shared/imageUpload';
import {
  activateSongInFirestore,
  deleteSongFromFirestore,
  isSupportedAudioFile,
  loadSongObjectUrl,
  MAX_SONG_SIZE_BYTES,
  switchToBundledDefaultSong,
  uploadSongToFirestore,
} from '../../shared/songStorage';
import {
  toMillis,
  type ArenaSong,
  type MusicSettings,
  type PaymentAccountSettings,
  type SecuritySettings,
} from '../../shared/types';

export function AdminSecuritySettingsView() {
  const { firebaseUser } = useAuth();

  const [depositsEnabled, setDepositsEnabled] = useState(false);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(false);
  const [paidEntriesEnabled, setPaidEntriesEnabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [epTitle, setEpTitle] = useState('');
  const [epNumber, setEpNumber] = useState('');
  const [epInstructions, setEpInstructions] = useState('');
  const [jcTitle, setJcTitle] = useState('');
  const [jcNumber, setJcNumber] = useState('');
  const [jcInstructions, setJcInstructions] = useState('');

  const [songs, setSongs] = useState<ArenaSong[]>([]);
  const [activeSongId, setActiveSongId] = useState<string>('');
  const [trackTitle, setTrackTitle] = useState(DEFAULT_TRACK_TITLE);
  const [licenseConfirmed, setLicenseConfirmed] = useState(true);
  const [setActiveOnUpload, setSetActiveOnUpload] = useState(true);
  const [newSongTitle, setNewSongTitle] = useState('');
  const [songUploadProgress, setSongUploadProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [songError, setSongError] = useState<string | null>(null);
  const [songBusyId, setSongBusyId] = useState<string | null>(null);

  const [previewSongId, setPreviewSongId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<ArenaSong | null>(null);

  const [checkingImageSave, setCheckingImageSave] = useState(false);
  const [imageCheckResult, setImageCheckResult] = useState<FirestoreImageCheckResult | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubSec = onSnapshot(doc(db, 'appSettings', 'security'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as SecuritySettings;
        setDepositsEnabled(Boolean(d.depositsEnabled));
        setWithdrawalsEnabled(Boolean(d.withdrawalsEnabled));
        setPaidEntriesEnabled(Boolean(d.paidEntriesEnabled));
        setMaintenanceMode(Boolean(d.maintenanceMode));
      }
    });

    const unsubPay = onSnapshot(doc(db, 'appSettings', 'paymentAccounts'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as PaymentAccountSettings;
        setEpTitle(d.easyPaisaTitle || '');
        setEpNumber(d.easyPaisaNumber || '');
        setEpInstructions(d.easyPaisaInstructions || '');
        setJcTitle(d.jazzCashTitle || '');
        setJcNumber(d.jazzCashNumber || '');
        setJcInstructions(d.jazzCashInstructions || '');
      }
    });

    const unsubMusic = onSnapshot(doc(db, 'appSettings', 'music'), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as MusicSettings;
        setActiveSongId(typeof d.activeSongId === 'string' ? d.activeSongId : '');
        if (d.trackTitle) setTrackTitle(d.trackTitle);
        if (typeof d.licenseConfirmed === 'boolean') {
          setLicenseConfirmed(d.licenseConfirmed);
        }
      }
    });

    const unsubSongs = onSnapshot(
      query(collection(db, 'songs'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ArenaSong)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setSongs(list);
      },
    );

    return () => {
      unsubSec();
      unsubPay();
      unsubMusic();
      unsubSongs();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleImageSaveCheck = async () => {
    setCheckingImageSave(true);
    setImageCheckResult(null);
    try {
      const res = await runFirestoreImageCheck();
      setImageCheckResult(res);
    } finally {
      setCheckingImageSave(false);
    }
  };

  const saveSecurityFlags = async () => {
    if (!firebaseUser) return;
    await setDoc(doc(db, 'appSettings', 'security'), {
      id: 'security',
      depositsEnabled,
      withdrawalsEnabled,
      paidEntriesEnabled,
      maintenanceMode,
      updatedBy: firebaseUser.uid,
      updatedAt: serverTimestamp(),
    });
    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, 'adminLogs', logId), {
      id: logId,
      actorUid: firebaseUser.uid,
      actorRole: 'owner',
      action: 'SECURITY_FLAGS_UPDATED',
      targetType: 'appSettings',
      targetId: 'security',
      reason: `Deposits:${depositsEnabled} Withdrawals:${withdrawalsEnabled} PaidEntries:${paidEntriesEnabled}`,
      createdAt: serverTimestamp(),
    });
    setMsg('Security feature flags saved.');
  };

  const savePaymentAccounts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    await setDoc(doc(db, 'appSettings', 'paymentAccounts'), {
      id: 'paymentAccounts',
      easyPaisaTitle: epTitle.trim(),
      easyPaisaNumber: epNumber.trim(),
      easyPaisaInstructions: epInstructions.trim(),
      jazzCashTitle: jcTitle.trim(),
      jazzCashNumber: jcNumber.trim(),
      jazzCashInstructions: jcInstructions.trim(),
      updatedBy: firebaseUser.uid,
      updatedAt: serverTimestamp(),
    });
    setMsg('Payment account details saved.');
  };

  const handleUploadNewSong = async (file: File) => {
    setSongError(null);
    setMsg(null);
    if (!isSupportedAudioFile(file)) {
      setSongError('Please select an MP3, M4A, or WAV file.');
      return;
    }
    if (file.size > MAX_SONG_SIZE_BYTES) {
      setSongError(`File is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Max allowed is 8 MB.`);
      return;
    }
    if (!licenseConfirmed) {
      setSongError('Confirm music license & usage rights before uploading.');
      return;
    }

    setSongUploadProgress({ pct: 2, stage: 'Preparing upload...' });
    try {
      const uploaded = await uploadSongToFirestore({
        file,
        title: newSongTitle.trim() || file.name.replace(/\.[^.]+$/, ''),
        licenseConfirmed,
        setActive: setActiveOnUpload,
        onProgress: (pct, stage) => setSongUploadProgress({ pct, stage }),
      });
      setNewSongTitle('');
      setSongUploadProgress(null);
      setMsg(
        uploaded.active
          ? `Uploaded "${uploaded.title}" (${(uploaded.sizeBytes / (1024 * 1024)).toFixed(2)} MB) and set as ACTIVE song.`
          : `Uploaded "${uploaded.title}" (${(uploaded.sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
      );
    } catch (err) {
      setSongUploadProgress(null);
      setSongError(err instanceof Error ? err.message : 'Song upload failed.');
    }
  };

  const handleReplaceSongFile = async (file: File, target: ArenaSong) => {
    setSongError(null);
    setMsg(null);
    if (!isSupportedAudioFile(file)) {
      setSongError('Please select an MP3, M4A, or WAV file.');
      return;
    }
    if (file.size > MAX_SONG_SIZE_BYTES) {
      setSongError(`File is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Max allowed is 8 MB.`);
      return;
    }

    setSongBusyId(target.id);
    setSongUploadProgress({ pct: 2, stage: `Replacing "${target.title}"...` });
    try {
      const updated = await uploadSongToFirestore({
        file,
        title: target.title,
        licenseConfirmed: target.licenseConfirmed,
        setActive: target.active,
        replaceSong: target,
        onProgress: (pct, stage) => setSongUploadProgress({ pct, stage }),
      });
      setSongUploadProgress(null);
      setMsg(`Replaced audio for "${updated.title}" without re-encoding.`);
    } catch (err) {
      setSongUploadProgress(null);
      setSongError(err instanceof Error ? err.message : 'Song replacement failed.');
    } finally {
      setSongBusyId(null);
      replaceTargetRef.current = null;
    }
  };

  const handleSetActiveSong = async (song: ArenaSong) => {
    setSongError(null);
    setMsg(null);
    setSongBusyId(song.id);
    try {
      await activateSongInFirestore(song.id);
      setMsg(`"${song.title}" is now the ACTIVE background song.`);
    } catch (err) {
      setSongError(err instanceof Error ? err.message : 'Could not activate song.');
    } finally {
      setSongBusyId(null);
    }
  };

  const handleUseBundledDefault = async () => {
    setSongError(null);
    setMsg(null);
    setSongBusyId('bundled_default');
    try {
      await switchToBundledDefaultSong(DEFAULT_TRACK_TITLE, licenseConfirmed);
      setMsg('Switched ACTIVE song back to bundled theme (arena-theme.m4a).');
    } catch (err) {
      setSongError(err instanceof Error ? err.message : 'Could not switch to default track.');
    } finally {
      setSongBusyId(null);
    }
  };

  const handleDeleteSong = async (song: ArenaSong) => {
    setSongError(null);
    setMsg(null);
    setSongBusyId(song.id);
    try {
      if (previewSongId === song.id) {
        previewAudioRef.current?.pause();
        setPreviewSongId(null);
      }
      await deleteSongFromFirestore(song);
      setMsg(`Deleted song "${song.title}".`);
    } catch (err) {
      setSongError(err instanceof Error ? err.message : 'Failed to delete song.');
    } finally {
      setSongBusyId(null);
    }
  };

  const handleTogglePreview = async (song: ArenaSong) => {
    if (previewSongId === song.id) {
      previewAudioRef.current?.pause();
      setPreviewSongId(null);
      return;
    }
    setSongError(null);
    setSongBusyId(song.id);
    try {
      const loaded = await loadSongObjectUrl(song.id, song.revision);
      setPreviewUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return loaded.objectUrl;
      });
      setPreviewSongId(song.id);
      window.setTimeout(() => {
        if (previewAudioRef.current) {
          previewAudioRef.current.src = loaded.objectUrl;
          previewAudioRef.current.play().catch(() => {});
        }
      }, 30);
    } catch (err) {
      setSongError(err instanceof Error ? err.message : 'Could not load audio preview.');
    } finally {
      setSongBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-[#F5C451]" />
        <span>Security Settings (Owner Only)</span>
      </h2>

      {msg && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">{msg}</div>}

      {/* Image Save Check (Cloud Firestore images collection) */}
      <section className="nexus-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-[#F5C451] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-xl font-bold text-white">Image Save Check</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Writes a tiny 67-byte PNG test document to Cloud Firestore <code className="font-mono text-[#F5C451]">images</code>, verifies read-back, and deletes it immediately.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={checkingImageSave}
            onClick={handleImageSaveCheck}
            className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] disabled:opacity-50 text-black text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Activity className="w-4 h-4" />
            <span>{checkingImageSave ? 'Testing Image Save...' : 'Image Save Check'}</span>
          </button>
        </div>

        {imageCheckResult && (
          <div
            className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
              imageCheckResult.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span className="inline-flex items-center gap-1.5">
                {imageCheckResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#FF1E38] shrink-0" />
                )}
                <span>
                  {imageCheckResult.ok
                    ? 'PASS — Firestore Image Save, Read & Delete Operational'
                    : `FAIL — ${imageCheckResult.errorCode || 'firestore/save-failed'}`}
                </span>
              </span>
              <span className="font-mono tabular-nums text-[11px] opacity-80">{imageCheckResult.durationMs} ms</span>
            </div>
            <p className="break-words">{imageCheckResult.errorMessage || imageCheckResult.details}</p>
            {imageCheckResult.imageId && (
              <p className="font-mono text-[11px] opacity-75 break-all">Document ID: images/{imageCheckResult.imageId}</p>
            )}
          </div>
        )}
      </section>

      {/* Feature Flags */}
      <section className="nexus-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-[#FF1E38] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display text-xl font-bold text-white">Real-Money &amp; Paid Entry Controls</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Keep these feature flags disabled until payment-provider compliance and local legal requirements are confirmed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { label: 'Enable Real-Money Deposits', val: depositsEnabled, set: setDepositsEnabled },
            { label: 'Enable Withdrawals', val: withdrawalsEnabled, set: setWithdrawalsEnabled },
            { label: 'Enable Paid Tournament Entries', val: paidEntriesEnabled, set: setPaidEntriesEnabled },
            { label: 'Arena Maintenance Mode', val: maintenanceMode, set: setMaintenanceMode },
          ].map((item) => (
            <label
              key={item.label}
              className="rounded-xl bg-[#07090E] border border-white/10 p-3.5 flex items-center justify-between cursor-pointer"
            >
              <span className="font-medium text-white">{item.label}</span>
              <input
                type="checkbox"
                checked={item.val}
                onChange={(e) => item.set(e.target.checked)}
                className="w-4 h-4 accent-[#FF1E38]"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={saveSecurityFlags}
          className="min-h-[42px] px-5 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
        >
          Save Feature Flags
        </button>
      </section>

      {/* EasyPaisa & JazzCash Instructions */}
      <form onSubmit={savePaymentAccounts} className="nexus-card rounded-2xl p-5 sm:p-6 space-y-4 text-xs">
        <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#F5C451]" />
          <span>EasyPaisa &amp; JazzCash Payment Instructions</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2.5 rounded-xl bg-[#07090E] border border-white/10 p-4">
            <p className="font-semibold text-[#F5C451]">EasyPaisa Account</p>
            <input
              type="text"
              value={epTitle}
              onChange={(e) => setEpTitle(e.target.value)}
              placeholder="Account Title"
              className="w-full min-h-[40px] rounded-lg bg-[#0D1017] border border-white/10 px-3 text-white"
            />
            <input
              type="text"
              value={epNumber}
              onChange={(e) => setEpNumber(e.target.value)}
              placeholder="03XX-XXXXXXX"
              className="w-full min-h-[40px] rounded-lg bg-[#0D1017] border border-white/10 px-3 font-mono text-white"
            />
            <textarea
              rows={2}
              value={epInstructions}
              onChange={(e) => setEpInstructions(e.target.value)}
              placeholder="Deposit instructions for players..."
              className="w-full rounded-lg bg-[#0D1017] border border-white/10 p-2.5 text-white"
            />
          </div>

          <div className="space-y-2.5 rounded-xl bg-[#07090E] border border-white/10 p-4">
            <p className="font-semibold text-[#F5C451]">JazzCash Account</p>
            <input
              type="text"
              value={jcTitle}
              onChange={(e) => setJcTitle(e.target.value)}
              placeholder="Account Title"
              className="w-full min-h-[40px] rounded-lg bg-[#0D1017] border border-white/10 px-3 text-white"
            />
            <input
              type="text"
              value={jcNumber}
              onChange={(e) => setJcNumber(e.target.value)}
              placeholder="03XX-XXXXXXX"
              className="w-full min-h-[40px] rounded-lg bg-[#0D1017] border border-white/10 px-3 font-mono text-white"
            />
            <textarea
              rows={2}
              value={jcInstructions}
              onChange={(e) => setJcInstructions(e.target.value)}
              placeholder="Deposit instructions for players..."
              className="w-full rounded-lg bg-[#0D1017] border border-white/10 p-2.5 text-white"
            />
          </div>
        </div>
        <button type="submit" className="min-h-[42px] px-5 rounded-xl bg-[#D4AF37] text-black font-bold cursor-pointer">
          Save Payment Accounts
        </button>
      </form>

      {/* Owner-Controlled Background Music Library (Firestore Chunks, zero re-encoding) */}
      <section className="nexus-card rounded-2xl p-5 sm:p-6 space-y-5 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Music className="w-4 h-4 text-[#FF1E38]" />
              <span>Background Music</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload MP3, M4A, or WAV songs (up to 8 MB). Stored unmodified in Firestore chunks and cached on player devices.
            </p>
          </div>
          {activeSongId && (
            <button
              type="button"
              disabled={songBusyId === 'bundled_default'}
              onClick={handleUseBundledDefault}
              className="min-h-[38px] px-3.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold shrink-0 cursor-pointer disabled:opacity-50"
            >
              Use Bundled Default
            </button>
          )}
        </div>

        {/* Hidden preview audio element & file pickers */}
        <audio
          ref={previewAudioRef}
          onEnded={() => setPreviewSongId(null)}
          className="hidden"
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleUploadNewSong(f);
          }}
          className="hidden"
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const target = replaceTargetRef.current;
            e.target.value = '';
            if (f && target) void handleReplaceSongFile(f, target);
          }}
          className="hidden"
        />

        {/* Upload New Song Box */}
        <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1">Song Title (optional — defaults to filename)</label>
              <input
                type="text"
                maxLength={140}
                value={newSongTitle}
                onChange={(e) => setNewSongTitle(e.target.value)}
                placeholder="e.g. Arena Champion Phonk"
                className="w-full min-h-[40px] rounded-xl bg-[#0D1017] border border-white/10 px-3.5 text-white"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setActiveOnUpload}
                  onChange={(e) => setSetActiveOnUpload(e.target.checked)}
                  className="accent-[#FF1E38]"
                />
                <span>Set as ACTIVE song immediately after upload</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={licenseConfirmed}
                  onChange={(e) => setLicenseConfirmed(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>I confirm music license and usage rights.</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={Boolean(songUploadProgress)}
              onClick={() => uploadInputRef.current?.click()}
              className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] disabled:opacity-50 text-black font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{songUploadProgress ? 'Uploading Song...' : 'Upload Song (MP3 / M4A / WAV, max 8 MB)'}</span>
            </button>
          </div>

          {songUploadProgress && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>{songUploadProgress.stage}</span>
                <span className="font-mono font-bold text-[#F5C451]">{songUploadProgress.pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#FF1E38] to-[#F5C451] transition-[width] duration-200"
                  style={{ width: `${songUploadProgress.pct}%` }}
                />
              </div>
            </div>
          )}

          {songError && (
            <div className="rounded-xl border border-[#FF1E38]/40 bg-[#FF1E38]/10 p-3 text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#FF1E38] shrink-0 mt-0.5" />
              <span>{songError}</span>
            </div>
          )}
        </div>

        {/* Uploaded Song Library */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            <span>Uploaded Songs ({songs.length})</span>
            <span>Active Track: <strong className="text-[#F5C451]">{trackTitle}</strong></span>
          </div>

          {songs.length === 0 ? (
            <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 text-slate-400">
              No custom songs uploaded yet. The player app is currently using the bundled default track (<code className="text-[#F5C451]">arena-theme.m4a</code>).
            </div>
          ) : (
            <div className="space-y-2.5">
              {songs.map((song) => {
                const isActive = song.active || activeSongId === song.id;
                const isBusy = songBusyId === song.id;
                const isPreviewing = previewSongId === song.id;
                return (
                  <div
                    key={song.id}
                    className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10' : 'border-white/10 bg-[#07090E]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm truncate">{song.title}</span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded bg-[#D4AF37] text-black text-[10px] font-bold uppercase tracking-wider">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        {song.fileName} · {(song.sizeBytes / (1024 * 1024)).toFixed(2)} MB · {song.chunkCount} chunks · v{song.revision || 1}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTogglePreview(song)}
                        className="min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isPreviewing ? <Square className="w-3.5 h-3.5 text-[#FF1E38]" /> : <Play className="w-3.5 h-3.5 text-[#F5C451]" />}
                        <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
                      </button>

                      {!isActive && (
                        <button
                          type="button"
                          disabled={isBusy || Boolean(songUploadProgress)}
                          onClick={() => void handleSetActiveSong(song)}
                          className="min-h-[36px] px-3 rounded-lg bg-[#D4AF37] hover:bg-[#F5C451] text-black font-bold cursor-pointer disabled:opacity-50"
                        >
                          Set Active
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy || Boolean(songUploadProgress)}
                        onClick={() => {
                          replaceTargetRef.current = song;
                          replaceInputRef.current?.click();
                        }}
                        className="min-h-[36px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Replace</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy || Boolean(songUploadProgress)}
                        onClick={() => void handleDeleteSong(song)}
                        className="min-h-[36px] px-3 rounded-lg border border-[#FF1E38]/35 bg-[#FF1E38]/10 hover:bg-[#FF1E38]/20 text-red-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
