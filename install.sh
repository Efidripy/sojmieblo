#!/bin/bash

# Sojmieblo Smart Installer 🚀
# Auto-detects and installs missing dependencies

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}"
cat << "EOF"
   _____       _           _      _     _       
  / ____|     (_)         (_)    | |   | |      
 | (___   ___  _  ___  ___ _  ___| |__ | | ___  
  \___ \ / _ \| |/ _ \/ __| |/ _ \ '_ \| |/ _ \ 
  ____) | (_) | | (_) \__ \ |  __/ |_) | | (_) |
 |_____/ \___/| |\___/|___/_|\___|_.__/|_|\___/ 
             _/ |                                
            |__/                                 
EOF
echo -e "${NC}"

# Version Generator (semantic + fun)
generate_version() {
    local major=1
    local minor=$((RANDOM % 10))
    local patch=$((RANDOM % 100))
    local codename=(
        "Squished-Banana"
        "Melted-Ice-Cream"
        "Rubber-Face"
        "Pixel-Pudding"
        "Elastic-Cheese"
        "Wobbly-Jelly"
        "Silly-Putty"
        "Bouncy-Castle"
        "Stretchy-Spaghetti"
        "Gooey-Marshmallow"
    )
    local random_name=${codename[$RANDOM % ${#codename[@]}]}
    echo "${major}.${minor}.${patch}-${random_name}"
}

VERSION=$(generate_version)

echo -e "${CYAN}🎉 Installing Sojmieblo v${VERSION}${NC}\n"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root (sudo ./install.sh)${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Detected OS: $OS $VER${NC}\n"

# Function: Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function: Install Node.js 20.x
install_nodejs() {
    if command_exists node; then
        NODE_VERSION=$(node --version | grep -oP '\d+' | head -1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            echo -e "${GREEN}✅ Node.js $(node --version) already installed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Old Node.js version detected, upgrading...${NC}"
        fi
    fi
    
    echo -e "${YELLOW}📥 Installing Node.js 20.x LTS...${NC}"
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    else
        echo -e "${RED}❌ Unsupported OS for auto Node.js install${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Node.js $(node --version) installed${NC}"
}

# Function: Install Sharp dependencies
install_sharp_deps() {
    echo -e "${YELLOW}📥 Installing Sharp image processing dependencies...${NC}"
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y \
            build-essential \
            libvips-dev \
            libvips-tools \
            pkg-config \
            python3
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
        yum groupinstall -y "Development Tools"
        yum install -y vips-devel vips-tools
    fi
    
    echo -e "${GREEN}✅ Sharp dependencies installed${NC}"
}

# Function: Install Git
install_git() {
    if command_exists git; then
        echo -e "${GREEN}✅ Git $(git --version) already installed${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}📥 Installing Git...${NC}"
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get install -y git
    else
        yum install -y git
    fi
    
    echo -e "${GREEN}✅ Git installed${NC}"
}

# Function: Install application
install_app() {
    local INSTALL_DIR="/opt/sojmieblo"
    
    echo -e "${YELLOW}📥 Installing application to ${INSTALL_DIR}...${NC}"
    
    # Clone or update repository
    if [ -d "$INSTALL_DIR/.git" ]; then
        echo -e "${BLUE}🔄 Updating existing installation...${NC}"
        cd "$INSTALL_DIR"
        # Reset local changes (including version number from previous install) to avoid merge conflicts
        git reset --hard HEAD
        git pull origin main
    else
        echo -e "${BLUE}📦 Cloning repository...${NC}"
        mkdir -p "$INSTALL_DIR"
        git clone https://github.com/Efidripy/sojmieblo.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    
    # Update version in package.json (after git pull/clone to avoid conflicts)
    sed -i.bak 's/^  "version": ".*"/  "version": "'"${VERSION}"'"/' package.json
    
    # Install npm dependencies
    echo -e "${YELLOW}📥 Installing npm packages...${NC}"
    npm install --production
    
    # Create works directory
    mkdir -p "$INSTALL_DIR/works"
    chmod 755 "$INSTALL_DIR/works"
    
    echo -e "${GREEN}✅ Application installed${NC}"
}

# Function: Setup systemd service
setup_systemd() {
    echo -e "${YELLOW}⚙️  Setting up systemd service...${NC}"
    
    cat > /etc/systemd/system/sojmieblo.service << EOF
[Unit]
Description=Sojmieblo - Interactive Face Deformation App v${VERSION}
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sojmieblo
ExecStart=/usr/bin/node /opt/sojmieblo/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable sojmieblo.service
    systemctl restart sojmieblo.service
    
    echo -e "${GREEN}✅ Systemd service configured${NC}"
}

# Function: Check installation
check_installation() {
    echo -e "\n${CYAN}🔍 Checking installation...${NC}"
    
    sleep 2
    
    if systemctl is-active --quiet sojmieblo.service; then
        echo -e "${GREEN}✅ Service is running!${NC}"
        
        local PORT=$(grep -oP 'PORT=\K\d+' /etc/systemd/system/sojmieblo.service)
        echo -e "${CYAN}🌐 Application is available at: http://localhost:${PORT}${NC}"
    else
        echo -e "${RED}❌ Service failed to start${NC}"
        echo -e "${YELLOW}📋 Check logs: sudo journalctl -u sojmieblo.service -n 50${NC}"
        exit 1
    fi
}

# Main Installation Flow
main() {
    echo -e "${CYAN}🚀 Starting installation...${NC}\n"
    
    install_git
    install_nodejs
    install_sharp_deps
    install_app
    setup_systemd
    check_installation
    
    echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✨ Sojmieblo v${VERSION} installed successfully! ✨${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Nginx Configuration${NC}"
    echo "If using Nginx, add these location blocks to your server config:"
    echo ""
    echo "    # Sojmieblo API"
    echo "    location /api/ {"
    echo "        proxy_pass http://127.0.0.1:3000;"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Upgrade \$http_upgrade;"
    echo "        proxy_set_header Connection 'upgrade';"
    echo "        proxy_set_header Host \$host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_cache_bypass \$http_upgrade;"
    echo "    }"
    echo ""
    echo "    # Sojmieblo frontend"
    echo "    location / {"
    echo "        proxy_pass http://127.0.0.1:3000;"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Host \$host;"
    echo "    }"
    echo ""
    
    echo -e "${CYAN}📝 Useful commands:${NC}"
    echo -e "  ${YELLOW}sudo systemctl status sojmieblo${NC}  - Check status"
    echo -e "  ${YELLOW}sudo systemctl restart sojmieblo${NC} - Restart service"
    echo -e "  ${YELLOW}sudo journalctl -u sojmieblo -f${NC}  - View logs"
    echo -e "  ${YELLOW}cd /opt/sojmieblo && git pull${NC}     - Update app\n"
}

# Run installation
main
