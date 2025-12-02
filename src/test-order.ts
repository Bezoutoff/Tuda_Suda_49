/**
 * Test Order Script
 *
 * Tests order creation for a specific BTC updown market.
 * Creates a test order at 1 cent (0.01) to verify everything works.
 *
 * Usage: npm run test-order [market-slug]
 * Example: npm run test-order btc-updown-15m-1764140400
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { TradingService } from './trading-service';
import { tradingConfig, validateTradingConfig, BOT_CONFIG, extractStartTimestamp, getOrderSize } from './config';

// Test parameters
const DEFAULT_SLUG = 'btc-updown-15m-1764140400';
const TEST_PRICE = 0.01;  // 1 cent - low price so it won't fill accidentally
const TEST_SIZE = 10;     // 10 shares

async function fetchMarketData(slug: string) {
  console.log(`\nFetching market data for: ${slug}`);

  const url = `https://gamma-api.polymarket.com/events?slug=${slug}`;
  console.log(`API URL: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await response.json() as any[];

  if (!events || events.length === 0) {
    throw new Error('Market not found in Gamma API');
  }

  const event = events[0];
  console.log(`\nEvent: ${event.title}`);
  console.log(`Description: ${event.description?.substring(0, 100)}...`);

  const markets = event.markets || [];
  if (markets.length === 0) {
    throw new Error('No markets found in event');
  }

  const market = markets[0];
  console.log(`\nMarket: ${market.question}`);
  console.log(`Condition ID: ${market.conditionId}`);
  console.log(`Active: ${market.active}`);
  console.log(`Closed: ${market.closed}`);

  let clobTokenIds = market.clobTokenIds;
  if (typeof clobTokenIds === 'string') {
    clobTokenIds = JSON.parse(clobTokenIds);
  }

  if (!clobTokenIds || clobTokenIds.length < 2) {
    throw new Error('Token IDs not found');
  }

  return {
    yesTokenId: clobTokenIds[0],
    noTokenId: clobTokenIds[1],
    market,
    event,
  };
}

async function testOrder() {
  console.log('='.repeat(60));
  console.log('BTC Updown Bot - Test Order Script');
  console.log('='.repeat(60));

  // Get slug from command line or use default
  const slug = process.argv[2] || DEFAULT_SLUG;
  console.log(`\nTest market: ${slug}`);
  console.log(`Test price: ${TEST_PRICE} (${TEST_PRICE * 100} cents)`);
  console.log(`Test size: ${TEST_SIZE} shares`);

  // Extract timestamp from slug
  const startTimestamp = extractStartTimestamp(slug);
  if (startTimestamp) {
    const startDate = new Date(startTimestamp * 1000);
    console.log(`Market start time: ${startDate.toLocaleString('ru-RU')}`);

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (startTimestamp <= nowSeconds) {
      console.log('\n⚠️  WARNING: This market has already started!');
    }
  }

  // Fetch market data
  let marketData;
  try {
    marketData = await fetchMarketData(slug);
  } catch (error: any) {
    console.error(`\n❌ Failed to fetch market data: ${error.message}`);
    return;
  }

  console.log('\n--- Token IDs ---');
  console.log(`YES (Up):   ${marketData.yesTokenId}`);
  console.log(`NO (Down):  ${marketData.noTokenId}`);

  // Validate trading config
  console.log('\n--- Trading Config ---');
  if (!validateTradingConfig(tradingConfig)) {
    console.error('❌ Invalid trading configuration. Check .env file.');
    return;
  }
  console.log('✅ Trading config valid');

  // Initialize trading service
  let tradingService: TradingService;
  try {
    tradingService = new TradingService(tradingConfig);
    console.log('✅ Trading service initialized');
  } catch (error: any) {
    console.error(`❌ Failed to initialize trading service: ${error.message}`);
    return;
  }

  // Calculate GTD expiration timestamp (use first order's buffer for test)
  let expirationTimestamp: number | undefined;
  if (startTimestamp) {
    const expirationBuffer = BOT_CONFIG.ORDER_CONFIG[0]?.expirationBuffer || 60;
    expirationTimestamp = startTimestamp - expirationBuffer;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (expirationTimestamp <= nowSeconds) {
      console.log('\n⚠️  Expiration is in the past, using GTC instead of GTD');
      expirationTimestamp = undefined;
    } else {
      const expirationDate = new Date(expirationTimestamp * 1000);
      console.log(`\nGTD expiration: ${expirationDate.toLocaleString('ru-RU')}`);
    }
  }

  // Create test orders for both YES and NO
  console.log('\n--- Creating Test Orders (GTD) ---');

  // YES order
  console.log(`\n[1/2] Placing BUY order for YES (Up) @ ${TEST_PRICE} x ${TEST_SIZE}...`);
  try {
    const yesOrder = await tradingService.createLimitOrder({
      tokenId: marketData.yesTokenId,
      side: 'BUY',
      price: TEST_PRICE,
      size: TEST_SIZE,
      outcome: 'YES',
      negRisk: true,
      expirationTimestamp: expirationTimestamp,
    });

    console.log(`✅ YES order created: ${yesOrder.orderId}`);
  } catch (error: any) {
    console.error(`❌ Failed to create YES order: ${error.message}`);
  }

  // NO order
  console.log(`\n[2/2] Placing BUY order for NO (Down) @ ${TEST_PRICE} x ${TEST_SIZE}...`);
  try {
    const noOrder = await tradingService.createLimitOrder({
      tokenId: marketData.noTokenId,
      side: 'BUY',
      price: TEST_PRICE,
      size: TEST_SIZE,
      outcome: 'NO',
      negRisk: true,
      expirationTimestamp: expirationTimestamp,
    });

    console.log(`✅ NO order created: ${noOrder.orderId}`);
  } catch (error: any) {
    console.error(`❌ Failed to create NO order: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test completed!');
  console.log('='.repeat(60));
  console.log('\n💡 Check your orders on Polymarket:');
  console.log(`   https://polymarket.com/portfolio`);
  console.log(`   (Look under FUNDER address if using POLY_PROXY)`)
}

testOrder().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
