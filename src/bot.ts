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
  getOrderSize,
  extractStartTimestamp,
  isBtcUpdownMarket,
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

  const size = getOrderSize();
  const price = BOT_CONFIG.ORDER_PRICE;

  // Calculate expiration (before trading starts)
  const expirationTimestamp = startTimestamp - BOT_CONFIG.EXPIRATION_BUFFER_SECONDS;

  // Check if expiration is in the future
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expirationTimestamp <= nowSeconds) {
    log(`Market ${slug} has already started or expiration passed. Skipping.`);
    return;
  }

  const expirationDate = new Date(expirationTimestamp * 1000);
  const startDate = new Date(startTimestamp * 1000);

  log(`Placing orders for ${slug}:`);
  log(`  Start time: ${startDate.toLocaleString('ru-RU')}`);
  log(`  Expiration: ${expirationDate.toLocaleString('ru-RU')}`);
  log(`  Size: ${size} | Price: ${price}`);

  try {
    // Place YES order
    log(`Placing YES order: ${size} @ ${price}...`);
    const yesOrder = await tradingService.createLimitOrder({
      tokenId: yesTokenId,
      side: 'BUY',
      price: price,
      size: size,
      outcome: 'YES',
      expirationTimestamp: expirationTimestamp,
      negRisk: true,
    });
    log(`YES order placed: ${yesOrder.orderId}`);

    // Place NO order
    log(`Placing NO order: ${size} @ ${price}...`);
    const noOrder = await tradingService.createLimitOrder({
      tokenId: noTokenId,
      side: 'BUY',
      price: price,
      size: size,
      outcome: 'NO',
      expirationTimestamp: expirationTimestamp,
      negRisk: true,
    });
    log(`NO order placed: ${noOrder.orderId}`);

    log(`Orders placed successfully for ${slug}`);
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
 * Handle incoming market_created message
 */
async function handleMarketCreated(message: any) {
  // Debug: log raw message structure
  log('Received message:', JSON.stringify(message, null, 2));

  // Extract market info
  const slug = message.slug || message.market_slug || message.condition_id || '';
  const conditionId = message.condition_id || message.market || '';

  // Skip if not BTC updown market
  if (!isBtcUpdownMarket(slug) && !isBtcUpdownMarket(conditionId)) {
    return;
  }

  const marketKey = slug || conditionId;

  // Skip if already processed
  if (processedMarkets.has(marketKey)) {
    log(`Market ${marketKey} already processed. Skipping.`);
    return;
  }

  log(`New BTC updown market detected: ${marketKey}`);

  // Extract start timestamp from slug
  const startTimestamp = extractStartTimestamp(slug) || extractStartTimestamp(conditionId);
  if (!startTimestamp) {
    logError(`Could not extract start timestamp from: ${slug || conditionId}`);
    return;
  }

  // Get token IDs for YES and NO
  let yesTokenId: string | null = null;
  let noTokenId: string | null = null;

  if (message.tokens && Array.isArray(message.tokens)) {
    for (const token of message.tokens) {
      const outcome = (token.outcome || '').toUpperCase();
      if (outcome === 'YES' || outcome.includes('UP')) {
        yesTokenId = token.token_id || token.tokenId;
      } else if (outcome === 'NO' || outcome.includes('DOWN')) {
        noTokenId = token.token_id || token.tokenId;
      }
    }
  } else if (message.clobTokenIds) {
    const tokenIds = typeof message.clobTokenIds === 'string'
      ? JSON.parse(message.clobTokenIds)
      : message.clobTokenIds;
    yesTokenId = tokenIds[0];
    noTokenId = tokenIds[1];
  }

  // Try fetching from Gamma API if not found
  if (!yesTokenId || !noTokenId) {
    log('Will try to fetch from Gamma API...');
    try {
      const tokenIds = await fetchTokenIdsFromGamma(slug || conditionId);
      if (tokenIds) {
        yesTokenId = tokenIds.yes;
        noTokenId = tokenIds.no;
      }
    } catch (error: any) {
      logError('Failed to fetch from Gamma API:', error.message);
    }
  }

  if (!yesTokenId || !noTokenId) {
    logError(`Could not get token IDs for market ${marketKey}`);
    return;
  }

  // Mark as processed
  processedMarkets.add(marketKey);

  // Place orders
  await placeAutoOrders(yesTokenId, noTokenId, startTimestamp, marketKey);
}

/**
 * Handle WebSocket message
 */
function handleMessage(message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    const msgType = data.type || data.event_type || '';

    if (msgType === 'market_created' || msgType.includes('market')) {
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
  log('Starting BTC Updown Auto-Order Bot...');
  log(`Order size: ${getOrderSize()} USDC`);
  log(`Order price: ${BOT_CONFIG.ORDER_PRICE} (${BOT_CONFIG.ORDER_PRICE * 100} cents)`);
  log(`Market pattern: ${BOT_CONFIG.MARKET_SLUG_PATTERN}`);

  // Initialize trading service
  const tradingOk = initTradingService();
  if (!tradingOk) {
    logError('Cannot start bot without trading service');
    process.exit(1);
  }

  // Create WebSocket client
  const client = new RealTimeDataClient({
    onMessage: handleMessage,
    onConnect: () => {
      log('Connected to Polymarket RTDS');

      // Subscribe to market_created events
      client.subscribe({
        subscriptions: [
          {
            topic: 'clob_market',
            type: 'market_created',
          },
        ],
      });

      log('Subscribed to market_created events');
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
