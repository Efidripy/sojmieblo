#!/bin/bash

# Deployment script for Sojmieblo application
# Supports: Ubuntu 20.04, 22.04, 24.04 (Noble), Debian 11, 12
# Installs: Node.js 20.x LTS, Nginx, and configures systemd service

# Color Output Functions
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
NC="\033[0m" # No Color

# Define Application and Log Directories
APP_DIR="/var/www/sojmieblo"
LOG_DIR="/var/log/sojmieblo"

# Create log directory if it doesn't exist
mkdir -p $LOG_DIR

log_message() {
    echo -e "${GREEN}[INFO] ${NC}$(date) - $1" >> $LOG_DIR/deploy.log
}

error_exit() {
    echo -e "${RED}[ERROR] ${NC}$1" >> $LOG_DIR/deploy.log
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Check OS compatibility
if [ -f /etc/os-release ]; then
    . /etc/os-release
    log_message "Detected OS: $NAME $VERSION"
else
    error_exit "Cannot detect OS version"
fi

# Step 1: Git Clone
log_message "Cloning repository..."
git clone https://github.com/Efidripy/sojmieblo.git $APP_DIR || error_exit "Git clone failed"

# Step 2: Install Node.js
log_message "Installing Node.js 20.x LTS..."

# Удаление старых версий Node.js если есть
apt-get remove -y nodejs npm || true

# Установка необходимых пакетов
apt-get update
apt-get install -y ca-certificates curl gnupg || error_exit "Failed to install prerequisites"

# Добавление NodeSource GPG ключа
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || error_exit "Failed to add NodeSource GPG key"

# Добавление NodeSource репозитория для Node.js 20.x
NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list || error_exit "Failed to add NodeSource repository"

# Установка Node.js
apt-get update
apt-get install -y nodejs || error_exit "Node.js installation failed"

# Проверка установки
node --version || error_exit "Node.js installation verification failed"
npm --version || error_exit "npm installation verification failed"

log_message "Node.js $(node --version) and npm $(npm --version) installed successfully"

# Step 3: Install application dependencies
log_message "Installing application dependencies..."
cd $APP_DIR || error_exit "Failed to change directory to $APP_DIR"
npm install --production || error_exit "Failed to install npm dependencies"

# Step 4: Modify server.js
log_message "Modifying server.js..."
sed -i 's/const port = .*;/const port = 777;/' $APP_DIR/server.js || error_exit "Failed to modify server.js"
sed -i 's/const hostname = .*;/const hostname = "127.0.0.1";/' $APP_DIR/server.js || error_exit "Failed to modify hostname in server.js"

# Step 5: Create Systemd Service
log_message "Creating systemd service..."
cat <<EOL >/etc/systemd/system/sojmieblo.service
[Unit]
Description=Sojmieblo Node.js App
After=network.target

[Service]
Environment=NODE_ENV=production
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOL

systemctl enable sojmieblo.service || error_exit "Failed to enable service"

# Step 6: Nginx Configuration
log_message "Configuring Nginx..."
read -p "Please enter your domain name: " DOMAIN
cat <<EOL >/etc/nginx/sites-available/sojmieblo
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

ln -s /etc/nginx/sites-available/sojmieblo /etc/nginx/sites-enabled/ || error_exit "Failed to create symlink for Nginx"

# Step 7: Restart Services
log_message "Restarting Nginx and Sojmieblo service..."
systemctl restart nginx || error_exit "Failed to restart Nginx"
systemctl start sojmieblo.service || error_exit "Failed to start Sojmieblo service"

# Installation Summary
log_message "Deployment completed successfully! Check the logs for more details."