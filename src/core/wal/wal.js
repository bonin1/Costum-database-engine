import fs from 'fs/promises';
import path from 'path';

/**
 * Write-Ahead Log for crash recovery and durability
 */
export class WAL {
    constructor(walPath) {
        this.walPath = walPath;
        this.currentLogFile = null;
        this.logSequenceNumber = 0;
        this.checkpointLSN = 0;
        this.isEnabled = true;
    }

    async initialize() {
        try {
            await fs.access(this.walPath);
        } catch {
            await fs.mkdir(this.walPath, { recursive: true });
        }

        // Find the latest log file
        await this.findLatestLogFile();
        
        // Create new log file if none exists
        if (!this.currentLogFile) {
            await this.createNewLogFile();
        }

        console.log('WAL initialized');
    }

    async findLatestLogFile() {
        try {
            const files = await fs.readdir(this.walPath);
            const logFiles = files
                .filter(f => f.startsWith('wal_') && f.endsWith('.log'))
                .sort();
            
            if (logFiles.length > 0) {
                const latestFile = logFiles[logFiles.length - 1];
                this.currentLogFile = path.join(this.walPath, latestFile);
                
                // Extract LSN from filename
                const match = latestFile.match(/wal_(\d+)\.log/);
                if (match) {
                    this.logSequenceNumber = parseInt(match[1]);
                }
            }
        } catch (error) {
            console.warn('Error finding latest log file:', error.message);
        }
    }

    async createNewLogFile() {
        this.logSequenceNumber++;
        const filename = `wal_${this.logSequenceNumber.toString().padStart(10, '0')}.log`;
        this.currentLogFile = path.join(this.walPath, filename);
        
        // Create empty log file
        await fs.writeFile(this.currentLogFile, '');
    }

    async writeLogRecord(record) {
        if (!this.isEnabled || !this.currentLogFile) {
            return;
        }

        const lsn = ++this.logSequenceNumber;
        const logRecord = {
            lsn,
            timestamp: Date.now(),
            ...record
        };

        const logLine = JSON.stringify(logRecord) + '\n';
        
        try {
            await fs.appendFile(this.currentLogFile, logLine);
            return lsn;
        } catch (error) {
            console.error('Error writing WAL record:', error);
            throw error;
        }
    }

    async logTransaction(transactionId, operation, data) {
        return await this.writeLogRecord({
            type: 'TRANSACTION',
            transactionId,
            operation, // BEGIN, COMMIT, ROLLBACK
            data
        });
    }

    async logPageWrite(transactionId, fileId, pageId, beforeImage, afterImage) {
        return await this.writeLogRecord({
            type: 'PAGE_WRITE',
            transactionId,
            fileId,
            pageId,
            beforeImage: beforeImage.toString('hex'),
            afterImage: afterImage.toString('hex')
        });
    }

    async logTableOperation(transactionId, operation, tableName, data) {
        return await this.writeLogRecord({
            type: 'TABLE_OPERATION',
            transactionId,
            operation, // INSERT, UPDATE, DELETE
            tableName,
            data
        });
    }

    async needsRecovery() {
        if (!this.currentLogFile) {
            return false;
        }

        try {
            const stats = await fs.stat(this.currentLogFile);
            return stats.size > 0;
        } catch {
            return false;
        }
    }

    async replay(storageEngine) {
        if (!this.currentLogFile) {
            return;
        }

        console.log('Starting WAL replay...');
        
        try {
            const logContent = await fs.readFile(this.currentLogFile, 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim());
            
            const committedTransactions = new Set();
            
            // First pass: identify committed transactions
            for (const line of logLines) {
                const record = this.parseLogRecord(line);
                if (record && record.type === 'TRANSACTION' && record.operation === 'COMMIT') {
                    committedTransactions.add(record.transactionId);
                }
            }

            // Second pass: replay committed transactions
            for (const line of logLines) {
                const record = this.parseLogRecord(line);
                if (record && record.type === 'PAGE_WRITE' && 
                    committedTransactions.has(record.transactionId)) {
                    
                    await this.replayPageWrite(storageEngine, record);
                }
            }

            console.log(`WAL replay completed. Processed ${logLines.length} records.`);
        } catch (error) {
            console.error('Error during WAL replay:', error);
            throw error;
        }
    }

    parseLogRecord(line) {
        try {
            return JSON.parse(line);
        } catch (error) {
            console.warn('Skipping invalid log record:', error.message);
            return null;
        }
    }

    async replayPageWrite(storageEngine, record) {
        try {
            const afterImage = Buffer.from(record.afterImage, 'hex');
            await storageEngine.writePage(record.fileId, record.pageId, afterImage);
        } catch (error) {
            console.warn('Error replaying page write:', error.message);
        }
    }

    async checkpoint() {
        if (!this.isEnabled) {
            return;
        }

        // Record checkpoint
        await this.writeLogRecord({
            type: 'CHECKPOINT',
            checkpointLSN: this.logSequenceNumber
        });

        this.checkpointLSN = this.logSequenceNumber;
        
        // Create new log file for future writes
        await this.createNewLogFile();
        
        console.log('WAL checkpoint completed');
    }

    async truncateBeforeCheckpoint() {
        if (!this.walPath) {
            return;
        }

        try {
            const files = await fs.readdir(this.walPath);
            const logFiles = files
                .filter(f => f.startsWith('wal_') && f.endsWith('.log'))
                .sort();
            
            // Keep only files after checkpoint
            for (const file of logFiles) {
                const match = file.match(/wal_(\d+)\.log/);
                if (match) {
                    const fileLSN = parseInt(match[1]);
                    if (fileLSN < this.checkpointLSN) {
                        await fs.unlink(path.join(this.walPath, file));
                    }
                }
            }
        } catch (error) {
            console.warn('Error truncating old WAL files:', error.message);
        }
    }

    getStats() {
        return {
            currentLSN: this.logSequenceNumber,
            checkpointLSN: this.checkpointLSN,
            currentLogFile: this.currentLogFile,
            enabled: this.isEnabled
        };
    }

    async close() {
        // Perform final checkpoint
        if (this.isEnabled) {
            await this.checkpoint();
        }
        
        console.log('WAL closed');
    }
}
