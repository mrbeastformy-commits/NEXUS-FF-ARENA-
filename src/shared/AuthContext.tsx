import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { ModeratorPermissions, StaffRole, UserPublicProfile } from './types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserPublicProfile | null;
  role: StaffRole;
  permissions: Partial<ModeratorPermissions>;
  authReady: boolean;
  roleVerified: boolean;
  emailVerified: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  ensureUserProfile: (user: User, overrides?: { inGameName?: string; ffUid?: string; country?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function generatePlayerId(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  const num = String((hash % 900000) + 100000);
  return `NX-${num}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [role, setRole] = useState<StaffRole>('player');
  const [permissions, setPermissions] = useState<Partial<ModeratorPermissions>>({});
  const [authReady, setAuthReady] = useState(false);
  const [roleVerified, setRoleVerified] = useState(false);

  const verifyServerRole = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/auth/verify-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          role: StaffRole;
          permissions?: Partial<ModeratorPermissions>;
        };
        setRole(data.role || 'player');
        setPermissions(data.permissions || {});
      } else {
        setRole('player');
        setPermissions({});
      }
    } catch {
      setRole('player');
      setPermissions({});
    } finally {
      setRoleVerified(true);
    }
  }, []);

  const ensureUserProfile = useCallback(
    async (user: User, overrides?: { inGameName?: string; ffUid?: string; country?: string }) => {
      const userRef = doc(db, 'users', user.uid);
      const privRef = doc(db, 'users', user.uid, 'private', 'info');
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const fallbackName = (user.displayName || user.email?.split('@')[0] || 'Survivor')
            .replace(/[^a-zA-Z0-9 _-]/g, '')
            .trim()
            .slice(0, 24);
          const safeName = (overrides?.inGameName || fallbackName || 'Survivor').slice(0, 32);
          const safeCountry = (overrides?.country || 'Pakistan').slice(0, 64);

          await setDoc(userRef, {
            uid: user.uid,
            playerId: generatePlayerId(user.uid),
            ffUid: (overrides?.ffUid || '').slice(0, 32),
            inGameName: safeName.length >= 2 ? safeName : 'Player',
            country: safeCountry.length >= 2 ? safeCountry : 'Global',
            avatarUrl: (user.photoURL || '').slice(0, 1024),
            balance: 0,
            matches: 0,
            wins: 0,
            eliminations: 0,
            mvpCount: 0,
            arenaPoints: 0,
            rank: 0,
            isOnline: true,
            lastSeen: new Date().toISOString(),
            banStatus: 'none',
            chatRestricted: false,
            tournamentRestricted: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const privSnap = await getDoc(privRef);
        if (!privSnap.exists() && user.email) {
          await setDoc(privRef, {
            uid: user.uid,
            email: user.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setFirebaseUser({ ...auth.currentUser } as User);
    await verifyServerRole(auth.currentUser);
  }, [verifyServerRole]);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setFirebaseUser(user);
      setRoleVerified(false);

      if (!user) {
        setProfile(null);
        setRole('player');
        setPermissions({});
        setAuthReady(true);
        setRoleVerified(true);
        return;
      }

      await ensureUserProfile(user);
      await verifyServerRole(user);

      // Mark online
      updateDoc(doc(db, 'users', user.uid), {
        isOnline: true,
        lastSeen: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserPublicProfile);
          } else {
            setProfile(null);
          }
          setAuthReady(true);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        },
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, [ensureUserProfile, verifyServerRole]);

  const logout = useCallback(async () => {
    if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        isOnline: false,
        lastSeen: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        role,
        permissions,
        authReady,
        roleVerified,
        emailVerified: Boolean(firebaseUser?.emailVerified),
        refreshSession,
        logout,
        ensureUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
