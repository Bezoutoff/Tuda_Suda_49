/**
 * BTC Updown Auto-Order Bot
 *
 * Listens for new BTC updown 15m markets on Polymarket and automatically
 * places limit orders at 49 cents for both YES and NO outcomes.
 *
 * Usage: npm start
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { TradingService } from './trading-service';
import {
  BOT_CONFIG,
  tradingConfig,
  validateTradingConfig,
  validateOrderConfig,
  getOrderSize,
  extractStartTimestamp,
  isUpdownMarket,
  getMatchedPattern,
} from './config';

// Logger with timestamp
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] ${BOT_CONFIG.LOG_PREFIX} ${message}`, ...args);
}

function logError(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.error(`[${timestamp}] ${BOT_CONFIG.LOG_PREFIX} ERROR: ${message}`, ...args);
}

// Trading service instance
let tradingService: TradingService | null = null;

// Track processed markets to avoid duplicates
const processedMarkets = new Set<string>();

/**
 * Initialize trading service
 */
function initTradingService(): boolean {
  try {
    if (!validateTradingConfig(tradingConfig)) {
      logError('Invalid trading configuration. Check .env file.');
      return false;
    }

    tradingService = new TradingService(tradingConfig);
    log('Trading service initialized successfully');
    return true;
  } catch (error: any) {
    logError('Failed to initialize trading service:', error.message);
    return false;
  }
}

/**
 * Place auto orders for a new BTC updown market
 * 5 prices × 2 sides (UP/DOWN) = 10 orders
 * Each price has its own expiration time
 */
async function placeAutoOrders(
  yesTokenId: string,
  noTokenId: string,
  startTimestamp: number,
  slug: string
) {
  if (!tradingService) {
    logError('Trading service not initialized');
    return;
  }

  const orderConfig = BOT_CONFIG.ORDER_CONFIG;

  // Check if market is still valid (use earliest expiration across both sides)
  const allExpirationBuffers = orderConfig.flatMap(c => [c.up.expirationBuffer, c.down.expirationBuffer]);
  const earliestExpiration = startTimestamp - Math.max(...allExpirationBuffers);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (earliestExpiration <= nowSeconds) {
    log(`Market ${slug} has already started or expiration passed. Skipping.`);
    return;
  }

  const startDate = new Date(startTimestamp * 1000);

  log(`Placing orders for ${slug}:`);
  log(`  Start time: ${startDate.toLocaleString('ru-RU')}`);
  log(`  Config: ${orderConfig.map(c =>
    `${c.price}(UP:${c.up.size}@${c.up.expirationBuffer}s, DOWN:${c.down.size}@${c.down.expirationBuffer}s)`
  ).join(', ')}`);
  log(`  Total: ${orderConfig.length * 2} orders (${orderConfig.length} UP + ${orderConfig.length} DOWN)`);

  try {
    let placedCount = 0;
    const totalOrders = orderConfig.length * 2;

    for (const config of orderConfig) {
      const { price, up, down } = config;

      // Calculate separate expiration for UP and DOWN
      const upExpirationTimestamp = startTimestamp - up.expirationBuffer;
      const downExpirationTimestamp = startTimestamp - down.expirationBuffer;

      // Place UP (YES) order
      log(`Placing UP @ ${price} (size: ${up.size}, expires ${new Date(upExpirationTimestamp * 1000).toLocaleString('ru-RU')})...`);
      const yesOrder = await tradingService.createLimitOrder({
        tokenId: yesTokenId,
        side: 'BUY',
        price: price,
        size: up.size,
        outcome: 'YES',
        expirationTimestamp: upExpirationTimestamp,
        negRisk: true,
      });
      placedCount++;
      log(`UP @ ${price} placed: ${yesOrder.orderId} (${placedCount}/${totalOrders})`);

      // Place DOWN (NO) order
      log(`Placing DOWN @ ${price} (size: ${down.size}, expires ${new Date(downExpirationTimestamp * 1000).toLocaleString('ru-RU')})...`);
      const noOrder = await tradingService.createLimitOrder({
        tokenId: noTokenId,
        side: 'BUY',
        price: price,
        size: down.size,
        outcome: 'NO',
        expirationTimestamp: downExpirationTimestamp,
        negRisk: true,
      });
      placedCount++;
      log(`DOWN @ ${price} placed: ${noOrder.orderId} (${placedCount}/${totalOrders})`);
    }

    log(`*** ALL ${totalOrders} ORDERS PLACED for ${slug} ***`);
  } catch (error: any) {
    logError(`Failed to place orders for ${slug}:`, error.message);
  }
}

/**
 * Fetch token IDs from Gamma API
 */
