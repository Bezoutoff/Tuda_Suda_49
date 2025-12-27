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

**Expiration:** 20 минут ДО старта маркета

### Режим работы

Бот работает в **непрерывном цикле**:
1. Обрабатывает указанный timestamp
2. Автоматически переходит к следующему (+15 минут)
3. Продолжает работу бесконечно (пока не остановите)

**Требует:** Явное указание начального timestamp при запуске.

---

## 📖 Оглавление

### 🚀 Запуск
- [PM2 на VPS (рекомендуется)](#-pm2-на-vps-без-docker)
- [Docker на VPS (альтернатива)](#-docker-на-vps)
- [Локальная машина (для тестирования)](#-запуск-на-локальной-машине)

### ⚙️ Конфигурация
- [Environment Variables (.env)](#environment-variables-env)
- [Настройка бота (config.ts)](#конфигурация)
- [Включение/выключение криптовалют](#включениевыключение-криптовалют)

### 🤖 Auto-Sell Bot
- [Что это и зачем?](#-auto-sell-bot---автоматическая-ликвидация-позиций)
- [Установка и запуск](#запуск-auto-sell-bot)
- [Troubleshooting](#troubleshooting-auto-sell-bot)

### 📊 Мониторинг
- [Логи и мониторинг](#логи-и-мониторинг)
- [Управление процессом](#управление-процессом)

### 🔧 Дополнительно
- [Hardware Requirements](#-требования-к-железу-hardware-requirements)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Технические детали](#технические-детали)

---

## 🚀 PM2 на VPS (БЕЗ Docker)

**Рекомендуется для VPS** - минимальное потребление памяти (~470-600 MB vs ~800-1150 MB с Docker).

### Quick Start

```bash
# 1. Clone repository
cd /root
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49

# 2. Install Node.js 18+ (если не установлен)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
nano .env  # Fill in: PK, CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE, FUNDER

# 5. Install PM2 globally
npm install -g pm2

# 6. Build TypeScript (для экономии памяти)
npm run build

# 7. Calculate next timestamp
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"
# Output: updown-15m-1766736900

# 8. Start bot with PM2
pm2 start ./node_modules/.bin/ts-node \
  --name updown-bot-49 \
  -- src/updown-bot-49.ts updown-15m-1766736900

# 9. Save PM2 process (autostart on reboot)
pm2 save
pm2 startup
```

**Готово!** Бот запущен и обрабатывает все последующие маркеты (15-минутный цикл).

### Формат команды PM2

```bash
pm2 start ./node_modules/.bin/ts-node \
  --name updown-bot-49 \
  -- src/updown-bot-49.ts updown-15m-TIMESTAMP
```

**Параметры:**
- `--name updown-bot-49` - имя процесса в PM2
- `--` - разделитель между PM2 и script аргументами
- `src/updown-bot-49.ts` - путь к боту
- `updown-15m-TIMESTAMP` - начальный timestamp (обязательно!)

**После запуска:**
- Бот обработает маркет `updown-15m-TIMESTAMP`
- Затем автоматически перейдет к `updown-15m-(TIMESTAMP+900)`
- И так далее каждые 15 минут

**Это НЕ одноразовый запуск** - бот продолжает работать непрерывно!

### Мониторинг

```bash
# Логи в реальном времени
pm2 logs updown-bot-49

# Статус
pm2 list

# Memory usage
pm2 monit

# Остановить
pm2 stop updown-bot-49

# Перезапустить
pm2 restart updown-bot-49
```

### Автозапуск при перезагрузке VPS

```bash
# PM2 уже сохранен (pm2 save), но если нужно настроить startup:
pm2 startup
# Выполнить команду которую PM2 выведет
```

### Обновление бота

```bash
cd /root/Tuda_Suda_49
git pull
npm install
npm run build
pm2 restart updown-bot-49
```

---

## 🐳 Docker на VPS

**Альтернатива PM2** - если нужна изоляция или управление несколькими ботами.

⚠️ **Требует больше памяти:** ~800-1150 MB vs ~470-600 MB без Docker.

### Когда использовать Docker:
- ✅ Нужна изоляция (несколько проектов на одном VPS)
- ✅ Удобное управление зависимостями
- ✅ Быстрый деплой на новый сервер

### Когда НЕ использовать Docker:
- ❌ VPS с 1 GB RAM (будет swap)
- ❌ Простая конфигурация (1-2 бота)
- ❌ Нужна максимальная производительность

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

## 💻 Запуск на локальной машине

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

## 💻 Требования к железу (Hardware Requirements)

### Минимальные требования VPS

| Конфигурация | RAM | CPU | Диск | Примечание |
|--------------|-----|-----|------|------------|
| **БЕЗ Docker (рекомендуется)** | **1 GB** | 1 core | 10 GB | ✅ Оптимально для VPS |
| **С Docker** | **2 GB** | 1-2 cores | 20 GB | Docker overhead ~600MB |

### Потребление памяти (RAM Usage)

#### БЕЗ Docker (Compiled JS + PM2)

**Конфигурация: BTC + ETH (2 криптовалюты)**
```
auto-sell-bot:      ~120-150 MB
updown-bot-49:      ~250-300 MB (BTC+ETH)
System processes:   ~100-150 MB
------------------------
ИТОГО:              ~470-600 MB
```

**Конфигурация: Все 4 криптовалюты (BTC+ETH+SOL+XRP)**
```
auto-sell-bot:      ~120-150 MB
updown-bot-49:      ~450-550 MB (4 криптовалюты)
System processes:   ~100-150 MB
------------------------
ИТОГО:              ~670-850 MB
```

**Реальное потребление (production):**
```bash
root@vps:~# free -h
               total        used        free      shared  buff/cache   available
Mem:           961Mi       476Mi       113Mi       2.8Mi       536Mi       485Mi
```
✅ **476 MB used** - 2 бота (auto-sell + updown-bot-49 BTC+ETH) + система

#### С Docker (ts-node + PM2 внутри контейнера)

**Конфигурация: BTC + ETH (2 криптовалюты)**
```
Docker daemon:      ~50-100 MB
Container overhead: ~100-200 MB
auto-sell-bot:      ~200-250 MB (ts-node overhead)
updown-bot-49:      ~350-450 MB (ts-node overhead)
System processes:   ~100-150 MB
------------------------
ИТОГО:              ~800-1150 MB
```

**Конфигурация: Все 4 криптовалюты**
```
Docker + containers: ~150-300 MB
auto-sell-bot:      ~250-300 MB
updown-bot-49:      ~600-800 MB
System processes:   ~100-150 MB
------------------------
ИТОГО:              ~1100-1550 MB
```

### Рекомендации по выбору конфигурации

| RAM на VPS | Рекомендация |
|------------|--------------|
| **< 1 GB** | ❌ Недостаточно (система будет swap/OOM) |
| **1 GB** | ✅ **БЕЗ Docker**: BTC+ETH (2 криптовалюты) |
| **1.5-2 GB** | ✅ **БЕЗ Docker**: Все 4 криптовалюты |
| **2 GB** | ✅ **С Docker**: BTC+ETH (2 криптовалюты) |
| **4 GB** | ✅ **С Docker**: Все 4 криптовалюты + запас |

### Оптимизация памяти

#### 1. Использовать Compiled JS вместо ts-node
```bash
# ❌ Плохо (300-800 MB overhead)
pm2 start ts-node src/updown-bot-49.ts

# ✅ Хорошо (экономия ~100-150 MB)
npm run build
pm2 start dist/updown-bot-49.js
```

#### 2. Отключить ненужные криптовалюты

Отредактировать `src/updown-bot-49.ts`:
```typescript
const CRYPTO_CONFIG: Record<CryptoSymbol, { enabled: boolean }> = {
  btc: { enabled: true },   // ✅ Оставить
  eth: { enabled: true },   // ✅ Оставить
  sol: { enabled: false },  // ❌ Отключить (экономия ~150-200 MB)
  xrp: { enabled: false },  // ❌ Отключить (экономия ~150-200 MB)
};
```

**Экономия памяти:**
- 4 криптовалюты → 2 криптовалюты: **~300-400 MB**
- 2 криптовалюты → 1 криптовалюта: **~150-200 MB**

#### 3. Запускать БЕЗ Docker

**Экономия:** ~300-600 MB (Docker daemon + container overhead + ts-node)

**Установка БЕЗ Docker:**
```bash
cd /root/Tuda_Suda_49
npm install
npm run build

pm2 start dist/auto-sell-bot.js --name auto-sell-bot --max-memory-restart 150M
pm2 start dist/updown-bot-49.js --name updown-bot-49 --max-memory-restart 300M -- updown-15m-TIMESTAMP
```

### CPU и Диск

**CPU:**
- 1 core достаточно для 2 ботов
- Load average: 0.2-0.5 (норма)
- Пики при spam: 1.0-2.0 (кратковременно)

**Диск:**
- node_modules: ~200-300 MB
- Логи (PM2): ~10-50 MB/день
- Рекомендуется: 10 GB свободно

### Мониторинг памяти

```bash
# Общая память системы
free -h

# Память процессов PM2
pm2 monit

# Top процессы по памяти
ps aux --sort=-%mem | head -20
```

---

## 🔗 Работа в связке с Auto-Sell Bot

**updown-bot-49** и **auto-sell-bot** работают вместе:

1. **updown-bot-49** - размещает лимитные ордера (UP и DOWN @ $0.49)
2. **auto-sell-bot** - автоматически продает позиции когда они исполняются

**Workflow:**
```
updown-bot-49 → Limit Orders @ $0.49
       ↓
   Order Fill (BUY)
       ↓
auto-sell-bot → Market Order (SELL)
       ↓
  Position Closed
```

**Преимущества:**
- ✅ Мгновенная ликвидация позиций
- ✅ Минимизация риска (не держим позиции до expiration)
- ✅ Автоматизация полного цикла (открытие → закрытие)

---

## 🤖 Auto-Sell Bot - Автоматическая ликвидация позиций

### Что это?

**auto-sell-bot** - дополнительный бот, который автоматически продает позиции market order'ом сразу после их открытия.

### Зачем нужен?

Когда **updown-bot-49** размещает лимитные ордера @ $0.49, некоторые из них исполняются (fill). **auto-sell-bot** мгновенно продает эти позиции, чтобы:
- Зафиксировать прибыль/убыток
- Не держать позиции до expiration
- Освободить капитал для следующих маркетов

### Как работает?

1. Подключается к Polymarket User WebSocket Channel
2. Отслеживает все BUY trades (позиции открываются)
3. Фильтрует только свои trades (по FUNDER address)
4. Мгновенно продает позицию market order'ом (FOK/FAK)

### Запуск Auto-Sell Bot

#### На локальной машине

```bash
npm run auto-sell
```

#### В Docker (VPS)

```bash
# 1. Зайти в контейнер
docker exec -it tuda-suda-trading bash

# 2. Запустить через PM2 (ПРАВИЛЬНАЯ КОМАНДА!)
pm2 start /app/node_modules/.bin/ts-node \
  --name auto-sell-bot \
  -- /app/src/auto-sell-bot.ts

# Альтернатива (через ecosystem.config.js):
pm2 start ecosystem.docker.config.js --only auto-sell-bot

# 3. Проверить статус
pm2 list
# Должно быть: auto-sell-bot | online ✅

# 4. Логи (используйте combined.log!)
tail -f /app/logs/auto-sell-bot-combined.log

# Или через PM2 (может быть пустым):
pm2 logs auto-sell-bot
```

**ВАЖНО:** Используйте **абсолютный путь** к ts-node (`/app/node_modules/.bin/ts-node`), иначе получите ошибку "Cannot use import statement outside a module".

#### На VPS БЕЗ Docker (PM2)

```bash
cd /root/Tuda_Suda_49

# Вариант 1: через ts-node
pm2 start ./node_modules/.bin/ts-node \
  --name auto-sell-bot \
  -- src/auto-sell-bot.ts

# Вариант 2: через compiled JS (экономия памяти)
npm run build
pm2 start dist/auto-sell-bot.js --name auto-sell-bot

# Проверка
pm2 list
pm2 logs auto-sell-bot
```

### Мониторинг Auto-Sell Bot

```bash
# Логи в реальном времени
pm2 logs auto-sell-bot

# Файловые логи (на хосте VPS)
tail -f logs/auto-sell-bot-out.log
```

### Формат логов Auto-Sell Bot

```
[24.12.2025, 15:30:00] [AUTO-SELL] Starting Auto-Sell Bot...
[24.12.2025, 15:30:01] [AUTO-SELL] Connected to User WebSocket Channel
[24.12.2025, 15:30:01] [AUTO-SELL] Subscribed to clob_user events (ALL types)

[24.12.2025, 15:32:15] [AUTO-SELL] [BUY DETECTED] Trade: trade-123...
[24.12.2025, 15:32:15] [AUTO-SELL] Asset: token-456..., Size: 5.00
[24.12.2025, 15:32:16] [AUTO-SELL] ✅ Position sold! Order: order-789...
```

### Управление Auto-Sell Bot

```bash
# Остановить
pm2 stop auto-sell-bot

# Перезапустить
pm2 restart auto-sell-bot

# Удалить
pm2 delete auto-sell-bot

# Сохранить процесс (автозапуск при reboot)
pm2 save
```

### Конфигурация Auto-Sell Bot

**Файл:** `src/config.ts`

```typescript
export const AUTO_SELL_CONFIG = {
  DEFAULT_ORDER_TYPE: 'FOK',  // Fill-or-Kill
  FALLBACK_TO_FAK: true,      // Fallback на FAK если FOK не исполнился
};
```

**Environment variables (.env):**
```env
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase
FUNDER=0x...  # Для фильтрации своих trades
```

### Troubleshooting Auto-Sell Bot

**Проблема: "Cannot use import statement outside a module" (PM2 ошибка)**

Самая частая проблема! Бот работает вручную (`npx ts-node src/auto-sell-bot.ts`), но падает в PM2.

**Причина:** Относительный путь к ts-node в `ecosystem.docker.config.js`

**Решение:**
```bash
# Проверить конфигурацию
grep -A 5 "name: 'auto-sell-bot'" /app/ecosystem.docker.config.js

# Должно быть:
interpreter: '/app/node_modules/.bin/ts-node',  # ✅ АБСОЛЮТНЫЙ

# НЕ должно быть:
interpreter: './node_modules/.bin/ts-node',  # ❌ ОТНОСИТЕЛЬНЫЙ
```

**Если путь относительный - исправить:**
1. На хосте VPS: `cd Tuda_Suda_49 && git pull` (получить последнюю версию)
2. В контейнере: `pm2 delete auto-sell-bot`
3. Запустить правильно (см. раздел "Запуск Auto-Sell Bot" выше)

**Правильный запуск в PM2:**
```bash
# Вариант 1: Прямая команда (рекомендуется)
pm2 start /app/node_modules/.bin/ts-node \
  --name auto-sell-bot \
  -- /app/src/auto-sell-bot.ts

# Вариант 2: Через ecosystem.config.js (если interpreter исправлен)
pm2 start ecosystem.docker.config.js --only auto-sell-bot
```

---

**Проблема: PM2 логи пустые, но combined.log полный**

```bash
# PM2 logs показывает пустоту
pm2 logs auto-sell-bot
# (no output)

# Но combined.log содержит данные
tail -f /app/logs/auto-sell-bot-combined.log
# [AUTO-SELL] Starting...
```

**Причина:** PM2 пишет в combined.log, но `pm2 logs` читает из out.log/error.log

**Решение:** Читать combined.log напрямую:
```bash
tail -f /app/logs/auto-sell-bot-combined.log
```

Или перезапустить с исправленной конфигурацией (см. выше).

---

**Проблема: WebSocket отключается (code 1006)**
- Это нормально - RTDS периодически разрывает соединение
- Бот автоматически переподключается

**Проблема: Позиции не продаются**
- Проверьте FUNDER address в .env (должен совпадать с кошельком)
- Проверьте логи: `tail -f /app/logs/auto-sell-bot-combined.log`
- Перезапустите: `pm2 restart auto-sell-bot`

**Проблема: Бот не запускается вообще**
```bash
# Проверить credentials
cat .env | grep -E "CLOB|FUNDER"

# Проверить PM2 статус
pm2 list
# Должно быть: auto-sell-bot | online

# Логи ошибок
tail -100 /app/logs/auto-sell-bot-combined.log
```

---

## 📊 Алгоритм работы хеджа (Auto-Sell Bot)

### Концепция hedge стратегии

**Auto-sell-bot** реализует **противоположный хедж** - когда исполняется позиция от updown-bot-49, бот покупает противоположную сторону по высокой цене для хеджирования риска.

**Пример:**
- updown-bot-49 покупает **UP @ $0.49** (5 shares)
- auto-sell-bot покупает **DOWN @ $0.99** (5 shares)
- **Результат:** Позиция захеджирована - неважно куда пойдет цена

**Математика:**
```
Затраты:  $0.49 + $0.99 = $1.48
Доход:    $1.00 (выигрывает одна из сторон)
Убыток:   -$0.48 (-32%)
```

**Зачем это нужно?**
- ✅ Фиксация позиции (не держим до expiration)
- ✅ Предсказуемый риск (-$0.48 максимум)
- ✅ Автоматизация (не нужно вручную закрывать)

### Пошаговый алгоритм

#### Шаг 1: Подключение к User Channel

```
auto-sell-bot → Polymarket RTDS WebSocket
              → Topic: 'clob_user'
              → Type: '*' (все события)
              → Auth: CLOB credentials
```

Бот подписывается на **все** события своего аккаунта:
- Trade events (fills)
- Order placements
- Order cancellations
- Balance updates

#### Шаг 2: Получение trade event

```json
{
  "topic": "clob_user",
  "type": "trade",
  "payload": {
    "id": "trade-123...",
    "side": "BUY",
    "owner": "your-api-key",
    "price": "0.49",
    "size": "5",
    "asset_id": "token-456...",
    "outcome": "Up",
    "maker_orders": [...]
  }
}
```

#### Шаг 3: Фильтрация (4 проверки)

**Фильтр 1: Дедупликация**
```typescript
if (processedTrades.has(tradeId)) {
  log('[SKIP] Trade already processed');
  return;
}
```
- Проверяет что trade не был обработан ранее
- Использует Map<tradeId, timestamp> с TTL 24 часа

**Фильтр 2: Только BUY trades**
```typescript
if (side !== 'BUY') {
  return;  // Пропускаем SELL trades
}
```
- Хеджим только открытие позиций (BUY)
- SELL trades игнорируем

**Фильтр 3: Только свои trades**
```typescript
const isTaker = owner === tradingConfig.apiKey;
const isMaker = payload.maker_orders?.some(
  order => order.owner === tradingConfig.apiKey
);

if (!isTaker && !isMaker) {
  return;  // Не наш trade, пропускаем
}
```
- Проверяет что trade принадлежит нашему API key
- Работает для обоих ролей: TAKER и MAKER

**Фильтр 4: Фильтр по цене (защита от бесконечного цикла!)** ⚠️ **КРИТИЧНО**
```typescript
// Extract price
let price = 0;
if (isTaker) {
  price = parseFloat(payload.price || '0');
} else {
  const ourOrder = payload.maker_orders.find(...);
  price = parseFloat(ourOrder?.price || '0');
}

// CRITICAL: Ignore own hedge orders @ 0.99
if (price >= 0.90) {
  log(`[SKIP] Ignoring own hedge order @ ${price}`);
  return;
}
```

**Почему нужен фильтр по цене?**
- updown-bot-49 покупает @ **$0.49**
- auto-sell-bot хеджит @ **$0.99**
- Без фильтра auto-sell увидит СВОЮ покупку @ $0.99 как новую позицию!
- Запустится бесконечный цикл хеджей

**Порог 0.90:**
- Позиции @ $0.49 < $0.90 → **хеджить**
- Хеджи @ $0.99 >= $0.90 → **пропустить**

#### Шаг 4: Извлечение данных

**TAKER сценарий:**
```typescript
tokenId = payload.asset_id;
size = payload.size;
price = parseFloat(payload.price);
outcome = payload.outcome;  // "Up" или "Down"
```

**MAKER сценарий:**
```typescript
const ourOrder = payload.maker_orders.find(
  order => order.owner === tradingConfig.apiKey
);
tokenId = ourOrder.asset_id;
size = ourOrder.matched_amount;
price = parseFloat(ourOrder.price);
outcome = ourOrder.outcome;
```

#### Шаг 5: Проверка маркета (один хедж на маркет)

```typescript
// Получить slug и opposite token из market-cache.json
const { oppositeTokenId, slug } = getOppositeTokenId(tokenId);

// Проверить что маркет еще не обработан
if (processedMarkets.has(slug)) {
  log(`[SKIP] Market ${slug} already processed`);
  return;
}

// Отметить маркет как обработанный ПЕРЕД покупкой
processedMarkets.add(slug);
```

**Зачем это нужно?**
- updown-bot-49 размещает **2 ордера**: UP @ $0.49 И DOWN @ $0.49
- Если оба исполнятся, получим 2 trade events
- Хеджим только **ПЕРВЫЙ** который исполнится, второй пропускаем

#### Шаг 6: Определение противоположного outcome

```typescript
let oppositeOutcome: string;
if (outcome === 'Up' || outcome === 'YES') {
  oppositeOutcome = outcome === 'Up' ? 'Down' : 'NO';
} else {
  oppositeOutcome = outcome === 'Down' ? 'Up' : 'YES';
}
```

Примеры:
- UP → DOWN
- Down → Up
- YES → NO
- NO → YES

#### Шаг 7: Размещение hedge ордера

```typescript
await tradingService.createLimitOrder({
  tokenId: oppositeTokenId,  // ← ПРОТИВОПОЛОЖНЫЙ token!
  side: 'BUY',               // ← BUY, не SELL!
  price: 0.99,               // Хедж по $0.99
  size: size,                // Тот же размер что и исполнилось
  outcome: oppositeOutcome,  // Противоположный исход
  // expirationTimestamp not needed (GTC order)
});
```

**Важно:**
- Покупаем ПРОТИВОПОЛОЖНУЮ сторону (opposite token)
- Используем BUY, не SELL
- Цена жестко задана: $0.99
- Размер такой же как исполнившаяся позиция

### Примеры работы (сценарии)

#### Сценарий 1: Нормальная работа

```
1. updown-bot-49 размещает:
   - UP @ $0.49 (5 shares)
   - DOWN @ $0.49 (5 shares)

2. UP исполняется первым (через 2 сек)
   - Trade event: side=BUY, price=0.49, outcome=Up
   - Фильтры:
     ✓ Новый trade (не в processedTrades)
     ✓ side === 'BUY'
     ✓ Наш API key
     ✓ price (0.49) < 0.90
     ✓ Маркет не обработан (не в processedMarkets)
   - Действие: Покупаем DOWN @ $0.99 (5 shares)
   - processedMarkets.add(slug)

3. DOWN исполняется вторым (через 5 сек)
   - Trade event: side=BUY, price=0.49, outcome=Down
   - Фильтры:
     ✓ Новый trade
     ✓ side === 'BUY'
     ✓ Наш API key
     ✓ price (0.49) < 0.90
     ✗ Маркет УЖЕ обработан (в processedMarkets)
   - Действие: SKIP (пропускаем)

ИТОГО:
- Куплена DOWN @ $0.99 (противоположная первой позиции UP)
- Вторая позиция (DOWN @ $0.49) НЕ захеджирована
```

#### Сценарий 2: Предотвращение бесконечного цикла

```
1. updown-bot-49: UP @ $0.49 (5 shares) → исполнился
   - auto-sell видит trade
   - price = 0.49 < 0.90 ✓
   - Покупаем hedge: DOWN @ $0.99

2. auto-sell сам покупает: DOWN @ $0.99
   - WebSocket возвращает trade event от СВОЕЙ покупки!
   - Trade event: side=BUY, price=0.99, outcome=Down
   - Фильтры:
     ✓ Новый trade
     ✓ side === 'BUY'
     ✓ Наш API key
     ✗ price (0.99) >= 0.90 ← ФИЛЬТР СРАБОТАЛ!
   - Лог: "[SKIP] Ignoring own hedge order @ 0.99"
   - Действие: SKIP

3. Бесконечный цикл ПРЕДОТВРАЩЁН ✅
```

**Без фильтра по цене (старая версия - баг!):**
```
1. UP @ $0.49 → hedge DOWN @ $0.99
2. DOWN @ $0.99 → hedge UP @ $0.99  ← БАГ!
3. UP @ $0.99 → hedge DOWN @ $0.99  ← ЦИКЛ!
4. DOWN @ $0.99 → hedge UP @ $0.99
5. ... бесконечно покупаем @ $0.99
```

#### Сценарий 3: TAKER vs MAKER

**TAKER (мы размещаем market order, кто-то мейкер):**
```
payload.price = "0.49"          ← цена здесь
payload.size = "5"
payload.asset_id = "token-123"
payload.outcome = "Up"
```

**MAKER (мы размещаем limit order, кто-то берет его):**
```
payload.maker_orders = [
  {
    owner: "our-api-key",
    price: "0.49",              ← цена в maker_orders
    matched_amount: "5",
    asset_id: "token-123",
    outcome: "Up"
  }
]
```

Бот корректно обрабатывает оба сценария!

### Технические детали

#### Market Cache файл

**Файл:** `logs/market-cache.json`

**Содержимое:**
```json
{
  "token-abc-up": {
    "oppositeTokenId": "token-abc-down",
    "slug": "btc-updown-15m-1766880000",
    "outcome": "YES"
  },
  "token-abc-down": {
    "oppositeTokenId": "token-abc-up",
    "slug": "btc-updown-15m-1766880000",
    "outcome": "NO"
  }
}
```

**Создается:** updown-bot-49 при размещении ордеров
**Используется:** auto-sell-bot для получения opposite token ID

#### Deduplication и Cleanup

**processedTrades Map:**
```typescript
Map<tradeId, timestamp>
TTL: 24 часа
Cleanup: каждый час
```

**processedMarkets Set:**
```typescript
Set<slug>
Cleanup: при размере > 100 (каждый час)
```

#### Задержка перед хеджем

```typescript
const DELAY_MS = 15000;  // 15 секунд
await new Promise(resolve => setTimeout(resolve, DELAY_MS));
```

**Зачем?**
- Tokens нужно время для settlement на blockchain
- Если продать сразу → может не хватить баланса
- 15 секунд достаточно для подтверждения

### Логи работы хеджа

```
[27.12.2025, 15:30:12] [AUTO-SELL] [TAKER] BUY position opened: 5 shares of token-123 @ 0.49 (outcome: Up)
[27.12.2025, 15:30:12] [AUTO-SELL] [TRIGGER] Position @ 0.49 detected (< 0.9 threshold) - will hedge
[27.12.2025, 15:30:12] [AUTO-SELL] [TRIGGER] Waiting 15s for blockchain confirmation...
[27.12.2025, 15:30:27] [AUTO-SELL] [TRIGGER] Auto-selling 5 shares of token-123 (outcome: Up, trade: trade-456)
[27.12.2025, 15:30:27] [AUTO-SELL] Getting opposite token ID for token-123...
[27.12.2025, 15:30:27] [AUTO-SELL] Found opposite token: token-789 (slug: btc-updown-15m-1766880000)
[27.12.2025, 15:30:27] [AUTO-SELL] Buying opposite side: Down @ $0.99 (5 shares) [market: btc-updown-15m-1766880000]
[27.12.2025, 15:30:28] [AUTO-SELL] Hedge order placed: orderId=order-999, side=BUY Down, price=0.99, size=5

[27.12.2025, 15:30:35] [AUTO-SELL] [TAKER] BUY position opened: 5 shares of token-789 @ 0.99 (outcome: Down)
[27.12.2025, 15:30:35] [AUTO-SELL] [SKIP] Ignoring own hedge order @ 0.99 (threshold: 0.9)

[27.12.2025, 15:30:42] [AUTO-SELL] [MAKER] BUY position filled: 5 shares of token-234 @ 0.49 (outcome: Down)
[27.12.2025, 15:30:42] [AUTO-SELL] [SKIP] Market btc-updown-15m-1766880000 already processed (first position already bought)
```

**Что видим:**
1. UP @ $0.49 исполнился → хеджим DOWN @ $0.99 ✅
2. Свой hedge @ $0.99 → пропускаем ✅
3. DOWN @ $0.49 исполнился (второй) → пропускаем (маркет обработан) ✅

### Защита от ошибок

**1. Missing price в payload**
```typescript
price = parseFloat(payload.price || '0');
```
- Fallback на 0
- 0 < 0.90 → trade будет обработан (безопасно)

**2. Missing tokenId в cache**
```typescript
if (!result) {
  logError('Failed to get opposite token ID from cache');
  return;  // Пропускаем trade
}
```

**3. Race condition (2 позиции одновременно)**
```typescript
processedMarkets.add(slug);  // Синхронно!
await tradingService.createLimitOrder(...);  // Async
```
- `processedMarkets.add()` выполняется **до** await
- Первый вызов добавит slug, второй увидит что уже обработано

---

## 🚀 Полный запуск связки (updown-bot-49 + auto-sell-bot)

### В Docker на VPS

```bash
# 1. Зайти в контейнер
docker exec -it tuda-suda-trading bash

# 2. Запустить auto-sell-bot (сначала!)
pm2 start /app/node_modules/.bin/ts-node \
  --name auto-sell-bot \
  -- /app/src/auto-sell-bot.ts

# 3. Вычислить timestamp
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"

# 4. Запустить updown-bot-49
pm2 start /app/node_modules/.bin/ts-node \
  --name updown-bot-49 \
  -- /app/src/updown-bot-49.ts updown-15m-TIMESTAMP

# 5. Проверить оба процесса
pm2 list

# Output:
# ┌────┬─────────────────┬─────────┐
# │ id │ name            │ status  │
# ├────┼─────────────────┼─────────┤
# │ 0  │ auto-sell-bot   │ online  │
# │ 1  │ updown-bot-49   │ online  │
# └────┴─────────────────┴─────────┘

# 6. Мониторинг обоих ботов
pm2 logs
```

### На VPS БЕЗ Docker (PM2)

```bash
cd /root/Tuda_Suda_49

# 1. Запустить auto-sell-bot (сначала!)
pm2 start ./node_modules/.bin/ts-node \
  --name auto-sell-bot \
  -- src/auto-sell-bot.ts

# 2. Вычислить timestamp
node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)"

# 3. Запустить updown-bot-49
pm2 start ./node_modules/.bin/ts-node \
  --name updown-bot-49 \
  -- src/updown-bot-49.ts updown-15m-TIMESTAMP

# 4. Проверить статус
pm2 list

# 5. Сохранить процессы (автозапуск при reboot)
pm2 save
pm2 startup

# 6. Мониторинг
pm2 logs
```

### Мониторинг связки

```bash
# Логи updown-bot-49 (размещение ордеров)
pm2 logs updown-bot-49

# Логи auto-sell-bot (продажа позиций)
pm2 logs auto-sell-bot

# Оба бота одновременно
pm2 logs
```

### Остановка связки

```bash
# Остановить оба бота
pm2 stop updown-bot-49 auto-sell-bot

# Или по отдельности
pm2 stop updown-bot-49
pm2 stop auto-sell-bot
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
  EXPIRATION_MINUTES: 20,         // Expiration за 20 минут до старта
  POLL_INTERVAL_MS: 350,          // Интервал polling Gamma API
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

## FAQ

**Q: Можно ли запустить бота без timestamp?**

A: Нет, при запуске нужно указать начальный timestamp. После этого бот автоматически обрабатывает все последующие маркеты каждые 15 минут.

---

**Q: Можно ли запустить бота на нескольких timestamps одновременно?**

A: Да, запустите несколько PM2 процессов с разными timestamp:
```bash
pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49-1 -- /app/src/updown-bot-49.ts updown-15m-1766571000
pm2 start /app/node_modules/.bin/ts-node --name updown-bot-49-2 -- /app/src/updown-bot-49.ts updown-15m-1766571900
```

---

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

---

**Q: Можно ли изменить размер ордера или цену?**

A: Да, отредактируйте `SIMPLE_CONFIG` в `src/updown-bot-49.ts`:
```typescript
const SIMPLE_CONFIG = {
  PRICE: 0.48,  // Изменить цену
  SIZE: 10,     // Изменить размер
  // ...
};
```

---

**Q: Бот автоматически переходит к следующему timestamp?**

A: Да, бот работает в **непрерывном цикле**:
- Обрабатывает указанный timestamp
- Ждет 1 секунду
- Переходит к следующему (+900 секунд = 15 минут)
- Повторяет бесконечно

Чтобы остановить: `pm2 stop updown-bot-49` или CTRL+C.

---

**Q: Как остановить бота?**

A: `pm2 stop updown-bot-49` или CTRL+C (если запущен в foreground).

---

**Q: Нужно ли запускать auto-sell-bot вместе с updown-bot-49?**

A: Рекомендуется, но не обязательно. auto-sell-bot автоматически продает исполненные позиции, минимизируя риски. Без него позиции будут держаться до expiration (20 минут до старта).

---

**Q: В каком порядке запускать боты?**

A: Сначала **auto-sell-bot**, потом **updown-bot-49**. Это гарантирует что auto-sell-bot готов обработать fills от updown-bot-49.

---

**Q: Можно ли запустить только updown-bot-49 без auto-sell-bot?**

A: Да, updown-bot-49 работает независимо. Но тогда позиции будут держаться до expiration или нужно будет продавать вручную.

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
        ├─ Stream spam (20ms interval)
        └─ Success/Failure report
```

### Workflow

1. **Получение timestamp** - пользователь передает timestamp аргументом
2. **Параллельная обработка** - все 4 криптовалюты обрабатываются одновременно
3. **Polling** - каждый поток опрашивает Gamma API (350ms интервал)
4. **Pre-signing** - подписываем ордера сразу после получения token IDs
5. **Delay** - ждем 22.5 сек (настраиваемо)
6. **Stream spam** - отправляем signed orders каждые 20ms
7. **Успех** - если оба ордера (UP и DOWN) размещены
8. **Следующий timestamp** - +900 сек, повторяем

### Отличия от updown-btc

| Параметр | updown-btc | updown-bot-49 |
|----------|------------|---------------|
| Криптовалюты | Только BTC | BTC, ETH, SOL, XRP |
| Обработка | Последовательная | Параллельная (Promise.all) |
| Капитал | ~$88/timestamp | $19.60/timestamp |
| Ордеров | 10 (5 цен × 2) | 8 (4 валюты × 2) |
| Стратегия | Ladder (разные цены) | Simple (одна цена) |
| Expiration | Индивидуальный | Единый (20 мин до старта) |

---

## Поддержка

- GitHub: https://github.com/Bezoutoff/Tuda_Suda_49
- Issues: https://github.com/Bezoutoff/Tuda_Suda_49/issues

---

## История изменений

- **2025-12-27**: Добавлен детальный алгоритм работы хеджа (auto-sell-bot) - пошаговая логика, фильтры, защита от бесконечного цикла
- **2025-12-27**: fix(auto-sell-bot): фильтр по цене для предотвращения бесконечного цикла хеджирования (HEDGE_PRICE_THRESHOLD = 0.90)
- **2025-12-26**: Обновлен README - PM2 на VPS первым вариантом, исправлен expiration (ДО старта)
- **2025-12-24**: Создан updown-bot-49 - мультивалютный бот (BTC, ETH, SOL, XRP)
- **2025-12-24**: Исправлена ошибка ts-node в Docker (абсолютный путь interpreter)
