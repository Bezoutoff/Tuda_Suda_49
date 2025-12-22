/**
 * Trading types for Polymarket orders
 */

import { OrderType } from '@polymarket/clob-client';

export { OrderType };

export type OrderSide = 'BUY' | 'SELL';

export interface TradingConfig {
  privateKey: string;
  apiKey?: string;
  secret?: string;
  passphrase?: string;
  funder?: string;
  chainId: number;
  clobApiUrl: string;
  signatureType: number;
}

export interface CreateOrderRequest {
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  outcome: string;
  negRisk?: boolean;
  expirationTimestamp?: number;
}

export interface CreateMarketOrderRequest {
  tokenId: string;
  side: OrderSide;
  amount: number;  // For SELL: shares to sell, for BUY: USDC to spend
  orderType?: 'FOK' | 'FAK';  // Default: FOK (Fill-or-Kill)
}

export interface Order {
  orderId: string;
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  filledSize: number;
  outcome: string;
  status: 'PENDING' | 'OPEN' | 'MATCHED' | 'CANCELLED' | 'FAILED';
  timestamp: Date;
  orderType?: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  expirationTime?: Date;
}

export interface OrderUpdate {
  orderId: string;
  status: Order['status'];
  filledSize?: number;
  message?: string;
}

/**
 * Side-specific order configuration (size and expiration)
 */
export interface SideOrderConfig {
  size: number;              // Order size in shares
  expirationBuffer: number;  // Seconds before market start
}

/**
 * Order configuration with separate UP/DOWN settings
 */
export interface OrderConfig {
  price: number;             // Common price for both sides
  up: SideOrderConfig;       // UP (YES) side configuration
  down: SideOrderConfig;     // DOWN (NO) side configuration
}