async function fetchTokenIdsFromGamma(slugOrCondition: string): Promise<{ yes: string; no: string } | null> {
  try {
    const url = `https://gamma-api.polymarket.com/events?slug=${slugOrCondition}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const events = await response.json() as any[];
    if (!events || events.length === 0) {
      return null;
    }

    const event: any = events[0];
    const markets = event.markets || [];
    if (markets.length === 0) {
      return null;
    }

    const market = markets[0];
    let clobTokenIds = market.clobTokenIds;

    if (typeof clobTokenIds === 'string') {
      clobTokenIds = JSON.parse(clobTokenIds);
    }

    if (!clobTokenIds || clobTokenIds.length < 2) {
      return null;
    }

    return {
      yes: clobTokenIds[0],
      no: clobTokenIds[1],
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch market info from Gamma API by condition_id
 */
async function fetchMarketInfoByConditionId(conditionId: string): Promise<{
  slug: string;
  yesTokenId: string;
  noTokenId: string;
  negRisk: boolean;
} | null> {
  try {
    // Query Gamma API by condition_id
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markets = await response.json() as any[];
    if (!markets || markets.length === 0) {
      return null;
    }

    const market = markets[0];
    const slug = market.slug || market.question || '';

    let clobTokenIds = market.clobTokenIds;
    if (typeof clobTokenIds === 'string') {
      clobTokenIds = JSON.parse(clobTokenIds);
    }

    if (!clobTokenIds || clobTokenIds.length < 2) {
      return null;
    }

    return {
      slug,
      yesTokenId: clobTokenIds[0],
      noTokenId: clobTokenIds[1],
      negRisk: market.negRisk || false,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Handle incoming market_created message
 *
 * Message format from RTDS:
 * {
 *   "asset_ids": ["token1", "token2"],
 *   "market": "0x...",  // condition_id
 *   "min_order_size": "5",
 *   "neg_risk": false,
 *   "tick_size": "0.01"
 * }
 */
async function handleMarketCreated(message: any) {
  // Extract from RTDS message format
  const payload = message.payload || message;
  const conditionId = payload.market || payload.condition_id || '';
  const assetIds = payload.asset_ids || [];

  if (!conditionId) {
    return;
  }

  // Skip if already processed
  if (processedMarkets.has(conditionId)) {
    return;
  }

  log(`New market detected: ${conditionId.slice(0, 16)}...`);

  // Fetch market info from Gamma API with retry
  let slug = '';
  let yesTokenId: string | null = null;
  let noTokenId: string | null = null;

  // First try to use asset_ids from message
  if (assetIds.length >= 2) {
    yesTokenId = assetIds[0];
    noTokenId = assetIds[1];
  }

  // Fetch slug from Gamma API with retry (indexing may take time)
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        log(`Retry ${attempt}/${MAX_RETRIES} - waiting for Gamma API...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }

      const marketInfo = await fetchMarketInfoByConditionId(conditionId);

      if (marketInfo && marketInfo.slug) {
        slug = marketInfo.slug;
        yesTokenId = marketInfo.yesTokenId;
        noTokenId = marketInfo.noTokenId;
        log(`Market slug: ${slug}`);
        break;
      }
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        logError('Failed to fetch from Gamma API after retries:', error.message);
      }
    }
  }

  // Check if this is an updown market
  const matchedPattern = getMatchedPattern(slug);
  if (!matchedPattern) {
    // Only log if we got a slug (otherwise it's likely not indexed yet)
    if (slug) {
      log(`Not a target updown market (slug: ${slug}). Skipping.`);
    }
    return;
  }

  log(`*** ${matchedPattern.toUpperCase()} MARKET FOUND: ${slug} ***`);

  // Extract start timestamp from slug
  const startTimestamp = extractStartTimestamp(slug);
  if (!startTimestamp) {
    logError(`Could not extract start timestamp from slug: ${slug}`);
    return;
  }

  if (!yesTokenId || !noTokenId) {
    logError(`Could not get token IDs for market ${slug}`);
    return;
  }

  // Mark as processed
  processedMarkets.add(conditionId);

  // Place orders
  await placeAutoOrders(yesTokenId, noTokenId, startTimestamp, slug);
}

/**
 * Handle WebSocket message
 */
function handleMessage(client: any, message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    // Check topic and type from RTDS format
    const topic = data.topic || '';
    const msgType = data.type || '';

    if (topic === 'clob_market' && msgType === 'market_created') {
      handleMarketCreated(data);
    }
  } catch (error: any) {
    logError('Error handling message:', error.message);
  }
}

/**
 * Main bot function
 */
async function main() {
  log('Starting Updown Auto-Order Bot...');
  log(`Order config: ${BOT_CONFIG.ORDER_CONFIG.map(c =>
    `${c.price}(UP:${c.up.size}@${c.up.expirationBuffer}s, DOWN:${c.down.size}@${c.down.expirationBuffer}s)`
  ).join(', ')}`);
  log(`Total: ${BOT_CONFIG.ORDER_CONFIG.length * 2} orders per market`);
  log(`Market patterns: ${BOT_CONFIG.MARKET_PATTERNS.join(', ')}`);

  // Validate order configuration
  const configErrors = validateOrderConfig();
  if (configErrors.length > 0) {
    logError('Invalid ORDER_CONFIG:');
    configErrors.forEach(err => logError(`  - ${err}`));
    process.exit(1);
  }

  // Initialize trading service
  const tradingOk = initTradingService();
  if (!tradingOk) {
    logError('Cannot start bot without trading service');
    process.exit(1);
  }

  // CLOB authentication for WebSocket subscription
  const clobAuth = {
    key: process.env.CLOB_API_KEY || '',
    secret: process.env.CLOB_SECRET || '',
    passphrase: process.env.CLOB_PASS_PHRASE || ''
  };

  // Verify credentials
  if (!clobAuth.key || !clobAuth.secret || !clobAuth.passphrase) {
    logError('Missing CLOB API credentials for WebSocket authentication');
    process.exit(1);
  }

  // Create WebSocket client
  const client = new RealTimeDataClient({
    onMessage: handleMessage,
    onConnect: () => {
      log('Connected to Polymarket RTDS');

      // Subscribe to market_created events WITH authentication
      client.subscribe({
        subscriptions: [
          {
            topic: 'clob_market',
            type: 'market_created',
            clob_auth: clobAuth,  // <-- IMPORTANT: Authentication required!
          },
        ],
      });

      log('Subscribed to market_created events (with auth)');
      log('Waiting for new BTC updown markets...');
    },
  });

  // Connect
  log('Connecting to Polymarket RTDS...');
  client.connect();

  // Handle process termination
  process.on('SIGINT', () => {
    log('Shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Shutting down...');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

// Run
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
