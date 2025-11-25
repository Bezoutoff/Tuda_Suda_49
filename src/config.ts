/**
 * Bot and Trading Configuration
 */

import { TradingConfig } from './types';

// Bot configuration
export const BOT_CONFIG = {
  // Market filter pattern
  MARKET_SLUG_PATTERN: 'btc-updown-15m',

  // Order parameters
  ORDER_PRICE: 0.49,  // 49 cents for both YES and NO

  // Default order size (can be overridden by BOT_ORDER_SIZE env var)
  DEFAULT_ORDER_SIZE: 10,

  // Buffer before market start (seconds)
  // GTD orders will expire this many seconds before trading starts
  EXPIRATION_BUFFER_SECONDS: 60,

  // Logging prefix
  LOG_PREFIX: '[BTC-BOT]',
};

// Trading configuration (from .env)
export const tradingConfig: TradingConfig = {
  privateKey: process.env.PK ? `0x${process.env.PK}` : '',
  apiKey: process.env.CLOB_API_KEY,
  secret: process.env.CLOB_SECRET,
  passphrase: process.env.CLOB_PASS_PHRASE,
  funder: process.env.FUNDER,
  chainId: parseInt(process.env.CHAIN_ID || '137'),
  clobApiUrl: process.env.CLOB_API_URL || 'https://clob.polymarket.com',
  signatureType: 2, // POLY_PROXY
};

/**
 * Validate trading configuration
 */
export function validateTradingConfig(config: TradingConfig): boolean {
  const errors: string[] = [];

  if (!config.privateKey || config.privateKey.length === 0 || config.privateKey === '0x') {
    errors.push('PK not set');
  } else if (config.privateKey.length !== 66) {
    errors.push('PK must be 64 characters (without 0x prefix in .env)');
  }

  if (!config.apiKey) {
    errors.push('CLOB_API_KEY not set');
  }

  if (!config.secret) {
    errors.push('CLOB_SECRET not set');
  }

  if (!config.passphrase) {
    errors.push('CLOB_PASS_PHRASE not set');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease set required variables in .env file');
    return false;
  }

  return true;
}

/**
 * Get order size from environment or use default
 */
export function getOrderSize(): number {
  const envSize = process.env.BOT_ORDER_SIZE;
  if (envSize) {
    const parsed = parseFloat(envSize);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return BOT_CONFIG.DEFAULT_ORDER_SIZE;
}

/**
 * Extract start timestamp from market slug
 * Example: btc-updown-15m-1764054900 -> 1764054900
 */
export function extractStartTimestamp(slug: string): number | null {
  const match = slug.match(/btc-updown-15m-(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Check if slug matches BTC updown 15m pattern
 */
export function isBtcUpdownMarket(slug: string): boolean {
  return slug.includes(BOT_CONFIG.MARKET_SLUG_PATTERN);
}
