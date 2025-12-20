#!/bin/bash
# ==============================================================================
# Tuda Suda 49 - Docker Entrypoint Script
# ==============================================================================
#
# This script is executed when the Docker container starts.
# It performs initialization and validation before starting the main process.
#
# Functions:
#   1. Validate required environment variables
#   2. Activate Python virtual environment
#   3. Create necessary directories
#   4. Set permissions for C++ binaries
#   5. Execute the main command (PM2 or redemption scheduler)
#
# ==============================================================================

set -e  # Exit on error

echo "========================================"
echo "Tuda Suda 49 - Docker Entrypoint"
echo "========================================"

# ==============================================================================
# 1. ENVIRONMENT VALIDATION
# ==============================================================================
echo "[1/5] Validating environment variables..."

REQUIRED_VARS=(
  "PK"
  "CLOB_API_KEY"
  "CLOB_SECRET"
  "CLOB_PASS_PHRASE"
  "FUNDER"
)

VALIDATION_FAILED=0

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "  ❌ ERROR: Required environment variable $VAR is not set"
    VALIDATION_FAILED=1
  else
    # Don't print values for security - just show length
    VAR_VALUE="${!VAR}"
    VAR_LEN=${#VAR_VALUE}
    echo "  ✓ $VAR is set (${VAR_LEN} characters)"
  fi
done

if [ $VALIDATION_FAILED -eq 1 ]; then
  echo ""
  echo "ERROR: Missing required environment variables"
  echo "Please check your .env file and ensure all required variables are set."
  echo ""
  echo "Required variables:"
  echo "  - PK:               Wallet private key (64 hex chars WITHOUT 0x prefix)"
  echo "  - CLOB_API_KEY:     Polymarket CLOB API key"
  echo "  - CLOB_SECRET:      Polymarket CLOB API secret"
  echo "  - CLOB_PASS_PHRASE: Polymarket CLOB API passphrase"
  echo "  - FUNDER:           Funder address (0x...)"
  echo ""
  exit 1
fi

echo "  ✓ All required environment variables are set"

# ==============================================================================
# 2. PYTHON VIRTUAL ENVIRONMENT
# ==============================================================================
echo "[2/5] Activating Python virtual environment..."

if [ -f "/opt/venv/bin/activate" ]; then
  source /opt/venv/bin/activate
  echo "  ✓ Python venv activated: $(which python3)"
  echo "  ✓ Python version: $(python3 --version)"
else
  echo "  ⚠️  WARNING: Python venv not found at /opt/venv/bin/activate"
  echo "  Python scripts may not work correctly"
fi

# ==============================================================================
# 3. DIRECTORY SETUP
# ==============================================================================
echo "[3/5] Setting up directories..."

# Create logs directory if it doesn't exist
mkdir -p /app/logs
chmod 755 /app/logs

echo "  ✓ Logs directory ready: /app/logs"

# ==============================================================================
# 4. C++ BINARIES PERMISSIONS
# ==============================================================================
echo "[4/5] Checking C++ binaries..."

CPP_BINARIES_FOUND=0

# Check for C++ binaries and make them executable
if [ -f "/app/dist/updown-bot-cpp" ]; then
  chmod +x /app/dist/updown-bot-cpp
  echo "  ✓ updown-bot-cpp is ready"
  CPP_BINARIES_FOUND=1
fi

if [ -f "/app/dist/test-latency-cpp" ]; then
  chmod +x /app/dist/test-latency-cpp
  echo "  ✓ test-latency-cpp is ready"
  CPP_BINARIES_FOUND=1
fi

if [ $CPP_BINARIES_FOUND -eq 0 ]; then
  echo "  ℹ️  INFO: No C++ binaries found (optional, BUILD_CPP may be false)"
fi

# ==============================================================================
# 5. STARTUP
# ==============================================================================
echo "[5/5] Starting application..."
echo ""
echo "Container: $(hostname)"
echo "User: $(whoami)"
echo "Working directory: $(pwd)"
echo "Command: $@"
echo "========================================"
echo ""

# Execute the CMD from Dockerfile or docker-compose
# This will be either:
#   - "pm2-runtime ecosystem.config.js" (trading-bot)
#   - "/app/docker-redemption-scheduler.sh" (redemption-scheduler)
exec "$@"
