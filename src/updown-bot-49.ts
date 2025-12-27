/**
 * Multi-Crypto Updown 49 Bot
 *
 * Простая стратегия для BTC, ETH, SOL, XRP updown маркетов
 * 2 ордера по 0.49 (UP и DOWN) по 5 shares для каждой валюты
 * Expiration: 20 минут до старта торгов
 *
 * Usage: npm run updown-bot-49 updown-15m-TIMESTAMP
 * Note: Timestamp argument is REQUIRED
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig } from './config';

const INTERVAL_SECONDS = 900; // 15 минут

// Поддерживаемые криптовалюты
const SUPPORTED_CRYPTOS = ['btc', 'eth', 'sol', 'xrp'] as const;
type CryptoSymbol = typeof SUPPORTED_CRYPTOS[number];

// Конфигурация для каждой валюты (одинаковая)
// ОПТИМИЗАЦИЯ: Отключены SOL/XRP для экономии памяти (~400MB)
const CRYPTO_CONFIG: Record<CryptoSymbol, { enabled: boolean }> = {
  btc: { enabled: true },   // ✅ Активен для торговли
  eth: { enabled: true },   // ✅ Активен для торговли
  sol: { enabled: false },  // ❌ Отключен (экономия памяти)
  xrp: { enabled: false },  // ❌ Отключен (экономия памяти)
};

// Простая конфигурация
const SIMPLE_CONFIG = {
  PRICE: 0.49,
  SIZE: 5,
  EXPIRATION_MINUTES: 20, // 20 минут до старта
  POLL_INTERVAL_MS: 350,
  DELAY_BEFORE_SPAM_MS: 22500, // 22.5 секунд после получения token IDs
  MAX_ORDER_ATTEMPTS: 2000,
  POLL_TIMEOUT_MS: 20 * 60 * 1000, // 20 минут
  START_POLLING_BEFORE_MS: 60000, // Начать polling за 60 сек до времени
};

// Cached timestamp (updates every second to reduce CPU load)
let cachedTimestamp = new Date().toLocaleString('ru-RU');
const timestampInterval = setInterval(() => {
  cachedTimestamp = new Date().toLocaleString('ru-RU');
}, 1000);

// Logger with dynamic crypto prefix
function log(message: string, crypto?: CryptoSymbol, ...args: any[]) {
  const prefix = crypto ? `[${crypto.toUpperCase()}-49]` : '[MULTI-49]';
  console.log(`[${cachedTimestamp}] ${prefix} ${message}`, ...args);
}

// Memory monitoring
function checkMemory() {
  const memUsage = process.memoryUsage();
  const rssInMB = Math.round(memUsage.rss / 1024 / 1024);

  if (rssInMB > 450) {
    log(`⚠️ High memory usage: ${rssInMB}MB. Restarting recommended.`);
  }

  return rssInMB;
}

// Check memory every 30 minutes
const memoryCheckInterval = setInterval(() => {
  const rssInMB = checkMemory();
  log(`Memory: ${rssInMB}MB`);
}, 30 * 60 * 1000);

function logError(message: string, crypto?: CryptoSymbol, ...args: any[]) {
  const prefix = crypto ? `[${crypto.toUpperCase()}-49]` : '[MULTI-49]';
  console.error(`[${cachedTimestamp}] ${prefix} ERROR: ${message}`, ...args);
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

// Market cache for auto-sell-bot integration
const MARKET_CACHE_PATH = path.join(__dirname, '../logs/market-cache.json');

interface MarketCache {
  [tokenId: string]: {
    oppositeTokenId: string;
    slug: string;
    outcome: 'YES' | 'NO';
  };
}

/**
 * Save market token mapping to cache file for auto-sell-bot
 */
