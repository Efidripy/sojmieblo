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
let hasDeformation = false; // Флаг для отслеживания изменений

// Canvas для визуализации кисти
let brushOverlay = null;
let brushCtx = null;

// Глобальные координаты мыши для resize handler
let currentMouseX = undefined;
let currentMouseY = undefined;

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
    showHeaderOnReset();
});

// ИСПРАВЛЕНИЕ: Добавляем stopPropagation для кнопок чтобы предотвратить клик по canvas
[resetBtn, changeBtn].forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
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
                
                // Скрыть заголовок и subtitle
                hideHeaderOnImageLoad();
                
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
        // Проверка наличия glfx.js
        if (!window.fx) {
            throw new Error('glfx.js не загружен. Убедитесь, что библиотека подключена.');
        }
        
        // Создание glfx канваса
        canvas = window.fx.canvas();
        
        // Замена обычного канваса на glfx канвас
        const oldCanvas = document.getElementById('glCanvas');
        canvas.id = 'glCanvas';
        canvas.className = oldCanvas.className;
        oldCanvas.parentNode.replaceChild(canvas, oldCanvas);
        
        // Загрузка текстуры
        texture = canvas.texture(img);
        
        // CRITICAL FIX: Scale large images to fit viewport
        // Calculate viewport fitting scale
        const maxWidth = window.innerWidth * 0.9;  // 90% of viewport width
        const maxHeight = window.innerHeight * 0.8; // 80% of viewport height
        
        const scaleX = maxWidth / img.width;
        const scaleY = maxHeight / img.height;
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale small images
        
        // Set canvas size (scaled to fit viewport)
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        
        // Also set CSS size to match canvas size for proper display
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        
        console.log(`Canvas initialized: ${canvas.width}x${canvas.height} (scale: ${scale.toFixed(2)})`);
        
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
    
    // ИСПРАВЛЕНИЕ: Установить CSS размеры для точного совпадения с отображаемым canvas
    const rect = canvas.getBoundingClientRect();
    brushOverlay.style.width = rect.width + 'px';
    brushOverlay.style.height = rect.height + 'px';
    
    brushCtx = brushOverlay.getContext('2d');
    
    // Вставляем overlay поверх canvas
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(brushOverlay);
}

// ИСПРАВЛЕНИЕ: Обработчик resize для синхронизации brushOverlay
window.addEventListener('resize', () => {
    if (canvas && brushOverlay) {
        const rect = canvas.getBoundingClientRect();
        
        // Обновить размер overlay чтобы соответствовал canvas
        brushOverlay.width = canvas.width;
        brushOverlay.height = canvas.height;
        
        // ИСПРАВЛЕНИЕ: Обновить CSS размеры для точного соответствия отображаемому canvas
        brushOverlay.style.width = rect.width + 'px';
        brushOverlay.style.height = rect.height + 'px';
        
        // ИСПРАВЛЕНИЕ: Перерисовать кисть если есть сохраненные координаты
        if (currentMouseX !== undefined && currentMouseY !== undefined) {
            drawBrush(currentMouseX, currentMouseY, brushRadius);
        }
    }
});

// Отрисовка круга кисти с мягкими краями
function drawBrush(x, y, radius) {
    if (!brushCtx) return;
    
    // Очищаем canvas
    brushCtx.clearRect(0, 0, brushOverlay.width, brushOverlay.height);
    
    // Основной круг (размытый)
    const gradient = brushCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.08)');     // Центр немного темнее
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.03)');   // Середина
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // Край прозрачный
    
    brushCtx.fillStyle = gradient;
    brushCtx.beginPath();
    brushCtx.arc(x, y, radius, 0, Math.PI * 2);
    brushCtx.fill();
    
    // ИСПРАВЛЕНИЕ: Усиленный яркий центр (+15% визуальной яркости)
    const centerRadius = radius * 0.25; // 25% от основного радиуса
    const centerGradient = brushCtx.createRadialGradient(x, y, 0, x, y, centerRadius);
    centerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.20)'); // Белый яркий центр для +15% opacity
    centerGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.10)');
    centerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    brushCtx.fillStyle = centerGradient;
    brushCtx.beginPath();
    brushCtx.arc(x, y, centerRadius, 0, Math.PI * 2);
    brushCtx.fill();
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
        // Apply scaling to account for canvas display size vs actual size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mouseX = (e.clientX - rect.left) * scaleX;
        mouseY = (e.clientY - rect.top) * scaleY;
        
        // Store globally for resize handler
        currentMouseX = mouseX;
        currentMouseY = mouseY;
        
        // Отображаем кисть
        drawBrush(mouseX, mouseY, brushRadius);
        
        // Применение эффекта только при нажатии
        if (isMouseDown) {
            hasDeformation = true; // Отмечаем что произошла деформация
            applyDeformation(mouseX, mouseY);
        }
        // No else block - let deformation persist
    });
    
    canvas.addEventListener('mousedown', (e) => {
        // ИСПРАВЛЕНИЕ: Только левая кнопка мыши (e.button === 0) И клик внутри видимой области canvas
        if (e.button !== 0) {
            console.log('Mousedown ignored: not left button (button=' + e.button + ')');
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // ИСПРАВЛЕНИЕ: Проверка что клик внутри границ canvas (предотвращает сброс при кликах по UI)
        if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) {
            console.log('Mousedown ignored: click outside canvas bounds');
            return;
        }
        
        isMouseDown = true;
        
        // Reset to original on new click if there's existing deformation
        if (hasDeformation) {
            texture = canvas.texture(previewImage || originalImage);
            canvas.draw(texture).update();
            hasDeformation = false;
        }
        
        // Apply scaling to account for canvas display size vs actual size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mouseX = clickX * scaleX;
        mouseY = clickY * scaleY;
        
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
        // Dialog removed - save only via button
    });
    
    canvas.addEventListener('mouseleave', () => {
        isMouseDown = false;
        clearInterval(mouseDownTimer);
        deformationStrength = CONFIG.deformation.initialStrength;
        updateStrengthDisplay();
        hideBrush(); // Скрываем кисть при выходе мыши
        
        // Clear global mouse coordinates
        currentMouseX = undefined;
        currentMouseY = undefined;
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
        // ИСПРАВЛЕНИЕ: НЕ вызывать texture.loadContentsOf(canvas) - это вызывало накопление эффектов
        // Применяем bulgePinch с отрицательной силой для эффекта вдавливания
        const pinchStrength = -Math.abs(deformationStrength);
        
        canvas.draw(texture)
            .bulgePinch(x, y, brushRadius, pinchStrength)
            .update();
            
        hasDeformation = true;
    } catch (e) {
        console.error('Ошибка применения деформации:', e);
    }
}

