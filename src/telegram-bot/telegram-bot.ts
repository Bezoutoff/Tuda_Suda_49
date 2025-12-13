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
import { CommandHandlers } from './commands';
import * as formatters from './formatters';
import { MessageContext, BotName } from './types';
import { TradingService } from '../trading-service';
import { tradingConfig, validateTradingConfig } from '../config';

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
  private commandHandlers: CommandHandlers;
  private tradingService: TradingService;

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

    // Initialize trading service only if credentials are available
    if (validateTradingConfig(tradingConfig, true)) {
      this.tradingService = new TradingService(tradingConfig);
      console.log('[BOT] Trading service initialized');
    } else {
      console.warn('[BOT] Trading credentials not configured - /cancelorders command will not be available');
      // Create dummy trading service that throws error when used
      this.tradingService = {
        cancelAllOrders: async () => {
          throw new Error('Trading service not configured. Please set PK, CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE in .env');
        }
      } as any;
    }

    // Initialize command handlers with trading service
    this.commandHandlers = new CommandHandlers(this.confirmationManager, this.tradingService);

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

    // Admin commands
    this.bot.onText(/\/stop (.+)/, (msg, match) =>
      this.handleAdminMessage(msg, () => this.handleStopCommand(msg, match))
    );
    this.bot.onText(/\/restart (.+)/, (msg, match) =>
      this.handleAdminMessage(msg, () => this.handleRestartCommand(msg, match))
    );
    this.bot.onText(/\/stopall/, (msg) =>
      this.handleAdminMessage(msg, () => this.handleStopAllCommand(msg))
    );
    this.bot.onText(/\/cancelorders/, (msg) =>
      this.handleAdminMessage(msg, () => this.handleCancelOrdersCommand(msg))
    );
    this.bot.onText(/\/confirm/, (msg) => this.handleMessage(msg, () => this.handleConfirmCommand(msg)));
    this.bot.onText(/\/cancel/, (msg) => this.handleMessage(msg, () => this.handleCancelCommand(msg)));

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
   * Handle incoming admin message (requires admin role)
   */
  private async handleAdminMessage(
    msg: TelegramBot.Message,
    handler: () => Promise<void>
  ): Promise<void> {
    const userId = msg.from?.id;
    const username = msg.from?.username || msg.from?.first_name || 'unknown';
    const chatId = msg.chat.id;

    if (!userId) {
      return;
    }

    // Check admin role
    const role = this.auth.getUserRole(userId);
    if (role !== 'admin') {
      await this.bot.sendMessage(chatId, '🚫 Admin access required.');
      return;
    }

    // Use regular handleMessage for auth and rate limiting
    await this.handleMessage(msg, async () => {
      await handler();
    });
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
/stopall - Stop ALL trading bots (requires confirmation)
/cancelorders - Cancel ALL open orders (requires confirmation)
/confirm - Confirm pending action
/cancel - Cancel pending action

*Examples:*
\`/stop updown-cpp\` - Stop updown-cpp bot
\`/restart updown-cpp\` - Restart updown-cpp bot
\`/stopall\` - Stop all bots at once

*Confirmation Flow:*
1. Send destructive command (/stop, /restart, /stopall)
2. Bot asks for confirmation (30 second timeout)
3. Reply with \`/confirm\` to execute or \`/cancel\` to abort
      `.trim();
    }

    helpMsg += `

*Bot Names:*
• \`updown-btc\` - BTC 15m C++ bot
• \`updown-eth\` - ETH 15m C++ bot
• \`updown-sol\` - SOL 15m C++ bot
• \`updown-xrp\` - XRP 15m C++ bot
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
   * Handle /stop command (admin only)
   */
  private async handleStopCommand(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;
    const args = match?.[1]?.trim().split(/\s+/) || [];

    await this.commandHandlers.handleStop(this.bot, chatId, userId, args);
  }

  /**
   * Handle /restart command (admin only)
   */
  private async handleRestartCommand(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;
    const args = match?.[1]?.trim().split(/\s+/) || [];

    await this.commandHandlers.handleRestart(this.bot, chatId, userId, args);
  }

  /**
   * Handle /stopall command (admin only)
   */
  private async handleStopAllCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    await this.commandHandlers.handleStopAll(this.bot, chatId, userId);
  }

  /**
   * Handle /cancelorders command (admin only)
   */
  private async handleCancelOrdersCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    await this.commandHandlers.handleCancelOrders(this.bot, chatId, userId);
  }

  /**
   * Handle /confirm command
   */
  private async handleConfirmCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    await this.commandHandlers.handleConfirm(this.bot, chatId, userId);
  }

  /**
   * Handle /cancel command
   */
  private async handleCancelCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;

    await this.commandHandlers.handleCancel(this.bot, chatId, userId);
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
