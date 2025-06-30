import fs from 'fs/promises';
import path from 'path';

/**
 * File Manager - handles file operations and page allocation
 */
export class FileManager {
    constructor(dataPath) {
        this.dataPath = dataPath;
        this.openFiles = new Map(); // fileId -> { fd, filename, pageCount }
        this.nextFileId = 1;
        this.fileIdMap = new Map(); // filename -> fileId
    }

    async initialize() {
        try {
            await fs.access(this.dataPath);
        } catch {
            await fs.mkdir(this.dataPath, { recursive: true });
        }

        // Load existing file mappings
        await this.loadFileMap();
    }

    async loadFileMap() {
        try {
            const files = await fs.readdir(this.dataPath);
            
            for (const filename of files) {
                if (filename.endsWith('.tbl') || filename.endsWith('.idx')) {
                    const stats = await fs.stat(path.join(this.dataPath, filename));
                    const pageCount = Math.ceil(stats.size / 4096); // Assuming 4KB pages
                    
                    const fileId = this.nextFileId++;
                    this.fileIdMap.set(filename, fileId);
                    
                    // Don't keep files open initially
                    this.openFiles.set(fileId, {
                        fd: null,
                        filename,
                        pageCount
                    });
                }
            }
        } catch (error) {
            console.error('Error loading file map:', error);
        }
    }

    async createFile(filename) {
        const filePath = path.join(this.dataPath, filename);
        
        // Create empty file
        const fd = await fs.open(filePath, 'w+');
        
        const fileId = this.nextFileId++;
        this.fileIdMap.set(filename, fileId);
        this.openFiles.set(fileId, {
            fd,
            filename,
            pageCount: 0
        });

        return fileId;
    }

    async openFile(filename) {
        const existingFileId = this.fileIdMap.get(filename);
        if (existingFileId) {
            const fileInfo = this.openFiles.get(existingFileId);
            
            // Open file if not already open
            if (!fileInfo.fd) {
                const filePath = path.join(this.dataPath, filename);
                fileInfo.fd = await fs.open(filePath, 'r+');
            }
            
            return existingFileId;
        }

        throw new Error(`File not found: ${filename}`);
    }

    async deleteFile(filename) {
        const fileId = this.fileIdMap.get(filename);
        if (fileId) {
            const fileInfo = this.openFiles.get(fileId);
            
            // Close file if open
            if (fileInfo.fd) {
                await fileInfo.fd.close();
            }
            
            // Delete file
            const filePath = path.join(this.dataPath, filename);
            await fs.unlink(filePath);
            
            // Remove from maps
            this.fileIdMap.delete(filename);
            this.openFiles.delete(fileId);
        }
    }

    async allocatePage(fileId) {
        const fileInfo = this.openFiles.get(fileId);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileId}`);
        }

        const pageId = fileInfo.pageCount++;
        
        // Ensure file is open
        if (!fileInfo.fd) {
            const filePath = path.join(this.dataPath, fileInfo.filename);
            fileInfo.fd = await fs.open(filePath, 'r+');
        }

        return pageId;
    }

    async readPage(fileId, pageId, pageSize) {
        const fileInfo = this.openFiles.get(fileId);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileId}`);
        }

        // Ensure file is open
        if (!fileInfo.fd) {
            const filePath = path.join(this.dataPath, fileInfo.filename);
            fileInfo.fd = await fs.open(filePath, 'r+');
        }

        const offset = pageId * pageSize;
        const buffer = Buffer.alloc(pageSize);
        
        try {
            const result = await fileInfo.fd.read(buffer, 0, pageSize, offset);
            
            // If we read less than pageSize, fill the rest with zeros
            if (result.bytesRead < pageSize) {
                buffer.fill(0, result.bytesRead);
            }
            
            return buffer;
        } catch (error) {
            // If page doesn't exist yet, return zero-filled buffer
            if (error.code === 'EOF' || offset >= await this.getFileSize(fileId)) {
                return Buffer.alloc(pageSize);
            }
            throw error;
        }
    }

    async writePage(fileId, pageId, data) {
        const fileInfo = this.openFiles.get(fileId);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileId}`);
        }

        // Ensure file is open
        if (!fileInfo.fd) {
            const filePath = path.join(this.dataPath, fileInfo.filename);
            fileInfo.fd = await fs.open(filePath, 'r+');
        }

        const offset = pageId * data.length;
        await fileInfo.fd.write(data, 0, data.length, offset);
        
        // Update page count if necessary
        const newPageCount = pageId + 1;
        if (newPageCount > fileInfo.pageCount) {
            fileInfo.pageCount = newPageCount;
        }
    }

    async getFileSize(fileId) {
        const fileInfo = this.openFiles.get(fileId);
        if (!fileInfo) {
            throw new Error(`File not found: ${fileId}`);
        }

        const filePath = path.join(this.dataPath, fileInfo.filename);
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    async getTotalPageCount() {
        let totalPages = 0;
        for (const [, fileInfo] of this.openFiles) {
            totalPages += fileInfo.pageCount;
        }
        return totalPages;
    }

    async sync() {
        for (const [, fileInfo] of this.openFiles) {
            if (fileInfo.fd) {
                await fileInfo.fd.sync();
            }
        }
    }

    async close() {
        for (const [, fileInfo] of this.openFiles) {
            if (fileInfo.fd) {
                await fileInfo.fd.close();
            }
        }
        
        this.openFiles.clear();
        this.fileIdMap.clear();
    }
}
