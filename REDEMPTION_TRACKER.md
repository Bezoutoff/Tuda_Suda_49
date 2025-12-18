# Redemption Tracker - Документация

## Обзор

**Redemption Tracker** — модуль для пропуска уже выкупленных позиций в Redemption Bot. Позволяет избежать повторных попыток выкупа тех же позиций, экономя API запросы и время выполнения.

## Проблема

До внедрения tracker'а:
- Бот находил 60-70 позиций при каждом запуске
- Только 1-5 из них реально нуждались в выкупе
- ~60 позиций уже были выкуплены ранее
- Каждая попытка выкупа вызывала:
  - API запрос к Builder Relayer
  - Ожидание 2-6 секунд на ответ
  - Ошибку AlreadyClaimedException
  - Лишние записи в логах

**Итого:** ~60 лишних API запросов и 2-4 минуты потерянного времени за каждый запуск.

## Решение

Модуль `redeemed_tracker.py` отслеживает успешно выкупленные condition_ids:

1. **При старте бота**: Читает `logs/redemption.csv`
2. **Парсинг**: Извлекает все condition_ids со status='success'
3. **Кэширование**: Сохраняет в Set для O(1) поиска
4. **Фильтрация**: Проверяет каждую позицию перед redemption
5. **Обновление**: Добавляет новые выкупленные condition_ids в кэш

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Redemption Bot Startup                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CSVLogger.__init__()                                    │
│     │                                                       │
│     ▼                                                       │
│  2. RedeemedTracker.__init__(csv_path)                      │
│     │                                                       │
│     ├─► _load_from_csv()                                   │
│     │   ├─► Read logs/redemption.csv                       │
│     │   ├─► Parse each row                                 │
│     │   └─► Add condition_id to Set if status='success'    │
│     │                                                       │
│     └─► logger.info(f"Loaded {count} conditions")          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Redemption Processing                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  3. Fetch positions from API (60-70 found)                  │
│     │                                                       │
│     ▼                                                       │
│  4. Group by condition_id                                   │
│     │                                                       │
│     ▼                                                       │
│  5. Filter groups:                                          │
│     │                                                       │
│     ├─► for each group:                                    │
│     │    ├─► is_already_redeemed(condition_id)?            │
│     │    │   ├─ YES → skip (increment skipped_count)       │
│     │    │   └─ NO  → add to filtered_groups               │
│     │                                                       │
│     ▼                                                       │
│  6. Process only filtered_groups (1-5 positions)            │
│     │                                                       │
│     ├─► submit_redemption()                                │
│     ├─► on success:                                        │
│     │    ├─► csv_logger.log_redemption()                   │
│     │    └─► redeemed_tracker.mark_as_redeemed()           │
│     │        └─► Add condition_id to in-memory Set         │
│     │                                                       │
│     └─► Next run will skip this condition_id               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Файл: scripts/redemption/redeemed_tracker.py

### Класс RedeemedTracker

```python
class RedeemedTracker:
    """
    Tracks condition_ids that have been successfully redeemed.

    Loads from CSV at startup and caches in memory.
    No writing needed - CSV logger handles persistence.
    """
```

### Методы

#### `__init__(csv_path: str)`

Инициализация tracker'а.

**Параметры:**
- `csv_path` (str) - Путь к файлу redemption.csv

**Действия:**
1. Сохраняет путь к CSV
2. Инициализирует пустое множество `_redeemed_conditions`
3. Вызывает `_load_from_csv()` для загрузки истории

**Пример:**
```python
tracker = RedeemedTracker("logs/redemption.csv")
# Загружено 57 ранее выкупленных условий из CSV (0 строк пропущено)
```

#### `_load_from_csv() -> None`

Загружает condition_ids из CSV файла.

**Логика:**
1. Проверяет существование файла
   - Если нет → логирует info и продолжает с пустым Set
2. Открывает CSV с DictReader
3. Для каждой строки:
   - Извлекает `condition_id` и `status`
   - Если `status == 'success'` и `condition_id` не пустой → добавляет в Set
   - При ошибке парсинга строки → логирует warning и пропускает
4. Логирует итоги: сколько загружено, сколько пропущено

**Обработка ошибок:**
- **FileNotFoundError**: "CSV файл не найден: ... (первый запуск?)"
- **Corrupted row**: "Пропуск поврежденной строки CSV {row_num}: {error}"
- **General exception**: "Ошибка загрузки... Начинаем с пустого tracker"

**Пример логов:**
```
[INFO] Загружено 57 ранее выкупленных условий из CSV (0 строк пропущено)
```

#### `is_already_redeemed(condition_id: str) -> bool`

Проверяет был ли condition_id выкуплен ранее.

