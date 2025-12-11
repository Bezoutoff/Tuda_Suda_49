/**
 * CSV Reader - Parse order logs
 *
 * Reads and parses CSV files for order history and performance metrics
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { OrderRecord, PerformanceMetrics } from './types';

/**
 * CSV Reader Class
 */
export class CSVReader {
  private csvPath: string;

  constructor(csvPath?: string) {
    this.csvPath = csvPath || path.join(__dirname, '..', '..', 'updown-bot.csv');
  }

  /**
   * Check if CSV file exists
   */
  exists(): boolean {
    return fs.existsSync(this.csvPath);
  }

  /**
   * Read all order records from CSV
   */
  readAllOrders(): OrderRecord[] {
    if (!this.exists()) {
      console.warn(`[CSV] File not found: ${this.csvPath}`);
      return [];
    }

    try {
      const content = fs.readFileSync(this.csvPath, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        cast: true,
        cast_date: false,
      });

      return records.map((record: any) => this.mapRecord(record));
    } catch (error) {
      console.error('[CSV] Error reading CSV:', error);
      return [];
    }
  }

  /**
   * Read recent orders (last N)
   */
  readRecentOrders(count = 20): OrderRecord[] {
    const allOrders = this.readAllOrders();
    return allOrders.slice(-count);
  }

  /**
   * Read orders for specific market
   */
  readOrdersForMarket(slug: string): OrderRecord[] {
    const allOrders = this.readAllOrders();
    return allOrders.filter((order) => order.slug === slug);
  }

  /**
   * Get performance metrics from orders
   */
  getPerformanceMetrics(orders?: OrderRecord[]): PerformanceMetrics {
    const records = orders || this.readAllOrders();

    if (records.length === 0) {
      return {
        totalOrders: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgLatency: 0,
        minLatency: 0,
        maxLatency: 0,
      };
    }

    const successOrders = records.filter((r) => r.status === 'success');
    const failedOrders = records.filter((r) => r.status === 'failed');
    const latencies = records.map((r) => r.latencyMs).filter((l) => l > 0);

    return {
      totalOrders: records.length,
      successCount: successOrders.length,
      failureCount: failedOrders.length,
      successRate: (successOrders.length / records.length) * 100,
      avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
    };
  }

  /**
   * Get latest market from orders
   */
  getLatestMarket(): { slug: string; time: Date; ordersPlaced: number; ordersSuccess: number } | null {
    const allOrders = this.readAllOrders();
    if (allOrders.length === 0) {
      return null;
    }

    // Get last order's slug
    const lastOrder = allOrders[allOrders.length - 1];
    const slug = lastOrder.slug;

    // Get all orders for this market
    const marketOrders = allOrders.filter((o) => o.slug === slug);
    const successOrders = marketOrders.filter((o) => o.status === 'success');

    return {
      slug,
      time: new Date(lastOrder.serverTime),
      ordersPlaced: marketOrders.length,
      ordersSuccess: successOrders.length,
    };
  }

  /**
   * Get recent performance (last N minutes)
   */
  getRecentPerformance(minutes = 60): PerformanceMetrics {
    const allOrders = this.readAllOrders();
    const cutoffTime = Date.now() - minutes * 60 * 1000;
    const recentOrders = allOrders.filter((o) => o.serverTime >= cutoffTime);

    return this.getPerformanceMetrics(recentOrders);
  }

  /**
   * Map CSV record to OrderRecord
   */
  private mapRecord(record: any): OrderRecord {
    return {
      serverTime: this.parseNumber(record.server_time_ms) || this.parseNumber(record.serverTime) || 0,
      marketTime: this.parseNumber(record.market_time_ms) || this.parseNumber(record.marketTime) || 0,
      secToMarket: this.parseNumber(record.sec_to_market) || this.parseNumber(record.secToMarket) || 0,
      slug: record.slug || '',
      acceptingOrdersTimestamp: record.accepting_orders_timestamp || record.acceptingOrdersTimestamp,
      orderIndex: this.parseNumber(record.order_index) || this.parseNumber(record.orderIndex),
      side: record.side === 'UP' || record.side === 'YES' ? 'UP' : 'DOWN',
      price: this.parseNumber(record.price) || 0,
      size: this.parseNumber(record.size) || 0,
      expirationBuffer: this.parseNumber(record.expiration_buffer) || this.parseNumber(record.expirationBuffer),
      latencyMs: this.parseNumber(record.latency_ms) || this.parseNumber(record.latencyMs) || 0,
      status: record.status === 'success' ? 'success' : 'failed',
      orderId: record.order_id || record.orderId || '',
      attempt: this.parseNumber(record.attempt) || 0,
      totalAttempts: this.parseNumber(record.total_attempts) || this.parseNumber(record.totalAttempts) || 0,
      successCount: this.parseNumber(record.success_count) || this.parseNumber(record.successCount) || 0,
      firstSuccessAttempt:
        this.parseNumber(record.first_success_attempt) || this.parseNumber(record.firstSuccessAttempt) || 0,
      minMs: this.parseNumber(record.min_ms) || this.parseNumber(record.minMs) || 0,
      maxMs: this.parseNumber(record.max_ms) || this.parseNumber(record.maxMs) || 0,
      avgMs: this.parseNumber(record.avg_ms) || this.parseNumber(record.avgMs) || 0,
      medianMs: this.parseNumber(record.median_ms) || this.parseNumber(record.medianMs) || 0,
      source: this.parseSource(record.source),
    };
  }

  /**
   * Parse number from string or number
   */
  private parseNumber(value: any): number | undefined {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  /**
   * Parse source field
   */
  private parseSource(source: any): 'cpp' | 'polling' | 'ws' | 'ts' {
    const s = String(source).toLowerCase();
    if (s.includes('cpp')) return 'cpp';
    if (s.includes('polling')) return 'polling';
    if (s.includes('ws')) return 'ws';
    return 'ts';
  }
}

/**
 * Get CSV reader instance for updown-bot.csv
 */
export function getUpdownBotCSV(): CSVReader {
  return new CSVReader(path.join(__dirname, '..', '..', 'updown-bot.csv'));
}

/**
 * Get CSV reader instance for latency.csv
 */
export function getLatencyCSV(): CSVReader {
  return new CSVReader(path.join(__dirname, '..', '..', 'latency.csv'));
}
