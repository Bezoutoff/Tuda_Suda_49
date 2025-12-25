#!/bin/bash
set -e  # Exit on error

echo "========================================="
echo "Tuda Suda 49 - VPS Setup Script"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root (use sudo)"
fi

info "Starting VPS setup for Tuda Suda 49 bots..."

# 1. Update system
info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# 2. Install Node.js 18.x
info "Installing Node.js 18.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    info "Node.js already installed: $(node --version)"
fi

# 3. Install Git
info "Installing Git..."
if ! command -v git &> /dev/null; then
    apt-get install -y git
else
    info "Git already installed: $(git --version)"
fi

# 4. Install PM2 globally
info "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
else
    info "PM2 already installed: $(pm2 --version)"
fi

# 5. Clone repository (if not exists)
info "Checking repository..."
REPO_DIR="/root/Tuda_Suda_49"
if [ ! -d "$REPO_DIR" ]; then
    info "Cloning repository..."
    git clone https://github.com/Bezoutoff/Tuda_Suda_49.git "$REPO_DIR"
else
    info "Repository already exists, pulling latest changes..."
    cd "$REPO_DIR"
    git pull
fi

cd "$REPO_DIR"

# 6. Install npm dependencies
info "Installing npm dependencies..."
npm install

# 7. Build TypeScript
info "Building TypeScript..."
npm run build

# 8. Check .env file
info "Checking .env file..."
if [ ! -f ".env" ]; then
    warn ".env file not found!"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        warn "Created .env from .env.example - PLEASE EDIT IT!"
        warn "Edit .env file: nano /root/Tuda_Suda_49/.env"
    else
        warn "Please create .env file manually"
    fi
else
    info ".env file exists"
fi

# 9. Create logs directory
info "Creating logs directory..."
mkdir -p "$REPO_DIR/logs"

# 10. Setup PM2 startup
info "Setting up PM2 startup..."
pm2 startup systemd -u root --hp /root
pm2 save

# 11. Disable Docker (if running)
info "Checking Docker..."
if systemctl is-active --quiet docker; then
    warn "Docker is running - stopping and disabling..."
    systemctl stop docker
    systemctl disable docker
    info "Docker disabled (saves ~600MB RAM)"
else
    info "Docker not running"
fi

# 12. Show memory info
info "Current memory usage:"
free -h

echo ""
echo "========================================="
echo -e "${GREEN}✅ VPS Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano /root/Tuda_Suda_49/.env"
echo "2. Fill in your credentials (PK, CLOB_API_KEY, etc.)"
echo "3. Start bots:"
echo ""
echo "   # Start auto-sell-bot"
echo "   pm2 start /root/Tuda_Suda_49/dist/auto-sell-bot.js \\"
echo "     --name auto-sell-bot \\"
echo "     --max-memory-restart 150M"
echo ""
echo "   # Calculate next timestamp"
echo "   node -e \"const next = Math.ceil(Date.now() / 900000) * 900; console.log('updown-15m-' + next)\""
echo ""
echo "   # Start updown-bot-49 (replace TIMESTAMP)"
echo "   pm2 start /root/Tuda_Suda_49/dist/updown-bot-49.js \\"
echo "     --name updown-bot-49 \\"
echo "     --max-memory-restart 250M \\"
echo "     -- updown-15m-TIMESTAMP"
echo ""
echo "4. Check status: pm2 list"
echo "5. View logs: pm2 logs"
echo "6. Save PM2 config: pm2 save"
echo ""
echo "========================================="
