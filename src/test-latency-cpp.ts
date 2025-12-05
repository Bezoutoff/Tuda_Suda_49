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

// Latency log files
const LATENCY_LOG_FILE = path.join(__dirname, '..', 'latency-cpp.csv');
const CPP_BINARY = path.join(__dirname, '..', 'dist', 'test-latency-cpp');

// Test parameters
const TEST_PRICE = 0.45;
const TEST_EXPIRATION_BUFFER = 1; // 1 sec before market start
const MAX_ATTEMPTS = BOT_CONFIG.MAX_ORDER_ATTEMPTS;
const INTERVAL_MS = 2;
const DELAY_BEFORE_SPAM_MS = BOT_CONFIG.DELAY_BEFORE_SPAM_MS;
const POLL_INTERVAL_MS = BOT_CONFIG.POLL_INTERVAL_MS;

// Logger with timestamp
function log(message: string) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] ${message}`);
}

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

  // Build order body (same format as CLOB client)
  const orderBody = JSON.stringify([
    {
      order: signedOrder,
      orderType: OrderType.GTD,
    },
  ]);

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

  // Test: Use SDK to verify order is valid (same as test-latency.ts)
  log('');
  log('--- TEST: SDK postSignedOrder (same as test-latency.ts) ---');
  try {
    const sdkResult = await tradingService.postSignedOrder(signedOrder, expirationTimestamp);
    log(`  SUCCESS! Order ID: ${sdkResult.id}`);
    log(`  Raw response: ${JSON.stringify(sdkResult.rawResponse).slice(0, 100)}...`);
  } catch (err: any) {
    log(`  FAILED: ${err.message}`);
  }

  // ===== PHASE 4: Wait before spam =====
  log('');
  log(`--- PHASE 4: Waiting ${DELAY_BEFORE_SPAM_MS / 1000}s before spam ---`);

  await new Promise(r => setTimeout(r, DELAY_BEFORE_SPAM_MS));

  // ===== PHASE 5: Run C++ binary =====
  log('');
  log('--- PHASE 5: Running C++ binary ---');

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
      const lines = data.toString().split('\n');
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
            logLatency(slug, 'UP', TEST_PRICE, latency, true);
          } else {
            logLatency(slug, 'UP', TEST_PRICE, latency, false, message);
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
