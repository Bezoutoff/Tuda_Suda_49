/**
 * Status Monitor - Aggregate bot status and performance
 *
 * Combines PM2 process data with CSV logs for comprehensive status
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPM2Controller } from './pm2-controller';
import { getUpdownBotCSV, getLatencyCSV } from './csv-reader';
import { BotStatus, SystemStatus, BotName } from './types';

/**
 * Status Monitor Class
 */
export class StatusMonitor {
  private pm2Controller = getPM2Controller();
  private updownCSV = getUpdownBotCSV();
  private latencyCSV = getLatencyCSV();

  /**
   * Get status for specific bot
   */
  async getBotStatus(name: BotName): Promise<BotStatus> {
    const process = await this.pm2Controller.getProcess(name);

    if (!process) {
      return {
        process: {
          name,
          status: 'stopped',
          uptime: 0,
          cpu: 0,
          memory: 0,
          restarts: 0,
        },
        errors: ['Process not found in PM2'],
      };
    }

    const errors: string[] = [];

    // Get performance data for updown bots
    let performance = undefined;
    let latestMarket = undefined;

    if (name === 'updown-cpp' || name === 'updown-polling' || name === 'updown-ws') {
      try {
        // Try to read CSV data
        if (this.updownCSV.exists()) {
          performance = this.updownCSV.getRecentPerformance(60); // Last 60 minutes
          latestMarket = this.updownCSV.getLatestMarket();
        } else {
          errors.push('CSV log file not found');
        }
      } catch (error) {
        errors.push(`CSV read error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check for recent errors
    if (process.status === 'errored') {
      errors.push(`Process errored (exit code: ${process.exitCode})`);
    }

    if (process.restarts > 10) {
      errors.push(`High restart count: ${process.restarts}`);
    }

    return {
      process,
      performance,
      latestMarket,
      errors,
    };
  }

  /**
   * Get system status (all bots)
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const botProcesses = await this.pm2Controller.getBotProcesses();
    const allOrders = this.updownCSV.exists() ? this.updownCSV.readAllOrders() : [];
    const performance = this.updownCSV.getPerformanceMetrics(allOrders);

    const errors: string[] = [];

    // Check for system-wide issues
    const onlineBots = botProcesses.filter((p) => p.status === 'online');
    if (onlineBots.length === 0) {
      errors.push('No bots are running');
    }

    const erroredBots = botProcesses.filter((p) => p.status === 'errored');
    if (erroredBots.length > 0) {
      errors.push(`${erroredBots.length} bot(s) in error state: ${erroredBots.map((b) => b.name).join(', ')}`);
    }

    // Check CSV availability
    if (!this.updownCSV.exists()) {
      errors.push('Order log file (updown-bot.csv) not found');
    }

    return {
      bots: botProcesses,
      performance,
      errors,
      timestamp: new Date(),
    };
  }

  /**
   * Get recent logs for a bot
   */
  async getBotLogs(name: BotName, lines = 50): Promise<string[]> {
    const logDir = path.join(__dirname, '..', '..', 'logs');
    const logFile = path.join(logDir, `${name}-combined.log`);

    if (!fs.existsSync(logFile)) {
      return [`Log file not found: ${logFile}`];
    }

    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n').filter((line) => line.trim().length > 0);
      return allLines.slice(-lines);
    } catch (error) {
      return [`Error reading logs: ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  /**
   * Get error logs for a bot
   */
  async getBotErrorLogs(name: BotName, lines = 50): Promise<string[]> {
    const logDir = path.join(__dirname, '..', '..', 'logs');
    const errorLogFile = path.join(logDir, `${name}-error.log`);

    if (!fs.existsSync(errorLogFile)) {
      return ['No errors logged'];
    }

    try {
      const content = fs.readFileSync(errorLogFile, 'utf-8');
      const allLines = content.split('\n').filter((line) => line.trim().length > 0);

      if (allLines.length === 0) {
        return ['No errors logged'];
      }

      return allLines.slice(-lines);
    } catch (error) {
      return [`Error reading error logs: ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  /**
   * Check if bot is healthy
   */
  async isBotHealthy(name: BotName): Promise<boolean> {
    const status = await this.getBotStatus(name);

    // Check if process is running
    if (status.process.status !== 'online') {
      return false;
    }

    // Check if has recent errors
    if (status.errors.length > 0) {
      return false;
    }

    // For updown bots, check if placing orders
    if (name === 'updown-cpp' || name === 'updown-polling' || name === 'updown-ws') {
      if (!status.latestMarket) {
        return false; // No orders placed yet
      }

      // Check if latest market is recent (within last 30 minutes)
      const timeSinceLastOrder = Date.now() - status.latestMarket.time.getTime();
      if (timeSinceLastOrder > 30 * 60 * 1000) {
        return false; // No orders in last 30 minutes
      }
    }

    return true;
  }

  /**
   * Get health check for all bots
   */
  async getHealthCheck(): Promise<{ [key: string]: boolean }> {
    const botProcesses = await this.pm2Controller.getBotProcesses();
    const health: { [key: string]: boolean } = {};

    for (const bot of botProcesses) {
      health[bot.name] = await this.isBotHealthy(bot.name as BotName);
    }

    return health;
  }
}

/**
 * Singleton instance
 */
let statusMonitor: StatusMonitor | null = null;

/**
 * Get status monitor instance
 */
export function getStatusMonitor(): StatusMonitor {
  if (!statusMonitor) {
    statusMonitor = new StatusMonitor();
  }
  return statusMonitor;
}
