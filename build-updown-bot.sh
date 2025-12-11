#!/bin/bash
set -e

echo "Building UpDownBot C++ binary..."

# Check dependencies
if ! command -v g++ &> /dev/null; then
    echo "ERROR: g++ not found. Install build-essential:"
    echo "  sudo apt-get install -y build-essential libcurl4-openssl-dev libssl-dev"
    exit 1
fi

# Create dist directory
mkdir -p dist

# Compile C++ binary
echo "Compiling src/updown-bot-cpp/updown-bot.cpp..."
g++ -O3 -o dist/updown-bot-cpp src/updown-bot-cpp/updown-bot.cpp -lcurl -lssl -lcrypto

# Make executable
chmod +x dist/updown-bot-cpp

echo "Done: dist/updown-bot-cpp"
echo ""
echo "Test the binary:"
echo "  npm run updown-bot btc-updown-15m-<TIMESTAMP>"
