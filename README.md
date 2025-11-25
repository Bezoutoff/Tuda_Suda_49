# Tuda Suda 49

BTC Updown 15m Auto-Order Bot для Polymarket.

Автоматически ставит ордера **49¢ на YES** и **49¢ на NO** при появлении новых BTC updown 15m маркетов.

## Установка

```bash
npm install
cp .env.example .env
# Заполните .env своими credentials
```

## Запуск

```bash
npm start
```

## Как работает

1. Подключается к Polymarket WebSocket (RTDS)
2. Слушает события `market_created`
3. Фильтрует только `btc-updown-15m-*` маркеты
4. Извлекает timestamp начала из slug (например: `btc-updown-15m-1764054900`)
5. Ставит 2 GTD ордера (YES@49¢, NO@49¢)
6. GTD expiration = время начала торгов (ордера автоматически отменятся)

## Конфигурация

| Переменная | Описание |
|------------|----------|
| `PK` | Приватный ключ кошелька (64 символа без 0x) |
| `CLOB_API_KEY` | API ключ Polymarket |
| `CLOB_SECRET` | API секрет |
| `CLOB_PASS_PHRASE` | API passphrase |
| `FUNDER` | Адрес funder (опционально, для POLY_PROXY) |
| `BOT_ORDER_SIZE` | Размер ордера в USDC (по умолчанию: 10) |

## Логи

```
[25.11.2025, 12:00:00] [BTC-BOT] Starting BTC Updown Auto-Order Bot...
[25.11.2025, 12:00:00] [BTC-BOT] Order size: 10 USDC
[25.11.2025, 12:00:00] [BTC-BOT] Order price: 0.49 (49 cents)
[25.11.2025, 12:00:01] [BTC-BOT] Connected to Polymarket RTDS
[25.11.2025, 12:00:01] [BTC-BOT] Subscribed to market_created events
[25.11.2025, 12:00:01] [BTC-BOT] Waiting for new BTC updown markets...
[25.11.2025, 12:05:00] [BTC-BOT] New BTC updown market detected: btc-updown-15m-1764054900
[25.11.2025, 12:05:00] [BTC-BOT] Placing YES order: 10 @ 0.49...
[25.11.2025, 12:05:01] [BTC-BOT] YES order placed: 0x123...
[25.11.2025, 12:05:01] [BTC-BOT] Placing NO order: 10 @ 0.49...
[25.11.2025, 12:05:02] [BTC-BOT] NO order placed: 0x456...
[25.11.2025, 12:05:02] [BTC-BOT] Orders placed successfully
```

## Лицензия

MIT