**Параметры:**
- `condition_id` (str) - Condition ID для проверки

**Возвращает:**
- `True` - Если condition_id уже выкуплен (есть в Set)
- `False` - Если condition_id новый (нет в Set)

**Сложность:** O(1) - поиск в Set

**Пример:**
```python
if tracker.is_already_redeemed("0xabc123..."):
    logger.debug("[SKIP] Already redeemed: 0xabc123...")
    skipped_count += 1
else:
    filtered_groups.append(group)
```

#### `mark_as_redeemed(condition_id: str) -> None`

Помечает condition_id как выкупленный (добавляет в кэш).

**Параметры:**
- `condition_id` (str) - Condition ID который был успешно выкуплен

**Действия:**
1. Проверяет что condition_id ещё не в Set
2. Добавляет в `_redeemed_conditions`
3. Логирует debug: "Помечен как выкупленный: 0xabc123..."

**Примечание:** CSV запись делает CSVLogger отдельно. Этот метод только обновляет in-memory кэш.

**Пример:**
```python
success_count += 1
redeemed_tracker.mark_as_redeemed(group.condition_id)  # Update cache
logger.info(f"[OK] Redemption successful: {condition_id[:8]}...")
```

#### `get_redeemed_count() -> int`

Возвращает количество отслеживаемых condition_ids.

**Возвращает:**
- int - Размер Set'а `_redeemed_conditions`

**Пример:**
```python
count = tracker.get_redeemed_count()
logger.info(f"Загружено {count} ранее выкупленных условий")
```

#### `get_redeemed_conditions() -> Set[str]`

Возвращает копию Set'а всех выкупленных condition_ids.

**Возвращает:**
- Set[str] - Копия множества condition_ids (для предотвращения модификации)

**Использование:**
- Debugging
- Reporting
- Экспорт данных

**Пример:**
```python
all_redeemed = tracker.get_redeemed_conditions()
print(f"Total redeemed: {len(all_redeemed)}")
for cid in sorted(all_redeemed)[:5]:
    print(f"  - {cid}")
```

## Интеграция в main.py

### 1. Импорт

```python
from redemption.redeemed_tracker import RedeemedTracker
```

### 2. Инициализация (после CSVLogger)

```python
csv_logger = CSVLogger(config.csv_log_path)
redeemed_tracker = RedeemedTracker(config.csv_log_path)  # NEW

logger.info(f"Загружено {redeemed_tracker.get_redeemed_count()} ранее выкупленных условий")
```

### 3. Фильтрация (после группировки)

```python
# Group by condition_id
redemption_groups = group_positions_by_condition(positions)
logger.info(f"Found {len(redemption_groups)} conditions, ${total_usdc:.2f} USDC")

# Filter out already redeemed
filtered_groups = []
skipped_count = 0
skipped_usdc = 0.0

for group in redemption_groups:
    if redeemed_tracker.is_already_redeemed(group.condition_id):
        logger.debug(f"[SKIP] Already redeemed: {group.condition_id[:8]}...")
        skipped_count += 1
        skipped_usdc += group.total_amount / 1e6
    else:
        filtered_groups.append(group)

logger.info(
    f"Filtered: {len(filtered_groups)} to redeem (${...:.2f}), "
    f"{skipped_count} already redeemed (${skipped_usdc:.2f})"
)

redemption_groups = filtered_groups  # Replace with filtered list
```

### 4. Early Exit (если всё выкуплено)

```python
if not redemption_groups:
    logger.info("All positions already redeemed, nothing to do")
    telegram.notify_no_positions()
    return 0
```

### 5. Обновление кэша (после успешного redemption)

```python
success_count += 1
redeemed_tracker.mark_as_redeemed(group.condition_id)  # NEW
logger.info(f"[OK] Redemption successful: {group.condition_id[:8]}...")
```

### 6. Итоги (добавить skipped_count)

```python
logger.info("Redemption Summary:")
logger.info(f"  [OK] Success: {success_count}")
logger.info(f"  [SKIP] Already claimed: {already_claimed_count}")
logger.info(f"  [SKIP] Previously redeemed: {skipped_count}")  # NEW
logger.info(f"  [ERROR] Errors: {error_count}")
logger.info(f"  Total processed: {len(redemption_groups)}")
```

## Edge Cases

### 1. CSV не существует (первый запуск)

**Сценарий:** Бот запускается в первый раз, файл `logs/redemption.csv` отсутствует.

**Поведение:**
```python
if not self.csv_path.exists():
    logger.info(f"CSV файл не найден: {self.csv_path} (первый запуск?)")
    return
```

**Результат:**
- Tracker начинает с пустого Set
- Все позиции будут обработаны
- CSV создастся после первого успешного redemption

