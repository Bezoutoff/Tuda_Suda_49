# CLAUDE.md - Документация проекта Tuda Suda 49

## Обзор проекта

**Tuda Suda 49** — автоматический бот для торговли на Polymarket. Бот отслеживает появление новых BTC updown 15-минутных маркетов и мгновенно размещает ордера на покупку по 49 центов на оба исхода (YES и NO).

### Название
"Туда-Сюда 49" — отражает стратегию: ставим и туда (YES), и сюда (NO) по 49 центов.

### Стратегия
BTC updown маркеты — это краткосрочные (15 минут) бинарные опционы на движение цены Bitcoin. Стратегия заключается в том, чтобы быть первым в очереди на обоих исходах по выгодной цене 49¢. Если ордер исполнится по 49¢, а реальная вероятность ~50%, то есть небольшое преимущество.

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Tuda Suda 49 Bot                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ WebSocket       │    │ Trading         │                │
│  │ Client (RTDS)   │───▶│ Service         │                │
│  └─────────────────┘    └─────────────────┘                │
│          │                      │                          │
│          │                      │                          │
│          ▼                      ▼                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ Market Filter   │    │ CLOB Client     │                │
│  │ (btc-updown-15m)│    │ (Order API)     │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Компоненты

1. **WebSocket Client** (`@polymarket/real-time-data-client`)
   - Подключается к Polymarket RTDS (Real-Time Data Service)
   - Подписывается на topic `clob_market`, type `market_created`
   - Получает уведомления о создании новых маркетов в реальном времени

2. **Market Filter**
   - Фильтрует входящие маркеты по паттерну `btc-updown-15m`
   - Извлекает timestamp начала торгов из slug (например: `btc-updown-15m-1764054900`)
   - Предотвращает дублирование обработки

3. **Trading Service** (`@polymarket/clob-client`)
   - Создаёт и отправляет лимитные ордера на биржу
   - Поддерживает GTD (Good-Til-Date) ордера с автоматической отменой
   - Использует POLY_PROXY signature type для подписи

## Файловая структура

```
Tuda_Suda_49/
├── src/
│   ├── bot.ts              # Entry point, основная логика бота
│   ├── config.ts           # Конфигурация бота и trading
│   ├── trading-service.ts  # Сервис создания ордеров (упрощённый)
│   └── types.ts            # TypeScript типы
├── package.json            # Зависимости и скрипты
├── tsconfig.json           # Конфигурация TypeScript
├── .env                    # Секреты (НЕ в git!)
├── .env.example            # Пример конфигурации
├── .gitignore
├── README.md               # Инструкция для пользователей
└── CLAUDE.md               # Этот файл (документация для Claude)
```

## Ключевые файлы

### src/bot.ts
Основной файл бота. Содержит:
- `main()` — инициализация и запуск
- `handleMarketCreated()` — обработка нового маркета
- `placeAutoOrders()` — размещение ордеров YES и NO
- `fetchTokenIdsFromGamma()` — fallback для получения token IDs

### src/config.ts
Конфигурация:
- `BOT_CONFIG` — параметры бота (паттерн маркета, цена, размер)
- `tradingConfig` — настройки trading service из .env
- Вспомогательные функции: `getOrderSize()`, `extractStartTimestamp()`, `isBtcUpdownMarket()`

### src/trading-service.ts
Упрощённая версия trading service из live-trade-PM:
- `createLimitOrder()` — создание лимитного ордера
- `cancelOrder()` — отмена ордера
- Поддержка GTC и GTD ордеров

### src/types.ts
TypeScript типы:
- `TradingConfig` — конфигурация trading service
- `CreateOrderRequest` — параметры создания ордера
- `Order` — структура ордера
- `OrderUpdate` — обновление статуса

## Конфигурация (.env)