function saveMarketCache(yesTokenId: string, noTokenId: string, slug: string): void {
  try {
    // Load existing cache
    let cache: MarketCache = {};
    if (fs.existsSync(MARKET_CACHE_PATH)) {
      const data = fs.readFileSync(MARKET_CACHE_PATH, 'utf-8');
      cache = JSON.parse(data);
    }

    // Add both mappings
    cache[yesTokenId] = {
      oppositeTokenId: noTokenId,
      slug,
      outcome: 'YES',
    };
    cache[noTokenId] = {
      oppositeTokenId: yesTokenId,
      slug,
      outcome: 'NO',
    };

    // Save to file
    fs.writeFileSync(MARKET_CACHE_PATH, JSON.stringify(cache, null, 2));

  } catch (error: any) {
    console.error('[CACHE] Failed to save market cache:', error.message);
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
  slug: string,
  crypto: CryptoSymbol
): Promise<boolean> {
  // Save market cache for auto-sell-bot
  saveMarketCache(yesTokenId, noTokenId, slug);

  log(`Placing 2 orders for ${slug}:`, crypto);
  log(`  Price: $${SIMPLE_CONFIG.PRICE}`, crypto);
  log(`  Size: ${SIMPLE_CONFIG.SIZE} shares each (UP and DOWN)`, crypto);
  log(`  Expiration: ${SIMPLE_CONFIG.EXPIRATION_MINUTES} minutes before start`, crypto);

  // Calculate expiration: BEFORE market start (not after!)
  // Polymarket subtracts 60s from relative time: adjustedTime = relativeTime - 60
  // To get -1200s (20 min before), we specify relativeTime = -1140, PM adjusts to -1200
  const desiredSecondsBeforeStart = SIMPLE_CONFIG.EXPIRATION_MINUTES * 60; // e.g. 1200s (20 min)
  const expirationBuffer = desiredSecondsBeforeStart - 60; // 1200 - 60 = 1140
  const expirationTimestamp = marketTimestamp - expirationBuffer; // marketTimestamp - 1140

  log(`  Expiration time: ${formatTimestamp(expirationTimestamp)} (${SIMPLE_CONFIG.EXPIRATION_MINUTES} min before start)`, crypto);

  interface SignedOrderInfo {
    signedOrder: any;
    side: 'UP' | 'DOWN';
    expirationTimestamp: number;
    placed: boolean;
    orderId?: string;
  }

  const signedOrders: SignedOrderInfo[] = [];

  // PRE-SIGN both orders
  log(`Pre-signing 2 orders...`, crypto);

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

    log(`Both orders pre-signed successfully`, crypto);
  } catch (error: any) {
    logError(`Failed to pre-sign orders: ${error.message}`, crypto);
    return false;
  }

  // DELAY: wait before spam
  const delayMs = SIMPLE_CONFIG.DELAY_BEFORE_SPAM_MS;
  if (delayMs > 0) {
    log(`Waiting ${delayMs / 1000}s before spam...`, crypto);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // SPAM: stream mode
  const startTime = Date.now();
  let totalAttempts = 0;
  const STREAM_INTERVAL_MS = 20;
  let pendingRequests = 0; // Track pending requests without storing promises

  log(`Stream spam: sending requests every ${STREAM_INTERVAL_MS}ms`, crypto);

  const sendRequest = (order: typeof signedOrders[0]) => {
    totalAttempts++;
    pendingRequests++; // Increment counter

    tradingService.postSignedOrder(order.signedOrder, order.expirationTimestamp)
      .then(result => {
        if (!order.placed) {
          order.placed = true;
          order.orderId = result.orderId;
          const placedCount = signedOrders.filter(o => o.placed).length;
          log(`${order.side} @ ${SIMPLE_CONFIG.PRICE} placed: ${result.orderId} (${placedCount}/2)`, crypto);
        }
      })
      .catch(() => {})
      .finally(() => {
        pendingRequests--; // Decrement counter when request completes
      });
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
      log(`Progress: ${placedCount}/2 placed, ${totalAttempts} attempts, ${elapsed}s`, crypto);
    }
  }

  // Wait for all pending requests to complete
  log(`Waiting for ${pendingRequests} pending requests...`, crypto);
  while (pendingRequests > 0) {
    await new Promise(r => setTimeout(r, 100));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const placedCount = signedOrders.filter(o => o.placed).length;

  if (placedCount === 2) {
    log(`*** BOTH ORDERS PLACED! (${totalAttempts} attempts, ${elapsed}s) ***`, crypto);
    return true;
  } else {
    const failed = signedOrders.filter(o => !o.placed);
    logError(`Failed to place ${failed.length} orders after ${totalAttempts} attempts (${elapsed}s):`, crypto);
    failed.forEach(o => logError(`  - ${o.side} @ ${SIMPLE_CONFIG.PRICE}`, crypto));
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
  marketTimestamp: number,
  crypto: CryptoSymbol
): Promise<boolean> {
  log(`Starting polling for: ${slug}`, crypto);

  let pollCount = 0;
  const startTime = Date.now();

  while (true) {
    pollCount++;

    const elapsed = Date.now() - startTime;
    if (elapsed > SIMPLE_CONFIG.POLL_TIMEOUT_MS) {
      logError(`Polling timeout after ${Math.round(elapsed / 1000)}s`, crypto);
      return false;
    }

    const market = await fetchMarketBySlug(slug);

    if (market) {
      log(`Market found after ${pollCount} requests (${Math.round(elapsed / 1000)}s)!`, crypto);
      log(`  YES Token: ${market.yesTokenId.slice(0, 20)}...`, crypto);
      log(`  NO Token: ${market.noTokenId.slice(0, 20)}...`, crypto);

      return await placeSimpleOrders(
        tradingService,
        market.yesTokenId,
        market.noTokenId,
        marketTimestamp,
        slug,
        crypto
      );
    }

    if (pollCount % 100 === 0) {
      log(`Polling... ${pollCount} requests, ${Math.round(elapsed / 1000)}s elapsed`, crypto);
    }

    await new Promise(resolve => setTimeout(resolve, SIMPLE_CONFIG.POLL_INTERVAL_MS));
  }
}

/**
 * Process single crypto market
 */
async function processCryptoMarket(
  tradingService: TradingService,
  crypto: CryptoSymbol,
  timestamp: number
): Promise<{ crypto: CryptoSymbol; success: boolean }> {
  const slug = `${crypto}-updown-15m-${timestamp}`;

  log(`Processing: ${slug}`, crypto);
  log(`Market time: ${formatTimestamp(timestamp)}`, crypto);

  const success = await pollAndPlaceOrders(tradingService, slug, timestamp, crypto);

  if (success) {
    log(`Market ${slug} processed successfully!`, crypto);
  } else {
    logError(`Failed to process market ${slug}`, crypto);
  }

  return { crypto, success };
}

/**
 * Main bot function
 */
async function main() {
  log('Starting Multi-Crypto Updown 49 Bot...');
  log(`Supported cryptos: ${SUPPORTED_CRYPTOS.join(', ').toUpperCase()}`);
  log(`Strategy: 2 orders @ $${SIMPLE_CONFIG.PRICE} (UP and DOWN) per crypto`);
  log(`Size: ${SIMPLE_CONFIG.SIZE} shares each`);
  log(`Expiration: ${SIMPLE_CONFIG.EXPIRATION_MINUTES} minutes before start`);
  const totalCapitalPerCrypto = SIMPLE_CONFIG.SIZE * SIMPLE_CONFIG.PRICE * 2;
  const totalCapitalAll = totalCapitalPerCrypto * SUPPORTED_CRYPTOS.length;
  log(`Total capital: $${totalCapitalAll} per timestamp (${SUPPORTED_CRYPTOS.length} cryptos × $${totalCapitalPerCrypto})`);

  if (!validateTradingConfig(tradingConfig)) {
    logError('Invalid trading configuration. Check .env file.');
    process.exit(1);
  }

  const tradingService = new TradingService(tradingConfig);
  log('Trading service initialized');

  // Require timestamp argument
  const manualSlug = process.argv[2];

  if (!manualSlug) {
    logError('ERROR: Timestamp argument is required!');
    logError('');
    logError('Usage:');
    logError('  npm run updown-bot-49 updown-15m-TIMESTAMP');
    logError('');
    logError('Example:');
    logError('  npm run updown-bot-49 updown-15m-1766571000');
    logError('');
    logError('To calculate next timestamp:');
    logError('  node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log(\'updown-15m-\' + next)"');
    process.exit(1);
  }

  // Parse timestamp from slug (updown-15m-TIMESTAMP)
  const match = manualSlug.match(/^updown-15m-(\d+)$/);
  if (!match) {
    logError(`Invalid slug format: ${manualSlug}`);
    logError('Expected format: updown-15m-TIMESTAMP');
    process.exit(1);
  }

  let marketTimestamp = parseInt(match[1]);

  // Continuous loop - process all cryptos in parallel for each timestamp
  while (true) {
    log(`\n${'='.repeat(60)}`);
    log(`Processing timestamp: ${marketTimestamp} (${formatTimestamp(marketTimestamp)})`);
    log(`Markets: ${SUPPORTED_CRYPTOS.map(c => `${c}-updown-15m-${marketTimestamp}`).join(', ')}`);
    log(`${'='.repeat(60)}`);

    // Process all cryptos in parallel
    const enabledCryptos = SUPPORTED_CRYPTOS.filter(c => CRYPTO_CONFIG[c].enabled);
    const promises = enabledCryptos.map(crypto =>
      processCryptoMarket(tradingService, crypto, marketTimestamp)
    );

    const results = await Promise.all(promises);

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    log(`\nSummary for timestamp ${marketTimestamp}:`);
    log(`  ✓ Successful: ${successful}/${enabledCryptos.length}`);
    log(`  ✗ Failed: ${failed}/${enabledCryptos.length}`);

    if (successful > 0) {
      log(`  Success list: ${results.filter(r => r.success).map(r => r.crypto.toUpperCase()).join(', ')}`);
    }
    if (failed > 0) {
      log(`  Failed list: ${results.filter(r => !r.success).map(r => r.crypto.toUpperCase()).join(', ')}`);
    }

    // Next iteration
    marketTimestamp += INTERVAL_SECONDS;
    log(`\nNext markets at ${formatTimestamp(marketTimestamp)}`);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Handle termination with graceful cleanup
process.on('SIGINT', () => {
  log('Shutting down (SIGINT)...');

  // Stop intervals
  clearInterval(timestampInterval);
  clearInterval(memoryCheckInterval);

  // Flush stdout/stderr (important for Docker/PM2 logs)
  process.stdout.write('', () => {
    process.stderr.write('', () => {
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  log('Shutting down (SIGTERM)...');

  // Stop intervals
  clearInterval(timestampInterval);
  clearInterval(memoryCheckInterval);

  // Flush stdout/stderr (important for Docker/PM2 logs)
  process.stdout.write('', () => {
    process.stderr.write('', () => {
      process.exit(0);
    });
  });
});

// Run
main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
