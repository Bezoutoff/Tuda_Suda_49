# Latency Test: Stream Mode (2ms interval)

**Дата:** 2025-12-05 10:17
**Маркет:** btc-updown-15m-1765016100
**Режим:** Stream spam с интервалом 2ms

## Конфигурация

```
SPAM_INTERVAL_MS: 2
DELAY_BEFORE_SPAM_MS: 23500  ← увеличено с 19000
TEST_PRICE: 0.45
```

## Результаты

### Phase 2: Pre-signing
```
Signing took: 603ms
```

### Phase 3: Delay
```
Waiting 23.5s before spam
```

### Phase 4: Spam (2ms interval)
```
#72: 434ms - SUCCESS!
```

### Успешный ордер
```json
{
  "orderID": "0xda308d74d98b7a8d7234fee5724788e61e1116c794e5ba4ac217a3a7d5bbf8d8",
  "status": "live",
  "success": true
}
```

## Статистика

| Метрика | Значение |
|---------|----------|
| Попыток до успеха | **72** |
| Latency успешного запроса | 434ms |
| **Min latency** | **369ms** |
| In-flight запросов | 93 |
| Скорость запросов | ~50 req/s (1000/2ms × ~0.1) |

## Сравнение режимов

| Метрика | 0ms | 0.1ms | 2ms |
|---------|-----|-------|-----|
| Delay | 19s | 19s | **23.5s** |
| Попыток | 282 | 288 | **72** |
| Latency успеха | 383ms | 620ms | 434ms |
| Min latency | - | 292ms | **369ms** |
| In-flight | 309 | 327 | 93 |

## API Responses

### До открытия orderbook
```json
{
  "timestamp": "2025-12-05T10:17:49.816Z",
  "latencyMs": 369,
  "response": {
    "errorMsg": "the orderbook ... does not exist"
  }
}
```

### Успешное размещение
```json
{
  "timestamp": "2025-12-05T10:17:49.893Z",
  "latencyMs": 434,
  "success": true,
  "response": {
    "orderID": "0xda308d74d98b7a8d7234fee5724788e61e1116c794e5ba4ac217a3a7d5bbf8d8",
    "status": "live"
  }
}
```

## Выводы

1. **23.5s delay = меньше попыток** - orderbook открывается ближе к началу спама
2. **72 попытки vs 282-288** - значительное улучшение (в 4 раза меньше)
3. **2ms interval достаточен** - не нужно спамить быстрее
4. **Min latency 369ms** - стабильный HTTP latency
5. **93 in-flight** - оптимальное количество, не перегружаем API

## Рекомендация

Использовать `DELAY_BEFORE_SPAM_MS: 23500` с интервалом 2ms для production.
