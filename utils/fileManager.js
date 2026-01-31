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
    async getAllWorks() {
        try {
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
     * Получить метаданные работы
     * @param {String} workId - ID работы
     * @returns {Promise<Object|null>} - Метаданные или null
     */
    async getWorkMetadata(workId) {
        const metadataPath = path.join(this.worksDir, `${workId}.json`);
        
        try {
            const content = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Ошибка чтения метаданных работы ${workId}:`, error);
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
     * Удалить работу
     * @param {String} workId - ID работы
     * @returns {Promise<Boolean>} - Успешность удаления
     */
    async deleteWork(workId) {
        try {
            // Удаляем основной файл
            const imagePath = path.join(this.worksDir, `${workId}.jpg`);
            await fs.unlink(imagePath).catch(() => {});
            
            // Удаляем миниатюру
            const thumbPath = path.join(this.thumbsDir, `${workId}.jpg`);
            await fs.unlink(thumbPath).catch(() => {});
            
            // Удаляем метаданные
            const metadataPath = path.join(this.worksDir, `${workId}.json`);
            await fs.unlink(metadataPath).catch(() => {});
            
            console.log(`Работа ${workId} удалена`);
            return true;
        } catch (error) {
            console.error(`Ошибка удаления работы ${workId}:`, error);
            return false;
        }
    }

    /**
     * Автоочистка файлов старше 24 часов
     * @returns {Promise<Number>} - Количество удаленных файлов
     */
    async cleanupOldFiles() {
        const maxAge = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
        let deletedCount = 0;
        
        try {
            const works = await this.getAllWorks();
            const now = Date.now();
            
            for (const work of works) {
                const createdAt = new Date(work.createdAt).getTime();
                const age = now - createdAt;
                
                if (age > maxAge) {
                    await this.deleteWork(work.id);
                    deletedCount++;
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
     * Запустить периодическую автоочистку
     * @param {Number} intervalHours - Интервал в часах (по умолчанию 1)
     */
    startAutoCleanup(intervalHours = 1) {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        
        // Первая очистка через 10 секунд после старта
        this.cleanupTimeout = setTimeout(() => {
            this.cleanupOldFiles();
        }, 10000);
        
        // Периодическая очистка
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldFiles();
        }, intervalMs);
        
        console.log(`Автоочистка файлов запущена (каждые ${intervalHours} ч)`);
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
}

module.exports = FileManager;
