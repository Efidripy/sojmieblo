const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class FileManager {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.worksDir = path.join(baseDir, 'works');
        this.thumbsDir = path.join(baseDir, 'works', 'thumbs');
    }

    /**
     * Инициализация директорий
     */
    async initialize() {
        try {
            await fs.mkdir(this.worksDir, { recursive: true });
            await fs.mkdir(this.thumbsDir, { recursive: true });
            console.log('Директории для работ созданы');
        } catch (error) {
            console.error('Ошибка создания директорий:', error);
            throw error;
        }
    }

    /**
     * Генерация имени файла
     * Формат: YYYYMMDD-HHMMSS-randomchars.ext
     * @param {String} extension - Расширение файла (например, 'jpg')
     * @returns {String} - Имя файла
     */
    generateFileName(extension = 'jpg') {
        const now = new Date();
        
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        // Генерируем 10 случайных символов
        const randomChars = uuidv4().replace(/-/g, '').substring(0, 10);
        
        return `${year}${month}${day}-${hours}${minutes}${seconds}-${randomChars}.${extension}`;
    }

    /**
     * Сохранить файл работы
     * @param {String} fileName - Имя файла
     * @param {Buffer} buffer - Данные файла
     * @param {Boolean} isThumbnail - Это миниатюра?
     * @returns {Promise<String>} - Путь к файлу
     */
    async saveFile(fileName, buffer, isThumbnail = false) {
        const targetDir = isThumbnail ? this.thumbsDir : this.worksDir;
        const filePath = path.join(targetDir, fileName);
        
        try {
            await fs.writeFile(filePath, buffer);
            return filePath;
        } catch (error) {
            console.error('Ошибка сохранения файла:', error);
            throw new Error('Failed to save file');
        }
    }

    /**
     * Сохраняет работу (изображение + метаданные)
     * @param {Buffer} imageBuffer - Буфер изображения
     * @param {Buffer} thumbnailBuffer - Буфер миниатюры
     * @param {Object} metadata - Дополнительные метаданные
     * @returns {Object} - Информация о сохранённой работе
     */
    async saveWork(imageBuffer, thumbnailBuffer, metadata = {}) {
        try {
            const fileName = this.generateFileName('jpg');
            const workId = path.parse(fileName).name;
            
            // Пути к файлам
            const imagePath = path.join(this.worksDir, fileName);
            const thumbnailPath = path.join(this.thumbsDir, fileName);
            const metaPath = path.join(this.worksDir, `${workId}.json`);

            // Сохраняем файлы параллельно
            await Promise.all([
                fs.writeFile(imagePath, imageBuffer),
                fs.writeFile(thumbnailPath, thumbnailBuffer),
                fs.writeFile(metaPath, JSON.stringify({
                    id: workId,
                    fileName,
                    createdAt: new Date().toISOString(),
                    size: imageBuffer.length,
                    thumbnailSize: thumbnailBuffer.length,
                    ...metadata
                }, null, 2))
            ]);

            console.log(`✅ Work saved: ${workId}`);

            return {
                id: workId,
                fileName,
                imagePath: `/api/works/${workId}/image`,
                thumbnailPath: `/api/works/${workId}/thumbnail`
            };
        } catch (error) {
            throw new Error(`Failed to save work: ${error.message}`);
        }
    }

    /**
     * Сохранить метаданные работы
     * @param {String} workId - ID работы (имя файла без расширения)
     * @param {Object} metadata - Метаданные
     * @returns {Promise<String>} - Путь к файлу метаданных
     */
    async saveMetadata(workId, metadata) {
        const metadataPath = path.join(this.worksDir, `${workId}.json`);
        
        try {
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            return metadataPath;
        } catch (error) {
            console.error('Ошибка сохранения метаданных:', error);
            throw new Error('Failed to save metadata');
        }
    }

    /**
     * Получить список всех работ
     * @returns {Promise<Array>} - Массив работ
     */
    async getWorks() {
        try {
            await this.initialize(); // Убедимся что папка существует
            
            const files = await fs.readdir(this.worksDir);
            
            // Фильтруем только JSON файлы
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            const works = await Promise.all(
                jsonFiles.map(async (file) => {
                    try {
                        const metadataPath = path.join(this.worksDir, file);
                        const content = await fs.readFile(metadataPath, 'utf-8');
                        const metadata = JSON.parse(content);
                        return metadata;
                    } catch (error) {
                        console.error(`Ошибка чтения метаданных ${file}:`, error);
                        return null;
                    }
                })
            );
            
            // Фильтруем null значения и сортируем по дате (новые сверху)
            return works
                .filter(w => w !== null)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            console.error('Ошибка получения списка работ:', error);
            return [];
        }
    }

    /**
     * Получить список всех работ (alias for getWorks)
     * @returns {Promise<Array>} - Массив работ
     */
    async getAllWorks() {
        return this.getWorks();
    }

    /**
     * Получает конкретную работу по ID
     * @param {string} id - ID работы
     * @returns {Object} - Метаданные работы
     */
    async getWork(workId) {
        const metadataPath = path.join(this.worksDir, `${workId}.json`);
        
        try {
            const content = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Ошибка чтения метаданных работы ${workId}:`, error);
            throw new Error(`Work not found: ${workId}`);
        }
    }

    /**
     * Получить метаданные работы (alias for getWork)
     * @param {String} workId - ID работы
     * @returns {Promise<Object|null>} - Метаданные или null
     */
    async getWorkMetadata(workId) {
        try {
            return await this.getWork(workId);
        } catch (error) {
            return null;
        }
    }

    /**
     * Получить путь к файлу работы
     * @param {String} fileName - Имя файла
     * @param {Boolean} isThumbnail - Это миниатюра?
     * @returns {String} - Полный путь к файлу
     */
    getFilePath(fileName, isThumbnail = false) {
        const targetDir = isThumbnail ? this.thumbsDir : this.worksDir;
        return path.join(targetDir, fileName);
    }

    /**
     * Получает путь к файлу изображения
     * @param {string} id - ID работы
     * @returns {string} - Абсолютный путь к файлу
     */
    async getImagePath(id) {
        const work = await this.getWork(id);
        return path.join(this.worksDir, work.fileName);
    }

    /**
     * Получает путь к файлу миниатюры
     * @param {string} id - ID работы
     * @returns {string} - Абсолютный путь к миниатюре
     */
    async getThumbnailPath(id) {
        const work = await this.getWork(id);
        return path.join(this.thumbsDir, work.fileName);
    }

    /**
     * Удалить работу
     * @param {String} workId - ID работы
     * @returns {Promise<Boolean>} - Успешность удаления
     */
    async deleteWork(workId) {
        try {
            const work = await this.getWork(workId);
            
            // Удаляем основной файл
            const imagePath = path.join(this.worksDir, work.fileName);
            await fs.unlink(imagePath).catch(() => {});
            
            // Удаляем миниатюру
            const thumbPath = path.join(this.thumbsDir, work.fileName);
            await fs.unlink(thumbPath).catch(() => {});
            
            // Удаляем метаданные
            const metadataPath = path.join(this.worksDir, `${workId}.json`);
            await fs.unlink(metadataPath).catch(() => {});
            
            console.log(`✅ Work deleted: ${workId}`);
            return true;
        } catch (error) {
            console.error(`Ошибка удаления работы ${workId}:`, error);
            throw new Error(`Failed to delete work: ${error.message}`);
        }
    }

    /**
     * Автоочистка файлов старше заданного возраста
     * @param {Number} maxAgeMs - Максимальный возраст в миллисекундах (по умолчанию 24 часа)
     * @returns {Promise<Number>} - Количество удаленных файлов
     */
    async cleanupOldFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
        let deletedCount = 0;
        
        try {
            const works = await this.getWorks();
            const now = Date.now();
            
            for (const work of works) {
                const createdAt = new Date(work.createdAt).getTime();
                const age = now - createdAt;
                
                if (age > maxAgeMs) {
                    try {
                        await this.deleteWork(work.id);
                        deletedCount++;
                        console.log(`🗑️ Auto-deleted old work: ${work.id} (age: ${Math.floor(age / (24 * 60 * 60 * 1000))} days)`);
                    } catch (error) {
                        console.error(`Failed to delete work ${work.id}:`, error);
                    }
                }
            }
            
            if (deletedCount > 0) {
                console.log(`Автоочистка: удалено ${deletedCount} файлов`);
            }
            
            return deletedCount;
        } catch (error) {
            console.error('Ошибка автоочистки:', error);
            return 0;
        }
    }

    /**
     * Запускает автоматическую очистку старых работ
     * @param {number} hours - Интервал проверки в часах
     * @param {number} maxAgeDays - Максимальный возраст работ в днях
     */
    startAutoCleanup(hours = 24, maxAgeDays = 7) {
        const intervalMs = hours * 60 * 60 * 1000;
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

        console.log(`🗑️ Auto-cleanup started: check every ${hours}h, delete works older than ${maxAgeDays} days`);
        
        // Первая очистка через 10 секунд после старта
        this.cleanupTimeout = setTimeout(async () => {
            await this.cleanupOldFiles(maxAgeMs);
        }, 10000);
        
        // Периодическая очистка
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupOldFiles(maxAgeMs);
        }, intervalMs);
    }

    /**
     * Остановить автоочистку
     */
    stopAutoCleanup() {
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        console.log('Автоочистка файлов остановлена');
    }

    /**
     * Получает статистику хранилища
     * @returns {Object} - Статистика
     */
    async getStats() {
        try {
            const works = await this.getWorks();
            const totalSize = works.reduce((sum, w) => sum + (w.size || 0), 0);

            return {
                totalWorks: works.length,
                totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                oldestWork: works.length > 0 ? works[works.length - 1].createdAt : null,
                newestWork: works.length > 0 ? works[0].createdAt : null
            };
        } catch (error) {
            return {
                totalWorks: 0,
                totalSize: 0,
                totalSizeMB: '0.00',
                error: error.message
            };
        }
    }
}

module.exports = FileManager;
