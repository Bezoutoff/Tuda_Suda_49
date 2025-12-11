# PM2 Deployment Guide

Руководство по запуску ботов через PM2 для production deployment.

## Установка PM2

```bash
# Установить PM2 глобально
npm install -g pm2

# Проверить установку
pm2 --version
```

## Доступные боты

| Имя | Описание | Технология |
|-----|----------|------------|
| **updown-cpp** | UpDownBot C++ (ladder strategy) | TypeScript + C++ |
| **updown-polling** | UpDownBot Polling (TypeScript) | TypeScript only |
| **updown-ws** | UpDownBot WebSocket (original) | TypeScript + WebSocket |

## Быстрый старт

### 1. Подготовка

```bash
cd ~/Tuda_Suda_49

# Собрать C++ binary (только для updown-cpp)
npm run build:updown-bot

# Создать директорию для логов
mkdir -p logs

# Сделать wrapper script исполняемым
chmod +x start-updown-bot.sh
```

### 2. Запуск UpDownBot C++

```bash
# Запустить бота
pm2 start ecosystem.config.js --only updown-cpp

# Проверить статус
pm2 status

# Посмотреть логи (real-time)
pm2 logs updown-cpp

# Посмотреть последние 100 строк
pm2 logs updown-cpp --lines 100
```

### 3. Управление

```bash
# Остановить бота
pm2 stop updown-cpp

# Перезапустить бота
pm2 restart updown-cpp

# Удалить из PM2
pm2 delete updown-cpp

# Посмотреть детальную информацию
pm2 show updown-cpp
```

## Команды PM2

### Базовые команды

```bash
# Запустить все боты
pm2 start ecosystem.config.js

# Запустить только один бот
pm2 start ecosystem.config.js --only updown-cpp

# Остановить все боты
pm2 stop all

# Перезапустить все боты
pm2 restart all

# Удалить все боты
pm2 delete all

# Список процессов
pm2 list
pm2 status  # алиас для list

# Детальная информация
pm2 show updown-cpp
pm2 describe updown-cpp  # алиас для show
```

### Логи

```bash
# Все логи в реальном времени
pm2 logs

# Логи конкретного бота
pm2 logs updown-cpp

# Последние N строк
pm2 logs updown-cpp --lines 200

# Только error логи
pm2 logs updown-cpp --err

# Только output логи
pm2 logs updown-cpp --out

# Очистить логи
pm2 flush
```

### Мониторинг

```bash
# Консольный мониторинг (real-time CPU/Memory)
pm2 monit

# Web dashboard (требует pm2-web)
pm2 web

# Метрики
pm2 metrics
```

### Автозапуск при перезагрузке сервера

```bash
# Сохранить текущие процессы
pm2 save

# Настроить автозапуск (systemd для Ubuntu)
pm2 startup systemd

# Выполнить команду, которую выдаст pm2 startup
# Пример:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Проверить что автозапуск работает
pm2 list
pm2 save

# Перезагрузить сервер и проверить
sudo reboot
# После перезагрузки:
pm2 list
```

## Файлы конфигурации

### ecosystem.config.js

Основной конфигурационный файл PM2 с настройками всех ботов:
- Пути к скриптам
- Параметры запуска
- Лимиты памяти
- Пути к логам

### start-updown-bot.sh

Wrapper script для updown-cpp:
- Автоматически вычисляет следующий маркет timestamp
- Поддерживает ручной timestamp: `./start-updown-bot.sh 1765343700`

## Структура логов

```
logs/
├── updown-cpp-error.log      # Только ошибки
├── updown-cpp-out.log         # Только stdout
├── updown-cpp-combined.log    # Всё вместе
├── bot-polling-error.log
├── bot-polling-out.log
├── bot-polling-combined.log
├── bot-ws-error.log
├── bot-ws-out.log
└── bot-ws-combined.log
```

**Ротация логов:**
```bash
# Установить pm2-logrotate
pm2 install pm2-logrotate

# Настроить ротацию (каждый день, сохранять 7 дней)
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

## Мониторинг производительности

### CPU и Memory

```bash
# Real-time мониторинг
pm2 monit

# Список с метриками
pm2 list

# Детальная информация
pm2 show updown-cpp
```

### CSV Output (updown-cpp)

```bash
# Посмотреть последние результаты
tail -f updown-bot.csv

# Статистика за сегодня
grep "$(date +%Y-%m-%d)" updown-bot.csv | wc -l