```env
# Приватный ключ кошелька (64 символа БЕЗ 0x)
PK=your_private_key_here

# API credentials для Polymarket CLOB
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase

# Адрес funder (для POLY_PROXY, опционально)
FUNDER=0x...

# Размер ордера в USDC
BOT_ORDER_SIZE=10
```

## Логика работы

### 1. Запуск
```
npm start
```
- Загружает .env
- Инициализирует TradingService
- Подключается к Polymarket RTDS
- Подписывается на `market_created`

### 2. Получение нового маркета
Когда Polymarket создаёт новый маркет, RTDS отправляет сообщение:
```json
{
  "type": "market_created",
  "slug": "btc-updown-15m-1764054900",
  "tokens": [
    { "token_id": "123...", "outcome": "Up" },
    { "token_id": "456...", "outcome": "Down" }
  ]
}
```

### 3. Фильтрация
Бот проверяет:
- Содержит ли slug паттерн `btc-updown-15m`
- Не обрабатывался ли этот маркет ранее

### 4. Извлечение данных
- Timestamp начала: `1764054900` из slug
- Token IDs для YES и NO из сообщения или Gamma API

### 5. Размещение ордеров
Два GTD ордера:
- **YES** @ 0.49 (49 центов)
- **NO** @ 0.49 (49 центов)

GTD expiration = timestamp начала торгов - 60 секунд (буфер)

## API и зависимости

### Polymarket APIs
- **RTDS WebSocket**: `wss://...` — real-time события
- **CLOB REST API**: `https://clob.polymarket.com` — создание ордеров
- **Gamma API**: `https://gamma-api.polymarket.com` — информация о маркетах

### npm зависимости
```json
{
  "@polymarket/clob-client": "^4.22.8",
  "@polymarket/real-time-data-client": "^1.4.0",
  "dotenv": "^17.2.3",
  "ethers": "^5.8.0"
}
```

## Связь с live-trade-PM

Этот проект был выделен из `live-trade-PM` (торговый терминал). Ключевые отличия:

| Аспект | live-trade-PM | Tuda_Suda_49 |
|--------|---------------|--------------|
| Назначение | Ручная торговля с UI | Автоматический бот |
| UI | Electron + HTML | Нет (только консоль) |
| Парсеры | Bwin, Pinnacle, Polymarket | Только Polymarket |
| Trading Service | Полная версия | Упрощённая версия |
| Размер | ~50+ файлов | 4 файла в src/ |

## Команды

```bash
# Запуск бота
npm start

# Запуск в dev режиме (с перезапуском при изменениях)
npm run dev

# Компиляция TypeScript
npm run build
```

## Возможные улучшения

1. **Мониторинг исполнения** — отслеживание fills через RTDS `clob_user` topic
2. **Динамическая цена** — анализ order book перед размещением
3. **Множественные паттерны** — поддержка других updown маркетов (ETH, SOL)
4. **Telegram уведомления** — оповещения о новых маркетах и исполнении
5. **Логирование в файл** — сохранение истории операций
6. **Graceful shutdown** — корректное завершение при остановке

## Troubleshooting

### Ошибка "API credentials required"
Проверьте что в .env заданы CLOB_API_KEY, CLOB_SECRET, CLOB_PASS_PHRASE

### Ордера не создаются
1. Проверьте баланс USDC на Polymarket
2. Проверьте что funder address корректный
3. Проверьте логи на ошибки от CLOB API

### Бот не видит новые маркеты
1. Проверьте подключение к RTDS (должен быть лог "Connected")
2. Убедитесь что подписка активна ("Subscribed to market_created")
3. BTC updown маркеты создаются каждые 15 минут

## Тестирование Latency

### src/test-latency.ts

Скрипт для измерения latency HTTP POST запросов к Polymarket CLOB API.

**Логика работы:**
1. Polling Gamma API до появления маркета
2. Ждёт DELAY_BEFORE_SPAM_MS (19 сек)
3. Pre-sign 1 ордер (UP @ 0.45, expiration = 1 сек до старта)
4. Spam postSignedOrder() с 20 параллельными запросами
5. Логирует каждый запрос в CSV файл
6. Выводит статистику: min, max, avg, median

