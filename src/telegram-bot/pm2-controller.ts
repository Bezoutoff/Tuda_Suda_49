/**
 * PM2 Controller - Process Management
 *
 * Wraps PM2 API for controlling trading bots
 */

import * as pm2 from 'pm2';
import { ProcessStatus, BotName } from './types';

/**
 * PM2 Controller Class
 */
export class PM2Controller {
  private connected = false;

  /**
   * Connect to PM2
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          console.error('[PM2] Connection error:', err);
          reject(err);
          return;
        }
        this.connected = true;
        console.log('[PM2] Connected successfully');
        resolve();
      });
    });
  }

  /**
   * Disconnect from PM2
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    pm2.disconnect();
    this.connected = false;
    console.log('[PM2] Disconnected');
  }

  /**
   * Get list of all processes
   */
  async listProcesses(): Promise<ProcessStatus[]> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.list((err, processDescriptionList) => {
        if (err) {
          reject(err);
          return;
        }

        const processes: ProcessStatus[] = processDescriptionList.map((proc) => {
          const status = this.mapPM2Status(proc.pm2_env?.status);
          const uptime = proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0;

          return {
            name: proc.name || 'unknown',
            status,
            pid: proc.pid,
            uptime,
            cpu: proc.monit?.cpu || 0,
            memory: proc.monit?.memory || 0,
            restarts: proc.pm2_env?.restart_time || 0,
            exitCode: proc.pm2_env?.exit_code,
          };
        });

        resolve(processes);
      });
    });
  }

  /**
   * Get specific process by name
   */
  async getProcess(name: BotName): Promise<ProcessStatus | null> {
    const processes = await this.listProcesses();
    return processes.find((p) => p.name === name) || null;
  }

  /**
   * Stop a process
   */
  async stopProcess(name: BotName): Promise<boolean> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.stop(name, (err) => {
        if (err) {
          console.error(`[PM2] Error stopping ${name}:`, err.message);
          reject(err);
          return;
        }
        console.log(`[PM2] Stopped ${name} successfully`);
        resolve(true);
      });
    });
  }

  /**
   * Restart a process
   */
  async restartProcess(name: BotName): Promise<boolean> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.restart(name, (err) => {
        if (err) {
          console.error(`[PM2] Error restarting ${name}:`, err.message);
          reject(err);
          return;
        }
        console.log(`[PM2] Restarted ${name} successfully`);
        resolve(true);
      });
    });
  }

  /**
   * Delete a process (nuclear option)
   */
  async deleteProcess(name: BotName): Promise<boolean> {
    await this.connect();

    return new Promise((resolve, reject) => {
      pm2.delete(name, (err) => {
        if (err) {
          console.error(`[PM2] Error deleting ${name}:`, err.message);
          reject(err);
          return;
        }
        console.log(`[PM2] Deleted ${name} successfully`);
        resolve(true);
      });
    });
  }

  /**
   * Get process logs
   */
  async getProcessLogs(name: BotName, lines = 50): Promise<string[]> {
    const process = await this.getProcess(name);
    if (!process) {
      throw new Error(`Process ${name} not found`);
    }

    // PM2 doesn't provide logs via API, we'll read from log files
    // Return empty array for now, will implement file reading
    return [];
  }

  /**
   * Map PM2 status to our ProcessStatus type
   */
  private mapPM2Status(pm2Status?: string): ProcessStatus['status'] {
    switch (pm2Status) {
      case 'online':
        return 'online';
      case 'stopped':
        return 'stopped';
      case 'stopping':
        return 'stopping';
      case 'launching':
        return 'launching';
      case 'errored':
        return 'errored';
      default:
        return 'stopped';
    }
  }

  /**
   * Check if process is running
   */
  async isRunning(name: BotName): Promise<boolean> {
    const process = await this.getProcess(name);
    return process?.status === 'online';
  }

  /**
   * Get all bot processes (exclude telegram-bot)
   */
  async getBotProcesses(): Promise<ProcessStatus[]> {
    const allProcesses = await this.listProcesses();
    return allProcesses.filter((p) => p.name !== 'telegram-bot');
  }

  /**
   * Stop all bot processes
   */
  async stopAllBots(): Promise<{ success: string[]; failed: string[] }> {
    const bots = await this.getBotProcesses();
    const success: string[] = [];
    const failed: string[] = [];

    for (const bot of bots) {
      try {
        await this.stopProcess(bot.name as BotName);
        success.push(bot.name);
      } catch (error) {
        failed.push(bot.name);
      }
    }

    return { success, failed };
  }

  /**
   * Restart all bot processes
   */
  async restartAllBots(): Promise<{ success: string[]; failed: string[] }> {
    const bots = await this.getBotProcesses();
    const success: string[] = [];
    const failed: string[] = [];

    for (const bot of bots) {
      try {
        await this.restartProcess(bot.name as BotName);
        success.push(bot.name);
      } catch (error) {
        failed.push(bot.name);
      }
    }

    return { success, failed };
  }
}

/**
 * Singleton instance
 */
let pm2Controller: PM2Controller | null = null;

/**
 * Get PM2 controller instance
 */
export function getPM2Controller(): PM2Controller {
  if (!pm2Controller) {
    pm2Controller = new PM2Controller();
  }
  return pm2Controller;
}
