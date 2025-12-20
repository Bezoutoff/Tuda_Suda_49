# GitHub Actions Workflows

Автоматизация CI/CD для Tuda Suda 49 Docker deployment.

## Workflows

### 1. Docker Build CI (`docker-build.yml`)

**Триггеры:**
- Push в `main` (при изменении Docker/src файлов)
- Pull Request в `main`
- Manual trigger (workflow_dispatch)

**Что делает:**
- ✅ Build Docker image с C++ (`BUILD_CPP=true`)
- ✅ Build Docker image без C++ (`BUILD_CPP=false`) - faster build
- ✅ Test `docker-compose config` и `docker-compose build`
- ✅ Security scan с Trivy (CRITICAL + HIGH vulnerabilities)
- ✅ Image size comparison
- ✅ Dockerfile linting (hadolint)

**Результат:**
- Все PR проверяются автоматически
- Badge показывает статус билда

**Время выполнения:** ~10-15 минут

---

### 2. Docker Publish (`docker-publish.yml`)

**Триггеры:**
- Создание release (git tag)
- Manual trigger

**Что делает:**
- 📦 Build Docker image
- 🚀 Push в GitHub Container Registry (`ghcr.io`)
- 🏷️ Tagging: `latest`, `v1.0.0`, `v1.0`, `v1`
- 📝 Create `docker-compose.ghcr.yml` example

**Где публикуется:**
```
ghcr.io/bezoutoff/tuda_suda_49:latest
ghcr.io/bezoutoff/tuda_suda_49:v1.0.0
```

**Использование pre-built image:**
```bash
# Pull image
docker pull ghcr.io/bezoutoff/tuda_suda_49:latest

# Use in deployment
docker-compose -f docker-compose.ghcr.yml up -d
```

**Преимущества:**
- ✅ Не нужно собирать локально (экономия 5-10 минут)
- ✅ Консистентные билды
- ✅ Быстрый деплой на VPS

---

## Badges для README

Добавьте в `README.md`:

```markdown
[![Docker Build](https://github.com/Bezoutoff/Tuda_Suda_49/actions/workflows/docker-build.yml/badge.svg)](https://github.com/Bezoutoff/Tuda_Suda_49/actions/workflows/docker-build.yml)
[![Docker Publish](https://github.com/Bezoutoff/Tuda_Suda_49/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Bezoutoff/Tuda_Suda_49/actions/workflows/docker-publish.yml)
```

---

## Manual Workflow Trigger

### Docker Build (тест PR перед merge):
1. Go to [Actions → Docker Build CI](../../actions/workflows/docker-build.yml)
2. Click "Run workflow"
3. Select branch → "Run workflow"

### Docker Publish (создать новый release):
1. Go to [Actions → Docker Publish](../../actions/workflows/docker-publish.yml)
2. Click "Run workflow"
3. Enter tag (e.g., `v1.0.0`) → "Run workflow"

**Или через git tag:**
```bash
git tag v1.0.0
git push origin v1.0.0
# Workflow запустится автоматически
```

---

## GitHub Container Registry Setup

### Permissions

Workflow использует `GITHUB_TOKEN` автоматически.

### Image Visibility

- **Public repo** → Public image (anyone can pull)
- **Private repo** → Private image (requires authentication)

### Pull private image:

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull
docker pull ghcr.io/bezoutoff/tuda_suda_49:latest
```

---

## Troubleshooting

### Build fails on "paths" trigger

**Problem:** Workflow не запускается при изменении файлов.

**Fix:** Проверьте что изменили файлы из списка:
```yaml
paths:
  - 'Dockerfile'
  - 'docker-compose.yml'
  - 'src/**'
  # ...
```

### Push to GHCR fails with 403

**Problem:** No permission to push to ghcr.io

**Fix:**
1. Go to Settings → Actions → General
2. Scroll to "Workflow permissions"
3. Select "Read and write permissions"
4. Save

### Trivy scan fails

**Problem:** Critical vulnerabilities found

**Fix:**
- Workflow не останавливается (`exit-code: 0`)
- Review output для информации
- Update base image versions в Dockerfile

---

## Workflow Files

```
.github/
├── workflows/
│   ├── docker-build.yml     # CI: Build and test
│   └── docker-publish.yml   # CD: Publish to GHCR
└── README.md                # This file
```

---

## Next Steps

### Enable GHCR (optional):

1. Make sure "Workflow permissions" = "Read and write"
2. Create release: `git tag v1.0.0 && git push origin v1.0.0`
3. Check [Packages](../../packages) for published image

### Use pre-built image:

```bash
git clone https://github.com/Bezoutoff/Tuda_Suda_49.git
cd Tuda_Suda_49
cp .env.example .env && nano .env
docker-compose -f docker-compose.ghcr.yml up -d  # Uses pre-built image
```

---

**Happy Automation! 🤖**
