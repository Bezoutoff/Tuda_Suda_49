# Tuda Suda 49

Updown 15m Auto-Order Bot для Polymarket.

Автоматически ставит ордера **49¢ на YES (Up)** при появлении новых updown 15m маркетов (BTC, ETH, SOL, XRP).

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
| `ORDER_PRICE` | Цена ордера | 0.49 |
| `POLL_INTERVAL_MS` | Интервал polling Gamma API | 250ms |
| `ORDER_RETRY_INTERVAL_MS` | Интервал между попытками ордеров | 1ms |
| `DELAY_BEFORE_SPAM_MS` | Задержка после получения token IDs | 19s |
| `MAX_ORDER_ATTEMPTS` | Максимум попыток | 5000 |

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

## Оптимизации

- **Pre-sign**: подпись ордера один раз, спам только HTTP запросов
- **useServerTime**: использование времени сервера для аутентификации
- **Скомпилированный JS**: `npm run build` + `npm run bot-fast` (~30MB вместо 100MB)

## Лицензия

MIT
