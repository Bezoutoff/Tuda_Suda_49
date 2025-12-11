/**
 * Message Formatters - Pretty formatting for Telegram messages
 *
 * Formats bot status, performance, logs for display in Telegram
 */

import { BotStatus, SystemStatus, ProcessStatus, PerformanceMetrics, OrderRecord } from './types';

/**
 * Format uptime in human-readable form
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format memory in MB
 */
export function formatMemory(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format latency in ms
 */
export function formatLatency(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

/**
 * Get status emoji
 */
export function getStatusEmoji(status: ProcessStatus['status']): string {
  switch (status) {
    case 'online':
      return '✅';
    case 'stopped':
      return '🛑';
    case 'errored':
      return '❌';
    case 'stopping':
      return '⏸️';
    case 'launching':
      return '🚀';
    default:
      return '❓';
  }
}

/**
 * Get bot emoji
 */
export function getBotEmoji(name: string): string {
  if (name.includes('cpp')) return '⚡';
  if (name.includes('polling')) return '🔄';
  if (name.includes('ws')) return '🌐';
  if (name.includes('telegram')) return '📱';
  return '🤖';
}

/**
 * Format process status
 */
export function formatProcessStatus(process: ProcessStatus): string {
  const emoji = getStatusEmoji(process.status);
  const botEmoji = getBotEmoji(process.name);

  let msg = `${botEmoji} *${process.name}*\n`;
  msg += `  Status: ${emoji} ${process.status}\n`;

  if (process.status === 'online') {
    msg += `  Uptime: ${formatUptime(process.uptime)}\n`;
    msg += `  CPU: ${process.cpu.toFixed(1)}%\n`;
    msg += `  Memory: ${formatMemory(process.memory)}\n`;
    msg += `  Restarts: ${process.restarts}\n`;

    if (process.pid) {
      msg += `  PID: ${process.pid}\n`;
    }
  } else if (process.status === 'errored' && process.exitCode !== undefined) {
    msg += `  Exit code: ${process.exitCode}\n`;
  }

  return msg;
}

/**
 * Format performance metrics
 */
export function formatPerformanceMetrics(perf: PerformanceMetrics): string {
  let msg = '📊 *Performance Metrics*\n';
  msg += `  Total orders: ${perf.totalOrders}\n`;
  msg += `  Success: ${perf.successCount}/${perf.totalOrders} (${formatPercent(perf.successRate)})\n`;

  if (perf.totalOrders > 0) {
    msg += `  Avg latency: ${formatLatency(perf.avgLatency)}\n`;
    msg += `  Min/Max: ${formatLatency(perf.minLatency)} / ${formatLatency(perf.maxLatency)}\n`;
  }

  return msg;
}

/**
 * Format latest market info
 */
export function formatLatestMarket(market: {
  slug: string;
  time: Date;
  ordersPlaced: number;
  ordersSuccess: number;
}): string {
  const timeAgo = Date.now() - market.time.getTime();
  const minutesAgo = Math.floor(timeAgo / 60000);

  let msg = '📈 *Latest Market*\n';
  msg += `  Market: \`${market.slug}\`\n`;
  msg += `  Time: ${market.time.toLocaleString('ru-RU')} (${minutesAgo}m ago)\n`;
  msg += `  Orders: ${market.ordersSuccess}/${market.ordersPlaced} placed\n`;

  return msg;
}

/**
 * Format bot status (full)
 */
export function formatBotStatus(status: BotStatus): string {
  let msg = formatProcessStatus(status.process);

  if (status.performance) {
    msg += '\n' + formatPerformanceMetrics(status.performance);
  }

  if (status.latestMarket) {
    msg += '\n' + formatLatestMarket(status.latestMarket);
  }

  if (status.errors.length > 0) {
    msg += '\n⚠️ *Errors:*\n';
    status.errors.forEach((err) => {
      msg += `  • ${err}\n`;
    });
  }

  return msg;
}

/**
 * Format system status (all bots)
 */
export function formatSystemStatus(status: SystemStatus): string {
  let msg = '🤖 *System Status Report*\n';
  msg += `_${status.timestamp.toLocaleString('ru-RU')}_\n\n`;

  // Bot processes
  msg += '*Running Bots:*\n';
  status.bots.forEach((bot) => {
    const emoji = getStatusEmoji(bot.status);
    const botEmoji = getBotEmoji(bot.name);
    msg += `${botEmoji} ${emoji} ${bot.name}`;

    if (bot.status === 'online') {
      msg += ` (${formatUptime(bot.uptime)}, ${formatMemory(bot.memory)})`;
    }
    msg += '\n';
  });

  // Overall performance
  if (status.performance.totalOrders > 0) {
    msg += '\n' + formatPerformanceMetrics(status.performance);
  }

  // Errors
  if (status.errors.length > 0) {
    msg += '\n⚠️ *System Errors:*\n';
    status.errors.forEach((err) => {
      msg += `  • ${err}\n`;
    });
  }

  return msg;
}

/**
 * Format order record
 */
export function formatOrderRecord(order: OrderRecord): string {
  const statusEmoji = order.status === 'success' ? '✅' : '❌';
  const sideEmoji = order.side === 'UP' ? '📈' : '📉';

  let msg = `${statusEmoji} ${sideEmoji} ${order.side} @ $${order.price.toFixed(2)}`;
  msg += ` | ${formatLatency(order.latencyMs)}`;

  if (order.status === 'success') {
    msg += ` | Attempt ${order.attempt}`;
  }

  return msg;
}

/**
 * Format recent orders
 */
export function formatRecentOrders(orders: OrderRecord[], count: number): string {
  if (orders.length === 0) {
    return '📦 *Recent Orders*\n\nNo orders found.';
  }

  const recentOrders = orders.slice(-count);
  const successCount = recentOrders.filter((o) => o.status === 'success').length;
  const successRate = (successCount / recentOrders.length) * 100;

  let msg = `📦 *Recent Orders (${recentOrders.length})*\n`;
  msg += `Success rate: ${successCount}/${recentOrders.length} (${formatPercent(successRate)})\n\n`;

  // Group by market
  const byMarket = new Map<string, OrderRecord[]>();
  recentOrders.forEach((order) => {
    if (!byMarket.has(order.slug)) {
      byMarket.set(order.slug, []);
    }
    byMarket.get(order.slug)!.push(order);
  });

  // Show last 3 markets
  const markets = Array.from(byMarket.entries()).slice(-3);
  markets.forEach(([slug, marketOrders]) => {
    const marketSuccess = marketOrders.filter((o) => o.status === 'success').length;
    msg += `\`${slug}\`\n`;
    msg += `${marketSuccess}/${marketOrders.length} orders placed\n`;

    marketOrders.forEach((order) => {
      msg += `  ${formatOrderRecord(order)}\n`;
    });
    msg += '\n';
  });

  return msg;
}

/**
 * Format log lines
 */
export function formatLogs(logs: string[], botName: string, lineCount: number): string {
  if (logs.length === 0) {
    return `📄 *Logs: ${botName}*\n\nNo logs available.`;
  }

  let msg = `📄 *Logs: ${botName}* (last ${lineCount} lines)\n\n`;
  msg += '```\n';

  // Show last N lines
  const displayLogs = logs.slice(-lineCount);
  displayLogs.forEach((line) => {
    // Truncate very long lines
    const truncated = line.length > 200 ? line.substring(0, 200) + '...' : line;
    msg += truncated + '\n';
  });

  msg += '```';

  return msg;
}

/**
 * Format confirmation request
 */
export function formatConfirmationRequest(action: string, target?: string): string {
  let msg = '⚠️ *CONFIRMATION REQUIRED*\n\n';
  msg += `You are about to: *${action}*\n`;

  if (target) {
    msg += `Target: \`${target}\`\n`;
  }

  msg += '\nReply with `/confirm` to proceed or `/cancel` to abort.\n';
  msg += '_This request expires in 30 seconds._';

  return msg;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return `✅ ${message}`;
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  return `❌ ${message}`;
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return `⚠️ ${message}`;
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return `ℹ️ ${message}`;
}
