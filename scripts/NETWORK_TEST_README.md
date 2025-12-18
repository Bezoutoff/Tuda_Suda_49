# Network Test for Polymarket VPS

Простой bash скрипт для измерения сетевых показателей (ping, traceroute, IP) до серверов Polymarket.

## Назначение

Использовать для сравнения различных VPS серверов перед развертыванием торговых ботов. Latency и качество сетевого соединения критически важны для успешной работы ботов.

## Что тестируется

1. **DNS Resolution** - IP адреса серверов Polymarket
2. **Ping** - latency (min/avg/max/mdev), packet loss
3. **Traceroute** - количество хопов, маршрут до сервера
4. **MTR** - объединенный отчет (ping + traceroute по каждому хопу)

## Тестируемые endpoint'ы

- `clob.polymarket.com` - CLOB API (основной для торговли)
- `gamma-api.polymarket.com` - Gamma API (информация о маркетах)

## Требования

- **OS**: Ubuntu 22.04/24.04 (или любой Debian-based Linux)
- **Зависимости**:
  - `dnsutils` (dig) или `nslookup`
  - `iputils-ping` (ping)
  - `traceroute`
  - `mtr-tiny` (опционально, но рекомендуется)

## Установка

### 1. Установить зависимости

```bash
sudo apt-get update
sudo apt-get install -y dnsutils iputils-ping traceroute mtr-tiny
```

### 2. Скачать скрипт

**Вариант A: Клонировать репозиторий**

```bash
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49/scripts
chmod +x network-test.sh
```

**Вариант B: Скачать только скрипт**

```bash
wget https://raw.githubusercontent.com/Bezoutoff/Tuda_Suda_49/main/scripts/network-test.sh
chmod +x network-test.sh
```

**Вариант C: Создать вручную**

```bash
nano network-test.sh
# [вставить содержимое скрипта]
chmod +x network-test.sh
```

## Использование

### Запуск теста

```bash
./network-test.sh
```

Скрипт автоматически:
1. Проверит наличие зависимостей
2. Запустит тесты для всех endpoint'ов
3. Сохранит результаты в файл `network-test-YYYY-MM-DD_HH-MM-SS.txt`
4. Покажет результаты в терминале

### Время выполнения

- **Быстрый VPS (USA)**: ~30-60 секунд
- **Медленный VPS (далеко)**: ~60-120 секунд

## Интерпретация результатов

### Ping Latency

```
Statistics: 45.123/47.456/52.789/2.345
Min: 45.123ms
Avg: 47.456ms  <-- ОСНОВНОЙ ПОКАЗАТЕЛЬ
Max: 52.789ms
Jitter (mdev): 2.345ms
```

**Что важно:**
- **Avg (средний)** - основной показатель latency
- **Jitter (mdev)** - стабильность соединения (чем меньше, тем лучше)
- **Packet loss** - должен быть 0%

### Traceroute

```
Total hops: 15
```

**Что важно:**
- Количество хопов показывает сложность маршрута
- Меньше хопов = более прямой путь = обычно быстрее
- Обычно 10-20 хопов

### MTR Report

```
HOST: example               Loss%   Snt   Last   Avg  Best  Wrst StDev
  1. 192.168.1.1             0.0%    10    0.5   0.6   0.4   0.8   0.1
  2. 10.0.0.1                0.0%    10    1.2   1.4   1.0   2.1   0.3
  ...
```

**Что важно:**
- Loss% - потеря пакетов на каждом хопе (должна быть 0%)
- Avg - средняя latency на каждом хопе
- Можно увидеть где происходят задержки

## Ожидаемые значения

### USA/Canada VPS (близко к серверам Polymarket)

- **Ping**: ~100-150ms
- **Hops**: ~10-15
- **Packet loss**: 0%
- **Jitter**: <5ms

### Europe VPS

- **Ping**: ~400-500ms (в 3-4 раза медленнее!)
- **Hops**: ~15-20
- **Packet loss**: 0%
- **Jitter**: <10ms

### Asia/Other Regions

- **Ping**: ~600-800ms (в 5-6 раз медленнее!)
- **Hops**: ~20-25
- **Packet loss**: 0%
- **Jitter**: <15ms

## Сравнение с текущим VPS

1. **Запустить на новом VPS:**
   ```bash
   ./network-test.sh
   ```

2. **Скачать результаты:**
   ```bash
   # На локальной машине
   scp user@new-vps:~/network-test-*.txt ./new-vps-results.txt
   ```

3. **Сравнить с baseline:**
   - Положить файлы рядом
   - Сравнить Ping Avg, Hops, Packet Loss
   - Решить какой VPS использовать

## Влияние latency на торговлю

### Пример: 6 секунд до старта маркета

**USA VPS (100ms latency):**
- 6 секунд / 0.1 сек = **60 попыток**
- Высокий шанс успеха

**Europe VPS (400ms latency):**
- 6 секунд / 0.4 сек = **15 попыток**
- Шанс успеха в **4 раза ниже!**

**Asia VPS (600ms latency):**
- 6 секунд / 0.6 сек = **10 попыток**
- Шанс успеха в **6 раз ниже!**

### Рекомендация

Для торговых ботов используйте VPS **географически близко к серверам Polymarket** (вероятно, USA East Coast или Canada).

## Troubleshooting

### Ошибка: "command not found"

```bash
# Установите недостающие пакеты
sudo apt-get install -y dnsutils iputils-ping traceroute mtr-tiny
```

### Ошибка: "Permission denied"

```bash
# Дайте права на выполнение
chmod +x network-test.sh
```

### Traceroute зависает

- Некоторые роутеры блокируют ICMP или UDP пакеты
- Скрипт автоматически завершится через timeout
- Это нормально, смотрите на доступные хопы

### MTR не работает

- MTR опционален
- Скрипт продолжит работу без него
- Основные метрики (ping, traceroute) достаточны

## Дополнительные тесты

### HTTP latency (без торговли)

```bash
# Простой HTTP GET запрос
curl -w "@curl-format.txt" -o /dev/null -s https://clob.polymarket.com/time

# Файл curl-format.txt:
# time_namelookup:  %{time_namelookup}\n
# time_connect:  %{time_connect}\n
# time_appconnect:  %{time_appconnect}\n
# time_starttransfer:  %{time_starttransfer}\n
# time_total:  %{time_total}\n
```

### Continuous monitoring

```bash
# Запустить каждый час через cron
0 * * * * /path/to/network-test.sh >> /path/to/network-test.log 2>&1
```

### Сравнение нескольких VPS

```bash
# Запустить на всех VPS одновременно
for vps in vps1 vps2 vps3; do
  ssh $vps "./network-test.sh" > results-$vps.txt &
done
wait

# Сравнить результаты
grep "Avg:" results-*.txt
```

## Поддержка

Если возникли вопросы или проблемы:
- Проверьте что все зависимости установлены
- Проверьте права на выполнение скрипта
- Убедитесь что VPS имеет выход в интернет
- Проверьте firewall не блокирует ICMP/UDP

## Лицензия

Часть проекта Tuda_Suda_49 - https://github.com/Bezoutoff/Tuda_Suda_49
