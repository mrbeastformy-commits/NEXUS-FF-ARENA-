# NEXUS FF ARENA & ADMIN — Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Zero-PII Public Profiles**: `/users/{uid}` contains only public gameplay metadata (`uid`, `playerId`, `inGameName`, `ffUid`, `country`, `avatarUrl`, `balance`, stats, ban status). Email addresses live exclusively in `/users/{uid}/private/info`, readable only by the owning user and the Owner Admin.
2. **Server-Authoritative Balances**: Players can NEVER create or modify `balance`, `matches`, `wins`, `eliminations`, `mvpCount`, `arenaPoints`, `rank`, `banStatus`, `chatRestricted`, or `tournamentRestricted` on `/users/{uid}`, except via an atomic registration transaction deducting exact `tournament.entryFee` with `existsAfter` verification when `paidEntriesEnabled` is active.
3. **Owner & Moderator Isolation**: No user can self-assign `admins/{uid}` or `moderators/{uid}`. Owner access requires `email_verified == true` and verified owner identity. Moderators cannot read `appSettings/paymentAccounts`, `depositRequests`, `withdrawalRequests`, or `adminLogs`, and cannot modify `appSettings/security` or `admins`.
4. **Protected Room Credentials**: `/roomCredentials/{tournamentId}` cannot be listed by players (`allow list: if isStaff()`) and can only be read by staff or a verified player whose confirmed registration `/registrations/{tournamentId}_{uid}` exists.
5. **Accepted Friends Only Chat**: `/messages/{chatId}/items/{messageId}` enforces the Master Gate on `/messages/{chatId}` participants AND checks `/friends/{chatId}.data.status == 'accepted'` AND checks the sender is not `chatRestricted`.
6. **Immutable Audit & Ban Logs**: `/adminLogs/{logId}`, `/bans/{banId}`, and `/walletTransactions/{txId}` are strictly append-only (`allow update, delete: if false`).
7. **Terminal State Locking**: Approved/rejected `depositRequests` and `withdrawalRequests` cannot be mutated again once resolved, except by Owner override.

## 2. The "Dirty Dozen" Attack Payloads
1. **Self-Credited Balance**: Player updates `/users/{uid}` with `{ balance: 999999 }`. -> `PERMISSION_DENIED`.
2. **Shadow Admin Escalation**: Player creates `/admins/{uid}` with `{ uid, role: 'owner' }`. -> `PERMISSION_DENIED`.
3. **Email Spoofing Attack**: Unverified account (`email_verified: false`) claims owner email to read `/adminLogs`. -> `PERMISSION_DENIED`.
4. **PII Cross-Read**: Player A calls `get` on `/users/{playerB}/private/info`. -> `PERMISSION_DENIED`.
5. **Room Password Scraping**: Unregistered player calls `get` or `list` on `/roomCredentials/{tournamentId}`. -> `PERMISSION_DENIED`.
6. **Unauthorized Chat Injection**: Non-friend sends message to `/messages/{chatId}/items/{msgId}`. -> `PERMISSION_DENIED`.
7. **Moderator Payment Credential Access**: Moderator attempts `get` on `/appSettings/paymentAccounts` or `/depositRequests`. -> `PERMISSION_DENIED`.
8. **Audit Log Tampering**: Staff or player attempts `update` or `delete` on `/adminLogs/{logId}`. -> `PERMISSION_DENIED`.
9. **Double-Approve Deposit Replay**: Attempt to change `depositRequests/{id}` from `approved` back to `pending` without Owner override. -> `PERMISSION_DENIED`.
10. **Ghost Field Injection**: Player creates `/depositRequests/{id}` with extra field `status: 'approved'` or `isVerified: true`. -> `PERMISSION_DENIED`.
11. **ID Poisoning (1KB ID)**: Write document with 500-character document ID containing invalid characters. -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Create user or report with forged past/future `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`.
