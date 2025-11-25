/**
 * Test WebSocket - Subscribe to ALL market_created events
 * Shows slug by fetching from Gamma API
 *
 * Usage: npm run test-ws
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { RealTimeDataClient } from '@polymarket/real-time-data-client';

const clobAuth = {
  key: process.env.CLOB_API_KEY || '',
  secret: process.env.CLOB_SECRET || '',
  passphrase: process.env.CLOB_PASS_PHRASE || ''
};

console.log('='.repeat(60));
console.log('WebSocket Test - Subscribe to ALL market_created events');
console.log('='.repeat(60));
console.log('');
console.log('CLOB Auth:');
console.log('  API Key:', clobAuth.key ? `${clobAuth.key.slice(0, 8)}...` : 'MISSING');
console.log('  Secret:', clobAuth.secret ? 'present' : 'MISSING');
console.log('  Passphrase:', clobAuth.passphrase ? 'present' : 'MISSING');
console.log('');

if (!clobAuth.key || !clobAuth.secret || !clobAuth.passphrase) {
  console.error('ERROR: Missing CLOB credentials in .env');
  process.exit(1);
}

let messageCount = 0;
let connectionCount = 0;
let updownCount = 0;

// Supported updown 15m patterns
const UPDOWN_PATTERNS = [
  'btc-updown-15m',
  'eth-updown-15m',
  'sol-updown-15m',
  'xrp-updown-15m',
];

/**
 * Check if slug matches any updown pattern
 */
function isUpdownMarket(slug: string): string | null {
  return UPDOWN_PATTERNS.find(pattern => slug.includes(pattern)) || null;
}

/**
 * Fetch market slug from Gamma API by condition_id
 */
async function fetchSlugFromGamma(conditionId: string): Promise<string | null> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const markets = await response.json() as any[];
    if (!markets || markets.length === 0) return null;

    return markets[0].slug || markets[0].question || null;
  } catch {
    return null;
  }
}

const onMessage = async (client: RealTimeDataClient, message: any): Promise<void> => {
  messageCount++;
  const timestamp = new Date().toLocaleString('ru-RU');

  // Extract from payload
  const payload = message.payload || {};
  const conditionId = payload.market || '';

  console.log(`\n[${timestamp}] Message #${messageCount}:`);
  console.log('  Condition ID:', conditionId ? `${conditionId.slice(0, 16)}...` : 'N/A');
  console.log('  Neg Risk:', payload.neg_risk);

  // Fetch slug from Gamma API with retry
  if (conditionId) {
    let slug: string | null = null;

    // Retry up to 3 times with 1 second delay
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        console.log(`  Retry ${i + 1}/3...`);
        await new Promise(r => setTimeout(r, 1000));
      }
      slug = await fetchSlugFromGamma(conditionId);
      if (slug) break;
    }

    if (slug) {
      const matchedPattern = isUpdownMarket(slug);
      if (matchedPattern) {
        updownCount++;
        console.log(`  *** ${matchedPattern.toUpperCase()} MARKET! ***`);
      }
      console.log('  Slug:', slug);
    } else {
      console.log('  Slug: (not found in Gamma API)');
    }
  }

  console.log('  Asset IDs:', payload.asset_ids?.length || 0);
  console.log('  Min Order:', payload.min_order_size);
};

const onConnect = (client: RealTimeDataClient): void => {
  connectionCount++;
  const timestamp = new Date().toLocaleString('ru-RU');

  console.log(`\n[${timestamp}] Connected to RTDS (connection #${connectionCount})`);
  console.log('Subscribing to market_created with auth...');

  client.subscribe({
    subscriptions: [
      {
        topic: 'clob_market',
        type: 'market_created',
        clob_auth: clobAuth,
      },
    ],
  });

  console.log('Subscription sent!');
  console.log('Waiting for market_created events...');
  console.log('Tracking patterns:', UPDOWN_PATTERNS.join(', '));
  console.log('(Updown markets appear every 15 minutes)');
  console.log('');
};

const onDisconnect = (code: number, reason: string): void => {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`\n[${timestamp}] Disconnected: code=${code}, reason="${reason}"`);
};

console.log('Connecting to Polymarket RTDS...');

const client = new RealTimeDataClient({
  onMessage,
  onConnect,
});

// Listen for disconnection
(client as any).ws?.on?.('close', onDisconnect);

client.connect();

// Stats every 30 seconds
setInterval(() => {
  const timestamp = new Date().toLocaleString('ru-RU');
  console.log(`\n[${timestamp}] Stats: ${messageCount} messages, ${updownCount} updown markets, ${connectionCount} connections`);
}, 30000);

// Handle termination
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  console.log(`Total messages: ${messageCount}`);
  console.log(`Updown markets found: ${updownCount}`);
  client.disconnect();
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');
