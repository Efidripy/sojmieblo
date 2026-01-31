// Основная логика приложения Sojmieblo
let canvas, gl, texture;
let originalImage;
let isImageLoaded = false;

// Параметры деформации из конфигурации
let brushRadius = CONFIG.deformation.defaultBrushRadius;
let deformationStrength = CONFIG.deformation.initialStrength;
let mouseDownTime = 0;
let mouseDownTimer = null;

// DOM элементы
const uploadSection = document.getElementById('uploadSection');
const canvasContainer = document.getElementById('canvasContainer');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');
const changeBtn = document.getElementById('changeBtn');
const glCanvas = document.getElementById('glCanvas');

// Инициализация обработчиков событий
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
resetBtn.addEventListener('click', resetImage);
changeBtn.addEventListener('click', () => {
    canvasContainer.style.display = 'none';
    uploadSection.style.display = 'block';
    isImageLoaded = false;
});

// Функциональность перетаскивания файлов
uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
});

uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
});

uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

// Вставка из буфера обмена
if (CONFIG.upload.enableClipboard) {
    // Обработчик для всего документа
    document.addEventListener('paste', (e) => {
        // Проверяем что секция загрузки видима (иначе можем испортить работающее изображение)
        if (uploadSection.style.display !== 'none') {
            handlePaste(e);
        }
    });
    
    // Также добавляем обработчик на canvasContainer для повторной вставки
    canvasContainer.addEventListener('paste', (e) => {
        if (confirm('Загрузить новое изображение? Текущие изменения будут потеряны.')) {
            handlePaste(e);
        }
    });
}

// Функция обработки вставки из буфера обмена
function handlePaste(e) {
    e.preventDefault();
    
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Проверяем что это изображение
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
                handleFile(blob);
                return;
            }
        }
    }
    
    // Если изображение не найдено
    alert('В буфере обмена нет изображения. Скопируйте изображение (Ctrl+C) и попробуйте снова.');
}

