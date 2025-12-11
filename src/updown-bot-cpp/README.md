# UpDownBot C++ - High-Performance Trading Bot

Production-ready bot for Polymarket BTC updown-15m markets with **ladder pricing strategy** and **C++ acceleration**.

## Architecture

### Hybrid TypeScript + C++ Design

```
┌─────────────────────────────────────────────────────────┐
│          UpDownBot C++ (updown-bot-cpp.ts)              │
│                                                         │
│  ┌──────────────┐      ┌──────────────┐                │
│  │ Gamma API    │      │ Trading      │                │
│  │ Polling      │─────▶│ Service      │                │
│  │              │      │ (EIP-712)    │                │
│  └──────────────┘      └──────────────┘                │
│         │                      │                       │
│         │                      ▼                       │
│         │          ┌──────────────────────┐            │
│         │          │ Pre-sign 10 Orders   │            │
│         │          │ (5 prices × 2 sides) │            │
│         │          └──────────────────────┘            │
│         │                      │                       │
│         ▼                      ▼                       │
│  ┌──────────────────────────────────────┐              │
│  │  Spawn 10 C++ Processes (Parallel)   │              │
│  │                                      │              │
│  │  [0] UP@0.48   [1] DOWN@0.48         │              │
│  │  [2] UP@0.47   [3] DOWN@0.47         │              │
│  │  [4] UP@0.46   [5] DOWN@0.46         │              │
│  │  [6] UP@0.45   [7] DOWN@0.45         │              │
│  │  [8] UP@0.44   [9] DOWN@0.44         │              │
│  │                                      │              │
│  │  Each process: 500 HTTP POST @ 1ms   │              │
│  └──────────────────────────────────────┘              │
│                      │                                 │
│                      ▼                                 │
│         ┌──────────────────────┐                       │
│         │ Aggregate Results &  │                       │
│         │ Write to CSV         │                       │
│         └──────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### Why C++?

**Speed**: C++ HTTP requests are **~65ms faster** than TypeScript:
- **TypeScript** (bot-polling.ts): ~350ms avg latency
- **C++** (updown-bot-cpp): ~285ms avg latency
- **Gain**: 18% faster = more attempts in same time window

**Native Performance**:
- libcurl: No Node.js HTTP overhead
- OpenSSL HMAC: ~10x faster than Node.js crypto
- TLS connection pooling at C level
- No GC pauses

### Why 10 Parallel Processes?

Each order needs different:
- Token ID (YES vs NO)
- Price (0.44, 0.45, 0.46, 0.47, 0.48)
- Size (7, 8, 9, 10, 10 USDC)
- Expiration timestamp (10min, 6min, 2min, 30sec, 1sec before start)

**Why not single C++ process with multi-threading?**
- Pre-signing requires EIP-712 (TypeScript/ethers)
- 10 processes = simpler code, easier debugging
- Isolation: one order failure doesn't affect others
- Node.js handles process orchestration well

## Installation

### Prerequisites (Ubuntu/Debian)

```bash
# Install C++ compiler and libraries
sudo apt-get update
sudo apt-get install -y build-essential libcurl4-openssl-dev libssl-dev

# Verify installation
g++ --version  # Should show 9.x or higher
```

### Build

```bash
# Build UpDownBot C++ binary
npm run build:updown-bot

# Or build all C++ binaries (test-latency + updown-bot)
npm run build:all-cpp

