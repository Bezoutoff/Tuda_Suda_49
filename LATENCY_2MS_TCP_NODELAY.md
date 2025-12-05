# Latency Test: 2ms interval + TCP_NODELAY

**Дата:** 2025-12-05 10:32
**Маркет:** btc-updown-15m-1765017000
**Режим:** Stream spam 2ms + TCP_NODELAY patch

## Изменения в этом тесте

### TCP_NODELAY (Nagle's algorithm disabled)
```typescript
// trading-service.ts
function configureHttpsAgent(): void {
  const agent = https.globalAgent;

  // Patch createConnection to enable TCP_NODELAY
  const originalCreateConnection = agent.createConnection;
  agent.createConnection = function(options, callback) {
    const socket = originalCreateConnection.call(this, options, callback);
    if (socket && typeof socket.setNoDelay === 'function') {
      socket.setNoDelay(true);  // Disable Nagle's algorithm
    }
    return socket;
  };
}
```

**Что делает TCP_NODELAY:**
- Отключает алгоритм Нейгла (Nagle's algorithm)
- Пакеты отправляются немедленно, без буферизации
- Уменьшает latency для мелких пакетов (как HTTP запросы)

## Конфигурация

```
SPAM_INTERVAL_MS: 2
DELAY_BEFORE_SPAM_MS: 23500
TEST_PRICE: 0.45
TCP_NODELAY: enabled (via globalAgent patch)
```

## Результаты

### Phase 2: Pre-signing
```
Signing took: 674ms
```

### Phase 4: Spam (2ms interval)
```
#27: 807ms - SUCCESS!
Waiting for 54 pending requests...
```

### Успешный ордер
```json
{
  "orderID": "0x5a4d7c000dbff54f259d716502f2aced29a1e801800ef699a7217979b2c70249",
  "status": "live",
  "success": true
}
```

## Статистика

| Метрика | Значение |
|---------|----------|
| **Попыток до успеха** | **27** |
| Latency успешного запроса | 807ms |
| Min latency | 504ms |
| Max latency | 865ms |
| In-flight запросов | 54 |

## Сравнение с предыдущими тестами

| Метрика | 0ms (19s) | 0.1ms (19s) | 2ms (23.5s) | 2ms + NODELAY |
|---------|-----------|-------------|-------------|---------------|
| Попыток | 282 | 288 | 72 | **27** |
| Latency успеха | 383ms | 620ms | 434ms | 807ms |
| Min latency | - | 292ms | 369ms | 504ms |
| In-flight | 309 | 327 | 93 | 54 |

## API Responses (хронология)

```
10:32:48.786Z - "orderbook does not exist" (504ms)
10:32:48.849Z - "orderbook does not exist" (539ms)
10:32:49.137Z - "orderbook does not exist" (775ms)
10:32:49.266Z - "Duplicated" (865ms)              ← раньше SUCCESS
10:32:49.271Z - "Duplicated" (791ms)              ← раньше SUCCESS
10:32:49.277Z - SUCCESS (807ms)                   ← победитель
10:32:49.288Z - "Duplicated" (829ms)              ← после SUCCESS
```

## Анализ

### Позитивные результаты
1. **27 попыток** — лучший результат! (в 2.7 раза меньше чем 72)
2. **54 in-flight** — оптимальная нагрузка на API
3. Orderbook открылся быстрее относительно старта спама

### Наблюдения по latency
1. Latency выше (504-865ms vs 369-434ms ранее)
2. Возможные причины:
   - Сетевая вариативность (время дня, нагрузка)
   - TCP_NODELAY может не влиять на ClobClient (он может использовать свой HTTP клиент)
   - Случайные флуктуации

### Timestamp парадокс (опять!)
"Duplicated" ошибки пришли в `10:32:49.266Z`, SUCCESS в `10:32:49.277Z`
- Разница: 11ms
- Причина та же: разный latency у параллельных запросов

## Выводы

1. **27 попыток — отличный результат** благодаря правильному timing (23.5s delay)
2. **TCP_NODELAY эффект неясен** — latency выше, но это может быть сетевая вариативность
3. **Главный фактор успеха** — точный timing начала спама относительно открытия orderbook
4. **Рекомендация:** оставить TCP_NODELAY (не мешает), фокус на оптимизации delay
