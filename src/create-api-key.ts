/**
 * Create or Derive API Key for Polymarket CLOB
 *
 * Usage: npx ts-node src/create-api-key.ts <PRIVATE_KEY>
 */

import { ethers } from "ethers";
import { ClobClient } from "@polymarket/clob-client";

async function main() {
  const pk = process.argv[2];

  if (!pk) {
    console.error("Usage: npx ts-node src/create-api-key.ts <PRIVATE_KEY>");
    console.error("Example: npx ts-node src/create-api-key.ts 77cd4b4ed58419ac4bbf1f30edb485a5f0d19aad13c486abc5651b22d76abe42");
    process.exit(1);
  }

  // Add 0x prefix if not present
  const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;

  const wallet = new ethers.Wallet(privateKey);
  const address = await wallet.getAddress();

  console.log("=".repeat(60));
  console.log("Polymarket API Key Generator");
  console.log("=".repeat(60));
  console.log(`\nWallet Address: ${address}`);
  console.log(`Chain ID: 137 (Polygon)`);
  console.log(`\nConnecting to Polymarket CLOB...\n`);

  const host = "https://clob.polymarket.com";
  const chainId = 137; // Polygon mainnet

  const clobClient = new ClobClient(host, chainId, wallet);

  try {
    const resp = await clobClient.createOrDeriveApiKey() as any;

    console.log("API Key created/derived successfully!\n");
    console.log("=".repeat(60));
    console.log("Add these to your .env file:");
    console.log("=".repeat(60));
    console.log(`\nPK=${pk}`);
    console.log(`CLOB_API_KEY=${resp.apiKey || resp.key}`);
    console.log(`CLOB_SECRET=${resp.secret}`);
    console.log(`CLOB_PASS_PHRASE=${resp.passphrase}`);
    console.log(`CHAIN_ID=137`);
    console.log(`CLOB_API_URL=https://clob.polymarket.com`);
    console.log("");
    console.log("Full response:", JSON.stringify(resp, null, 2));
  } catch (error: any) {
    console.error("Error creating API key:", error.message);
    process.exit(1);
  }
}

main();