# Verify binary exists
ls -lh dist/updown-bot-cpp
```

Expected output:
```
Building UpDownBot C++ binary...
Compiling src/updown-bot-cpp/updown-bot.cpp...
Done: dist/updown-bot-cpp
```

## Usage

### Basic Usage

```bash
npm run updown-bot btc-updown-15m-1765343700
```

The bot will:
1. Poll Gamma API until market appears
2. Pre-sign 10 orders (5 prices × 2 sides)
3. Wait 23 seconds before spam
4. Spawn 10 C++ processes
5. Each process spams HTTP POST @ 1ms interval (max 500 attempts)
6. Write results to `updown-bot.csv`
7. Move to next market (+15 minutes)
8. **Repeat forever** (continuous loop)

### Continuous Mode

The bot automatically processes markets every 15 minutes:

```
Processing: btc-updown-15m-1765343700
Market time: 12:00:00
...
[Results]
Next market: btc-updown-15m-1765344600 at 12:15:00
...
```

Press `Ctrl+C` to stop.

## Configuration

### Bot Config (`src/config.ts`)

```typescript
export const BOT_CONFIG = {
  // Order ladder (5 price levels)
  ORDER_CONFIG: [
    { price: 0.48, size: 7,  expirationBuffer: 540 },  // 10min before
    { price: 0.47, size: 8,  expirationBuffer: 300 },  // 6min before
    { price: 0.46, size: 9,  expirationBuffer: 60 },   // 2min before
    { price: 0.45, size: 10, expirationBuffer: -30 },  // 30sec before
    { price: 0.44, size: 10, expirationBuffer: -59 },  // 1sec before
  ],

  // Timing
  POLL_INTERVAL_MS: 250,        // Gamma API polling
  DELAY_BEFORE_SPAM_MS: 23000,  // Wait before spam starts

  // C++ mode
  CPP_MODE: {
    MAX_ATTEMPTS_PER_ORDER: 500,  // 500 attempts per order
    INTERVAL_MS: 1,               // 1ms between requests
    CSV_LOG: 'updown-bot.csv',    // Output file
  },
};
```

### Trading Config (`.env`)

```env
PK=your_private_key_here
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase
FUNDER=0x...
```

## CSV Output

### Format (22 columns)

```csv
server_time_ms,market_time,sec_to_market,slug,accepting_orders_timestamp,
order_index,side,price,size,expiration_buffer,
latency_ms,status,order_id,
attempt,total_attempts,success_count,first_success_attempt,
min_ms,max_ms,avg_ms,median_ms,source
```

**New columns vs test-latency-cpp:**
- `order_index` (0-9): Which of the 10 orders
- `expiration_buffer`: Seconds before market start

**Example:**
```csv
1734567890123,1734568800,900,btc-updown-15m-1734568800,1734567880,
0,UP,0.48,7,540,
285,success,0x855ce0...,
42,100,1,42,
250,350,285,280,cpp
```

### Analysis

```bash
# Count successful orders per market
grep btc-updown-15m-1734568800 updown-bot.csv | grep success | wc -l

# Average latency for price 0.44
grep ",0.44," updown-bot.csv | awk -F, '{sum+=$21; n++} END {print sum/n}'

# Success rate by price level
for price in 0.48 0.47 0.46 0.45 0.44; do
  echo "Price $price:"
  grep ",$price," updown-bot.csv | awk -F, '{if($12=="success") s++; t++} END {print s"/"t" ("int(s/t*100)"%)"}'
done
```

## Performance

### Expected Metrics

| Metric | Value | Note |
|--------|-------|------|
| **Avg Latency** | ~285ms | vs 350ms in bot-polling.ts |
| **Min Latency** | ~250ms | TLS warmup + network |
| **First Success** | <50 attempts | vs ~100 in bot-polling.ts |
| **Success Rate** | 70-90% | 7-9 out of 10 orders fill |
| **Spam Time** | 0.5-2 seconds | All 10 processes parallel |

### Real Example

```
==========================================================
RESULTS:
==========================================================
  Total time: 1.2s
  Processes: 10
  [0] UP @ 0.48: SUCCESS (270ms avg)
  [1] DOWN @ 0.48: SUCCESS (275ms avg)
  [2] UP @ 0.47: FAILED (290ms avg)
  [3] DOWN @ 0.47: SUCCESS (280ms avg)
  [4] UP @ 0.46: SUCCESS (285ms avg)
  [5] DOWN @ 0.46: SUCCESS (282ms avg)
  [6] UP @ 0.45: SUCCESS (278ms avg)
  [7] DOWN @ 0.45: SUCCESS (288ms avg)
  [8] UP @ 0.44: SUCCESS (295ms avg)
  [9] DOWN @ 0.44: FAILED (300ms avg)
  Success rate: 8/10 (80%)
Results written to: updown-bot.csv
==========================================================
```

## Comparison: bot-polling.ts vs updown-bot-cpp

| Aspect | bot-polling.ts | updown-bot-cpp |
|--------|----------------|----------------|
| **Language** | TypeScript only | TypeScript + C++ |
| **HTTP Client** | @polymarket/clob-client | libcurl (native) |
| **Avg Latency** | ~350ms | ~285ms (18% faster) |
| **Max Attempts** | 2000 per order | 500 per order |
| **Parallelism** | 20 concurrent requests | 10 parallel processes |
| **CSV Logging** | No | Yes (22 columns) |
| **Complexity** | Low | Medium |
| **Dependencies** | npm only | g++, libcurl, OpenSSL |
| **Windows** | ✅ Works | ❌ Needs WSL/MSVC |
| **Best For** | Production reliability | Maximum speed |

**Recommendation:**
- Use **bot-polling.ts** for stable 24/7 operation
- Use **updown-bot-cpp** when latency is critical (competitive markets)

## Troubleshooting

### Build Errors

#### `g++: command not found`

```bash
sudo apt-get install -y build-essential
```

#### `fatal error: curl/curl.h: No such file or directory`

```bash
sudo apt-get install -y libcurl4-openssl-dev libssl-dev
```

#### Windows Build

C++ build requires Linux environment:

**Option 1: WSL (Recommended)**
```bash
wsl --install Ubuntu-24.04
# Inside WSL:
npm run build:updown-bot
```

**Option 2: Use bot-polling.ts**
```bash
npm run bot-polling btc-updown-15m-TIMESTAMP
```

### Runtime Errors

#### `ERROR: C++ binary not found`

```bash
# Build the binary first
npm run build:updown-bot

