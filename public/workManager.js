// Менеджер работ для frontend
class WorkManager {
    constructor() {
        this.works = [];
        this.currentWork = null;
    }

    // Сохранить текущую работу
    async saveWork(canvasElement) {
        try {
            // Получаем изображение из canvas
            const imageDataURL = canvasElement.toDataURL('image/png');

            // Отправляем на сервер
            const response = await fetch('/api/save-work', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: imageDataURL,
                    metadata: {
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString()
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save work');
            }

            const data = await response.json();
            
            // Обновляем список работ
            await this.loadWorks();
            
            // Показываем уведомление
            this.showNotification('✓ Сохранено!');
            
            return data.work;
        } catch (error) {
            console.error('Ошибка сохранения работы:', error);
            this.showNotification('✗ Ошибка сохранения', true);
            throw error;
        }
    }

    // Загрузить список всех работ
    async loadWorks() {
        try {
            const response = await fetch('/api/works');
            const data = await response.json();
            this.works = data.works || [];
            
            // Обновляем UI
            this.renderWorksList();
            
            return this.works;
        } catch (error) {
            console.error('Ошибка загрузки работ:', error);
            return [];
        }
    }

    // Скачать работу
    async downloadWork(workId) {
        try {
            window.location.href = `/api/works/${workId}/download`;
        } catch (error) {
            console.error('Ошибка скачивания работы:', error);
            this.showNotification('✗ Ошибка скачивания', true);
        }
    }

    // Удалить работу
    async deleteWork(workId) {
        try {
            const response = await fetch(`/api/works/${workId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete work');
            }

            // Обновляем список
            await this.loadWorks();
            
            this.showNotification('✓ Удалено');
        } catch (error) {
            console.error('Ошибка удаления работы:', error);
            this.showNotification('✗ Ошибка удаления', true);
        }
    }

    // Отобразить список работ
    renderWorksList() {
        const sidebar = document.getElementById('worksSidebar');
        const worksList = document.getElementById('worksList');
        
        if (!worksList) return;

        // Показываем sidebar если есть работы
        if (this.works.length > 0) {
            sidebar.style.display = 'block';
        }

        // Очищаем список
        worksList.innerHTML = '';

        // Если нет работ
        if (this.works.length === 0) {
            worksList.innerHTML = '<div class="no-works">Нет сохраненных работ</div>';
            return;
        }

        // Отображаем каждую работу
        this.works.forEach(work => {
            const workItem = this.createWorkItem(work);
            worksList.appendChild(workItem);
        });
    }

    // Создать элемент работы
    createWorkItem(work) {
        const item = document.createElement('div');
        item.className = 'work-item';
        item.dataset.workId = work.id;

        const thumbnail = document.createElement('img');
        thumbnail.src = `/api/works/${work.id}/thumbnail`;
        thumbnail.alt = 'Work thumbnail';
        thumbnail.className = 'work-thumbnail';
        thumbnail.onclick = () => this.openWorkModal(work.id);

        const info = document.createElement('div');
        info.className = 'work-info';

        const time = document.createElement('div');
        time.className = 'work-time';
        time.textContent = this.formatTime(work.createdAt);

        const actions = document.createElement('div');
        actions.className = 'work-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'work-btn view-btn';
        viewBtn.innerHTML = '👁️';
        viewBtn.title = 'Просмотр';
        viewBtn.onclick = (e) => {
            e.stopPropagation();
            this.openWorkModal(work.id);
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'work-btn download-btn';
        downloadBtn.innerHTML = '⬇️';
        downloadBtn.title = 'Скачать';
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            this.downloadWork(work.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'work-btn delete-btn';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Удалить';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Удалить эту работу?')) {
                this.deleteWork(work.id);
            }
        };

        actions.appendChild(viewBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(deleteBtn);

        info.appendChild(time);
        info.appendChild(actions);

        item.appendChild(thumbnail);
        item.appendChild(info);

        return item;
    }

    // Открыть модальное окно с работой
    openWorkModal(workId) {
        const modal = document.getElementById('workModal');
        const modalImage = document.getElementById('modalImage');
        const modalDownload = document.getElementById('modalDownload');

        modalImage.src = `/api/works/${workId}/download`;
        modalDownload.onclick = () => this.downloadWork(workId);

        modal.style.display = 'flex';
    }

    // Закрыть модальное окно
    closeWorkModal() {
        const modal = document.getElementById('workModal');
        modal.style.display = 'none';
    }

    // Форматировать время
    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        
        // Менее минуты назад
        if (diff < 60000) {
            return 'Только что';
        }
        
        // Менее часа назад
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} мин назад`;
        }
        
        // Менее дня назад
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} ч назад`;
        }
        
        // Форматируем дату
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}.${month} ${hours}:${minutes}`;
    }

    // Показать уведомление
    showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Анимация появления
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Удаление через 3 секунды
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

// Глобальный экземпляр
const workManager = new WorkManager();
