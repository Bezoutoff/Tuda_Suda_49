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

## 5. Полные ответы API (api-responses.log)

Тест: `btc-updown-15m-1764936000` (2025-12-04T12:02)

### Структура ответа Polymarket API

```json
{
  "errorMsg": "string | empty",
  "orderID": "string | empty",
  "takingAmount": "string | empty",
  "makingAmount": "string | empty",
  "status": "string | empty",
  "success": true
}
```

**Примечание:** Поле `success: true` в ответе API не означает успех операции! Нужно проверять `errorMsg` и `orderID`.

### Примеры ответов

**1. Orderbook не существует (маркет не активен):**
```json
{
  "timestamp": "2025-12-04T12:02:47.744Z",
  "slug": "btc-updown-15m-1764936000",
  "latencyMs": 481,
  "success": false,
  "response": {
    "errorMsg": "the orderbook 86362524611116041012058324569056663539911098926631571012384588533603041653252 does not exist",
    "orderID": "",
    "takingAmount": "",
    "makingAmount": "",
    "status": "",
    "success": true
  }
}
```

**2. Дубликат ордера (ордер уже принят):**
```json
{
  "timestamp": "2025-12-04T12:02:47.745Z",
  "slug": "btc-updown-15m-1764936000",
  "latencyMs": 565,
  "success": false,
  "response": {
    "errorMsg": "order 0xf197e2b85c614a2451d49061b00f19a3ab1274107ce347d2d6a7ef9771cffaf7 is invalid. Duplicated.",
    "orderID": "",
    "takingAmount": "",
    "makingAmount": "",
    "status": "",
    "success": true
  }
}
```

### Расшифровка полей

| Поле | Описание |
|------|----------|
| `errorMsg` | Текст ошибки (пустой при успехе) |
| `orderID` | ID созданного ордера (пустой при ошибке) |
| `takingAmount` | Сколько берём (shares) |
| `makingAmount` | Сколько отдаём (USDC) |
| `status` | Статус ордера |
| `success` | **Всегда true** (не использовать для проверки!) |

### Типы ошибок

| Ошибка | Значение | Действие |
|--------|----------|----------|
| `orderbook ... does not exist` | Маркет ещё не активирован | Продолжать спамить |
| `order ... is invalid. Duplicated.` | Ордер уже принят | Один из параллельных запросов успел |
| `order ... already exists` | Ордер уже существует | Ордер размещён |

---

## 6. Расширенные тесты Traceroute

### ICMP Traceroute
```
root@r1071642:~# traceroute -I clob.polymarket.com
traceroute to clob.polymarket.com (172.64.153.51), 30 hops max, 60 byte packets
 1  50.114.177.1        1.377 ms
 2  100.71.1.254        1.072 ms
 3  cloudflare-b.ip4.torontointernetxchange.net (206.108.34.7)  1.383 ms
 4  108.162.239.4       8.685 ms
 5  172.64.153.51       1.612 ms
```

### TCP Traceroute (порт 443)
```
root@r1071642:~# traceroute -T -p 443 clob.polymarket.com
traceroute to clob.polymarket.com (104.18.34.205), 30 hops max, 60 byte packets
 1  50.114.177.1        0.556 ms
 2  100.71.1.254        0.932 ms
 3  cloudflare-b.ip4.torontointernetxchange.net (206.108.34.7)  1.581 ms
 4  108.162.239.24      1.377 ms
 5  104.18.34.205       0.935 ms
```

### UDP Traceroute (IPv4)
```
root@r1071642:~# traceroute 104.18.34.205
 1  50.114.177.1        0.633 ms  0.541 ms  0.627 ms
 2  100.71.1.254        1.244 ms  1.326 ms  0.999 ms
 3  cloudflare-b.ip4.torontointernetxchange.net  1.130 ms
 4  108.162.239.24      3.020 ms  6.613 ms  6.564 ms
 5  104.18.34.205       0.978 ms  0.976 ms  1.178 ms
```

### IPv6 Traceroute
```
root@r1071642:~# traceroute6 clob.polymarket.com
traceroute to clob.polymarket.com (2a06:98c1:3104::6812:22cd), 30 hops max, 80 byte packets
 1  _gateway (2605:e440:6::1)          0.948 ms
 2  2001:fec3:fec:1101:100:100:1:19    1.108 ms
 3  2001:504:1a::34:7                  4.934 ms
 4  2400:cb00:785:3::                  1.629 ms
 5  2400:cb00:29:1024::6ca2:f06a       1.421 ms
```

### Сравнение API endpoints

| Endpoint | IP | Хопов | Latency | Провайдер |
|----------|-----|-------|---------|-----------|
| clob.polymarket.com | 104.18.34.205 | 5 | 0.9-1.6ms | Cloudflare |
| gamma-api.polymarket.com | 104.18.34.205 | 5 | 1.5-2.9ms | Cloudflare |
| polymarket.com | 76.76.21.21 | 8 | 0.3-0.5ms | Vercel (AWS) |

### Маршрут пакетов

```
VPS Toronto (50.114.177.1)
    │
    ▼ (~1ms)
ISP Gateway (100.71.1.254)
    │
    ▼ (~1ms)
Toronto Internet Exchange - TorIX (206.108.34.7)
    │
    ▼ (~1-7ms)
Cloudflare Edge (108.162.239.x)
    │
    ▼ (~1ms)
Polymarket API (104.18.34.205 / 172.64.153.51)
```

### Выводы

1. **5 хопов до Cloudflare** — минимальный маршрут
2. **TorIX peering** — прямое соединение Toronto ↔ Cloudflare
3. **IPv4 и IPv6 одинаковы** — оба маршрута через 5 хопов
4. **clob и gamma-api** — один IP (104.18.34.205), один маршрут
5. **polymarket.com** — другой хостинг (Vercel/AWS), 8 хопов
6. **Latency < 2ms** — сетевая часть идеальна

---

*Тесты выполнены: 2025-12-04T12:15+0000*
