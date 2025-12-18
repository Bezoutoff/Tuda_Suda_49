/**
 * UpDownBot C++ - Production Bot with Ladder Strategy
 *
 * This bot:
 * 1. Continuously monitors for new BTC updown-15m markets
 * 2. Pre-signs 10 orders (5 price levels × 2 sides)
 * 3. Spawns 10 C++ processes for parallel HTTP spam
 * 4. Logs results to CSV with latency stats
 *
 * Usage: npm run updown-bot btc-updown-15m-1764929700
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { TradingService } from '../trading-service';
import { tradingConfig, validateTradingConfig, BOT_CONFIG } from '../config';
import { OrderType } from '@polymarket/clob-client';

// Paths
const LATENCY_LOG_FILE = path.join(__dirname, '..', '..', 'updown-bot.csv');
const CPP_BINARY = path.join(__dirname, '..', '..', 'dist', 'updown-bot-cpp');
const STATE_DIR = path.join(__dirname, '..', '..', '.bot-state');
const STATE_FILE_PREFIX = 'updown-bot-state-';

// CSV header (22 columns - added order_index and expiration_buffer)
const CSV_HEADER = 'server_time_ms,market_time,sec_to_market,slug,accepting_orders_timestamp,order_index,side,price,size,expiration_buffer,latency_ms,status,order_id,attempt,total_attempts,success_count,first_success_attempt,min_ms,max_ms,avg_ms,median_ms,source\n';

// Bot parameters
const MAX_ATTEMPTS_PER_ORDER = 500;
const INTERVAL_MS = 1;
const DELAY_BEFORE_SPAM_MS = BOT_CONFIG.DELAY_BEFORE_SPAM_MS;
const POLL_INTERVAL_MS = BOT_CONFIG.POLL_INTERVAL_MS;
const INTERVAL_SECONDS = 900; // 15 minutes

// State for logging
let cachedServerTime = 0;
let cachedLocalTime = 0;
let currentMarketTime = 0;
let currentSlug = '';
let acceptingOrdersTimestamp: string | undefined;

// Types
interface SignedOrderInfo {
  signedOrder: any;
  price: number;
  size: number;
  expirationBuffer: number;
  tokenId: string;
  side: 'YES' | 'NO';
}

interface OrderResult {
  success: boolean;
  orderId?: string;
  latencyMs: number;
  attempt: number;
  totalAttempts: number;
  successCount: number;
  firstSuccessAttempt: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  medianMs: number;
}

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

// State management
function getStateFilePath(pattern: string): string {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  return path.join(STATE_DIR, `${STATE_FILE_PREFIX}${pattern}.json`);
}

function loadLastProcessedTimestamp(pattern: string): number | null {
  const stateFile = getStateFilePath(pattern);
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return data.lastProcessedTimestamp || null;
  } catch {
    return null;
  }
}

function saveLastProcessedTimestamp(pattern: string, timestamp: number) {
  const stateFile = getStateFilePath(pattern);
  const state = { lastProcessedTimestamp: timestamp, updatedAt: new Date().toISOString() };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  log(`Saved state: last processed = ${timestamp} (${new Date(timestamp * 1000).toLocaleString('ru-RU')})`);
}

// Note: Duplicate order prevention is handled by state management
// State file tracks last processed timestamp, preventing reprocessing on restart

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

// Write order result to CSV
function writeOrderResult(
  orderIndex: number,
  orderInfo: SignedOrderInfo,
  result: OrderResult
) {
  const serverTimeMs = getServerTimeMs();
  const secToMarket = ((currentMarketTime * 1000) - serverTimeMs) / 1000;
  const status = result.success ? 'success' : 'failed';
  const sideLabel = orderInfo.side === 'YES' ? 'UP' : 'DOWN';

  const line = [
    serverTimeMs,
    currentMarketTime,
    secToMarket.toFixed(3),
    currentSlug,
    acceptingOrdersTimestamp || '',
    orderIndex,
    sideLabel,
    orderInfo.price,
    orderInfo.size,
    orderInfo.expirationBuffer,
    result.latencyMs,
    status,
    result.orderId || '',
    result.attempt,
    result.totalAttempts,
    result.successCount,
    result.firstSuccessAttempt,
    result.minMs,
    result.maxMs,
    result.avgMs,
    result.medianMs,
    'cpp'
  ].join(',') + '\n';

  fs.appendFileSync(LATENCY_LOG_FILE, line);
}

/**
 * Fetch market by slug from Gamma API
 */
