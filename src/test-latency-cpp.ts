/**
 * C++ Latency Test - Node.js Wrapper
 *
 * This script:
 * 1. Polls for market (same as test-latency.ts)
 * 2. Pre-signs the order (EIP-712 in Node.js)
 * 3. Spawns C++ binary for HTTP spam
 * 4. Passes credentials + order body via stdin
 *
 * Usage: npm run test-latency-cpp btc-updown-15m-1764929700
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig, BOT_CONFIG, getOrderSize } from './config';
import { OrderType } from '@polymarket/clob-client';

// Latency log file (unified format with summary stats in each row)
const LATENCY_LOG_FILE = path.join(__dirname, '..', 'latency.csv');
const CPP_BINARY = path.join(__dirname, '..', 'dist', 'test-latency-cpp');

// CSV header (unified format with summary stats)
const CSV_HEADER = 'server_time_ms,market_time,sec_to_market,slug,side,price,size,latency_ms,status,order_id,attempt,total_attempts,success_count,first_success_attempt,min_ms,max_ms,avg_ms,median_ms,source\n';

// Test parameters
const TEST_PRICE = 0.44;
// Get expiration buffer from ORDER_CONFIG for TEST_PRICE
const TEST_EXPIRATION_BUFFER = BOT_CONFIG.ORDER_CONFIG.find(c => c.price === TEST_PRICE)?.expirationBuffer || 30;
const MAX_ATTEMPTS = BOT_CONFIG.MAX_ORDER_ATTEMPTS;
const INTERVAL_MS = 1;
const DELAY_BEFORE_SPAM_MS = BOT_CONFIG.DELAY_BEFORE_SPAM_MS;
const POLL_INTERVAL_MS = BOT_CONFIG.POLL_INTERVAL_MS;
const INTERVAL_SECONDS = 900; // 15 minutes

// State for logging
let cachedServerTime = 0;
let cachedLocalTime = 0;
let currentMarketTime = 0;
let currentSlug = '';
let attemptCounter = 0;
const latencyRecords: { latencyMs: number; success: boolean; attempt: number; orderId?: string }[] = [];

// Logger with timestamp
function log(message: string) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] ${message}`);
}

// Initialize latency log with header if not exists
function initLatencyLog() {
  if (!fs.existsSync(LATENCY_LOG_FILE)) {
    fs.writeFileSync(LATENCY_LOG_FILE, CSV_HEADER);
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
  if (error?.includes('does not exist')) return true;
  return true;  // Log all attempts for now
}

// Track latency for later aggregation
function trackLatency(latencyMs: number, success: boolean, orderId?: string, error?: string) {
  if (!shouldLog(success, error)) return;
  attemptCounter++;
  latencyRecords.push({ latencyMs, success, attempt: attemptCounter, orderId });
}

// Write final result to CSV (one row per market with all stats)
function writeResult(
  slug: string,
  side: string,
  price: number,
  size: number,
  finalLatencyMs: number,
  success: boolean,
  orderId?: string
) {
  const serverTimeMs = getServerTimeMs();
  const secToMarket = ((currentMarketTime * 1000) - serverTimeMs) / 1000;
  const status = success ? 'success' : 'failed';

  // Calculate summary stats
  const totalAttempts = latencyRecords.length;
  const successRecords = latencyRecords.filter(r => r.success);
  const successCount = successRecords.length;
  const firstSuccessAttempt = successRecords.length > 0
    ? Math.min(...successRecords.map(r => r.attempt))
    : 0;

  let minMs = 0, maxMs = 0, avgMs = 0, medianMs = 0;
  if (latencyRecords.length > 0) {
    const latencies = latencyRecords.map(r => r.latencyMs);
    const sorted = [...latencies].sort((a, b) => a - b);
    minMs = sorted[0];
    maxMs = sorted[sorted.length - 1];
    avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    medianMs = sorted[Math.floor(sorted.length / 2)];
  }

  const line = `${serverTimeMs},${currentMarketTime},${secToMarket.toFixed(3)},${slug},${side},${price},${size},${finalLatencyMs},${status},${orderId || ''},${attemptCounter},${totalAttempts},${successCount},${firstSuccessAttempt},${minMs},${maxMs},${avgMs},${medianMs},cpp\n`;
  fs.appendFileSync(LATENCY_LOG_FILE, line);
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
 * Run C++ latency test
 */
