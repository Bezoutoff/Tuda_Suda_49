#!/bin/bash
# ==============================================================================
# Tuda Suda 49 - Redemption Bot Scheduler (Docker)
# ==============================================================================
#
# This script replaces systemd timer in Docker environment.
# It runs the Python redemption bot every 60 minutes in an infinite loop.
#
# Systemd timer equivalents:
#   OnBootSec=5min           → sleep 300 (wait 5 minutes after start)
#   OnUnitActiveSec=60min    → sleep 3600 (60 minutes between runs)
#   RandomizedDelaySec=5min  → RANDOM_DELAY 0-300 seconds
#   Persistent=true          → Infinite loop (always runs)
#
# Logs are sent to stdout and captured by Docker logs.
#
# ==============================================================================

set -e  # Exit on error (SIGTERM will still allow graceful shutdown)

echo "========================================"
echo "Redemption Bot Scheduler - Starting"
echo "========================================"

# ==============================================================================
# SETUP
# ==============================================================================

# Activate Python virtual environment
if [ -f "/opt/venv/bin/activate" ]; then
  source /opt/venv/bin/activate
  echo "✓ Python venv activated"
else
  echo "ERROR: Python venv not found at /opt/venv/bin/activate"
  exit 1
fi

# Verify Python script exists
if [ ! -f "/app/scripts/redemption/main.py" ]; then
  echo "ERROR: Redemption script not found at /app/scripts/redemption/main.py"
  exit 1
fi

echo "✓ Redemption script found"

# ==============================================================================
# TRAP SIGNALS FOR GRACEFUL SHUTDOWN
# ==============================================================================

# Handle SIGTERM and SIGINT for graceful shutdown
trap 'echo ""; echo "Shutdown signal received, exiting..."; exit 0' SIGTERM SIGINT

# ==============================================================================
# INITIAL DELAY (OnBootSec equivalent)
# ==============================================================================

echo ""
echo "Waiting 5 minutes before first run (OnBootSec)..."
echo "Start time: $(date '+%Y-%m-%d %H:%M:%S %Z')"

sleep 300

# ==============================================================================
# INFINITE LOOP (Systemd timer replacement)
# ==============================================================================

echo "Starting redemption scheduler loop..."
echo ""

RUN_COUNT=0

while true; do
    RUN_COUNT=$((RUN_COUNT + 1))

    echo "========================================"
    echo "Redemption Run #${RUN_COUNT}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "========================================"

    # Run Python redemption bot
    python3 /app/scripts/redemption/main.py

    # Capture exit code
    EXIT_CODE=$?

    echo ""
    echo "========================================"

    if [ $EXIT_CODE -eq 0 ]; then
        echo "✓ Redemption run #${RUN_COUNT} completed successfully"
    else
        echo "❌ Redemption run #${RUN_COUNT} failed with exit code: $EXIT_CODE"
        echo "Continuing to next scheduled run..."
    fi

    # ==============================================================================
    # CALCULATE NEXT RUN TIME
    # ==============================================================================

    # OnUnitActiveSec=60min (3600 seconds)
    BASE_WAIT=3600

    # RandomizedDelaySec=5min (0-300 seconds random delay)
    RANDOM_DELAY=$((RANDOM % 300))

    # Total wait time
    TOTAL_WAIT=$((BASE_WAIT + RANDOM_DELAY))

    # Calculate next run time
    NEXT_RUN=$(date -d "+${TOTAL_WAIT} seconds" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || date -v+${TOTAL_WAIT}S '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "in ${TOTAL_WAIT} seconds")

    echo "Next run scheduled in ${TOTAL_WAIT}s (60min + ${RANDOM_DELAY}s random)"
    echo "Next run time: ${NEXT_RUN}"
    echo "========================================"
    echo ""

    # Sleep until next run
    sleep $TOTAL_WAIT
done
