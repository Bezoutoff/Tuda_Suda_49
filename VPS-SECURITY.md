# VPS Security Hardening Guide

Пошаговая инструкция по усилению защиты VPS сервера для Tuda Suda 49.

## Содержание

1. [SSH Key Authentication](#phase-1-ssh-key-authentication)
2. [UFW Firewall](#phase-2-ufw-firewall)
3. [Fail2Ban Protection](#phase-3-fail2ban-brute-force-protection)
4. [System Hardening](#phase-4-system-hardening)
5. [Monitoring](#phase-5-monitoring-optional)
6. [Verification](#verification)

---

## Phase 1: SSH Key Authentication

### Цель
Заменить парольную аутентификацию на SSH ключи для защиты от брутфорса.

### Шаги

#### 1.1 Генерация SSH ключа (на Windows)

```powershell
# Открыть PowerShell и выполнить:
ssh-keygen -t ed25519 -C "vps-trading-bot"

# При запросе:
# - File location: нажать ENTER (использовать default)
# - Passphrase: ввести пароль или оставить пустым

# Проверить что ключ создан
ls $env:USERPROFILE\.ssh\
# Должны быть файлы:
# id_ed25519     - приватный ключ (НИКОГДА не делиться!)
# id_ed25519.pub - публичный ключ (можно копировать на сервер)
```

#### 1.2 Копирование публичного ключа на VPS

**Вариант A: Автоматически (если есть SSH клиент в PowerShell)**

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@YOUR_VPS_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

**Вариант B: Вручную**

На Windows:
```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
# Скопировать весь вывод
```

На VPS:
```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Вставить скопированный публичный ключ
# Ctrl+O, Enter, Ctrl+X

chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# Проверить
cat ~/.ssh/authorized_keys
```

#### 1.3 Настройка MobaXterm (если используете)

1. **Session** → **SSH**
2. **Remote host**: ваш IP/hostname
3. **Username**: `root`
4. **Advanced SSH settings** → ✓ **Use private key**
5. Указать путь: `C:\Users\YourName\.ssh\id_ed25519`
6. **Сохранить сессию**

#### 1.4 Тестирование SSH ключа

⚠️ **КРИТИЧНО**: НЕ закрывайте текущую SSH сессию!

Откройте **НОВУЮ** сессию в MobaXterm и попробуйте подключиться с ключом.

✅ **Успех**: Вход БЕЗ запроса пароля
❌ **Проблема**: Проверить права доступа на VPS:

```bash
ls -la ~/.ssh/
# Должно быть:
# drwx------ (700) для .ssh/
# -rw------- (600) для authorized_keys
```

#### 1.5 Отключение парольной аутентификации

⚠️ **ВНИМАНИЕ**: Выполнять ТОЛЬКО после успешного теста ключа!

```bash
# Backup конфига
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Редактировать конфиг
sudo nano /etc/ssh/sshd_config
```

**Найти и изменить:**

```bash
# Отключить пароли
PasswordAuthentication no

# Включить ключи
PubkeyAuthentication yes

# Root только с ключом
PermitRootLogin prohibit-password

# Отключить пустые пароли
PermitEmptyPasswords no
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Проверить синтаксис
sudo sshd -t

# Перезапустить SSH
sudo systemctl restart sshd

# Проверить статус
sudo systemctl status sshd
```

#### 1.6 Финальная проверка

Открыть новую SSH сессию с ключом - должна работать.

---

## Phase 2: UFW Firewall

### Цель
Блокировать все входящие соединения кроме SSH.

### Шаги

```bash
# Установка UFW
sudo apt update
sudo apt install ufw -y

# Настройка правил (ДО включения!)
sudo ufw default deny incoming    # Блокировать входящий трафик
sudo ufw default allow outgoing    # Разрешить исходящий трафик

# Разрешить SSH (КРИТИЧНО!)
sudo ufw allow 22/tcp

# Проверить правила ПЕРЕД включением
sudo ufw show added

# Включить firewall
sudo ufw enable
# Ответить 'y' на предупреждение

# Проверить статус
sudo ufw status verbose
```

**Ожидаемый вывод:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
```

---

## Phase 3: Fail2Ban (Brute Force Protection)

### Цель
Автоматически банить IP-адреса после неудачных попыток входа.

### Шаги

```bash
# Установка
sudo apt install fail2ban -y

# Создать локальный конфиг
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Редактировать конфиг
sudo nano /etc/fail2ban/jail.local
```

**Найти секцию `[sshd]` и настроить:**

```ini
[sshd]
enabled = true        # ← ОБЯЗАТЕЛЬНО раскомментировать!
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 5          # Бан после 5 неудачных попыток
bantime = 600         # Бан на 10 минут (600 секунд)
findtime = 600        # Окно времени для подсчёта попыток
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`

```bash
# Запустить fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Проверить статус
sudo systemctl status fail2ban

# Проверить SSH jail
sudo fail2ban-client status sshd
```

**Ожидаемый вывод:**
```
Status for the jail: sshd
|- Filter
|  |- Currently failed: X
|  |- Total failed:     X
|  `- File list:        /var/log/auth.log
`- Actions
   |- Currently banned: X
   |- Total banned:     X
   `- Banned IP list:   ...
```

### Полезные команды Fail2Ban

```bash
# Посмотреть забаненные IP
sudo fail2ban-client status sshd

# Разбанить IP вручную
sudo fail2ban-client set sshd unbanip 1.2.3.4

# Забанить IP вручную
sudo fail2ban-client set sshd banip 1.2.3.4

# Посмотреть логи fail2ban
sudo tail -f /var/log/fail2ban.log
```

---

## Phase 4: System Hardening

### 4.1 Защита .env файлов

```bash
# Найти все .env файлы
find ~/Tuda_Suda_49 -name ".env" -o -name ".env.*"

# Установить права 600 (только владелец может читать)
chmod 600 ~/Tuda_Suda_49/.env

# Проверить
ls -la ~/Tuda_Suda_49/.env
# Должно быть: -rw------- (600)
```

### 4.2 Автоматические обновления безопасности

⚠️ **БЕЗ авто-перезагрузки** (критично для ботов!)

```bash
# Установка
sudo apt install unattended-upgrades -y

# Включить автообновления
sudo dpkg-reconfigure -plow unattended-upgrades
# Выбрать "Yes"

# Настроить
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
```

**Найти и настроить:**

```bash
// Автоматически устанавливать обновления безопасности
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};

// НЕ перезагружать автоматически (КРИТИЧНО!)
Unattended-Upgrade::Automatic-Reboot "false";

// Удалять старые неиспользуемые пакеты
Unattended-Upgrade::Remove-Unused-Dependencies "true";
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`

### 4.3 Проверка ненужных сервисов

```bash
# Показать все запущенные сервисы
systemctl list-units --type=service --state=running

# Отключить ненужный сервис (пример)
sudo systemctl disable service_name
sudo systemctl stop service_name
```

### 4.4 Защита PM2 логов

```bash
# Установить правильные права на логи
chmod 600 ~/Tuda_Suda_49/logs/*.log
```

---

## Phase 5: Monitoring (Optional)

### 5.1 Logwatch - Ежедневные email отчёты

```bash
# Установка
sudo apt install logwatch -y

# Настройка (опционально)
sudo nano /etc/logwatch/conf/logwatch.conf
```

### 5.2 Audit daemon - Аудит системных вызовов

```bash
# Установка
sudo apt install auditd -y

# Включить
sudo systemctl enable auditd
sudo systemctl start auditd
```

### 5.3 Rootkit сканеры

```bash
# rkhunter
sudo apt install rkhunter -y
sudo rkhunter --update
sudo rkhunter --check

# chkrootkit
sudo apt install chkrootkit -y
sudo chkrootkit
```

---

## Verification

### Полная проверка безопасности

```bash
# 1. SSH конфигурация
grep "PasswordAuthentication" /etc/ssh/sshd_config
grep "PubkeyAuthentication" /etc/ssh/sshd_config
grep "PermitRootLogin" /etc/ssh/sshd_config
# Должно быть:
# PasswordAuthentication no
# PubkeyAuthentication yes
# PermitRootLogin prohibit-password

# 2. Firewall статус
sudo ufw status verbose
# Должен быть active, разрешён только SSH (22/tcp)

# 3. Fail2ban статус
sudo fail2ban-client status sshd
# Должен быть активен, показывать забаненные IP

# 4. Права на .env файлы
ls -la ~/Tuda_Suda_49/.env
# Должно быть: -rw------- (600)

# 5. Автообновления
systemctl status unattended-upgrades
# Должен быть active

# 6. PM2 боты запущены
pm2 status
# Все боты должны быть online
```

### Security Checklist

- ✅ SSH ключи работают
- ✅ Парольная аутентификация отключена
- ✅ UFW firewall активен
- ✅ Fail2ban защищает SSH
- ✅ .env файлы защищены (chmod 600)
- ✅ Автообновления безопасности включены (БЕЗ авто-перезагрузки)
- ✅ PM2 боты работают нормально

---

## Troubleshooting

### Заблокировали себя?

Если потеряли доступ по SSH:

1. **Используйте web-консоль VPS провайдера** (Hetzner Cloud Console, DigitalOcean Droplet Console и т.д.)
2. Восстановите пароли:
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Изменить: PasswordAuthentication yes
   sudo systemctl restart sshd
   ```
3. Повторите настройку SSH ключей

### Fail2ban забанил ваш IP?

```bash
# Через web-консоль провайдера:
sudo fail2ban-client set sshd unbanip YOUR_IP
```

### Проверка логов

```bash
# SSH логи
sudo tail -f /var/log/auth.log

# Fail2ban логи
sudo tail -f /var/log/fail2ban.log

# UFW логи
sudo tail -f /var/log/ufw.log

# Системные логи
sudo journalctl -xe
```

---

## Maintenance

### Регулярные задачи

**Еженедельно:**
- Проверить fail2ban статистику: `sudo fail2ban-client status sshd`
- Проверить firewall логи: `sudo tail -100 /var/log/ufw.log`

**Ежемесячно:**
- Обновить систему: `sudo apt update && sudo apt upgrade`
- Проверить забаненные IP: посмотреть откуда атаки
- Запустить rootkit сканер: `sudo rkhunter --check`

**После обновлений ядра:**
- Перезагрузить в удобное время (когда боты не торгуют)
- Проверить что все сервисы запустились: `pm2 status`

---

## Дополнительные меры (Advanced)

### 2FA для SSH (Google Authenticator)

```bash
sudo apt install libpam-google-authenticator -y
google-authenticator
# Следовать инструкциям
```

### Изменение SSH порта (уменьшает атаки)

```bash
sudo nano /etc/ssh/sshd_config
# Изменить: Port 2222 (любой порт от 1024 до 65535)
sudo systemctl restart sshd

# Обновить firewall
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

### AIDE - File Integrity Monitoring

```bash
sudo apt install aide -y
sudo aideinit
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Проверка целостности
sudo aide --check
```

---

## История изменений

- **2025-12-12**: Создан VPS Security Hardening Guide
  - Phase 1: SSH Key Authentication (ed25519)
  - Phase 2: UFW Firewall
  - Phase 3: Fail2Ban
  - Phase 4: System Hardening
  - Phase 5: Monitoring (optional)

---

## Контакты

При проблемах с безопасностью:
- Проверить логи: `/var/log/auth.log`, `/var/log/fail2ban.log`
- Web-консоль VPS провайдера для экстренного доступа
- Telegram bot для мониторинга состояния ботов

---

**Статус**: ✅ Базовая защита настроена и протестирована