**Запуск:**
```bash
npm run test-latency btc-updown-15m-1764930600
```

**CSV файл:** `latency.csv`
```csv
timestamp,slug,side,price,latency_ms,success,error
```

**Типичные значения latency:**
- США (близко к серверам): ~250-300ms
- Европа: ~400-500ms
- Азия/далеко: ~600-800ms

**Влияние на бота:**
- Latency определяет сколько попыток бот успеет сделать
- При 285ms за 6 сек = ~420 попыток
- При 600ms за 6 сек = ~200 попыток (в 2 раза меньше!)

### Компоненты latency

```
HTTP POST /order:
├─ DNS резолв:           ~1ms   (кэшируется)
├─ TCP/TLS handshake:    ~10ms  (keep-alive)
├─ СЕРВЕР ОБРАБОТКА:   ~250ms   ← главный bottleneck
│   ├─ Валидация подписи
│   ├─ Проверка баланса
│   ├─ Matching engine
│   └─ Запись в БД
└─ Ответ сервера:       ~20ms
```

## C++ Latency Test

### Статус: ✅ Raw HTTP работает

C++ версия latency теста для сравнения с TypeScript.
Цель: проверить, даст ли C++ на libcurl выигрыш в latency.

### Файлы
- `src/cpp/test-latency.cpp` — C++ HTTP спам с libcurl + OpenSSL HMAC
- `src/test-latency-cpp.ts` — Node.js обёртка (polling + pre-sign)
- `build-cpp.sh` — скрипт компиляции для Ubuntu

### Запуск
```bash
npm run build:cpp  # компиляция C++
npm run test-latency-cpp btc-updown-15m-TIMESTAMP
```

### Решённые проблемы

#### 1. 401 Unauthorized
- **POLY_ADDRESS**: Нужен wallet address, не funder address
- **Header names**: `POLY_ADDRESS` (underscore), не `POLY-ADDRESS` (hyphen)
- **Signature**: URL-safe base64 (`+`→`-`, `/`→`_`)

#### 2. 400 "Invalid order payload"
SDK конвертирует типы в `orderToJson()`:
- `side: 0` → `side: "BUY"` (строка, не число!)
- `orderType: 1` → `orderType: "GTD"` (строка, не число!)

**Исправление:**
```typescript
const transformedOrder = {
  ...signedOrder,
  salt: parseInt(signedOrder.salt, 10),
  side: signedOrder.side === 0 ? 'BUY' : 'SELL',  // KEY FIX
};

const orderBody = JSON.stringify([{
  deferExec: false,
  order: transformedOrder,
  owner: tradingConfig.apiKey,
  orderType: 'GTD',  // String, not number!
}]);
```

### Команды
```bash
# Установка зависимостей (Ubuntu)
sudo apt-get install -y build-essential libcurl4-openssl-dev libssl-dev

# Компиляция
npm run build:cpp

# Запуск
npm run test-latency-cpp btc-updown-15m-<TIMESTAMP>
```

## Визуализация Latency (Python)

### Файл: `scripts/plot_latency.py`

Скрипт для построения графиков latency на основе `latency.csv`.

**Установка зависимостей:**
```bash
pip install pandas matplotlib
```

**Запуск:**
```bash
python scripts/plot_latency.py latency.csv
```

**Функции:**
- Загружает CSV с результатами latency тестов
- Строит график latency во времени с точными значениями (мс) над каждой точкой
- Показывает время в формате HH:MM:SS.mmm на оси X
- Строит гистограмму распределения latency
- Выводит статистику: min, max, mean, median, std, P95, P99
- Сохраняет PNG файл
- Тёмная тема

**Выходные файлы:**
- `latency_plot.png` — графики latency

## Troubleshooting (Расширенный)

### C++ Latency Test: latencyRecords.length = 0

