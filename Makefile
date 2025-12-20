# ==============================================================================
# Tuda Suda 49 - Makefile
# ==============================================================================
#
# Convenience commands for Docker management.
#
# Usage:
#   make build      - Build Docker images
#   make up         - Start containers in background
#   make down       - Stop and remove containers
#   make logs       - View logs (follow mode)
#   make restart    - Restart all containers
#   make ps         - Show container status
#   make shell      - Open shell in trading-bot container
#   make clean      - Remove containers, images, and volumes
#
# ==============================================================================

.PHONY: help build up down logs restart ps shell shell-redemption pm2 clean rebuild

# Default target: show help
help:
	@echo "Tuda Suda 49 - Docker Management Commands"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  build        Build Docker images"
	@echo "  up           Start containers in background"
	@echo "  down         Stop and remove containers"
	@echo "  logs         View logs (follow mode)"
	@echo "  restart      Restart all containers"
	@echo "  ps           Show container status"
	@echo "  shell        Open bash shell in trading-bot"
	@echo "  shell-redemption  Open bash shell in redemption-scheduler"
	@echo "  pm2          Show PM2 process list"
	@echo "  clean        Remove containers, images (CAREFUL!)"
	@echo "  rebuild      Clean rebuild (build --no-cache)"
	@echo ""

# Build Docker images
build:
	docker-compose build

# Build without cache (clean build)
rebuild:
	docker-compose build --no-cache --pull

# Start containers in background
up:
	docker-compose up -d

# Stop and remove containers
down:
	docker-compose down

# View logs in follow mode
logs:
	docker-compose logs -f

# Restart all containers
restart:
	docker-compose restart

# Show container status
ps:
	docker-compose ps

# Open bash shell in trading-bot container
shell:
	docker exec -it tuda-suda-trading bash

# Open bash shell in redemption-scheduler container
shell-redemption:
	docker exec -it tuda-suda-redemption bash

# Show PM2 process list
pm2:
	docker exec tuda-suda-trading pm2 list

# PM2 logs
pm2-logs:
	docker exec tuda-suda-trading pm2 logs

# Clean up (remove containers and images)
clean:
	@echo "WARNING: This will remove all containers and images!"
	@echo "Logs in ./logs/ will be preserved."
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down; \
		docker rmi tuda_suda_49-trading-bot tuda_suda_49-redemption-scheduler 2>/dev/null || true; \
		echo "Cleanup complete!"; \
	else \
		echo "Cancelled."; \
	fi

# Development: full rebuild and start
dev: rebuild up logs

# Production: build and start
prod: build up

# Show Docker stats
stats:
	docker stats

# Prune Docker system (remove unused data)
prune:
	@echo "WARNING: This will remove ALL unused Docker data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker system prune -a; \
	else \
		echo "Cancelled."; \
	fi
