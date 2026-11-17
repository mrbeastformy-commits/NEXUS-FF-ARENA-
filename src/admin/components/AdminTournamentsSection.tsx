import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Plus, Trash2, KeyRound, Trophy, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import { UploadStatusBanner } from '../../shared/UploadStatusBanner';
import { isImageFile, useFirestoreImageUpload } from '../../shared/imageUpload';
import {
  TOURNAMENT_CATEGORIES,
  type Banner,
  type Tournament,
  type TournamentCategory,
  type TournamentWinner,
  type UserPublicProfile,
} from '../../shared/types';

export function AdminTournamentsView() {
  const { firebaseUser, role } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TournamentCategory>('CS Ranked');
  const [entryFee, setEntryFee] = useState('0');
  const [prizePool, setPrizePool] = useState('0');
  const [prizeDistribution, setPrizeDistribution] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('48');
  const [teamSize, setTeamSize] = useState('4');
  const [startTime, setStartTime] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [status, setStatus] = useState<Tournament['status']>('open');
  const [rulesText, setRulesText] = useState('');
  const [thumbnailImageId, setThumbnailImageId] = useState('');
  const [coverImageId, setCoverImageId] = useState('');

  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const thumbUpload = useFirestoreImageUpload();
  const coverUpload = useFirestoreImageUpload();

  // Protected Room Credentials
  const [roomTourneyId, setRoomTourneyId] = useState<string | null>(null);
  const [roomIdVal, setRoomIdVal] = useState('');
  const [roomPasswordVal, setRoomPasswordVal] = useState('');
  const [roomNotes, setRoomNotes] = useState('');

  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'tournaments'), orderBy('createdAt', 'desc')), (snap) => {
      setTournaments(snap.docs.map((d) => d.data() as Tournament));
    });
    return () => unsub();
  }, []);

  const handleThumbSelect = async (file: File) => {
    if (!isImageFile(file)) {
      setMsg('Please choose an image file for the tournament thumbnail.');
      return;
    }
    setMsg(null);
    try {
      const uploaded = await thumbUpload.startUpload({
        file,
        purpose: 'tournament',
        maxDimension: 1280,
        targetMaxBytes: 295 * 1024,
      });
      setThumbnailImageId(uploaded.imageId);
    } catch {
      // Error state and real error code are displayed in UploadStatusBanner
    }
  };

  const handleCoverSelect = async (file: File) => {
    if (!isImageFile(file)) {
      setMsg('Please choose an image file for the tournament cover.');
      return;
    }
    setMsg(null);
    try {
      const uploaded = await coverUpload.startUpload({
        file,
        purpose: 'tournament',
        maxDimension: 1280,
        targetMaxBytes: 295 * 1024,
      });
      setCoverImageId(uploaded.imageId);
    } catch {
      // Error state and real error code are displayed in UploadStatusBanner
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('CS Ranked');
    setEntryFee('0');
    setPrizePool('0');
    setPrizeDistribution('');
    setMaxPlayers('48');
    setTeamSize('4');
    setStartTime('');
    setRegistrationDeadline('');
    setStatus('open');
    setRulesText('');
    setThumbnailImageId('');
    setCoverImageId('');
    thumbUpload.reset();
    coverUpload.reset();
  };

  const loadForEdit = (t: Tournament) => {
    setEditingId(t.id);
    setTitle(t.title);
    setCategory(t.category);
    setEntryFee(String(t.entryFee));
    setPrizePool(String(t.prizePool));
    setPrizeDistribution(t.prizeDistribution || '');
    setMaxPlayers(String(t.maxPlayers));
    setTeamSize(String(t.teamSize));
    setStartTime(t.startTime || '');
    setRegistrationDeadline(t.registrationDeadline || '');
    setStatus(t.status);
    setRulesText(t.rulesText || '');
    setThumbnailImageId(t.thumbnailImageId || '');
    setCoverImageId(t.coverImageId || '');
    thumbUpload.reset();
    coverUpload.reset();
  };

  const isUploadingMedia =
    thumbUpload.status.state === 'compressing' ||
    thumbUpload.status.state === 'uploading' ||
    coverUpload.status.state === 'compressing' ||
    coverUpload.status.state === 'uploading';

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || isUploadingMedia) return;
    setSaving(true);
    setMsg(null);
    try {
      const tid = editingId || `trn_${Date.now()}`;
      const payload = {
        id: tid,
        title: title.trim().slice(0, 100),
        category,
        thumbnailImageId: thumbnailImageId.trim().slice(0, 128),
        coverImageId: coverImageId.trim().slice(0, 128),
        entryFee: Math.max(0, Number(entryFee || 0)),
        prizePool: Math.max(0, Number(prizePool || 0)),
        prizeDistribution: prizeDistribution.trim().slice(0, 300),
        registrationDeadline: registrationDeadline || new Date(Date.now() + 86400000).toISOString(),
        startTime: startTime || new Date(Date.now() + 172800000).toISOString(),
        maxPlayers: Math.min(1000, Math.max(2, Number(maxPlayers || 48))),
        teamSize: Math.min(4, Math.max(1, Number(teamSize || 1))),
        status,
        rulesText: rulesText.trim().slice(0, 2000),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'tournaments', tid), payload);
      } else {
        await setDoc(doc(db, 'tournaments', tid), {
          ...payload,
          registeredCount: 0,
          resultsAnnounced: false,
          winners: [],
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
      }

      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, 'adminLogs', logId), {
        id: logId,
        actorUid: firebaseUser.uid,
        actorRole: role === 'owner' ? 'owner' : 'moderator',
        action: editingId ? 'TOURNAMENT_UPDATED' : 'TOURNAMENT_CREATED',
        targetType: 'tournament',
        targetId: tid,
        reason: payload.title,
        createdAt: serverTimestamp(),
      });

      resetForm();
      setMsg(editingId ? 'Tournament updated.' : 'Tournament created.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const openRoomCredsEditor = async (tid: string) => {
    setRoomTourneyId(tid);
    const snap = await getDoc(doc(db, 'roomCredentials', tid));
    if (snap.exists()) {
      const d = snap.data();
      setRoomIdVal(d.roomId || '');
      setRoomPasswordVal(d.roomPassword || '');
      setRoomNotes(d.notes || '');
    } else {
      setRoomIdVal('');
      setRoomPasswordVal('');
      setRoomNotes('');
    }
  };

  const handleSaveRoomCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !roomTourneyId) return;
    try {
      await setDoc(doc(db, 'roomCredentials', roomTourneyId), {
        tournamentId: roomTourneyId,
        roomId: roomIdVal.trim().slice(0, 64),
        roomPassword: roomPasswordVal.trim().slice(0, 64),
        notes: roomNotes.trim().slice(0, 500),
        updatedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, 'adminLogs', logId), {
        id: logId,
        actorUid: firebaseUser.uid,
        actorRole: role === 'owner' ? 'owner' : 'moderator',
        action: 'ROOM_CREDENTIALS_UPDATED',
        targetType: 'roomCredentials',
        targetId: roomTourneyId,
        reason: 'Updated protected Room ID and Password',
        createdAt: serverTimestamp(),
      });
      setRoomTourneyId(null);
      setMsg('Protected Room ID & Password saved.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save room credentials.');
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 text-xs text-white">
          {msg}
        </div>
      )}

      {/* Create / Edit Form */}
      <form onSubmit={handleSaveTournament} className="nexus-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-white">
            {editingId ? 'Edit Tournament' : 'Create Tournament'}
          </h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-xs text-[#F5C451] underline cursor-pointer">
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-300 mb-1">Tournament Name *</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bermuda Pro Cup Season 1"
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TournamentCategory)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
            >
              {TOURNAMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Entry Fee (Coins)</label>
            <input
              type="number"
              min={0}
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Prize Pool (Coins)</label>
            <input
              type="number"
              min={0}
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Tournament['status'])}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Max Players</label>
            <input
              type="number"
              min={2}
              max={1000}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Team Size (1-4)</label>
            <input
              type="number"
              min={1}
              max={4}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Start Date &amp; Time</label>
            <input
              type="datetime-local"
              value={startTime.slice(0, 16)}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Registration Deadline</label>
            <input
              type="datetime-local"
              value={registrationDeadline.slice(0, 16)}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-300">Thumbnail Image</label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleThumbSelect(f);
              }}
              className="w-full text-xs text-slate-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white cursor-pointer"
            />
            <UploadStatusBanner
              status={thumbUpload.status}
              successText="Thumbnail saved!"
              compact
              onRetry={() => {
                thumbUpload
                  .retry()
                  .then((r) => setThumbnailImageId(r.imageId))
                  .catch(() => undefined);
              }}
              onChooseAnother={() => thumbInputRef.current?.click()}
            />
            {thumbnailImageId && thumbUpload.status.state === 'idle' && (
              <p className="text-[11px] text-emerald-300 truncate">Current thumbnail attached.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-300">Cover Image</label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleCoverSelect(f);
              }}
              className="w-full text-xs text-slate-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white cursor-pointer"
            />
            <UploadStatusBanner
              status={coverUpload.status}
              successText="Cover image saved!"
              compact
              onRetry={() => {
                coverUpload
                  .retry()
                  .then((r) => setCoverImageId(r.imageId))
                  .catch(() => undefined);
              }}
              onChooseAnother={() => coverInputRef.current?.click()}
            />
            {coverImageId && coverUpload.status.state === 'idle' && (
              <p className="text-[11px] text-emerald-300 truncate">Current cover attached.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Prize Distribution</label>
            <textarea
              rows={2}
              maxLength={300}
              value={prizeDistribution}
              onChange={(e) => setPrizeDistribution(e.target.value)}
              placeholder="1st: 500 Coins, 2nd: 250 Coins, MVP: 100 Coins"
              className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Rules</label>
            <textarea
              rows={2}
              maxLength={2000}
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder="No emulators, no teaming, screenshots required..."
              className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || isUploadingMedia}
          className="min-h-[44px] px-6 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>
            {isUploadingMedia
              ? 'Uploading Media...'
              : saving
                ? 'Saving...'
                : editingId
                  ? 'Update Tournament'
                  : 'Publish Tournament'}
          </span>
        </button>
      </form>

      {/* Tournaments List */}
      <div className="nexus-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-display text-xl font-bold text-white">All Tournaments ({tournaments.length})</h3>
        </div>
        {tournaments.length === 0 ? (
          <p className="text-xs text-slate-400 p-8 text-center">No tournaments created yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {tournaments.map((t) => (
              <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div>
                  <p className="font-semibold text-sm text-white">{t.title}</p>
                  <p className="text-slate-400 mt-0.5">
                    {t.category} · <span className="capitalize text-[#F5C451]">{t.status}</span> · Entry {t.entryFee} C · Prize {t.prizePool} C · {t.registeredCount}/{t.maxPlayers}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openRoomCredsEditor(t.id)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5C451] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Room ID/Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadForEdit(t)}
                    className="min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white cursor-pointer"
                  >
                    Edit
                  </button>
                  {role === 'owner' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDoc(doc(db, 'tournaments', t.id));
                      }}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#FF1E38]/20 text-slate-400 hover:text-[#FF1E38] flex items-center justify-center cursor-pointer"
                      aria-label="Delete tournament"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Room Credentials Editor Modal */}
      {roomTourneyId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveRoomCreds} className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#D4AF37]/40">
            <h3 className="font-display text-2xl font-bold text-white">Protected Room Credentials</h3>
            <p className="text-xs text-slate-400">
              Stored in a server-protected document. Only players who registered and paid the entry fee can view these credentials.
            </p>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Room ID *</label>
              <input
                type="text"
                required
                value={roomIdVal}
                onChange={(e) => setRoomIdVal(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Room Password *</label>
              <input
                type="text"
                required
                value={roomPasswordVal}
                onChange={(e) => setRoomPasswordVal(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Lobby Notes</label>
              <input
                type="text"
                value={roomNotes}
                onChange={(e) => setRoomNotes(e.target.value)}
                placeholder="Join 10 minutes before start"
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRoomTourneyId(null)}
                className="min-h-[42px] rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-[#D4AF37] text-black text-xs font-bold cursor-pointer"
              >
                Save Room Credentials
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function AdminBannersView() {
  const { role } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageId, setImageId] = useState('');
  const [order, setOrder] = useState('1');
  const [saving, setSaving] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const bannerUpload = useFirestoreImageUpload();

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'banners'), orderBy('order', 'asc')), (snap) => {
      setBanners(snap.docs.map((d) => d.data() as Banner));
    });
    return () => unsub();
  }, []);

  const handleBannerSelect = async (file: File) => {
    if (!isImageFile(file)) return;
    try {
      const uploaded = await bannerUpload.startUpload({
        file,
        purpose: 'banner',
        maxDimension: 1280,
        targetMaxBytes: 295 * 1024,
      });
      setImageId(uploaded.imageId);
    } catch {
      // Displayed by UploadStatusBanner
    }
  };

  const isUploadingBanner =
    bannerUpload.status.state === 'compressing' || bannerUpload.status.state === 'uploading';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingBanner) return;
    setSaving(true);
    try {
      const id = `bnr_${Date.now()}`;
      await setDoc(doc(db, 'banners', id), {
        id,
        title: title.trim().slice(0, 100),
        subtitle: subtitle.trim().slice(0, 200),
        imageId: imageId.trim().slice(0, 128),
        order: Number(order || 1),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle('');
      setSubtitle('');
      setImageId('');
      bannerUpload.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="nexus-card rounded-2xl p-5 space-y-4">
        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-[#F5C451]" />
          <span>Add Home Carousel Banner</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Banner Title *</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Subtitle</label>
            <input
              type="text"
              maxLength={200}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Display Order</label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs font-mono text-white"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-slate-300">Upload Banner Image</label>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handleBannerSelect(f);
            }}
            className="w-full text-xs text-slate-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white cursor-pointer"
          />
          <UploadStatusBanner
            status={bannerUpload.status}
            successText="Banner image saved and ready!"
            compact
            onRetry={() => {
              bannerUpload
                .retry()
                .then((r) => setImageId(r.imageId))
                .catch(() => undefined);
            }}
            onChooseAnother={() => bannerInputRef.current?.click()}
          />
        </div>
        <button
          type="submit"
          disabled={saving || isUploadingBanner}
          className="min-h-[42px] px-5 rounded-xl bg-[#FF1E38] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
        >
          {isUploadingBanner ? 'Saving Image...' : saving ? 'Saving...' : 'Add Banner'}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.length === 0 ? (
          <div className="md:col-span-2 nexus-card rounded-2xl p-8 text-center text-xs text-slate-400">
            No sliding banners configured yet.
          </div>
        ) : (
          banners.map((b) => (
            <div key={b.id} className="nexus-card rounded-2xl overflow-hidden flex flex-col">
              <div className="h-36 w-full">
                <SafeMediaImage
                  imageId={b.imageId}
                  src={b.imageUrl}
                  alt={b.title}
                  className="w-full h-full object-cover"
                  fallbackTitle={b.title}
                />
              </div>
              <div className="p-4 flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-semibold text-white">{b.title}</p>
                  <p className="text-slate-400">Order {b.order} · {b.active ? 'Active' : 'Hidden'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateDoc(doc(db, 'banners', b.id), { active: !b.active, updatedAt: serverTimestamp() })}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white cursor-pointer"
                  >
                    {b.active ? 'Hide' : 'Show'}
                  </button>
                  {role === 'owner' && (
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc(db, 'banners', b.id))}
                      className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-[#FF1E38] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AdminResultsView() {
  const { firebaseUser, role } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTid, setSelectedTid] = useState('');
  const [playerIdLookup, setPlayerIdLookup] = useState('');
  const [placement, setPlacement] = useState('1');
  const [kills, setKills] = useState('0');
  const [prizeCoins, setPrizeCoins] = useState('0');
  const [isMvp, setIsMvp] = useState(false);
  const [winnersList, setWinnersList] = useState<TournamentWinner[]>([]);
  const [creditPrizes, setCreditPrizes] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'tournaments'), orderBy('createdAt', 'desc')), (snap) => {
      setTournaments(snap.docs.map((d) => d.data() as Tournament));
    });
    return () => unsub();
  }, []);

  const addWinnerRow = async () => {
    setStatusMsg(null);
    const pid = playerIdLookup.trim().toUpperCase();
    if (!pid) return;
    const snap = await getDocs(query(collection(db, 'users'), where('playerId', '==', pid)));
    if (snap.empty) {
      setStatusMsg({ type: 'error', text: `Player ID "${pid}" not found.` });
      return;
    }
    const p = snap.docs[0].data() as UserPublicProfile;
    setWinnersList((prev) => [
      ...prev,
      {
        uid: p.uid,
        playerId: p.playerId,
        inGameName: p.inGameName,
        placement: Number(placement || 1),
        kills: Number(kills || 0),
        prizeCoins: Number(prizeCoins || 0),
        mvp: isMvp,
      },
    ]);
    setPlayerIdLookup('');
  };

  const publishResults = async () => {
    if (!firebaseUser || !selectedTid || winnersList.length === 0) return;
    setStatusMsg(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(selectedTid)}/results`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          winners: winnersList,
          creditPrizes: role === 'owner' && creditPrizes,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to publish results.');
      setWinnersList([]);
      setStatusMsg({ type: 'ok', text: 'Verified match results published and leaderboard updated!' });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Publish failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="nexus-card rounded-2xl p-6 space-y-5">
        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F5C451]" />
          <span>Publish Verified Match Results &amp; Leaderboard</span>
        </h2>

        {statusMsg && (
          <div className={`rounded-xl p-3 text-xs flex items-center gap-2 border ${statusMsg.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'}`}>
            {statusMsg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-300 mb-1">Select Tournament *</label>
          <select
            value={selectedTid}
            onChange={(e) => setSelectedTid(e.target.value)}
            className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
          >
            <option value="">-- Choose a tournament --</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.status})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-300 mb-1">Player ID (NX-...)</label>
            <input
              type="text"
              value={playerIdLookup}
              onChange={(e) => setPlayerIdLookup(e.target.value)}
              placeholder="NX-849201"
              className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Rank #</label>
            <input
              type="number"
              min={1}
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Kills</label>
            <input
              type="number"
              min={0}
              value={kills}
              onChange={(e) => setKills(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Prize Coins</label>
            <input
              type="number"
              min={0}
              value={prizeCoins}
              onChange={(e) => setPrizeCoins(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs font-mono text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={isMvp} onChange={(e) => setIsMvp(e.target.checked)} className="accent-[#D4AF37]" />
            <span>Award Match MVP</span>
          </label>
          <button
            type="button"
            onClick={addWinnerRow}
            className="min-h-[40px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
          >
            + Add Placement Row
          </button>
        </div>

        {winnersList.length > 0 && (
          <div className="rounded-xl bg-[#07090E] border border-white/10 divide-y divide-white/10">
            {winnersList.map((w, i) => (
              <div key={i} className="p-3 flex items-center justify-between text-xs">
                <span>
                  <strong className="text-[#F5C451] mr-2">#{w.placement}</strong>
                  {w.inGameName} ({w.playerId}) · {w.kills} Kills {w.mvp ? '· MVP' : ''}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[#F5C451]">+{w.prizeCoins} Coins</span>
                  <button
                    type="button"
                    onClick={() => setWinnersList((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-[#FF1E38] cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {role === 'owner' && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={creditPrizes}
              onChange={(e) => setCreditPrizes(e.target.checked)}
              className="accent-[#D4AF37]"
            />
            <span>Credit prize coins atomically to winner wallets</span>
          </label>
        )}

        <button
          type="button"
          disabled={!selectedTid || winnersList.length === 0}
          onClick={publishResults}
          className="min-h-[44px] px-6 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold cursor-pointer disabled:opacity-40"
        >
          Announce Verified Results &amp; Sync Leaderboard
        </button>
      </section>
    </div>
  );
}
