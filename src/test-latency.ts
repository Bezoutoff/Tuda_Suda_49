/**
 * Latency Test Script
 *
 * Упрощённая версия bot-polling.ts для тестирования latency:
 * - Только 1 ордер: UP @ 0.45
 * - Подробное логирование каждого этапа
 *
 * Usage: npm run test-latency btc-updown-15m-1764929700
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig, BOT_CONFIG, getOrderSize } from './config';

// Latency log files
const LATENCY_LOG_FILE = path.join(__dirname, '..', 'latency.csv');
const LATENCY_SUMMARY_FILE = path.join(__dirname, '..', 'latency_summary.csv');

// CSV header
const CSV_HEADER = 'server_time_ms,market_time,sec_to_market,slug,side,price,size,latency_ms,status,order_id,attempt,source\n';
const SUMMARY_HEADER = 'market_time,slug,total_attempts,success_count,first_success_attempt,min_ms,max_ms,avg_ms,median_ms,source\n';

// State for logging
let cachedServerTime = 0;  // Server time in seconds
let cachedLocalTime = 0;   // Local time when server time was fetched
let currentMarketTime = 0;
let currentSlug = '';
let attemptCounter = 0;
const latencyRecords: { latencyMs: number; success: boolean; attempt: number; orderId?: string }[] = [];

// Initialize latency log with header if not exists
function initLatencyLog() {
  if (!fs.existsSync(LATENCY_LOG_FILE)) {
    fs.writeFileSync(LATENCY_LOG_FILE, CSV_HEADER);
  }
  if (!fs.existsSync(LATENCY_SUMMARY_FILE)) {
    fs.writeFileSync(LATENCY_SUMMARY_FILE, SUMMARY_HEADER);
  }
}

// Update cached server time
async function updateServerTime(): Promise<void> {
  const localBefore = Date.now();
  const resp = await fetch('https://clob.polymarket.com/time');
  const serverSec = parseInt(await resp.text());
  cachedServerTime = serverSec;
  cachedLocalTime = localBefore;
}

// Get current server time in ms (extrapolated)
function getServerTimeMs(): number {
  const elapsed = Date.now() - cachedLocalTime;
  return cachedServerTime * 1000 + elapsed;
}

// Check if should log this result
function shouldLog(success: boolean, error?: string): boolean {
  if (success) return true;
  if (error?.includes('orderbook does not exist')) return true;
  return false;  // Skip Duplicated and other errors
}

// Append latency record to CSV
function logLatency(
  slug: string,
  side: string,
  price: number,
  size: number,
  latencyMs: number,
  success: boolean,
  orderId?: string,
  error?: string
) {
  // Filter: only log success or "orderbook does not exist"
  if (!shouldLog(success, error)) return;

  attemptCounter++;
  const serverTimeMs = getServerTimeMs();
  const secToMarket = ((currentMarketTime * 1000) - serverTimeMs) / 1000;
  const status = success ? 'success' : 'orderbook_not_exist';

  const line = `${serverTimeMs},${currentMarketTime},${secToMarket.toFixed(3)},${slug},${side},${price},${size},${latencyMs},${status},${orderId || ''},${attemptCounter},nodejs\n`;
  fs.appendFileSync(LATENCY_LOG_FILE, line);

  // Track for summary
  latencyRecords.push({ latencyMs, success, attempt: attemptCounter, orderId });
}

// Write summary after test completes
function writeSummary() {
  if (latencyRecords.length === 0) return;

  const successRecords = latencyRecords.filter(r => r.success);
  const latencies = latencyRecords.map(r => r.latencyMs);
  const sorted = [...latencies].sort((a, b) => a - b);

  const firstSuccess = successRecords.length > 0
    ? Math.min(...successRecords.map(r => r.attempt))
    : 0;

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const median = sorted[Math.floor(sorted.length / 2)];

  const line = `${currentMarketTime},${currentSlug},${latencyRecords.length},${successRecords.length},${firstSuccess},${min},${max},${avg},${median},nodejs\n`;
  fs.appendFileSync(LATENCY_SUMMARY_FILE, line);
}

// Test parameters
const TEST_PRICE = 0.45;
const TEST_EXPIRATION_BUFFER = 1; // 1 sec before market start
const PARALLEL_REQUESTS = BOT_CONFIG.PARALLEL_SPAM_REQUESTS;
const MAX_ATTEMPTS = BOT_CONFIG.MAX_ORDER_ATTEMPTS;
const DELAY_BEFORE_SPAM_MS = BOT_CONFIG.DELAY_BEFORE_SPAM_MS;
const POLL_INTERVAL_MS = BOT_CONFIG.POLL_INTERVAL_MS;

// Logger with timestamp
function log(message: string) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Fetch market by slug from Gamma API
 */
