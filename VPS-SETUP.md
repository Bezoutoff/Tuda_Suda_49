# VPS Setup Guide - Быстрая установка за 2 минуты

## 🚀 One-Line Setup (рекомендуется)

Установка всего необходимого за **1 команду**:

```bash
curl -fsSL https://raw.githubusercontent.com/Bezoutoff/Tuda_Suda_49/main/setup-vps.sh | sudo bash
```

Скрипт автоматически установит:
- ✅ Node.js 18.x
- ✅ Git
- ✅ PM2 (process manager)
- ✅ Клонирует репозиторий
- ✅ Установит npm зависимости
- ✅ Скомпилирует TypeScript
- ✅ Настроит PM2 автозапуск
- ✅ Отключит Docker (экономия RAM)

**Время выполнения:** ~2-3 минуты

---

## 📋 Что делает setup-vps.sh

### Шаги установки:

1. **Обновление системы**
   ```bash
   apt-get update && apt-get upgrade
   ```

2. **Установка Node.js 18.x**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt-get install -y nodejs
   ```

3. **Установка Git**
   ```bash
   apt-get install -y git
   ```

4. **Установка PM2 глобально**
   ```bash
   npm install -g pm2
   ```

5. **Клонирование репозитория**
   ```bash
   git clone https://github.com/Bezoutoff/Tuda_Suda_49.git /root/Tuda_Suda_49
   ```

6. **Установка зависимостей**
   ```bash
   cd /root/Tuda_Suda_49
   npm install
   ```

7. **Компиляция TypeScript**
   ```bash
   npm run build
   ```

8. **Создание .env файла** (если не существует)
   ```bash
   cp .env.example .env
   ```

9. **Настройка PM2 автозапуска**
   ```bash
   pm2 startup systemd
   pm2 save
   ```

10. **Отключение Docker** (экономия ~600MB RAM)
    ```bash
    systemctl stop docker
    systemctl disable docker
    ```

---

## 🛠️ После установки

### 1. Настроить .env

```bash
nano /root/Tuda_Suda_49/.env
```

Заполнить:
```env
PK=your_private_key_here
CLOB_API_KEY=your_api_key
CLOB_SECRET=your_secret
CLOB_PASS_PHRASE=your_passphrase
FUNDER=0x...
```

### 2. Запустить auto-sell-bot

```bash
pm2 start /root/Tuda_Suda_49/dist/auto-sell-bot.js \
  --name auto-sell-bot \
  --max-memory-restart 150M
```

### 3. Запустить updown-bot-49

```bash
# Вычислить timestamp
TIMESTAMP=$(node -e "const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)")

# Запустить бота
pm2 start /root/Tuda_Suda_49/dist/updown-bot-49.js \
  --name updown-bot-49 \
  --max-memory-restart 250M \
  -- $TIMESTAMP
```

### 4. Проверить работу

```bash
# Статус процессов
pm2 list

# Логи
pm2 logs

# Память
free -h

# Сохранить конфигурацию PM2
pm2 save
```

---

## 🔄 Обновление на существующем VPS

Если бот уже установлен и нужно обновиться:

```bash
cd /root/Tuda_Suda_49

# Остановить боты
pm2 stop all

# Получить обновления
git pull

# Переустановить зависимости (если package.json изменился)
npm install

# Пересобрать
npm run build

# Перезапустить
pm2 restart all

# Логи
pm2 logs
```

---

## 📊 Сравнение: Docker vs Bash Script

| Аспект | Docker | setup-vps.sh |
|--------|--------|--------------|
| **Время установки** | 5-10 мин | 2-3 мин |
| **Размер** | ~1-2 GB (образы) | ~300 MB (npm modules) |
| **RAM overhead** | ~600 MB | ~0 MB (нативно) |
| **Сложность** | Средняя (Dockerfile, compose) | Низкая (bash) |
| **Обновление** | `docker compose pull` | `git pull && npm run build` |
| **Логи** | `docker logs` | `pm2 logs` |
| **Мониторинг** | `docker stats` | `pm2 monit` |
| **Подходит для** | Множество сервисов | 1-2 бота |

### Когда использовать Docker:
- ✅ Множество микросервисов
- ✅ Нужна изоляция окружений
- ✅ Много RAM (4+ GB)
- ✅ CI/CD автоматизация

### Когда использовать Bash Script (setup-vps.sh):
- ✅ **1-2 бота на VPS** ← наш случай
- ✅ **Мало RAM (< 2 GB)** ← 961 MB RAM
- ✅ Быстрое развертывание
- ✅ Минимальный overhead

---

## 🤖 Альтернатива: Ansible Playbook (для множества VPS)

Если нужно настроить **5+ серверов**, используйте Ansible:

```yaml
# playbook.yml
- hosts: vps_servers
  become: yes
  tasks:
    - name: Install Node.js
      shell: curl -fsSL https://deb.nodesource.com/setup_18.x | bash -

    - name: Install dependencies
      apt:
        name: [nodejs, git]
        state: present

    - name: Install PM2
      npm:
        name: pm2
        global: yes

    - name: Clone repository
      git:
        repo: https://github.com/Bezoutoff/Tuda_Suda_49.git
        dest: /root/Tuda_Suda_49
