/**
 * Auto-Sell Bot - мгновенная продажа позиций через market orders
 */

// IMPORTANT: Load .env BEFORE importing config
import * as dotenv from 'dotenv';
dotenv.config();

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { TradingService } from './trading-service';
import { tradingConfig, AUTO_SELL_CONFIG } from './config';

// Debug mode (set DEBUG=1 in .env to enable verbose logging)
const DEBUG_MODE = process.env.DEBUG === '1';

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

    // Extract token ID and size based on role
    let tokenId: string;
    let size: string;

    if (isTaker) {
      // Taker scenario: payload has asset_id and size
      tokenId = payload.asset_id;
      size = payload.size;
      log(`[TAKER] BUY position opened: ${size} shares of ${tokenId}`);
    } else {
      // Maker scenario: data in maker_orders array
      const ourOrder = payload.maker_orders.find((order: any) =>
        order.owner === tradingConfig.apiKey
      );
      tokenId = ourOrder?.asset_id;
      size = ourOrder?.matched_amount;
      log(`[MAKER] BUY position filled: ${size} shares of ${tokenId}`);
    }

    if (!tokenId || !size) {
      logError(`Missing tokenId or size in trade ${tradeId}`);
      return;
    }

    // Mark as processed BEFORE selling (prevent double-sell on error)
    processedTrades.set(tradeId, Date.now());

    // Wait for blockchain confirmation (tokens need to settle)
    const DELAY_MS = 15000; // 15 seconds
    log(`[TRIGGER] Waiting ${DELAY_MS / 1000}s for blockchain confirmation...`);
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));

    // Trigger auto-sell
    log(`[TRIGGER] Auto-selling ${size} shares of ${tokenId} (trade: ${tradeId})`);
    await sellPosition(tokenId, parseFloat(size));

  } catch (error: any) {
    logError('Error handling trade event:', error.message);
  }
}

/**
 * Sell position via market order (FOK)
 */
async function sellPosition(tokenId: string, size: number) {
  try {
    log(`Selling ${size} shares of ${tokenId}...`);

    const result = await tradingService.createAndPostMarketOrder({
      tokenId,
      side: 'SELL',
      amount: size,
      orderType: 'FOK',  // Fill-or-Kill (all or nothing)
    });

    log(`Position sold: orderId=${result.orderId}, tokenId=${tokenId}, size=${size}`);

  } catch (error: any) {
    // Check if it's insufficient liquidity error
    if (error.message?.includes('insufficient')) {
      log(`Insufficient liquidity for FOK, trying FAK...`);

      try {
        // Retry with FAK (partial fill allowed)
        const result = await tradingService.createAndPostMarketOrder({
          tokenId,
          side: 'SELL',
          amount: size,
          orderType: 'FAK',  // Fill-and-Kill (partial OK)
        });

        log(`Position partially sold: orderId=${result.orderId}, tokenId=${tokenId}`);
      } catch (fallbackError: any) {
        logError(`Failed to sell position (FAK fallback):`, fallbackError.message);
      }
    } else {
      logError(`Failed to sell position:`, error.message);
    }
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