### 2. Поврежденные строки в CSV

**Сценарий:** CSV содержит строки с некорректным форматом.

**Поведение:**
```python
try:
    condition_id = row.get('condition_id', '').strip()
    status = row.get('status', '').strip()
    # Process...
except Exception as e:
    logger.warning(f"Пропуск поврежденной строки CSV {row_num}: {e}")
    error_count += 1
    continue
```

**Результат:**
- Плохая строка пропускается
- Логируется warning
- Парсинг продолжается со следующей строки

### 3. AlreadyClaimedException всё ещё происходит

**Сценарий:** Позиция была выкуплена вне этого бота (например, вручную через UI).

**Поведение:**
- Tracker не знает об этой позиции (её нет в CSV бота)
- Бот попытается выкупить
- Relayer вернёт ошибку "already redeemed"
- `AlreadyClaimedException` будет поймано в main.py
- Запишется в CSV со status='already_claimed'

**Результат:**
- Existing обработка работает корректно
- В следующий раз эта позиция НЕ будет пропущена tracker'ом (status != 'success')
- Но relayer вернёт ту же ошибку

**Решение:** Можно расширить tracker для отслеживания status='already_claimed' тоже.

### 4. Множественные исходы для одного condition

**Сценарий:** Один condition_id имеет несколько outcomes (index_sets: [1, 2]).

**Поведение:**
- Tracker отслеживает по condition_id, не по index_set
- При успешном redemption ВСЕХ outcomes одного condition:
  ```python
  redeemed_tracker.mark_as_redeemed(group.condition_id)
  ```
- В следующий раз весь condition будет пропущен

**Результат:**
- Корректно - один redemption выкупает все outcomes сразу
- Нет необходимости отслеживать по отдельным index_sets

### 5. Одновременные запуски

**Сценарий:** Два экземпляра бота запускаются одновременно.

**Поведение:**
- **Невозможно** - systemd timer запускает oneshot service
- Service не завершился → timer не запустит второй раз
- `Type=oneshot` гарантирует последовательность

**Результат:** Не проблема для этого use case.

## Производительность

### Память

**Структура данных:** `Set[str]`

**Размер:**
- 1 condition_id = 66 символов (0x + 64 hex)
- Python Set overhead ≈ 8 bytes per entry + 66 bytes string
- 100 condition_ids ≈ 7.4 KB
- 1000 condition_ids ≈ 74 KB

**Вывод:** Negligible (незначительно).

### Startup Time

**Операции:**
1. Open file (~1ms)
2. CSV parsing (83 lines) ≈ 5-10ms
3. Set insertions (57 items) ≈ 1ms

**Итого:** ~10-15ms (незаметно)

### Lookup Time

**Операция:** `is_already_redeemed(condition_id)`

**Сложность:** O(1) - hash set lookup

**Время:** ~0.001ms per lookup

**Для 70 позиций:** ~0.07ms total (незаметно)

## Результаты

### До внедрения tracker'а

```
[INFO] Found 65 conditions, $968.50 USDC
[INFO] Processing 65 redemptions...
[OK] Redemption successful: 0xabc123...
[OK] Redemption successful: 0xdef456...
[OK] Redemption successful: 0x789abc...
[SKIP] Already claimed: 0x111222...
[SKIP] Already claimed: 0x333444...
... (60 раз) ...
[SKIP] Already claimed: 0xfff000...

Summary:
  [OK] Success: 5
  [SKIP] Already claimed: 60
  [ERROR] Errors: 0
  Total processed: 65

Execution time: ~4 minutes
```

### После внедрения tracker'а

```
[INFO] Загружено 57 ранее выкупленных условий из CSV (0 строк пропущено)
[INFO] Found 65 conditions, $968.50 USDC
[INFO] Filtered: 8 to redeem ($78.50), 57 already redeemed ($890.00)
[INFO] Processing 8 redemptions...
[OK] Redemption successful: 0xabc123...
[OK] Redemption successful: 0xdef456...
[OK] Redemption successful: 0x789abc...
[SKIP] Already claimed: 0x111222... (external redemption)
[SKIP] Already claimed: 0x333444... (external redemption)
[SKIP] Already claimed: 0x555666... (external redemption)

Summary:
  [OK] Success: 5
  [SKIP] Already claimed: 3
  [SKIP] Previously redeemed: 57
  [ERROR] Errors: 0
  Total processed: 8

Execution time: ~45 seconds
```

### Улучшения

| Метрика | До | После | Улучшение |
|---------|-----|--------|-----------|
| API запросов к relayer | 65 | 8 | -88% |
| AlreadyClaimedException | 60 | 3 | -95% |
| Время выполнения | ~4 мин | ~45 сек | -81% |
| Позиций обработано | 65 | 8 | -88% |
| Записей в логах | 65 | 8 | -88% |

