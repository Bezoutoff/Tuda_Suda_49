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
const RESPONSE_LOG_FILE = path.join(__dirname, '..', 'api-responses.log');

// Initialize latency log with header if not exists
function initLatencyLog() {
  if (!fs.existsSync(LATENCY_LOG_FILE)) {
    fs.writeFileSync(LATENCY_LOG_FILE, 'timestamp,slug,side,price,latency_ms,success,error\n');
  }
}

// Append latency record to CSV
function logLatency(slug: string, side: string, price: number, latencyMs: number, success: boolean, error?: string) {
  const timestamp = new Date().toISOString();
  const errorMsg = error ? `"${error.replace(/"/g, '""')}"` : '';
  const line = `${timestamp},${slug},${side},${price},${latencyMs},${success},${errorMsg}\n`;
  fs.appendFileSync(LATENCY_LOG_FILE, line);
}

// Log full API response to file
function logApiResponse(slug: string, latencyMs: number, success: boolean, response: any) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    slug,
    latencyMs,
    success,
    response: response || null,
  };
  fs.appendFileSync(RESPONSE_LOG_FILE, JSON.stringify(entry) + '\n');
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

  log(`=`.repeat(60));
  log(`LATENCY TEST: ${slug}`);
  log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
  log(`Latency CSV: ${LATENCY_LOG_FILE}`);
  log(`API responses: ${RESPONSE_LOG_FILE}`);
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

  // ===== PHASE 2: Wait before spam =====
  log('');
  log(`--- PHASE 2: Waiting ${DELAY_BEFORE_SPAM_MS / 1000}s before spam ---`);
  await new Promise(r => setTimeout(r, DELAY_BEFORE_SPAM_MS));

  // ===== PHASE 3: Pre-sign order =====
  log('');
  log('--- PHASE 3: Pre-signing order ---');
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

  // ===== PHASE 4: Spam orders =====
  log('');
  log(`--- PHASE 4: Spamming orders (${PARALLEL_REQUESTS} parallel) ---`);

  const spamStart = Date.now();
  let totalAttempts = 0;
  let placed = false;
  let orderId = '';
  const latencies: number[] = [];

  while (!placed && totalAttempts < MAX_ATTEMPTS) {
    const batchStart = performance.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      totalAttempts++;
      const attemptNum = totalAttempts;
      const reqStart = performance.now();

      promises.push(
        tradingService.postSignedOrder(signedOrder, expirationTimestamp)
          .then(result => {
            const latency = Math.round(performance.now() - reqStart);
            latencies.push(latency);
            logLatency(slug, 'UP', TEST_PRICE, latency, true);
            logApiResponse(slug, latency, true, result.rawResponse);
            if (!placed) {
              placed = true;
              orderId = result.orderId;
              log(`#${attemptNum}: ${latency}ms - SUCCESS! Order: ${orderId}`);
              log(`  Full response: ${JSON.stringify(result.rawResponse)}`);
            }
          })
          .catch(err => {
            const latency = Math.round(performance.now() - reqStart);
            latencies.push(latency);
            logLatency(slug, 'UP', TEST_PRICE, latency, false, err.message);
            logApiResponse(slug, latency, false, err.rawResponse || { error: err.message });
          })
      );
    }

    await Promise.all(promises);

    const batchLatency = Math.round(performance.now() - batchStart);
    const successCount = placed ? 1 : 0;

    if (!placed) {
      // Log batch result
      const batchNum = Math.ceil(totalAttempts / PARALLEL_REQUESTS);
      const rangeStart = (batchNum - 1) * PARALLEL_REQUESTS + 1;
      const rangeEnd = totalAttempts;
      log(`#${rangeStart}-${rangeEnd}: ${batchLatency}ms batch - all failed`);
    }
  }

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