**Проблема:** В логах `[TRACK] latencyRecords.length = 0` даже после вызова `trackLatency()`.

**Причина:** Функция `shouldLog()` возвращала `false` для ошибок с сообщением "the orderbook ... does not exist" — проверка `error?.includes('does not exist')` не срабатывала из-за другого формата сообщения.

**Решение:** Изменить `shouldLog()` чтобы логировать все попытки:
```typescript
function shouldLog(success: boolean, error?: string): boolean {
  if (success) return true;
  if (error?.includes('does not exist')) return true;
  return true;  // Log all attempts
}
```

### C++ stdout не доходит до Node.js

**Проблема:** ATTEMPT: строки из C++ не появлялись в Node.js.

**Причина:** C++ stdout буферизуется, данные не сбрасываются сразу.

**Решение:** Добавить `std::cout.flush()` после каждого вывода в C++:
```cpp
std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":true:" << orderId << std::endl;
std::cout.flush();
```

### Ордер не отображается на Polymarket

**Проблема:** Лог показывает успех (status 200), но ордер не виден.

**Причина:** Expiration был в прошлом относительно времени отправки. Ордер мгновенно истекал.

**Решение:** Использовать `expirationBuffer` из `ORDER_CONFIG` вместо захардкоженного значения:
```typescript
const expirationTimestamp = marketTimestamp - TEST_EXPIRATION_BUFFER;
```

### Status 200 но orderID пустой

**Проблема:** HTTP 200 OK, но в ответе `orderID: ""` и ордер не поставлен.

**Причина:** Код проверял только `status === 200`, но не проверял что `orderID` не пустой. Сервер возвращает 200 даже когда orderbook не существует.

**Решение:** Добавить проверку `orderID`:
```typescript
if (rawResp.status === 200) {
  const parsed = JSON.parse(rawResult);
  const orderId = parsed[0]?.orderID || '';
  if (orderId) {
    // Успех - ордер реально поставлен
  } else {
    // Orderbook не существует
  }
}
```

### CSV: разное количество колонок

**Проблема:** pandas не может прочитать CSV с разным количеством колонок (старый формат 12, новый 19).

**Решение:** Читать по позиции колонок:
```python
df = pd.read_csv(csv_path, header=None, skiprows=1,
                 usecols=[0, 7, 8],
                 names=['server_time_ms', 'latency_ms', 'status'])
```

### Polymarket добавляет +60 сек к expiration

**Проблема:** Ордер закрывается за 90 сек до старта вместо ожидаемых 30 сек.

**Причина:** Polymarket автоматически добавляет +60 секунд к значению expiration при создании GTD ордера.

**Решение:** Вычитать 60 из желаемого значения expirationBuffer:
```typescript
// Хотим: 30 сек до старта
// PM добавит +60, получится: 30+60 = 90 сек до старта
// Поэтому ставим: 30-60 = -30
{ price: 0.45, size: 10, expirationBuffer: -30 },  // 30 сек до старта
```

**Формула:** `expirationBuffer = желаемое_время_до_старта - 60`

## История

- **2025-12-09**: Fix expirationBuffer - учёт +60 сек от Polymarket
- **2025-12-08**: Python визуализация latency (plot_latency.py), тёмная тема, подписи значений
- **2025-12-08**: Fix latencyRecords tracking - shouldLog() теперь логирует все попытки
- **2025-12-08**: Fix C++ stdout buffering - добавлен flush()
- **2025-12-08**: Fix expiration - использование ORDER_CONFIG.expirationBuffer
- **2025-12-05**: C++ latency test — Auth работает! (fix: wallet addr, underscore headers, URL-safe base64)
- **2025-12-04**: Добавлен test-latency.ts для измерения latency
- **2025-12-03**: 10 ордеров с индивидуальными expiration times
- **2025-11-25**: Создан проект, выделен из live-trade-PM
- Репозиторий: https://github.com/Bezoutoff/Tuda_Suda_49
