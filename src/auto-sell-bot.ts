/**
 * Auto-Sell Bot - мгновенная продажа позиций через market orders
 */

// IMPORTANT: Load .env BEFORE importing config
import * as dotenv from 'dotenv';
dotenv.config();

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { TradingService } from './trading-service';
import { tradingConfig, AUTO_SELL_CONFIG } from './config';

// Logging helpers
function log(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`[${timestamp}] [AUTO-SELL]`, message, ...args);
}

function logError(message: string, ...args: any[]) {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.error(`[${timestamp}] [AUTO-SELL] ERROR:`, message, ...args);
}

// Processed trades (deduplication)
const processedTrades = new Set<string>();

// Trading service instance
let tradingService: TradingService;

/**
 * Handle trade event from User Channel
 */
async function handleTradeEvent(message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    // Extract basic info
    const tradeId = data.id || '';
    const side = data.side || '';

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
    const isTaker = data.owner === tradingConfig.apiKey;
    const isMaker = data.maker_orders?.some((order: any) =>
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
      // Taker scenario: data at top level
      tokenId = data.asset_id;
      size = data.size;
      log(`[TAKER] BUY position opened: ${size} shares of ${tokenId}`);
    } else {
      // Maker scenario: data in maker_orders array
      const ourOrder = data.maker_orders.find((order: any) =>
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
    processedTrades.add(tradeId);

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
 */
function handleMessage(message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    const topic = data.topic || '';

    // DEBUG: Log ALL incoming messages (not just clob_user)
    log(`[DEBUG] Received WebSocket message - topic: "${topic}"`);

    // DEBUG: Log ALL user channel events with full details
    if (topic === 'clob_user') {
      const eventType = data.event_type || 'unknown';
      const ownerPreview = data.owner ? data.owner.substring(0, 12) + '...' : 'none';
      const side = data.side || 'unknown';
      log(`[DEBUG] User event: type=${eventType}, side=${side}, owner=${ownerPreview}`);
      log(`[DEBUG] Full event:`, JSON.stringify(data, null, 2));
    }

    // Handle trade events using event_type field (NOT data.type!)
    if (topic === 'clob_user' && data.event_type === 'trade') {
      handleTradeEvent(data);
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
      log(`[DEBUG] Subscribing with API KEY: ${clobAuth.key?.substring(0, 12)}...`);
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
    client.disconnect();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
