# Updown Bot 49 - Multi-Crypto Trading Bot

## Обзор

**updown-bot-49** - мультивалютный торговый бот для Polymarket updown 15-минутных маркетов.

### Поддерживаемые криптовалюты
- **BTC** (Bitcoin)
- **ETH** (Ethereum)
- **SOL** (Solana)
- **XRP** (Ripple)

### Стратегия

Для каждой криптовалюты бот размещает **2 ордера**:
- **UP** (YES) @ $0.49 - 5 shares
- **DOWN** (NO) @ $0.49 - 5 shares

**Капитал:** $19.60 на timestamp
- $4.90 на валюту (2 × 5 shares × $0.49)
- 4 криптовалюты × $4.90 = $19.60

**Expiration:** 20 минут после старта маркета

### Режим работы

**MANUAL MODE ONLY** - требует явное указание timestamp при запуске.

---

## Запуск на локальной машине

### Предварительные требования

1. Node.js 18+
2. npm или yarn
3. Заполненный `.env` файл

### Установка

```bash
# Клонировать репозиторий
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49

# Установить зависимости
npm install

# Создать .env файл
cp .env.example .env
nano .env  # Заполнить credentials
```

### Запуск

```bash
# 1. Вычислить следующий timestamp (15-минутный интервал)
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"
# Вывод: updown-15m-1766571000

# 2. Запустить бота с этим timestamp
npm run updown-bot-49 updown-15m-1766571000
```

### Формат команды

```bash
npm run updown-bot-49 updown-15m-TIMESTAMP
```

Где `TIMESTAMP` - Unix timestamp следующего 15-минутного интервала.

---

## Запуск в Docker (VPS)

### Quick Start

```bash
# На VPS сервере
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49

# Создать .env
cp .env.example .env
nano .env  # Заполнить credentials

# Запустить Docker контейнеры
docker compose up -d

# Проверить статус
docker compose ps
# Должно быть: tuda-suda-trading healthy
```

### Запуск бота в контейнере

```bash
# 1. Зайти в контейнер
docker exec -it tuda-suda-trading bash

# 2. Вычислить следующий timestamp
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"
# Вывод: updown-15m-1766571000

# 3. Запустить бота через PM2
pm2 start /app/node_modules/.bin/ts-node \
  --name updown-bot-49 \
  -- /app/src/updown-bot-49.ts updown-15m-1766571000

# 4. Проверить логи
pm2 logs updown-bot-49

# 5. Статус
pm2 list
```

### Альтернативный запуск (через ecosystem.config.js)

**ВАЖНО:** Нужно обновить timestamp в `ecosystem.docker.config.js` перед запуском!

```bash
# Внутри контейнера
pm2 start ecosystem.docker.config.js --only updown-bot-49
```

---

## Логи и мониторинг

### Логи PM2

```bash
# Все логи
pm2 logs updown-bot-49

# Только stdout
pm2 logs updown-bot-49 --out

# Только stderr
pm2 logs updown-bot-49 --err
```

### Файловые логи (Docker)

На хосте VPS в директории `logs/`:

```bash
# stdout
tail -f logs/updown-bot-49-out.log

# stderr
tail -f logs/updown-bot-49-error.log

# Combined
tail -f logs/updown-bot-49-combined.log
```

### Формат логов

