# Latency Test: Stream Mode (0ms interval)

**Дата:** 2025-12-05 09:32
**Маркет:** btc-updown-15m-1765013400
**Режим:** Stream spam без задержки между запросами

## Конфигурация

```
SPAM_INTERVAL_MS: 0 (setImmediate вместо setTimeout)
DELAY_BEFORE_SPAM_MS: 19000
TEST_PRICE: 0.45
```

## Порядок фаз (новый)

1. Polling - ожидание маркета
2. Pre-sign - подпись ордера
3. Delay - 19 сек ожидание
4. Spam - непрерывный поток запросов

## Результаты

### Phase 2: Pre-signing
```
Signing took: 598ms
```

### Phase 4: Spam
```
#100: 1.7s elapsed, 100 in-flight
#200: 3.7s elapsed, 200 in-flight
#300: 5.2s elapsed, 300 in-flight
#282: 383ms - SUCCESS!
```

### Успешный ордер
```json
{
  "orderID": "0x9d44827fd73c00d77a526ce72cad7256e22a876ca4335ab848c1be82537dd6c6",
  "status": "live",
  "success": true
}
```

## Статистика

| Метрика | Значение |
|---------|----------|
| Попыток до успеха | 282 |
| Время до успеха | ~5.2s |
| Latency успешного запроса | 383ms |
| In-flight запросов | 309 |
| Скорость запросов | ~60 req/s |

## API Responses (выборка)

### До открытия orderbook
```json
{
  "timestamp": "2025-12-05T09:32:49.490Z",
  "latencyMs": 412,
  "success": false,
  "response": {
    "errorMsg": "the orderbook 43582014774721755323520735899928953502211169737397093309216105374782686131006 does not exist"
  }
}
```

### Успешное размещение
```json
{
  "timestamp": "2025-12-05T09:32:49.508Z",
  "latencyMs": 383,
  "success": true,
  "response": {
    "orderID": "0x9d44827fd73c00d77a526ce72cad7256e22a876ca4335ab848c1be82537dd6c6",
    "status": "live"
  }
}
```

## Выводы

1. **Stream mode работает** - непрерывный поток запросов (0ms interval) успешно размещает ордера
2. **Latency стабильный** - 383-412ms для HTTP запросов
3. **282 попытки** - orderbook появился примерно через 5 секунд после начала спама
4. **In-flight запросы** - до 309 запросов одновременно в полёте
5. **Pre-sign оптимизация** - подпись происходит до delay, экономит ~600ms
