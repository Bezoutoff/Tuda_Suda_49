/**
 * TypeScript Types for Telegram Bot Remote Control
 */

import TelegramBot from 'node-telegram-bot-api';

// User roles
export type UserRole = 'admin' | 'user' | 'unauthorized';

// Bot names
export type BotName = 'updown-btc' | 'updown-eth' | 'updown-sol' | 'updown-xrp' | 'updown-polling' | 'updown-ws' | 'telegram-bot';

// Process status from PM2
export interface ProcessStatus {
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'stopping' | 'launching';
  pid?: number;
  uptime: number;
  cpu: number;
  memory: number;
  restarts: number;
  exitCode?: number;
}

// Order record from CSV
export interface OrderRecord {
  serverTime: number;
  marketTime: number;
  secToMarket: number;
  slug: string;
  acceptingOrdersTimestamp?: string;
  orderIndex?: number;
  side: 'UP' | 'DOWN';
  price: number;
  size: number;
  expirationBuffer?: number;
  latencyMs: number;
  status: 'success' | 'failed';
  orderId: string;
  attempt: number;
  totalAttempts: number;
  successCount: number;
  firstSuccessAttempt: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  medianMs: number;
  source: 'cpp' | 'polling' | 'ws' | 'ts';
}

// Performance metrics
export interface PerformanceMetrics {
  totalOrders: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
}

// Bot status
export interface BotStatus {
  process: ProcessStatus;
  performance?: PerformanceMetrics;
  latestMarket?: {
    slug: string;
    time: Date;
    ordersPlaced: number;
    ordersSuccess: number;
  };
  errors: string[];
}

// System status
export interface SystemStatus {
  bots: ProcessStatus[];
  performance: PerformanceMetrics;
  errors: string[];
  timestamp: Date;
}

// Pending confirmation action
export interface PendingAction {
  action: 'stop' | 'restart' | 'stop_all';
  target?: BotName;
  userId: number;
  expiresAt: number;
}

// Audit log entry
export interface AuditLogEntry {
  timestamp: string;
  userId: number;
  username: string;
  command: string;
  params?: any;
  success: boolean;
  error?: string;
}

// Telegram message context
export interface MessageContext {
  bot: TelegramBot;
  msg: TelegramBot.Message;
  userId: number;
  username: string;
  chatId: number;
  text: string;
  role: UserRole;
}

// Command handler function
export type CommandHandler = (ctx: MessageContext, args: string[]) => Promise<void>;

// Rate limiter entry
export interface RateLimiterEntry {
  timestamps: number[];
  blocked: boolean;
}

// Position data from Polymarket Data API
export interface PositionData {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}
