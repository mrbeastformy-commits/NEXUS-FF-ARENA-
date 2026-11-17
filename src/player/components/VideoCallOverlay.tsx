import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  PhoneIncoming,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useWebRtcCall } from '../../shared/WebRtcCallContext';

export function VideoCallOverlay() {
  const {
    callState,
    peerUser,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    screenSharing,
    callError,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
    toggleMic,
    toggleCamera,
    startScreenShareWithConsent,
    stopScreenShare,
    clearCallError,
  } = useWebRtcCall();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const [confirmScreenShare, setConfirmScreenShare] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  if (callError && callState === 'idle') {
    return (
      <div className="fixed bottom-20 right-4 z-50 max-w-sm nexus-card rounded-xl p-4 border border-[#FF1E38]/40 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-[#FF1E38] shrink-0 mt-0.5" />
        <div className="flex-1 text-xs text-slate-200">{callError}</div>
        <button
          type="button"
          onClick={clearCallError}
          className="text-slate-400 hover:text-white cursor-pointer"
          aria-label="Close call notice"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (callState === 'idle') return null;

  if (callState === 'ringing') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="max-w-sm w-full nexus-card rounded-2xl p-6 text-center space-y-5 border border-[#D4AF37]/40">
          <div className="w-16 h-16 rounded-full bg-[#FF1E38]/15 border border-[#FF1E38]/50 mx-auto flex items-center justify-center">
            <PhoneIncoming className="w-8 h-8 text-[#FF1E38]" />
          </div>
          <div>
            <p className="text-xs text-[#F5C451] font-medium">Incoming Private Video Call</p>
            <h3 className="font-display text-3xl font-bold tracking-wide text-white mt-1">
              {peerUser?.inGameName || 'Squadmate'}
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-1">{peerUser?.playerId}</p>
          </div>
          <p className="text-xs text-slate-400">
            Background arena music will pause automatically during your call.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={rejectIncomingCall}
              className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-sm font-semibold transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={acceptIncomingCall}
              className="min-h-[44px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Accept Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#06070A] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0B0D13]">
        <div>
          <h3 className="text-sm font-semibold text-white">{peerUser?.inGameName || 'Private Call'}</h3>
          <p className="text-xs text-slate-400 font-mono">
            {callState === 'calling' ? 'Calling friend...' : 'Encrypted Peer-to-Peer WebRTC'}
          </p>
        </div>
        <button
          type="button"
          onClick={endCall}
          className="min-h-[40px] px-4 rounded-lg bg-[#FF1E38] hover:bg-[#E11D48] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Call</span>
        </button>
      </div>

      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-video rounded-xl overflow-hidden border border-white/20 bg-[#0D1017] shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="p-4 bg-[#0B0D13] border-t border-white/10 flex items-center justify-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={toggleMic}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
            micEnabled ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-[#FF1E38]/20 text-[#FF1E38] border border-[#FF1E38]/40'
          }`}
        >
          {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          <span>{micEnabled ? 'Mic On' : 'Muted'}</span>
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
            cameraEnabled ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-[#FF1E38]/20 text-[#FF1E38] border border-[#FF1E38]/40'
          }`}
        >
          {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          <span>{cameraEnabled ? 'Cam On' : 'Cam Off'}</span>
        </button>

        {!screenSharing ? (
          <button
            type="button"
            onClick={() => setConfirmScreenShare(true)}
            className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-[#F5C451] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <MonitorUp className="w-4 h-4" />
            <span>Share Screen</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScreenShare}
            className="min-h-[44px] px-4 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#F5C451] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <MonitorOff className="w-4 h-4" />
            <span>Stop Sharing</span>
          </button>
        )}
      </div>

      {/* Explicit Screen Share Permission Modal */}
      {confirmScreenShare && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full nexus-card rounded-2xl p-6 space-y-4 border border-[#D4AF37]/40">
            <h4 className="font-display text-2xl font-bold text-white">Allow Screen Sharing?</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your selected screen or window will be visible live to{' '}
              <strong className="text-white">{peerUser?.inGameName}</strong>. Nothing is recorded or stored by NEXUS FF ARENA.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmScreenShare(false)}
                className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmScreenShare(false);
                  await startScreenShareWithConsent();
                }}
                className="min-h-[44px] rounded-xl bg-[#D4AF37] hover:bg-[#F5C451] text-black text-sm font-semibold cursor-pointer"
              >
                Confirm & Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
