/**
 * Cancel All Orders Script
 *
 * Simple script to cancel all open orders on Polymarket account
 * Usage: npm run cancel-all
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { TradingService } from '../src/trading-service';
import { tradingConfig, validateTradingConfig } from '../src/config';

async function main() {
  console.log('=================================================');
  console.log('Cancel All Orders - Polymarket');
  console.log('=================================================\n');

  // Validate config
  if (!validateTradingConfig(tradingConfig)) {
    console.error('\n❌ Cannot proceed without valid trading configuration');
    process.exit(1);
  }

  console.log('✅ Configuration valid\n');

  // Initialize trading service
  const tradingService = new TradingService(tradingConfig);
  console.log('✅ Trading service initialized\n');

  console.log('🗑️  Cancelling ALL open orders...\n');

  try {
    const result = await tradingService.cancelAllOrders();

    console.log('✅ Success! All orders cancelled.\n');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('\n❌ Error cancelling orders:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
