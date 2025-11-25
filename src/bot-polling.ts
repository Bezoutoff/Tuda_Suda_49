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
import { tradingConfig, validateTradingConfig, BOT_CONFIG, getOrderSize } from './config';

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
 * Spam order placement until success
 */
async function spamOrdersUntilSuccess(
  tradingService: TradingService,
  yesTokenId: string,
  noTokenId: string,
  expirationTimestamp: number,
  slug: string
): Promise<boolean> {
  const size = getOrderSize();
  const price = BOT_CONFIG.ORDER_PRICE;

  log(`Starting order spam for ${slug}:`);
  log(`  Size: ${size} | Price: ${price}`);
  log(`  Expiration: ${formatTimestamp(expirationTimestamp)}`);

  const ORDER_RETRY_INTERVAL_MS = BOT_CONFIG.ORDER_RETRY_INTERVAL_MS;
  const MAX_ORDER_ATTEMPTS = BOT_CONFIG.MAX_ORDER_ATTEMPTS;

  let yesOrderPlaced = false;
  let noOrderPlaced = false;
  let attempts = 0;
  const startTime = Date.now();

  while ((!yesOrderPlaced || !noOrderPlaced) && attempts < MAX_ORDER_ATTEMPTS) {
    attempts++;

    // Try YES order if not placed
    if (!yesOrderPlaced) {
      try {
        const yesOrder = await tradingService.createLimitOrder({
          tokenId: yesTokenId,
          side: 'BUY',
          price: price,
          size: size,
          outcome: 'YES',
          expirationTimestamp: expirationTimestamp,
          negRisk: false,
        });
        yesOrderPlaced = true;
        log(`YES order placed: ${yesOrder.orderId} (attempt ${attempts})`);
      } catch (error: any) {
        // Silent retry - market may not be active yet
        if (attempts % 50 === 0) {
          log(`YES order attempt ${attempts}: ${error.message}`);
        }
      }
    }

    // Try NO order if not placed
    if (!noOrderPlaced) {
      try {
        const noOrder = await tradingService.createLimitOrder({
          tokenId: noTokenId,
          side: 'BUY',
          price: price,
          size: size,
          outcome: 'NO',
          expirationTimestamp: expirationTimestamp,
          negRisk: false,
        });
        noOrderPlaced = true;
        log(`NO order placed: ${noOrder.orderId} (attempt ${attempts})`);
      } catch (error: any) {
        // Silent retry - market may not be active yet
        if (attempts % 50 === 0) {
          log(`NO order attempt ${attempts}: ${error.message}`);
        }
      }
    }

    if (!yesOrderPlaced || !noOrderPlaced) {
      await new Promise(resolve => setTimeout(resolve, ORDER_RETRY_INTERVAL_MS));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  if (yesOrderPlaced && noOrderPlaced) {
    log(`*** BOTH ORDERS PLACED! (${attempts} attempts, ${elapsed}s) ***`);
    return true;
  } else {
    logError(`Failed to place all orders after ${attempts} attempts (${elapsed}s)`);
    log(`  YES: ${yesOrderPlaced ? 'OK' : 'FAILED'}`);
    log(`  NO: ${noOrderPlaced ? 'OK' : 'FAILED'}`);
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
  const expirationTimestamp = marketTimestamp - BOT_CONFIG.EXPIRATION_BUFFER_SECONDS;

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

      // Place orders immediately (spam until success)
      return await spamOrdersUntilSuccess(
        tradingService,
        market.yesTokenId,
        market.noTokenId,
        expirationTimestamp,
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
  log(`Order size: ${getOrderSize()} USDC`);
  log(`Order price: ${BOT_CONFIG.ORDER_PRICE} (${BOT_CONFIG.ORDER_PRICE * 100} cents)`);
  log(`Poll interval: ${BOT_CONFIG.POLL_INTERVAL_MS}ms`);
  log(`Order retry: ${BOT_CONFIG.ORDER_RETRY_INTERVAL_MS}ms, max ${BOT_CONFIG.MAX_ORDER_ATTEMPTS} attempts`);

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
    // Manual mode - poll for specific market
    log(`\n${'='.repeat(60)}`);
    log(`MANUAL MODE: ${manualSlug}`);
    log(`${'='.repeat(60)}`);

    // Extract timestamp from slug
    const match = manualSlug.match(/-(\d+)$/);
    const marketTimestamp = match ? parseInt(match[1]) : Math.floor(Date.now() / 1000) + 900;

    log(`Market timestamp: ${formatTimestamp(marketTimestamp)}`);
    log(`Starting polling immediately...`);

    const success = await pollAndPlaceOrders(tradingService, manualSlug, marketTimestamp);

    if (success) {
      log(`Market ${manualSlug} processed successfully!`);
    } else {
      logError(`Failed to process market ${manualSlug}`);
    }

    return;
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
