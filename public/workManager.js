// ÐœÐµÐ½ÐµÐ´Ð¶ÐµÑ€ Ñ€Ð°Ð±Ð¾Ñ‚ Ð´Ð»Ñ frontend
class WorkManager {
    constructor() {
        this.works = [];
        this.currentWork = null;
        this.isFileProtocol = window.location.protocol === 'file:';
        this.sidebarCollapsed = false;
        this.initSidebarControls();
    }

    initSidebarControls() {
        const btn = document.getElementById('sidebarToggleBtn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            this.updateSidebarState();
        });
    }

    updateSidebarState() {
        const sidebar = document.getElementById('worksSidebar');
        const btn = document.getElementById('sidebarToggleBtn');
        if (!sidebar || !btn) return;
        sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        btn.textContent = this.sidebarCollapsed ? '<' : '>';
        btn.title = this.sidebarCollapsed ? 'Expand' : 'Collapse';
    }

    log(eventName, details = {}) {
        if (typeof window.debugEvent === 'function') {
            window.debugEvent(eventName, details);
        }
    }

    nextFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    isLikelyBlackFrame(pixels) {
        if (!pixels || pixels.length === 0) return true;
        let dark = 0;
        let nonTransparent = 0;
        let total = 0;
        const stride = 64;

        for (let i = 0; i < pixels.length; i += stride) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            if (a > 8) {
                nonTransparent++;
                const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if (lum < 10) dark++;
            }
            total++;
        }

        if (total === 0 || nonTransparent === 0) return true;
        return (dark / nonTransparent) > 0.985;
    }

    toFlippedJpegDataURL(width, height, pixels) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        const imageData = tempCtx.createImageData(width, height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4;
                const dstIdx = ((height - y - 1) * width + x) * 4;
                imageData.data[dstIdx] = pixels[srcIdx];
                imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
                imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
                imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
            }
        }

        tempCtx.putImageData(imageData, 0, 0);
        return tempCanvas.toDataURL('image/jpeg', 0.95);
    }

    exportFromGfxTexture(canvasElement) {
        if (!canvasElement || typeof canvasElement.contents !== 'function') return '';
        const out = canvasElement.contents();
        if (!out || typeof out.toDataURL !== 'function') return '';
        return out.toDataURL('image/jpeg', 0.95);
    }

    // Ð¡Ð¾Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑŒ Ñ‚ÐµÐºÑƒÑ‰ÑƒÑŽ Ñ€Ð°Ð±Ð¾Ñ‚Ñƒ
    async saveWork(canvasElement) {
        try {
            this.log('api.save_work_start');
            if (this.isFileProtocol) {
                throw new Error('App is opened via file://. Start server and open http://localhost:3000');
            }
            const gl = canvasElement?._?.gl;
            let imageDataURL = '';

            // Primary path: export from glfx texture snapshot.
            imageDataURL = this.exportFromGfxTexture(canvasElement);
            if (imageDataURL) {
                this.log('save.export_from_gfx_texture_ok');
            }

            if (!imageDataURL && gl && typeof gl.finish === 'function') {
                gl.flush();
                gl.finish();
            }

            if (!imageDataURL && canvasElement && typeof canvasElement.toDataURL === 'function') {
                imageDataURL = canvasElement.toDataURL('image/jpeg', 0.95);
            }

            if (!imageDataURL) {
                throw new Error('Canvas context is not available for export');
            }
            
            // Verify it's not empty/black (basic check)
            // Minimum size adjusted based on canvas dimensions
            // Using 1% of total pixels as baseline (width * height / 100)
            // This accounts for varying image sizes and JPEG compression
            // Keep a very low floor: valid JPEG output can be small for flat content.
            const minExpectedSize = 1500;
            if (imageDataURL.length < minExpectedSize) {
                throw new Error(`Generated image is too small (likely black): ${imageDataURL.length} bytes, expected at least ${minExpectedSize}`);
            }
            // ÐžÑ‚Ð¿Ñ€Ð°Ð²Ð»ÑÐµÐ¼ Ð½Ð° ÑÐµÑ€Ð²ÐµÑ€
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
                this.log('api.save_work_http_error', { status: response.status });
                let details = '';
                try {
                    const errJson = await response.json();
                    details = errJson?.details || errJson?.error || '';
                } catch (_) {
                    details = await response.text();
                }
                throw new Error(details ? `Failed to save work: ${details}` : 'Failed to save work');
            }

            const data = await response.json();
            this.log('api.save_work_success', { workId: data?.work?.id });
            
            // ÐžÐ±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ ÑÐ¿Ð¸ÑÐ¾Ðº Ñ€Ð°Ð±Ð¾Ñ‚
            await this.loadWorks();
            
            // ÐŸÐ¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÐ¼ ÑƒÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ðµ
            this.showNotification('Saved');
            
            return data.work;
        } catch (error) {
            this.log('api.save_work_error', { message: error.message });
            console.error('ÐžÑˆÐ¸Ð±ÐºÐ° ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ Ñ€Ð°Ð±Ð¾Ñ‚Ñ‹:', error);
            this.showNotification('Save error', true);
            throw error;
        }
    }

    // Ð—Ð°Ð³Ñ€ÑƒÐ·Ð¸Ñ‚ÑŒ ÑÐ¿Ð¸ÑÐ¾Ðº Ð²ÑÐµÑ… Ñ€Ð°Ð±Ð¾Ñ‚
    async loadWorks() {
        try {
            this.log('api.load_works_start');
            if (this.isFileProtocol) {
                this.log('api.load_works_skipped_file_protocol');
                return [];
            }
            const response = await fetch('/api/works');
            
            if (!response.ok) {
                this.log('api.load_works_http_error', { status: response.status });
                throw new Error('Failed to load works');
            }
            
            const data = await response.json();
            this.works = data.works || [];
            this.log('api.load_works_success', { count: this.works.length });
            
            // ÐžÐ±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ UI
            this.renderWorksList();
            
            return this.works;
        } catch (error) {
            this.log('api.load_works_error', { message: error.message });
            console.error('ÐžÑˆÐ¸Ð±ÐºÐ° Ð·Ð°Ð³Ñ€ÑƒÐ·ÐºÐ¸ Ñ€Ð°Ð±Ð¾Ñ‚:', error);
            return [];
        }
    }

    // Ð¡ÐºÐ°Ñ‡Ð°Ñ‚ÑŒ Ñ€Ð°Ð±Ð¾Ñ‚Ñƒ
    downloadWork(workId) {
        this.log('ui.download_work_click', { workId });
        // Ð˜ÑÐ¿Ð¾Ð»ÑŒÐ·ÑƒÐµÐ¼ Ð¿Ñ€ÑÐ¼Ð¾Ðµ Ð¿ÐµÑ€ÐµÐ½Ð°Ð¿Ñ€Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ Ð´Ð»Ñ ÑÐºÐ°Ñ‡Ð¸Ð²Ð°Ð½Ð¸Ñ Ñ„Ð°Ð¹Ð»Ð°
        window.location.href = `/api/works/${workId}/download`;
    }

    // Ð£Ð´Ð°Ð»Ð¸Ñ‚ÑŒ Ñ€Ð°Ð±Ð¾Ñ‚Ñƒ
    async deleteWork(workId) {
        try {
            this.log('api.delete_work_start', { workId });
            const response = await fetch(`/api/works/${workId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                this.log('api.delete_work_http_error', { status: response.status, workId });
                throw new Error('Failed to delete work');
            }

            // ÐžÐ±Ð½Ð¾Ð²Ð»ÑÐµÐ¼ ÑÐ¿Ð¸ÑÐ¾Ðº
            await this.loadWorks();
            
            this.showNotification('Deleted');
            this.log('api.delete_work_success', { workId });
        } catch (error) {
            this.log('api.delete_work_error', { message: error.message, workId });
            console.error('ÐžÑˆÐ¸Ð±ÐºÐ° ÑƒÐ´Ð°Ð»ÐµÐ½Ð¸Ñ Ñ€Ð°Ð±Ð¾Ñ‚Ñ‹:', error);
            this.showNotification('Delete error', true);
        }
    }

    // ÐžÑ‚Ð¾Ð±Ñ€Ð°Ð·Ð¸Ñ‚ÑŒ ÑÐ¿Ð¸ÑÐ¾Ðº Ñ€Ð°Ð±Ð¾Ñ‚
    renderWorksList() {
        const sidebar = document.getElementById('worksSidebar');
        const worksList = document.getElementById('worksList');
        
        if (!worksList || !sidebar) return;

        sidebar.style.display = this.works.length > 0 ? 'block' : 'none';

        // ÐžÑ‡Ð¸Ñ‰Ð°ÐµÐ¼ ÑÐ¿Ð¸ÑÐ¾Ðº
        worksList.innerHTML = '';

        // Ð•ÑÐ»Ð¸ Ð½ÐµÑ‚ Ñ€Ð°Ð±Ð¾Ñ‚
        if (this.works.length === 0) {
            return;
        }
        this.updateSidebarState();

        // ÐžÑ‚Ð¾Ð±Ñ€Ð°Ð¶Ð°ÐµÐ¼ ÐºÐ°Ð¶Ð´ÑƒÑŽ Ñ€Ð°Ð±Ð¾Ñ‚Ñƒ
        this.works.forEach(work => {
            const workItem = this.createWorkItem(work);
            worksList.appendChild(workItem);
        });
    }

    // Ð¡Ð¾Ð·Ð´Ð°Ñ‚ÑŒ ÑÐ»ÐµÐ¼ÐµÐ½Ñ‚ Ñ€Ð°Ð±Ð¾Ñ‚Ñ‹
    createWorkItem(work) {
        const item = document.createElement('div');
        item.className = 'work-item';
        item.dataset.workId = work.id;

        const thumbnail = document.createElement('img');
        thumbnail.src = `/api/works/${work.id}/thumbnail`;
        thumbnail.alt = 'Work thumbnail';
        thumbnail.className = 'work-thumbnail';
        thumbnail.loading = 'lazy';
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
        viewBtn.textContent = 'View';
        viewBtn.title = 'View';
        viewBtn.onclick = (e) => {
            e.stopPropagation();
            this.log('ui.view_work_click', { workId: work.id });
            this.openWorkModal(work.id);
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'work-btn download-btn';
        downloadBtn.textContent = 'Down';
        downloadBtn.title = 'Download';
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            this.log('ui.download_work_icon_click', { workId: work.id });
            this.downloadWork(work.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'work-btn delete-btn';
        deleteBtn.textContent = 'Del';
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.log('ui.delete_work_click', { workId: work.id });
            if (confirm('Delete this work?')) {
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

    // ÐžÑ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¼Ð¾Ð´Ð°Ð»ÑŒÐ½Ð¾Ðµ Ð¾ÐºÐ½Ð¾ Ñ Ñ€Ð°Ð±Ð¾Ñ‚Ð¾Ð¹
    openWorkModal(workId) {
        this.log('ui.open_work_modal', { workId });
        const modal = document.getElementById('workModal');
        const modalImage = document.getElementById('modalImage');
        const modalDownload = document.getElementById('modalDownload');

        modalImage.src = `/api/works/${workId}/download`;
        modalDownload.onclick = () => this.downloadWork(workId);

        modal.style.display = 'flex';
    }

    // Ð—Ð°ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¼Ð¾Ð´Ð°Ð»ÑŒÐ½Ð¾Ðµ Ð¾ÐºÐ½Ð¾
    closeWorkModal() {
        this.log('ui.close_work_modal');
        const modal = document.getElementById('workModal');
        modal.style.display = 'none';
    }

    // Ð¤Ð¾Ñ€Ð¼Ð°Ñ‚Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ Ð²Ñ€ÐµÐ¼Ñ
    formatTime(isoString) {
        const date = new Date(isoString);
        
        // ÐŸÑ€Ð¾Ð²ÐµÑ€ÐºÐ° Ð½Ð° Ð²Ð°Ð»Ð¸Ð´Ð½Ð¾ÑÑ‚ÑŒ Ð´Ð°Ñ‚Ñ‹
        if (isNaN(date.getTime())) {
            return 'Unknown';
        }
        
        const now = new Date();
        const diff = now - date;
        
        // Ð•ÑÐ»Ð¸ Ð´Ð°Ñ‚Ð° Ð² Ð±ÑƒÐ´ÑƒÑ‰ÐµÐ¼ (Ð²Ð¾Ð·Ð¼Ð¾Ð¶Ð½Ð°Ñ Ð¾ÑˆÐ¸Ð±ÐºÐ° Ð´Ð°Ð½Ð½Ñ‹Ñ…)
        if (diff < 0) {
            console.warn('Future timestamp detected:', isoString);
            return 'Invalid date';
        }
        
        // ÐœÐµÐ½ÐµÐµ Ð¼Ð¸Ð½ÑƒÑ‚Ñ‹ Ð½Ð°Ð·Ð°Ð´
        if (diff < 60000) {
            return 'Just now';
        }
        
        // ÐœÐµÐ½ÐµÐµ Ñ‡Ð°ÑÐ° Ð½Ð°Ð·Ð°Ð´
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} min ago`;
        }
        
        // ÐœÐµÐ½ÐµÐµ Ð´Ð½Ñ Ð½Ð°Ð·Ð°Ð´
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} h ago`;
        }
        
        // Ð¤Ð¾Ñ€Ð¼Ð°Ñ‚Ð¸Ñ€ÑƒÐµÐ¼ Ð´Ð°Ñ‚Ñƒ
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}.${month} ${hours}:${minutes}`;
    }

    // ÐŸÐ¾ÐºÐ°Ð·Ð°Ñ‚ÑŒ ÑƒÐ²ÐµÐ´Ð¾Ð¼Ð»ÐµÐ½Ð¸Ðµ
    showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = `notification ${isError ? 'error' : 'success'}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // ÐÐ½Ð¸Ð¼Ð°Ñ†Ð¸Ñ Ð¿Ð¾ÑÐ²Ð»ÐµÐ½Ð¸Ñ
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Ð£Ð´Ð°Ð»ÐµÐ½Ð¸Ðµ Ñ‡ÐµÑ€ÐµÐ· 3 ÑÐµÐºÑƒÐ½Ð´Ñ‹
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

// Ð“Ð»Ð¾Ð±Ð°Ð»ÑŒÐ½Ñ‹Ð¹ ÑÐºÐ·ÐµÐ¼Ð¿Ð»ÑÑ€
const workManager = new WorkManager();

