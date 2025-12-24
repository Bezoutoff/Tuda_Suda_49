/**
 * PM2 Ecosystem Configuration for Docker
 *
 * Differences from ecosystem.config.js:
 *   - Uses compiled JavaScript (dist/*.js) instead of ts-node for faster startup
 *   - Docker paths (cwd: /app instead of /root/Tuda_Suda_49)
 *   - Absolute paths for logs (/app/logs/)
 *   - NODE_ENV=production
 *
 * Usage (inside Docker container):
 *   pm2-runtime ecosystem.docker.config.js    # Foreground (Docker CMD)
 *   pm2 start ecosystem.docker.config.js      # Background
 *   pm2 logs updown-btc                       # View logs
 *   pm2 restart updown-btc                    # Restart bot
 */

module.exports = {
  apps: [
    // ========================================================================
    // BTC Updown 15m Bot
    // ========================================================================
    {
      name: 'updown-btc',
      script: 'src/updown-bot-cpp/updown-bot-cpp.ts',
      interpreter: './node_modules/.bin/ts-node',
      args: 'btc-updown-15m-AUTO',
      cwd: '/app',  // Docker working directory
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/updown-btc-error.log',
      out_file: '/app/logs/updown-btc-out.log',
      log_file: '/app/logs/updown-btc-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // ETH Updown 15m Bot
    // ========================================================================
    {
      name: 'updown-eth',
      script: 'src/updown-bot-cpp/updown-bot-cpp.ts',
      interpreter: './node_modules/.bin/ts-node',
      args: 'eth-updown-15m-AUTO',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/updown-eth-error.log',
      out_file: '/app/logs/updown-eth-out.log',
      log_file: '/app/logs/updown-eth-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // SOL Updown 15m Bot
    // ========================================================================
    {
      name: 'updown-sol',
      script: 'src/updown-bot-cpp/updown-bot-cpp.ts',
      interpreter: './node_modules/.bin/ts-node',
      args: 'sol-updown-15m-AUTO',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/updown-sol-error.log',
      out_file: '/app/logs/updown-sol-out.log',
      log_file: '/app/logs/updown-sol-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // XRP Updown 15m Bot
    // ========================================================================
    {
      name: 'updown-xrp',
      script: 'src/updown-bot-cpp/updown-bot-cpp.ts',
      interpreter: './node_modules/.bin/ts-node',
      args: 'xrp-updown-15m-AUTO',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/updown-xrp-error.log',
      out_file: '/app/logs/updown-xrp-out.log',
      log_file: '/app/logs/updown-xrp-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // Polling Bot (Alternative to WebSocket)
    // ========================================================================
    {
      name: 'updown-polling',
      script: 'src/bot-polling.ts',
      interpreter: './node_modules/.bin/ts-node',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/bot-polling-error.log',
      out_file: '/app/logs/bot-polling-out.log',
      log_file: '/app/logs/bot-polling-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // WebSocket Bot (Original)
    // ========================================================================
    {
      name: 'updown-ws',
      script: 'src/bot.ts',
      interpreter: './node_modules/.bin/ts-node',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/bot-ws-error.log',
      out_file: '/app/logs/bot-ws-out.log',
      log_file: '/app/logs/bot-ws-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // Telegram Bot (Monitoring and Notifications)
    // ========================================================================
    {
      name: 'telegram-bot',
      script: 'src/telegram-bot/telegram-bot.ts',
      interpreter: './node_modules/.bin/ts-node',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/telegram-bot-error.log',
      out_file: '/app/logs/telegram-bot-out.log',
      log_file: '/app/logs/telegram-bot-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // Auto-Sell Bot (Instant Position Liquidation)
    // ========================================================================
    {
      name: 'auto-sell-bot',
      script: 'src/auto-sell-bot.ts',
      interpreter: './node_modules/.bin/ts-node',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/auto-sell-bot-error.log',
      out_file: '/app/logs/auto-sell-bot-out.log',
      log_file: '/app/logs/auto-sell-bot-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ========================================================================
    // Multi-Crypto Updown 49 Bot (BTC, ETH, SOL, XRP - MANUAL MODE ONLY)
    // NOTE: This bot requires timestamp argument. Do NOT use ecosystem config.
    // Start manually with: pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49 -- /app/src/updown-bot-49.ts updown-15m-TIMESTAMP
    // ========================================================================
    {
      name: 'updown-bot-49',
      script: 'src/updown-bot-49.ts',
      interpreter: '/app/node_modules/.bin/ts-node',
      args: 'updown-15m-1234567890',  // REPLACE with actual timestamp!
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',  // Increased for 4 cryptos
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/app/logs/updown-bot-49-error.log',
      out_file: '/app/logs/updown-bot-49-out.log',
      log_file: '/app/logs/updown-bot-49-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
