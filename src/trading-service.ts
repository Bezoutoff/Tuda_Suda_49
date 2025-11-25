/**
 * Trading Service
 * Simplified version for BTC Updown Bot
 */

import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { TradingConfig, CreateOrderRequest, Order } from './types';

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

    // Initialize CLOB client
    this.initializeClient();
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
        this.funder
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
   */
  async postSignedOrder(signedOrder: any, expirationTimestamp?: number): Promise<Order> {
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
      throw new Error(firstResponse?.errorMsg || 'Order posting failed');
    }

    if (!firstResponse?.orderID) {
      throw new Error('No orderID returned');
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
    };
  }
}