## Расширения (Future)

### 1. Отслеживание status='already_claimed'

**Проблема:** Позиции выкупленные вне бота (UI) вызывают AlreadyClaimedException каждый раз.

**Решение:**
```python
# В _load_from_csv()
if status in ['success', 'already_claimed'] and condition_id:
    self._redeemed_conditions.add(condition_id)
```

**Преимущество:** Ещё меньше лишних запросов.

### 2. Expiry tracking

**Проблема:** Некоторые positions могут "вернуться" (если произошёл revert).

**Решение:**
```python
self._redeemed_with_time: Dict[str, datetime] = {}

# Re-check positions older than N days
if (now - redeemed_time).days > 30:
    # Allow re-processing
```

**Преимущество:** Обработка edge cases с reverted transactions.

### 3. Manual reset

**Проблема:** Иногда нужно переобработать все позиции.

**Решение:**
```bash
python scripts/redemption/main.py --ignore-tracker
```

**Реализация:**
```python
if args.ignore_tracker:
    redeemed_tracker = None  # Don't initialize
```

### 4. Statistics export

**Функция:**
```python
def export_stats():
    stats = {
        'total_redeemed': tracker.get_redeemed_count(),
        'oldest_redemption': min(redeemed_timestamps),
        'newest_redemption': max(redeemed_timestamps),
        'total_value_usdc': sum(amounts),
    }
    json.dump(stats, open('redemption_stats.json', 'w'))
```

## Тестирование

### Unit Test: Empty CSV

```python
import tempfile
from pathlib import Path

# Create empty CSV (only header)
csv_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
csv_file.write("timestamp,condition_id,status\n")
csv_file.close()

tracker = RedeemedTracker(csv_file.name)
assert tracker.get_redeemed_count() == 0
assert not tracker.is_already_redeemed("0xabc123")
```

### Unit Test: Normal CSV

```python
csv_content = """timestamp,condition_id,status
2025-12-18T10:00:00,0xabc123,success
2025-12-18T10:05:00,0xdef456,success
2025-12-18T10:10:00,0x789abc,error
"""

csv_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
csv_file.write(csv_content)
csv_file.close()

tracker = RedeemedTracker(csv_file.name)
assert tracker.get_redeemed_count() == 2  # Only 'success'
assert tracker.is_already_redeemed("0xabc123")
assert tracker.is_already_redeemed("0xdef456")
assert not tracker.is_already_redeemed("0x789abc")  # error status
```

### Integration Test

```bash
# First run - no CSV
python scripts/redemption/main.py
# → Processes 5 positions, creates CSV with 5 success

# Second run - with CSV
python scripts/redemption/main.py
# → Loads 5 conditions, skips them, processes 0 new
```

## Мониторинг

### Логи

Проверяйте startup log для количества загруженных условий:
```
[INFO] Загружено 57 ранее выкупленных условий из CSV (0 строк пропущено)
```

### Метрики

Отслеживайте в summary:
```
[SKIP] Previously redeemed: 57
```

### CSV

Проверяйте рост CSV:
```bash
wc -l logs/redemption.csv
# 84 (header + 83 entries)

# Check for duplicates
cut -d',' -f2 logs/redemption.csv | sort | uniq -d
# (should be empty for successful runs)
```

### Systemd

```bash
# Check timer
sudo systemctl status redemption-bot.timer

# Check logs
sudo journalctl -u redemption-bot.service -n 50 --no-pager | grep "Previously redeemed"
```

## Troubleshooting

### Tracker загружает 0 conditions (но CSV не пустой)

**Проверка:**
```python
python3 -c "
import csv
with open('logs/redemption.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(f\"status={row.get('status')}, cid={row.get('condition_id')}\")
        break
"
```

**Возможные причины:**
- Неправильные имена колонок в CSV
- Все записи имеют status != 'success'
- CSV поврежден

### Tracker пропускает позиции которых нет в CSV

**Проверка:**
```bash
grep "0xabc123" logs/redemption.csv
# Должно вернуть строку с этим condition_id
```

**Возможная причина:**
- Condition_id в памяти но не в CSV (in-memory cache из текущего запуска)
- Restart бота → кэш сбросится, загрузится только из CSV

### Слишком много "Already claimed" (не "Previously redeemed")

**Проблема:** Позиции выкупаются вне бота (UI).

**Решение:** Расширить tracker для отслеживания 'already_claimed' тоже (см. Расширения).

---

## История изменений

- **2025-12-18**: Initial release - Redemption Tracker v1.0
  - RedeemedTracker class
  - Integration в main.py
  - Фильтрация перед redemption
  - ~90% reduction в API calls
