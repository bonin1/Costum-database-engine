/**
 * Page - represents a single page in memory
 */
export class Page {
    constructor(fileId, pageId, data, pageSize) {
        this.fileId = fileId;
        this.pageId = pageId;
        this.data = data || Buffer.alloc(pageSize);
        this.pageSize = pageSize;
        this.dirty = false;
        this.pinCount = 0;
    }

    /**
     * Get page data
     */
    getData() {
        return this.data;
    }

    /**
     * Set page data
     */
    setData(data) {
        if (data.length > this.pageSize) {
            throw new Error(`Data size (${data.length}) exceeds page size (${this.pageSize})`);
        }
        
        this.data = Buffer.alloc(this.pageSize);
        data.copy(this.data);
        this.markDirty();
    }

    /**
     * Write data at specific offset
     */
    writeAt(offset, data) {
        if (offset + data.length > this.pageSize) {
            throw new Error('Write would exceed page boundary');
        }
        
        data.copy(this.data, offset);
        this.markDirty();
    }

    /**
     * Read data from specific offset
     */
    readAt(offset, length) {
        if (offset + length > this.pageSize) {
            throw new Error('Read would exceed page boundary');
        }
        
        return this.data.subarray(offset, offset + length);
    }

    /**
     * Mark page as dirty
     */
    markDirty() {
        this.dirty = true;
    }

    /**
     * Clear dirty flag
     */
    clearDirty() {
        this.dirty = false;
    }

    /**
     * Check if page is dirty
     */
    isDirty() {
        return this.dirty;
    }

    /**
     * Pin the page in memory
     */
    pin() {
        this.pinCount++;
    }

    /**
     * Unpin the page
     */
    unpin() {
        if (this.pinCount > 0) {
            this.pinCount--;
        }
    }

    /**
     * Check if page is pinned
     */
    isPinned() {
        return this.pinCount > 0;
    }

    /**
     * Get page header information
     */
    getHeader() {
        return {
            fileId: this.fileId,
            pageId: this.pageId,
            dirty: this.dirty,
            pinCount: this.pinCount
        };
    }

    /**
     * Get available space in page
     */
    getAvailableSpace() {
        // This is a simplified implementation
        // In practice, you'd track used space more precisely
        return this.pageSize - this.getUsedSpace();
    }

    /**
     * Get used space in page
     */
    getUsedSpace() {
        // Simplified - scan for non-zero bytes
        let used = 0;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] !== 0) {
                used = i + 1;
            }
        }
        return used;
    }
}
