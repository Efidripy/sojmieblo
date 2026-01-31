const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;

// Новые импорты
const ImageConverter = require('./utils/imageConverter');
const FileManager = require('./utils/fileManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Увеличиваем лимит для загрузки больших изображений
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Инициализация FileManager
const fileManager = new FileManager(__dirname);

// Инициализация при старте сервера
(async () => {
    try {
        await fileManager.initialize();
        fileManager.startAutoCleanup(1); // Автоочистка каждый час
        console.log('FileManager инициализирован');
    } catch (error) {
        console.error('Ошибка инициализации FileManager:', error);
    }
})();

// Middleware для ограничения количества запросов (защита от злоупотреблений)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: 'Слишком много запросов с вашего IP-адреса. Пожалуйста, попробуйте позже.'
});

app.use(limiter);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// API: Сохранить работу
app.post('/api/save-work', async (req, res) => {
    try {
        const { image, metadata } = req.body;
        
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }
        
        // Конвертируем base64 в buffer
        const imageBuffer = ImageConverter.base64ToBuffer(image);
        
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
        
        // Генерируем имя файла
        const fileName = fileManager.generateFileName('jpg');
        const workId = path.parse(fileName).name; // ID без расширения
        
        // Сохраняем файлы
        await fileManager.saveFile(fileName, jpegBuffer, false);
        await fileManager.saveFile(fileName, thumbnailBuffer, true);
        
        // Создаем метаданные
        const workMetadata = {
            id: workId,
            fileName: fileName,
            createdAt: new Date().toISOString(),
            imageInfo: {
                width: imageInfo.width,
                height: imageInfo.height,
                format: 'jpeg'
            },
            userMetadata: metadata || {}
        };
        
        // Сохраняем метаданные
        await fileManager.saveMetadata(workId, workMetadata);
        
        console.log(`Работа сохранена: ${fileName}`);
        
        res.json({
            success: true,
            work: workMetadata
        });
        
    } catch (error) {
        console.error('Ошибка сохранения работы:', error);
        res.status(500).json({ error: 'Failed to save work' });
    }
});

// API: Получить список всех работ
app.get('/api/works', async (req, res) => {
    try {
        const works = await fileManager.getAllWorks();
        res.json({ works });
    } catch (error) {
        console.error('Ошибка получения списка работ:', error);
        res.status(500).json({ error: 'Failed to get works' });
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
        console.error('Ошибка получения работы:', error);
        res.status(500).json({ error: 'Failed to get work' });
    }
});

// API: Скачать работу (полное изображение)
app.get('/api/works/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const fileName = `${id}.jpg`;
        const filePath = fileManager.getFilePath(fileName, false);
        
        // Проверяем существование файла
        await fs.access(filePath);
        
        res.download(filePath, fileName);
    } catch (error) {
        console.error('Ошибка скачивания работы:', error);
        res.status(404).json({ error: 'Work not found' });
    }
});

// API: Получить миниатюру работы
app.get('/api/works/:id/thumbnail', async (req, res) => {
    try {
        const { id } = req.params;
        const fileName = `${id}.jpg`;
        const filePath = fileManager.getFilePath(fileName, true);
        
        // Проверяем существование файла
        await fs.access(filePath);
        
        res.sendFile(filePath);
    } catch (error) {
        console.error('Ошибка получения миниатюры:', error);
        res.status(404).json({ error: 'Thumbnail not found' });
    }
});

// API: Удалить работу
app.delete('/api/works/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const success = await fileManager.deleteWork(id);
        
        if (!success) {
            return res.status(404).json({ error: 'Work not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка удаления работы:', error);
        res.status(500).json({ error: 'Failed to delete work' });
    }
});

// Главный маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер Sojmieblo запущен на http://localhost:${PORT}`);
});
