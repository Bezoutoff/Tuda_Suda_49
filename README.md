# Tuda Suda 49

Updown 15m Auto-Order Bot для Polymarket.

Автоматически ставит **10 ордеров** (5 цен × 2 стороны) при появлении новых updown 15m маркетов (BTC, ETH, SOL, XRP).

## Стратегия

| Цена | Экспирация | Сторона |
|------|------------|---------|
| 0.49 | за 10 мин до старта | UP + DOWN |
| 0.48 | за 6 мин до старта | UP + DOWN |
| 0.47 | за 2 мин до старта | UP + DOWN |
| 0.46 | за 30 сек до старта | UP + DOWN |
| 0.45 | за 1 сек до старта | UP + DOWN |

## Установка

```bash
npm install
cp .env.example .env
# Заполните .env своими credentials
```

## Генерация API ключей

```bash
npx ts-node src/create-api-key.ts YOUR_PRIVATE_KEY
```

## Запуск

```bash
# Polling бот (рекомендуется)
npm run bot-polling btc-updown-15m-1764165600

# Или скомпилированная версия (быстрее)
npm run build
npm run bot-fast btc-updown-15m-1764165600
```

### PM2 (для VPS)

```bash
pm2 start "node dist/bot-polling.js btc-updown-15m-1764165600" --name "updown-bot"
pm2 logs updown-bot
```

## Как работает

1. Вычисляет slug: `btc-updown-15m-{timestamp}`
2. Спамит Gamma API пока не получит token IDs
3. Ждёт `DELAY_BEFORE_SPAM_MS` (маркет активируется ~25 сек после создания)
4. **Pre-sign**: подписывает ордер один раз (EIP-712)
5. **Spam**: отправляет `postOrders()` каждые N мс пока не пройдёт
6. `timestamp += 900`, переходит к следующему маркету

## Конфигурация (.env)

| Переменная | Описание |
|------------|----------|
| `PK` | Приватный ключ кошелька (64 символа без 0x) |
| `CLOB_API_KEY` | API ключ Polymarket |
| `CLOB_SECRET` | API секрет |
| `CLOB_PASS_PHRASE` | API passphrase |
| `FUNDER` | Адрес funder (для POLY_PROXY) |
| `BOT_ORDER_SIZE` | Размер ордера в USDC (по умолчанию: 5) |

## Конфигурация (src/config.ts)

| Параметр | Описание | Default |
|----------|----------|---------|
| `ORDER_CONFIG` | Массив {price, expirationBuffer} | 5 цен |
| `POLL_INTERVAL_MS` | Интервал polling Gamma API | 250ms |
| `DELAY_BEFORE_SPAM_MS` | Задержка после получения token IDs | 19s |
| `MAX_ORDER_ATTEMPTS` | Максимум попыток | 5000 |
| `PARALLEL_SPAM_REQUESTS` | Кол-во параллельных HTTP запросов на ордер | 20 |

## Troubleshooting

### 401 Unauthorized / Invalid API key

**Проблема**: Ошибка `401 Unauthorized` или `Invalid api key` при отправке ордеров.

**Причина**: Рассинхронизация времени между VPS и серверами Polymarket. В заголовке `POLY_TIMESTAMP` отправляется локальное время, и если оно отличается — сервер отклоняет запрос.

**Решение**: В `trading-service.ts` добавлен параметр `useServerTime: true` при инициализации ClobClient:

```typescript
this.client = new ClobClient(
  this.config.clobApiUrl,
  this.config.chainId,
  this.wallet,
  creds,
  this.config.signatureType,
  this.funder,
  undefined,  // baseUrl (deprecated)
  true        // useServerTime - использовать время сервера
);
```

Это заставляет клиент использовать время сервера Polymarket вместо локального.

### Перегенерация API ключей

Если нужно пересоздать API ключи:

```bash
# Получить текущие ключи
npx ts-node -e "const { ethers } = require('ethers'); const { ClobClient } = require('@polymarket/clob-client'); async function main() { const wallet = new ethers.Wallet('0xYOUR_PK'); const client = new ClobClient('https://clob.polymarket.com', 137, wallet); const keys = await client.getApiKeys(); console.log(keys); } main();"

# Удалить текущий ключ
npx ts-node -e "const { ethers } = require('ethers'); const { ClobClient } = require('@polymarket/clob-client'); async function main() { const wallet = new ethers.Wallet('0xYOUR_PK'); const creds = { key: 'YOUR_KEY', secret: 'YOUR_SECRET', passphrase: 'YOUR_PASSPHRASE' }; const client = new ClobClient('https://clob.polymarket.com', 137, wallet, creds); await client.deleteApiKey(); console.log('Deleted'); } main();"

# Создать новый
npx ts-node src/create-api-key.ts YOUR_PRIVATE_KEY
```

