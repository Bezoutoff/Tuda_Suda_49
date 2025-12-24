/**
 * BTC Updown 49 Bot
 *
 * Простая стратегия: 2 ордера по 0.49 (UP и DOWN) по 5 shares
 * Expiration: 20 минут до старта торгов
 *
 * Usage: npm run updown-btc-49 [btc-updown-15m-TIMESTAMP]
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig } from './config';

const INTERVAL_SECONDS = 900; // 15 минут

// Простая конфигурация
const SIMPLE_CONFIG = {
  PRICE: 0.49,
  SIZE: 5,
  EXPIRATION_MINUTES: 20, // 20 минут до старта
  POLL_INTERVAL_MS: 250,
  DELAY_BEFORE_SPAM_MS: 22500, // 22.5 секунд после получения token IDs
  MAX_ORDER_ATTEMPTS: 2000,
  POLL_TIMEOUT_MS: 20 * 60 * 1000, // 20 минут
  START_POLLING_BEFORE_MS: 60000, // Начать polling за 60 сек до времени
};

// Logger
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] [BTC-49] ${message}`, ...args);
}

function logError(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.error(`[${timestamp}] [BTC-49] ERROR: ${message}`, ...args);
}

/**
 * Calculate next 15-minute interval timestamp
 */
function getNextMarketTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil(now / INTERVAL_SECONDS) * INTERVAL_SECONDS;
}

/**
 * Format timestamp to human readable
 */
function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString('ru-RU');
}

/**
 * Fetch market by slug from Gamma API
 */
async function fetchMarketBySlug(slug: string): Promise<{
  yesTokenId: string;
  noTokenId: string;
  conditionId: string;
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
      conditionId: market.conditionId || '',
    };
  } catch {
    return null;
  }
}

/**
 * Place 2 simple orders: UP @ 0.49 and DOWN @ 0.49
 */
