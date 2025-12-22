# Tuda Suda 49 - Docker Deployment Guide

**One-Click Deployment** для Polymarket Trading Bot с Docker и docker compose.

## Quick Start

Запуск бота на новом VPS за **3 команды** (5 минут):

```bash
# 1. Clone repository
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in: PK, CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE, FUNDER

# 3. Start
docker compose up -d
```

**Готово!** Бот запущен и работает.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Building and Running](#building-and-running)
- [Monitoring](#monitoring)
- [Updating](#updating)
- [Stopping and Restarting](#stopping-and-restarting)
- [Troubleshooting](#troubleshooting)
- [Migration from Systemd](#migration-from-systemd)
- [Architecture](#architecture)
- [Advanced Configuration](#advanced-configuration)

---

## Prerequisites

### Required Software

- **Docker Engine** 20.10+ ([Install Docker](https://docs.docker.com/engine/install/))
- **Docker Compose** 2.0+ (обычно включен с Docker)
- **Git** (для клонирования репозитория)

### System Requirements

- **OS**: Ubuntu 20.04+, Debian 11+, или любой Linux с Docker
- **RAM**: Минимум 1GB (рекомендуется 2GB+)
- **Disk**: 5GB свободного места
- **Network**: Доступ к интернету (Polymarket APIs)

### Verify Installation

```bash
docker --version        # Should show 20.10+
docker compose --version  # Should show 2.0+
```

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49
```

### 2. Configure Environment

Создайте `.env` файл из template:

```bash
cp .env.example .env
nano .env  # Or vim, code, etc.
```

**Required Variables:**

```env
# Wallet private key (64 hex characters WITHOUT 0x prefix)
PK=your_private_key_here

# Polymarket CLOB API credentials
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase

# Funder address (0x...)
FUNDER=0x...

# Bot settings
BOT_ORDER_SIZE=10

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_ID=123456789
```

**Security:** Никогда не коммитьте `.env` файл в git!

### 3. Build and Start

```bash
docker compose up -d
```

Первый build займет 5-10 минут (компиляция TypeScript и C++).

### 4. Verify

```bash
# Check containers are running
docker compose ps

# View logs
docker compose logs -f
```

You should see:
- `tuda-suda-trading` - **healthy** (PM2 running trading bots)
- `tuda-suda-redemption` - **running** (redemption scheduler waiting 5 min)

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PK` | ✅ | Wallet private key (64 hex chars, NO 0x prefix) |
| `CLOB_API_KEY` | ✅ | Polymarket CLOB API key |
| `CLOB_SECRET` | ✅ | Polymarket CLOB API secret |
| `CLOB_PASS_PHRASE` | ✅ | Polymarket CLOB API passphrase |
| `FUNDER` | ✅ | Funder address (0x...) |
| `BOT_ORDER_SIZE` | ⚠️ | Order size in USDC (default: 10) |
| `TELEGRAM_BOT_TOKEN` | ⚪ | Telegram bot token (optional) |
| `TELEGRAM_ADMIN_ID` | ⚪ | Telegram admin user ID (optional) |

### Build Arguments

Modify `docker compose.yml` to customize build:

```yaml
services:
  trading-bot:
    build:
      args:
        BUILD_CPP: "false"  # Skip C++ compilation (faster build, no C++ bots)
```

**Options:**
- `BUILD_CPP: "true"` - Compile C++ components (default, ~2min extra)
- `BUILD_CPP: "false"` - Skip C++ (faster build, TypeScript bots only)

---

## Building and Running

### First Run

```bash
# Build images and start containers
docker compose up -d

# View build logs (if needed)
docker compose build --progress=plain
```

### Rebuild After Code Changes

```bash
# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Start Without Building

```bash
# Start existing containers
docker compose start
```

---

## Monitoring

### View Logs

```bash
# All services
docker compose logs -f

# Trading bot only
docker compose logs -f trading-bot

# Redemption scheduler only
docker compose logs -f redemption-scheduler

# Last 100 lines
docker compose logs --tail=100
```

### PM2 Process Monitor (Inside Container)

```bash
# List all PM2 processes
docker exec tuda-suda-trading pm2 list

# View specific bot logs
docker exec tuda-suda-trading pm2 logs updown-btc

# Monitor in real-time
docker exec tuda-suda-trading pm2 monit

# Process details
docker exec tuda-suda-trading pm2 describe updown-btc
```

### Container Status

```bash
# Check health status
docker compose ps

# Detailed container info
docker inspect tuda-suda-trading

# Resource usage
docker stats
```

### Application Logs (CSV)

Logs are stored in `./logs/` directory on the host:

```bash
# Redemption history
tail -f logs/redemption.csv

# Latency tests
tail -f logs/latency.csv

# PM2 logs
ls -lh logs/
```

---

## Updating

### Update Code from GitHub

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild containers
docker compose down
docker compose build --no-cache
docker compose up -d

# 3. Verify
docker compose ps
docker compose logs -f
```

### Update Docker Images (Base OS/Node.js/Python)

```bash
# Pull latest base images
docker compose build --no-cache --pull

# Restart
docker compose down && docker compose up -d
```

---

## Stopping and Restarting

### Stop All Services

```bash
# Stop containers (logs preserved)
docker compose stop

# Stop and remove containers (logs still preserved in ./logs/)
docker compose down
```

### Start All Services

```bash
docker compose start
```

### Restart Specific Service

```bash
# Restart trading bot
docker compose restart trading-bot

# Restart redemption scheduler
docker compose restart redemption-scheduler
```

### Restart Individual Bot (PM2)

```bash
# Restart specific PM2 process
docker exec tuda-suda-trading pm2 restart updown-btc

# Restart all PM2 processes
docker exec tuda-suda-trading pm2 restart all
```

### Complete Cleanup

```bash
# Remove containers and images (CAREFUL: will delete everything!)
docker compose down
docker rmi tuda_suda_49-trading-bot tuda_suda_49-redemption-scheduler

# Logs are preserved in ./logs/ unless manually deleted
```

---

## Troubleshooting

### Container Fails to Start

**Check logs:**
```bash
docker compose logs trading-bot
```

**Common issues:**

1. **Missing .env variables**
   ```
   ERROR: Required environment variable PK is not set
   ```
   **Fix:** Ensure all required variables are in `.env` file

2. **Port conflicts**
   - Docker doesn't expose ports (no HTTP), so this shouldn't happen
   - If using custom configuration, check `docker compose ps`

3. **Insufficient memory**
   ```bash
   docker stats  # Check memory usage
   ```
   **Fix:** Increase RAM or reduce bot instances in `ecosystem.config.js`

### PM2 Processes Not Starting

**Enter container and debug:**
```bash
docker exec -it tuda-suda-trading bash

# Check PM2 status
pm2 list

# Start manually to see errors
pm2 start ecosystem.config.js --only updown-btc
pm2 logs updown-btc
```

### Redemption Bot Not Running

**Check scheduler logs:**
```bash
docker compose logs redemption-scheduler
```

**Verify Python dependencies:**
```bash
docker exec tuda-suda-redemption /opt/venv/bin/python3 -c "import py_clob_client; print('OK')"
```

**Run manually:**
```bash
docker exec tuda-suda-redemption /opt/venv/bin/python3 /app/scripts/redemption/main.py
```

### Build Fails

**Clear Docker cache:**
```bash
docker compose build --no-cache --pull
```

**Check disk space:**
```bash
df -h
docker system df  # Docker-specific usage
```

**Prune unused Docker data:**
```bash
docker system prune -a  # CAREFUL: removes all unused images!
```

### Logs Not Appearing

**Verify volume mount:**
```bash
docker inspect tuda-suda-trading | grep Mounts -A 10
```

**Check permissions:**
```bash
ls -ld logs/
# Should be writable (755 or 777)
```

**Force log rotation:**
```bash
docker exec tuda-suda-trading pm2 flush
```

---

## Migration from Systemd

Если вы уже запускали бота через systemd (без Docker), следуйте этим шагам для миграции:

### 1. Stop Existing Services

```bash
# Stop systemd timer
sudo systemctl stop redemption-bot.timer
sudo systemctl disable redemption-bot.timer

# Stop PM2 processes
pm2 stop all
pm2 save
```

### 2. Backup Current State

```bash
# Backup logs
cp -r logs/ logs.backup-$(date +%Y%m%d)/

# Backup .env
cp .env .env.backup
```

### 3. Pull Docker Configuration

```bash
git pull origin main
```

### 4. Start Docker

```bash
docker compose up -d
```

### 5. Verify Migration

```bash
# Check logs are accessible
ls -lh logs/

# Verify redemption.csv history is preserved
tail -20 logs/redemption.csv

# Check Docker logs
docker compose logs -f
```

### 6. Remove Old Services (Optional)

```bash
# Disable systemd timer permanently
sudo systemctl disable redemption-bot.timer

# Remove PM2 from startup
pm2 unstartup

# Delete PM2 processes
pm2 delete all
```

### Rollback (If Needed)

```bash
# Stop Docker
docker compose down

# Restore PM2
pm2 resurrect

# Restart systemd timer
sudo systemctl start redemption-bot.timer
```

---

## Architecture

### Docker Services

```
┌─────────────────────────────────────────────────────────┐
│                Docker Compose                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────┐  ┌──────────────────────┐     │
│  │ trading-bot         │  │ redemption-scheduler │     │
│  │ (PM2)               │  │ (Python Loop)        │     │
│  ├─────────────────────┤  ├──────────────────────┤     │
│  │ - updown-btc        │  │ Runs every 60 min    │     │
│  │ - updown-eth        │  │ (after 5 min delay)  │     │
│  │ - updown-sol        │  │                      │     │
│  │ - updown-xrp        │  │ Logs to stdout       │     │
│  │ - telegram-bot      │  │ → docker logs        │     │
│  │                     │  │                      │     │
│  │ Logs: /app/logs/    │  │ Logs: /app/logs/     │     │
│  └─────────────────────┘  └──────────────────────┘     │
│         │                         │                    │
│         └─────────┬───────────────┘                    │
│                   │                                    │
│         ┌─────────▼──────────┐                         │
│         │  Shared Volumes    │                         │
│         │  - ./logs          │                         │
│         │  - ./.env (ro)     │                         │
│         └────────────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

### Multi-Stage Dockerfile

```
Stage 1: cpp-builder (Ubuntu 23.04)
   ├─ Install: build-essential, libcurl, libssl
   ├─ Compile: build-cpp.sh, build-updown-bot.sh
   └─ Output: dist/updown-bot-cpp, dist/test-latency-cpp

Stage 2: node-builder (Node 18 Alpine)
   ├─ Install: npm dependencies
   ├─ Compile: TypeScript → JavaScript
   └─ Output: dist/*.js, node_modules/

Stage 3: final (Node 18 Debian Slim)
   ├─ Install: Python 3.10 + venv
   ├─ Copy: artifacts from stages 1 & 2
   ├─ Install: PM2 globally
   └─ Entrypoint: docker-entrypoint.sh
      └─ CMD: pm2-runtime ecosystem.config.js
```

**Final Image Size:** ~800MB (Node.js 600MB + Python 200MB)

---

## Advanced Configuration

### Customize PM2 Ecosystem

Edit `ecosystem.config.js` to:
- Enable/disable specific bots
- Adjust memory limits
- Change log file paths
- Configure clustering (if supported)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'updown-btc',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-bot-cpp/updown-bot-cpp.ts btc-updown-15m-AUTO',
      instances: 1,  // Change to 'max' for clustering
      max_memory_restart: '500M',  // Adjust memory limit
      // ...
    },
    // Add or remove bots as needed
  ],
};
```

After editing, rebuild:
```bash
docker compose build --no-cache
docker compose up -d
```

### Change Redemption Schedule

Edit `docker-redemption-scheduler.sh`:

```bash
# Change from 60 minutes to 30 minutes
BASE_WAIT=1800  # 30 * 60 = 1800 seconds

# Change random delay from 5min to 2min
RANDOM_DELAY=$((RANDOM % 120))  # 0-120 seconds
```

After editing, rebuild:
```bash
docker compose build --no-cache
docker compose restart redemption-scheduler
```

### Skip C++ Compilation

Faster builds without C++ components:

```yaml
# docker compose.yml
services:
  trading-bot:
    build:
      args:
        BUILD_CPP: "false"
```

Rebuild:
```bash
docker compose build --no-cache
docker compose up -d
```

### Custom Docker Network

If you need containers to communicate with other services:

```yaml
# docker compose.yml
networks:
  tuda-suda-network:
    external: true  # Use existing network
    name: my-custom-network
```

### Health Check Customization

```yaml
# docker compose.yml
services:
  trading-bot:
    healthcheck:
      test: ["CMD-SHELL", "pm2 list | grep online || exit 1"]
      interval: 60s  # Check every minute
      timeout: 15s
      retries: 5
```

---

## Support

### Getting Help

1. **Check logs first:**
   ```bash
   docker compose logs -f
   ```

2. **Search GitHub Issues:**
   https://github.com/Bezoutoff/Tuda_Suda_49/issues

3. **Create new issue:**
   Include:
   - Docker version (`docker --version`)
   - Error logs (`docker compose logs`)
   - Steps to reproduce

### Useful Commands Reference

```bash
# Build
docker compose build              # Build images
docker compose build --no-cache   # Build from scratch

# Run
docker compose up -d              # Start in background
docker compose up                 # Start with logs

# Stop
docker compose stop               # Stop containers
docker compose down               # Stop and remove

# Logs
docker compose logs -f            # Follow logs
docker compose logs --tail=100    # Last 100 lines

# Status
docker compose ps                 # Container status
docker stats                      # Resource usage

# Shell
docker exec -it tuda-suda-trading bash      # Trading bot shell
docker exec -it tuda-suda-redemption bash   # Redemption shell

# PM2
docker exec tuda-suda-trading pm2 list      # PM2 status
docker exec tuda-suda-trading pm2 logs      # PM2 logs
docker exec tuda-suda-trading pm2 restart all  # Restart all bots

# Cleanup
docker system prune -a            # Remove unused data
docker compose down --volumes     # Remove containers + volumes
```

---

## License

MIT - See [LICENSE](LICENSE) file for details.

## Author

**Bezoutoff** - [GitHub](https://github.com/Bezoutoff)

---

**Happy Trading! 📈**
