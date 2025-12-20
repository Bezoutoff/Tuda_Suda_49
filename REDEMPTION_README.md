# Redemption Bot - Инструкция по установке и использованию

## Обзор

Автоматический Python бот для выкупа завершенных позиций на Polymarket. Запускается каждые 60 минут через systemd timer на Linux VPS.

## Архитектура

```
Systemd Timer (60 min) → Python Script → Check API → Redeem via Relayer → Notify Telegram + Log CSV
```

## Установка

### 1. Установить Python зависимости

**Ubuntu 23.04+ требует virtual environment (PEP 668):**

```bash
cd /root/Tuda_Suda_49

# Вариант A: Virtual Environment (рекомендуется)
python3 -m venv venv
source venv/bin/activate
pip install -r scripts/requirements.txt

# Вариант B: System-wide
pip3 install -r scripts/requirements.txt --break-system-packages
```

### 2. Настроить .env

```bash
cp .env.example .env
nano .env
```

Заполните credentials:
```env
# Wallet
PK=your_private_key_without_0x
FUNDER=0xYourFunderAddress

# Builder Relayer (используйте ТЕ ЖЕ credentials что и для CLOB)
BUILDER_API_KEY=your_clob_api_key
BUILDER_SECRET=your_clob_secret
BUILDER_PASSPHRASE=your_clob_passphrase

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_ADMIN_ID=your_chat_id
```

### 3. Тестирование (manual run)

```bash
# Запуск вручную для тестирования
python3 scripts/redemption/main.py

# Проверить логи
cat logs/redemption.csv
cat logs/redemption-bot.log
```

### 4. Настроить systemd service (если используете venv)

```bash
# Отредактировать service файл
nano systemd/redemption-bot.service

# Изменить ExecStart на полный путь к venv python:
# ExecStart=/root/Tuda_Suda_49/venv/bin/python3 /root/Tuda_Suda_49/scripts/redemption/main.py

# Сохранить: Ctrl+O, Enter, Ctrl+X
```

### 5. Установить systemd timer

```bash
# Copy service files
sudo cp systemd/redemption-bot.service /etc/systemd/system/
sudo cp systemd/redemption-bot.timer /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable timer (auto-start on boot)
sudo systemctl enable redemption-bot.timer

# Start timer
sudo systemctl start redemption-bot.timer

# Verify
sudo systemctl status redemption-bot.timer
sudo systemctl list-timers redemption-bot.timer
```

## Мониторинг

### Просмотр статуса timer

```bash
# Текущий статус
sudo systemctl status redemption-bot.timer

# Список всех timers
sudo systemctl list-timers

# Когда следующий запуск
sudo systemctl list-timers redemption-bot.timer
```

### Просмотр логов

```bash
# Live logs (systemd journal)
sudo journalctl -u redemption-bot.service -f

# Последние 50 строк
sudo journalctl -u redemption-bot.service -n 50

# Логи за сегодня
sudo journalctl -u redemption-bot.service --since today

# CSV логи
tail -f logs/redemption.csv

# Файловые логи
tail -f logs/redemption-bot.log
```

### Ручной запуск

```bash
# Запустить сейчас (не дожидаться timer)
sudo systemctl start redemption-bot.service

# Проверить результат
sudo journalctl -u redemption-bot.service -n 100
```

## Управление

### Остановка timer

```bash
# Остановить timer (не будет запускаться автоматически)
sudo systemctl stop redemption-bot.timer

# Отключить auto-start при загрузке
sudo systemctl disable redemption-bot.timer
```

### Изменение интервала

Отредактируйте `/etc/systemd/system/redemption-bot.timer`:

```ini
[Timer]
# Изменить на 30 минут:
OnUnitActiveSec=30min

# Или на 2 часа:
OnUnitActiveSec=2h
```

Затем:
```bash
sudo systemctl daemon-reload
sudo systemctl restart redemption-bot.timer
```

## Структура файлов