**Важно**: API ключи детерминистично генерируются из приватного ключа — для одного кошелька всегда одинаковые.

### Медленный спам ордеров (мало попыток за N секунд)

**Проблема**: Бот делает только ~21 попытку за 6 секунд, хотя `ORDER_RETRY_INTERVAL_MS: 1`.

**Причина**: HTTP latency, а не интервал между попытками. Каждый `postSignedOrder()` занимает ~285ms:

```
HTTP запрос postOrders():
├─ 1. DNS резолв:           ~1ms   (кэшируется)
├─ 2. TCP handshake:        ~5ms   (RTT до сервера)
├─ 3. TLS handshake:        ~5ms   (уже есть сессия)
├─ 4. СЕРВЕР ОБРАБОТКА:   ~250ms   ← главный bottleneck!
│     ├─ Валидация подписи
│     ├─ Проверка баланса
│     ├─ Проверка allowance
│     ├─ Matching engine
│     └─ Запись в БД
├─ 5. Ответ сервера:       ~20ms
└─ ИТОГО:                 ~285ms
```

**Решение**: Параллельные запросы. Вместо последовательного спама, отправляем 60 запросов одновременно через `Promise.all()`:

```typescript
// config.ts
PARALLEL_SPAM_REQUESTS: 60,  // 60 параллельных запросов

// Результат:
// - 60 запросов за ~285ms = ~210 req/s
// - 6 секунд спама = ~1260 попыток вместо 21
```

**Rate limits** (Polymarket CLOB API):
- `POST /order`: 2400 requests / 10s = **240 req/s**
- При 60 параллельных запросах получаем ~210 req/s — безопасно под лимитом

## Оптимизации

- **Parallel spam**: 20 параллельных HTTP запросов на каждый из 10 ордеров (~200 req/s)
- **Pre-sign**: подпись ордера один раз (EIP-712), спам только HTTP запросов
- **useServerTime**: использование времени сервера для аутентификации
- **Скомпилированный JS**: `npm run build` + `npm run bot-fast` (~30MB вместо 100MB)

## Архитектура: Как отправляется подписанный ордер

```
┌─────────────────────────────────────────────────────────────────┐
│                     ЭТАП 1: ПОДПИСЬ (локально)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  createSignedOrder()                                            │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  client.createOrder({                                    │   │
│  │    tokenID: "12345...",   // ID токена (YES/NO)         │   │
│  │    price: 0.49,           // Цена                       │   │
│  │    side: Side.BUY,        // BUY или SELL               │   │
│  │    size: 5,               // Размер в USDC              │   │
│  │    expiration: 1764677640 // Unix timestamp             │   │
│  │  })                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  EIP-712 Typed Data Signature                           │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Wallet.signTypedData(domain, types, order)             │   │
│  │                                                          │   │
│  │  Подписывает структуру ордера приватным ключом          │   │
│  │  Результат: signedOrder с полем "signature"             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ЭТАП 2: ОТПРАВКА (HTTP POST)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  postSignedOrder(signedOrder)                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HTTP POST https://clob.polymarket.com/order            │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Headers:                                                │   │
│  │    POLY_ADDRESS: 0x77cA26...     (адрес кошелька)       │   │
│  │    POLY_SIGNATURE: 0xabc123...   (подпись L1)           │   │
│  │    POLY_TIMESTAMP: 1733142600    (время запроса)        │   │
│  │    POLY_API_KEY: xxx             (API ключ)             │   │
│  │                                                          │   │
│  │  Body (JSON):                                            │   │
│  │  {                                                       │   │
│  │    "order": {                                            │   │
│  │      "salt": "123456789",                               │   │
│  │      "maker": "0x77cA26...",                            │   │
│  │      "signer": "0x77cA26...",                           │   │
│  │      "tokenId": "12345...",                             │   │
│  │      "makerAmount": "5000000",   // 5 USDC (6 decimals) │   │
│  │      "takerAmount": "10204081",  // shares              │   │
│  │      "expiration": "1764677640",                        │   │
│  │      "signatureType": 2,         // POLY_PROXY          │   │
│  │      "signature": "0xdef456..."  // EIP-712 подпись     │   │
│  │    },                                                    │   │
│  │    "orderType": "GTD"                                   │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  Response: { "orderID": "0x9327fe88...", "success": true }     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Ключевые моменты:

1. **EIP-712 подпись** — ордер подписывается локально приватным ключом
2. **Два типа аутентификации:**
   - `signature` в теле ордера — EIP-712 подпись самого ордера
   - `POLY_*` заголовки — аутентификация API запроса (API key + HMAC)
3. **signatureType: 2 (POLY_PROXY)** — разрешает Polymarket исполнять ордера от имени funder

## Лицензия

MIT