// Обработка выбора файла
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Обработка загрузки файла
function handleFile(file) {
    // Проверка типа файла
    if (!CONFIG.upload.acceptedTypes.includes(file.type)) {
        alert(`Неподдерживаемый тип файла. Поддерживаются: ${CONFIG.upload.acceptedTypes.join(', ')}`);
        return;
    }
    
    // Проверка размера файла
    if (file.size > CONFIG.upload.maxFileSize) {
        const maxSizeMB = CONFIG.upload.maxFileSize / (1024 * 1024);
        alert(`Файл слишком большой. Максимальный размер: ${maxSizeMB}MB`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            initializeCanvas(img);
            uploadSection.style.display = 'none';
            canvasContainer.style.display = 'block';
            isImageLoaded = true;
            
            // Сброс параметров при загрузке нового изображения
            brushRadius = CONFIG.deformation.defaultBrushRadius;
            deformationStrength = CONFIG.deformation.initialStrength;
            updateRadiusDisplay();
            updateStrengthDisplay();
        };
        img.onerror = () => {
            alert('Ошибка загрузки изображения. Попробуйте другой файл.');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        alert('Ошибка чтения файла.');
    };
    reader.readAsDataURL(file);
}

// Инициализация WebGL канваса с помощью glfx.js
function initializeCanvas(img) {
    try {
        // Создание glfx канваса
        canvas = fx.canvas();
        
        // Замена обычного канваса на glfx канвас
        const oldCanvas = document.getElementById('glCanvas');
        canvas.id = 'glCanvas';
        canvas.className = oldCanvas.className;
        oldCanvas.parentNode.replaceChild(canvas, oldCanvas);
        
        // Загрузка текстуры
        texture = canvas.texture(img);
        
        // Адаптивный размер канваса из конфигурации
        const containerWidth = canvasContainer.offsetWidth - 60;
        
        let maxWidth, maxHeight;
        const screenWidth = window.innerWidth;
        const resolutions = CONFIG.canvas.resolutions;
        
        // Определяем разрешение по конфигурации
        if (screenWidth >= resolutions['4K'].minWidth) {
            maxWidth = Math.min(resolutions['4K'].maxWidth, containerWidth);
            maxHeight = resolutions['4K'].maxHeight;
        } else if (screenWidth >= resolutions['2K'].minWidth) {
            maxWidth = Math.min(resolutions['2K'].maxWidth, containerWidth);
            maxHeight = resolutions['2K'].maxHeight;
        } else if (screenWidth >= resolutions['FullHD'].minWidth) {
            maxWidth = Math.min(resolutions['FullHD'].maxWidth, containerWidth);
            maxHeight = resolutions['FullHD'].maxHeight;
        } else {
            maxWidth = Math.min(resolutions['default'].maxWidth, containerWidth);
            maxHeight = resolutions['default'].maxHeight;
        }
        
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        canvas.draw(texture).update();
        setupMouseInteraction();
        
    } catch (e) {
        console.error('Ошибка инициализации канваса:', e);
        alert('Ошибка инициализации WebGL. Убедитесь, что ваш браузер поддерживает WebGL.');
    }
}

// Настройка взаимодействия с мышью для деформации в реальном времени
function setupMouseInteraction() {
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        // Применение эффекта только при нажатии
        if (isMouseDown) {
            applyDeformation(mouseX, mouseY);
        } else {
            // Сброс изображения когда не нажато
            resetImage();
        }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        mouseDownTime = Date.now();
        
        mouseDownTimer = setInterval(() => {
            const holdDuration = (Date.now() - mouseDownTime) / 1000;
            const strengthIncrease = holdDuration * CONFIG.deformation.strengthIncreaseRate;
            
            deformationStrength = Math.max(
                CONFIG.deformation.minStrength,
                CONFIG.deformation.initialStrength - strengthIncrease
            );
            
            applyDeformation(mouseX, mouseY);
            updateStrengthDisplay();
        }, CONFIG.deformation.updateInterval);
        
        applyDeformation(mouseX, mouseY);
    });
    
    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
        clearInterval(mouseDownTimer);
        deformationStrength = CONFIG.deformation.initialStrength;
        updateStrengthDisplay();
        resetImage();
    });
    
    canvas.addEventListener('mouseleave', () => {
        isMouseDown = false;
        clearInterval(mouseDownTimer);
        deformationStrength = CONFIG.deformation.initialStrength;
        updateStrengthDisplay();
        resetImage();
    });
    
    // Изменение ширины кисти колесиком мыши
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const step = CONFIG.deformation.brushRadiusStep;
        const min = CONFIG.deformation.minBrushRadius;
        const max = CONFIG.deformation.maxBrushRadius;
        
        if (e.deltaY < 0) {
            brushRadius = Math.min(max, brushRadius + step);
        } else {
            brushRadius = Math.max(min, brushRadius - step);
        }
        
        updateRadiusDisplay();
        
        if (isMouseDown) {
            applyDeformation(mouseX, mouseY);
        }
    });
}

// Применение эффекта выпуклости/сжатия
function applyDeformation(x, y) {
    if (!texture || !canvas) return;
    
    try {
        // Используем brushRadius напрямую
        // Центр деформации всегда под курсором (x, y)
        canvas.draw(texture)
            .bulgePinch(x, y, brushRadius, deformationStrength)
            .update();
    } catch (e) {
        console.error('Ошибка применения деформации:', e);
    }
}

// Сброс изображения в исходное состояние
function resetImage() {
    if (!texture || !canvas) return;
    
    try {
        canvas.draw(texture).update();
    } catch (e) {
        console.error('Ошибка сброса изображения:', e);
    }
}

// Обновление отображения силы нажатия
function updateStrengthDisplay() {
    const strengthDisplay = document.getElementById('strengthValue');
    if (strengthDisplay) {
        strengthDisplay.textContent = Math.abs(deformationStrength).toFixed(2);
    }
}

// Обновление отображения ширины кисти
function updateRadiusDisplay() {
    const radiusDisplay = document.getElementById('radiusValue');
    if (radiusDisplay) {
        radiusDisplay.textContent = brushRadius;
    }
}

// Проверка поддержки WebGL
window.addEventListener('load', () => {
    if (!window.fx) {
        console.warn('glfx.js не загружен, WebGL эффекты могут не работать');
    }
});
