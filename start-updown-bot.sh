#!/bin/bash
# PM2 Wrapper для UpDownBot C++
# Автоматически определяет следующий маркет timestamp

# Функция для вычисления следующего timestamp (кратного 900)
get_next_market() {
  local now=$(date +%s)
  local remainder=$((now % 900))
  local next=$((now + 900 - remainder))
  echo $next
}

# Приоритеты:
# 1. Переменная окружения MARKET_TIMESTAMP (для PM2)
# 2. Аргумент командной строки $1
# 3. Автоматическое вычисление
if [ -n "$MARKET_TIMESTAMP" ]; then
  TIMESTAMP=$MARKET_TIMESTAMP
elif [ -n "$1" ]; then
  TIMESTAMP=$1
else
  TIMESTAMP=$(get_next_market)
fi

SLUG="btc-updown-15m-${TIMESTAMP}"

echo "================================================"
echo "Starting UpDownBot C++ via PM2"
echo "Slug: $SLUG"
echo "Market time: $(date -d @$TIMESTAMP '+%Y-%m-%d %H:%M:%S')"
echo "================================================"

# Найти ts-node (попробовать разные пути)
if command -v ts-node >/dev/null 2>&1; then
  TS_NODE="ts-node"
elif [ -f "./node_modules/.bin/ts-node" ]; then
  TS_NODE="./node_modules/.bin/ts-node"
elif command -v npx >/dev/null 2>&1; then
  TS_NODE="npx ts-node"
else
  echo "ERROR: ts-node not found. Install it: npm install -g ts-node"
  exit 1
fi

echo "Using: $TS_NODE"

# Запуск бота
exec $TS_NODE src/updown-bot-cpp/updown-bot-cpp.ts "$SLUG"
