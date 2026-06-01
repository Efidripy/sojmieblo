require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;

// Новые импорты
const ImageConverter = require('./utils/imageConverter');
const FileManager = require('./utils/fileManager');

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_RATE_LIMIT = process.env.ENABLE_RATE_LIMIT !== 'false';
const parsedMaxLength = parseInt(process.env.MAX_IMAGE_LENGTH, 10);
const parsedMaxBytes = parseInt(process.env.MAX_IMAGE_BYTES, 10);
const MAX_IMAGE_LENGTH = !isNaN(parsedMaxLength) ? parsedMaxLength : (50 * 1024 * 1024); // 50MB base64 length default
const MAX_IMAGE_BYTES = !isNaN(parsedMaxBytes) ? parsedMaxBytes : (30 * 1024 * 1024); // 30MB binary default

// Увеличиваем лимит для загрузки больших изображений
// Используем 50mb для express.json чтобы покрыть base64 инфляцию (~33% оверхед)
// Фронтенд лимит: 30MB бинарных данных -> ~40MB base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Инициализация FileManager
const parsedCacheTtl = parseInt(process.env.WORKS_CACHE_TTL_MS, 10);
const worksCacheTtlMs = !isNaN(parsedCacheTtl) ? parsedCacheTtl : 10 * 1000;
const fileManager = new FileManager(__dirname, { cacheTtlMs: worksCacheTtlMs });
let isInitialized = false;

// Middleware для проверки инициализации
const checkInitialized = (req, res, next) => {
    if (!isInitialized && req.path.startsWith('/api/')) {
        return res.status(503).json({ error: 'Service is initializing, please try again in a moment' });
    }
    next();
};

// Инициализация при старте сервера
(async () => {
    try {
        await fileManager.initialize();
        fileManager.startAutoCleanup(1, 7); // Автоочистка каждый час, удаляем файлы старше 7 дней
        isInitialized = true;
        console.log('[INFO] FileManager инициализирован');
    } catch (error) {
        console.error('[ERROR] Ошибка инициализации FileManager:', error);
        console.error('[ERROR] Сервер продолжит работу, но функционал работ будет недоступен');
    }
})();

// Middleware для ограничения количества запросов (защита от злоупотреблений)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: 'Слишком много запросов с вашего IP-адреса. Пожалуйста, попробуйте позже.'
});

if (ENABLE_RATE_LIMIT) {
    app.use(limiter);
    console.log('[INFO] Rate limit is ENABLED');
} else {
    console.log('[INFO] Rate limit is DISABLED');
}

// Проверка инициализации для API эндпоинтов
app.use(checkInitialized);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// API: Сохранить работу
app.post('/api/save-work', async (req, res) => {
    try {
        const { image, metadata } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }
        
        // Validate image is a string
        if (typeof image !== 'string') {
            return res.status(400).json({ error: 'Image must be a string' });
        }
        
        // Validate image length (reasonable base64 image size)
        // Configurable via MAX_IMAGE_LENGTH env var, defaults to 50MB
        if (image.length > MAX_IMAGE_LENGTH) {
            return res.status(400).json({ error: 'Image data too large' });
        }
        
        // Validate base64 format
        const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp|bmp);base64,/;
        if (!base64Regex.test(image)) {
            return res.status(400).json({ error: 'Invalid image format. Must be a base64-encoded image.' });
        }
        
        // Конвертируем base64 в buffer
        const imageBuffer = ImageConverter.base64ToBuffer(image);
        
        // Проверяем размер декодированного буфера (бинарные данные)
        if (imageBuffer.length > MAX_IMAGE_BYTES) {
            return res.status(400).json({ error: 'Image file too large' });
        }

        // Получаем информацию об изображении
        const imageInfo = await ImageConverter.getImageInfo(imageBuffer);
        
        // Конвертируем в JPEG с максимальным качеством
        const jpegBuffer = await ImageConverter.convertToJPEG(imageBuffer, {
            quality: 95,
            stripMetadata: true,
            addWatermark: true
        });
        
        // Создаем миниатюру
        const thumbnailBuffer = await ImageConverter.createThumbnail(jpegBuffer, 200);
        
        // Сохраняем работу
        const result = await fileManager.saveWork(
            jpegBuffer,
            thumbnailBuffer,
            {
                originalWidth: imageInfo.width,
                originalHeight: imageInfo.height,
                format: imageInfo.format,
                userMetadata: metadata
            }
        );

        res.json({
            success: true,
            message: 'Работа успешно сохранена',
            work: result
        });

    } catch (error) {
        console.error('[ERROR] Ошибка сохранения работы:', error);
        res.status(500).json({ 
            error: 'Ошибка сохранения работы',
            details: error.message 
        });
    }
});

