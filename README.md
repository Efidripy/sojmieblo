```
   _____       _           _      _     _       
  / ____|     (_)         (_)    | |   | |      
 | (___   ___  _  ___  ___ _  ___| |__ | | ___  
  \___ \ / _ \| |/ _ \/ __| |/ _ \ '_ \| |/ _ \ 
  ____) | (_) | | (_) \__ \ |  __/ |_) | | (_) |
 |_____/ \___/| |\___/|___/_|\___|_.__/|_|\___/ 
             _/ |                                
            |__/                                 
```

## 🎯 О проекте

**Sojmieblo** — интерактивное веб-приложение для деформации лиц в реальном времени с эффектами WebGL.  
**Техстек:** Backend (Node.js, Express, Sharp), Frontend (Vanilla JS, WebGL/glfx.js), механика деформации в реальном времени.

## ✨ Возможности

- 🎨 Деформация лиц в реальном времени при наведении мыши
- 💾 Сохранение и галерея работ
- ⚡ WebGL ускорение для плавной работы (60 FPS)
- 🖼️ Поддержка Drag & Drop и вставки из буфера обмена
- 🎚️ Настраиваемая сила и радиус деформации
- 📱 Адаптивный дизайн для всех устройств
- 🔒 Rate limiting для защиты от злоупотреблений

## 🚀 Быстрая установка

**Вариант 1: Автоматическая установка с systemd (Linux серверы)**
```bash
curl -fsSL https://raw.githubusercontent.com/Efidripy/sojmieblo/main/install.sh | sudo bash
```

**Вариант 2: Полное развертывание с Nginx (производственные серверы)**
```bash
wget https://raw.githubusercontent.com/Efidripy/sojmieblo/main/deploy_sojmieblo.sh && chmod +x deploy_sojmieblo.sh && sudo ./deploy_sojmieblo.sh
```

**Вариант 3: Локальный запуск**
```bash
git clone https://github.com/Efidripy/sojmieblo.git && cd sojmieblo && npm install && npm start
```

Приложение будет доступно по адресу: http://localhost:3000

## 📋 Требования

- **Node.js** 18+ (рекомендуется 20.x LTS)
- **Браузер** с поддержкой WebGL (Chrome, Firefox, Safari, Edge)
- **Зависимости:**
  - `express` (^4.18.2) — веб-фреймворк
  - `express-rate-limit` (^6.7.0) — ограничение запросов
  - `sharp` (^0.33.2) — обработка изображений
  - `uuid` (^9.0.1) — генерация ID

## ⚙️ Конфигурация

Настройки приложения находятся в `public/config.js`.

**Основные параметры деформации:**
- `defaultBrushRadius: 100` — радиус кисти по умолчанию (20-300px)
- `initialStrength: -0.5` — начальная сила деформации (-1.5 до 0)
- `strengthIncreaseRate: 0.5` — скорость нарастания силы
- `maxFileSize: 10485760` — максимальный размер файла (10MB)
- `enableDragAndDrop: true` — поддержка перетаскивания файлов

Подробнее см. в `public/config.js`.

## 🌐 Nginx Configuration

If deploying with Nginx as a reverse proxy, ensure you configure the maximum upload size to match the application limits (30MB):

**For Nginx configuration**, add to your server block:
```nginx
server {
    # ... other configuration ...
    
    # Increase client body size limit for large image uploads (30MB)
    client_max_body_size 30M;
    
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Important: Allow large uploads
        client_max_body_size 30M;
    }
}
```

After updating the configuration:
```bash
sudo nginx -t          # Test configuration
sudo systemctl reload nginx  # Apply changes
```

**Why Express.json limit is 50MB:**
- Frontend limit: 30MB for binary image data (CONFIG.upload.maxFileSize)
- Base64 encoding adds ~33% overhead: 30MB binary → ~40MB base64
- Express.json limit: 50MB to safely accommodate base64-encoded images with buffer for HTTP headers and metadata
- Rate limiting: 100 requests per 15 minutes (configured in server.js)

## 🔧 Управление

**Проверка статуса:**
```bash
systemctl status sojmieblo
```

**Просмотр логов:**
```bash
journalctl -u sojmieblo -f
```

**Перезапуск:**
```bash
systemctl restart sojmieblo
```

**Остановка:**
```bash
systemctl stop sojmieblo
```

**Обновление:**
```bash
cd /opt/sojmieblo && git pull origin main && npm install && systemctl restart sojmieblo
```

## 📁 Структура проекта

```
/opt/sojmieblo/          # Backend
├── server.js            # Express сервер
├── utils/               # Утилиты
└── works/               # Сохраненные работы

/var/www/sojmieblo/      # Frontend
├── index.html           # Главная страница
├── app.js               # Основная логика
├── workManager.js       # Управление работами
├── imageProcessor.js    # Обработка изображений
├── config.js            # Конфигурация
├── styles.css           # Стили
└── glfx.js              # WebGL библиотека
```

## 📄 Лицензия

MIT

## 🤝 Контрибьюторы

Приветствуем вклад в проект! Форкните репозиторий, создайте ветку, закоммитьте изменения и откройте Pull Request.
