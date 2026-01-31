// Основная логика приложения Sojmieblo
let canvas, gl, texture;
let originalImage;  // Оригинальное изображение
let previewImage;   // Превью для отображения
let imageScale = 1; // Масштаб между превью и оригиналом
let isImageLoaded = false;

// Параметры деформации из конфигурации
let brushRadius = CONFIG.deformation.defaultBrushRadius;
let deformationStrength = CONFIG.deformation.initialStrength;
let mouseDownTime = 0;
let mouseDownTimer = null;

// Canvas для визуализации кисти
let brushOverlay = null;
let brushCtx = null;

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
async function handleFile(file) {
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
    reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
            try {
                // Сохраняем оригинал
                originalImage = img;
                
                // Создаем превью оптимального размера
                const optimalSize = ImageProcessor.getOptimalPreviewSize();
                const imageData = await ImageProcessor.createPreview(img, optimalSize);
                
                previewImage = imageData.preview;
                imageScale = imageData.scale;
                
                console.log(`Оригинал: ${img.width}x${img.height}, Превью: ${previewImage.width}x${previewImage.height}, Scale: ${imageScale}`);
                
                // Инициализируем с превью
                initializeCanvas(previewImage);
                uploadSection.style.display = 'none';
                canvasContainer.style.display = 'block';
                isImageLoaded = true;
                
                // Сброс параметров
                brushRadius = CONFIG.deformation.defaultBrushRadius;
                deformationStrength = CONFIG.deformation.initialStrength;
                updateRadiusDisplay();
                updateStrengthDisplay();
            } catch (error) {
                console.error('Ошибка создания превью:', error);
                alert('Ошибка обработки изображения.');
            }
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
        
        // Размер canvas по размеру изображения (превью)
        canvas.width = img.width;
        canvas.height = img.height;
        
        canvas.draw(texture).update();
        
        // Создаем overlay canvas для визуализации кисти
        createBrushOverlay();
        
        setupMouseInteraction();
        
    } catch (e) {
        console.error('Ошибка инициализации канваса:', e);
        alert('Ошибка инициализации WebGL. Убедитесь, что ваш браузер поддерживает WebGL.');
    }
}

// Создание overlay canvas для отображения кисти
function createBrushOverlay() {
    // Удаляем старый overlay если есть
    if (brushOverlay) {
        brushOverlay.remove();
    }
    
    brushOverlay = document.createElement('canvas');
    brushOverlay.id = 'brushOverlay';
    brushOverlay.width = canvas.width;
    brushOverlay.height = canvas.height;
    brushOverlay.style.position = 'absolute';
    brushOverlay.style.top = '0';
    brushOverlay.style.left = '0';
    brushOverlay.style.pointerEvents = 'none'; // Не блокирует события мыши
    brushOverlay.style.zIndex = '10';
    
    brushCtx = brushOverlay.getContext('2d');
    
    // Вставляем overlay поверх canvas
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(brushOverlay);
}

// Отрисовка круга кисти с мягкими краями
function drawBrush(x, y, radius) {
    if (!brushCtx) return;
    
    // Очищаем canvas
    brushCtx.clearRect(0, 0, brushOverlay.width, brushOverlay.height);
    
    // Создаем радиальный градиент для мягких краев
    const gradient = brushCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');     // Центр - 30% прозрачности
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');  // 70% радиуса - 15%
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');       // Края - полностью прозрачно
    
    // Рисуем круг
    brushCtx.fillStyle = gradient;
    brushCtx.beginPath();
    brushCtx.arc(x, y, radius, 0, Math.PI * 2);
    brushCtx.fill();
    
    // Добавляем обводку для четкости
    brushCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    brushCtx.lineWidth = 2;
    brushCtx.beginPath();
    brushCtx.arc(x, y, radius, 0, Math.PI * 2);
    brushCtx.stroke();
}

// Скрыть кисть
function hideBrush() {
    if (!brushCtx) return;
    brushCtx.clearRect(0, 0, brushOverlay.width, brushOverlay.height);
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
        
        // Отображаем кисть
        drawBrush(mouseX, mouseY, brushRadius);
        
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
        hideBrush(); // Скрываем кисть при выходе мыши
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
        
        // Обновляем визуализацию кисти
        drawBrush(mouseX, mouseY, brushRadius);
        
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
