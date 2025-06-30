import { BufferPool } from './buffer-pool.js';
import { PageManager } from './page-manager.js';
import { FileManager } from './file-manager.js';

/**
 * Storage Engine - manages data persistence and retrieval
 */
export class StorageEngine {
    constructor(options = {}) {
        this.dataPath = options.dataPath || './data';
        this.pageSize = options.pageSize || 4096;
        this.bufferPoolSize = options.bufferPoolSize || 100;
        
        this.fileManager = null;
        this.pageManager = null;
        this.bufferPool = null;
        
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize file manager
            this.fileManager = new FileManager(this.dataPath);
            await this.fileManager.initialize();

            // Initialize page manager
            this.pageManager = new PageManager({
                pageSize: this.pageSize,
                fileManager: this.fileManager
            });

            // Initialize buffer pool
            this.bufferPool = new BufferPool({
                maxPages: this.bufferPoolSize,
                pageManager: this.pageManager
            });

            this.isInitialized = true;
            console.log('Storage engine initialized');
        } catch (error) {
            console.error('Error initializing storage engine:', error);
            throw error;
        }
    }

    /**
     * Read a page from storage
     */
    async readPage(fileId, pageId) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        return await this.bufferPool.getPage(fileId, pageId);
    }

    /**
     * Write a page to storage
     */
    async writePage(fileId, pageId, data) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        const page = await this.bufferPool.getPage(fileId, pageId);
        page.setData(data);
        page.markDirty();
        
        return page;
    }

    /**
     * Allocate a new page
     */
    async allocatePage(fileId) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        const pageId = await this.fileManager.allocatePage(fileId);
        return await this.bufferPool.getPage(fileId, pageId);
    }

    /**
     * Create a new table file
     */
    async createTableFile(tableName) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        return await this.fileManager.createFile(`${tableName}.tbl`);
    }

    /**
     * Create a new index file
     */
    async createIndexFile(indexName) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        return await this.fileManager.createFile(`${indexName}.idx`);
    }

    /**
     * Open an existing file
     */
    async openFile(filename) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        return await this.fileManager.openFile(filename);
    }

    /**
     * Delete a file
     */
    async deleteFile(filename) {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        return await this.fileManager.deleteFile(filename);
    }

    /**
     * Flush all dirty pages to disk
     */
    async checkpoint() {
        if (!this.isInitialized) {
            throw new Error('Storage engine not initialized');
        }

        await this.bufferPool.flushAll();
        await this.fileManager.sync();
    }

    /**
     * Get storage statistics
     */
    async getPageCount() {
        if (!this.isInitialized) {
            return 0;
        }

        return await this.fileManager.getTotalPageCount();
    }

    /**
     * Get buffer pool statistics
     */
    getBufferPoolStats() {
        if (!this.bufferPool) {
            return {};
        }

        return this.bufferPool.getStats();
    }

    /**
     * Close the storage engine
     */
    async close() {
        if (!this.isInitialized) {
            return;
        }

        try {
            // Flush all dirty pages
            await this.checkpoint();
            
            // Close buffer pool
            if (this.bufferPool) {
                await this.bufferPool.close();
            }

            // Close file manager
            if (this.fileManager) {
                await this.fileManager.close();
            }

            this.isInitialized = false;
            console.log('Storage engine closed');
        } catch (error) {
            console.error('Error closing storage engine:', error);
            throw error;
        }
    }
}
