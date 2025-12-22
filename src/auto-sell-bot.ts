/**
 * Auto-Sell Bot - мгновенная продажа позиций через market orders
 */

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { TradingService } from './trading-service';
import { tradingConfig, AUTO_SELL_CONFIG } from './config';
import * as dotenv from 'dotenv';

// Load .env
dotenv.config();

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

    // Extract trade info
    const tradeId = data.id || '';
    const assetId = data.asset_id || '';
    const side = data.side || '';
    const size = data.size || '0';
    const makerAddress = data.maker_address || data.owner || '';

    // Skip if not a BUY trade (position opening)
    if (side !== 'BUY') {
      return;
    }

    // Skip if not our funder address
    const funderAddress = tradingConfig.funder?.toLowerCase();
    if (makerAddress.toLowerCase() !== funderAddress) {
      return;
    }

    // Skip duplicates
    if (processedTrades.has(tradeId)) {
      return;
    }

    processedTrades.add(tradeId);

    log(`New position detected: tokenId=${assetId}, size=${size}`);

    // Sell position immediately
    await sellPosition(assetId, parseFloat(size));

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
function handleMessage(client: any, message: any) {
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    const topic = data.topic || '';
    const msgType = data.type || '';

    // DEBUG: Log ALL incoming messages
    log(`[DEBUG] Received message - topic: ${topic}, type: ${msgType}`);
    if (topic === 'clob_user') {
      log(`[DEBUG] User channel message:`, JSON.stringify(data, null, 2));
    }

    // Handle trade events (position opened)
    if (topic === 'clob_user' && msgType === 'trade') {
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

      // Subscribe to User Channel (trade events)
      client.subscribe({
        subscriptions: [
          {
            topic: 'clob_user',
            type: 'trade',
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
