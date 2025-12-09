/**
 * BTC Updown Polling Bot
 *
 * Предсказывает slug следующего маркета и спамит Gamma API
 * пока не получит token IDs, затем сразу ставит ордера.
 *
 * Usage: npm run bot-polling
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig, BOT_CONFIG } from './config';

const INTERVAL_SECONDS = 900; // 15 минут

// Logger
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] [POLLING-BOT] ${message}`, ...args);
}

function logError(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.error(`[${timestamp}] [POLLING-BOT] ERROR: ${message}`, ...args);
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
 * Spam order placement until all 10 orders are placed
 * 5 prices × 2 sides (UP/DOWN) = 10 orders
 * Each price has its own expiration time
 */
async function spamOrdersUntilSuccess(
  tradingService: TradingService,
  yesTokenId: string,   // UP token
  noTokenId: string,    // DOWN token
  marketTimestamp: number,
  slug: string
): Promise<boolean> {
  const orderConfig = BOT_CONFIG.ORDER_CONFIG;

  log(`Starting order spam for ${slug}:`);
  log(`  Prices (size): ${orderConfig.map(c => `${c.price}($${c.size})`).join(', ')}`);
  log(`  Total orders: ${orderConfig.length * 2} (${orderConfig.length} UP + ${orderConfig.length} DOWN)`);
  log(`  Expirations (sec before start): ${orderConfig.map(c => c.expirationBuffer).join(', ')}`);

  const MAX_ORDER_ATTEMPTS = BOT_CONFIG.MAX_ORDER_ATTEMPTS;
  const PARALLEL = BOT_CONFIG.PARALLEL_SPAM_REQUESTS;

  // PRE-SIGN: создаём и подписываем все 10 ордеров
  log(`Pre-signing ${orderConfig.length * 2} orders...`);

  interface SignedOrderInfo {
    signedOrder: any;
    side: 'UP' | 'DOWN';
    price: number;
    expirationTimestamp: number;
    placed: boolean;
    orderId?: string;
  }

  const signedOrders: SignedOrderInfo[] = [];

  try {
    for (const { price, size, expirationBuffer } of orderConfig) {
      const expirationTimestamp = marketTimestamp - expirationBuffer;

      // UP order (YES token)
      const upOrder = await tradingService.createSignedOrder({
        tokenId: yesTokenId,
        side: 'BUY',
        price,
        size,
        outcome: 'YES',
        expirationTimestamp,
        negRisk: false,
      });
      signedOrders.push({ signedOrder: upOrder, side: 'UP', price, expirationTimestamp, placed: false });

      // DOWN order (NO token)
      const downOrder = await tradingService.createSignedOrder({
        tokenId: noTokenId,
        side: 'BUY',
        price,
        size,
        outcome: 'NO',
        expirationTimestamp,
        negRisk: false,
      });
      signedOrders.push({ signedOrder: downOrder, side: 'DOWN', price, expirationTimestamp, placed: false });

      log(`  ${price} ($${size}): expires ${formatTimestamp(expirationTimestamp)}`);
    }
    log(`All ${signedOrders.length} orders pre-signed successfully`);
  } catch (error: any) {
    logError(`Failed to pre-sign orders: ${error.message}`);
    return false;
  }

  // DELAY: ждём перед началом спама (после pre-sign)
  const delayMs = BOT_CONFIG.DELAY_BEFORE_SPAM_MS;
  if (delayMs > 0) {
    log(`Waiting ${delayMs / 1000}s before spam...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // SPAM: stream mode - send requests every 5ms
  const startTime = Date.now();
  let totalAttempts = 0;
  const STREAM_INTERVAL_MS = 5;
  const inFlightRequests: Promise<void>[] = [];

  log(`Stream spam: sending requests every ${STREAM_INTERVAL_MS}ms`);

  // Helper function to send one request for an order
  const sendRequest = (order: typeof signedOrders[0]) => {
    totalAttempts++;
    const promise = tradingService.postSignedOrder(order.signedOrder, order.expirationTimestamp)
      .then(result => {
        if (!order.placed) {
          order.placed = true;
          order.orderId = result.orderId;
          const placedCount = signedOrders.filter(o => o.placed).length;
          log(`${order.side} @ ${order.price} placed: ${result.orderId} (${placedCount}/${signedOrders.length})`);
        }
      })
      .catch(() => {});
    inFlightRequests.push(promise);
  };

  // Stream loop - cycle through ALL orders, skip already placed
  while (signedOrders.some(o => !o.placed) && totalAttempts < MAX_ORDER_ATTEMPTS * signedOrders.length) {
    // Iterate through all orders each round
    for (const order of signedOrders) {
      if (order.placed) continue;  // Skip already placed

      sendRequest(order);

      // Wait 5ms before next request
      await new Promise(r => setTimeout(r, STREAM_INTERVAL_MS));
    }

    // Log progress every 500 attempts
    if (totalAttempts % 500 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const placedCount = signedOrders.filter(o => o.placed).length;
      log(`Progress: ${placedCount}/${signedOrders.length} placed, ${totalAttempts} attempts, ${elapsed}s`);
    }
  }

  // Wait for all in-flight requests to complete
  log(`Waiting for ${inFlightRequests.length} in-flight requests...`);
  await Promise.all(inFlightRequests);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const placedCount = signedOrders.filter(o => o.placed).length;

  if (placedCount === signedOrders.length) {
    log(`*** ALL ${signedOrders.length} ORDERS PLACED! (${totalAttempts} attempts, ${elapsed}s) ***`);
    return true;
  } else {
    const failed = signedOrders.filter(o => !o.placed);
    logError(`Failed to place ${failed.length} orders after ${totalAttempts} attempts (${elapsed}s):`);
    failed.forEach(o => logError(`  - ${o.side} @ ${o.price}`));
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

    // Check if we've been polling too long (market may have passed)
    const elapsed = Date.now() - startTime;
    if (elapsed > BOT_CONFIG.POLL_TIMEOUT_MS) {
      logError(`Polling timeout after ${Math.round(elapsed / 1000)}s`);
      return false;
    }

    // Fetch market
    const market = await fetchMarketBySlug(slug);

    if (market) {
      log(`Market found after ${pollCount} requests (${Math.round(elapsed / 1000)}s)!`);
      log(`  YES Token: ${market.yesTokenId.slice(0, 20)}...`);
      log(`  NO Token: ${market.noTokenId.slice(0, 20)}...`);

      // Pre-sign and spam orders (delay is AFTER pre-sign now)
      return await spamOrdersUntilSuccess(
        tradingService,
        market.yesTokenId,
        market.noTokenId,
        marketTimestamp,
        slug
      );
    }

    // Log progress every 100 requests
    if (pollCount % 100 === 0) {
      log(`Polling... ${pollCount} requests, ${Math.round(elapsed / 1000)}s elapsed`);
    }

    // Wait before next request
    await new Promise(resolve => setTimeout(resolve, BOT_CONFIG.POLL_INTERVAL_MS));
  }
}

/**
 * Main bot function
 */
async function main() {
  log('Starting BTC Updown Polling Bot...');
  log(`Order config: ${BOT_CONFIG.ORDER_CONFIG.map(c => `${c.price}($${c.size})`).join(', ')}`);
  log(`Total orders: ${BOT_CONFIG.ORDER_CONFIG.length * 2} (${BOT_CONFIG.ORDER_CONFIG.length} UP + ${BOT_CONFIG.ORDER_CONFIG.length} DOWN)`);
  log(`Total size: $${BOT_CONFIG.ORDER_CONFIG.reduce((sum, c) => sum + c.size, 0) * 2} (UP + DOWN)`);
  log(`Poll interval: ${BOT_CONFIG.POLL_INTERVAL_MS}ms`);
  log(`Parallel requests: ${BOT_CONFIG.PARALLEL_SPAM_REQUESTS} per order, max ${BOT_CONFIG.MAX_ORDER_ATTEMPTS} attempts`);

  // Initialize trading service
  if (!validateTradingConfig(tradingConfig)) {
    logError('Invalid trading configuration. Check .env file.');
    process.exit(1);
  }

  const tradingService = new TradingService(tradingConfig);
  log('Trading service initialized');

  // Check for manual slug argument
  const manualSlug = process.argv[2];

  if (manualSlug) {
    // Manual mode - poll for specific market, then continue to next
    log(`\n${'='.repeat(60)}`);
    log(`MANUAL MODE: ${manualSlug}`);
    log(`${'='.repeat(60)}`);

    // Extract timestamp and pattern from slug
    const match = manualSlug.match(/^(.+)-(\d+)$/);
    if (!match) {
      logError(`Invalid slug format: ${manualSlug}`);
      return;
    }

    const pattern = match[1]; // e.g., "btc-updown-15m"
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

      // Move to next market (+900 seconds)
      marketTimestamp += INTERVAL_SECONDS;
      log(`Next market: ${pattern}-${marketTimestamp} at ${formatTimestamp(marketTimestamp)}`);

      // Small delay before next iteration
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Auto mode - calculate next market
  // Track processed markets
  const processedMarkets = new Set<string>();

  // Main loop
  while (true) {
    const nextTimestamp = getNextMarketTimestamp();
    const slug = `btc-updown-15m-${nextTimestamp}`;

    // Skip if already processed
    if (processedMarkets.has(slug)) {
      log(`Market ${slug} already processed, waiting for next...`);
      await waitUntil((nextTimestamp + INTERVAL_SECONDS) * 1000 - BOT_CONFIG.START_POLLING_BEFORE_MS);
      continue;
    }

    log(`\n${'='.repeat(60)}`);
    log(`Next market: ${slug}`);
    log(`Start time: ${formatTimestamp(nextTimestamp)}`);
    log(`${'='.repeat(60)}`);

    // Wait until START_POLLING_BEFORE_MS before market time
    const pollStartTime = nextTimestamp * 1000 - BOT_CONFIG.START_POLLING_BEFORE_MS;
    await waitUntil(pollStartTime);

    // Start polling
    const success = await pollAndPlaceOrders(tradingService, slug, nextTimestamp);

    if (success) {
      processedMarkets.add(slug);
      log(`Market ${slug} processed successfully!`);
    } else {
      logError(`Failed to process market ${slug}`);
    }

    // Small delay before next iteration
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
