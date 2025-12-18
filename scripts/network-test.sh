#!/bin/bash

################################################################################
# Polymarket Network Test Script
#
# Tests network connectivity to Polymarket servers:
# - DNS resolution (IP addresses)
# - Ping latency (min/avg/max/mdev)
# - Traceroute (hop count and route)
# - MTR report (combined ping + traceroute)
#
# Usage: ./network-test.sh
# Output: network-test-YYYY-MM-DD_HH-MM-SS.txt
################################################################################

# Polymarket endpoints
ENDPOINTS=(
  "clob.polymarket.com"
  "gamma-api.polymarket.com"
)

# Test parameters
PING_COUNT=10
MTR_COUNT=10

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output file with timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUTPUT_FILE="network-test-${TIMESTAMP}.txt"

################################################################################
# Functions
################################################################################

print_header() {
  local title="$1"
  echo ""
  echo "=========================================="
  echo "$title"
  echo "=========================================="
  echo ""
}

print_subheader() {
  local title="$1"
  echo ""
  echo "--- $title ---"
  echo ""
}

test_dns() {
  local host="$1"
  echo "DNS Resolution:"

  # Try dig first
  if command -v dig &> /dev/null; then
    local ip=$(dig +short "$host" | head -1)
    if [ -n "$ip" ]; then
      echo "  IP Address: $ip"
      echo "  Method: dig"
    else
      echo "  Error: Could not resolve $host"
    fi
  # Fallback to nslookup
  elif command -v nslookup &> /dev/null; then
    local ip=$(nslookup "$host" | grep -A1 "Name:" | tail -1 | awk '{print $2}')
    if [ -n "$ip" ]; then
      echo "  IP Address: $ip"
      echo "  Method: nslookup"
    else
      echo "  Error: Could not resolve $host"
    fi
  else
    echo "  Error: Neither dig nor nslookup available"
  fi

  echo ""
}

test_ping() {
  local host="$1"
  echo "Ping Test (${PING_COUNT} packets):"

  if ! command -v ping &> /dev/null; then
    echo "  Error: ping command not found"
    echo "  Install: sudo apt-get install iputils-ping"
    return 1
  fi

  # Run ping
  local ping_output=$(ping -c "$PING_COUNT" -W 5 "$host" 2>&1)
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    # Extract statistics
    local stats=$(echo "$ping_output" | grep "rtt min/avg/max/mdev" | cut -d'=' -f2 | tr -d ' ')
    local loss=$(echo "$ping_output" | grep "packet loss" | awk '{print $(NF-4), $(NF-3), $(NF-2)}')

    echo "  Statistics: $stats"
    echo "  Packet loss: $loss"

    # Parse min/avg/max/mdev
    IFS='/' read -r min avg max mdev <<< "$stats"
    echo "  Min: ${min}ms"
    echo "  Avg: ${avg}ms"
    echo "  Max: ${max}ms"
    echo "  Jitter (mdev): ${mdev}ms"
  else
    echo "  Error: Ping failed"
    echo "  Output: $ping_output"
  fi

  echo ""
}

test_traceroute() {
  local host="$1"
  echo "Traceroute:"

  if ! command -v traceroute &> /dev/null; then
    echo "  Error: traceroute command not found"
    echo "  Install: sudo apt-get install traceroute"
    return 1
  fi

  # Run traceroute with numeric output (-n) and max 30 hops
  echo "  Running traceroute to $host (max 30 hops)..."
  echo ""

  traceroute -n -m 30 "$host" 2>&1 | while IFS= read -r line; do
    echo "  $line"
  done

  echo ""

  # Count hops
  local hop_count=$(traceroute -n -m 30 "$host" 2>&1 | grep -E '^\s*[0-9]+' | wc -l)
  echo "  Total hops: $hop_count"

  echo ""
}

test_mtr() {
  local host="$1"
  echo "MTR Report (combined ping + traceroute):"

  if ! command -v mtr &> /dev/null; then
    echo "  Warning: mtr command not found (optional)"
    echo "  Install: sudo apt-get install mtr-tiny"
    echo "  Skipping MTR test..."
    return 0
  fi

  # Run MTR report mode
  echo "  Running MTR to $host (${MTR_COUNT} cycles)..."
  echo ""

  mtr -r -c "$MTR_COUNT" -n "$host" 2>&1 | while IFS= read -r line; do
    echo "  $line"
  done

  echo ""
}

################################################################################
# Main Test Function
################################################################################

run_test() {
  local host="$1"

  print_subheader "$host"

  test_dns "$host"
  test_ping "$host"
  test_traceroute "$host"
  test_mtr "$host"
}

################################################################################
# Main Script
################################################################################

main() {
  # Print header
  print_header "Polymarket Network Test"

  echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Hostname: $(hostname)"
  echo "OS: $(uname -s) $(uname -r)"

  # Detect Ubuntu version if available
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Distribution: $NAME $VERSION"
  fi

  echo ""
  echo "Output file: $OUTPUT_FILE"

  # Check dependencies
  print_subheader "Checking Dependencies"

  local missing_deps=()

  if ! command -v dig &> /dev/null && ! command -v nslookup &> /dev/null; then
    missing_deps+=("dnsutils (for dig)")
  fi

  if ! command -v ping &> /dev/null; then
    missing_deps+=("iputils-ping")
  fi

  if ! command -v traceroute &> /dev/null; then
    missing_deps+=("traceroute")
  fi

  if [ ${#missing_deps[@]} -gt 0 ]; then
    echo -e "${RED}Missing required dependencies:${NC}"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done
    echo ""
    echo "Install with:"
    echo "  sudo apt-get install -y dnsutils iputils-ping traceroute mtr-tiny"
    echo ""
    exit 1
  fi

  echo -e "${GREEN}All required dependencies found${NC}"

  if ! command -v mtr &> /dev/null; then
    echo -e "${YELLOW}Optional: mtr-tiny not found (MTR test will be skipped)${NC}"
  fi

  # Run tests for each endpoint
  for endpoint in "${ENDPOINTS[@]}"; do
    run_test "$endpoint"
  done

  # Print summary
  print_header "Summary"

  echo "Test completed at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo ""
  echo "Endpoints tested:"
  for endpoint in "${ENDPOINTS[@]}"; do
    echo "  - $endpoint"
  done
  echo ""
  echo "Next steps:"
  echo "  1. Review results in: $OUTPUT_FILE"
  echo "  2. Compare with baseline metrics from current VPS"
  echo "  3. Key metrics: ping avg, hop count, packet loss"
  echo ""

  print_header "Expected Baseline (USA/Canada VPS)"
  echo "  Ping: ~100-150ms"
  echo "  Hops: ~10-15"
  echo "  Packet loss: 0%"
  echo ""

  print_header "Expected Results (Europe VPS)"
  echo "  Ping: ~400-500ms"
  echo "  Hops: ~15-20"
  echo "  Packet loss: 0%"
  echo ""
}

# Run main function and tee output to file
main 2>&1 | tee "$OUTPUT_FILE"

echo -e "${GREEN}Results saved to: $OUTPUT_FILE${NC}"
