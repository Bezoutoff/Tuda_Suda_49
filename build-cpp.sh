#!/bin/bash
#
# Build script for C++ latency test
#
# Prerequisites (Ubuntu 24.04):
#   sudo apt-get update
#   sudo apt-get install -y build-essential libcurl4-openssl-dev
#

set -e

echo "Building C++ latency test..."

# Create dist directory if not exists
mkdir -p dist

# Compile with optimizations
g++ -O3 -o dist/test-latency-cpp src/cpp/test-latency.cpp -lcurl -lssl -lcrypto

echo "Build complete: dist/test-latency-cpp"

# Make executable
chmod +x dist/test-latency-cpp

echo "Done!"