```
[24.12.2025, 15:30:00] [MULTI-49] Starting Multi-Crypto Updown 49 Bot...
[24.12.2025, 15:30:00] [MULTI-49] Supported cryptos: BTC, ETH, SOL, XRP
[24.12.2025, 15:30:00] [MULTI-49] Strategy: 2 orders @ $0.49 (UP and DOWN) per crypto
[24.12.2025, 15:30:00] [MULTI-49] Size: 5 shares each
[24.12.2025, 15:30:00] [MULTI-49] Total capital: $19.6 per timestamp (4 cryptos × $4.9)

[24.12.2025, 15:30:05] [BTC-49] Processing: btc-updown-15m-1766571000
[24.12.2025, 15:30:05] [ETH-49] Processing: eth-updown-15m-1766571000
[24.12.2025, 15:30:05] [SOL-49] Processing: sol-updown-15m-1766571000
[24.12.2025, 15:30:05] [XRP-49] Processing: xrp-updown-15m-1766571000

[24.12.2025, 15:30:12] [BTC-49] Market found after 23 requests (7s)!
[24.12.2025, 15:30:12] [BTC-49] UP @ 0.49 placed: order-123...
[24.12.2025, 15:30:13] [BTC-49] DOWN @ 0.49 placed: order-456...
[24.12.2025, 15:30:13] [BTC-49] *** BOTH ORDERS PLACED! (145 attempts, 8s) ***
```

---

## Управление процессом

### Остановка

```bash
# Остановить бота
pm2 stop updown-bot-49

# Удалить из PM2
pm2 delete updown-bot-49
```

### Перезапуск

```bash
pm2 restart updown-bot-49
```

### Сохранить PM2 процессы

```bash
# Сохранить текущий список процессов
pm2 save

# Автозапуск при reboot
pm2 startup
```

---

## Конфигурация

### Файл: `src/updown-bot-49.ts`

Основные настройки:

```typescript
const SIMPLE_CONFIG = {
  PRICE: 0.49,                    // Цена ордера
  SIZE: 5,                        // Размер (shares)
  EXPIRATION_MINUTES: 20,         // Expiration после старта
  POLL_INTERVAL_MS: 250,          // Интервал polling Gamma API
  DELAY_BEFORE_SPAM_MS: 22500,    // Задержка перед spam (22.5 сек)
  MAX_ORDER_ATTEMPTS: 2000,       // Макс попыток на ордер
  POLL_TIMEOUT_MS: 20 * 60 * 1000, // Timeout polling (20 мин)
};
```

### Включение/выключение криптовалют

```typescript
const CRYPTO_CONFIG: Record<CryptoSymbol, { enabled: boolean }> = {
  btc: { enabled: true },
  eth: { enabled: true },
  sol: { enabled: true },
  xrp: { enabled: true },
};
```

Установите `enabled: false` чтобы отключить валюту.

---

## Environment Variables (.env)

Необходимые переменные:

```env
# Приватный ключ кошелька (64 символа БЕЗ 0x)
PK=your_private_key_here

# Polymarket CLOB API credentials
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase

# Funder address (для POLY_PROXY)
FUNDER=0x...
```

---

## Troubleshooting

### Ошибка: "ERROR: Timestamp argument is required!"

**Проблема:** Не указан timestamp при запуске.

**Решение:**
```bash
# Вычислить timestamp
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"

# Запустить с timestamp
npm run updown-bot-49 updown-15m-TIMESTAMP
```

### Ошибка: "Could not find a valid 'tsconfig.json'" (Docker)

**Проблема:** ts-node не находит tsconfig.json.

**Решение:** Используйте **абсолютный путь** к ts-node:
```bash
pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49 -- /app/src/updown-bot-49.ts updown-15m-TIMESTAMP
```

Или убедитесь что в `ecosystem.docker.config.js` указан абсолютный путь:
```javascript
interpreter: '/app/node_modules/.bin/ts-node',  // ✅ Абсолютный
```

### Ошибка: "Invalid slug format"

**Проблема:** Неправильный формат timestamp.

**Решение:** Используйте формат `updown-15m-TIMESTAMP` (не `btc-updown-15m-TIMESTAMP`).

### Маркет не найден (polling timeout)

**Причины:**
1. Polymarket еще не создал маркет для этого timestamp
2. Неправильный timestamp (не кратен 15 минутам)
3. Проблемы с Gamma API

**Решение:**
- Проверьте timestamp: `date -d @TIMESTAMP`
- Попробуйте следующий интервал (+900 сек)
- Проверьте доступность Gamma API

### Ордера не размещаются

