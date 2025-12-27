/**
 * Auto-Sell Bot - мгновенная продажа позиций через market orders
 */

// IMPORTANT: Load .env BEFORE importing config
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { TradingService } from './trading-service';
import { tradingConfig, AUTO_SELL_CONFIG } from './config';

// Debug mode (set DEBUG=1 in .env to enable verbose logging)
const DEBUG_MODE = process.env.DEBUG === '1';

// Price threshold to distinguish bot-49 positions (0.49) from auto-sell hedges (0.99)
const HEDGE_PRICE_THRESHOLD = 0.90;

// Market cache path
const MARKET_CACHE_PATH = path.join(__dirname, '../logs/market-cache.json');

interface MarketCache {
  [tokenId: string]: {
    oppositeTokenId: string;
    slug: string;
    outcome: 'YES' | 'NO';
  };
}

// Logging helpers
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] [AUTO-SELL]`, message, ...args);
}

function logError(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.error(`[${timestamp}] [AUTO-SELL] ERROR:`, message, ...args);
}

// Processed trades (deduplication with TTL)
const processedTrades = new Map<string, number>(); // tradeId -> timestamp
const PROCESSED_TRADES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Processed markets (один маркет = одна покупка)
const processedMarkets = new Set<string>(); // slug маркета

// Cleanup old trades periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [tradeId, timestamp] of processedTrades.entries()) {
    if (now - timestamp > PROCESSED_TRADES_TTL_MS) {
      processedTrades.delete(tradeId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log(`[CLEANUP] Removed ${cleaned} old trades from cache (size: ${processedTrades.size})`);
  }

  // Cleanup processedMarkets if too large
  if (processedMarkets.size > 100) {
    processedMarkets.clear();
    log('[CLEANUP] Cleared processedMarkets cache');
  }
}, 60 * 60 * 1000); // Cleanup every hour

// Trading service instance
let tradingService: TradingService;

/**
 * Handle trade event from User Channel
 * NOTE: Receives payload object, not the full message
 */
async function handleTradeEvent(payload: any) {
  try {
    // Extract basic info from payload
    const tradeId = payload.id || '';
    const side = payload.side || '';
    const owner = payload.owner || '';

    // Skip duplicates first
    if (processedTrades.has(tradeId)) {
      log(`[SKIP] Trade ${tradeId} already processed`);
      return;
    }

    // Only BUY trades (position opening)
    if (side !== 'BUY') {
      return;
    }

    // Check if user is TAKER or MAKER
    const isTaker = owner === tradingConfig.apiKey;
    const isMaker = payload.maker_orders?.some((order: any) =>
      order.owner === tradingConfig.apiKey
    );

    if (!isTaker && !isMaker) {
      // Not our trade, skip silently
      return;
    }

    // Extract token ID, size, outcome, and price based on role
    let tokenId: string;
    let size: string;
    let outcome: string = 'NO'; // Default fallback
    let price: number = 0;

    if (isTaker) {
      // Taker scenario: payload has asset_id and size
      tokenId = payload.asset_id;
      size = payload.size;
      price = parseFloat(payload.price || '0');

      // Try to extract outcome from payload
      if (payload.outcome) {
        outcome = payload.outcome;
      }

      log(`[TAKER] BUY position opened: ${size} shares of ${tokenId} @ ${price} (outcome: ${outcome})`);
    } else {
      // Maker scenario: data in maker_orders array
      const ourOrder = payload.maker_orders.find((order: any) =>
        order.owner === tradingConfig.apiKey
      );
      tokenId = ourOrder?.asset_id;
      size = ourOrder?.matched_amount;
      price = parseFloat(ourOrder?.price || '0');

      // Try to extract outcome from maker order
      if (ourOrder?.outcome) {
        outcome = ourOrder.outcome;
      }

      log(`[MAKER] BUY position filled: ${size} shares of ${tokenId} @ ${price} (outcome: ${outcome})`);
    }

    if (!tokenId || !size) {
      logError(`Missing tokenId or size in trade ${tradeId}`);
      return;
    }

    // CRITICAL: Ignore our own hedge orders @ 0.99 (prevent infinite loop)
    if (price >= HEDGE_PRICE_THRESHOLD) {
      log(`[SKIP] Ignoring own hedge order @ ${price} (threshold: ${HEDGE_PRICE_THRESHOLD})`);
      return;
    }

    log(`[TRIGGER] Position @ ${price} detected (< ${HEDGE_PRICE_THRESHOLD} threshold) - will hedge`);

    // Mark as processed BEFORE selling (prevent double-sell on error)
    processedTrades.set(tradeId, Date.now());

    // Wait for blockchain confirmation (tokens need to settle)
    const DELAY_MS = 15000; // 15 seconds
    log(`[TRIGGER] Waiting ${DELAY_MS / 1000}s for blockchain confirmation...`);
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));

    // Trigger auto-sell with outcome
    log(`[TRIGGER] Auto-selling ${size} shares of ${tokenId} (outcome: ${outcome}, trade: ${tradeId})`);
    await sellPosition(tokenId, parseFloat(size), outcome);

  } catch (error: any) {
    logError('Error handling trade event:', error.message);
  }
}

/**
 * Get opposite token ID and slug from market cache
 */
function getOppositeTokenId(currentTokenId: string): { oppositeTokenId: string; slug: string } | null {
  try {
    if (!fs.existsSync(MARKET_CACHE_PATH)) {
      logError('Market cache file not found');
      return null;
    }

    const data = fs.readFileSync(MARKET_CACHE_PATH, 'utf-8');
    const cache: MarketCache = JSON.parse(data);

    const entry = cache[currentTokenId];
    if (!entry) {
      logError(`Token ${currentTokenId} not found in cache`);
      return null;
    }

    log(`Found opposite token: ${entry.oppositeTokenId} (slug: ${entry.slug})`);
    return {
      oppositeTokenId: entry.oppositeTokenId,
      slug: entry.slug,
    };

  } catch (error: any) {
    logError('Failed to read market cache:', error.message);
    return null;
  }
}

/**
 * Buy opposite position via GTC limit order @ 0.99 (hedge strategy)
 * Only processes FIRST position per market
 */
async function sellPosition(tokenId: string, size: number, outcome: string) {
  try {
    // 1. Get opposite side token ID and slug from cache
    log(`Getting opposite token ID for ${tokenId}...`);
    const result = getOppositeTokenId(tokenId);

    if (!result) {
      logError('Failed to get opposite token ID from cache, skipping buy');
      return;
    }

    const { oppositeTokenId, slug } = result;

    // 2. Check if this market was already processed
    if (processedMarkets.has(slug)) {
      log(`[SKIP] Market ${slug} already processed (first position already bought)`);
      return;
    }

    // 3. Mark market as processed BEFORE buying (prevent race condition)
    processedMarkets.add(slug);

    // 4. Determine opposite outcome (keep same format: Up/Down or YES/NO)
    let oppositeOutcome: string;
    if (outcome === 'Up' || outcome === 'YES') {
      oppositeOutcome = outcome === 'Up' ? 'Down' : 'NO';
    } else {
      oppositeOutcome = outcome === 'Down' ? 'Up' : 'YES';
    }

    log(`Buying opposite side: ${oppositeOutcome} @ $0.99 (${size} shares) [market: ${slug}]`);

    // 5. Place GTC limit BUY order on OPPOSITE side
    const orderResult = await tradingService.createLimitOrder({
      tokenId: oppositeTokenId,  // ← Buy OPPOSITE side!
      side: 'BUY',               // ← BUY, not SELL!
      price: 0.99,               // Buy at 99 cents
      size: size,                // Number of shares
      outcome: oppositeOutcome,
      // expirationTimestamp not needed for GTC
    });

    log(`Hedge order placed: orderId=${orderResult.orderId}, side=BUY ${oppositeOutcome}, price=0.99, size=${size}`);

  } catch (error: any) {
    logError(`Failed to place hedge order:`, error.message);
  }
}

/**
 * Handle incoming WebSocket messages
 * NOTE: RealTimeDataClient passes TWO parameters: (client, message)
 */
function handleMessage(client: any, message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    const topic = data.topic || '';
    const msgType = data.type || '';

    // DEBUG: Log incoming messages (only if DEBUG=1)
    if (DEBUG_MODE) {
      log(`[DEBUG] Message - topic: "${topic}", type: "${msgType}"`);
    }

    // Handle trade events - data is in payload!
    if (topic === 'clob_user' && msgType === 'trade') {
      // Pass payload (not the whole data object)
      handleTradeEvent(data.payload);
    }

  } catch (error: any) {
    logError('Error handling message:', error.message);
  }
}

/**
 * Main function
 */
async function main() {
  log('Starting Auto-Sell Bot...');

  // Validate config
  if (!tradingConfig.apiKey || !tradingConfig.secret || !tradingConfig.passphrase) {
    logError('Missing CLOB API credentials (CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE)');
    process.exit(1);
  }

  if (!tradingConfig.funder) {
    logError('Missing FUNDER address in .env');
    process.exit(1);
  }

  // Log API KEY for verification
  log(`Using API KEY: ${tradingConfig.apiKey?.substring(0, 12)}...`);
  log(`Using FUNDER: ${tradingConfig.funder}`);

  // Initialize trading service
  log('Initializing trading service...');
  tradingService = new TradingService(tradingConfig);
  log('Trading service initialized');

  // Create WebSocket client
  const clobAuth = {
    key: tradingConfig.apiKey,
    secret: tradingConfig.secret,
    passphrase: tradingConfig.passphrase,
  };

  const client = new RealTimeDataClient({
    onMessage: handleMessage,
    onConnect: () => {
      log('Connected to Polymarket RTDS');

      // Subscribe to User Channel (all events)
      if (DEBUG_MODE) {
        log(`[DEBUG] Subscribing with API KEY: ${clobAuth.key?.substring(0, 12)}...`);
      }
      client.subscribe({
        subscriptions: [
          {
            topic: 'clob_user',
            type: '*',  // Subscribe to ALL user events (orders, trades, fills)
            clob_auth: clobAuth,
          },
        ],
      });

      log('Subscribed to User Channel (trade events)');
      log('Waiting for new positions to sell...');
    },
  });

  // Connect
  log('Connecting to Polymarket RTDS...');
  client.connect();

  // Handle process termination
  process.on('SIGINT', () => {
    log('Shutting down...');
    clearInterval(cleanupInterval);
    client.disconnect();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
