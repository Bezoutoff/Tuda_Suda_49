# ==============================================================================
# Multi-stage Dockerfile for Tuda Suda 49 Trading Bot
# ==============================================================================
#
# Architecture: Node.js 18 + Python 3.10 + Optional C++ components
# Build stages:
#   1. cpp-builder:   Compiles C++ latency and trading binaries
#   2. node-builder:  Installs npm deps and compiles TypeScript
#   3. final:         Runtime with Node.js + Python + all artifacts
#
# Build args:
#   BUILD_CPP: "true" | "false" - Whether to compile C++ components
#
# ==============================================================================

# ==============================================================================
# Stage 1: C++ Builder (Optional)
# ==============================================================================
ARG BUILD_CPP=true

FROM ubuntu:24.04 AS cpp-builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    g++ \
    make \
    libcurl4-openssl-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create build directory
WORKDIR /build

# Copy C++ source files and build scripts
COPY src/cpp/ ./src/cpp/
COPY src/updown-bot-cpp/ ./src/updown-bot-cpp/
COPY build-cpp.sh build-updown-bot.sh ./

# Create dist directory
RUN mkdir -p dist

# Compile C++ components (only if BUILD_CPP=true)
ARG BUILD_CPP
RUN if [ "$BUILD_CPP" = "true" ]; then \
        echo "=== Building C++ components ===" && \
        bash build-cpp.sh && \
        bash build-updown-bot.sh && \
        ls -lh dist/ && \
        echo "=== C++ build complete ==="; \
    else \
        echo "=== Skipping C++ build (BUILD_CPP=$BUILD_CPP) ==="; \
    fi

# ==============================================================================
# Stage 2: Node.js Builder
# ==============================================================================
FROM node:18-alpine AS node-builder

# Install build dependencies (Python for node-gyp)
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy package files first (for layer caching)
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm install --production && \
    npm cache clean --force

# Install TypeScript compiler (build only)
RUN npm install --save-dev typescript@^5.3.3 ts-node@^10.9.2

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build && \
    echo "=== TypeScript compilation complete ===" && \
    ls -lh dist/

# ==============================================================================
# Stage 3: Final Runtime
# ==============================================================================
FROM node:18-bullseye-slim

# Install runtime dependencies (Python 3.10)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    python3-dev \
    ca-certificates \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment (PEP 668 compliance for Ubuntu 23.04+)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY scripts/requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Create application directory
WORKDIR /app

# Copy Node.js artifacts from node-builder
COPY --from=node-builder /build/dist ./dist
COPY --from=node-builder /build/node_modules ./node_modules

# Copy C++ binaries from cpp-builder (if built)
ARG BUILD_CPP=true
COPY --from=cpp-builder /build/dist ./dist/bin/

# Copy Python source code
COPY scripts/redemption ./scripts/redemption
COPY scripts/requirements.txt ./scripts/

# Copy configuration files
COPY package.json ./
COPY ecosystem.config.js ./
COPY ecosystem.docker.config.js ./

# Copy source files (for ts-node in ecosystem.config.js)
# Note: ecosystem.config.js uses ts-node, so we need src/ even though we have dist/
COPY src/ ./src/
COPY tsconfig.json ./

# Install PM2 globally
RUN npm install -g pm2@latest

# Create logs directory
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Copy entrypoint scripts
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker-redemption-scheduler.sh /app/docker-redemption-scheduler.sh

# Make scripts executable
RUN chmod +x /docker-entrypoint.sh /app/docker-redemption-scheduler.sh

# Set working directory
WORKDIR /app

# Expose no ports (bots don't serve HTTP)

# Health check (will be overridden in docker-compose for trading-bot)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD pm2 ping || exit 1

# Default entrypoint and command (for trading-bot service)
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["pm2-runtime", "ecosystem.docker.config.js"]