async function fetchMarketBySlug(slug: string): Promise<{
  yesTokenId: string;
  noTokenId: string;
} | null> {
  try {
    const url = `https://gamma-api.polymarket.com/markets/slug/${slug}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const market = await response.json() as any;

    if (!market || !market.clobTokenIds) {
      return null;
    }

    let clobTokenIds = market.clobTokenIds;
    if (typeof clobTokenIds === 'string') {
      clobTokenIds = JSON.parse(clobTokenIds);
    }

    if (!clobTokenIds || clobTokenIds.length < 2) {
      return null;
    }

    return {
      yesTokenId: clobTokenIds[0],
      noTokenId: clobTokenIds[1],
    };
  } catch {
    return null;
  }
}

/**
 * Poll for market and place single order with detailed logging
 */
async function runTest(slug: string, marketTimestamp: number) {
  // Initialize latency logging
  initLatencyLog();

  // Set global state for logging
  currentMarketTime = marketTimestamp;
  currentSlug = slug;
  attemptCounter = 0;
  latencyRecords.length = 0;  // Clear previous records

  log(`=`.repeat(60));
  log(`LATENCY TEST: ${slug}`);
  log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
  log(`Latency CSV: ${LATENCY_LOG_FILE}`);
  log(`Summary CSV: ${LATENCY_SUMMARY_FILE}`);
  log(`=`.repeat(60));

  // Validate config
  if (!validateTradingConfig(tradingConfig)) {
    log('ERROR: Invalid trading config. Check .env');
    process.exit(1);
  }

  // Initialize trading service
  const tradingService = new TradingService(tradingConfig);

  // ===== PHASE 1: Polling =====
  log('');
  log('--- PHASE 1: Polling for market ---');

  let pollCount = 0;
  const pollStart = Date.now();
  let market: { yesTokenId: string; noTokenId: string } | null = null;

  while (!market) {
    pollCount++;

    if (Date.now() - pollStart > 20 * 60 * 1000) {
      log('ERROR: Polling timeout (20 min)');
      process.exit(1);
    }

    market = await fetchMarketBySlug(slug);

    if (market) {
      const pollElapsed = Math.round((Date.now() - pollStart) / 1000);
      log(`Market found! (${pollCount} polls, ${pollElapsed}s)`);
      log(`YES Token: ${market.yesTokenId.slice(0, 20)}...`);
      log(`NO Token: ${market.noTokenId.slice(0, 20)}...`);
    } else {
      if (pollCount % 100 === 0) {
        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        log(`Polling... ${pollCount} requests, ${elapsed}s`);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  // ===== PHASE 2: Pre-sign order =====
  log('');
  log('--- PHASE 2: Pre-signing order ---');
  log(`Order: UP @ ${TEST_PRICE}`);
  log(`Size: ${getOrderSize()} USDC`);

  const expirationTimestamp = marketTimestamp - TEST_EXPIRATION_BUFFER;
  log(`Expiration: ${new Date(expirationTimestamp * 1000).toLocaleString('ru-RU')}`);

  const signStart = performance.now();
  const signedOrder = await tradingService.createSignedOrder({
    tokenId: market.yesTokenId,
    side: 'BUY',
    price: TEST_PRICE,
    size: getOrderSize(),
    outcome: 'YES',
    expirationTimestamp,
    negRisk: false,
  });
  const signTime = Math.round(performance.now() - signStart);
  log(`Signing took: ${signTime}ms`);

  // ===== PHASE 3: Wait before spam =====
  log('');
  log(`--- PHASE 3: Waiting ${DELAY_BEFORE_SPAM_MS / 1000}s before spam ---`);

  // Pre-connect: warm up TLS session
  try {
    const warmupStart = performance.now();
    await fetch('https://clob.polymarket.com/health');
    const warmupTime = Math.round(performance.now() - warmupStart);
    log(`TLS warm-up: ${warmupTime}ms`);
  } catch (err) {
    log(`TLS warm-up failed (ok): ${err}`);
  }

  await new Promise(r => setTimeout(r, DELAY_BEFORE_SPAM_MS));

  // ===== PHASE 4: Spam orders =====
  // Режим: простой стрим с интервалом 2ms
  const SPAM_INTERVAL_MS = 2;

  log('');
  log(`--- PHASE 4: Spamming orders (${SPAM_INTERVAL_MS}ms interval) ---`);

  // Update server time before spam
  await updateServerTime();
  log(`Server time synced: ${cachedServerTime}`);

  const spamStart = Date.now();
  let totalAttempts = 0;
  let placed = false;
  let orderId = '';
  const latencies: number[] = [];
  const pendingRequests: Promise<any>[] = [];

  while (!placed && totalAttempts < MAX_ATTEMPTS) {
    totalAttempts++;
    const attemptNum = totalAttempts;
    const reqStart = performance.now();

    const request = tradingService.postSignedOrder(signedOrder, expirationTimestamp)
      .then(result => {
        const latency = Math.round(performance.now() - reqStart);
        latencies.push(latency);
        logLatency(slug, 'UP', TEST_PRICE, getOrderSize(), latency, true, result.orderId);
        if (!placed) {
          placed = true;
          orderId = result.orderId;
          log(`#${attemptNum}: ${latency}ms - SUCCESS! Order: ${orderId}`);
        }
        return { success: true, latency };
      })
      .catch(err => {
        const latency = Math.round(performance.now() - reqStart);
        latencies.push(latency);
        logLatency(slug, 'UP', TEST_PRICE, getOrderSize(), latency, false, undefined, err.message);
        return { success: false, latency, error: err.message };
      });

    pendingRequests.push(request);

    // Логируем каждые 100 запросов
    if (totalAttempts % 100 === 0) {
      const elapsed = Math.round((Date.now() - spamStart) / 100) / 10;
      log(`#${totalAttempts}: ${elapsed}s elapsed, ${pendingRequests.length} in-flight`);
    }

    await new Promise(r => setTimeout(r, SPAM_INTERVAL_MS));
  }

  // Ждём завершения всех pending запросов
  log(`Waiting for ${pendingRequests.length} pending requests...`);
  await Promise.all(pendingRequests);

  // ===== PHASE 5: Results =====
  log('');
  log('='.repeat(60));
  log('RESULTS:');
  log('='.repeat(60));

  const spamElapsed = Math.round((Date.now() - spamStart) / 1000 * 10) / 10;

  if (placed) {
    log(`  Status: SUCCESS`);
    log(`  Order ID: ${orderId}`);
  } else {
    log(`  Status: FAILED (max attempts reached)`);
  }

  log(`  Total attempts: ${totalAttempts}`);
  log(`  Total spam time: ${spamElapsed}s`);

  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];

    log(`  Latency stats:`);
    log(`    Min: ${min}ms`);
    log(`    Max: ${max}ms`);
    log(`    Avg: ${avg}ms`);
    log(`    Median: ${median}ms`);
  }

  // Write summary to CSV
  writeSummary();
  log(`Summary written to: ${LATENCY_SUMMARY_FILE}`);

  log('='.repeat(60));
}

// Main
async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.log('Usage: npm run test-latency <market-slug>');
    console.log('Example: npm run test-latency btc-updown-15m-1764929700');
    process.exit(1);
  }

  // Extract timestamp from slug
  const match = slug.match(/-(\d+)$/);
  if (!match) {
    console.log('ERROR: Invalid slug format. Expected: xxx-updown-15m-TIMESTAMP');
    process.exit(1);
  }

  const marketTimestamp = parseInt(match[1]);

  await runTest(slug, marketTimestamp);
}

// Handle termination
process.on('SIGINT', () => {
  log('Shutting down...');
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
