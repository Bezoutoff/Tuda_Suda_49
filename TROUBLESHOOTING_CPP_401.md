# Troubleshooting: C++ Latency Test - 401 Unauthorized

## Проблема

C++ latency test (`npm run test-latency-cpp`) возвращает ошибку "Unauthorized/Invalid api key" при отправке ордеров на Polymarket CLOB API.

TypeScript версия (`npm run test-latency`) работает корректно.

## Что было проверено

### 1. HMAC подпись
- **Статус**: Работает корректно
- Base64 decode исправлен для URL-safe base64 (`-` вместо `+`, `_` вместо `/`)
- Подписи Node.js и C++ совпадают при одинаковом timestamp:
  ```
  SIGNATURE COMPARISON (same timestamp):
    Timestamp: 1764937248
    Node.js signature: tFJi+bAFk4xImzuoszJQZvYh6poP0Kq04YTFGVODLEY=
    C++ signature:     tFJi+bAFk4xImzuoszJQZvYh6poP0Kq04YTFGVODLEY=
    Match: YES
  ```

### 2. JSON парсинг
- **Статус**: Работает корректно
- Body length совпадает: 579-581 символов в обоих случаях
- Secret корректно извлекается из JSON

### 3. Заголовки HTTP
- **Статус**: Выглядят корректно
- Все необходимые заголовки присутствуют:
  ```
  POLY-ADDRESS: 0xDC28b3f172A1818729699D7F6Aa68CFF394C1A2e
  POLY-TIMESTAMP: 1764937272
  POLY-API-KEY: 8c54b802-1ef3-b35b-eab1-ba53e47daa73
  POLY-PASSPHRASE: 33e7820502759ca7d5a885b04fcec58b4c24c46fca8bd284ef9e48a0778ca9ec
  POLY-SIGNATURE: 0JJVcJb9XKaB8u9esPT/kzu9H+OHGqLBaKyDqtxHAE0=
  ```

### 4. Server time
- **Статус**: Работает корректно
- C++ получает server time с `/time` endpoint
- Timestamp обновляется каждые 100 запросов

## Что ещё не проверено

### 1. Ручной HTTP запрос из Node.js
Добавлен тест в `test-latency-cpp.ts` — нужно проверить результат.
Если Node.js тоже вернёт 401 при ручном запросе, проблема в подходе, а не в C++.

### 2. Формат тела запроса
Возможно, есть разница в том как curl отправляет body vs fetch.
- Проверить Content-Length
- Проверить encoding (UTF-8)
- Проверить trailing newlines

### 3. HTTP/2 vs HTTP/1.1
libcurl может использовать HTTP/2, а Node.js fetch — HTTP/1.1 (или наоборот).
Попробовать:
```cpp
curl_easy_setopt(curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
```

### 4. TLS/SSL версия
Возможно, разные TLS версии. Проверить:
```cpp
curl_easy_setopt(curl, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_2);
```

### 5. User-Agent
Попробовать добавить User-Agent:
```cpp
curl_slist_append(headers, "User-Agent: polymarket-client/1.0");
```

### 6. Порядок заголовков
Некоторые серверы чувствительны к порядку заголовков.
Проверить порядок в ClobClient и воспроизвести.

### 7. Body encoding в JSON
Возможно, при передаче body через JSON что-то теряется.
Попробовать передать body через файл или аргумент.

## Файлы

- `src/cpp/test-latency.cpp` — C++ HTTP спам
- `src/test-latency-cpp.ts` — Node.js обёртка
- `build-cpp.sh` — скрипт компиляции

## Команды для отладки

```bash
# Пересобрать C++
npm run build:cpp

# Запустить тест
npm run test-latency-cpp btc-updown-15m-<TIMESTAMP>

# Посмотреть логи curl (verbose)
# Добавить в C++: curl_easy_setopt(curl, CURLOPT_VERBOSE, 1L);
```

## Следующие шаги

1. Проверить результат ручного HTTP запроса из Node.js
2. Если Node.js тоже 401 — проблема в формате запроса
3. Если Node.js OK — сравнить raw HTTP запросы (tcpdump/wireshark)
4. Попробовать CURLOPT_VERBOSE для детального лога
