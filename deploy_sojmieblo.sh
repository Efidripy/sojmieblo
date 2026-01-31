#!/bin/bash

# Color Output Functions
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
NC="\033[0m" # No Color

# Define Application and Log Directories
APP_DIR="/var/www/sojmieblo"
LOG_DIR="/var/log/sojmieblo"
MARKER_FILE="/var/www/sojmieblo/.deployed"

# Create log directory if it doesn't exist
mkdir -p $LOG_DIR

log_message() {
    echo -e "${GREEN}[INFO] ${NC}$(date) - $1" >> $LOG_DIR/deploy.log
}

error_exit() {
    echo -e "${RED}[ERROR] ${NC}$1" >> $LOG_DIR/deploy.log
    exit 1
}

# Check if application is already installed
check_existing_installation() {
    if [ -f "$MARKER_FILE" ]; then
        echo -e "${YELLOW}[WARNING] ${NC}Sojmieblo уже установлен на этом сервере!"
        echo "Дата предыдущей установки: $(cat $MARKER_FILE)"
        echo ""
        echo "Выберите действие:"
        echo "1) Переустановить (удалить и установить заново)"
        echo "2) Обновить (обновить код из репозитория)"
        echo "3) Отменить установку"
        read -p "Ваш выбор [1-3]: " choice
        
        case $choice in
            1)
                log_message "Пользователь выбрал переустановку"
                remove_existing_installation
                ;;
            2)
                log_message "Пользователь выбрал обновление"
                update_existing_installation
                exit 0
                ;;
            3)
                log_message "Установка отменена пользователем"
                echo "Установка отменена."
                exit 0
                ;;
            *)
                error_exit "Неверный выбор. Установка отменена."
                ;;
        esac
    fi
}

# Remove existing installation
remove_existing_installation() {
    echo -e "${YELLOW}[INFO] ${NC}Удаление существующей установки..."
    
    # Stop service if running
    systemctl stop sojmieblo.service 2>/dev/null || true
    systemctl disable sojmieblo.service 2>/dev/null || true
    
    # Remove systemd service
    rm -f /etc/systemd/system/sojmieblo.service
    systemctl daemon-reload
    
    # Remove Nginx configuration
    rm -f /etc/nginx/sites-enabled/sojmieblo
    rm -f /etc/nginx/sites-available/sojmieblo
    systemctl reload nginx 2>/dev/null || true
    
    # Remove application directory
    rm -rf $APP_DIR
    
    # Remove marker file
    rm -f $MARKER_FILE
    
    log_message "Существующая установка удалена"
    echo -e "${GREEN}[OK] ${NC}Существующая установка удалена"
}

# Update existing installation
update_existing_installation() {
    echo -e "${YELLOW}[INFO] ${NC}Обновление существующей установки..."
    
    # Check if directory exists
    if [ ! -d "$APP_DIR" ]; then
        error_exit "Директория приложения не найдена: $APP_DIR"
    fi
    
    cd $APP_DIR || error_exit "Не удалось перейти в директорию $APP_DIR"
    
    # Stop service
    systemctl stop sojmieblo.service || error_exit "Не удалось остановить сервис"
    
    # Backup current version
    BACKUP_DIR="/tmp/sojmieblo_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    cp -r $APP_DIR/* $BACKUP_DIR/ || log_message "Warning: Backup creation failed"
    log_message "Backup created at $BACKUP_DIR"
    
    # Pull latest changes
    git pull origin main || error_exit "Не удалось обновить код из репозитория"
    
    # Update dependencies
    npm install --production || error_exit "Не удалось установить зависимости"
    
    # Restart service
    systemctl start sojmieblo.service || error_exit "Не удалось запустить сервис"
    
    # Update marker file
    echo "Updated: $(date)" > $MARKER_FILE
    
    log_message "Обновление завершено успешно"
    echo -e "${GREEN}[OK] ${NC}Обновление завершено успешно!"
    echo "Сервис перезапущен. Проверьте статус: sudo systemctl status sojmieblo.service"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}[ERROR] ${NC}Пожалуйста, запустите скрипт с правами root или используйте sudo"
    exit 1
