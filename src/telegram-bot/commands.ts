/**
 * Command Handlers - Admin commands for bot control
 *
 * Implements emergency stop, restart, and other admin functions
 */

import TelegramBot from 'node-telegram-bot-api';
import { getPM2Controller } from './pm2-controller';
import { ConfirmationManager } from './auth';
import * as formatters from './formatters';
import { BotName } from './types';

/**
 * Command Handlers Class
 */
export class CommandHandlers {
  private pm2Controller = getPM2Controller();
  private confirmationManager: ConfirmationManager;

  constructor(confirmationManager: ConfirmationManager) {
    this.confirmationManager = confirmationManager;
  }

  /**
   * Handle /stop command
   */
  async handleStop(
    bot: TelegramBot,
    chatId: number,
    userId: number,
    args: string[]
  ): Promise<void> {
    if (args.length === 0) {
      await bot.sendMessage(chatId, formatters.formatError('Usage: /stop <bot>'));
      return;
    }

    const botName = args[0] as BotName;

    // Validate bot name
    const validBots: BotName[] = ['updown-cpp', 'updown-polling', 'updown-ws', 'telegram-bot'];
    if (!validBots.includes(botName)) {
      await bot.sendMessage(
        chatId,
        formatters.formatError(`Invalid bot name. Valid bots: ${validBots.join(', ')}`)
      );
      return;
    }

    // Prevent stopping telegram-bot
    if (botName === 'telegram-bot') {
      await bot.sendMessage(chatId, formatters.formatError('Cannot stop telegram-bot from itself!'));
      return;
    }

    // Check if bot is running
    const isRunning = await this.pm2Controller.isRunning(botName);
    if (!isRunning) {
      await bot.sendMessage(chatId, formatters.formatWarning(`Bot ${botName} is not running.`));
      return;
    }

    // Request confirmation
    this.confirmationManager.requestConfirmation(userId, {
      action: 'stop',
      target: botName,
    });

    const confirmMsg = formatters.formatConfirmationRequest(`Stop bot ${botName}`, botName);
    await bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /restart command
   */
  async handleRestart(
    bot: TelegramBot,
    chatId: number,
    userId: number,
    args: string[]
  ): Promise<void> {
    if (args.length === 0) {
      await bot.sendMessage(chatId, formatters.formatError('Usage: /restart <bot>'));
      return;
    }

    const botName = args[0] as BotName;

    // Validate bot name
    const validBots: BotName[] = ['updown-cpp', 'updown-polling', 'updown-ws', 'telegram-bot'];
    if (!validBots.includes(botName)) {
      await bot.sendMessage(
        chatId,
        formatters.formatError(`Invalid bot name. Valid bots: ${validBots.join(', ')}`)
      );
      return;
    }

    // Prevent restarting telegram-bot (dangerous)
    if (botName === 'telegram-bot') {
      await bot.sendMessage(
        chatId,
        formatters.formatWarning('Restarting telegram-bot will disconnect you. Use PM2 directly.')
      );
      return;
    }

    // Request confirmation
    this.confirmationManager.requestConfirmation(userId, {
      action: 'restart',
      target: botName,
    });

    const confirmMsg = formatters.formatConfirmationRequest(`Restart bot ${botName}`, botName);
    await bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /confirm command
   */
  async handleConfirm(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
    const action = this.confirmationManager.confirmAction(userId);

    if (!action) {
      await bot.sendMessage(chatId, formatters.formatWarning('No pending confirmation or expired.'));
      return;
    }

    // Execute action
    try {
      if (action.action === 'stop') {
        await this.executeStop(bot, chatId, action.target);
      } else if (action.action === 'restart') {
        await this.executeRestart(bot, chatId, action.target);
      } else if (action.action === 'stop_all') {
        await this.executeStopAll(bot, chatId);
      } else {
        await bot.sendMessage(chatId, formatters.formatError('Unknown action type.'));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await bot.sendMessage(chatId, formatters.formatError(`Action failed: ${errorMsg}`));
    }
  }

  /**
   * Handle /cancel command
   */
  async handleCancel(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
    const cancelled = this.confirmationManager.cancelAction(userId);

    if (cancelled) {
      await bot.sendMessage(chatId, formatters.formatInfo('Action cancelled.'));
    } else {
      await bot.sendMessage(chatId, formatters.formatWarning('No pending confirmation.'));
    }
  }

  /**
   * Execute stop action
   */
  private async executeStop(bot: TelegramBot, chatId: number, botName: BotName): Promise<void> {
    await bot.sendMessage(chatId, `🛑 Stopping ${botName}...`);

    try {
      const success = await this.pm2Controller.stopProcess(botName);

      if (success) {
        await bot.sendMessage(
          chatId,
          formatters.formatSuccess(`Bot ${botName} stopped successfully.`)
        );
      } else {
        await bot.sendMessage(chatId, formatters.formatError(`Failed to stop ${botName}.`));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await bot.sendMessage(chatId, formatters.formatError(`Stop failed: ${errorMsg}`));

      // Try nuclear option (delete)
      await bot.sendMessage(chatId, '⚠️ Trying force delete...');
      try {
        await this.pm2Controller.deleteProcess(botName);
        await bot.sendMessage(
          chatId,
          formatters.formatSuccess(`Bot ${botName} force deleted.`)
        );
      } catch (deleteError) {
        const deleteErrorMsg =
          deleteError instanceof Error ? deleteError.message : String(deleteError);
        await bot.sendMessage(
          chatId,
          formatters.formatError(`Force delete also failed: ${deleteErrorMsg}`)
        );
      }
    }
  }

  /**
   * Execute restart action
   */
  private async executeRestart(bot: TelegramBot, chatId: number, botName: BotName): Promise<void> {
    await bot.sendMessage(chatId, `🔄 Restarting ${botName}...`);

    try {
      const success = await this.pm2Controller.restartProcess(botName);

      if (success) {
        await bot.sendMessage(
          chatId,
          formatters.formatSuccess(`Bot ${botName} restarted successfully.`)
        );
      } else {
        await bot.sendMessage(chatId, formatters.formatError(`Failed to restart ${botName}.`));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await bot.sendMessage(chatId, formatters.formatError(`Restart failed: ${errorMsg}`));
    }
  }

  /**
   * Execute stop all action
   */
  private async executeStopAll(bot: TelegramBot, chatId: number): Promise<void> {
    await bot.sendMessage(chatId, '🛑 Stopping all bots...');

    try {
      const result = await this.pm2Controller.stopAllBots();

      if (result.success.length > 0) {
        await bot.sendMessage(
          chatId,
          formatters.formatSuccess(`Stopped: ${result.success.join(', ')}`)
        );
      }

      if (result.failed.length > 0) {
        await bot.sendMessage(
          chatId,
          formatters.formatError(`Failed to stop: ${result.failed.join(', ')}`)
        );
      }

      if (result.success.length === 0 && result.failed.length === 0) {
        await bot.sendMessage(chatId, formatters.formatInfo('No bots to stop.'));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await bot.sendMessage(chatId, formatters.formatError(`Stop all failed: ${errorMsg}`));
    }
  }

  /**
   * Handle /stopall command (admin only)
   */
  async handleStopAll(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
    // Request confirmation
    this.confirmationManager.requestConfirmation(userId, {
      action: 'stop_all',
    });

    const confirmMsg = formatters.formatConfirmationRequest('Stop ALL trading bots');
    await bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });
  }
}