# Success rate
grep success updown-bot.csv | wc -l
```

## Troubleshooting

### Бот не запускается

```bash
# Проверить логи ошибок
pm2 logs updown-cpp --err --lines 50

# Проверить что binary скомпилирован
ls -lh dist/updown-bot-cpp

# Пересобрать binary
npm run build:updown-bot

# Перезапустить
pm2 restart updown-cpp
```

### Бот падает с ошибкой памяти

```bash
# Увеличить лимит памяти в ecosystem.config.js
# max_memory_restart: '1G'  # вместо 500M

# Перезапустить с новой конфигурацией
pm2 delete updown-cpp
pm2 start ecosystem.config.js --only updown-cpp
```

### Логи не записываются

```bash
# Проверить что директория существует
mkdir -p logs

# Проверить права
chmod 755 logs

# Очистить старые логи
pm2 flush

# Перезапустить
pm2 restart updown-cpp
```

### Автозапуск не работает после reboot

```bash
# Проверить systemd service
systemctl status pm2-root

# Пересоздать автозапуск
pm2 unstartup systemd
pm2 startup systemd
# Выполнить команду из вывода
pm2 save
```

## Best Practices

### 1. Всегда используйте `pm2 save`

После любых изменений:
```bash
pm2 start ecosystem.config.js --only updown-cpp
pm2 save  # Сохранить состояние
```

### 2. Регулярно проверяйте логи

```bash
# Добавить в crontab проверку логов
crontab -e

# Каждый час проверять последние ошибки
0 * * * * tail -n 20 /root/Tuda_Suda_49/logs/updown-cpp-error.log | grep -i error && echo "Errors found in updown-cpp"
```

### 3. Мониторинг через Telegram (опционально)

Интеграция с PM2 Notify для уведомлений:
```bash
pm2 install pm2-notify

# Настроить Telegram бота
pm2 set pm2-notify:telegram_token YOUR_BOT_TOKEN
pm2 set pm2-notify:telegram_chatid YOUR_CHAT_ID
```

### 4. Регулярные обновления

```bash
# Создать скрипт update.sh
cat > update.sh << 'EOF'
#!/bin/bash
cd ~/Tuda_Suda_49
git pull
npm install
npm run build:updown-bot
pm2 restart updown-cpp
pm2 save
EOF

chmod +x update.sh

# Запускать вручную при необходимости
./update.sh
```

## Полный workflow для production

```bash
# 1. Первичная настройка
cd ~/Tuda_Suda_49
git pull
npm install
npm run build:updown-bot
mkdir -p logs
chmod +x start-updown-bot.sh

# 2. Запуск через PM2
pm2 start ecosystem.config.js --only updown-cpp

# 3. Настройка автозапуска
pm2 save
pm2 startup systemd
# Выполнить команду из вывода

# 4. Установить ротацию логов
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7

# 5. Проверка
pm2 status
pm2 logs updown-cpp --lines 20

# 6. Тест автозапуска
sudo reboot
# После перезагрузки:
pm2 list
```

## Полезные алиасы

Добавить в `~/.bashrc`:

```bash
# PM2 shortcuts
alias pml='pm2 list'
alias pms='pm2 status'
alias pmlog='pm2 logs updown-cpp'
alias pmr='pm2 restart updown-cpp'
alias pmstop='pm2 stop updown-cpp'
alias pmstart='pm2 start ecosystem.config.js --only updown-cpp'
alias pmcpp='cd ~/Tuda_Suda_49 && pm2 logs updown-cpp'

# CSV monitoring
alias csvtail='tail -f ~/Tuda_Suda_49/updown-bot.csv'
alias csvstats='grep success ~/Tuda_Suda_49/updown-bot.csv | wc -l'
```

Применить:
```bash
source ~/.bashrc
```

## Сравнение с systemd

| Аспект | PM2 | systemd |
|--------|-----|---------|
| **Установка** | `npm install -g pm2` | Built-in |
| **Конфигурация** | JavaScript | Unit files |
| **Логи** | Built-in + файлы | journalctl |
| **Мониторинг** | `pm2 monit` | Внешние утилиты |
| **Кластеризация** | Встроена | Ручная |
| **Удобство** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**Рекомендация:** Использовать PM2 для Node.js приложений.

## Дополнительные ресурсы

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [PM2 Quick Start](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Ecosystem File](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [PM2 Log Management](https://pm2.keymetrics.io/docs/usage/log-management/)
