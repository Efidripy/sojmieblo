#!/bin/bash

# Deployment script for Sojmieblo application
# Supports: Ubuntu 20.04, 22.04, 24.04 (Noble), Debian 11, 12
# Installs: Node.js 20.x LTS, Nginx, and configures systemd service

# Color Output Functions
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
PURPLE="\033[0;35m"
CYAN="\033[0;36m"
NC="\033[0m" # No Color

# Define Application and Log Directories
BACKEND_DIR="/opt/sojmieblo"
FRONTEND_DIR="/var/www/sojmieblo"
APP_DIR="/opt/sojmieblo"  # Keep for backward compatibility
LOG_DIR="/var/log/sojmieblo"
MARKER_FILE="/opt/sojmieblo/.deployed"

# Create log directory if it doesn't exist
mkdir -p $LOG_DIR

# Check and install missing dependencies
check_dependencies() {
    log_message "Checking system dependencies..."
    
    local missing_deps=()
    
    # Check for required commands
    command -v git >/dev/null 2>&1 || missing_deps+=("git")
    command -v curl >/dev/null 2>&1 || missing_deps+=("curl")
    command -v node >/dev/null 2>&1 || missing_deps+=("nodejs")
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Missing dependencies: ${missing_deps[*]}${NC}"
        echo -e "${CYAN}Installing missing dependencies...${NC}"
        
        apt-get update || log_message "Warning: apt-get update failed"
        apt-get install -y ${missing_deps[@]} || log_message "Warning: Some dependencies failed to install"
    fi
    
    # Check Sharp system dependencies
    if ! dpkg -l | grep -q '^ii.*libvips[0-9]'; then
        echo -e "${YELLOW}⚠️  Installing Sharp dependencies...${NC}"
        apt-get install -y build-essential libvips-dev libvips-tools pkg-config python3 || log_message "Warning: Sharp dependencies installation had issues"
    fi
    
    log_message "✅ All dependencies checked"
}

log_message() {
    echo -e "${GREEN}[INFO] ${NC}$(date) - $1" >> $LOG_DIR/deploy.log
}

# Определение текущего порта
get_current_port() {
    local port=""
    
    # 1. Попытка получить порт из systemd service
    if systemctl is-active --quiet sojmieblo; then
        port=$(systemctl show sojmieblo -p Environment --value 2>/dev/null | grep -oP 'PORT=\K\d+')
    fi
    
    # 2. Попытка получить порт из server.js
    if [ -z "$port" ] && [ -f "$BACKEND_DIR/server.js" ]; then
        port=$(grep -oP 'PORT\s*=\s*process\.env\.PORT\s*\|\|\s*\K\d+' "$BACKEND_DIR/server.js" | head -1)
    fi
    
    # 3. Попытка получить порт из .deployed маркера
    if [ -z "$port" ] && [ -f "$MARKER_FILE" ]; then
        port=$(grep -oP '^Port:\s*\K\d+' "$MARKER_FILE")
    fi
    
    # 4. Порт по умолчанию
    if [ -z "$port" ]; then
        port="3000"
    fi
    
    echo "$port"
}

# Сохранение информации о развертывании
save_deployment_info() {
    local commit_hash=$(cd "$BACKEND_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local node_version=$(node --version 2>/dev/null || echo "unknown")
    local current_port=$(get_current_port)
    
    cat > "$MARKER_FILE" << EOF
Installed: $(date)
Commit: ${commit_hash}
Node: ${node_version}
Port: ${current_port}
Backend: ${BACKEND_DIR}
Frontend: ${FRONTEND_DIR}
EOF
    
    log_message "Информация о развертывании сохранена (порт: ${current_port})"
}

error_exit() {
    echo -e "${RED}[ERROR] ${NC}$1" >> $LOG_DIR/deploy.log
    exit 1
}

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
    echo -e "${GREEN}[OK] ${NC}Node.js $(node --version) и npm $(npm --version) установлены успешно"
}

