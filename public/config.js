// Конфигурация приложения Sojmieblo
const CONFIG = {
    // Параметры деформации
    deformation: {
        // Ширина кисти по умолчанию (в пикселях)
        defaultBrushRadius: 100,
        
        // Минимальная ширина кисти (в пикселях)
        minBrushRadius: 20,
        
        // Максимальная ширина кисти (в пикселях)
        maxBrushRadius: 300,
        
        // Шаг изменения ширины кисти при прокрутке колесика
        brushRadiusStep: 10,
        
        // Начальная сила деформации (отрицательная для сжатия)
        initialStrength: -0.5,
        
        // Минимальная сила деформации
        minStrength: -1.5,
        
        // Максимальная сила деформации
        maxStrength: 0,
        
        // Скорость нарастания силы при удержании (единиц силы в секунду)
        strengthIncreaseRate: 0.5,
        
        // Интервал обновления деформации при удержании (мс)
        updateInterval: 50
    },
    
    // Параметры превью изображений
    preview: {
        sizes: [
            { name: '4K', width: 1920, minWindowWidth: 1920 },
            { name: '2K', width: 1440, minWindowWidth: 1440 },
            { name: 'FHD', width: 1280, minWindowWidth: 1280 },
            { name: 'HD', width: 720, minWindowWidth: 0 }
        ]
    },
    
    // Параметры загрузки файлов
    upload: {
        // Максимальный размер файла в байтах (30MB)
        maxFileSize: 30 * 1024 * 1024,
        
        // Допустимые типы файлов
        acceptedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
        
        // Включить загрузку перетаскиванием
        enableDragAndDrop: true,
        
        // Включить загрузку из буфера обмена
        enableClipboard: true
    }
};

// Экспортируем конфигурацию (для использования в других файлах)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
