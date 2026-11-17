export const TOURNAMENT_CATEGORIES = [
  'CS Ranked',
  'Battle Royale',
  'Clash Squad',
  'Lone Wolf',
  '1v1 Custom',
  '2v2 Custom',
  'Squad Custom',
  'Special Events',
] as const;

export type TournamentCategory = (typeof TOURNAMENT_CATEGORIES)[number];

export const COIN_PACKAGES = [
  { id: 'pkg_100', amountPkr: 100, coins: 120, bonusLabel: '+20 Bonus' },
  { id: 'pkg_200', amountPkr: 200, coins: 220, bonusLabel: '+20 Bonus' },
  { id: 'pkg_300', amountPkr: 300, coins: 330, bonusLabel: '+30 Bonus' },
  { id: 'pkg_500', amountPkr: 500, coins: 550, bonusLabel: '+50 Bonus' },
  { id: 'pkg_1000', amountPkr: 1000, coins: 1150, bonusLabel: '+150 Bonus' },
] as const;

export type StaffRole = 'owner' | 'moderator' | 'player';

export interface ModeratorPermissions {
  reviewReports: boolean;
  monitorChat: boolean;
  manageTournaments: boolean;
  verifyResults: boolean;
  assistSupport: boolean;
  flagSuspicious: boolean;
}

export interface UserPublicProfile {
  uid: string;
  playerId: string;
  ffUid?: string;
  inGameName: string;
  country: string;
  avatarUrl?: string;
  avatarImageId?: string;
  balance: number;
  matches: number;
  wins: number;
  eliminations: number;
  mvpCount: number;
  arenaPoints: number;
  rank: number;
  isOnline: boolean;
  lastSeen?: unknown;
  banStatus: 'none' | 'suspended' | 'banned';
  chatRestricted: boolean;
  tournamentRestricted: boolean;
  banReason?: string;
  banExpiresAt?: string;
  fcmToken?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ModeratorRecord {
  uid: string;
  playerId: string;
  inGameName: string;
  status: 'active' | 'suspended' | 'removed';
  permissions: ModeratorPermissions;
  addedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentWinner {
  playerId: string;
  uid: string;
  inGameName: string;
  placement: number;
  prizeCoins: number;
  kills: number;
  mvp?: boolean;
}

export interface Tournament {
  id: string;
  title: string;
  category: TournamentCategory;
  thumbnailUrl?: string;
  thumbnailImageId?: string;
  coverUrl?: string;
  coverImageId?: string;
  entryFee: number;
  prizePool: number;
  prizeDistribution?: string;
  registrationDeadline: string;
  startTime: string;
  maxPlayers: number;
  registeredCount: number;
  teamSize: number;
  status: 'draft' | 'open' | 'closed' | 'live' | 'completed' | 'cancelled';
  rulesText?: string;
  resultsAnnounced: boolean;
  winners?: TournamentWinner[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Registration {
  id: string;
  tournamentId: string;
  uid: string;
  playerId: string;
  inGameName: string;
  ffUid?: string;
  teamName?: string;
  entryFeePaid: number;
  idempotencyKey: string;
  status: 'confirmed' | 'cancelled';
  createdAt?: unknown;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  imageId?: string;
  linkTournamentId?: string;
  order: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  playerId?: string;
  type: 'deposit' | 'withdrawal' | 'tournament_entry' | 'tournament_prize' | 'manual_credit' | 'manual_debit' | 'reward';
  amount: number;
  balanceAfter: number;
  referenceId?: string;
  reason: string;
  status: 'completed' | 'pending' | 'rejected';
  createdBy: string;
  createdAt?: unknown;
}

export interface DepositRequest {
  id: string;
  uid: string;
  playerId: string;
  inGameName: string;
  amountPkr: number;
  coins: number;
  method: 'EasyPaisa' | 'JazzCash';
  screenshotImageId?: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WithdrawalRequest {
  id: string;
  uid: string;
  playerId: string;
  inGameName: string;
  coinsAmount: number;
  pkrAmount: number;
  method: 'EasyPaisa' | 'JazzCash';
  accountNumber: string;
  accountTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Friendship {
  id: string;
  users: string[];
  requesterUid: string;
  recipientUid: string;
  status: 'pending' | 'accepted' | 'blocked';
  blockedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  participants?: string[];
  senderUid: string;
  recipientUid: string;
  type: 'text' | 'image' | 'video';
  text?: string;
  mediaImageId?: string;
  mediaUrl?: string;
  createdAt?: unknown;
}

export type ImagePurpose = 'deposit' | 'avatar' | 'chat' | 'banner' | 'tournament' | 'healthcheck';

export interface FirestoreImageDoc {
  ownerUid: string;
  purpose: ImagePurpose;
  chatId?: string;
  dataUrl: string;
  sizeBytes: number;
  createdAt?: unknown;
}

export function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const t = new Date(ts).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export interface Report {
  id: string;
  reporterUid: string;
  reporterPlayerId?: string;
  targetUid: string;
  targetPlayerId?: string;
  category: 'chat_abuse' | 'cheating' | 'scam' | 'harassment' | 'other';
  reason: string;
  chatId?: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  moderatorNotes?: string;
  reviewedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BanRecord {
  id: string;
  uid: string;
  playerId?: string;
  type: 'temporary_suspend' | 'permanent_ban' | 'chat_restrict' | 'tournament_restrict' | 'unban';
  reason: string;
  durationHours?: number;
  expiresAt?: string;
  issuedBy: string;
  issuedByRole: 'owner' | 'moderator';
  createdAt?: unknown;
}

export interface LeaderboardEntry {
  uid: string;
  playerId: string;
  inGameName: string;
  avatarUrl?: string;
  avatarImageId?: string;
  country?: string;
  wins: number;
  matches: number;
  mvpCount: number;
  eliminations: number;
  arenaPoints: number;
  weeklyPoints: number;
  monthlyPoints: number;
  badges?: string[];
  updatedAt?: unknown;
}

export interface NotificationItem {
  id: string;
  targetUid: string;
  type: 'tournament' | 'match_reminder' | 'registration' | 'announcement' | 'wallet' | 'friend' | 'chat' | 'support' | 'report';
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt?: unknown;
}

export interface SupportReply {
  senderUid: string;
  senderRole: 'player' | 'moderator' | 'owner';
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  uid: string;
  playerId: string;
  subject: string;
  category?: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  replies: SupportReply[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminLog {
  id: string;
  actorUid: string;
  actorRole: 'owner' | 'moderator';
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  details?: string;
  createdAt?: unknown;
}

export interface SecuritySettings {
  id: string;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  paidEntriesEnabled: boolean;
  maintenanceMode: boolean;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface PaymentAccountSettings {
  id: string;
  easyPaisaTitle: string;
  easyPaisaNumber: string;
  easyPaisaInstructions: string;
  jazzCashTitle: string;
  jazzCashNumber: string;
  jazzCashInstructions: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface MusicSettings {
  id: string;
  trackTitle: string;
  audioUrl: string;
  activeSongId?: string;
  revision?: number;
  storagePath?: string;
  licenseConfirmed: boolean;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface ArenaSong {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  active: boolean;
  licenseConfirmed: boolean;
  revision: number;
  uploadedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ArenaSongChunk {
  songId: string;
  index: number;
  dataBase64: string;
  sizeBytes: number;
}

export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toLocaleString();
  }
  return 'Recent';
}
