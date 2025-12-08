# Tuda Suda 49

Updown 15m Auto-Order Bot для Polymarket.

Автоматически ставит **10 ордеров** (5 цен × 2 стороны) при появлении новых updown 15m маркетов (BTC, ETH, SOL, XRP).

## Содержание

- [Стратегия](#стратегия)
- [Установка](#установка)
- [Генерация API ключей](#генерация-api-ключей)
- [Запуск](#запуск)
- [Как работает](#как-работает)
- [Конфигурация (.env)](#конфигурация-env)
- [Конфигурация (src/config.ts)](#конфигурация-srcconfigts)
- [Troubleshooting](#troubleshooting)
  - [401 Unauthorized](#401-unauthorized--invalid-api-key)
  - [Перегенерация API ключей](#перегенерация-api-ключей)
  - [Медленный спам ордеров](#медленный-спам-ордеров-мало-попыток-за-n-секунд)
- [Оптимизации](#оптимизации)
- [Тестирование Latency](#тестирование-latency)
- [Архитектура](#архитектура-как-отправляется-подписанный-ордер)

## Стратегия

| Цена | Размер | Экспирация | Сторона |
|------|--------|------------|---------|
| 0.48 | $7 | за 10 мин до старта | UP + DOWN |
| 0.47 | $8 | за 6 мин до старта | UP + DOWN |
| 0.46 | $9 | за 2 мин до старта | UP + DOWN |
| 0.45 | $10 | за 30 сек до старта | UP + DOWN |
| 0.44 | $10 | за 1 сек до старта | UP + DOWN |

**Итого:** $88 на маркет (UP + DOWN)

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

1. **Polling**: спамит Gamma API пока не получит token IDs
2. **Pre-sign**: подписывает все 10 ордеров (EIP-712)
3. **TLS warm-up**: прогревает HTTPS соединение
4. **Delay**: ждёт 23.5 сек (маркет активируется ~25 сек после создания)
5. **Spam**: отправляет `postOrders()` каждые 2ms пока все не пройдут
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
| `ORDER_CONFIG` | Массив {price, size, expirationBuffer} | 5 цен, $5-$10 |
| `POLL_INTERVAL_MS` | Интервал polling Gamma API | 250ms |
| `DELAY_BEFORE_SPAM_MS` | Задержка после pre-sign | **23.5s** |
| `MAX_ORDER_ATTEMPTS` | Максимум попыток | 5000 |
| `PARALLEL_SPAM_REQUESTS` | Параллельных запросов на ордер | 20 |

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

- **Pre-sign before delay**: подпись ордеров до задержки, экономит ~600ms
- **TLS warm-up**: прогрев HTTPS соединения во время delay
- **Stream spam**: отправка запросов каждые 2ms (вместо batch)
- **23.5s delay**: оптимизированный timing (27-72 попытки вместо 282-288)
- **useServerTime**: использование времени сервера для аутентификации
- **Parallel spam**: 20 параллельных HTTP запросов на каждый из 10 ордеров

### Результаты тестирования (VPS Toronto)

| Delay | Интервал | Попыток до успеха |
|-------|----------|-------------------|
| 19s | 0ms | 282 |
| 19s | 0.1ms | 288 |
| 23.5s | 2ms | **72** |
| 23.5s | 2ms + TCP_NODELAY | **27** |

Подробнее: [LATENCY_RESULTS.md](LATENCY_RESULTS.md)

## Тестирование Latency

Два скрипта для измерения latency:
- `test-latency.ts` — Node.js версия
- `test-latency-cpp.ts` — Node.js wrapper + C++ HTTP spam (raw HTTP)

### Запуск

```bash
# Node.js версия
npm run test-latency btc-updown-15m-1764930600

# C++ версия (непрерывный режим)
npm run test-latency-cpp btc-updown-15m-1764930600

# На VPS через PM2
pm2 start "npm run test-latency-cpp btc-updown-15m-1764930600" --name "latency-cpp"
pm2 logs latency-cpp
```

**C++ версия работает непрерывно**: после обработки маркета автоматически переходит к следующему (+900 сек).

### Что измеряется

| Метрика | Описание |
|---------|----------|
| **Polling** | Время ожидания появления маркета в Gamma API |
| **Signing** | Время подписи ордера (EIP-712, локально) |
| **Latency** | Время HTTP POST запроса до Polymarket и обратно |
| **Min/Max/Avg/Median** | Статистика по всем запросам |

### Фазы теста

1. **Polling** — ждёт появления маркета (запросы к Gamma API каждые 250ms)
2. **Pre-sign** — подписывает 1 ордер (UP @ 0.45)
3. **TLS warm-up** — прогревает HTTPS соединение (GET /health)
4. **Delay** — ждёт 23.5 сек (маркет активируется ~25 сек после создания)
5. **Spam** — отправляет POST запросы каждые 2ms до успеха
6. **Results** — выводит статистику latency
7. **Next market** — (только C++) переходит к следующему маркету

### Логирование в CSV

Оба скрипта пишут в **единый файл** `latency.csv`:

```csv
server_time_ms,market_time,sec_to_market,slug,side,price,size,latency_ms,status,order_id,attempt,source
1733401234567,1733402100,865.433,btc-updown-15m-1733402100,UP,0.45,5,285,success,0xa4af61c8...,1,nodejs
1733401234890,1733402100,865.110,btc-updown-15m-1733402100,UP,0.45,5,312,orderbook_not_exist,,2,cpp
```

#### Поля CSV

| Поле | Описание |
|------|----------|
| `server_time_ms` | Время сервера Polymarket в миллисекундах (Unix timestamp × 1000 + ms) |
| `market_time` | Unix timestamp старта маркета |
| `sec_to_market` | Секунды до старта маркета (отрицательное = после старта) |
| `slug` | Slug маркета |
| `side` | UP или DOWN |
| `price` | Цена ордера |
| `size` | Размер в USDC |
| `latency_ms` | Время ответа API в миллисекундах |
| `status` | `success` или `orderbook_not_exist` |
| `order_id` | ID ордера (пусто при ошибке) |
| `attempt` | Номер попытки |
| `source` | `nodejs` или `cpp` |

#### Фильтрация логов

Логируются **только**:
- ✅ Успешные ордера (`status: success`)
- ✅ Ошибка `orderbook does not exist` (маркет ещё не активен)

**НЕ логируются**:
- ❌ `Duplicated order` (ордер уже в очереди)
- ❌ Другие ошибки

### Summary файл

После каждого маркета добавляется строка в `latency_summary.csv`:

```csv
market_time,slug,total_attempts,success_count,first_success_attempt,min_ms,max_ms,avg_ms,median_ms,source
1733402100,btc-updown-15m-1733402100,50,1,23,245,412,298,285,nodejs
```

### Анализ в Python

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv('latency.csv')

# График latency vs время до старта маркета
for slug in df['slug'].unique():
    m = df[df['slug'] == slug]
    plt.figure(figsize=(12, 6))

    success = m[m['status'] == 'success']
    errors = m[m['status'] == 'orderbook_not_exist']

    plt.scatter(success['sec_to_market'], success['latency_ms'],
                c='green', label='Success', alpha=0.7)
    plt.scatter(errors['sec_to_market'], errors['latency_ms'],
                c='red', label='Orderbook not exist', alpha=0.7)

    plt.axvline(x=0, color='black', linestyle='--', label='Market start')
    plt.xlabel('Seconds to market start')
    plt.ylabel('Latency (ms)')
    plt.title(f'Latency: {slug}')
    plt.legend()
    plt.grid(True)
    plt.savefig(f'latency_{slug}.png', dpi=150)
```

### Интерпретация результатов

| Latency | Оценка | Комментарий |
|---------|--------|-------------|
| < 150ms | Отлично | VPS близко к серверам Polymarket |
| 150-300ms | Хорошо | Нормальное соединение |
| 300-500ms | Средне | Далеко от серверов |
| > 500ms | Плохо | Рекомендуется VPS ближе к США |

### Визуализация (Python)

```bash
# Установка
pip install pandas matplotlib

# Запуск
python scripts/plot_latency.py latency.csv
```

Строит два графика:
1. **Latency over time** — точные значения (мс) над каждой точкой, время в формате HH:MM:SS.mmm
2. **Histogram** — распределение latency

Выводит статистику: min, max, mean, median, std, P95, P99.

### Влияние на эффективность бота

При latency 285ms за 6 секунд спама:
```
6000ms / 285ms ≈ 21 batch × 20 parallel = ~420 попыток
```

При latency 600ms:
```
6000ms / 600ms ≈ 10 batch × 20 parallel = ~200 попыток
```

Меньше попыток = меньше шансов успеть первым.

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
