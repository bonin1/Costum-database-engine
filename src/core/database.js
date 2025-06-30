import fs from 'fs/promises';
import path from 'path';
import { StorageEngine } from './storage/storage-engine.js';
import { TransactionManager } from './transactions/transaction-manager.js';
import { SchemaManager } from '../schema/schema-manager.js';
import { QueryEngine } from '../query/query-engine.js';
import { Parser } from '../parser/parser.js';
import { WAL } from './wal/wal.js';

/**
 * Main Database class that orchestrates all components
 */
export class Database {
    constructor(options = {}) {
        this.dataPath = options.dataPath || './data';
        this.pageSize = options.pageSize || 4096;
        this.bufferPoolSize = options.bufferPoolSize || 100;
        this.walEnabled = options.walEnabled !== false;
        
        // Core components
        this.storageEngine = null;
        this.transactionManager = null;
        this.schemaManager = null;
        this.queryEngine = null;
        this.parser = null;
        this.wal = null;
        
        this.isInitialized = false;
        this.isClosing = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Ensure data directory exists
            await this.ensureDataDirectory();

            // Initialize Write-Ahead Log first
            if (this.walEnabled) {
                this.wal = new WAL(path.join(this.dataPath, 'wal'));
                await this.wal.initialize();
            }

            // Initialize storage engine
            this.storageEngine = new StorageEngine({
                dataPath: this.dataPath,
                pageSize: this.pageSize,
                bufferPoolSize: this.bufferPoolSize
            });
            await this.storageEngine.initialize();

            // Initialize schema manager
            this.schemaManager = new SchemaManager(this.storageEngine);
            await this.schemaManager.initialize();

            // Initialize transaction manager
            this.transactionManager = new TransactionManager({
                storageEngine: this.storageEngine,
                wal: this.wal,
                schemaManager: this.schemaManager
            });

            // Initialize query engine
            this.queryEngine = new QueryEngine({
                storageEngine: this.storageEngine,
                schemaManager: this.schemaManager,
                transactionManager: this.transactionManager
            });

            // Initialize SQL parser
            this.parser = new Parser();

            // Perform crash recovery if needed
            if (this.walEnabled) {
                await this.performRecovery();
            }

            this.isInitialized = true;
            console.log('Database components initialized successfully');
        } catch (error) {
            console.error('Error initializing database:', error);
            throw error;
        }
    }

    async ensureDataDirectory() {
        try {
            await fs.access(this.dataPath);
        } catch {
            await fs.mkdir(this.dataPath, { recursive: true });
        }
    }

    async performRecovery() {
        if (!this.wal) return;
        
        console.log('Performing crash recovery...');
        const recoveryNeeded = await this.wal.needsRecovery();
        
        if (recoveryNeeded) {
            console.log('Recovery needed, replaying WAL entries...');
            await this.wal.replay(this.storageEngine);
            console.log('Recovery completed');
        }
    }

    /**
     * Execute a SQL statement
     */
    async execute(sql, parameters = [], transactionId = null) {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }

        try {
            // Parse SQL statement
            const ast = this.parser.parse(sql);
            
            // Execute through query engine
            const result = await this.queryEngine.execute(ast, parameters, transactionId);
            
            return result;
        } catch (error) {
            console.error('Error executing SQL:', error);
            throw error;
        }
    }

    /**
     * Begin a new transaction
     */
    async beginTransaction() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }

        return await this.transactionManager.begin();
    }

    /**
     * Get database statistics
     */
    async getStats() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }

        return {
            tables: await this.schemaManager.getTableCount(),
            indexes: await this.schemaManager.getIndexCount(),
            pages: await this.storageEngine.getPageCount(),
            transactions: this.transactionManager.getActiveTransactionCount(),
            bufferPool: this.storageEngine.getBufferPoolStats()
        };
    }

    /**
     * Get schema information
     */
    async getSchema() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }

        return await this.schemaManager.getSchema();
    }

    /**
     * Checkpoint the database (flush all dirty pages)
     */
    async checkpoint() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized');
        }

        await this.storageEngine.checkpoint();
        
        if (this.wal) {
            await this.wal.checkpoint();
        }
    }

    /**
     * Close the database
     */
    async close() {
        if (this.isClosing || !this.isInitialized) {
            return;
        }

        this.isClosing = true;

        try {
            // Commit any pending transactions
            await this.transactionManager.closeAll();

            // Perform final checkpoint
            await this.checkpoint();

            // Close all components
            if (this.wal) {
                await this.wal.close();
            }
            
            await this.storageEngine.close();

            this.isInitialized = false;
            console.log('Database closed successfully');
        } catch (error) {
            console.error('Error closing database:', error);
            throw error;
        }
    }
}