async function fetchMarketBySlug(slug: string): Promise<{
  yesTokenId: string;
  noTokenId: string;
  acceptingOrdersTimestamp?: string;
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

    // Get acceptingOrdersTimestamp from markets[0]
    let acceptingOrdersTimestamp: string | undefined;
    if (market.markets && Array.isArray(market.markets) && market.markets[0]) {
      acceptingOrdersTimestamp = market.markets[0].acceptingOrdersTimestamp;
    }

    return {
      yesTokenId: clobTokenIds[0],
      noTokenId: clobTokenIds[1],
      acceptingOrdersTimestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Pre-sign all 10 orders (5 price levels × 2 sides)
 */
async function preSignOrders(
  tradingService: TradingService,
  yesTokenId: string,
  noTokenId: string,
  marketTimestamp: number
): Promise<SignedOrderInfo[]> {
  const signedOrders: SignedOrderInfo[] = [];

  log('Pre-signing 10 orders...');

  for (const { price, size, expirationBuffer } of BOT_CONFIG.ORDER_CONFIG) {
    const expirationTimestamp = marketTimestamp - expirationBuffer;

    // YES order
    const yesOrder = await tradingService.createSignedOrder({
      tokenId: yesTokenId,
      side: 'BUY',
      price,
      size,
      outcome: 'YES',
      expirationTimestamp,
      negRisk: false,
    });

    signedOrders.push({
      signedOrder: yesOrder,
      price,
      size,
      expirationBuffer,
      tokenId: yesTokenId,
      side: 'YES',
    });

    // NO order
    const noOrder = await tradingService.createSignedOrder({
      tokenId: noTokenId,
      side: 'BUY',
      price,
      size,
      outcome: 'NO',
      expirationTimestamp,
      negRisk: false,
    });

    signedOrders.push({
      signedOrder: noOrder,
      price,
      size,
      expirationBuffer,
      tokenId: noTokenId,
      side: 'NO',
    });

    log(`  Signed: ${price} @ ${size} USDC (exp: ${new Date(expirationTimestamp * 1000).toLocaleString('ru-RU')})`);
  }

  log(`Pre-signed ${signedOrders.length} orders`);
  return signedOrders;
}

/**
 * Spawn single C++ process for one order
 */
async function spawnCppSpammer(
  orderInfo: SignedOrderInfo,
  orderIndex: number,
  walletAddress: string
): Promise<OrderResult> {
  return new Promise((resolve, reject) => {
    // Transform order same as test-latency-cpp
    const transformedOrder = {
      ...orderInfo.signedOrder,
      salt: parseInt(orderInfo.signedOrder.salt, 10),
      side: orderInfo.signedOrder.side === 0 ? 'BUY' : 'SELL',
    };

    const orderBody = JSON.stringify([
      {
        deferExec: false,
        order: transformedOrder,
        owner: tradingConfig.apiKey,
        orderType: 'GTD',
      },
    ]);

    const cppConfig = {
      body: orderBody,
      apiKey: tradingConfig.apiKey,
      secret: tradingConfig.secret,
      passphrase: tradingConfig.passphrase,
      address: walletAddress,
      maxAttempts: MAX_ATTEMPTS_PER_ORDER,
      intervalMs: INTERVAL_MS,
      orderIndex,
    };

    const cpp = spawn(CPP_BINARY, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Send config via stdin
    cpp.stdin.write(JSON.stringify(cppConfig));
    cpp.stdin.end();

    let stdout = '';
    let stderr = '';

    const latencyRecords: { latencyMs: number; success: boolean; attempt: number; orderId?: string }[] = [];
    let attemptCounter = 0;

    cpp.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        stdout += line + '\n';

        // Parse output
        if (line.startsWith('ATTEMPT:')) {
          const parts = line.split(':');
          const orderIdx = parseInt(parts[1]);
          const attemptNum = parseInt(parts[2]);
          const latency = parseInt(parts[3]);
          const success = parts[4] === 'true';
          const message = parts.slice(5).join(':');

          attemptCounter++;
          latencyRecords.push({ latencyMs: latency, success, attempt: attemptCounter, orderId: success ? message : undefined });
        } else if (line.startsWith('WARMUP:')) {
          const warmup = parseInt(line.split(':')[1]);
          log(`  [Order ${orderIndex}] TLS warm-up: ${warmup}ms`);
        } else if (line.startsWith('SUCCESS:')) {
          const parts = line.split(':');
          const orderId = parts.slice(2).join(':');
          log(`  [Order ${orderIndex}] SUCCESS! Order: ${orderId.slice(0, 20)}...`);
        } else if (line.startsWith('FAILED:')) {
          log(`  [Order ${orderIndex}] Failed: ${line.split(':')[1]}`);
        }
      }
    });

    cpp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    cpp.on('close', (code) => {
      // Calculate result stats
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

      const successRecord = successRecords[0];
      const lastRecord = latencyRecords[latencyRecords.length - 1];

      const result: OrderResult = {
        success: successCount > 0,
        orderId: successRecord?.orderId,
        latencyMs: (successRecord || lastRecord)?.latencyMs || 0,
        attempt: attemptCounter,
        totalAttempts,
        successCount,
        firstSuccessAttempt,
        minMs,
        maxMs,
        avgMs,
        medianMs,
      };

      if (code === 0) {
        resolve(result);
      } else {
        resolve(result); // Still resolve with partial data
      }
    });

    cpp.on('error', (err) => {
      log(`  [Order ${orderIndex}] ERROR: Failed to spawn C++ binary: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Spam all 10 orders in parallel
 */
async function spamAllOrders(
  signedOrders: SignedOrderInfo[],
  walletAddress: string
): Promise<void> {
  log('');
  log('--- Spawning 10 C++ processes for spam ---');

  const spamStart = Date.now();

  const processes = signedOrders.map((orderInfo, idx) =>
    spawnCppSpammer(orderInfo, idx, walletAddress)
  );

  const results = await Promise.all(processes);

  const spamElapsed = Math.round((Date.now() - spamStart) / 1000 * 10) / 10;

  log('');
  log('='.repeat(60));
  log('RESULTS:');
  log('='.repeat(60));
  log(`  Total time: ${spamElapsed}s`);
  log(`  Processes: ${results.length}`);

  // Write all results to CSV
  results.forEach((result, idx) => {
    writeOrderResult(idx, signedOrders[idx], result);
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const sideLabel = signedOrders[idx].side === 'YES' ? 'UP' : 'DOWN';
    log(`  [${idx}] ${sideLabel} @ ${signedOrders[idx].price}: ${status} (${result.avgMs}ms avg)`);
  });

  const successCount = results.filter(r => r.success).length;
  log(`  Success rate: ${successCount}/${results.length} (${Math.round(successCount / results.length * 100)}%)`);
  log(`Results written to: ${LATENCY_LOG_FILE}`);
  log('='.repeat(60));
}

/**
 * Run bot for single market
 */
async function runMarket(slug: string, marketTimestamp: number, pattern: string, tradingService: TradingService, walletAddress: string) {
  // Initialize latency logging
  initLatencyLog();

  // Set global state for logging
  currentMarketTime = marketTimestamp;
  currentSlug = slug;
  acceptingOrdersTimestamp = undefined;

  log(`=`.repeat(60));
  log(`UPDOWN BOT C++: ${slug}`);
  log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
  log(`CSV log: ${LATENCY_LOG_FILE}`);
  log(`C++ binary: ${CPP_BINARY}`);
  log(`=`.repeat(60));

  // Check if C++ binary exists
  if (!fs.existsSync(CPP_BINARY)) {
    log('ERROR: C++ binary not found. Run: npm run build:updown-bot');
    process.exit(1);
  }

  log(`Wallet address: ${walletAddress}`);
  log(`Funder address: ${tradingConfig.funder}`);

  // ===== PHASE 1: Polling =====
  log('');
  log('--- PHASE 1: Polling for market ---');

  let pollCount = 0;
  const pollStart = Date.now();
  let market: { yesTokenId: string; noTokenId: string; acceptingOrdersTimestamp?: string } | null = null;

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

      // Save acceptingOrdersTimestamp
      acceptingOrdersTimestamp = market.acceptingOrdersTimestamp;
      if (acceptingOrdersTimestamp) {
        log(`Accepting orders since: ${new Date(acceptingOrdersTimestamp).toLocaleString('ru-RU')}`);
      } else {
        log(`Accepting orders: not yet (orderbook inactive)`);
      }
    } else {
      if (pollCount % 100 === 0) {
        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        log(`Polling... ${pollCount} requests, ${elapsed}s`);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  // ===== PHASE 2: Pre-sign all 10 orders =====
  log('');
  log('--- PHASE 2: Pre-signing orders ---');

  const signStart = performance.now();
  const signedOrders = await preSignOrders(
    tradingService,
    market.yesTokenId,
    market.noTokenId,
    marketTimestamp
  );
  const signTime = Math.round(performance.now() - signStart);
  log(`Pre-signing took: ${signTime}ms`);

  // ===== PHASE 3: Wait before spam =====
  log('');
  log(`--- PHASE 3: Waiting ${DELAY_BEFORE_SPAM_MS / 1000}s before spam ---`);

  await new Promise(r => setTimeout(r, DELAY_BEFORE_SPAM_MS));

  // ===== PHASE 4: Update server time =====
  await updateServerTime();
  log(`Server time synced: ${cachedServerTime}`);

  // ===== PHASE 5: Spawn 10 C++ processes =====
  await spamAllOrders(signedOrders, walletAddress);

  // ===== PHASE 6: Save state after successful completion =====
  log('');
  log('--- PHASE 6: Saving state ---');
  saveLastProcessedTimestamp(pattern, marketTimestamp);
}

// Main
async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.log('Usage: npm run updown-bot <market-slug>');
    console.log('Example: npm run updown-bot btc-updown-15m-1764929700');
    process.exit(1);
  }

  // Extract pattern and timestamp from slug
  const match = slug.match(/^(.+)-(\d+|AUTO)$/);
  if (!match) {
    console.log('ERROR: Invalid slug format. Expected: xxx-updown-15m-TIMESTAMP or xxx-updown-15m-AUTO');
    process.exit(1);
  }

  const pattern = match[1]; // e.g., "btc-updown-15m"
  let marketTimestamp: number;

  // Validate config
  if (!validateTradingConfig(tradingConfig)) {
    log('ERROR: Invalid trading config. Check .env');
    process.exit(1);
  }

  // Initialize trading service
  const tradingService = new TradingService(tradingConfig);

  // Get wallet address
  const { Wallet } = await import('ethers');
  const pk = tradingConfig.privateKey.startsWith('0x')
    ? tradingConfig.privateKey
    : '0x' + tradingConfig.privateKey;
  const wallet = new Wallet(pk);
  const walletAddress = wallet.address;

  log(`Wallet address: ${walletAddress}`);
  log(`Funder address: ${tradingConfig.funder}`);

  // Load last processed timestamp
  const lastProcessed = loadLastProcessedTimestamp(pattern);
  if (lastProcessed) {
    log(`Loaded state: last processed = ${lastProcessed} (${new Date(lastProcessed * 1000).toLocaleString('ru-RU')})`);
  }

  // Auto-calculate next market timestamp if "AUTO"
  if (match[2] === 'AUTO') {
    const now = Math.floor(Date.now() / 1000);

    // If we have saved state, start from next market after last processed
    if (lastProcessed) {
      // Find next market timestamp after last processed
      const remainder = lastProcessed % INTERVAL_SECONDS;
      marketTimestamp = lastProcessed + (INTERVAL_SECONDS - remainder);

      // If that's in the past, find next future market
      if (marketTimestamp <= now) {
        const remainderNow = now % INTERVAL_SECONDS;
        marketTimestamp = now + (INTERVAL_SECONDS - remainderNow);
      }

      log(`Resuming: Starting from ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')} (after last processed)`);
    } else {
      // No saved state - start from next market
      const remainder = now % INTERVAL_SECONDS;
      marketTimestamp = now + (INTERVAL_SECONDS - remainder);
      log(`Auto mode: Starting from next market at ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
    }
  } else {
    marketTimestamp = parseInt(match[2]);

    // Manual mode: use exact timestamp specified by user
    log(`Manual mode: Using timestamp ${marketTimestamp} (${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')})`);

    // Warn if already processed, but still use it (user explicitly requested it)
    if (lastProcessed && marketTimestamp <= lastProcessed) {
      log(`⚠️  Note: Market ${marketTimestamp} may have been processed before (last = ${lastProcessed})`);
    }
  }

  // Continuous loop
  while (true) {
    const currentSlug = `${pattern}-${marketTimestamp}`;

    log(`\n${'='.repeat(60)}`);
    log(`Processing: ${currentSlug}`);
    log(`Market time: ${new Date(marketTimestamp * 1000).toLocaleString('ru-RU')}`);
    log(`${'='.repeat(60)}`);

    try {
      await runMarket(currentSlug, marketTimestamp, pattern, tradingService, walletAddress);
    } catch (err: any) {
      log(`Error processing market: ${err.message}`);
      log(`Saving state and moving to next market...`);
      saveLastProcessedTimestamp(pattern, marketTimestamp);
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