// Сброс изображения в исходное состояние
function resetImage() {
    if (!texture || !isImageLoaded) return;
    
    // Show save dialog if there were changes
    if (hasDeformation) {
        showSaveDialog();
        return;
    }
    
    // Reset to original
    performReset();
}

// Выполнить сброс изображения без проверки
function performReset() {
    if (!texture || !isImageLoaded) return;
    
    // Reset to original
    texture = canvas.texture(previewImage || originalImage);
    canvas.draw(texture).update();
    hasDeformation = false;
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

// Добавить кнопку сохранения после инициализации canvas
const saveBtn = document.getElementById('saveBtn');
if (saveBtn) {
    // ИСПРАВЛЕНИЕ: Добавляем stopPropagation для предотвращения клика по canvas
    saveBtn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    
    saveBtn.addEventListener('click', async () => {
        if (!canvas || !isImageLoaded) {
            alert('Сначала загрузите изображение');
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение...';
            
            await workManager.saveWork(canvas);
            
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Сохранить';
        } catch (error) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Сохранить';
        }
    });
}

// Загрузить список работ при старте
window.addEventListener('load', () => {
    workManager.loadWorks();
    initializeSaveDialog();
});

// Инициализация диалога сохранения (вызывается один раз)
function initializeSaveDialog() {
    const saveDialog = document.createElement('div');
    saveDialog.id = 'saveDialog';
    saveDialog.className = 'modal';
    saveDialog.style.display = 'none';
    saveDialog.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <h2 style="margin-bottom: 20px;">Сохранить результат?</h2>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="saveDialogYes" class="save-btn" style="min-width: 100px;">Да</button>
                <button id="saveDialogNo" class="reset-btn" style="min-width: 100px;">Нет</button>
            </div>
        </div>
    `;
    document.body.appendChild(saveDialog);
    
    // Обработчики для кнопок (устанавливаются один раз)
    document.getElementById('saveDialogYes').addEventListener('click', async () => {
        closeSaveDialog();
        try {
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Сохранение...';
            }
            
            await workManager.saveWork(canvas);
            
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Сохранить';
            }
        } catch (error) {
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 Сохранить';
            }
        }
        // Сбрасываем изображение после сохранения
        performReset();
    });
    
    document.getElementById('saveDialogNo').addEventListener('click', () => {
        closeSaveDialog();
        // Сбрасываем изображение если пользователь отказался сохранять
        performReset();
    });
    
    // Закрытие по клику вне диалога
    saveDialog.addEventListener('click', (e) => {
        if (e.target === saveDialog) {
            closeSaveDialog();
            // Сбрасываем изображение при закрытии диалога
            performReset();
        }
    });
}

// Показать диалог сохранения
function showSaveDialog() {
    if (!canvas || !isImageLoaded) {
        return;
    }
    
    const saveDialog = document.getElementById('saveDialog');
    if (saveDialog) {
        saveDialog.style.display = 'flex';
    }
}

// Закрыть диалог сохранения
function closeSaveDialog() {
    const saveDialog = document.getElementById('saveDialog');
    if (saveDialog) {
        saveDialog.style.display = 'none';
    }
}

// Закрытие модального окна
const modal = document.getElementById('workModal');
const modalClose = document.getElementById('modalClose');

if (modalClose) {
    modalClose.onclick = () => workManager.closeWorkModal();
}

if (modal) {
    modal.onclick = (e) => {
        if (e.target === modal) {
            workManager.closeWorkModal();
        }
    };
}

// Закрытие по ESC (глобальный обработчик, добавляется один раз)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Закрываем диалог сохранения если открыт
        const saveDialog = document.getElementById('saveDialog');
        if (saveDialog && saveDialog.style.display === 'flex') {
            closeSaveDialog();
            performReset(); // Сбрасываем изображение при закрытии ESC
            return;
        }
        
        // Закрываем модальное окно работ если открыто
        const modal = document.getElementById('workModal');
        if (modal && modal.style.display === 'flex') {
            workManager.closeWorkModal();
        }
    }
});

// Скрыть заголовок и subtitle при загрузке изображения
function hideHeaderOnImageLoad() {
    const header = document.querySelector('h1');
    const subtitle = document.querySelector('.subtitle');
    
    if (header) header.style.display = 'none';
    if (subtitle) subtitle.style.display = 'none';
}

// Показать заголовок при возврате к загрузке
function showHeaderOnReset() {
    const header = document.querySelector('h1');
    const subtitle = document.querySelector('.subtitle');
    
    if (header) header.style.display = 'block';
    if (subtitle) subtitle.style.display = 'block';
}
