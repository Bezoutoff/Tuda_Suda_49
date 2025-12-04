# Результаты тестирования Latency

## Сервер

| Параметр | Значение |
|----------|----------|
| Локация | Toronto, Canada |
| IP адрес | 212.193.6.28 |
| Дата теста | 2025-12-04 |

---

## 0. DNS (IP адреса clob.polymarket.com)

```bash
root@r1071642:~# host clob.polymarket.com
clob.polymarket.com has address 172.64.153.51
clob.polymarket.com has address 104.18.34.205
clob.polymarket.com has IPv6 address 2a06:98c1:3100::ac40:9933
clob.polymarket.com has IPv6 address 2a06:98c1:3104::6812:22cd
```

| Тип | IP адрес | Провайдер |
|-----|----------|-----------|
| IPv4 | 172.64.153.51 | Cloudflare |
| IPv4 | 104.18.34.205 | Cloudflare |
| IPv6 | 2a06:98c1:3100::ac40:9933 | Cloudflare |
| IPv6 | 2a06:98c1:3104::6812:22cd | Cloudflare |

**Примечание:** Все IP принадлежат Cloudflare CDN (anycast). Реальные серверы Polymarket находятся за Cloudflare.

---

## 1. MTR (маршрут через IPv6)

```
HOST: r1071642                    Loss%   Snt   Last   Avg  Best  Wrst StDev
  1.|-- _gateway                   0.0%    10    2.9   5.1   0.4  41.7  12.9
  2.|-- 2001:fec3:fec:1101:100:10  0.0%    10    1.1   2.8   0.9  11.8   3.5
  3.|-- 2001:504:1a::34:7         10.0%    10   21.5   5.5   1.1  21.5   8.0
  4.|-- 2400:cb00:785:3::          0.0%    10    1.2   7.6   1.0  22.7   8.2
  5.|-- 2a06:98c1:3100::ac40:9933  0.0%    10   22.7   4.0   0.9  22.7   6.8
```

**Анализ:**
- 5 хопов до сервера (очень мало!)
- Средняя задержка: 4-7ms
- Потеря пакетов: 0-10% (приемлемо)

---

## 2. Ping (ICMP)

```
PING clob.polymarket.com (2a06:98c1:3104::6812:22cd)
icmp_seq=1: 22.7 ms (cold start)
icmp_seq=2: 0.843 ms
icmp_seq=3: 0.898 ms
icmp_seq=4: 1.51 ms
```

**Анализ:**
- Первый пакет: 22.7ms (cold start, установка соединения)
- Последующие: ~1ms (кэшированный маршрут)
- Сервер находится очень близко!

---

## 3. TCP Traceroute (порт 443)

```
Tracing to clob.polymarket.com (104.18.34.205) on TCP port 443

 1  50.114.177.1                                    0.5-13ms
 2  100.71.1.254                                    0.9-1ms
 3  cloudflare-b.ip4.torontointernetxchange.net     13-15ms
 4  108.162.239.24                                  6-10ms
 5  104.18.34.205 [open]                            0.8-3ms
```

**Анализ:**
- 5 хопов через IPv4
- Проходит через Toronto Internet Exchange (TorIX)
- Конечная точка - Cloudflare CDN (104.18.x.x)
- TCP latency до сервера: **0.8-3ms**

---

## Summary

### Сетевая инфраструктура

| Метрика | Значение | Оценка |
|---------|----------|--------|
| Количество хопов | 5 | Отлично |
| Ping latency | 1-3ms | Отлично |
| TCP latency | 0.8-3ms | Отлично |
| Packet loss | 0-10% | Хорошо |

### Выводы

1. **Отличное расположение сервера** - Toronto VPS находится очень близко к Cloudflare edge серверам через Toronto Internet Exchange (TorIX)

2. **Минимальный сетевой latency** - 1-3ms до сервера Polymarket. Это практически идеальный результат.

3. **Почему HTTP latency выше?**
   - Сетевой ping: ~1-3ms
   - HTTP POST latency: ~300-700ms

   Разница объясняется обработкой на сервере Polymarket:
   ```
   HTTP POST /order breakdown:
   ├─ Network RTT:          ~3ms    (измерено ping/traceroute)
   ├─ TLS handshake:       ~10ms    (первый запрос)
   ├─ SERVER PROCESSING:  ~300ms+   ← главный bottleneck
   │   ├─ API authentication
   │   ├─ Signature validation
   │   ├─ Balance check
   │   ├─ Order matching
   │   └─ Database write
   └─ Response:            ~5ms
   ```

