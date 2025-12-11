# PM2 Quick Start - Запуск с конкретным timestamp

## Способ 1: Через переменную окружения (Рекомендуется для PM2)

```bash
# Запустить с конкретным timestamp
MARKET_TIMESTAMP=1765343700 pm2 start ecosystem.config.js --only updown-cpp

# Или добавить в env при старте
pm2 start ecosystem.config.js --only updown-cpp --env MARKET_TIMESTAMP=1765343700

# Или обновить уже запущенный процесс
pm2 restart updown-cpp --update-env MARKET_TIMESTAMP=1765343700
```

## Способ 2: Напрямую без ecosystem.config.js

```bash
# Запустить с конкретным timestamp
pm2 start ./start-updown-bot.sh --name updown-cpp -- 1765343700

# Пояснение:
# ./start-updown-bot.sh - скрипт
# --name updown-cpp - имя процесса в PM2
# -- - разделитель между PM2 аргументами и аргументами скрипта
# 1765343700 - timestamp маркета
```

## Способ 3: Прямой запуск ts-node

```bash
# Самый прямой способ
pm2 start ts-node --name updown-cpp -- src/updown-bot-cpp/updown-bot-cpp.ts btc-updown-15m-1765343700

# С полным путём
pm2 start ts-node --name updown-cpp --cwd /root/Tuda_Suda_49 \
  -- src/updown-bot-cpp/updown-bot-cpp.ts btc-updown-15m-1765343700
```

## Способ 4: Использовать вычисленный timestamp

```bash
# Получить следующий timestamp (кратный 900)
NEXT_TS=$(python3 -c "import time; t = int(time.time()); print(t + (900 - t % 900))")
echo "Next market: btc-updown-15m-$NEXT_TS at $(date -d @$NEXT_TS)"

# Запустить
pm2 start ./start-updown-bot.sh --name updown-cpp -- $NEXT_TS

# Или через env
MARKET_TIMESTAMP=$NEXT_TS pm2 start ecosystem.config.js --only updown-cpp
```

## Способ 5: Модифицировать ecosystem.config.js на лету

Создать временный конфиг:

```bash
cat > ecosystem.temp.js << EOF
module.exports = {
  apps: [{
    name: 'updown-cpp',
    script: './start-updown-bot.sh',
    args: '1765343700',  // ВАШ TIMESTAMP
    cwd: '/root/Tuda_Suda_49',
    interpreter: 'bash',
    autorestart: true,
    max_memory_restart: '500M',
    error_file: './logs/updown-cpp-error.log',
    out_file: './logs/updown-cpp-out.log',
    time: true,
  }],
};
EOF

pm2 start ecosystem.temp.js
```

## Примеры с реальными timestamp

```bash
# Маркет через 15 минут
MARKET_TIMESTAMP=$(date -d '+15 minutes' +%s | awk '{print $1 + (900 - $1 % 900)}') \
  pm2 start ecosystem.config.js --only updown-cpp

# Конкретное время (например, 12:00)
MARKET_TIMESTAMP=$(date -d '12:00' +%s) \
  pm2 start ecosystem.config.js --only updown-cpp

# Сегодня в 14:30
MARKET_TIMESTAMP=$(date -d 'today 14:30' +%s) \
  pm2 start ecosystem.config.js --only updown-cpp
```

## Проверка текущего timestamp

```bash
# Посмотреть переменные окружения процесса
pm2 env 0  # где 0 - ID процесса из pm2 list

# Или через show
pm2 show updown-cpp | grep -A5 "env:"

# Посмотреть первые логи
pm2 logs updown-cpp --lines 5 | grep "Market time"
```

## Изменение timestamp без остановки

```bash
# Удалить процесс
pm2 delete updown-cpp

# Запустить с новым timestamp
MARKET_TIMESTAMP=1765344600 pm2 start ecosystem.config.js --only updown-cpp

# Сохранить
pm2 save
```

## Автоматический запуск на следующий маркет

Создать helper script `start-next-market.sh`:

```bash
cat > start-next-market.sh << 'EOF'
#!/bin/bash
# Остановить текущий процесс
pm2 delete updown-cpp 2>/dev/null

# Вычислить следующий timestamp
NEXT=$(python3 -c "import time; t = int(time.time()); print(t + (900 - t % 900))")

echo "Starting updown-cpp for market at $(date -d @$NEXT '+%Y-%m-%d %H:%M:%S')"

# Запустить с новым timestamp
MARKET_TIMESTAMP=$NEXT pm2 start ecosystem.config.js --only updown-cpp

# Сохранить
pm2 save

# Показать статус
pm2 logs updown-cpp --lines 10
EOF

chmod +x start-next-market.sh
```

Использование:
```bash
./start-next-market.sh
```

## Запуск нескольких ботов для разных активов

```bash
# BTC
MARKET_TIMESTAMP=1765343700 pm2 start ecosystem.config.js --only updown-cpp --name updown-btc

# ETH (если добавить поддержку)
MARKET_TIMESTAMP=1765343700 pm2 start ./start-updown-bot.sh --name updown-eth \
  -- eth-updown-15m-1765343700

# Посмотреть все
pm2 list
```

## Удобный alias

Добавить в `~/.bashrc`:

```bash
# Запуск updown-cpp с автоматическим timestamp
alias pm2-updown='MARKET_TIMESTAMP=$(python3 -c "import time; t = int(time.time()); print(t + (900 - t % 900))") pm2 start ecosystem.config.js --only updown-cpp && pm2 save'

# Запуск updown-cpp с ручным timestamp
pm2-updown-at() {
  MARKET_TIMESTAMP=$1 pm2 start ecosystem.config.js --only updown-cpp && pm2 save
}

# Перезапуск на следующий маркет
alias pm2-updown-next='pm2 delete updown-cpp && pm2-updown'
```

Использование:
```bash
# Автоматический
pm2-updown

# С конкретным timestamp
pm2-updown-at 1765343700

# На следующий маркет
pm2-updown-next
```

Применить:
```bash
source ~/.bashrc
```

## Troubleshooting

### Переменная окружения не передаётся

```bash
# Проверить что переменная установлена
echo $MARKET_TIMESTAMP

# Запустить с debug
MARKET_TIMESTAMP=1765343700 bash -x ./start-updown-bot.sh
```

### PM2 не видит переменную

```bash
# Использовать --update-env
pm2 restart updown-cpp --update-env MARKET_TIMESTAMP=1765343700

# Или удалить и запустить заново
pm2 delete updown-cpp
MARKET_TIMESTAMP=1765343700 pm2 start ecosystem.config.js --only updown-cpp
```

### Бот запустился с неправильным timestamp

```bash
# Посмотреть первые логи
pm2 logs updown-cpp --lines 20 | grep "Market time"

# Проверить аргументы процесса
ps aux | grep updown-bot-cpp
```

## Рекомендация

**Для production (автоматический mode):**
```bash
pm2 start ecosystem.config.js --only updown-cpp
pm2 save
```

**Для тестирования (конкретный маркет):**
```bash
MARKET_TIMESTAMP=1765343700 pm2 start ecosystem.config.js --only updown-cpp
```

**Для быстрого перезапуска:**
```bash
./start-next-market.sh
```
