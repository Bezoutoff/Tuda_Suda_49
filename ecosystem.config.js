/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js                    # Start all bots
 *   pm2 start ecosystem.config.js --only updown-cpp  # Start only updown-bot-cpp
 *   pm2 logs updown-cpp                              # View logs
 *   pm2 stop updown-cpp                              # Stop bot
 *   pm2 restart updown-cpp                           # Restart bot
 *   pm2 delete updown-cpp                            # Delete from PM2
 */

module.exports = {
  apps: [
    {
      name: 'updown-btc',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-bot-cpp/updown-bot-cpp.ts btc-updown-15m-AUTO',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-btc-error.log',
      out_file: './logs/updown-btc-out.log',
      log_file: './logs/updown-btc-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'updown-eth',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-bot-cpp/updown-bot-cpp.ts eth-updown-15m-AUTO',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-eth-error.log',
      out_file: './logs/updown-eth-out.log',
      log_file: './logs/updown-eth-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'updown-sol',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-bot-cpp/updown-bot-cpp.ts sol-updown-15m-AUTO',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-sol-error.log',
      out_file: './logs/updown-sol-out.log',
      log_file: './logs/updown-sol-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'updown-xrp',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-bot-cpp/updown-bot-cpp.ts xrp-updown-15m-AUTO',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-xrp-error.log',
      out_file: './logs/updown-xrp-out.log',
      log_file: './logs/updown-xrp-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'updown-polling',
      script: 'ts-node',
      args: 'src/bot-polling.ts',
      cwd: '/root/Tuda_Suda_49',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/bot-polling-error.log',
      out_file: './logs/bot-polling-out.log',
      log_file: './logs/bot-polling-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'updown-ws',
      script: 'ts-node',
      args: 'src/bot.ts',
      cwd: '/root/Tuda_Suda_49',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/bot-ws-error.log',
      out_file: './logs/bot-ws-out.log',
      log_file: './logs/bot-ws-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'telegram-bot',
      script: './node_modules/.bin/ts-node',
      args: 'src/telegram-bot/telegram-bot.ts',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/telegram-bot-error.log',
      out_file: './logs/telegram-bot-out.log',
      log_file: './logs/telegram-bot-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    {
      name: 'auto-sell-bot',
      script: './node_modules/.bin/ts-node',
      args: 'src/auto-sell-bot.ts',
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/auto-sell-bot-error.log',
      out_file: './logs/auto-sell-bot-out.log',
      log_file: './logs/auto-sell-bot-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // NOTE: updown-btc-49 requires timestamp argument. Do NOT start via ecosystem config.
    // Start manually with: pm2 start ./node_modules/.bin/ts-node --name updown-btc-49 -- src/updown-btc-49.ts btc-updown-15m-TIMESTAMP
    {
      name: 'updown-btc-49',
      script: './node_modules/.bin/ts-node',
      args: 'src/updown-btc-49.ts btc-updown-15m-1234567890',  // REPLACE with actual timestamp!
      cwd: '/root/Tuda_Suda_49',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-btc-49-error.log',
      out_file: './logs/updown-btc-49-out.log',
      log_file: './logs/updown-btc-49-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
