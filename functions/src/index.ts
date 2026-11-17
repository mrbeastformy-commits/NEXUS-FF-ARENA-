import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const OWNER_ADMIN_ALLOWLIST = defineSecret('OWNER_ADMIN_ALLOWLIST');

function getAllowlist(): Set<string> {
  const raw = OWNER_ADMIN_ALLOWLIST.value() || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Verifies user email against server-side OWNER_ADMIN_ALLOWLIST secret
 * and sets custom claim { role: 'owner' | 'moderator' | 'player' }.
 */
export const verifyRoleAndSetClaim = onCall(
  { secrets: [OWNER_ADMIN_ALLOWLIST] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const uid = request.auth.uid;
    const email = (request.auth.token.email || '').toLowerCase();
    const emailVerified = Boolean(request.auth.token.email_verified);

    if (emailVerified && getAllowlist().has(email)) {
      await admin.auth().setCustomUserClaims(uid, { role: 'owner' });
      await db.doc(`admins/${uid}`).set(
        {
          uid,
          role: 'owner',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { role: 'owner' };
    }

    const modSnap = await db.doc(`moderators/${uid}`).get();
    if (emailVerified && modSnap.exists && modSnap.data()?.status === 'active') {
      await admin.auth().setCustomUserClaims(uid, { role: 'moderator' });
      return { role: 'moderator', permissions: modSnap.data()?.permissions || {} };
    }

    await admin.auth().setCustomUserClaims(uid, { role: 'player' });
    return { role: 'player' };
  },
);

/**
 * Atomic, idempotent tournament registration with single coin deduction.
 */
export const registerForTournament = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('permission-denied', 'Verified account required.');
  }
  const uid = request.auth.uid;
  const tournamentId = String(request.data?.tournamentId || '');
  const idempotencyKey = String(request.data?.idempotencyKey || '');
  const teamName = String(request.data?.teamName || '').slice(0, 64);
  if (!tournamentId || !idempotencyKey) {
    throw new HttpsError('invalid-argument', 'tournamentId and idempotencyKey required.');
  }

  const regRef = db.doc(`registrations/${tournamentId}_${uid}`);
  const userRef = db.doc(`users/${uid}`);
  const tourneyRef = db.doc(`tournaments/${tournamentId}`);
  const securityRef = db.doc('appSettings/security');

  return await db.runTransaction(async (tx) => {
    const existingReg = await tx.get(regRef);
    if (existingReg.exists) {
      return { ok: true, alreadyRegistered: true };
    }

    const [userSnap, tourneySnap, securitySnap] = await Promise.all([
      tx.get(userRef),
      tx.get(tourneyRef),
      tx.get(securityRef),
    ]);

    if (!userSnap.exists || !tourneySnap.exists) {
      throw new HttpsError('not-found', 'User or tournament not found.');
    }

    const user = userSnap.data()!;
    const tourney = tourneySnap.data()!;
    if (user.banStatus !== 'none' || user.tournamentRestricted) {
      throw new HttpsError('permission-denied', 'Account restricted from tournaments.');
    }
    if (tourney.status !== 'open' || tourney.registeredCount >= tourney.maxPlayers) {
      throw new HttpsError('failed-precondition', 'Tournament unavailable or full.');
    }

    const fee = Number(tourney.entryFee || 0);
    if (fee > 0 && !securitySnap.data()?.paidEntriesEnabled) {
      throw new HttpsError('failed-precondition', 'Paid entries disabled.');
    }
    if (Number(user.balance || 0) < fee) {
      throw new HttpsError('failed-precondition', 'Insufficient coins.');
    }

    const newBalance = Number(user.balance || 0) - fee;
    tx.set(regRef, {
      id: `${tournamentId}_${uid}`,
      tournamentId,
      uid,
      playerId: user.playerId,
      inGameName: user.inGameName,
      ffUid: user.ffUid || '',
      teamName,
      entryFeePaid: fee,
      idempotencyKey,
      status: 'confirmed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(tourneyRef, {
      registeredCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (fee > 0) {
      tx.update(userRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const txRef = db.collection('walletTransactions').doc();
      tx.set(txRef, {
        id: txRef.id,
        uid,
        playerId: user.playerId,
        type: 'tournament_entry',
        amount: -fee,
        balanceAfter: newBalance,
        referenceId: tournamentId,
        reason: `Entry fee: ${tourney.title}`,
        status: 'completed',
        createdBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { ok: true, newBalance };
  });
});

/**
 * Protected Room ID & Password retrieval for confirmed paid registrants only.
 */
export const getRoomCredentials = onCall(async (request) => {
  if (!request.auth || !request.auth.token.email_verified) {
    throw new HttpsError('permission-denied', 'Verified account required.');
  }
  const uid = request.auth.uid;
  const tournamentId = String(request.data?.tournamentId || '');
  const role = request.auth.token.role;

  if (role !== 'owner' && role !== 'moderator') {
    const regSnap = await db.doc(`registrations/${tournamentId}_${uid}`).get();
    if (!regSnap.exists || regSnap.data()?.status !== 'confirmed') {
      throw new HttpsError('permission-denied', 'Registration required.');
    }
  }

  const credSnap = await db.doc(`roomCredentials/${tournamentId}`).get();
  if (!credSnap.exists) {
    throw new HttpsError('not-found', 'Room credentials not set yet.');
  }
  return credSnap.data();
});

/**
 * Owner-only idempotent deposit approval/rejection.
 */
export const reviewDeposit = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Owner role required.');
  }
  const requestId = String(request.data?.requestId || '');
  const action = request.data?.action === 'approve' ? 'approve' : 'reject';
  const reason = String(request.data?.reason || '').slice(0, 300);

  return await db.runTransaction(async (tx) => {
    const depRef = db.doc(`depositRequests/${requestId}`);
    const depSnap = await tx.get(depRef);
    if (!depSnap.exists) throw new HttpsError('not-found', 'Deposit not found.');
    const dep = depSnap.data()!;
    if (dep.status !== 'pending') {
      throw new HttpsError('already-exists', `Already ${dep.status}.`);
    }

    tx.update(depRef, {
      status: action === 'approve' ? 'approved' : 'rejected',
      rejectionReason: action === 'reject' ? reason : '',
      reviewedBy: request.auth!.uid,
      reviewedAt: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (action === 'approve') {
      const userRef = db.doc(`users/${dep.uid}`);
      const userSnap = await tx.get(userRef);
      const newBalance = Number(userSnap.data()?.balance || 0) + Number(dep.coins);
      tx.update(userRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db.doc(`walletTransactions/tx_${requestId}`), {
        id: `tx_${requestId}`,
        uid: dep.uid,
        playerId: dep.playerId,
        type: 'deposit',
        amount: dep.coins,
        balanceAfter: newBalance,
        referenceId: requestId,
        reason: `Approved ${dep.method} deposit`,
        status: 'completed',
        createdBy: request.auth!.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const logRef = db.collection('adminLogs').doc();
    tx.set(logRef, {
      id: logRef.id,
      actorUid: request.auth!.uid,
      actorRole: 'owner',
      action: action === 'approve' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED',
      targetType: 'depositRequest',
      targetId: requestId,
      reason: reason || `Credited ${dep.coins} Coins`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  });
});

/**
 * Push notification helper via FCM multicast.
 */
export const broadcastPushNotification = onCall(async (request) => {
  if (!request.auth || !['owner', 'moderator'].includes(String(request.auth.token.role))) {
    throw new HttpsError('permission-denied', 'Staff role required.');
  }
  const title = String(request.data?.title || '').slice(0, 120);
  const body = String(request.data?.body || '').slice(0, 500);
  const targetUid = String(request.data?.targetUid || 'ALL');

  const notifRef = db.collection('notifications').doc();
  await notifRef.set({
    id: notifRef.id,
    targetUid,
    type: 'announcement',
    title,
    body,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (targetUid !== 'ALL') {
    const userSnap = await db.doc(`users/${targetUid}`).get();
    const token = userSnap.data()?.fcmToken;
    if (token) {
      await admin.messaging().send({ token, notification: { title, body } });
    }
  }
  return { ok: true };
});
