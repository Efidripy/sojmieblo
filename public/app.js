// Основная логика приложения Sojmieblo
let canvas, gl, texture;
let originalImage;
let isImageLoaded = false;

// Параметры деформации
let brushRadius = 100; // Ширина кисти в пикселях
let deformationStrength = -0.5; // Сила деформации
let mouseDownTime = 0; // Время нажатия мыши
let mouseDownTimer = null; // Таймер для отслеживания длительности нажатия

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

// Обработка выбора файла
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Обработка загрузки файла
function handleFile(file) {
    if (!file.type.match('image.*')) {
        alert('Пожалуйста, выберите файл изображения!');
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
        };
        img.src = e.target.result;
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
        
        // Адаптивный размер канваса в зависимости от разрешения экрана
        const containerWidth = canvasContainer.offsetWidth - 60; // Вычитаем padding
        
        // Определяем максимальные размеры в зависимости от ширины экрана
        let maxWidth, maxHeight;
        
        if (window.innerWidth >= 3840) {
            // 4K экраны
            maxWidth = Math.min(2400, containerWidth);
            maxHeight = 1600;
        } else if (window.innerWidth >= 2560) {
            // 2K экраны
            maxWidth = Math.min(1600, containerWidth);
            maxHeight = 1200;
        } else if (window.innerWidth >= 1920) {
            // Full HD
            maxWidth = Math.min(1200, containerWidth);
            maxHeight = 900;
        } else {
            // Меньше Full HD
            maxWidth = Math.min(800, containerWidth);
            maxHeight = 600;
        }
        
        let width = img.width;
        let height = img.height;
        
        // Масштабирование с сохранением пропорций
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Отрисовка исходного изображения
        canvas.draw(texture).update();
        
        // Добавление взаимодействия с мышью
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
        
        // Начинаем отсчет времени нажатия
        mouseDownTime = Date.now();
        
        // Постепенное увеличение силы при удержании
        mouseDownTimer = setInterval(() => {
            const holdDuration = (Date.now() - mouseDownTime) / 1000; // в секундах
            // Увеличиваем силу от -0.5 до -1.5 за 2 секунды
            deformationStrength = Math.max(-1.5, -0.5 - (holdDuration * 0.5));
            applyDeformation(mouseX, mouseY);
            updateStrengthDisplay();
        }, 50); // Обновляем каждые 50мс
        
        applyDeformation(mouseX, mouseY);
    });
    
    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
        clearInterval(mouseDownTimer);
        deformationStrength = -0.5; // Сброс силы
        updateStrengthDisplay();
        resetImage();
    });
    
    canvas.addEventListener('mouseleave', () => {
        isMouseDown = false;
        clearInterval(mouseDownTimer);
        deformationStrength = -0.5;
        updateStrengthDisplay();
        resetImage();
    });
    
    // Изменение ширины кисти колесиком мыши
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Изменяем радиус (от 20 до 300 пикселей)
        if (e.deltaY < 0) {
            brushRadius = Math.min(300, brushRadius + 10);
        } else {
            brushRadius = Math.max(20, brushRadius - 10);
        }
        
        updateRadiusDisplay();
        
        // Применяем деформацию с новым радиусом если мышь нажата
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
