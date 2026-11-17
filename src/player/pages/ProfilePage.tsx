import React, { useEffect, useRef, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bell,
  LifeBuoy,
  LogOut,
  Shield,
  Upload,
  User,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, requestFcmToken } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { AudioControllerBar } from '../../shared/AudioControllerBar';
import { SafeMediaImage } from '../../shared/NexusLogo';
import { PWAInstallButton } from '../../shared/PWAInstallButton';
import { isImageFile, useFirestoreImageUpload } from '../../shared/imageUpload';
import { UploadStatusBanner } from '../../shared/UploadStatusBanner';
import { formatTimestamp, toMillis, type NotificationItem, type SupportTicket } from '../../shared/types';

export function ProfilePage({ initialSection = 'profile' }: { initialSection?: string }) {
  const { firebaseUser, profile, role, roleVerified, emailVerified, refreshSession, logout } = useAuth();
  const [section, setSection] = useState<'profile' | 'notifications' | 'support' | 'settings'>(
    initialSection === 'notifications'
      ? 'notifications'
      : initialSection === 'support'
        ? 'support'
        : 'profile',
  );

  const [inGameName, setInGameName] = useState(profile?.inGameName || '');
  const [ffUid, setFfUid] = useState(profile?.ffUid || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [saving, setSaving] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Tournament Issue');
  const [ticketMessage, setTicketMessage] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const {
    status: avatarUploadStatus,
    startUpload: startAvatarUpload,
    retry: retryAvatarUpload,
  } = useFirestoreImageUpload();

  useEffect(() => {
    if (profile) {
      setInGameName(profile.inGameName);
      setFfUid(profile.ffUid || '');
      setCountry(profile.country);
    }
  }, [profile]);

  useEffect(() => {
    if (initialSection === 'notifications') setSection('notifications');
    else if (initialSection === 'support') setSection('support');
  }, [initialSection]);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('targetUid', 'in', [firebaseUser.uid, 'ALL'])),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as NotificationItem)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setNotifications(list);
      },
      () => {},
    );

    const unsubTickets = onSnapshot(
      query(collection(db, 'supportTickets'), where('uid', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SupportTicket)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setTickets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets'),
    );

    return () => {
      unsubNotifs();
      unsubTickets();
    };
  }, [firebaseUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setFeedback(null);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        inGameName: inGameName.trim().slice(0, 32),
        ffUid: ffUid.trim().slice(0, 32),
        country: country.trim().slice(0, 64),
        updatedAt: serverTimestamp(),
      });
      setFeedback({ type: 'ok', text: 'Player profile updated.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!firebaseUser) return;
    setFeedback(null);
    if (!isImageFile(file)) {
      setFeedback({ type: 'error', text: 'Please select a valid image file for your avatar.' });
      return;
    }
    try {
      const uploaded = await startAvatarUpload({
        file,
        purpose: 'avatar',
        maxDimension: 256,
        squareCrop: true,
        targetMaxBytes: 220 * 1024,
      });
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        avatarImageId: uploaded.imageId,
        updatedAt: serverTimestamp(),
      });
      setFeedback({ type: 'ok', text: 'Avatar updated.' });
    } catch {
      // Real Firestore error code and Retry button are shown inline via UploadStatusBanner
    }
  };

  const handleRetryAvatarUpload = async () => {
    if (!firebaseUser) return;
    setFeedback(null);
    try {
      const uploaded = await retryAvatarUpload();
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        avatarImageId: uploaded.imageId,
        updatedAt: serverTimestamp(),
      });
      setFeedback({ type: 'ok', text: 'Avatar updated.' });
    } catch {
      // Error remains visible in UploadStatusBanner
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile) return;
    setFeedback(null);
    try {
      const ticketId = `tkt_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`;
      await setDoc(doc(db, 'supportTickets', ticketId), {
        id: ticketId,
        uid: firebaseUser.uid,
        playerId: profile.playerId,
        subject: ticketSubject.trim().slice(0, 120),
        category: ticketCategory,
        message: ticketMessage.trim().slice(0, 2000),
        status: 'open',
        replies: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTicketSubject('');
      setTicketMessage('');
      setFeedback({ type: 'ok', text: 'Support ticket created. Our team will respond shortly.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not create ticket.' });
    }
  };

  const markNotifRead = async (n: NotificationItem) => {
    if (n.targetUid !== firebaseUser?.uid || n.read) return;
    await updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
  };

  const handleEnablePush = async () => {
    if (!firebaseUser) return;
    const token = await requestFcmToken();
    if (token) {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        fcmToken: token,
        updatedAt: serverTimestamp(),
      });
      setFeedback({ type: 'ok', text: 'Push notifications enabled for this browser.' });
    } else {
      setFeedback({ type: 'error', text: 'Browser push permission denied or VAPID key not configured yet.' });
    }
  };

  const isAuthorizedStaff = roleVerified && (role === 'owner' || role === 'moderator');

  return (
    <div className="space-y-6">
      {/* Restriction Notice if applicable */}
      {(profile?.banStatus !== 'none' || profile?.chatRestricted || profile?.tournamentRestricted) && (
        <div className="rounded-2xl border border-[#FF1E38]/50 bg-[#FF1E38]/10 p-4 text-xs text-red-100 space-y-1">
          <p className="font-bold text-sm text-[#FF1E38]">Account Restriction Active</p>
          <p>
            Status: {profile?.banStatus} · Chat Restricted: {profile?.chatRestricted ? 'Yes' : 'No'} · Tournament Restricted:{' '}
            {profile?.tournamentRestricted ? 'Yes' : 'No'}
          </p>
          {profile?.banReason && <p>Reason: {profile.banReason}</p>}
          {profile?.banExpiresAt && <p>Expires: {new Date(profile.banExpiresAt).toLocaleString()}</p>}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'support', label: 'Support', icon: LifeBuoy },
            { id: 'settings', label: 'Settings', icon: Shield },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                section === tab.id ? 'bg-[#FF1E38] text-white' : 'bg-[#0D1017] border border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-3.5 text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-[#FF1E38]/40 bg-[#FF1E38]/10 text-red-200'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {section === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 nexus-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#D4AF37]/50 bg-[#121621] shrink-0">
                <SafeMediaImage
                  imageId={profile?.avatarImageId}
                  src={profile?.avatarUrl}
                  alt={profile?.inGameName || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="font-display text-3xl font-bold text-white">{profile?.inGameName}</h2>
                <p className="text-xs font-mono text-[#F5C451]">{profile?.playerId}</p>
                <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white cursor-pointer underline">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Change Avatar</span>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) handleAvatarUpload(f);
                    }}
                  />
                </label>
              </div>
            </div>

            {avatarUploadStatus.state !== 'idle' && (
              <UploadStatusBanner
                status={avatarUploadStatus}
                compact
                successText="Avatar uploaded and saved."
                onRetry={handleRetryAvatarUpload}
                onChooseAnother={() => avatarInputRef.current?.click()}
              />
            )}

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10 text-xs">
              <div className="rounded-xl bg-[#07090E] p-3">
                <p className="text-slate-400">Matches</p>
                <p className="font-mono tabular-nums text-lg font-bold text-white mt-0.5">{profile?.matches ?? 0}</p>
              </div>
              <div className="rounded-xl bg-[#07090E] p-3">
                <p className="text-slate-400">Wins</p>
                <p className="font-mono tabular-nums text-lg font-bold text-[#F5C451] mt-0.5">{profile?.wins ?? 0}</p>
              </div>
              <div className="rounded-xl bg-[#07090E] p-3">
                <p className="text-slate-400">Eliminations</p>
                <p className="font-mono tabular-nums text-lg font-bold text-white mt-0.5">{profile?.eliminations ?? 0}</p>
              </div>
              <div className="rounded-xl bg-[#07090E] p-3">
                <p className="text-slate-400">Arena Points</p>
                <p className="font-mono tabular-nums text-lg font-bold text-[#FF1E38] mt-0.5">{profile?.arenaPoints ?? 0}</p>
              </div>
            </div>
          </section>

          <section className="lg:col-span-7 nexus-card rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-2xl font-bold text-white">Edit Player Details</h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">In-Game Name *</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={32}
                  value={inGameName}
                  onChange={(e) => setInGameName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Free Fire UID</label>
                <input
                  type="text"
                  maxLength={32}
                  value={ffUid}
                  onChange={(e) => setFfUid(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Country *</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={64}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-6 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </section>
        </div>
      )}

      {section === 'notifications' && (
        <section className="nexus-card rounded-2xl p-5 space-y-4">
          <h3 className="font-display text-2xl font-bold text-white">Notifications</h3>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-white/10">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markNotifRead(n)}
                  className="w-full text-left py-3.5 px-2 hover:bg-white/[0.03] rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={`font-semibold ${n.read ? 'text-slate-300' : 'text-[#F5C451]'}`}>{n.title}</span>
                    <span className="text-[11px] text-slate-500">{formatTimestamp(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{n.body}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 nexus-card rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-2xl font-bold text-white">Open Support Ticket</h3>
            <form onSubmit={handleSubmitTicket} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
                >
                  <option>Tournament Issue</option>
                  <option>Deposit / Wallet</option>
                  <option>Match Dispute</option>
                  <option>Account / Appeal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Message *</label>
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={4}
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
              >
                Submit Ticket
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 nexus-card rounded-2xl p-5 space-y-4">
            <h3 className="font-display text-2xl font-bold text-white">Your Tickets</h3>
            {tickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No support tickets submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => (
                  <div key={t.id} className="rounded-xl bg-[#07090E] border border-white/10 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{t.subject}</span>
                      <span className="capitalize text-[#F5C451] font-medium">{t.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-slate-300">{t.message}</p>
                    {t.replies && t.replies.length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-1.5">
                        {t.replies.map((r, i) => (
                          <div key={i} className="text-[11px] bg-white/5 rounded-lg p-2">
                            <span className="font-semibold text-[#F5C451] uppercase mr-2">{r.senderRole}:</span>
                            <span className="text-slate-200">{r.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {section === 'settings' && (
        <section className="nexus-card rounded-2xl p-6 space-y-6 max-w-2xl">
          <h3 className="font-display text-2xl font-bold text-white">Account &amp; App Settings</h3>

          {/* Email Verification */}
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Email Verification</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {emailVerified ? 'Verified account — all competitive features unlocked.' : 'Not verified yet — verify to join tournaments and chat.'}
              </p>
            </div>
            {!emailVerified && firebaseUser && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await sendEmailVerification(firebaseUser);
                    setFeedback({ type: 'ok', text: 'Verification email sent.' });
                  }}
                  className="min-h-[38px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer"
                >
                  Resend Email
                </button>
                <button
                  type="button"
                  onClick={refreshSession}
                  className="min-h-[38px] px-3 rounded-lg bg-[#D4AF37] text-black text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>
            )}
          </div>

          {/* Background Music Controls */}
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Arena Background Music</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Original lossless playback with call auto-pause.</p>
            </div>
            <AudioControllerBar />
          </div>

          <PWAInstallButton showSettingsCard />

          {/* Push Notifications */}
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Push Notifications (FCM)</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Match reminders, room updates, and wallet status alerts.</p>
            </div>
            <button
              type="button"
              onClick={handleEnablePush}
              className="min-h-[38px] px-3.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
            >
              Enable Push
            </button>
          </div>

          {/* HIDDEN ADMIN ENTRY: Rendered ONLY when server-verified role is 'owner' or 'moderator' */}
          {isAuthorizedStaff && (
            <div className="rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/10 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#F5C451] uppercase">Staff Access Authorized ({role})</p>
                <p className="text-[11px] text-slate-300 mt-0.5">Open the standalone NEXUS FF ADMIN console.</p>
              </div>
              <a
                href="/admin"
                className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
              >
                <span>Admin Panel</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={logout}
              className="min-h-[44px] px-5 rounded-xl bg-white/5 hover:bg-[#FF1E38]/20 text-slate-200 hover:text-[#FF1E38] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