async function placeSimpleOrders(
  tradingService: TradingService,
  yesTokenId: string,   // UP token
  noTokenId: string,    // DOWN token
  marketTimestamp: number,
  slug: string
): Promise<boolean> {
  log(`Placing 2 orders for ${slug}:`);
  log(`  Price: $${SIMPLE_CONFIG.PRICE}`);
  log(`  Size: ${SIMPLE_CONFIG.SIZE} shares each (UP and DOWN)`);
  log(`  Expiration: ${SIMPLE_CONFIG.EXPIRATION_MINUTES} minutes after start`);

  // Calculate expiration: AFTER market start (not before!)
  // Polymarket adds +60s automatically, so subtract 60 from desired buffer
  const desiredSecondsAfterStart = SIMPLE_CONFIG.EXPIRATION_MINUTES * 60; // e.g. 1200s (20 min)
  const expirationBuffer = desiredSecondsAfterStart - 60; // Account for Polymarket +60s
  const expirationTimestamp = marketTimestamp + expirationBuffer;

  log(`  Expiration time: ${formatTimestamp(expirationTimestamp)} (${SIMPLE_CONFIG.EXPIRATION_MINUTES} min after start)`);

  interface SignedOrderInfo {
    signedOrder: any;
    side: 'UP' | 'DOWN';
    expirationTimestamp: number;
    placed: boolean;
    orderId?: string;
  }

  const signedOrders: SignedOrderInfo[] = [];

  // PRE-SIGN both orders
  log(`Pre-signing 2 orders...`);

  try {
    // UP order (YES token)
    const upOrder = await tradingService.createSignedOrder({
      tokenId: yesTokenId,
      side: 'BUY',
      price: SIMPLE_CONFIG.PRICE,
      size: SIMPLE_CONFIG.SIZE,
      outcome: 'YES',
      expirationTimestamp,
      negRisk: false,
    });
    signedOrders.push({ signedOrder: upOrder, side: 'UP', expirationTimestamp, placed: false });

    // DOWN order (NO token)
    const downOrder = await tradingService.createSignedOrder({
      tokenId: noTokenId,
      side: 'BUY',
      price: SIMPLE_CONFIG.PRICE,
      size: SIMPLE_CONFIG.SIZE,
      outcome: 'NO',
      expirationTimestamp,
      negRisk: false,
    });
    signedOrders.push({ signedOrder: downOrder, side: 'DOWN', expirationTimestamp, placed: false });

    log(`Both orders pre-signed successfully`);
  } catch (error: any) {
    logError(`Failed to pre-sign orders: ${error.message}`);
    return false;
  }

  // DELAY: wait before spam
  const delayMs = SIMPLE_CONFIG.DELAY_BEFORE_SPAM_MS;
  if (delayMs > 0) {
    log(`Waiting ${delayMs / 1000}s before spam...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // SPAM: stream mode
  const startTime = Date.now();
  let totalAttempts = 0;
  const STREAM_INTERVAL_MS = 5;
  const inFlightRequests: Promise<void>[] = [];

  log(`Stream spam: sending requests every ${STREAM_INTERVAL_MS}ms`);

  const sendRequest = (order: typeof signedOrders[0]) => {
    totalAttempts++;
    const promise = tradingService.postSignedOrder(order.signedOrder, order.expirationTimestamp)
      .then(result => {
        if (!order.placed) {
          order.placed = true;
          order.orderId = result.orderId;
          const placedCount = signedOrders.filter(o => o.placed).length;
          log(`${order.side} @ ${SIMPLE_CONFIG.PRICE} placed: ${result.orderId} (${placedCount}/2)`);
        }
      })
      .catch(() => {});
    inFlightRequests.push(promise);
  };

  // Stream loop
  while (signedOrders.some(o => !o.placed) && totalAttempts < SIMPLE_CONFIG.MAX_ORDER_ATTEMPTS * 2) {
    for (const order of signedOrders) {
      if (order.placed) continue;

      sendRequest(order);
      await new Promise(r => setTimeout(r, STREAM_INTERVAL_MS));
    }

    // Log progress every 500 attempts
    if (totalAttempts % 500 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const placedCount = signedOrders.filter(o => o.placed).length;
      log(`Progress: ${placedCount}/2 placed, ${totalAttempts} attempts, ${elapsed}s`);
    }
  }

  // Wait for all in-flight requests
  log(`Waiting for ${inFlightRequests.length} in-flight requests...`);
  await Promise.all(inFlightRequests);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const placedCount = signedOrders.filter(o => o.placed).length;

  if (placedCount === 2) {
    log(`*** BOTH ORDERS PLACED! (${totalAttempts} attempts, ${elapsed}s) ***`);
    return true;
  } else {
    const failed = signedOrders.filter(o => !o.placed);
    logError(`Failed to place ${failed.length} orders after ${totalAttempts} attempts (${elapsed}s):`);
    failed.forEach(o => logError(`  - ${o.side} @ ${SIMPLE_CONFIG.PRICE}`));
    return false;
  }
}

/**
 * Wait until specified timestamp
 */
async function waitUntil(targetMs: number): Promise<void> {
  const now = Date.now();
  const waitMs = targetMs - now;

  if (waitMs > 0) {
    log(`Waiting ${Math.round(waitMs / 1000)} seconds until ${new Date(targetMs).toLocaleString('ru-RU')}...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

/**
 * Poll for market and place orders
 */
async function pollAndPlaceOrders(
  tradingService: TradingService,
  slug: string,
  marketTimestamp: number
): Promise<boolean> {
  log(`Starting polling for: ${slug}`);

  let pollCount = 0;
  const startTime = Date.now();

  while (true) {
    pollCount++;

    const elapsed = Date.now() - startTime;
    if (elapsed > SIMPLE_CONFIG.POLL_TIMEOUT_MS) {
      logError(`Polling timeout after ${Math.round(elapsed / 1000)}s`);
      return false;
    }

    const market = await fetchMarketBySlug(slug);

    if (market) {
      log(`Market found after ${pollCount} requests (${Math.round(elapsed / 1000)}s)!`);
      log(`  YES Token: ${market.yesTokenId.slice(0, 20)}...`);
      log(`  NO Token: ${market.noTokenId.slice(0, 20)}...`);

      return await placeSimpleOrders(
        tradingService,
        market.yesTokenId,
        market.noTokenId,
        marketTimestamp,
        slug
      );
    }

    if (pollCount % 100 === 0) {
      log(`Polling... ${pollCount} requests, ${Math.round(elapsed / 1000)}s elapsed`);
    }

    await new Promise(resolve => setTimeout(resolve, SIMPLE_CONFIG.POLL_INTERVAL_MS));
  }
}

/**
 * Main bot function
 */
async function main() {
  log('Starting BTC Updown 49 Bot...');
  log(`Strategy: 2 orders @ $${SIMPLE_CONFIG.PRICE} (UP and DOWN)`);
  log(`Size: ${SIMPLE_CONFIG.SIZE} shares each`);
  log(`Expiration: ${SIMPLE_CONFIG.EXPIRATION_MINUTES} minutes before start`);
  log(`Total capital: $${SIMPLE_CONFIG.SIZE * SIMPLE_CONFIG.PRICE * 2} per market`);

  if (!validateTradingConfig(tradingConfig)) {
    logError('Invalid trading configuration. Check .env file.');
    process.exit(1);
  }

  const tradingService = new TradingService(tradingConfig);
  log('Trading service initialized');

  // Check for manual slug argument
  const manualSlug = process.argv[2];

  if (manualSlug) {
    // Manual mode
    log(`\n${'='.repeat(60)}`);
    log(`MANUAL MODE: ${manualSlug}`);
    log(`${'='.repeat(60)}`);

    const match = manualSlug.match(/^(.+)-(\d+)$/);
    if (!match) {
      logError(`Invalid slug format: ${manualSlug}`);
      return;
    }

    const pattern = match[1];
    let marketTimestamp = parseInt(match[2]);

    // Continuous loop
    while (true) {
      const slug = `${pattern}-${marketTimestamp}`;

      log(`\n${'='.repeat(60)}`);
      log(`Processing: ${slug}`);
      log(`Market time: ${formatTimestamp(marketTimestamp)}`);
      log(`${'='.repeat(60)}`);

      const success = await pollAndPlaceOrders(tradingService, slug, marketTimestamp);

      if (success) {
        log(`Market ${slug} processed successfully!`);
      } else {
        logError(`Failed to process market ${slug}`);
      }

      marketTimestamp += INTERVAL_SECONDS;
      log(`Next market: ${pattern}-${marketTimestamp} at ${formatTimestamp(marketTimestamp)}`);

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Auto mode
  const processedMarkets = new Set<string>();

  while (true) {
    const nextTimestamp = getNextMarketTimestamp();
    const slug = `btc-updown-15m-${nextTimestamp}`;

    if (processedMarkets.has(slug)) {
      log(`Market ${slug} already processed, waiting for next...`);
      await waitUntil((nextTimestamp + INTERVAL_SECONDS) * 1000 - SIMPLE_CONFIG.START_POLLING_BEFORE_MS);
      continue;
    }

    log(`\n${'='.repeat(60)}`);
    log(`Next market: ${slug}`);
    log(`Start time: ${formatTimestamp(nextTimestamp)}`);
    log(`${'='.repeat(60)}`);

    const pollStartTime = nextTimestamp * 1000 - SIMPLE_CONFIG.START_POLLING_BEFORE_MS;
    await waitUntil(pollStartTime);

    const success = await pollAndPlaceOrders(tradingService, slug, nextTimestamp);

    if (success) {
      processedMarkets.add(slug);
      log(`Market ${slug} processed successfully!`);
    } else {
      logError(`Failed to process market ${slug}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Handle termination
process.on('SIGINT', () => {
  log('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...');
  process.exit(0);
});

// Run
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
