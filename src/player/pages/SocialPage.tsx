import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Search,
  UserPlus,
  Check,
  X,
  Send,
  Video,
  Image as ImageIcon,
  Film,
  Flag,
  Ban,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { useWebRtcCall } from '../../shared/WebRtcCallContext';
import { SafeMediaImage } from '../../shared/NexusLogo';
import { isImageFile, useFirestoreImageUpload } from '../../shared/imageUpload';
import { UploadStatusBanner } from '../../shared/UploadStatusBanner';
import {
  formatTimestamp,
  toMillis,
  type ChatMessage,
  type Friendship,
  type UserPublicProfile,
} from '../../shared/types';

export function SocialPage() {
  const { firebaseUser, profile, emailVerified } = useAuth();
  const { startVideoCall } = useWebRtcCall();

  const [searchPlayerId, setSearchPlayerId] = useState('');
  const [searchResult, setSearchResult] = useState<UserPublicProfile | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [peerProfiles, setPeerProfiles] = useState<Record<string, UserPublicProfile>>({});
  const [selectedFriendUid, setSelectedFriendUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);

  const [reportTarget, setReportTarget] = useState<UserPublicProfile | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportCategory, setReportCategory] = useState<'chat_abuse' | 'cheating' | 'scam' | 'harassment' | 'other'>('chat_abuse');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [pendingMediaMeta, setPendingMediaMeta] = useState<{
    chatId: string;
    recipientUid: string;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const {
    status: mediaUploadStatus,
    startUpload: startMediaUpload,
    retry: retryMediaUpload,
    reset: resetMediaUpload,
  } = useFirestoreImageUpload();

  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      query(collection(db, 'friends'), where('users', 'array-contains', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Friendship);
        setFriendships(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friends'),
    );
    return () => unsub();
  }, [firebaseUser]);

  // Load peer profiles for all friendships using document gets
  useEffect(() => {
    if (!firebaseUser || friendships.length === 0) {
      setPeerProfiles({});
      return;
    }
    const otherUids = Array.from(
      new Set(
        friendships
          .map((f) => f.users.find((u) => u !== firebaseUser.uid))
          .filter((u): u is string => Boolean(u)),
      ),
    );
    if (otherUids.length === 0) return;

    let cancelled = false;
    void Promise.all(
      otherUids.map((uid) =>
        getDoc(doc(db, 'users', uid))
          .then((d) => (d.exists() ? (d.data() as UserPublicProfile) : null))
          .catch(() => null),
      ),
    ).then((docs) => {
      if (cancelled) return;
      const map: Record<string, UserPublicProfile> = {};
      docs.forEach((u) => {
        if (u) map[u.uid] = u;
      });
      setPeerProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, friendships]);

  // Listen to 1-to-1 chat messages for selected accepted friend
  useEffect(() => {
    if (!firebaseUser || !selectedFriendUid) {
      setMessages([]);
      return;
    }
    const chatId = [firebaseUser.uid, selectedFriendUid].sort().join('_');
    const unsub = onSnapshot(
      query(collection(db, 'messages', chatId, 'items'), where('participants', 'array-contains', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ChatMessage)
          .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
        setMessages(list);
      },
      () => setMessages([]),
    );
    return () => unsub();
  }, [firebaseUser, selectedFriendUid]);

  const handleSearchPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    setSearchResult(null);
    const trimmed = searchPlayerId.trim().toUpperCase();
    if (!trimmed) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('playerId', '==', trimmed), where('banStatus', '==', 'none')),
      );
      if (snap.empty) {
        setSearchError(`No player found with ID "${trimmed}".`);
      } else {
        setSearchResult(snap.docs[0].data() as UserPublicProfile);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    }
  };

  const handleSendFriendRequest = async (target: UserPublicProfile) => {
    if (!firebaseUser || !emailVerified) {
      setStatusNotice('Verify your email address to send friend requests.');
      return;
    }
    if (target.uid === firebaseUser.uid) {
      setStatusNotice('You cannot add yourself as a friend.');
      return;
    }
    const fId = [firebaseUser.uid, target.uid].sort().join('_');
    try {
      await setDoc(doc(db, 'friends', fId), {
        id: fId,
        users: [firebaseUser.uid, target.uid].sort(),
        requesterUid: firebaseUser.uid,
        recipientUid: target.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'notifications', `notif_fr_${fId}_${Date.now()}`), {
        id: `notif_fr_${fId}_${Date.now()}`,
        targetUid: target.uid,
        type: 'friend',
        title: 'New Friend Request',
        body: `${profile?.inGameName || 'A player'} (${profile?.playerId}) sent you a friend request.`,
        link: 'social',
        read: false,
        createdAt: serverTimestamp(),
      });
      setStatusNotice(`Friend request sent to ${target.inGameName}.`);
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Could not send request.');
    }
  };

  const handleAcceptFriend = async (f: Friendship) => {
    try {
      await updateDoc(doc(db, 'friends', f.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      // Ensure chat thread parent exists for Master Gate
      await setDoc(
        doc(db, 'messages', f.id),
        {
          id: f.id,
          participants: f.users,
          lastMessage: '',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Could not accept request.');
    }
  };

  const handleBlockFriend = async (f: Friendship) => {
    if (!firebaseUser) return;
    try {
      await updateDoc(doc(db, 'friends', f.id), {
        status: 'blocked',
        blockedBy: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });
      if (selectedFriendUid && f.users.includes(selectedFriendUid)) {
        setSelectedFriendUid(null);
      }
      setStatusNotice('User blocked.');
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Block failed.');
    }
  };

  const commitChatMessage = async (
    chatId: string,
    recipientUid: string,
    type: 'text' | 'image',
    mediaImageId: string,
  ) => {
    if (!firebaseUser) return;
    const cleanText = textInput.trim().slice(0, 2000);
    if (type === 'text' && !cleanText) return;

    await setDoc(
      doc(db, 'messages', chatId),
      {
        id: chatId,
        participants: [firebaseUser.uid, recipientUid].sort(),
        lastMessage: type === 'text' ? cleanText.slice(0, 120) : '[image]',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    const msgId = `msg_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`;
    await setDoc(doc(db, 'messages', chatId, 'items', msgId), {
      id: msgId,
      chatId,
      participants: [firebaseUser.uid, recipientUid].sort(),
      senderUid: firebaseUser.uid,
      recipientUid,
      type,
      text: cleanText,
      mediaImageId,
      createdAt: serverTimestamp(),
    });

    setTextInput('');
  };

  const sendMessage = async (type: 'text' | 'image', file?: File) => {
    if (!firebaseUser || !selectedFriendUid || !emailVerified) {
      setStatusNotice('Verify your email address before sending messages or images.');
      return;
    }
    if (profile?.chatRestricted) {
      setStatusNotice('Your account is currently restricted from sending chat messages.');
      return;
    }

    const chatId = [firebaseUser.uid, selectedFriendUid].sort().join('_');

    if (type === 'text') {
      if (!textInput.trim()) return;
      setSending(true);
      try {
        await commitChatMessage(chatId, selectedFriendUid, 'text', '');
      } catch (err) {
        setStatusNotice(err instanceof Error ? err.message : 'Message failed.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!file) return;
    if (!isImageFile(file)) {
      setStatusNotice('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    setPendingMediaMeta({ chatId, recipientUid: selectedFriendUid });
    setSending(true);
    try {
      const uploaded = await startMediaUpload({
        file,
        purpose: 'chat',
        chatId,
        maxDimension: 1024,
        targetMaxBytes: 290 * 1024,
      });
      await commitChatMessage(chatId, selectedFriendUid, 'image', uploaded.imageId);
      setPendingMediaMeta(null);
      resetMediaUpload();
    } catch {
      // Error surfaced directly in UploadStatusBanner with real error code & Retry button
    } finally {
      setSending(false);
    }
  };

  const handleRetryChatMedia = async () => {
    if (!pendingMediaMeta || !firebaseUser) return;
    setSending(true);
    try {
      const uploaded = await retryMediaUpload();
      await commitChatMessage(
        pendingMediaMeta.chatId,
        pendingMediaMeta.recipientUid,
        'image',
        uploaded.imageId,
      );
      setPendingMediaMeta(null);
      resetMediaUpload();
    } catch {
      // Error remains visible in UploadStatusBanner
    } finally {
      setSending(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !reportTarget || !profile) return;
    try {
      const repId = `rep_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`;
      const chatId = [firebaseUser.uid, reportTarget.uid].sort().join('_');
      await setDoc(doc(db, 'reports', repId), {
        id: repId,
        reporterUid: firebaseUser.uid,
        reporterPlayerId: profile.playerId,
        targetUid: reportTarget.uid,
        targetPlayerId: reportTarget.playerId,
        category: reportCategory,
        reason: reportReason.trim().slice(0, 1000),
        chatId,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReportTarget(null);
      setReportReason('');
      setStatusNotice('Report submitted for moderation review.');
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Report failed.');
    }
  };

  const acceptedFriends = friendships.filter((f) => f.status === 'accepted');
  const incomingRequests = friendships.filter(
    (f) => f.status === 'pending' && f.recipientUid === firebaseUser?.uid,
  );
  const activeFriendProfile = selectedFriendUid ? peerProfiles[selectedFriendUid] : null;
  const activeFriendship = acceptedFriends.find(
    (f) => selectedFriendUid && f.users.includes(selectedFriendUid),
  );

  return (
    <div className="space-y-6">
      {statusNotice && (
        <div className="rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 text-xs text-slate-200 flex items-center justify-between">
          <span>{statusNotice}</span>
          <button type="button" onClick={() => setStatusNotice(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {profile?.chatRestricted && (
        <div className="rounded-xl border border-[#FF1E38]/40 bg-[#FF1E38]/10 p-4 text-xs text-red-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#FF1E38] shrink-0" />
          <span>Your chat privileges are currently restricted by moderation.</span>
        </div>
      )}

      {/* Search by Player ID */}
      <section className="nexus-card rounded-2xl p-5 space-y-4">
        <h2 className="font-display text-2xl font-bold text-white">Find Players by Player ID</h2>
        <form onSubmit={handleSearchPlayer} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchPlayerId}
              onChange={(e) => setSearchPlayerId(e.target.value)}
              placeholder="Enter Player ID (e.g. NX-849201)"
              className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:border-[#FF1E38]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            Search Player
          </button>
        </form>

        {searchError && <p className="text-xs text-slate-400">{searchError}</p>}

        {searchResult && (
          <div className="rounded-xl bg-[#07090E] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[#121621]">
                <SafeMediaImage imageId={searchResult.avatarImageId} src={searchResult.avatarUrl} alt={searchResult.inGameName} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="font-semibold text-white">{searchResult.inGameName}</p>
                <p className="text-xs font-mono text-slate-400">
                  {searchResult.playerId} · {searchResult.country} · {searchResult.wins} Wins · {searchResult.arenaPoints} Pts
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSendFriendRequest(searchResult)}
                className="min-h-[40px] px-4 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Friend</span>
              </button>
              <button
                type="button"
                onClick={() => setReportTarget(searchResult)}
                className="min-h-[40px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs cursor-pointer"
              >
                Report
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Incoming Friend Requests */}
      {incomingRequests.length > 0 && (
        <section className="nexus-card rounded-2xl p-5 space-y-3 border-[#D4AF37]/35">
          <h3 className="font-display text-xl font-bold text-[#F5C451]">Pending Friend Requests</h3>
          <div className="divide-y divide-white/10">
            {incomingRequests.map((req) => {
              const sender = peerProfiles[req.requesterUid];
              return (
                <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{sender?.inGameName || req.requesterUid}</p>
                    <p className="text-xs font-mono text-slate-400">{sender?.playerId || 'Player'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptFriend(req)}
                      className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockFriend(req)}
                      className="min-h-[38px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Friends List + 1-to-1 Chat & Video Call */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <aside className="lg:col-span-4 nexus-card rounded-2xl p-4 space-y-3">
          <h3 className="font-display text-xl font-bold text-white px-1">Accepted Friends</h3>
          {acceptedFriends.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No friends yet. Search by Player ID above to connect—only accepted friends can chat or video call.
            </p>
          ) : (
            <div className="space-y-1.5">
              {acceptedFriends.map((f) => {
                const otherUid = f.users.find((u) => u !== firebaseUser?.uid) || '';
                const peer = peerProfiles[otherUid];
                const isSelected = selectedFriendUid === otherUid;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFriendUid(otherUid)}
                    className={`w-full p-3 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#FF1E38]/15 border border-[#FF1E38]/40' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#121621] shrink-0">
                        <SafeMediaImage imageId={peer?.avatarImageId} src={peer?.avatarUrl} alt={peer?.inGameName || 'Friend'} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{peer?.inGameName || 'Loading...'}</p>
                        <p className="text-[11px] font-mono text-slate-400">{peer?.playerId}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium shrink-0 ${peer?.isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {peer?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Chat Area */}
        <section className="lg:col-span-8 nexus-card rounded-2xl flex flex-col min-h-[460px] max-h-[600px]">
          {!activeFriendProfile ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-500" />
              <p className="text-sm font-medium text-white">Select an accepted friend to chat</p>
              <p className="text-xs">Send text messages, compressed images, or launch an encrypted WebRTC video call.</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white text-sm">{activeFriendProfile.inGameName}</h4>
                  <p className="text-[11px] font-mono text-slate-400">
                    {activeFriendProfile.playerId} · {activeFriendProfile.isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startVideoCall(activeFriendProfile)}
                    className="min-h-[38px] px-3 rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Video Call</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportTarget(activeFriendProfile)}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
                    title="Report player"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                  {activeFriendship && (
                    <button
                      type="button"
                      onClick={() => handleBlockFriend(activeFriendship)}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#FF1E38]/20 text-slate-300 hover:text-[#FF1E38] flex items-center justify-center cursor-pointer"
                      title="Block player"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No messages yet. Say hello to your squadmate!</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.senderUid === firebaseUser?.uid;
                    return (
                      <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs space-y-2 ${
                            mine ? 'bg-[#FF1E38] text-white' : 'bg-[#151926] text-slate-100 border border-white/10'
                          }`}
                        >
                          {m.type === 'image' && (m.mediaImageId || m.mediaUrl) && (
                            <SafeMediaImage
                              imageId={m.mediaImageId}
                              src={m.mediaUrl}
                              alt="Chat attachment"
                              className="rounded-lg max-h-64 object-contain"
                            />
                          )}
                          {m.type === 'video' && (
                            <p className="text-[11px] italic opacity-75">Video sharing is coming soon.</p>
                          )}
                          {m.text && <p className="leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 px-1">{formatTimestamp(m.createdAt)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Image Save Progress / Retry Banner */}
              {mediaUploadStatus.state !== 'idle' && (
                <div className="px-3 pt-2 border-t border-white/10">
                  <UploadStatusBanner
                    status={mediaUploadStatus}
                    compact
                    successText="Image sent!"
                    onRetry={handleRetryChatMedia}
                    onChooseAnother={() => imageInputRef.current?.click()}
                  />
                </div>
              )}

              {/* Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage('text');
                }}
                className="p-3 border-t border-white/10 flex items-center gap-2"
              >
                <label className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer shrink-0" title="Send Image">
                  <ImageIcon className="w-4 h-4" />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) sendMessage('image', f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setStatusNotice('Video sharing is coming soon.')}
                  className="h-10 px-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer text-[11px]"
                  title="Video sharing is coming soon"
                >
                  <Film className="w-4 h-4" />
                  <span className="hidden sm:inline">Video Soon</span>
                </button>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  disabled={sending || profile?.chatRestricted}
                  placeholder="Type a message..."
                  className="flex-1 min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-xs text-white focus:outline-none focus:border-[#FF1E38]"
                />
                <button
                  type="submit"
                  disabled={sending || !textInput.trim() || profile?.chatRestricted}
                  className="min-h-[42px] px-4 rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSubmitReport} className="max-w-md w-full nexus-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl font-bold text-white">Report {reportTarget.inGameName}</h3>
              <button type="button" onClick={() => setReportTarget(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category</label>
              <select
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value as typeof reportCategory)}
                className="w-full min-h-[42px] rounded-xl bg-[#07090E] border border-white/10 px-3 text-xs text-white"
              >
                <option value="chat_abuse">Chat Abuse</option>
                <option value="cheating">Cheating / Hack</option>
                <option value="scam">Scam / Impersonation</option>
                <option value="harassment">Harassment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Details *</label>
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={4}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe what happened..."
                className="w-full rounded-xl bg-[#07090E] border border-white/10 p-3 text-xs text-white focus:outline-none focus:border-[#FF1E38]"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold cursor-pointer"
            >
              Submit Report
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