async function runTest(slug: string, marketTimestamp: number) {
  // Initialize latency logging
  initLatencyLog();

  // Set global state for logging
  currentMarketTime = marketTimestamp;
  currentSlug = slug;
  attemptCounter = 0;
  latencyRecords.length = 0;

  log(`=`.repeat(60));
  log(`C++ LATENCY TEST: ${slug}`);
  log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
  log(`Latency CSV: ${LATENCY_LOG_FILE}`);
  log(`C++ binary: ${CPP_BINARY}`);
  log(`=`.repeat(60));

  // Check if C++ binary exists
  if (!fs.existsSync(CPP_BINARY)) {
    log('ERROR: C++ binary not found. Run: npm run build:cpp');
    process.exit(1);
  }

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
    negRisk: false,  // Same as test-latency.ts
  });
  const signTime = Math.round(performance.now() - signStart);
  log(`Signing took: ${signTime}ms`);

  // ===== PHASE 3: Prepare config for C++ =====
  log('');
  log('--- PHASE 3: Preparing C++ config ---');

  // SDK's orderToJson transforms:
  // 1. Adds owner (apiKey)
  // 2. Adds deferExec (false)
  // 3. Converts salt to integer
  // 4. Converts side from number (0/1) to string ("BUY"/"SELL")
  // 5. Uses string orderType ("GTD", not 1)
  // But keeps expiration, nonce, feeRateBps as strings

  const transformedOrder = {
    ...signedOrder,
    salt: parseInt(signedOrder.salt, 10),
    side: signedOrder.side === 0 ? 'BUY' : 'SELL',  // 0 = BUY, 1 = SELL
  };

  const orderBody = JSON.stringify([
    {
      deferExec: false,
      order: transformedOrder,
      owner: tradingConfig.apiKey,
      orderType: 'GTD',  // String, not numeric!
    },
  ]);

  log(`  signedOrder keys: ${Object.keys(signedOrder).join(', ')}`);

  // Get wallet address (signer) - this is what POLY_ADDRESS should be!
  const { Wallet } = await import('ethers');
  const pk = tradingConfig.privateKey.startsWith('0x')
    ? tradingConfig.privateKey
    : '0x' + tradingConfig.privateKey;
  const wallet = new Wallet(pk);
  const walletAddress = wallet.address;

  log(`Wallet address: ${walletAddress}`);
  log(`Funder address: ${tradingConfig.funder}`);

  // Debug: print expected signature for verification
  log('');
  log('--- DEBUG: Expected HMAC signature ---');
  const crypto = await import('crypto');
  // Use current server time for comparison
  const timeResponse = await fetch('https://clob.polymarket.com/time');
  const serverTime = await timeResponse.text();
  const testMessage = serverTime + 'POST' + '/orders' + orderBody;
  const testSignature = crypto
    .createHmac('sha256', Buffer.from(tradingConfig.secret!, 'base64'))
    .update(testMessage)
    .digest('base64');
  log(`  Secret (first 8): ${tradingConfig.secret?.slice(0, 8)}...`);
  log(`  Secret length: ${tradingConfig.secret?.length}`);
  log(`  Server time: ${serverTime}`);
  log(`  Body (first 50): ${orderBody.slice(0, 50)}...`);
  log(`  Body length: ${orderBody.length}`);
  log(`  Full body: ${orderBody}`);
  log(`  Message length: ${testMessage.length}`);
  log(`  Expected signature: ${testSignature}`);

  const cppConfig = {
    body: orderBody,
    apiKey: tradingConfig.apiKey,
    secret: tradingConfig.secret,
    passphrase: tradingConfig.passphrase,
    address: walletAddress,  // IMPORTANT: Use wallet address, not funder!
    maxAttempts: MAX_ATTEMPTS,
    intervalMs: INTERVAL_MS,
    // Pass the test timestamp for signature comparison
    testTimestamp: serverTime,
    testSignature: testSignature,
  };

  log(`Max attempts: ${cppConfig.maxAttempts}`);
  log(`Interval: ${cppConfig.intervalMs}ms`);
  log(`Address: ${cppConfig.address?.slice(0, 10)}...`);

  // Test: Raw HTTP request from Node.js (same as C++ would do)
  log('');
  log('--- TEST: Raw HTTP from Node.js (same as C++) ---');
  const freshTimeResp = await fetch('https://clob.polymarket.com/time');
  const freshTime = await freshTimeResp.text();
  const rawMessage = freshTime + 'POST' + '/orders' + orderBody;
  let rawSignature = crypto
    .createHmac('sha256', Buffer.from(tradingConfig.secret!, 'base64'))
    .update(rawMessage)
    .digest('base64');
  // Convert to URL-safe base64 (same as C++)
  rawSignature = rawSignature.replace(/\+/g, '-').replace(/\//g, '_');

  log(`  Timestamp: ${freshTime}`);
  log(`  Signature: ${rawSignature}`);

  // Update server time before test
  await updateServerTime();

  const rawStart = performance.now();
  try {
    const rawResp = await fetch('https://clob.polymarket.com/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': walletAddress,
        'POLY_SIGNATURE': rawSignature,
        'POLY_TIMESTAMP': freshTime,
        'POLY_API_KEY': tradingConfig.apiKey!,
        'POLY_PASSPHRASE': tradingConfig.passphrase!,
      },
      body: orderBody,
    });
    const rawLatency = Math.round(performance.now() - rawStart);
    const rawResult = await rawResp.text();
    log(`  Status: ${rawResp.status}`);
    log(`  Latency: ${rawLatency}ms`);
    log(`  Response: ${rawResult.slice(0, 200)}`);

    if (rawResp.status === 200) {
      // Parse order ID from response
      let orderId = '';
      let errorMsg = '';
      try {
        const parsed = JSON.parse(rawResult);
        if (Array.isArray(parsed) && parsed[0]) {
          orderId = parsed[0].orderID || '';
          errorMsg = parsed[0].errorMsg || '';
        }
      } catch {}

      // Check if order was actually placed (orderID not empty)
      if (orderId) {
        log('  >>> Raw HTTP works! Order placed.');
        trackLatency(rawLatency, true, orderId);
        writeResult(slug, 'UP', TEST_PRICE, getOrderSize(), rawLatency, true, orderId);
        log(`Result written to: ${LATENCY_LOG_FILE}`);
        // Order was placed, skip C++ for this market
        return;
      } else {
        // Status 200 but order not placed (e.g., orderbook does not exist)
        log(`  >>> Order NOT placed: ${errorMsg || 'unknown error'}`);
        trackLatency(rawLatency, false, undefined, errorMsg);
        // Continue to C++ spam phase
      }
    } else {
      // Non-200 status
      trackLatency(rawLatency, false, undefined, rawResult);
    }
  } catch (err: any) {
    const rawLatency = Math.round(performance.now() - rawStart);
    log(`  Error: ${err.message}`);
    trackLatency(rawLatency, false, undefined, err.message);
  }

  // ===== PHASE 4: Wait before spam =====
  log('');
  log(`--- PHASE 4: Waiting ${DELAY_BEFORE_SPAM_MS / 1000}s before spam ---`);

  await new Promise(r => setTimeout(r, DELAY_BEFORE_SPAM_MS));

  // ===== PHASE 5: Run C++ binary =====
  log('');
  log('--- PHASE 5: Running C++ binary ---');

  // Update server time before spam
  await updateServerTime();
  log(`Server time synced: ${cachedServerTime}`);

  const spamStart = Date.now();

  return new Promise<void>((resolve, reject) => {
    const cpp = spawn(CPP_BINARY, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Send config via stdin
    cpp.stdin.write(JSON.stringify(cppConfig));
    cpp.stdin.end();

    let stdout = '';
    let stderr = '';

    cpp.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        stdout += line + '\n';

        // Parse output
        if (line.startsWith('ATTEMPT:')) {
          const parts = line.split(':');
          const attemptNum = parseInt(parts[1]);
          const latency = parseInt(parts[2]);
          const success = parts[3] === 'true';
          const message = parts.slice(4).join(':');

          if (success) {
            log(`#${attemptNum}: ${latency}ms - SUCCESS! Order: ${message}`);
            trackLatency(latency, true, message);
          } else {
            trackLatency(latency, false, undefined, message);
          }
        } else if (line.startsWith('WARMUP:')) {
          const warmup = parseInt(line.split(':')[1]);
          log(`TLS warm-up: ${warmup}ms`);
        } else if (line.startsWith('SUCCESS:')) {
          const orderId = line.split(':')[1];
          log(`Order placed: ${orderId}`);
        } else if (line.startsWith('FAILED:')) {
          log(`Failed: ${line.split(':')[1]}`);
        } else if (line.startsWith('STATS:')) {
          log(`Stats: ${line.substring(6)}`);
        }
      }
    });

    cpp.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log stderr in real-time
      process.stderr.write(data);
    });

    cpp.on('close', (code) => {
      const spamElapsed = Math.round((Date.now() - spamStart) / 1000 * 10) / 10;

      log('');
      log('='.repeat(60));
      log('RESULTS:');
      log('='.repeat(60));
      log(`  Exit code: ${code}`);
      log(`  Total time: ${spamElapsed}s`);

      // Write result to CSV (find the successful order if any)
      const successRecord = latencyRecords.find(r => r.success);
      if (successRecord) {
        writeResult(slug, 'UP', TEST_PRICE, getOrderSize(), successRecord.latencyMs, true, successRecord.orderId);
      } else if (latencyRecords.length > 0) {
        const lastRecord = latencyRecords[latencyRecords.length - 1];
        writeResult(slug, 'UP', TEST_PRICE, getOrderSize(), lastRecord.latencyMs, false);
      }
      log(`Result written to: ${LATENCY_LOG_FILE}`);

      log('='.repeat(60));

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`C++ binary exited with code ${code}`));
      }
    });

    cpp.on('error', (err) => {
      log(`ERROR: Failed to spawn C++ binary: ${err.message}`);
      reject(err);
    });
  });
}

// Main
async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.log('Usage: npm run test-latency-cpp <market-slug>');
    console.log('Example: npm run test-latency-cpp btc-updown-15m-1764929700');
    process.exit(1);
  }

  // Extract pattern and timestamp from slug
  const match = slug.match(/^(.+)-(\d+)$/);
  if (!match) {
    console.log('ERROR: Invalid slug format. Expected: xxx-updown-15m-TIMESTAMP');
    process.exit(1);
  }

  const pattern = match[1]; // e.g., "btc-updown-15m"
  let marketTimestamp = parseInt(match[2]);

  // Continuous loop
  while (true) {
    const currentSlug = `${pattern}-${marketTimestamp}`;

    log(`\n${'='.repeat(60)}`);
    log(`Processing: ${currentSlug}`);
    log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
    log(`${'='.repeat(60)}`);

    try {
      await runTest(currentSlug, marketTimestamp);
    } catch (err: any) {
      log(`Error processing market: ${err.message}`);
    }

    // Move to next market (+900 seconds = 15 minutes)
    marketTimestamp += INTERVAL_SECONDS;
    log(`\nNext market: ${pattern}-${marketTimestamp} at ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);

    // Small delay before next iteration
    await new Promise(r => setTimeout(r, 1000));
  }
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
