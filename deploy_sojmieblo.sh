#!/bin/bash

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

# Step 1: Git Clone
log_message "Cloning repository..."
git clone https://github.com/Efidripy/sojmieblo.git $APP_DIR || error_exit "Git clone failed"

# Step 2: Install Node.js
log_message "Installing Node.js..."
curl -sL https://deb.nodesource.com/setup_14.x | bash - || error_exit "Node.js setup script failed"
apt-get install -y nodejs || error_exit "Node.js installation failed"

# Step 3: Modify server.js
log_message "Modifying server.js..."
sed -i 's/const port = .*;/const port = 777;/' $APP_DIR/server.js || error_exit "Failed to modify server.js"
sed -i 's/const hostname = .*;/const hostname = "127.0.0.1";/' $APP_DIR/server.js || error_exit "Failed to modify hostname in server.js"

# Step 4: Create Systemd Service
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

# Step 5: Nginx Configuration
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

# Step 6: Restart Services
log_message "Restarting Nginx and Sojmieblo service..."
systemctl restart nginx || error_exit "Failed to restart Nginx"
systemctl start sojmieblo.service || error_exit "Failed to start Sojmieblo service"

# Installation Summary
log_message "Deployment completed successfully! Check the logs for more details."