/**
 * Authentication & Authorization for Telegram Bot
 */

import * as fs from 'fs';
import * as path from 'path';
import { UserRole, RateLimiterEntry, AuditLogEntry } from './types';

const AUDIT_LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'telegram-bot-audit.log');

/**
 * Telegram Bot Authentication
 * Implements whitelist-based authorization
 */
export class TelegramAuth {
  private whitelistedUsers: Set<number>;
  private adminUsers: Set<number>;

  constructor() {
    // Load from environment
    const userIds = process.env.TELEGRAM_USER_IDS?.split(',').map(id => parseInt(id.trim())) || [];
    this.whitelistedUsers = new Set(userIds);

    const adminIds = process.env.TELEGRAM_ADMIN_ID?.split(',').map(id => parseInt(id.trim())) || [];
    this.adminUsers = new Set(adminIds);

    if (this.adminUsers.size === 0) {
      console.warn('[AUTH] WARNING: TELEGRAM_ADMIN_ID not set!');
    }

    if (this.whitelistedUsers.size === 0) {
      console.warn('[AUTH] WARNING: No whitelisted users! Set TELEGRAM_USER_IDS in .env');
    }

    console.log(`[AUTH] Initialized: ${this.whitelistedUsers.size} whitelisted user(s), ${this.adminUsers.size} admin(s)`);
  }

  /**
   * Check if user is authorized (in whitelist)
   */
  isAuthorized(userId: number): boolean {
    return this.whitelistedUsers.has(userId);
  }

  /**
   * Check if user is admin
   */
  isAdmin(userId: number): boolean {
    return this.adminUsers.has(userId);
  }

  /**
   * Get user role
   */
  getUserRole(userId: number): UserRole {
    if (!this.isAuthorized(userId)) {
      return 'unauthorized';
    }
    if (this.isAdmin(userId)) {
      return 'admin';
    }
    return 'user';
  }

  /**
   * Get role display name
   */
  getRoleDisplay(role: UserRole): string {
    switch (role) {
      case 'admin': return '👑 Admin';
      case 'user': return '👤 User';
      case 'unauthorized': return '🚫 Unauthorized';
    }
  }
}

/**
 * Rate Limiter
 * Prevents command spam
 */
export class RateLimiter {
  private commandCounts = new Map<number, RateLimiterEntry>();
  private maxCommandsPerMinute: number;
  private windowMs: number;

  constructor(maxCommandsPerMinute = 10) {
    this.maxCommandsPerMinute = maxCommandsPerMinute;
    this.windowMs = 60000; // 1 minute

    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if user is within rate limit
   */
  checkLimit(userId: number): boolean {
    const now = Date.now();
    const entry = this.commandCounts.get(userId);

    if (!entry) {
      // First command
      this.commandCounts.set(userId, {
        timestamps: [now],
        blocked: false,
      });
      return true;
    }

    // Filter timestamps within window
    const recentTimestamps = entry.timestamps.filter(t => now - t < this.windowMs);

    if (recentTimestamps.length >= this.maxCommandsPerMinute) {
      // Rate limit exceeded
      entry.blocked = true;
      return false;
    }

    // Within limit
    recentTimestamps.push(now);
    this.commandCounts.set(userId, {
      timestamps: recentTimestamps,
      blocked: false,
    });
    return true;
  }

  /**
   * Get remaining commands
   */
  getRemaining(userId: number): number {
    const entry = this.commandCounts.get(userId);
    if (!entry) {
      return this.maxCommandsPerMinute;
    }

    const now = Date.now();
    const recentCount = entry.timestamps.filter(t => now - t < this.windowMs).length;
    return Math.max(0, this.maxCommandsPerMinute - recentCount);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [userId, entry] of this.commandCounts.entries()) {
      const recentTimestamps = entry.timestamps.filter(t => now - t < this.windowMs);
      if (recentTimestamps.length === 0) {
        this.commandCounts.delete(userId);
      } else {
        entry.timestamps = recentTimestamps;
      }
    }
  }
}

/**
 * Audit Logger
 * Logs all commands for security audit
 */
export class AuditLogger {
  private logFile: string;

  constructor(logFile: string = AUDIT_LOG_FILE) {
    this.logFile = logFile;

    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    console.log(`[AUDIT] Log file: ${this.logFile}`);
  }

  /**
   * Log a command
   */
  log(userId: number, username: string, command: string, params?: any, success = true, error?: string): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      userId,
      username,
      command,
      params,
      success,
      error,
    };

    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(this.logFile, line);
    } catch (err) {
      console.error(`[AUDIT] Failed to write log: ${err}`);
    }
  }

  /**
   * Get recent log entries
   */
  getRecentLogs(count = 100): AuditLogEntry[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      const recentLines = lines.slice(-count);

      return recentLines.map(line => {
        try {
          return JSON.parse(line) as AuditLogEntry;
        } catch {
          return null;
        }
      }).filter((entry): entry is AuditLogEntry => entry !== null);
    } catch (err) {
      console.error(`[AUDIT] Failed to read logs: ${err}`);
      return [];
    }
  }
}

/**
 * Confirmation Manager
 * Manages pending confirmations for destructive actions
 */
export class ConfirmationManager {
  private pendingConfirmations = new Map<number, any>();
  private timeoutDuration = 30000; // 30 seconds

  /**
   * Request confirmation
   */
  requestConfirmation(userId: number, action: any): void {
    this.pendingConfirmations.set(userId, {
      ...action,
      expiresAt: Date.now() + this.timeoutDuration,
    });

    // Auto-cleanup after timeout
    setTimeout(() => {
      if (this.pendingConfirmations.has(userId)) {
        const pending = this.pendingConfirmations.get(userId);
        if (pending && Date.now() > pending.expiresAt) {
          this.pendingConfirmations.delete(userId);
        }
      }
    }, this.timeoutDuration + 1000);
  }

  /**
   * Confirm action
   */
  confirmAction(userId: number): any | null {
    const action = this.pendingConfirmations.get(userId);
    if (!action) {
      return null;
    }

    if (Date.now() > action.expiresAt) {
      this.pendingConfirmations.delete(userId);
      return null;
    }

    this.pendingConfirmations.delete(userId);
    return action;
  }

  /**
   * Cancel action
   */
  cancelAction(userId: number): boolean {
    if (this.pendingConfirmations.has(userId)) {
      this.pendingConfirmations.delete(userId);
      return true;
    }
    return false;
  }

  /**
   * Check if user has pending confirmation
   */
  hasPendingConfirmation(userId: number): boolean {
    const action = this.pendingConfirmations.get(userId);
    if (!action) {
      return false;
    }
    if (Date.now() > action.expiresAt) {
      this.pendingConfirmations.delete(userId);
      return false;
    }
    return true;
  }
}