4. **Рекомендации**
   - Сервер в Торонто - отличный выбор, менять не нужно
   - Сетевая часть оптимизирована максимально
   - Bottleneck - обработка на стороне Polymarket (не можем контролировать)
   - Для увеличения шансов: использовать параллельные запросы (уже реализовано)

### Сравнение с другими локациями

| Локация | Ожидаемый ping | Статус |
|---------|----------------|--------|
| Toronto (текущий) | 1-3ms | Отлично |
| New York | 5-15ms | Отлично |
| Los Angeles | 30-50ms | Хорошо |
| Europe | 80-120ms | Средне |
| Asia | 150-250ms | Плохо |

---

## 4. Тест HTTP Latency (test-latency.ts)

### Конфигурация спама

| Параметр | Значение | Описание |
|----------|----------|----------|
| `PARALLEL_SPAM_REQUESTS` | 20 | Параллельных HTTP запросов за batch |
| `DELAY_BEFORE_SPAM_MS` | 19000 | Задержка после обнаружения маркета (19 сек) |
| `TEST_PRICE` | 0.45 | Цена ордера |
| `TEST_EXPIRATION_BUFFER` | 1 сек | Экспирация за 1 сек до старта маркета |
| `MAX_ATTEMPTS` | 5000 | Максимум попыток |

### Логика спама

```
1. Polling: ждём появления маркета в Gamma API
2. Delay: ждём 19 сек (маркет активируется ~25 сек после создания)
3. Pre-sign: подписываем ордер один раз (EIP-712)
4. Spam: отправляем 20 параллельных POST запросов
   └─ Повторяем пока не получим success или max attempts
```

### Лог теста (btc-updown-15m-1764931500)

```csv
timestamp,slug,side,price,latency_ms,success,error
2025-12-04T10:47:48.872Z,btc-updown-15m-1764931500,UP,0.45,411,false,"the orderbook ... does not exist"
2025-12-04T10:47:48.873Z,btc-updown-15m-1764931500,UP,0.45,401,false,"the orderbook ... does not exist"
2025-12-04T10:47:48.874Z,btc-updown-15m-1764931500,UP,0.45,435,false,"the orderbook ... does not exist"
2025-12-04T10:47:48.875Z,btc-updown-15m-1764931500,UP,0.45,429,false,"the orderbook ... does not exist"
2025-12-04T10:47:49.285Z,btc-updown-15m-1764931500,UP,0.45,371,false,"order ... is invalid. Duplicated."
2025-12-04T10:47:49.288Z,btc-updown-15m-1764931500,UP,0.45,402,true,
2025-12-04T10:47:49.290Z,btc-updown-15m-1764931500,UP,0.45,398,false,"order ... already exists"
```

### Расшифровка логов

| Время | Latency | Статус | Что произошло |
|-------|---------|--------|---------------|
| 48.872-48.875 | 401-435ms | ❌ | `orderbook does not exist` — маркет ещё не активирован |
| 49.285 | 371ms | ❌ | `Duplicated` — ордер уже принят другим запросом |
| 49.288 | **402ms** | ✅ | **Успешное размещение ордера!** |
| 49.290 | 398ms | ❌ | `already exists` — дубликат |

### Анализ

**Фаза 1: Ожидание активации** (48.872-48.875)
- Бот отправил 20 параллельных запросов
- Все получили ошибку "orderbook does not exist"
- Маркет ещё не активирован на бирже

**Фаза 2: Успешное размещение** (49.285-49.290)
- Маркет активировался
- Из 20 параллельных запросов один успел первым → `success: true`
- Остальные получили `Duplicated` или `already exists`

**Результаты:**

| Метрика | Значение |
|---------|----------|
| HTTP POST latency | **371-435ms** |
| Успешный запрос | 402ms |
| Время до активации маркета | ~400ms после начала спама |

### Выводы

1. **HTTP latency ~400ms** — это время обработки на сервере Polymarket, не сетевая задержка
2. **Параллельный спам работает** — из 20 запросов один успевает первым
3. **Ошибки — это нормально** — "orderbook does not exist" означает что бот начал спамить до активации маркета (что и нужно!)

---

*Тест выполнен: 2025-12-04T11:07:21+0000*
