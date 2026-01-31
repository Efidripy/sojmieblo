// Основная логика приложения Sojmieblo
let canvas, gl, texture;
let originalImage;
let isImageLoaded = false;

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
        
        // Установка размера канваса с сохранением пропорций изображения
        const maxWidth = 800;
        const maxHeight = 600;
        let width = img.width;
        let height = img.height;
        
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
        
        // Применение эффекта выпуклости/сжатия в реальном времени
        applyDeformation(mouseX, mouseY, false);
    });
    
    canvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        applyDeformation(mouseX, mouseY, true);
    });
    
    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
        isMouseDown = false;
        resetImage();
    });
}

// Применение эффекта выпуклости/сжатия
function applyDeformation(x, y, isClick) {
    if (!texture || !canvas) return;
    
    // Радиус эффекта (пропорционален размеру канваса)
    const radius = Math.min(canvas.width, canvas.height) * 0.2;
    
    // Сила эффекта (отрицательная для сжатия, положительная для выпуклости)
    const strength = isClick ? -0.8 : -0.5; // Эффект сжатия (отрицательное значение)
    
    try {
        // Отрисовка текстуры с эффектом выпуклости
        canvas.draw(texture)
            .bulgePinch(x, y, radius, strength)
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

// Проверка поддержки WebGL
window.addEventListener('load', () => {
    if (!window.fx) {
        console.warn('glfx.js не загружен, WebGL эффекты могут не работать');
    }
});
