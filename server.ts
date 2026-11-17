import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import {
  verifyFirebaseIdToken,
  fsGetDoc,
  fsCommitWrites,
  type VerifiedTokenUser,
  type CommitWrite,
} from './src/server/firestoreRest.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function getOwnerAllowlist(): Set<string> {
  const raw = process.env.OWNER_ADMIN_ALLOWLIST || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

interface AuthenticatedRequest extends express.Request {
  authUser?: VerifiedTokenUser;
  idToken?: string;
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization Bearer token.' });
    return;
  }
  const user = await verifyFirebaseIdToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
    return;
  }
  req.authUser = user;
  req.idToken = token;
  next();
}

async function resolveUserRole(
  user: VerifiedTokenUser,
  idToken: string,
): Promise<{ role: 'owner' | 'moderator' | 'player'; permissions: Record<string, boolean> }> {
  const allowlist = getOwnerAllowlist();
  const inEnvAllowlist = user.emailVerified && allowlist.has(user.email.toLowerCase());

  // Check Firestore admins/{uid} via caller's verified Bearer token (evaluated by firestore.rules)
  const adminDoc = await fsGetDoc<{ uid: string; role: string }>(`admins/${user.uid}`, idToken);
  if (adminDoc.exists && adminDoc.data?.role === 'owner' && user.emailVerified) {
    return {
      role: 'owner',
      permissions: {
        reviewReports: true,
        monitorChat: true,
        manageTournaments: true,
        verifyResults: true,
        assistSupport: true,
        flagSuspicious: true,
      },
    };
  }

  // Bootstrap owner doc if authorized by env allowlist or rules bootstrap check (returns 404 instead of 403)
  if (user.emailVerified && (inEnvAllowlist || (adminDoc.status === 404 && !adminDoc.error))) {
    const createRes = await fsCommitWrites(
      [
        {
          docPath: `admins/${user.uid}`,
          data: { uid: user.uid, role: 'owner' },
          existsPrecondition: false,
          serverTimestampFields: ['createdAt'],
        },
      ],
      idToken,
    );
    if (createRes.ok) {
      return {
        role: 'owner',
        permissions: {
          reviewReports: true,
          monitorChat: true,
          manageTournaments: true,
          verifyResults: true,
          assistSupport: true,
          flagSuspicious: true,
        },
      };
    }
  }

  // Check active moderator record
  const modDoc = await fsGetDoc<{
    status: string;
    permissions?: Record<string, boolean>;
  }>(`moderators/${user.uid}`, idToken);

  if (modDoc.exists && modDoc.data?.status === 'active' && user.emailVerified) {
    return {
      role: 'moderator',
      permissions: modDoc.data.permissions || {},
    };
  }

  return { role: 'player', permissions: {} };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nexus-ff-arena', timestamp: new Date().toISOString() });
  });

  // 1. Server-side session & role verification (never exposes owner email)
  app.post('/api/auth/verify-session', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const roleInfo = await resolveUserRole(user, idToken);
      res.json({
        uid: user.uid,
        emailVerified: user.emailVerified,
        role: roleInfo.role,
        permissions: roleInfo.permissions,
      });
    } catch (err) {
      console.error('verify-session failed:', err);
      res.status(500).json({ error: 'Unable to verify session role.' });
    }
  });

  // 2. Atomic, idempotent tournament registration
  app.post('/api/tournaments/:id/register', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const tournamentId = req.params.id;
      const teamName = typeof req.body?.teamName === 'string' ? req.body.teamName.trim().slice(0, 64) : '';
      const idempotencyKey =
        typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.length >= 4
          ? req.body.idempotencyKey.slice(0, 128)
          : crypto.randomUUID();

      if (!user.emailVerified) {
        res.status(403).json({ error: 'Please verify your email address before registering for tournaments.' });
        return;
      }

      const regId = `${tournamentId}_${user.uid}`;
      const existingReg = await fsGetDoc(`registrations/${regId}`, idToken);
      if (existingReg.exists) {
        res.json({ ok: true, alreadyRegistered: true, registrationId: regId });
        return;
      }

      const [userDoc, tourneyDoc, securityDoc] = await Promise.all([
        fsGetDoc<{
          uid: string;
          playerId: string;
          inGameName: string;
          ffUid?: string;
          balance: number;
          banStatus: string;
          tournamentRestricted: boolean;
        }>(`users/${user.uid}`, idToken),
        fsGetDoc<{
          id: string;
          title: string;
          entryFee: number;
          maxPlayers: number;
          registeredCount: number;
          status: string;
          registrationDeadline: string;
        }>(`tournaments/${tournamentId}`, idToken),
        fsGetDoc<{ paidEntriesEnabled?: boolean }>('appSettings/security', idToken),
      ]);

      if (!userDoc.exists || !userDoc.data) {
        res.status(404).json({ error: 'Complete your player profile before registering.' });
        return;
      }
      if (userDoc.data.banStatus !== 'none' || userDoc.data.tournamentRestricted) {
        res.status(403).json({ error: 'Your account is restricted from tournament registration.' });
        return;
      }
      if (!tourneyDoc.exists || !tourneyDoc.data) {
        res.status(404).json({ error: 'Tournament not found.' });
        return;
      }

      const t = tourneyDoc.data;
      if (t.status !== 'open') {
        res.status(400).json({ error: 'Registration is closed for this tournament.' });
        return;
      }
      if (t.registrationDeadline && new Date(t.registrationDeadline).getTime() < Date.now()) {
        res.status(400).json({ error: 'Registration deadline has passed.' });
        return;
      }
      if (t.registeredCount >= t.maxPlayers) {
        res.status(400).json({ error: 'Tournament slots are full.' });
        return;
      }

      const fee = Number(t.entryFee || 0);
      if (fee > 0 && !securityDoc.data?.paidEntriesEnabled) {
        res.status(403).json({ error: 'Paid tournament entries are currently disabled by Security Settings.' });
        return;
      }
      if (userDoc.data.balance < fee) {
        res.status(400).json({ error: `Insufficient balance. Need ${fee} Coins, have ${userDoc.data.balance} Coins.` });
        return;
      }

      const newBalance = userDoc.data.balance - fee;
      const writes: CommitWrite[] = [
        {
          docPath: `registrations/${regId}`,
          existsPrecondition: false,
          data: {
            id: regId,
            tournamentId,
            uid: user.uid,
            playerId: userDoc.data.playerId,
            inGameName: userDoc.data.inGameName,
            ffUid: userDoc.data.ffUid || '',
            teamName,
            entryFeePaid: fee,
            idempotencyKey,
            status: 'confirmed',
          },
          serverTimestampFields: ['createdAt'],
        },
        {
          docPath: `tournaments/${tournamentId}`,
          existsPrecondition: true,
          data: {
            registeredCount: t.registeredCount + 1,
          },
          updateMask: ['registeredCount'],
          serverTimestampFields: ['updatedAt'],
        },
      ];

      if (fee > 0) {
        const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        writes.push({
          docPath: `users/${user.uid}`,
          existsPrecondition: true,
          data: { balance: newBalance },
          updateMask: ['balance'],
          serverTimestampFields: ['updatedAt'],
        });
        writes.push({
          docPath: `walletTransactions/${txId}`,
          existsPrecondition: false,
          data: {
            id: txId,
            uid: user.uid,
            playerId: userDoc.data.playerId,
            type: 'tournament_entry',
            amount: -fee,
            balanceAfter: newBalance,
            referenceId: tournamentId,
            reason: `Entry fee for ${t.title}`.slice(0, 300),
            status: 'completed',
            createdBy: user.uid,
          },
          serverTimestampFields: ['createdAt'],
        });
      }

      const commitRes = await fsCommitWrites(writes, idToken);
      if (!commitRes.ok) {
        res.status(400).json({ error: 'Registration failed security validation or slot conflict.', details: commitRes.error });
        return;
      }

      res.json({ ok: true, registrationId: regId, newBalance });
    } catch (err) {
      console.error('Tournament register error:', err);
      res.status(500).json({ error: 'Registration request failed.' });
    }
  });

  // 3. Protected Room ID & Password endpoint (only confirmed registrants or staff)
  app.get('/api/tournaments/:id/room-credentials', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const tournamentId = req.params.id;
      const roleInfo = await resolveUserRole(user, idToken);

      const isAuthorizedStaff =
        roleInfo.role === 'owner' ||
        (roleInfo.role === 'moderator' && Boolean(roleInfo.permissions.manageTournaments));

      if (!isAuthorizedStaff) {
        if (!user.emailVerified) {
          res.status(403).json({ error: 'Verify your email to access room credentials.' });
          return;
        }
        const regId = `${tournamentId}_${user.uid}`;
        const reg = await fsGetDoc<{ status: string }>(`registrations/${regId}`, idToken);
        if (!reg.exists || reg.data?.status !== 'confirmed') {
          res.status(403).json({ error: 'Room credentials are visible only to registered participants.' });
          return;
        }
      }

      const creds = await fsGetDoc<{ roomId: string; roomPassword: string; notes?: string }>(
        `roomCredentials/${tournamentId}`,
        idToken,
      );
      if (!creds.exists || !creds.data) {
        res.status(404).json({ error: 'Room ID and Password have not been published by admin yet.' });
        return;
      }

      res.json({
        tournamentId,
        roomId: creds.data.roomId,
        roomPassword: creds.data.roomPassword,
        notes: creds.data.notes || '',
      });
    } catch (err) {
      console.error('Room credentials fetch failed:', err);
      res.status(500).json({ error: 'Could not retrieve room credentials.' });
    }
  });

  // 4. Owner Deposit Review (Atomic & Idempotent)
  app.post('/api/admin/deposits/:id/review', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const roleInfo = await resolveUserRole(user, idToken);
      if (roleInfo.role !== 'owner') {
        res.status(403).json({ error: 'Only Owner Admin can approve or reject deposits.' });
        return;
      }

      const reqId = req.params.id;
      const action = req.body?.action === 'approve' ? 'approve' : req.body?.action === 'reject' ? 'reject' : null;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
      if (!action) {
        res.status(400).json({ error: 'Invalid review action.' });
        return;
      }
      if (action === 'reject' && reason.length < 3) {
        res.status(400).json({ error: 'Rejection reason is required.' });
        return;
      }

      const depRes = await fsGetDoc<{
        id: string;
        uid: string;
        playerId: string;
        coins: number;
        amountPkr: number;
        method: string;
        status: string;
      }>(`depositRequests/${reqId}`, idToken);

      if (!depRes.exists || !depRes.data) {
        res.status(404).json({ error: 'Deposit request not found.' });
        return;
      }
      if (depRes.data.status !== 'pending') {
        res.status(409).json({ error: `Deposit request already ${depRes.data.status}.` });
        return;
      }

      const dep = depRes.data;
      const nowIso = new Date().toISOString();
      const logId = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

      const writes: CommitWrite[] = [
        {
          docPath: `depositRequests/${reqId}`,
          existsPrecondition: true,
          data: {
            status: action === 'approve' ? 'approved' : 'rejected',
            rejectionReason: action === 'reject' ? reason : '',
            reviewedBy: user.uid,
            reviewedAt: nowIso,
          },
          updateMask: ['status', 'rejectionReason', 'reviewedBy', 'reviewedAt'],
          serverTimestampFields: ['updatedAt'],
        },
        {
          docPath: `adminLogs/${logId}`,
          existsPrecondition: false,
          data: {
            id: logId,
            actorUid: user.uid,
            actorRole: 'owner',
            action: action === 'approve' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED',
            targetType: 'depositRequest',
            targetId: reqId,
            reason: action === 'reject' ? reason : `Credited ${dep.coins} Coins (${dep.method})`,
            details: `Player ${dep.playerId} | PKR ${dep.amountPkr}`,
          },
          serverTimestampFields: ['createdAt'],
        },
        {
          docPath: `notifications/${notifId}`,
          existsPrecondition: false,
          data: {
            id: notifId,
            targetUid: dep.uid,
            type: 'wallet',
            title: action === 'approve' ? 'Deposit Approved' : 'Deposit Rejected',
            body:
              action === 'approve'
                ? `${dep.coins} Coins credited from your ${dep.method} deposit.`
                : `Your ${dep.method} deposit was rejected: ${reason}`,
            link: 'wallet',
            read: false,
          },
          serverTimestampFields: ['createdAt'],
        },
      ];

      if (action === 'approve') {
        const playerRes = await fsGetDoc<{ balance: number }>(`users/${dep.uid}`, idToken);
        if (!playerRes.exists || !playerRes.data) {
          res.status(404).json({ error: 'Target player profile not found.' });
          return;
        }
        const newBalance = Number(playerRes.data.balance || 0) + Number(dep.coins);
        const txId = `tx_${reqId}`; // Deterministic ID guarantees idempotency!
        writes.push({
          docPath: `users/${dep.uid}`,
          existsPrecondition: true,
          data: { balance: newBalance },
          updateMask: ['balance'],
          serverTimestampFields: ['updatedAt'],
        });
        writes.push({
          docPath: `walletTransactions/${txId}`,
          existsPrecondition: false,
          data: {
            id: txId,
            uid: dep.uid,
            playerId: dep.playerId,
            type: 'deposit',
            amount: dep.coins,
            balanceAfter: newBalance,
            referenceId: reqId,
            reason: `Approved ${dep.method} deposit (PKR ${dep.amountPkr})`,
            status: 'completed',
            createdBy: user.uid,
          },
          serverTimestampFields: ['createdAt'],
        });
      }

      const commitRes = await fsCommitWrites(writes, idToken);
      if (!commitRes.ok) {
        res.status(400).json({ error: 'Failed to commit deposit review.', details: commitRes.error });
        return;
      }

      res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected' });
    } catch (err) {
      console.error('Deposit review error:', err);
      res.status(500).json({ error: 'Deposit review failed.' });
    }
  });

  // 5. Owner Withdrawal Review
  app.post('/api/admin/withdrawals/:id/review', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const roleInfo = await resolveUserRole(user, idToken);
      if (roleInfo.role !== 'owner') {
        res.status(403).json({ error: 'Only Owner Admin can review withdrawals.' });
        return;
      }

      const reqId = req.params.id;
      const action = req.body?.action === 'approve' ? 'approve' : req.body?.action === 'reject' ? 'reject' : null;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
      if (!action) {
        res.status(400).json({ error: 'Invalid review action.' });
        return;
      }
      if (action === 'reject' && reason.length < 3) {
        res.status(400).json({ error: 'Rejection reason is required.' });
        return;
      }

      const wdRes = await fsGetDoc<{
        id: string;
        uid: string;
        playerId: string;
        coinsAmount: number;
        pkrAmount: number;
        method: string;
        status: string;
      }>(`withdrawalRequests/${reqId}`, idToken);

      if (!wdRes.exists || !wdRes.data) {
        res.status(404).json({ error: 'Withdrawal request not found.' });
        return;
      }
      if (wdRes.data.status !== 'pending') {
        res.status(409).json({ error: `Withdrawal already ${wdRes.data.status}.` });
        return;
      }

      const wd = wdRes.data;
      const nowIso = new Date().toISOString();
      const logId = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

      const writes: CommitWrite[] = [
        {
          docPath: `withdrawalRequests/${reqId}`,
          existsPrecondition: true,
          data: {
            status: action === 'approve' ? 'approved' : 'rejected',
            rejectionReason: action === 'reject' ? reason : '',
            reviewedBy: user.uid,
            reviewedAt: nowIso,
          },
          updateMask: ['status', 'rejectionReason', 'reviewedBy', 'reviewedAt'],
          serverTimestampFields: ['updatedAt'],
        },
        {
          docPath: `adminLogs/${logId}`,
          existsPrecondition: false,
          data: {
            id: logId,
            actorUid: user.uid,
            actorRole: 'owner',
            action: action === 'approve' ? 'WITHDRAWAL_APPROVED' : 'WITHDRAWAL_REJECTED',
            targetType: 'withdrawalRequest',
            targetId: reqId,
            reason: action === 'reject' ? reason : `Approved ${wd.coinsAmount} Coins payout via ${wd.method}`,
            details: `Player ${wd.playerId} | PKR ${wd.pkrAmount}`,
          },
          serverTimestampFields: ['createdAt'],
        },
        {
          docPath: `notifications/${notifId}`,
          existsPrecondition: false,
          data: {
            id: notifId,
            targetUid: wd.uid,
            type: 'wallet',
            title: action === 'approve' ? 'Withdrawal Approved' : 'Withdrawal Rejected',
            body:
              action === 'approve'
                ? `Your withdrawal of ${wd.coinsAmount} Coins (PKR ${wd.pkrAmount}) via ${wd.method} was approved.`
                : `Your withdrawal request was rejected: ${reason}`,
            link: 'wallet',
            read: false,
          },
          serverTimestampFields: ['createdAt'],
        },
      ];

      if (action === 'approve') {
        const playerRes = await fsGetDoc<{ balance: number }>(`users/${wd.uid}`, idToken);
        if (!playerRes.exists || !playerRes.data) {
          res.status(404).json({ error: 'Player profile not found.' });
          return;
        }
        const currentBal = Number(playerRes.data.balance || 0);
        if (currentBal < wd.coinsAmount) {
          res.status(400).json({ error: 'Player no longer has sufficient coin balance for this withdrawal.' });
          return;
        }
        const newBalance = currentBal - wd.coinsAmount;
        const txId = `wd_${reqId}`;
        writes.push({
          docPath: `users/${wd.uid}`,
          existsPrecondition: true,
          data: { balance: newBalance },
          updateMask: ['balance'],
          serverTimestampFields: ['updatedAt'],
        });
        writes.push({
          docPath: `walletTransactions/${txId}`,
          existsPrecondition: false,
          data: {
            id: txId,
            uid: wd.uid,
            playerId: wd.playerId,
            type: 'withdrawal',
            amount: -wd.coinsAmount,
            balanceAfter: newBalance,
            referenceId: reqId,
            reason: `Withdrawal payout via ${wd.method} (PKR ${wd.pkrAmount})`,
            status: 'completed',
            createdBy: user.uid,
          },
          serverTimestampFields: ['createdAt'],
        });
      }

      const commitRes = await fsCommitWrites(writes, idToken);
      if (!commitRes.ok) {
        res.status(400).json({ error: 'Failed to review withdrawal.', details: commitRes.error });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Withdrawal review error:', err);
      res.status(500).json({ error: 'Withdrawal review failed.' });
    }
  });

  // 6. Owner Manual Coin Adjustment & Rewards
  app.post('/api/admin/coins/adjust', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const roleInfo = await resolveUserRole(user, idToken);
      if (roleInfo.role !== 'owner') {
        res.status(403).json({ error: 'Only Owner Admin can adjust player coins.' });
        return;
      }

      const targetUid = typeof req.body?.targetUid === 'string' ? req.body.targetUid.trim() : '';
      const mode = req.body?.mode as 'manual_credit' | 'manual_debit' | 'reward';
      const amount = Math.floor(Number(req.body?.amount || 0));
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';

      if (!targetUid || !['manual_credit', 'manual_debit', 'reward'].includes(mode) || amount <= 0 || reason.length < 3) {
        res.status(400).json({ error: 'Valid targetUid, mode, positive integer amount, and reason are required.' });
        return;
      }

      const playerRes = await fsGetDoc<{ uid: string; playerId: string; balance: number }>(
        `users/${targetUid}`,
        idToken,
      );
      if (!playerRes.exists || !playerRes.data) {
        res.status(404).json({ error: 'Target player not found.' });
        return;
      }

      const currentBal = Number(playerRes.data.balance || 0);
      const signedDelta = mode === 'manual_debit' ? -amount : amount;
      const newBalance = currentBal + signedDelta;
      if (newBalance < 0) {
        res.status(400).json({ error: `Cannot deduct ${amount} Coins from balance of ${currentBal} Coins.` });
        return;
      }

      const txId = `tx_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const logId = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

      const commitRes = await fsCommitWrites(
        [
          {
            docPath: `users/${targetUid}`,
            existsPrecondition: true,
            data: { balance: newBalance },
            updateMask: ['balance'],
            serverTimestampFields: ['updatedAt'],
          },
          {
            docPath: `walletTransactions/${txId}`,
            existsPrecondition: false,
            data: {
              id: txId,
              uid: targetUid,
              playerId: playerRes.data.playerId,
              type: mode,
              amount: signedDelta,
              balanceAfter: newBalance,
              reason,
              status: 'completed',
              createdBy: user.uid,
            },
            serverTimestampFields: ['createdAt'],
          },
          {
            docPath: `adminLogs/${logId}`,
            existsPrecondition: false,
            data: {
              id: logId,
              actorUid: user.uid,
              actorRole: 'owner',
              action: mode.toUpperCase(),
              targetType: 'user',
              targetId: targetUid,
              reason,
              details: `${playerRes.data.playerId}: ${currentBal} -> ${newBalance} Coins`,
            },
            serverTimestampFields: ['createdAt'],
          },
          {
            docPath: `notifications/${notifId}`,
            existsPrecondition: false,
            data: {
              id: notifId,
              targetUid,
              type: 'wallet',
              title: mode === 'reward' ? 'Arena Reward Received' : mode === 'manual_credit' ? 'Coins Credited' : 'Coins Deducted',
              body: `${signedDelta > 0 ? '+' : ''}${signedDelta} Coins: ${reason}`,
              link: 'wallet',
              read: false,
            },
            serverTimestampFields: ['createdAt'],
          },
        ],
        idToken,
      );

      if (!commitRes.ok) {
        res.status(400).json({ error: 'Coin adjustment failed.', details: commitRes.error });
        return;
      }

      res.json({ ok: true, newBalance });
    } catch (err) {
      console.error('Manual coin adjustment error:', err);
      res.status(500).json({ error: 'Failed to adjust coins.' });
    }
  });

  // 7. Verified Match Results & Leaderboard Update
  app.post('/api/admin/tournaments/:id/results', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const idToken = req.idToken!;
      const roleInfo = await resolveUserRole(user, idToken);
      const canVerify =
        roleInfo.role === 'owner' ||
        (roleInfo.role === 'moderator' && Boolean(roleInfo.permissions.verifyResults));
      if (!canVerify) {
        res.status(403).json({ error: 'Unauthorized to announce verified match results.' });
        return;
      }

      const tournamentId = req.params.id;
      const winners = Array.isArray(req.body?.winners) ? req.body.winners.slice(0, 10) : [];
      const creditPrizes = Boolean(req.body?.creditPrizes) && roleInfo.role === 'owner';

      if (winners.length === 0) {
        res.status(400).json({ error: 'Provide at least one verified winner entry.' });
        return;
      }

      const tourneyRes = await fsGetDoc<{ id: string; title: string; resultsAnnounced: boolean }>(
        `tournaments/${tournamentId}`,
        idToken,
      );
      if (!tourneyRes.exists || !tourneyRes.data) {
        res.status(404).json({ error: 'Tournament not found.' });
        return;
      }

      const writes: CommitWrite[] = [
        {
          docPath: `tournaments/${tournamentId}`,
          existsPrecondition: true,
          data: {
            status: 'completed',
            resultsAnnounced: true,
            winners,
          },
          updateMask: ['status', 'resultsAnnounced', 'winners'],
          serverTimestampFields: ['updatedAt'],
        },
      ];

      for (const w of winners) {
        if (!w?.uid) continue;
        const playerRes = await fsGetDoc<{
          uid: string;
          playerId: string;
          inGameName: string;
          avatarUrl?: string;
          avatarImageId?: string;
          country?: string;
          balance: number;
          matches: number;
          wins: number;
          eliminations: number;
          mvpCount: number;
          arenaPoints: number;
        }>(`users/${w.uid}`, idToken);

        if (!playerRes.exists || !playerRes.data) continue;
        const p = playerRes.data;
        const lbRes = await fsGetDoc<{
          weeklyPoints?: number;
          monthlyPoints?: number;
          badges?: string[];
        }>(`leaderboard/${w.uid}`, idToken);

        const kills = Math.max(0, Number(w.kills || 0));
        const won = Number(w.placement) === 1 ? 1 : 0;
        const mvp = w.mvp ? 1 : 0;
        const pointsEarned = (won ? 100 : Math.max(20, 60 - Number(w.placement || 2) * 15)) + kills * 5 + mvp * 25;
        const prizeCoins = creditPrizes ? Math.max(0, Number(w.prizeCoins || 0)) : 0;

        const nextMatches = Number(p.matches || 0) + 1;
        const nextWins = Number(p.wins || 0) + won;
        const nextElims = Number(p.eliminations || 0) + kills;
        const nextMvp = Number(p.mvpCount || 0) + mvp;
        const nextPoints = Number(p.arenaPoints || 0) + pointsEarned;
        const nextWeekly = Number(lbRes.data?.weeklyPoints || 0) + pointsEarned;
        const nextMonthly = Number(lbRes.data?.monthlyPoints || 0) + pointsEarned;
        const existingBadges = Array.isArray(lbRes.data?.badges) ? lbRes.data!.badges! : [];
        const badges = won && !existingBadges.includes('Champion') ? ['Champion', ...existingBadges].slice(0, 10) : existingBadges.slice(0, 10);

        writes.push({
          docPath: `leaderboard/${w.uid}`,
          existsPrecondition: lbRes.exists,
          data: {
            uid: p.uid,
            playerId: p.playerId,
            inGameName: p.inGameName,
            avatarUrl: p.avatarUrl || '',
            avatarImageId: p.avatarImageId || '',
            country: p.country || 'PK',
            wins: nextWins,
            matches: nextMatches,
            mvpCount: nextMvp,
            eliminations: nextElims,
            arenaPoints: nextPoints,
            weeklyPoints: nextWeekly,
            monthlyPoints: nextMonthly,
            badges,
          },
          serverTimestampFields: ['updatedAt'],
        });

        if (roleInfo.role === 'owner') {
          const nextBalance = Number(p.balance || 0) + prizeCoins;
          writes.push({
            docPath: `users/${w.uid}`,
            existsPrecondition: true,
            data: {
              matches: nextMatches,
              wins: nextWins,
              eliminations: nextElims,
              mvpCount: nextMvp,
              arenaPoints: nextPoints,
              balance: nextBalance,
            },
            updateMask: ['matches', 'wins', 'eliminations', 'mvpCount', 'arenaPoints', 'balance'],
            serverTimestampFields: ['updatedAt'],
          });

          if (prizeCoins > 0) {
            const txId = `prize_${tournamentId}_${w.uid}`;
            writes.push({
              docPath: `walletTransactions/${txId}`,
              existsPrecondition: false,
              data: {
                id: txId,
                uid: p.uid,
                playerId: p.playerId,
                type: 'tournament_prize',
                amount: prizeCoins,
                balanceAfter: nextBalance,
                referenceId: tournamentId,
                reason: `Placement #${w.placement} prize for ${tourneyRes.data.title}`.slice(0, 300),
                status: 'completed',
                createdBy: user.uid,
              },
              serverTimestampFields: ['createdAt'],
            });
          }
        }
      }

      const logId = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      writes.push({
        docPath: `adminLogs/${logId}`,
        existsPrecondition: false,
        data: {
          id: logId,
          actorUid: user.uid,
          actorRole: roleInfo.role === 'owner' ? 'owner' : 'moderator',
          action: 'MATCH_RESULTS_ANNOUNCED',
          targetType: 'tournament',
          targetId: tournamentId,
          reason: `Published ${winners.length} verified placements`,
          details: tourneyRes.data.title,
        },
        serverTimestampFields: ['createdAt'],
      });

      const commitRes = await fsCommitWrites(writes, idToken);
      if (!commitRes.ok) {
        res.status(400).json({ error: 'Failed to publish verified results.', details: commitRes.error });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Publish results error:', err);
      res.status(500).json({ error: 'Failed to publish match results.' });
    }
  });

  const httpServer = createServer(app);

  // Vite Dev Middleware or Static Production Hosting
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: { server: httpServer, path: '/__vite_hmr' },
      },
      appType: 'mpa',
    });
    app.use(vite.middlewares);

    app.get(/^\/admin(\/.*)?$/, async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'admin.html');
        const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });

    app.get(/^(?!\/api\/).*$/, async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        const rawHtml = fs.readFileSync(htmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => {
      res.sendFile(path.join(distDir, 'admin.html'));
    });
    app.get(/^(?!\/api\/).*$/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // ==================== WEBSOCKET SIGNALING & PRESENCE ====================
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });
  const connectedSockets = new Map<string, Set<WebSocket>>();

  function sendToUser(targetUid: string, payload: Record<string, unknown>) {
    const sockets = connectedSockets.get(targetUid);
    if (!sockets) return;
    const raw = JSON.stringify(payload);
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(raw);
      }
    }
  }

  wss.on('connection', (ws) => {
    let authedUid: string | null = null;
    let authedToken: string | null = null;

    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type: string;
          token?: string;
          targetUid?: string;
          payload?: Record<string, unknown>;
        };

        if (msg.type === 'auth' && msg.token) {
          const verified = await verifyFirebaseIdToken(msg.token);
          if (!verified) {
            ws.send(JSON.stringify({ type: 'auth:error', error: 'Invalid token' }));
            ws.close();
            return;
          }
          authedUid = verified.uid;
          authedToken = msg.token;
          if (!connectedSockets.has(authedUid)) {
            connectedSockets.set(authedUid, new Set());
          }
          connectedSockets.get(authedUid)!.add(ws);
          ws.send(JSON.stringify({ type: 'auth:ok', uid: authedUid }));
          return;
        }

        if (!authedUid || !authedToken) {
          ws.send(JSON.stringify({ type: 'error', error: 'Authenticate first.' }));
          return;
        }

        const targetUid = msg.targetUid;
        if (!targetUid) return;

        // Verify friendship status before relaying WebRTC or live chat events
        if (
          msg.type === 'call:offer' ||
          msg.type === 'call:answer' ||
          msg.type === 'call:ice' ||
          msg.type === 'call:reject' ||
          msg.type === 'call:end' ||
          msg.type === 'call:screen-share' ||
          msg.type === 'chat:typing'
        ) {
          const chatId = [authedUid, targetUid].sort().join('_');
          const friendDoc = await fsGetDoc<{ status: string }>(`friends/${chatId}`, authedToken);
          if (!friendDoc.exists || friendDoc.data?.status !== 'accepted') {
            ws.send(JSON.stringify({ type: 'call:error', error: 'Only accepted friends can call or message.' }));
            return;
          }

          if (msg.type === 'call:offer' && !connectedSockets.has(targetUid)) {
            ws.send(JSON.stringify({ type: 'call:offline', targetUid }));
            return;
          }

          sendToUser(targetUid, {
            type: msg.type,
            fromUid: authedUid,
            payload: msg.payload || {},
          });
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on('close', () => {
      if (authedUid && connectedSockets.has(authedUid)) {
        const set = connectedSockets.get(authedUid)!;
        set.delete(ws);
        if (set.size === 0) {
          connectedSockets.delete(authedUid);
        }
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS FF ARENA & ADMIN server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
