import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { ArrowRight, KeyRound, Mail, ShieldCheck, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../../shared/firebase';
import { useAuth } from '../../shared/AuthContext';
import { NexusLogo } from '../../shared/NexusLogo';
import { AudioControllerBar } from '../../shared/AudioControllerBar';
import { PWAInstallButton } from '../../shared/PWAInstallButton';

type AuthMode = 'welcome' | 'login' | 'register' | 'forgot';

export function AuthScreen() {
  const { ensureUserProfile } = useAuth();
  const [mode, setMode] = useState<AuthMode>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inGameName, setInGameName] = useState('');
  const [ffUid, setFfUid] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await ensureUserProfile(cred.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'register') {
        if (inGameName.trim().length < 2) {
          throw new Error('In-Game Name must be at least 2 characters.');
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: inGameName.trim().slice(0, 32) });
        await ensureUserProfile(cred.user, {
          inGameName: inGameName.trim(),
          ffUid: ffUid.trim(),
          country: country.trim() || 'Pakistan',
        });
        await sendEmailVerification(cred.user);
        setInfoMsg('Account created. A verification email has been sent—verify your inbox to unlock tournaments and chat.');
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMsg('Password reset link sent to your email address.');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Email/Password sign-in is not enabled in Firebase Console yet. Enable Email/Password under Authentication → Sign-in method, or use Google Sign-In below.',
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen nexus-grid-bg bg-[#06070A] text-slate-100 flex flex-col">
      {/* Top Audio & Brand Header */}
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <NexusLogo size={36} variant="arena" />
          <span className="font-display text-2xl font-bold tracking-wide text-white">NEXUS FF ARENA</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton compact />
          <AudioControllerBar />
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Hero / Welcome Showcase */}
          <section className="lg:col-span-6 nexus-card rounded-2xl p-6 sm:p-10 flex flex-col justify-between bg-gradient-to-br from-[#0D1017] via-[#090B10] to-[#170A0F]">
            <div className="space-y-5">
              <div className="flex items-center gap-3.5">
                <NexusLogo size={54} variant="arena" className="border border-[#D4AF37]/40" />
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-[#F5C451] uppercase">
                    PLAY • COMPETE • CONQUER
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Official Competitive Tournament Platform</p>
                </div>
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.05] text-balance">
                Competitive Free Fire Custom Rooms &amp; Verified Leaderboards
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                Register for Clash Squad, Battle Royale, and 1v1 Custom tournaments, unlock room credentials automatically upon verified entry, squad up with encrypted video calls, and track verified arena points.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/10">
              <div>
                <p className="text-xs text-slate-400">Room Security</p>
                <p className="text-sm font-semibold text-white mt-1">Server-Gated Access</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Coin Ledger</p>
                <p className="text-sm font-semibold text-[#F5C451] mt-1">Admin-Verified Only</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Squad Comms</p>
                <p className="text-sm font-semibold text-white mt-1">WebRTC &amp; Private Chat</p>
              </div>
            </div>
          </section>

          {/* Right Auth Card */}
          <section className="lg:col-span-6 nexus-card rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
            {mode === 'welcome' ? (
              <div className="space-y-6">
                <div>
                  <h3 className="font-display text-3xl font-bold text-white">Enter the Arena</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    New players start with 0 Coins, 0 stats, and a unique NX Player ID.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full min-h-[48px] rounded-xl bg-white text-black hover:bg-slate-200 font-semibold text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#FF1E38]" />
                    <span>Continue with Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="w-full min-h-[48px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Sign In with Email</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="w-full min-h-[48px] rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#F5C451] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Create Player Account</span>
                  </button>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-[#FF1E38]/40 bg-[#FF1E38]/10 p-3.5 text-xs text-red-200 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-[#FF1E38] shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-3xl font-bold text-white">
                      {mode === 'login' ? 'Player Sign In' : mode === 'register' ? 'Create Account' : 'Reset Password'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {mode === 'login'
                        ? 'Access your tournaments, wallet, and squad chat'
                        : mode === 'register'
                          ? 'Register with verified email for competitive play'
                          : 'Receive a Firebase password reset link'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('welcome');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="min-h-[40px] px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    Back
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                  {mode === 'register' && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">In-Game Name *</label>
                          <input
                            type="text"
                            required
                            minLength={2}
                            maxLength={32}
                            value={inGameName}
                            onChange={(e) => setInGameName(e.target.value)}
                            placeholder="e.g. GhostStriker"
                            className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white focus:outline-none focus:border-[#FF1E38]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Free Fire UID</label>
                          <input
                            type="text"
                            maxLength={32}
                            value={ffUid}
                            onChange={(e) => setFfUid(e.target.value)}
                            placeholder="Optional numeric UID"
                            className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white font-mono focus:outline-none focus:border-[#FF1E38]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Country / Region *</label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={64}
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white focus:outline-none focus:border-[#FF1E38]"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@example.com"
                      className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white focus:outline-none focus:border-[#FF1E38]"
                    />
                  </div>

                  {mode !== 'forgot' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Password *</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full min-h-[44px] rounded-xl bg-[#07090E] border border-white/10 px-3.5 text-sm text-white focus:outline-none focus:border-[#FF1E38]"
                      />
                    </div>
                  )}

                  {errorMsg && (
                    <div className="rounded-xl border border-[#FF1E38]/40 bg-[#FF1E38]/10 p-3 text-xs text-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#FF1E38] shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {infoMsg && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{infoMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[46px] rounded-xl bg-[#FF1E38] hover:bg-[#E11D48] text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loading
                      ? 'Please wait...'
                      : mode === 'login'
                        ? 'Sign In'
                        : mode === 'register'
                          ? 'Register Account'
                          : 'Send Reset Email'}
                  </button>
                </form>

                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {mode === 'login' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setErrorMsg(null);
                          setInfoMsg(null);
                        }}
                        className="text-slate-400 hover:text-[#F5C451] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Forgot password?</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setErrorMsg(null);
                          setInfoMsg(null);
                        }}
                        className="text-[#F5C451] hover:underline font-medium cursor-pointer"
                      >
                        Need an account? Register
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg(null);
                        setInfoMsg(null);
                      }}
                      className="text-[#F5C451] hover:underline font-medium cursor-pointer"
                    >
                      Already registered? Sign In
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Use Google Sign-In
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