fi

# Check existing installation
check_existing_installation

# Step 1: Git Clone
log_message "Cloning repository..."
git clone https://github.com/Efidripy/sojmieblo.git $APP_DIR || error_exit "Git clone failed"

# Step 2: Check and Install Node.js
log_message "Checking Node.js installation..."

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node -v)
    echo -e "${YELLOW}[INFO] ${NC}Node.js уже установлен: $CURRENT_NODE_VERSION"
    
    # Check if version is acceptable (v18 or higher)
    NODE_MAJOR_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
    
    if [ "$NODE_MAJOR_VERSION" -ge 18 ]; then
        echo -e "${GREEN}[OK] ${NC}Версия Node.js совместима ($CURRENT_NODE_VERSION)"
        log_message "Using existing Node.js $CURRENT_NODE_VERSION"
    else
        echo -e "${YELLOW}[WARNING] ${NC}Установлена устаревшая версия Node.js: $CURRENT_NODE_VERSION"
        read -p "Обновить Node.js до версии 20.x LTS? (y/n): " update_node
        
        if [[ $update_node == "y" || $update_node == "Y" ]]; then
            log_message "Updating Node.js from $CURRENT_NODE_VERSION to 20.x"
            install_nodejs
        else
            echo -e "${YELLOW}[WARNING] ${NC}Продолжаем со старой версией Node.js. Могут возникнуть проблемы."
            log_message "User chose to keep Node.js $CURRENT_NODE_VERSION"
        fi
    fi
else
    echo -e "${YELLOW}[INFO] ${NC}Node.js не установлен. Начинаем установку..."
    install_nodejs
fi

# Function to install Node.js 20.x LTS
install_nodejs() {
    log_message "Installing Node.js 20.x LTS..."
    
    # Remove old versions
    apt-get remove -y nodejs npm 2>/dev/null || true
    
    # Install prerequisites
    apt-get update
    apt-get install -y ca-certificates curl gnupg || error_exit "Failed to install prerequisites"
    
    # Add NodeSource GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || error_exit "Failed to add NodeSource GPG key"
    
    # Add NodeSource repository for Node.js 20.x
    NODE_MAJOR=20
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list || error_exit "Failed to add NodeSource repository"
    
    # Install Node.js
    apt-get update
    apt-get install -y nodejs || error_exit "Node.js installation failed"
    
    # Verify installation
    node --version || error_exit "Node.js installation verification failed"
    npm --version || error_exit "npm installation verification failed"
    
    log_message "Node.js $(node --version) and npm $(npm --version) installed successfully"
    echo -e "${GREEN}[OK] ${NC}Node.js $(node --version) установлен успешно"
}

# Step 3: Install application dependencies
log_message "Installing application dependencies..."
cd $APP_DIR || error_exit "Failed to change directory to $APP_DIR"
npm install --production || error_exit "Failed to install npm dependencies"
log_message "Application dependencies installed successfully"

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

# Create marker file to indicate successful installation
echo "Installed: $(date)" > $MARKER_FILE
echo "Version: $(cd $APP_DIR && git rev-parse --short HEAD)" >> $MARKER_FILE
log_message "Deployment marker created at $MARKER_FILE"

# Installation Summary
log_message "Deployment completed successfully! Check the logs for more details."
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Установка завершена успешно!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Информация об установке:"
echo "  - Директория приложения: $APP_DIR"
echo "  - Node.js версия: $(node --version)"
echo "  - npm версия: $(npm --version)"
echo "  - Git коммит: $(cd $APP_DIR && git rev-parse --short HEAD)"
echo ""
echo "Проверьте статус сервиса:"
echo "  sudo systemctl status sojmieblo.service"
echo ""
echo "Логи установки:"
echo "  $LOG_DIR/deploy.log"
echo ""