/**
 * Trading Service
 * Simplified version for BTC Updown Bot
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { TradingConfig, CreateOrderRequest, CreateMarketOrderRequest, Order } from './types';
import { PositionData } from './telegram-bot/types';

/**
 * Note: DNS bypass via dns.lookup patching doesn't work in newer Node.js
 * (lookup is read-only). The ClobClient uses its own HTTP client internally.
 * DNS caching happens at OS level anyway, so impact is minimal.
 */

export class TradingService {
  private client!: ClobClient;
  private wallet: Wallet;
  private funder: string;
  private config: TradingConfig;
  private isInitialized: boolean = false;

  constructor(config: TradingConfig) {
    this.config = config;

    // Create wallet from private key
    const pk = config.privateKey.startsWith('0x')
      ? config.privateKey
      : '0x' + config.privateKey;
    this.wallet = new Wallet(pk);

    // Store funder address (or use wallet address as default)
    this.funder = config.funder || this.wallet.address;

    console.log('Trading service initialized');
    console.log(`  Wallet: ${this.wallet.address}`);
    console.log(`  Funder: ${this.funder}`);

    // Initialize CLOB client only if credentials are provided
    if (config.apiKey && config.secret && config.passphrase) {
      this.initializeClient();
    } else {
      console.warn('  CLOB client not initialized (credentials not provided)');
      console.warn('  Only Data API methods (getPositions) will be available');
    }
  }

  private initializeClient(): void {
    try {
      if (!this.config.apiKey || !this.config.secret || !this.config.passphrase) {
        throw new Error('API credentials required');
      }

      const creds = {
        key: this.config.apiKey,
        secret: this.config.secret,
        passphrase: this.config.passphrase
      };

      this.client = new ClobClient(
        this.config.clobApiUrl,
        this.config.chainId,
        this.wallet,
        creds,
        this.config.signatureType,
        this.funder,
        undefined,  // baseUrl (deprecated)
        undefined   // useServerTime - use local time (PM allows ±60s skew)
      );

      this.isInitialized = true;
      console.log('CLOB client initialized');

    } catch (error) {
      console.error('Failed to initialize CLOB client:', error);
      throw error;
    }
  }

  /**
   * Create a limit order
   */
  async createLimitOrder(request: CreateOrderRequest): Promise<Order> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    console.log(`Creating ${request.side} order:`, {
      outcome: request.outcome,
      price: request.price,
      size: request.size,
    });

    // Determine order type
    let expirationTimestamp: number | undefined;
    let orderType: OrderType;

    if (request.expirationTimestamp && request.expirationTimestamp > 0) {
      expirationTimestamp = request.expirationTimestamp;
      orderType = OrderType.GTD;
      console.log(`  Order type: GTD (expires: ${new Date(expirationTimestamp * 1000).toLocaleString()})`);
    } else {
      orderType = OrderType.GTC;
      console.log(`  Order type: GTC`);
    }

    // Prepare order parameters
    const orderParams: any = {
      tokenID: request.tokenId,
      price: request.price,
      side: request.side === 'BUY' ? Side.BUY : Side.SELL,
      size: request.size,
    };

    if (expirationTimestamp) {
      orderParams.expiration = expirationTimestamp;
    }

    // Create and post order
    const order = await this.client.createOrder(orderParams);

    const orderResponse = await this.client.postOrders([
      {
        order: order,
        orderType: orderType,
      },
    ]);

    const firstResponse = Array.isArray(orderResponse) ? orderResponse[0] : orderResponse;

    if (firstResponse?.success === false || firstResponse?.errorMsg) {
      throw new Error(firstResponse?.errorMsg || 'Order creation failed');
    }

    if (!firstResponse?.orderID) {
      throw new Error('No orderID returned');
    }

    console.log(`Order created: ${firstResponse.orderID}`);

    return {
      orderId: firstResponse.orderID,
      tokenId: request.tokenId,
      side: request.side,
      price: request.price,
      size: request.size,
      filledSize: 0,
      outcome: request.outcome,
      status: 'OPEN',
      timestamp: new Date(),
      orderType: orderType === OrderType.GTD ? 'GTD' : 'GTC',
      expirationTime: expirationTimestamp ? new Date(expirationTimestamp * 1000) : undefined,
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    console.log(`Cancelling order: ${orderId}`);
    await this.client.cancelOrder({ orderID: orderId });
    console.log(`Order cancelled: ${orderId}`);
  }

