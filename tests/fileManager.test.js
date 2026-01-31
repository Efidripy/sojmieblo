const FileManager = require('../utils/fileManager');
const fs = require('fs').promises;
const path = require('path');

describe('FileManager', () => {
    let fileManager;
    let testDir;

    beforeEach(() => {
        // Create a test directory
        testDir = path.join(__dirname, 'test-data');
        fileManager = new FileManager(testDir);
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore errors during cleanup
        }
    });

    describe('Initialization', () => {
        test('should initialize with correct paths', () => {
            expect(fileManager.baseDir).toBe(testDir);
            expect(fileManager.worksDir).toBe(path.join(testDir, 'works'));
            expect(fileManager.thumbsDir).toBe(path.join(testDir, 'works', 'thumbs'));
        });

        test('should initialize cache as null', () => {
            expect(fileManager.worksCache).toBeNull();
            expect(fileManager.cacheTimestamp).toBeNull();
        });

        test('should create directories on initialize', async () => {
            await fileManager.initialize();
            
            const worksDirExists = await fs.access(fileManager.worksDir).then(() => true).catch(() => false);
            const thumbsDirExists = await fs.access(fileManager.thumbsDir).then(() => true).catch(() => false);
            
            expect(worksDirExists).toBe(true);
            expect(thumbsDirExists).toBe(true);
        });
    });

    describe('File name generation', () => {
        test('should generate file name with correct format', () => {
            const fileName = fileManager.generateFileName('jpg');
            
            // Format: YYYYMMDD-HHMMSS-randomchars.jpg
            const regex = /^\d{8}-\d{6}-[a-f0-9]{10}\.jpg$/;
            expect(fileName).toMatch(regex);
        });

        test('should generate unique file names', () => {
            const fileName1 = fileManager.generateFileName('jpg');
            const fileName2 = fileManager.generateFileName('jpg');
            
            expect(fileName1).not.toBe(fileName2);
        });
    });

    describe('Work saving', () => {
        test('should save work with image and thumbnail', async () => {
            await fileManager.initialize();
            
            const imageBuffer = Buffer.from('fake-image-data');
            const thumbnailBuffer = Buffer.from('fake-thumbnail-data');
            const metadata = {
                originalWidth: 1920,
                originalHeight: 1080,
                format: 'jpeg'
            };

            const result = await fileManager.saveWork(imageBuffer, thumbnailBuffer, metadata);

            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('fileName');
            expect(result).toHaveProperty('imagePath');
            expect(result).toHaveProperty('thumbnailPath');
            expect(result.imagePath).toContain('/api/works/');
            expect(result.thumbnailPath).toContain('/api/works/');
        });

        test('should invalidate cache after saving work', async () => {
            await fileManager.initialize();
            
            // Populate cache
            fileManager.worksCache = [{ id: 'test' }];
            fileManager.cacheTimestamp = Date.now();
            
            const imageBuffer = Buffer.from('fake-image-data');
            const thumbnailBuffer = Buffer.from('fake-thumbnail-data');
            
            await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            
            expect(fileManager.worksCache).toBeNull();
            expect(fileManager.cacheTimestamp).toBeNull();
        });
    });

    describe('Cache management', () => {
        test('should use cache on second getWorks call', async () => {
            await fileManager.initialize();
            
            // Create a test work
            const imageBuffer = Buffer.from('fake-image-data');
            const thumbnailBuffer = Buffer.from('fake-thumbnail-data');
            await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            
            // First call should populate cache
            const works1 = await fileManager.getWorks();
            expect(fileManager.worksCache).not.toBeNull();
            
            // Second call should use cache
            const cacheTimeBefore = fileManager.cacheTimestamp;
            const works2 = await fileManager.getWorks();
            
            expect(works1).toEqual(works2);
            expect(fileManager.cacheTimestamp).toBe(cacheTimeBefore);
        });

        test('should invalidate cache after deleting work', async () => {
            await fileManager.initialize();
            
            // Create a test work
            const imageBuffer = Buffer.from('fake-image-data');
            const thumbnailBuffer = Buffer.from('fake-thumbnail-data');
            const result = await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            
            // Populate cache
            await fileManager.getWorks();
            expect(fileManager.worksCache).not.toBeNull();
            
            // Delete work should invalidate cache
            await fileManager.deleteWork(result.id);
            
            expect(fileManager.worksCache).toBeNull();
            expect(fileManager.cacheTimestamp).toBeNull();
        });
    });

    describe('Work retrieval', () => {
        test('should return empty array when no works exist', async () => {
            await fileManager.initialize();
            
            const works = await fileManager.getWorks();
            
            expect(Array.isArray(works)).toBe(true);
            expect(works.length).toBe(0);
        });

        test('should return works sorted by creation date (newest first)', async () => {
            await fileManager.initialize();
            
            // Create multiple works with slight delays
            const imageBuffer = Buffer.from('fake-image-data');
            const thumbnailBuffer = Buffer.from('fake-thumbnail-data');
            
            const work1 = await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            await new Promise(resolve => setTimeout(resolve, 10));
            const work2 = await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            await new Promise(resolve => setTimeout(resolve, 10));
            const work3 = await fileManager.saveWork(imageBuffer, thumbnailBuffer, {});
            
            const works = await fileManager.getWorks();
            
            expect(works.length).toBe(3);
            expect(works[0].id).toBe(work3.id);
            expect(works[1].id).toBe(work2.id);
            expect(works[2].id).toBe(work1.id);
        });
    });
});