# Function to configure Nginx
configure_nginx() {
    echo -e "${YELLOW}[INFO] ${NC}Настройка Nginx..."
    
    # Проверяем логи systemd перед настройкой nginx для определения правильного порта
    echo ""
    echo "Проверка логов systemd для определения порта..."
    if systemctl is-active --quiet sojmieblo; then
        echo "Последние 50 строк логов сервиса:"
        journalctl -u sojmieblo -n 50 --no-pager | tail -20
        echo ""
    fi
    
    local current_port=$(get_current_port)
    echo -e "${GREEN}Обнаружен порт: ${current_port}${NC}"
    echo ""
    
    echo "Выберите как настроить Nginx:"
    echo "1) Добавить location блок в существующий конфиг"
    echo "2) Создать новый конфиг для Sojmieblo"
    echo "3) Пропустить настройку Nginx"
    read -p "Ваш выбор [1-3]: " nginx_choice
    
    case $nginx_choice in
        1)
            add_to_existing_nginx
            ;;
        2)
            create_new_nginx_config
            ;;
        3)
            log_message "Nginx configuration skipped"
            echo -e "${YELLOW}[INFO] ${NC}Настройка Nginx пропущена"
            return 0
            ;;
        *)
            echo "Неверный выбор, пропускаем Nginx"
            log_message "Invalid Nginx choice, skipped"
            return 0
            ;;
    esac
}

