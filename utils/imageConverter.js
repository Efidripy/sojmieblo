const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class ImageConverter {
    /**
     * Конвертировать изображение в JPEG с максимальным качеством
     * @param {Buffer} inputBuffer - Входной буфер изображения
     * @param {Object} options - Опции конвертации
     * @returns {Promise<Buffer>} - JPEG буфер
     */
    static async convertToJPEG(inputBuffer, options = {}) {
        const {
            quality = 95,
            stripMetadata = true,
            addWatermark = true
        } = options;

        try {
            let pipeline = sharp(inputBuffer);

            // Конвертация в sRGB
            pipeline = pipeline.toColorspace('srgb');

            // Удаление всех метаданных
            if (stripMetadata) {
                pipeline = pipeline.withMetadata({
                    exif: {},
                    icc: 'srgb',
                    // Добавляем кастомные метаданные
                    ...(addWatermark ? {
                        exif: {
                            IFD0: {
                                Copyright: 'Created by Sojmieblo - https://github.com/Efidripy/sojmieblo',
                                Software: 'Sojmieblo',
                                Artist: 'Sojmieblo User',
                                ImageDescription: 'Deformed face meme created with Sojmieblo'
                            }
                        }
                    } : {})
                });
            }

            // Конвертация в JPEG с высоким качеством
            const outputBuffer = await pipeline
                .jpeg({
                    quality,
                    chromaSubsampling: '4:4:4', // Максимальное качество
                    mozjpeg: true // Оптимизация размера без потери качества
                })
                .toBuffer();

            return outputBuffer;
        } catch (error) {
            console.error('Ошибка конвертации изображения:', error);
            throw new Error(`Failed to convert to JPEG: ${error.message}`);
        }
    }

    /**
     * Создать миниатюру изображения
     * @param {Buffer} inputBuffer - Входной буфер изображения
     * @param {Number} maxSize - Максимальный размер (ширина)
     * @returns {Promise<Buffer>} - JPEG буфер миниатюры
     */
    static async createThumbnail(inputBuffer, maxSize = 200) {
        try {
            const thumbnail = await sharp(inputBuffer)
                .resize(maxSize, maxSize, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toColorspace('srgb')
                .jpeg({
                    quality: 85,
                    mozjpeg: true
                })
                .toBuffer();

            return thumbnail;
        } catch (error) {
            console.error('Ошибка создания миниатюры:', error);
            throw new Error(`Failed to create thumbnail: ${error.message}`);
        }
    }

    /**
     * Обработать base64 строку изображения
     * @param {String} base64String - Base64 строка (data:image/...;base64,...)
     * @returns {Buffer} - Буфер изображения
     */
    static base64ToBuffer(base64String) {
        // Убираем возможные пробелы и переносы строк
        const cleanedString = base64String.trim();
        
        // Более гибкий regex для поддержки различных MIME типов
        const matches = cleanedString.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 string format. Expected format: data:image/...;base64,...');
        }
        return Buffer.from(matches[2], 'base64');
    }

    /**
     * Получить информацию об изображении
     * @param {Buffer} inputBuffer - Входной буфер изображения
     * @returns {Promise<Object>} - Метаданные изображения
     */
    static async getImageInfo(inputBuffer) {
        try {
            const metadata = await sharp(inputBuffer).metadata();
            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                space: metadata.space,
                channels: metadata.channels,
                depth: metadata.depth,
                hasAlpha: metadata.hasAlpha,
                orientation: metadata.orientation,
                size: inputBuffer.length
            };
        } catch (error) {
            console.error('Ошибка получения информации об изображении:', error);
            throw new Error(`Failed to get image info: ${error.message}`);
        }
    }

    /**
     * Изменяет размер изображения с сохранением пропорций
     * @param {Buffer} buffer - Исходный буфер
     * @param {number} maxWidth - Максимальная ширина
     * @param {number} maxHeight - Максимальная высота
     * @returns {Buffer} - Измененный буфер
     */
    static async resize(buffer, maxWidth, maxHeight) {
        try {
            return await sharp(buffer)
                .resize(maxWidth, maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();
        } catch (error) {
            throw new Error(`Failed to resize image: ${error.message}`);
        }
    }
}

module.exports = ImageConverter;
