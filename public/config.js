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
    
    // Параметры canvas
    canvas: {
        // Максимальные размеры для разных разрешений экрана
        resolutions: {
            '4K': {
                minWidth: 3840,
                maxWidth: 2400,
                maxHeight: 1600
            },
            '2K': {
                minWidth: 2560,
                maxWidth: 1600,
                maxHeight: 1200
            },
            'FullHD': {
                minWidth: 1920,
                maxWidth: 1200,
                maxHeight: 900
            },
            'default': {
                minWidth: 0,
                maxWidth: 800,
                maxHeight: 600
            }
        }
    },
    
    // Параметры загрузки файлов
    upload: {
        // Максимальный размер файла в байтах (10MB)
        maxFileSize: 10 * 1024 * 1024,
        
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
