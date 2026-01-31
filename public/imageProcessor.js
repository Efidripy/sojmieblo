// Обработка и оптимизация изображений для разных разрешений

const ImageProcessor = {
    // Доступные размеры превью
    previewSizes: [
        { name: '4K', width: 1920, minWindowWidth: 1920 },
        { name: '2K', width: 1440, minWindowWidth: 1440 },
        { name: 'FHD', width: 1280, minWindowWidth: 1280 },
        { name: 'HD', width: 720, minWindowWidth: 0 }
    ],
    
    // Определить оптимальный размер превью на основе размера окна браузера
    getOptimalPreviewSize() {
        // Maximum size limit for optimal performance
        const MAX_SIZE = 1280;
        
        const windowWidth = window.innerWidth;
        
        for (let size of this.previewSizes) {
            if (windowWidth >= size.minWindowWidth) {
                // Don't exceed MAX_SIZE even for large screens
                return Math.min(size.width, MAX_SIZE);
            }
        }
        
        return 720; // Минимальный размер по умолчанию
    },
    
    // Создать превью изображения
    async createPreview(originalImage, maxWidth) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let width = originalImage.width;
                let height = originalImage.height;
                
                // Масштабируем только если изображение больше maxWidth
                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    width = maxWidth;
                    height = height * ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Используем высококачественное масштабирование
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(originalImage, 0, 0, width, height);
                
                // Создаем новый Image из canvas
                const previewImage = new Image();
                previewImage.onload = () => {
                    resolve({
                        preview: previewImage,
                        original: originalImage,
                        scale: width / originalImage.width
                    });
                };
                previewImage.onerror = reject;
                previewImage.src = canvas.toDataURL('image/png');
                
            } catch (error) {
                reject(error);
            }
        });
    },
    
    // Пересчитать координаты с превью на оригинал
    previewToOriginalCoords(x, y, scale) {
        return {
            x: x / scale,
            y: y / scale
        };
    },
    
    // Пересчитать радиус с превью на оригинал
    previewToOriginalRadius(radius, scale) {
        return radius / scale;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageProcessor;
}