**Причины:**
1. Недостаточный баланс USDC на Polymarket
2. Неправильные API credentials
3. Проблемы с CLOB API

**Решение:**
```bash
# Проверить баланс на Polymarket
# Проверить credentials в .env
# Проверить логи: pm2 logs updown-bot-49
```

---

## Технические детали

### Архитектура

```
updown-bot-49.ts
    │
    ├─► Параллельный запуск (Promise.all)
    │   ├─ BTC updown-15m-TIMESTAMP
    │   ├─ ETH updown-15m-TIMESTAMP
    │   ├─ SOL updown-15m-TIMESTAMP
    │   └─ XRP updown-15m-TIMESTAMP
    │
    └─► Для каждой валюты:
        ├─ Polling Gamma API (до появления маркета)
        ├─ Pre-sign 2 ордера (UP, DOWN)
        ├─ Delay 22.5 сек
        ├─ Stream spam (5ms interval)
        └─ Success/Failure report
```

### Workflow

1. **Получение timestamp** - пользователь передает timestamp аргументом
2. **Параллельная обработка** - все 4 криптовалюты обрабатываются одновременно
3. **Polling** - каждый поток опрашивает Gamma API (250ms интервал)
4. **Pre-signing** - подписываем ордера сразу после получения token IDs
5. **Delay** - ждем 22.5 сек (настраиваемо)
6. **Stream spam** - отправляем signed orders каждые 5ms
7. **Успех** - если оба ордера (UP и DOWN) размещены
8. **Следующий timestamp** - +900 сек, повторяем

### Отличия от updown-btc-49

| Параметр | updown-btc-49 | updown-bot-49 |
|----------|---------------|---------------|
| Криптовалюты | Только BTC | BTC, ETH, SOL, XRP |
| Обработка | Последовательная | Параллельная (Promise.all) |
| Капитал | $4.90/timestamp | $19.60/timestamp |
| Файл | `src/updown-btc-49.ts` | `src/updown-bot-49.ts` |
| npm script | `npm run updown-btc-49` | `npm run updown-bot-49` |

---

## FAQ

**Q: Можно ли запустить бота без timestamp?**
A: Нет, updown-bot-49 работает только в MANUAL режиме. Timestamp обязателен.

**Q: Можно ли запустить бота на нескольких timestamps одновременно?**
A: Да, запустите несколько PM2 процессов с разными timestamp:
```bash
pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49-1 -- /app/src/updown-bot-49.ts updown-15m-1766571000
pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49-2 -- /app/src/updown-bot-49.ts updown-15m-1766571900
```

**Q: Как отключить одну из криптовалют?**
A: Отредактируйте `CRYPTO_CONFIG` в `src/updown-bot-49.ts`:
```typescript
const CRYPTO_CONFIG = {
  btc: { enabled: true },
  eth: { enabled: false },  // Отключить ETH
  sol: { enabled: true },
  xrp: { enabled: true },
};
```

**Q: Можно ли изменить размер ордера или цену?**
A: Да, отредактируйте `SIMPLE_CONFIG` в `src/updown-bot-49.ts`:
```typescript
const SIMPLE_CONFIG = {
  PRICE: 0.48,  // Изменить цену
  SIZE: 10,     // Изменить размер
  // ...
};
```

**Q: Бот автоматически переходит к следующему timestamp?**
A: Да, бот работает в **бесконечном цикле** и автоматически обрабатывает следующие timestamps с интервалом 15 минут.

**Q: Как остановить бота?**
A: `pm2 stop updown-bot-49` или CTRL+C (если запущен в foreground).

---

## Поддержка

- GitHub: https://github.com/Bezoutoff/Tuda_Suda_49
- Issues: https://github.com/Bezoutoff/Tuda_Suda_49/issues

---

## История изменений

- **2025-12-24**: Создан updown-bot-49 - мультивалютный бот (BTC, ETH, SOL, XRP)
- **2025-12-24**: Исправлена ошибка ts-node в Docker (абсолютный путь interpreter)