// API: Получить список всех работ
app.get('/api/works', async (req, res) => {
    try {
        const works = await fileManager.getWorks();
        res.json({
            success: true,
            works,
            total: works.length
        });
    } catch (error) {
        console.error('[ERROR] Ошибка получения работ:', error);
        res.status(500).json({ 
            error: 'Ошибка получения работ',
            details: error.message 
        });
    }
});

// API: Получить конкретную работу (метаданные)
app.get('/api/works/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const metadata = await fileManager.getWorkMetadata(id);
        
        if (!metadata) {
            return res.status(404).json({ error: 'Work not found' });
        }
        
        res.json(metadata);
    } catch (error) {
        console.error('[ERROR] Ошибка получения работы:', error);
        res.status(500).json({ error: 'Failed to get work' });
    }
});

// API: Получить изображение работы
app.get('/api/works/:id/image', async (req, res) => {
    try {
        const { id } = req.params;
        const imagePath = await fileManager.getImagePath(id);
        res.sendFile(imagePath);
    } catch (error) {
        console.error('[ERROR] Ошибка отправки изображения:', error);
        res.status(404).json({ 
            error: 'Изображение не найдено',
            details: error.message 
        });
    }
});

// API: Скачать работу (полное изображение)
app.get('/api/works/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const work = await fileManager.getWork(id);
        const imagePath = await fileManager.getImagePath(id);
        
        res.download(imagePath, `sojmieblo_${id}.jpg`);
    } catch (error) {
        console.error('[ERROR] Ошибка скачивания работы:', error);
        res.status(404).json({ 
            error: 'Работа не найдена',
            details: error.message 
        });
    }
});

// API: Получить миниатюру работы
app.get('/api/works/:id/thumbnail', async (req, res) => {
    try {
        const { id } = req.params;
        const thumbnailPath = await fileManager.getThumbnailPath(id);
        res.sendFile(thumbnailPath);
    } catch (error) {
        console.error('[ERROR] Ошибка отправки миниатюры:', error);
        res.status(404).json({ 
            error: 'Миниатюра не найдена',
            details: error.message 
        });
    }
});

// API: Удалить работу
app.delete('/api/works/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await fileManager.deleteWork(id);
        res.json({ 
            success: true, 
            message: 'Работа успешно удалена',
            id 
        });
    } catch (error) {
        console.error('[ERROR] Ошибка удаления работы:', error);
        res.status(500).json({ 
            error: 'Ошибка удаления работы',
            details: error.message 
        });
    }
});

// API: Статистика хранилища
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await fileManager.getStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('[ERROR] Ошибка получения статистики:', error);
        res.status(500).json({ 
            error: 'Ошибка получения статистики',
            details: error.message 
        });
    }
});

// Главный маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
const server = app.listen(PORT, () => {
    console.log(`[INFO] 🚀 Сервер Sojmieblo запущен на http://localhost:${PORT}`);
    console.log(`[INFO] 📁 Директория работ: ${fileManager.worksDir}`);
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('[INFO] SIGTERM получен, закрываем сервер...');
    server.close(() => {
        console.log('[INFO] Сервер закрыт');
        fileManager.stopAutoCleanup();
        process.exit(0);
    });
    
    // Форсированное завершение через 10 секунд
    setTimeout(() => {
        console.error('[ERROR] Не удалось закрыть соединения вовремя, форсируем завершение');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