# Verify it exists
ls dist/updown-bot-cpp
```

#### `ERROR: Invalid trading config`

Check `.env` file has all required fields:
```env
PK=...
CLOB_API_KEY=...
CLOB_SECRET=...
CLOB_PASS_PHRASE=...
```

#### `ERROR: Polling timeout (20 min)`

Market slug might be incorrect or market doesn't exist yet:
```bash
# Check slug format (must end with timestamp)
npm run updown-bot btc-updown-15m-1765343700
#                   ^pattern^        ^timestamp^

# Find next market time (every 15 minutes)
date -d @1765343700  # Should be future time
```

#### `All orders FAILED`

Possible causes:
1. **Orderbook not open yet**: Wait until `accepting_orders_timestamp`
2. **Low balance**: Check USDC balance on Polymarket
3. **API rate limit**: Wait 1 minute and retry

### Performance Issues

#### `Latency > 500ms`

Your location might be far from Polymarket servers (US East Coast):
- **US/Canada**: 250-300ms expected
- **Europe**: 400-500ms expected
- **Asia/Australia**: 600-800ms expected

**Solution**: Use VPS closer to servers (e.g., AWS us-east-1)

#### `Success rate < 50%`

1. **Check expiration times**: Ensure orders don't expire too early
2. **Increase MAX_ATTEMPTS**: Edit `src/config.ts` CPP_MODE.MAX_ATTEMPTS_PER_ORDER
3. **Reduce DELAY_BEFORE_SPAM_MS**: Start spam earlier (but risks orderbook not ready)

## Development

### File Structure

```
src/updown-bot-cpp/
├── updown-bot-cpp.ts    # TypeScript wrapper (main bot logic)
├── updown-bot.cpp       # C++ HTTP spammer (single order)
└── README.md            # This file

build-updown-bot.sh      # Build script
dist/updown-bot-cpp      # Compiled C++ binary (after build)
updown-bot.csv           # CSV output log
```

### Code Flow

1. **main()** - Parse CLI args, continuous loop
2. **runMarket()** - Process single market
3. **fetchMarketBySlug()** - Poll Gamma API
4. **preSignOrders()** - Create 10 signed orders (EIP-712)
5. **spamAllOrders()** - Spawn 10 C++ processes
6. **spawnCppSpammer()** - Single process for one order
7. **C++ binary** - HTTP spam loop (500 attempts @ 1ms)
8. **writeOrderResult()** - Log to CSV

### Modifying Ladder Strategy

Edit `src/config.ts`:

```typescript
ORDER_CONFIG: [
  // Add more price levels
  { price: 0.49, size: 5,  expirationBuffer: 900 },  // 16min before
  { price: 0.48, size: 7,  expirationBuffer: 540 },
  // ...
],
```

**Note**: 10 orders hardcoded in code. To change:
1. Update `ORDER_CONFIG` array
2. Update TypeScript wrapper (no code changes needed - reads array length)
3. Rebuild: `npm run build:updown-bot`

### Testing

```bash
# Test next market
npm run updown-bot btc-updown-15m-$(date -d '+15 minutes' +%s)

# Test past market (for testing only - will timeout on orderbook)
npm run updown-bot btc-updown-15m-1700000000
```

## Future Enhancements

- [ ] Multi-asset support (ETH, SOL, XRP updown markets)
- [ ] Dynamic pricing (adjust based on order book)
- [ ] Fill monitoring (WebSocket RTDS subscription)
- [ ] Telegram notifications
- [ ] Windows native build (MSVC)
- [ ] macOS build (Clang)
- [ ] Single C++ process with multi-threading (advanced optimization)

## License

MIT - Same as parent project

## Support

See main project README: [Tuda_Suda_49](../../README.md)