# Function to add location block to existing Nginx config
add_to_existing_nginx() {
    local current_port=$(get_current_port)
    
    echo ""
    echo "Доступные Nginx конфиги:"
    
    # List all configs
    configs=()
    i=1
    for conf in /etc/nginx/sites-available/*; do
        if [ -f "$conf" ]; then
            basename=$(basename "$conf")
            echo "$i) $basename"
            configs+=("$conf")
            ((i++))
        fi
    done
    
    if [ ${#configs[@]} -eq 0 ]; then
        echo "Нет доступных конфигов. Создайте новый."
        create_new_nginx_config
        return
    fi
    
    read -p "Выберите номер конфига [1-${#configs[@]}]: " conf_num
    
    # Validate input
    if ! [[ "$conf_num" =~ ^[0-9]+$ ]] || [ "$conf_num" -lt 1 ] || [ "$conf_num" -gt ${#configs[@]} ]; then
        error_exit "Неверный номер конфига"
    fi
    
    selected_conf="${configs[$((conf_num-1))]}"
    echo "Выбран: $(basename $selected_conf)"
    
    # Ask for location path
    read -p "Введите путь location (например / или /sojmieblo): " location_path
    location_path=${location_path:-/}
    
    # Validate location path - ensure well-formed path with single slashes
    if [[ ! "$location_path" =~ ^/([a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*)?$ ]]; then
        error_exit "Неверный путь location. Путь должен начинаться с / и содержать только буквы, цифры, - и _ между одинарными слэшами"
    fi
    
    # Backup original config
    cp "$selected_conf" "${selected_conf}.backup_$(date +%Y%m%d_%H%M%S)"
    
    # Create location block with markers using current port
    location_block="    # Sojmieblo API - START
    location /api/ {
        proxy_pass http://127.0.0.1:${current_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
    # Sojmieblo API - END

    # Sojmieblo proxy - START
    location $location_path {
        proxy_pass http://127.0.0.1:${current_port}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    # Sojmieblo proxy - END"
    
    # Insert before last } in file
    # Use awk to insert before last closing brace (handles indentation)
    awk -v block="$location_block" '
        /^[[:space:]]*}[[:space:]]*$/ && !found {
            print block
            found=1
        }
        {print}
    ' "$selected_conf" > "${selected_conf}.tmp" && mv "${selected_conf}.tmp" "$selected_conf"
    
    # Test nginx config
    if nginx -t 2>&1 | tee -a $LOG_DIR/deploy.log; then
        systemctl reload nginx
        echo -e "${GREEN}[OK] ${NC}Location блок добавлен в $(basename $selected_conf)"
        echo "Путь: $location_path -> http://127.0.0.1:${current_port}"
        log_message "Nginx location added to $selected_conf at $location_path"
    else
        # Restore backup - find the most recent backup
        latest_backup=$(ls -t "${selected_conf}.backup_"* 2>/dev/null | head -1)
        if [ -n "$latest_backup" ]; then
            mv "$latest_backup" "$selected_conf"
            echo -e "${RED}[ERROR] ${NC}Nginx конфигурация содержит ошибки. Восстановлена резервная копия."
            log_message "Nginx config test failed, backup restored"
        fi
        error_exit "Nginx конфигурация содержит ошибки."
    fi
}

# Function to create new Nginx config
create_new_nginx_config() {
    local current_port=$(get_current_port)
    
    read -p "Введите доменное имя для нового конфига: " DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        echo "Доменное имя не указано, пропускаем."
        log_message "Domain name not provided, Nginx config creation skipped"
        return 0
    fi
    
    cat <<EOL >/etc/nginx/sites-available/sojmieblo
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend static files
    root $FRONTEND_DIR;
    index index.html;

    # Serve static files directly
    location / {
        try_files \$uri \$uri/ @backend;
    }

    # Sojmieblo proxy - START
    # Proxy API requests to backend
    location @backend {
        proxy_pass http://127.0.0.1:${current_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    # Sojmieblo proxy - END
}
EOL

    ln -sf /etc/nginx/sites-available/sojmieblo /etc/nginx/sites-enabled/
    
    if nginx -t 2>&1 | tee -a $LOG_DIR/deploy.log; then
        systemctl reload nginx
        echo -e "${GREEN}[OK] ${NC}Новый Nginx конфиг создан для $DOMAIN"
        log_message "New Nginx config created for $DOMAIN"
    else
        rm -f /etc/nginx/sites-available/sojmieblo
        rm -f /etc/nginx/sites-enabled/sojmieblo
        error_exit "Nginx конфигурация содержит ошибки"
    fi
}

# Полное удаление всех компонентов Sojmieblo
full_uninstall() {
    echo ""
    echo "========================================="
    echo "ВНИМАНИЕ: ПОЛНОЕ УДАЛЕНИЕ SOJMIEBLO"
    echo "========================================="
    echo "Это действие удалит:"
    echo "  - Backend приложение ($BACKEND_DIR)"
    echo "  - Frontend файлы ($FRONTEND_DIR)"
    echo "  - Все сохраненные работы ($BACKEND_DIR/works)"
    echo "  - Systemd сервис"
    echo "  - Nginx конфигурацию"
    echo "  - Node.js (опционально)"
    echo ""
    read -p "Введите 'YES' (заглавными буквами) для подтверждения: " confirm
    
    if [ "$confirm" != "YES" ]; then
        log_message "Полное удаление отменено"
        exit 0
    fi
    
    log_message "Начало полного удаления Sojmieblo..."
    
    # Останавливаем и удаляем systemd сервис
    log_message "Удаление systemd сервиса..."
    systemctl stop sojmieblo 2>/dev/null || true
    systemctl disable sojmieblo 2>/dev/null || true
    rm -f /etc/systemd/system/sojmieblo.service
    systemctl daemon-reload
    
    # Удаляем Nginx конфигурацию (по маркерам)
    log_message "Удаление Nginx конфигурации..."
    if [ -f /etc/nginx/nginx.conf ]; then
        # Удаляем блок между маркерами
        sed -i '/# BEGIN SOJMIEBLO CONFIG/,/# END SOJMIEBLO CONFIG/d' /etc/nginx/nginx.conf 2>/dev/null || true
        nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    fi
    
    # Удаляем Nginx location blocks from existing configs
    if [ -d /etc/nginx/sites-available ]; then
        for conf in /etc/nginx/sites-available/*; do
            if [ -f "$conf" ] && grep -q "# Sojmieblo proxy" "$conf" 2>/dev/null; then
                echo "Удаление Sojmieblo блока из $(basename $conf)"
                # Remove lines between markers
                sed -i '/# Sojmieblo proxy - START/,/# Sojmieblo proxy - END/d' "$conf" || true
            fi
        done
    fi
    
    # Remove site configs
    rm -f /etc/nginx/sites-enabled/sojmieblo 2>/dev/null || true
    rm -f /etc/nginx/sites-available/sojmieblo 2>/dev/null || true
    
    systemctl reload nginx 2>/dev/null || true
    
    # Удаляем backend директорию (включая works)
    if [ -d "$BACKEND_DIR" ]; then
        log_message "Удаление backend директории (включая сохраненные работы)..."
        rm -rf "$BACKEND_DIR" || true
    fi
    
    # Удаляем frontend директорию
    if [ -d "$FRONTEND_DIR" ]; then
        log_message "Удаление frontend директории..."
        rm -rf "$FRONTEND_DIR" || true
    fi
    
    # Удаляем родительскую директорию если пуста
    if [ -d "$(dirname "$BACKEND_DIR")" ]; then
        rmdir "$(dirname "$BACKEND_DIR")" 2>/dev/null || true
    fi
    
    # Удаляем логи
    rm -rf $LOG_DIR 2>/dev/null || true
    
    # Удаляем маркер развертывания
    rm -f "$MARKER_FILE" || true
    
    # Спрашиваем об удалении Node.js
    echo ""
    read -p "Удалить Node.js? (y/N): " remove_node
    if [ "$remove_node" = "y" ] || [ "$remove_node" = "Y" ]; then
        log_message "Удаление Node.js..."
        apt-get remove -y nodejs npm 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
    fi
    
    log_message "Полное удаление Sojmieblo завершено"
    echo ""
    echo "========================================="
    echo "Sojmieblo полностью удален из системы"
    echo "========================================="
    exit 0
}

# Display fun version banner
display_version_banner() {
    local version=$(cd "$BACKEND_DIR" 2>/dev/null && node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    
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
    echo -e "${CYAN}Version: ${version}${NC}\n"
}

# Проверка существующей установки
check_existing_installation() {
    if [ -f "$MARKER_FILE" ]; then
        echo "[WARNING] Sojmieblo уже установлен на этом сервере!"
        cat "$MARKER_FILE" | while IFS= read -r line; do
            echo "$line"
        done
        echo ""
        
        echo "Выберите действие:"
        echo "1) Переустановить (удалить и установить заново)"
        echo "2) Обновить (обновить код из репозитория)"
        echo "3) Отменить установку"
        echo "4) Полное удаление (удалить все компоненты Sojmieblo)"
        read -p "Ваш выбор [1-4]: " choice
        
        case $choice in
            1)
                log_message "Пользователь выбрал переустановку"
                remove_existing_installation
                ;;
            2)
                log_message "Пользователь выбрал обновление"
                update_application
                exit 0
                ;;
            3)
                log_message "Установка отменена пользователем"
                exit 0
                ;;
            4)
                log_message "Пользователь выбрал полное удаление"
                full_uninstall
                ;;
            *)
                log_message "Неверный выбор, установка отменена"
                exit 1
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
    
    # Remove application directories
    rm -rf $BACKEND_DIR
    rm -rf $FRONTEND_DIR
    
    log_message "Существующая установка удалена"
    echo -e "${GREEN}[OK] ${NC}Существующая установка удалена"
}

# Handle error function for update_application and setup_systemd_service
handle_error() {
    echo -e "${RED}[ERROR] ${NC}$1"
    log_message "ERROR: $1"
    exit 1
}

# Обновление приложения
update_application() {
    log_message "Начало обновления Sojmieblo..."
    
    # Сохраняем текущий порт
    local current_port=$(get_current_port)
    log_message "Текущий порт: ${current_port}"
    
    # Останавливаем сервис
    if systemctl is-active --quiet sojmieblo; then
        log_message "Остановка сервиса..."
        systemctl stop sojmieblo || true
    fi
    
    # Создаем резервную копию
    BACKUP_DIR="/tmp/sojmieblo_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp -r "$BACKEND_DIR/." "$BACKUP_DIR/backend/" 2>/dev/null || log_message "Warning: Backend backup failed"
    cp -r "$FRONTEND_DIR/." "$BACKUP_DIR/frontend/" 2>/dev/null || log_message "Warning: Frontend backup failed"
    log_message "Backup created at $BACKUP_DIR"
    
    # Клонируем во временную директорию
    TEMP_CLONE="/tmp/sojmieblo_update_$$"
    git clone https://github.com/Efidripy/sojmieblo.git "$TEMP_CLONE" || handle_error "Не удалось клонировать репозиторий"
    
    # Проверяем изменения в package.json перед обновлением
    local package_changed=0
    if [ -f "$BACKEND_DIR/package.json" ] && [ -f "$TEMP_CLONE/package.json" ]; then
        if ! diff -q "$BACKEND_DIR/package.json" "$TEMP_CLONE/package.json" > /dev/null 2>&1; then
            package_changed=1
        fi
    fi
    
    # Обновляем backend
    if [ -d "$BACKEND_DIR" ]; then
        log_message "Обновление backend..."
        cp "$TEMP_CLONE/server.js" "$BACKEND_DIR/"
        cp "$TEMP_CLONE/package.json" "$BACKEND_DIR/"
        cp "$TEMP_CLONE/package-lock.json" "$BACKEND_DIR/" 2>/dev/null || true
        
        # Если package.json изменился, обновляем зависимости
        if [ "$package_changed" -eq 1 ]; then
            log_message "Обнаружены изменения в package.json, обновление зависимостей..."
            cd "$BACKEND_DIR"
            npm install --production || handle_error "Не удалось обновить npm пакеты"
        fi
    fi
    
    # Обновляем frontend
    if [ -d "$FRONTEND_DIR" ]; then
        log_message "Обновление frontend..."
        cp -r "$TEMP_CLONE/public/." "$FRONTEND_DIR/" || handle_error "Не удалось обновить frontend"
    fi
    
    # Удаляем временную директорию
    rm -rf "$TEMP_CLONE"
    
    # Обновляем server.js для использования правильного пути к frontend
    sed -i "s|path.join(__dirname, 'public')|'$FRONTEND_DIR'|g" "$BACKEND_DIR/server.js" 2>/dev/null || true
    
    # Сохраняем информацию о развертывании с текущим портом
    save_deployment_info
    
    # Перезапускаем сервис
    log_message "Перезапуск сервиса..."
    systemctl restart sojmieblo || handle_error "Не удалось перезапустить сервис"
    
    # Проверяем статус
    sleep 3
    if systemctl is-active --quiet sojmieblo; then
        log_message "Обновление завершено успешно!"
        systemctl status sojmieblo --no-pager
        echo -e "${GREEN}[OK] ${NC}Обновление завершено успешно!"
    else
        handle_error "Сервис не запустился после обновления"
    fi
}

# Настройка systemd сервиса
setup_systemd_service() {
    local port=$(get_current_port)
    
    log_message "Настройка systemd сервиса (порт: ${port})..."
    
    cat > /etc/systemd/system/sojmieblo.service << EOF
[Unit]
Description=Sojmieblo - Face Deformation Web App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${BACKEND_DIR}
Environment="NODE_ENV=production"
Environment="PORT=${port}"
ExecStart=/usr/bin/node ${BACKEND_DIR}/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sojmieblo

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload || handle_error "Не удалось перезагрузить systemd"
    systemctl enable sojmieblo || handle_error "Не удалось включить автозапуск сервиса"
    systemctl start sojmieblo || handle_error "Не удалось запустить сервис"
    
    sleep 3
    
    if systemctl is-active --quiet sojmieblo; then
        log_message "Systemd сервис успешно настроен и запущен на порту ${port}"
    else
        handle_error "Сервис не запустился"
    fi
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}[ERROR] ${NC}Пожалуйста, запустите скрипт с правами root или используйте sudo"
    exit 1
fi

# Display version banner
display_version_banner

# Check dependencies
check_dependencies

# Check existing installation
check_existing_installation

# Step 1: Setup backend and frontend directories
log_message "Setting up backend and frontend directories..."

# Create directories
mkdir -p $BACKEND_DIR
mkdir -p $FRONTEND_DIR

# Clone repository to temp location
TEMP_CLONE="/tmp/sojmieblo_clone_$$"
git clone https://github.com/Efidripy/sojmieblo.git $TEMP_CLONE || error_exit "Git clone failed"

# Copy backend files
cp $TEMP_CLONE/server.js $BACKEND_DIR/
cp $TEMP_CLONE/package.json $BACKEND_DIR/
cp $TEMP_CLONE/package-lock.json $BACKEND_DIR/ 2>/dev/null || true

# Copy frontend files
cp -r $TEMP_CLONE/public/. $FRONTEND_DIR/ || error_exit "Failed to copy frontend files"

# Get git commit for version tracking
cd $TEMP_CLONE
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
cd -

# Cleanup temp
rm -rf $TEMP_CLONE

log_message "Backend and frontend files copied successfully"
echo -e "${GREEN}[OK] ${NC}Файлы скопированы в $BACKEND_DIR и $FRONTEND_DIR"

# Step 2: Check and Install Node.js
log_message "Checking Node.js installation..."

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node -v)
    echo -e "${YELLOW}[INFO] ${NC}Node.js уже установлен: $CURRENT_NODE_VERSION"
    
    # Check if version is acceptable (v18 or higher)
    NODE_MAJOR_VERSION=$(node -v | sed 's/v\([0-9]*\).*/\1/')
    
    # Validate that we got a numeric version
    if ! [[ "$NODE_MAJOR_VERSION" =~ ^[0-9]+$ ]]; then
        NODE_MAJOR_VERSION=0
    fi
    
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

# Step 3: Install application dependencies
log_message "Installing application dependencies..."
cd $BACKEND_DIR || error_exit "Failed to change directory to $BACKEND_DIR"
npm install --production || error_exit "Failed to install npm dependencies"
log_message "Application dependencies installed successfully"

# Step 4: Modify server.js to use new frontend path
log_message "Modifying server.js..."
sed -i 's/const PORT = .*;/const PORT = 777;/' $BACKEND_DIR/server.js || error_exit "Failed to modify server.js"
sed -i "s|path.join(__dirname, 'public')|'$FRONTEND_DIR'|g" $BACKEND_DIR/server.js || error_exit "Failed to update frontend path in server.js"

# Step 5: Setup Systemd Service
setup_systemd_service

# Step 6: Nginx Configuration
configure_nginx

# Step 7: Restart Services
log_message "Restarting Nginx and Sojmieblo service..."
systemctl restart nginx 2>/dev/null || log_message "Warning: Failed to restart Nginx (may not be configured)"

# Create marker file to indicate successful installation
save_deployment_info

# Installation Summary
log_message "Deployment completed successfully! Check the logs for more details."
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Установка завершена успешно!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Информация об установке:"
echo "  - Backend директория: $BACKEND_DIR"
echo "  - Frontend директория: $FRONTEND_DIR"
echo "  - Node.js версия: $(node --version)"
echo "  - npm версия: $(npm --version)"
echo "  - Git коммит: $GIT_COMMIT"
echo "  - Порт: $(get_current_port)"
echo ""
echo "Проверьте статус сервиса:"
echo "  sudo systemctl status sojmieblo.service"
echo ""
echo "Логи установки:"
echo "  $LOG_DIR/deploy.log"
echo ""