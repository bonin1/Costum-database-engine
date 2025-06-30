/**
 * Buffer Pool - manages pages in memory with LRU eviction
 */
export class BufferPool {
    constructor(options = {}) {
        this.maxPages = options.maxPages || 100;
        this.pageManager = options.pageManager;
        
        // Page cache - maps "fileId:pageId" to page objects
        this.pages = new Map();
        
        // LRU tracking
        this.accessOrder = [];
        
        // Statistics
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            dirtyPages: 0
        };
    }

    /**
     * Get a page from the buffer pool or load from disk
     */
    async getPage(fileId, pageId) {
        const pageKey = `${fileId}:${pageId}`;
        
        // Check if page is already in memory
        if (this.pages.has(pageKey)) {
            this.stats.hits++;
            this.updateAccessOrder(pageKey);
            return this.pages.get(pageKey);
        }

        // Page not in memory, need to load from disk
        this.stats.misses++;
        
        // Evict pages if necessary
        await this.evictIfNecessary();
        
        // Load page from disk
        const page = await this.pageManager.loadPage(fileId, pageId);
        
        // Add to buffer pool
        this.pages.set(pageKey, page);
        this.accessOrder.push(pageKey);
        
        return page;
    }

    /**
     * Update access order for LRU
     */
    updateAccessOrder(pageKey) {
        const index = this.accessOrder.indexOf(pageKey);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(pageKey);
    }

    /**
     * Evict pages if buffer pool is full
     */
    async evictIfNecessary() {
        while (this.pages.size >= this.maxPages) {
            await this.evictLRU();
        }
    }

    /**
     * Evict the least recently used page
     */
    async evictLRU() {
        if (this.accessOrder.length === 0) {
            return;
        }

        const lruPageKey = this.accessOrder.shift();
        const page = this.pages.get(lruPageKey);
        
        if (page) {
            // Flush page if dirty
            if (page.isDirty()) {
                await this.pageManager.flushPage(page);
                this.stats.dirtyPages--;
            }
            
            this.pages.delete(lruPageKey);
            this.stats.evictions++;
        }
    }

    /**
     * Mark a page as dirty
     */
    markDirty(fileId, pageId) {
        const pageKey = `${fileId}:${pageId}`;
        const page = this.pages.get(pageKey);
        
        if (page && !page.isDirty()) {
            page.markDirty();
            this.stats.dirtyPages++;
        }
    }

    /**
     * Flush all dirty pages to disk
     */
    async flushAll() {
        const dirtyPages = [];
        
        for (const [, page] of this.pages) {
            if (page.isDirty()) {
                dirtyPages.push(page);
            }
        }

        // Flush all dirty pages
        await Promise.all(dirtyPages.map(page => this.pageManager.flushPage(page)));
        
        // Update statistics
        this.stats.dirtyPages = 0;
    }

    /**
     * Get buffer pool statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalPages: this.pages.size,
            maxPages: this.maxPages,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /**
     * Close the buffer pool
     */
    async close() {
        await this.flushAll();
        this.pages.clear();
        this.accessOrder = [];
    }
}
