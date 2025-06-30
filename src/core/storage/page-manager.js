import { Page } from './page.js';

/**
 * Page Manager - handles page loading and flushing
 */
export class PageManager {
    constructor(options = {}) {
        this.pageSize = options.pageSize || 4096;
        this.fileManager = options.fileManager;
    }

    /**
     * Load a page from disk
     */
    async loadPage(fileId, pageId) {
        const data = await this.fileManager.readPage(fileId, pageId, this.pageSize);
        return new Page(fileId, pageId, data, this.pageSize);
    }

    /**
     * Flush a page to disk
     */
    async flushPage(page) {
        if (page.isDirty()) {
            await this.fileManager.writePage(page.fileId, page.pageId, page.getData());
            page.clearDirty();
        }
    }

    /**
     * Create a new empty page
     */
    createPage(fileId, pageId) {
        const data = Buffer.alloc(this.pageSize);
        return new Page(fileId, pageId, data, this.pageSize);
    }
}
