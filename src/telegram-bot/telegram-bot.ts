/**
 * Telegram Bot - Remote Control for Tuda Suda 49
 *
 * Features:
 * - Emergency stop for trading bots
 * - Status monitoring (orders, performance, errors)
 * - Secure whitelist-based authentication
 * - Rate limiting and audit logging
 */

import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { TelegramAuth, RateLimiter, AuditLogger, ConfirmationManager } from './auth';
import { getStatusMonitor } from './monitor';
import { getUpdownBotCSV } from './csv-reader';
import * as formatters from './formatters';
import { MessageContext, BotName } from './types';

// Load environment variables
dotenv.config();

/**
 * Main Telegram Bot Class
 */
class TudaSudaBot {
  private bot: TelegramBot;
  private auth: TelegramAuth;
  private rateLimiter: RateLimiter;
  private auditLogger: AuditLogger;
  private confirmationManager: ConfirmationManager;
  private statusMonitor = getStatusMonitor();
  private csvReader = getUpdownBotCSV();

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
    }

    // Initialize bot
    this.bot = new TelegramBot(token, { polling: true });

    // Initialize services
    this.auth = new TelegramAuth();
    this.rateLimiter = new RateLimiter();
    this.auditLogger = new AuditLogger();
    this.confirmationManager = new ConfirmationManager();

    console.log('[BOT] Telegram bot initialized successfully');
  }

  /**
   * Start the bot
   */
  start(): void {
    // Register command handlers
    this.bot.onText(/\/start/, (msg) => this.handleMessage(msg, this.handleStart.bind(this)));
    this.bot.onText(/\/help/, (msg) => this.handleMessage(msg, this.handleHelp.bind(this)));
    this.bot.onText(/\/status(.*)/, (msg, match) => this.handleMessage(msg, () => this.handleStatus(msg, match)));
    this.bot.onText(/\/logs (.+)/, (msg, match) => this.handleMessage(msg, () => this.handleLogs(msg, match)));
    this.bot.onText(/\/orders(.*)/, (msg, match) => this.handleMessage(msg, () => this.handleOrders(msg, match)));

    // Handle all text messages (for confirmations, etc.)
    this.bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        // Non-command message, ignore for now
        return;
      }
    });

    // Error handler
    this.bot.on('polling_error', (error) => {
      console.error('[BOT] Polling error:', error.message);
    });

    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    console.log('[BOT] Telegram bot started. Waiting for commands...');
  }

  /**
   * Handle incoming message with auth and rate limiting
   */
  private async handleMessage(
    msg: TelegramBot.Message,
    handler: (ctx: MessageContext) => Promise<void>
  ): Promise<void> {
    const userId = msg.from?.id;
    const username = msg.from?.username || msg.from?.first_name || 'unknown';
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (!userId) {
      return;
    }

    // Check authorization
    const role = this.auth.getUserRole(userId);
    if (role === 'unauthorized') {
      this.auditLogger.log(userId, username, text, undefined, false, 'Unauthorized');
      await this.bot.sendMessage(chatId, '🚫 Unauthorized. Contact admin to get access.');
      return;
    }

    // Check rate limit
    if (!this.rateLimiter.checkLimit(userId)) {
      const remaining = this.rateLimiter.getRemaining(userId);
      await this.bot.sendMessage(
        chatId,
        `⚠️ Rate limit exceeded. Try again later.\nRemaining: ${remaining}/10 commands per minute`
      );
      return;
    }

    // Create context
    const ctx: MessageContext = {
      bot: this.bot,
      msg,
      userId,
      username,
      chatId,
      text,
      role,
    };

    try {
      // Execute handler
      await handler(ctx);
      this.auditLogger.log(userId, username, text, undefined, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BOT] Error handling command from ${username}:`, errorMsg);
      this.auditLogger.log(userId, username, text, undefined, false, errorMsg);
      await this.bot.sendMessage(chatId, `❌ Error: ${errorMsg}`);
    }
  }

  /**
   * Handle /start command
   */
  private async handleStart(ctx: MessageContext): Promise<void> {
    const roleDisplay = this.auth.getRoleDisplay(ctx.role);

    const welcomeMsg = `
🤖 *Tuda Suda 49 Control Bot*

Welcome, ${ctx.username}!
Your role: ${roleDisplay}

This bot allows you to remotely control trading bots running on the VPS server.

*Available Commands:*
/help - Show all commands
/status - View all bots status
/status <bot> - View specific bot status

${ctx.role === 'admin' ? '*Admin Commands:*\n/stop <bot> - Emergency stop a bot\n/restart <bot> - Restart a bot\n' : ''}
*Security Features:*
✅ Whitelist-based authentication
✅ Rate limiting (10 commands/min)
✅ Audit logging
${ctx.role === 'admin' ? '✅ Confirmation required for destructive actions' : ''}

Type /help for more information.
    `.trim();

    await ctx.bot.sendMessage(ctx.chatId, welcomeMsg, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /help command
   */
  private async handleHelp(ctx: MessageContext): Promise<void> {
    const roleDisplay = this.auth.getRoleDisplay(ctx.role);

    let helpMsg = `
📖 *Help - Tuda Suda 49 Control Bot*

Your role: ${roleDisplay}

*Basic Commands:*
/start - Welcome message
/help - This help message
/status - View all bots status and performance
/status <bot> - View specific bot (updown-cpp, updown-polling, updown-ws)

*Example:*
\`/status\` - Show all bots
\`/status updown-cpp\` - Show only updown-cpp bot
    `.trim();

    if (ctx.role === 'admin') {
      helpMsg += `

*Admin Commands:*
/stop <bot> - Emergency stop a bot (requires confirmation)
/restart <bot> - Restart a bot (requires confirmation)
/logs <bot> [lines] - View recent logs (default 50 lines)
/orders [count] - View recent orders (default 20)

*Examples:*
\`/stop updown-cpp\` - Stop updown-cpp bot
\`/restart updown-cpp\` - Restart updown-cpp bot
\`/logs updown-cpp 100\` - View last 100 log lines
\`/orders 50\` - View last 50 orders

*Confirmation Flow:*
When you use a destructive command (/stop, /restart), you will receive a confirmation request.
Reply with \`/confirm\` within 30 seconds to execute, or \`/cancel\` to abort.
      `.trim();
    }

    helpMsg += `

*Bot Names:*
• \`updown-cpp\` - C++ latency bot (main)
• \`updown-polling\` - Polling-based bot
• \`updown-ws\` - WebSocket-based bot
• \`telegram-bot\` - This control bot

*Rate Limiting:*
You can send up to 10 commands per minute.

*Security:*
All commands are logged to audit log with timestamp, user ID, and parameters.
    `.trim();

    await ctx.bot.sendMessage(ctx.chatId, helpMsg, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /status command
   */
  private async handleStatus(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const chatId = msg.chat.id;
    const args = match?.[1]?.trim();

    try {
      if (args) {
        // Specific bot status
        const botName = args as BotName;
        const status = await this.statusMonitor.getBotStatus(botName);
        const formatted = formatters.formatBotStatus(status);
        await this.bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
      } else {
        // System status (all bots)
        const systemStatus = await this.statusMonitor.getSystemStatus();
        const formatted = formatters.formatSystemStatus(systemStatus);
        await this.bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.bot.sendMessage(chatId, formatters.formatError(`Failed to get status: ${errorMsg}`));
    }
  }

  /**
   * Handle /logs command
   */
  private async handleLogs(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const chatId = msg.chat.id;
    const args = match?.[1]?.trim().split(/\s+/) || [];

    if (args.length === 0) {
      await this.bot.sendMessage(chatId, formatters.formatError('Usage: /logs <bot> [lines]'));
      return;
    }

    const botName = args[0] as BotName;
    const lineCount = args[1] ? parseInt(args[1]) : 50;

    try {
      const logs = await this.statusMonitor.getBotLogs(botName, lineCount);
      const formatted = formatters.formatLogs(logs, botName, lineCount);
      await this.bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.bot.sendMessage(chatId, formatters.formatError(`Failed to get logs: ${errorMsg}`));
    }
  }

  /**
   * Handle /orders command
   */
  private async handleOrders(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const chatId = msg.chat.id;
    const args = match?.[1]?.trim();
    const count = args ? parseInt(args) : 20;

    try {
      const orders = this.csvReader.readRecentOrders(count);
      const formatted = formatters.formatRecentOrders(orders, count);
      await this.bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.bot.sendMessage(chatId, formatters.formatError(`Failed to get orders: ${errorMsg}`));
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    console.log('[BOT] Shutting down gracefully...');

    try {
      await this.bot.stopPolling();
      console.log('[BOT] Stopped polling');
    } catch (error) {
      console.error('[BOT] Error stopping polling:', error);
    }

    console.log('[BOT] Shutdown complete');
    process.exit(0);
  }
}

/**
 * Main entry point
 */
function main() {
  console.log('=================================================');
  console.log('Tuda Suda 49 - Telegram Control Bot');
  console.log('=================================================');

  try {
    const bot = new TudaSudaBot();
    bot.start();
  } catch (error) {
    console.error('[FATAL] Failed to start bot:', error);
    process.exit(1);
  }
}

// Start bot
main();