```

Запуск:
```bash
ansible-playbook -i inventory.ini playbook.yml
```

**Преимущества Ansible:**
- Управление множеством серверов
- Декларативная конфигурация
- Idempotent (можно запускать многократно)

---

## ❓ FAQ

### Q: Зачем отключать Docker если он установлен?

**A:** Docker daemon жрет ~50-100 MB памяти в фоне + container overhead ~100-200 MB. На VPS с 961 MB RAM это критично.

### Q: Можно ли использовать Docker ТОЛЬКО для сборки, а запускать БЕЗ контейнеров?

**A:** Да, но это overcomplicated:
```bash
# Build в Docker
docker build -t tuda-suda .

# Скопировать артефакты на хост
docker create --name tmp tuda-suda
docker cp tmp:/app/dist ./dist
docker rm tmp

# Запустить на хосте
pm2 start dist/auto-sell-bot.js
```

**Проще:** `npm run build` (не нужен Docker вообще)

### Q: setup-vps.sh vs Dockerfile - что выбрать?

| Критерий | setup-vps.sh | Dockerfile |
|----------|--------------|------------|
| Простота | ✅ Проще | ❌ Сложнее |
| Скорость | ✅ Быстрее | ❌ Медленнее |
| RAM | ✅ Меньше | ❌ Больше |
| Изоляция | ❌ Нет | ✅ Есть |
| Портируемость | ❌ Только Linux | ✅ Везде |

**Для нашего случая (1-2 бота, VPS с 1GB RAM):** setup-vps.sh

### Q: Как проверить что скрипт безопасен?

**A:** Посмотрите код перед запуском:
```bash
curl -fsSL https://raw.githubusercontent.com/Bezoutoff/Tuda_Suda_49/main/setup-vps.sh | less
```

Или клонируйте и запустите локально:
```bash
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49
sudo bash setup-vps.sh
```

---

## 🔐 Security Best Practices

### 1. Создать non-root пользователя (опционально)

```bash
# Создать пользователя
adduser botuser

# Добавить в sudo группу
usermod -aG sudo botuser

# Переключиться
su - botuser

# Изменить ownership репозитория
sudo chown -R botuser:botuser /root/Tuda_Suda_49
mv /root/Tuda_Suda_49 /home/botuser/
```

### 2. Настроить firewall

```bash
# Установить ufw
apt-get install ufw

# Разрешить SSH
ufw allow ssh

# Разрешить HTTPS (для Polymarket API)
ufw allow https

# Включить
ufw enable
```

### 3. Защитить .env файл

```bash
chmod 600 /root/Tuda_Suda_49/.env
```

---

## 📝 Troubleshooting

### Ошибка: "curl: command not found"

```bash
apt-get install curl
```

### Ошибка: "Node.js version too old"

```bash
# Удалить старую версию
apt-get remove nodejs

# Установить заново
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
```

### Ошибка: "PM2: command not found" после установки

```bash
# Перезагрузить shell
exec bash

# Проверить
pm2 --version
```

### VPS не перезагружается корректно

```bash
# Проверить PM2 startup
pm2 startup

# Скопировать команду из вывода и запустить
# Пример: sudo env PATH=$PATH:/usr/bin pm2 startup systemd...

# Сохранить процессы
pm2 save
```

---

## 🎯 Итоги

**setup-vps.sh - оптимальный выбор для:**
- ✅ VPS с ограниченной RAM (< 2 GB)
- ✅ Быстрое развертывание (2-3 минуты)
- ✅ Простота управления
- ✅ Минимальный overhead

**Docker нужен только если:**
- Множество микросервисов
- Нужна строгая изоляция
- Много RAM (4+ GB)
- CI/CD pipeline

**Для Tuda Suda 49:** `setup-vps.sh` > Docker ✅
