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
      name: 'updown-cpp',
      script: './start-updown-bot.sh',
      cwd: '/root/Tuda_Suda_49',
      interpreter: 'bash',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/updown-cpp-error.log',
      out_file: './logs/updown-cpp-out.log',
      log_file: './logs/updown-cpp-combined.log',
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
  ],
};