```
scripts/
├── redemption/
│   ├── __init__.py
│   ├── main.py                     # Entry point
│   ├── config.py                   # Загрузка .env
│   ├── polymarket_api.py           # GET /balances API
│   ├── redemption_logic.py         # Группировка + indexSets
│   ├── relayer_client.py           # Builder Relayer
│   ├── telegram_notifier.py        # Telegram уведомления
│   └── csv_logger.py               # CSV логи
└── requirements.txt

systemd/
├── redemption-bot.service          # Systemd service
└── redemption-bot.timer            # Systemd timer

logs/
├── redemption.csv                  # CSV результаты
└── redemption-bot.log              # Текстовые логи
```

## CSV формат

`logs/redemption.csv`:

```csv
timestamp,condition_id,parent_collection_id,index_sets,amount_usdc,status,tx_hash,error
2025-12-14T10:00:15,0xabc123...,0x000...,1|2,15.500000,success,0xdef456...,
2025-12-14T10:00:18,0xghi789...,0x000...,1,8.250000,error,,Relayer timeout
```

## Telegram уведомления

Если настроены `TELEGRAM_BOT_TOKEN` и `TELEGRAM_ADMIN_ID`, бот отправляет:

1. **Check start**: "🔍 Redemption Check Started"
2. **Positions found**: "💰 Found 3 conditions, $45.67 USDC to redeem"
3. **Success**: "✅ Redeemed $15.00 from condition abc123... (tx: 0xdef456...)"
4. **Error**: "❌ Failed to redeem condition xyz789...: error message"
5. **No positions**: "ℹ️ No positions to redeem"

## Troubleshooting

### Бот не запускается

```bash
# Проверить статус service
sudo systemctl status redemption-bot.service

# Проверить логи ошибок
sudo journalctl -u redemption-bot.service -n 50

# Проверить что .env загружается
python3 scripts/redemption/main.py
```

### Python import errors

```bash
# Переустановить зависимости
pip3 install -r scripts/requirements.txt --force-reinstall
```

### API errors

```bash
# Проверить что credentials валидны
cat .env | grep CLOB

# Проверить network connectivity
curl https://clob.polymarket.com/balances/0x...
```

### Timer не запускается

```bash
# Проверить что timer enabled
sudo systemctl is-enabled redemption-bot.timer

# Если disabled:
sudo systemctl enable redemption-bot.timer
sudo systemctl start redemption-bot.timer
```

## Безопасность

- Service запускается от root (нужен доступ к .env с credentials)
- `NoNewPrivileges=true` - предотвращает privilege escalation
- `PrivateTmp=true` - изолированная /tmp
- Логи пишутся в systemd journal (автоматическая ротация)

## Мониторинг через Telegram бот

Можно добавить команду `/redemption-status` в существующий Telegram бот:

```typescript
// В src/telegram-bot/commands.ts
async handleRedemptionStatus() {
  // Read last 10 lines from logs/redemption.csv
  // Show success rate, last run time
}
```

## Дополнительные команды

```bash
# Restart service (если изменили код)
sudo systemctl restart redemption-bot.timer

# Проверить когда последний раз запускался
sudo systemctl list-timers --all | grep redemption

# Удалить timer полностью
sudo systemctl stop redemption-bot.timer
sudo systemctl disable redemption-bot.timer
sudo rm /etc/systemd/system/redemption-bot.*
sudo systemctl daemon-reload
```

## Интеграция с основным проектом

Redemption bot полностью независим от основного торгового бота:
- Использует те же `.env` credentials
- Логи в отдельные файлы
- Telegram уведомления через тот же bot token
- Не влияет на работу trading bots

## Обновление кода

```bash
# После изменения Python файлов:
sudo systemctl restart redemption-bot.service

# Проверить что изменения применились:
sudo journalctl -u redemption-bot.service -n 20
```

---

**Важно:** Первый запуск происходит через 5 минут после загрузки системы (`OnBootSec=5min`), затем каждые 60 минут.
