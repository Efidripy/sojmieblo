// Main application logic for Sojmieblo
let canvas, gl, texture;
let originalImage;
let isImageLoaded = false;

// DOM elements
const uploadSection = document.getElementById('uploadSection');
const canvasContainer = document.getElementById('canvasContainer');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const resetBtn = document.getElementById('resetBtn');
const changeBtn = document.getElementById('changeBtn');
const glCanvas = document.getElementById('glCanvas');

// Initialize event listeners
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
resetBtn.addEventListener('click', resetImage);
changeBtn.addEventListener('click', () => {
    canvasContainer.style.display = 'none';
    uploadSection.style.display = 'block';
    isImageLoaded = false;
});

// Drag and drop functionality
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

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file upload
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

// Initialize WebGL canvas with glfx.js
function initializeCanvas(img) {
    try {
        // Create glfx canvas
        canvas = fx.canvas();
        
        // Replace the regular canvas with the glfx canvas
        const oldCanvas = document.getElementById('glCanvas');
        canvas.id = 'glCanvas';
        canvas.className = oldCanvas.className;
        oldCanvas.parentNode.replaceChild(canvas, oldCanvas);
        
        // Load the texture
        texture = canvas.texture(img);
        
        // Set canvas size to match image while maintaining aspect ratio
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
        
        // Draw initial image
        canvas.draw(texture).update();
        
        // Add mouse interaction
        setupMouseInteraction();
        
    } catch (e) {
        console.error('Error initializing canvas:', e);
        alert('Ошибка инициализации WebGL. Убедитесь, что ваш браузер поддерживает WebGL.');
    }
}

// Setup mouse interaction for real-time deformation
function setupMouseInteraction() {
    let isMouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        // Apply bulge/pinch effect in real-time
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

// Apply bulge/pinch deformation effect
function applyDeformation(x, y, isClick) {
    if (!texture || !canvas) return;
    
    // Scale coordinates to canvas dimensions
    const canvasX = x;
    const canvasY = y;
    
    // Radius of effect (proportional to canvas size)
    const radius = Math.min(canvas.width, canvas.height) * 0.2;
    
    // Strength of effect (negative for pinch, positive for bulge)
    const strength = isClick ? -0.8 : -0.5; // Pinch effect (negative value)
    
    try {
        // Draw texture with bulge effect
        canvas.draw(texture)
            .bulgePinch(canvasX, canvasY, radius, strength)
            .update();
    } catch (e) {
        console.error('Error applying deformation:', e);
    }
}

// Reset image to original state
function resetImage() {
    if (!texture || !canvas) return;
    
    try {
        canvas.draw(texture).update();
    } catch (e) {
        console.error('Error resetting image:', e);
    }
}

// Check if WebGL is supported
window.addEventListener('load', () => {
    if (!window.fx) {
        console.warn('glfx.js not loaded, WebGL effects may not work');
    }
});