  /**
   * Cancel ALL open orders on the account
   * WARNING: This will cancel every open order!
   */
  async cancelAllOrders(): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    console.log('[TRADING] Cancelling ALL orders...');
    const result = await this.client.cancelAll();
    console.log('[TRADING] All orders cancelled:', result);
    return result;
  }

  /**
   * Create a signed order WITHOUT posting (for pre-sign optimization)
   */
  async createSignedOrder(request: CreateOrderRequest): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    const orderParams: any = {
      tokenID: request.tokenId,
      price: request.price,
      side: request.side === 'BUY' ? Side.BUY : Side.SELL,
      size: request.size,
    };

    if (request.expirationTimestamp && request.expirationTimestamp > 0) {
      orderParams.expiration = request.expirationTimestamp;
    }

    // Only sign, don't post
    const signedOrder = await this.client.createOrder(orderParams);
    return signedOrder;
  }

  /**
   * Post a pre-signed order
   * Returns full API response for detailed logging
   */
  async postSignedOrder(signedOrder: any, expirationTimestamp?: number): Promise<Order & { rawResponse?: any }> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    const orderType = expirationTimestamp ? OrderType.GTD : OrderType.GTC;

    const orderResponse = await this.client.postOrders([
      {
        order: signedOrder,
        orderType: orderType,
      },
    ]);

    const firstResponse = Array.isArray(orderResponse) ? orderResponse[0] : orderResponse;

    if (firstResponse?.success === false || firstResponse?.errorMsg) {
      // Include full response in error for debugging
      const error = new Error(firstResponse?.errorMsg || 'Order posting failed');
      (error as any).rawResponse = firstResponse;
      throw error;
    }

    if (!firstResponse?.orderID) {
      const error = new Error('No orderID returned');
      (error as any).rawResponse = firstResponse;
      throw error;
    }

    return {
      orderId: firstResponse.orderID,
      tokenId: '',
      side: 'BUY',
      price: 0,
      size: 0,
      filledSize: 0,
      outcome: 'YES',
      status: 'OPEN',
      timestamp: new Date(),
      orderType: orderType === OrderType.GTD ? 'GTD' : 'GTC',
      rawResponse: firstResponse,  // Include full response
    };
  }

  /**
   * Get wallet address for API calls
   */
  getWalletAddress(): string {
    return this.wallet.address;
  }

  /**
   * Fetch user positions from Polymarket Data API
   * @param options - Filter options (limit, titleFilter, redeemable)
   */
  async getPositions(options?: {
    limit?: number;
    titleFilter?: string;
    redeemable?: boolean;
  }): Promise<PositionData[]> {
    const limit = Math.min(options?.limit || 100, 100);

    // Use funder address (proxy wallet) for positions - Polymarket stores positions there
    const userAddress = this.funder;

    const url = new URL('https://data-api.polymarket.com/positions');
    url.searchParams.set('user', userAddress);
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('sortBy', 'CURRENT');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('sizeThreshold', '0');

    console.log(`[TRADING] Fetching positions for address: ${userAddress}`);
    console.log(`[TRADING] API URL: ${url.toString()}`);

    try {
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TRADING] Positions API error:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format: expected array');
      }

      let positions = data as PositionData[];

      console.log(`[TRADING] Received ${positions.length} positions from API`);

      // Filter by redeemable status if specified
      if (options?.redeemable !== undefined) {
        positions = positions.filter((p) => p.redeemable === options.redeemable);
        const statusText = options.redeemable ? 'closed' : 'active';
        console.log(`[TRADING] After redeemable filter: ${positions.length} ${statusText} positions`);
      }

      // Filter by title if specified
      if (options?.titleFilter) {
        const filter = options.titleFilter.toLowerCase();
        positions = positions.filter((p) =>
          p.title?.toLowerCase().includes(filter) ||
          p.slug?.toLowerCase().includes(filter)
        );
        console.log(`[TRADING] After title filter: ${positions.length} positions`);
      }

      return positions;
    } catch (error) {
      console.error('[TRADING] Failed to fetch positions:', error);
      throw error;
    }
  }

  /**
   * Create and post a market order (FOK/FAK)
   * For instant selling of positions
   */
  async createAndPostMarketOrder(request: CreateMarketOrderRequest): Promise<Order> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Trading service not initialized');
    }

    const { tokenId, side, amount, orderType = 'FOK' } = request;

    console.log(`[TRADING] Creating market order: ${side} ${amount} shares of ${tokenId} (${orderType})`);

    // Create market order
    const userMarketOrder: any = {
      tokenID: tokenId,
      amount: amount,  // For SELL: shares to sell
      side: side === 'BUY' ? Side.BUY : Side.SELL,
    };

    // Determine order type
    const orderTypeEnum = orderType === 'FAK' ? OrderType.FAK : OrderType.FOK;

    // Create and post market order
    const orderResponse = await this.client.createAndPostMarketOrder(
      userMarketOrder,
      undefined,  // options
      orderTypeEnum,
      false  // deferExec
    );

    console.log(`Market order created: ${orderResponse.orderID || 'N/A'}`);

    return {
      orderId: orderResponse.orderID || '',
      tokenId: tokenId,
      side: side,
      price: 0,  // Market order (no fixed price)
      size: amount,
      filledSize: 0,
      outcome: side === 'BUY' ? 'YES' : 'NO',
      status: 'OPEN',
      timestamp: new Date(),
      orderType: orderType,
    };
  }
}
