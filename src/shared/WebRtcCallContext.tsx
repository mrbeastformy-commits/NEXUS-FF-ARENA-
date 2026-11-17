import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useMusicPlayer } from './MusicPlayerContext';
import type { UserPublicProfile } from './types';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

interface WebRtcCallContextValue {
  callState: CallState;
  peerUser: UserPublicProfile | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  callError: string | null;
  startVideoCall: (peer: UserPublicProfile) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShareWithConsent: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  clearCallError: () => void;
}

const WebRtcCallContext = createContext<WebRtcCallContextValue | null>(null);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function WebRtcCallProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const { pauseForCall, resumeAfterCall } = useMusicPlayer();

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const [callState, setCallState] = useState<CallState>('idle');
  const [peerUser, setPeerUser] = useState<UserPublicProfile | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const cleanupCall = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setPeerUser(null);
    setScreenSharing(false);
    setMicEnabled(true);
    setCameraEnabled(true);
    setCallState('idle');
    resumeAfterCall();
  }, [resumeAfterCall]);

  const sendSignal = useCallback((type: string, targetUid: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, targetUid, payload }));
    }
  }, []);

  const createPeerConnection = useCallback(
    (targetUid: string) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((track) => remote.addTrack(track));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignal('call:ice', targetUid, { candidate: ev.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          cleanupCall();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [cleanupCall, sendSignal],
  );

  // Connect WebSocket signaling channel when user is authenticated
  useEffect(() => {
    if (!firebaseUser) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (cancelled) return;
      try {
        const token = await firebaseUser.getIdToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data) as {
              type: string;
              fromUid?: string;
              error?: string;
              payload?: Record<string, unknown>;
            };

            if (msg.type === 'call:offer' && msg.fromUid && msg.payload?.sdp) {
              const callerSnap = await getDoc(doc(db, 'users', msg.fromUid));
              const callerProfile = callerSnap.exists()
                ? (callerSnap.data() as UserPublicProfile)
                : ({ uid: msg.fromUid, playerId: 'Player', inGameName: 'Friend' } as UserPublicProfile);
              pendingOfferRef.current = msg.payload.sdp as RTCSessionDescriptionInit;
              setPeerUser(callerProfile);
              setCallState('ringing');
            } else if (msg.type === 'call:answer' && msg.payload?.sdp && pcRef.current) {
              await pcRef.current.setRemoteDescription(
                new RTCSessionDescription(msg.payload.sdp as RTCSessionDescriptionInit),
              );
              for (const ice of pendingIceRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(ice));
              }
              pendingIceRef.current = [];
              setCallState('connected');
            } else if (msg.type === 'call:ice' && msg.payload?.candidate) {
              const candidate = msg.payload.candidate as RTCIceCandidateInit;
              if (pcRef.current && pcRef.current.remoteDescription) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                pendingIceRef.current.push(candidate);
              }
            } else if (msg.type === 'call:reject') {
              setCallError('Call was declined.');
              cleanupCall();
            } else if (msg.type === 'call:end') {
              cleanupCall();
            } else if (msg.type === 'call:offline') {
              setCallError('Friend is currently offline or not connected to the arena.');
              cleanupCall();
            } else if (msg.type === 'call:error') {
              setCallError(msg.error || 'Call signaling error.');
              cleanupCall();
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            reconnectTimer = setTimeout(connect, 4000);
          }
        };
      } catch {
        // Retry cleanly
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [firebaseUser, cleanupCall]);

  const startVideoCall = useCallback(
    async (peer: UserPublicProfile) => {
      if (!firebaseUser) return;
      try {
        setCallError(null);
        pauseForCall();
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setPeerUser(peer);
        setCallState('calling');

        const pc = createPeerConnection(peer.uid);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('call:offer', peer.uid, { sdp: offer });
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'Camera and microphone access required for video calls.');
        cleanupCall();
      }
    },
    [firebaseUser, pauseForCall, createPeerConnection, sendSignal, cleanupCall],
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!peerUser || !pendingOfferRef.current) return;
    try {
      setCallError(null);
      pauseForCall();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(peerUser.uid);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
      for (const ice of pendingIceRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(ice));
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal('call:answer', peerUser.uid, { sdp: answer });
      setCallState('connected');
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Failed to access camera/microphone.');
      cleanupCall();
    }
  }, [peerUser, pauseForCall, createPeerConnection, sendSignal, cleanupCall]);

  const rejectIncomingCall = useCallback(() => {
    if (peerUser) {
      sendSignal('call:reject', peerUser.uid);
    }
    cleanupCall();
  }, [peerUser, sendSignal, cleanupCall]);

  const endCall = useCallback(() => {
    if (peerUser) {
      sendSignal('call:end', peerUser.uid);
    }
    cleanupCall();
  }, [peerUser, sendSignal, cleanupCall]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !micEnabled;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicEnabled(next);
  }, [micEnabled]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !cameraEnabled;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCameraEnabled(next);
  }, [cameraEnabled]);

  const stopScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (pcRef.current && camTrack) {
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(camTrack);
      }
    }
    setScreenSharing(false);
  }, []);

  const startScreenShareWithConsent = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack || !pcRef.current) return;

      screenTrackRef.current = screenTrack;
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }
      screenTrack.onended = () => {
        stopScreenShare();
      };
      setScreenSharing(true);
    } catch {
      // User denied browser screen picker
    }
  }, [stopScreenShare]);

  return (
    <WebRtcCallContext.Provider
      value={{
        callState,
        peerUser,
        localStream,
        remoteStream,
        micEnabled,
        cameraEnabled,
        screenSharing,
        callError,
        startVideoCall,
        acceptIncomingCall,
        rejectIncomingCall,
        endCall,
        toggleMic,
        toggleCamera,
        startScreenShareWithConsent,
        stopScreenShare,
        clearCallError: () => setCallError(null),
      }}
    >
      {children}
    </WebRtcCallContext.Provider>
  );
}

export function useWebRtcCall(): WebRtcCallContextValue {
  const ctx = useContext(WebRtcCallContext);
  if (!ctx) {
    throw new Error('useWebRtcCall must be used inside WebRtcCallProvider');
  }
  return ctx;
}
