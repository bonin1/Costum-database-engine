import { Transaction } from './transaction.js';

/**
 * Transaction Manager - handles ACID transactions
 */
export class TransactionManager {
    constructor(options = {}) {
        this.storageEngine = options.storageEngine;
        this.wal = options.wal;
        this.schemaManager = options.schemaManager;
        
        this.activeTransactions = new Map();
        this.nextTransactionId = 1;
        this.lockManager = new LockManager();
    }

    async begin() {
        const transactionId = this.nextTransactionId++;
        const transaction = new Transaction({
            id: transactionId,
            storageEngine: this.storageEngine,
            wal: this.wal,
            schemaManager: this.schemaManager,
            lockManager: this.lockManager
        });

        this.activeTransactions.set(transactionId, transaction);
        
        // Log transaction begin
        if (this.wal) {
            await this.wal.logTransaction(transactionId, 'BEGIN', {});
        }

        console.log(`Transaction ${transactionId} started`);
        return transaction;
    }

    async commit(transactionId) {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        try {
            // Commit the transaction
            await transaction.commit();
            
            // Log transaction commit
            if (this.wal) {
                await this.wal.logTransaction(transactionId, 'COMMIT', {});
            }

            // Remove from active transactions
            this.activeTransactions.delete(transactionId);
            
            console.log(`Transaction ${transactionId} committed`);
        } catch (error) {
            console.error(`Error committing transaction ${transactionId}:`, error);
            await this.rollback(transactionId);
            throw error;
        }
    }

    async rollback(transactionId) {
        const transaction = this.activeTransactions.get(transactionId);
        if (!transaction) {
            throw new Error(`Transaction ${transactionId} not found`);
        }

        try {
            // Rollback the transaction
            await transaction.rollback();
            
            // Log transaction rollback
            if (this.wal) {
                await this.wal.logTransaction(transactionId, 'ROLLBACK', {});
            }

            // Remove from active transactions
            this.activeTransactions.delete(transactionId);
            
            console.log(`Transaction ${transactionId} rolled back`);
        } catch (error) {
            console.error(`Error rolling back transaction ${transactionId}:`, error);
            throw error;
        }
    }

    getTransaction(transactionId) {
        return this.activeTransactions.get(transactionId);
    }

    getActiveTransactionCount() {
        return this.activeTransactions.size;
    }

    async closeAll() {
        // Rollback only active transactions
        for (const [transactionId] of this.activeTransactions) {
            try {
                const transaction = this.transactions.get(transactionId);
                if (transaction && transaction.state === 'ACTIVE') {
                    await this.rollback(transactionId);
                }
            } catch (error) {
                console.error(`Error closing transaction ${transactionId}:`, error);
            }
        }
    }
}

/**
 * Simple Lock Manager for concurrency control
 */
class LockManager {
    constructor() {
        this.locks = new Map(); // resource -> { mode, holders }
        this.waitingQueue = new Map(); // resource -> queue of waiting transactions
    }

    async acquireLock(transactionId, resource, mode = 'EXCLUSIVE') {
        const lockKey = `${resource.type}:${resource.id}`;
        
        // Check if lock is available
        if (!this.locks.has(lockKey)) {
            this.locks.set(lockKey, {
                mode,
                holders: new Set([transactionId])
            });
            return true;
        }

        const currentLock = this.locks.get(lockKey);
        
        // Check if compatible
        if (this.isCompatible(currentLock.mode, mode)) {
            currentLock.holders.add(transactionId);
            return true;
        }

        // Need to wait
        return new Promise((resolve, reject) => {
            if (!this.waitingQueue.has(lockKey)) {
                this.waitingQueue.set(lockKey, []);
            }
            
            this.waitingQueue.get(lockKey).push({
                transactionId,
                mode,
                resolve,
                reject
            });
        });
    }

    releaseLock(transactionId, resource) {
        const lockKey = `${resource.type}:${resource.id}`;
        
        if (!this.locks.has(lockKey)) {
            return;
        }

        const currentLock = this.locks.get(lockKey);
        currentLock.holders.delete(transactionId);

        // If no more holders, grant waiting locks
        if (currentLock.holders.size === 0) {
            this.locks.delete(lockKey);
            this.grantWaitingLocks(lockKey);
        }
    }

    releaseAllLocks(transactionId) {
        // Release all locks held by this transaction
        for (const [lockKey, lock] of this.locks) {
            if (lock.holders.has(transactionId)) {
                lock.holders.delete(transactionId);
                
                if (lock.holders.size === 0) {
                    this.locks.delete(lockKey);
                    this.grantWaitingLocks(lockKey);
                }
            }
        }
    }

    grantWaitingLocks(lockKey) {
        const waitingQueue = this.waitingQueue.get(lockKey);
        if (!waitingQueue || waitingQueue.length === 0) {
            return;
        }

        // Grant compatible locks from the queue
        const granted = [];
        let mode = null;

        for (let i = 0; i < waitingQueue.length; i++) {
            const waiting = waitingQueue[i];
            
            if (mode === null || this.isCompatible(mode, waiting.mode)) {
                mode = waiting.mode;
                this.locks.set(lockKey, {
                    mode,
                    holders: new Set([waiting.transactionId])
                });
                
                waiting.resolve(true);
                granted.push(i);
            }
        }

        // Remove granted requests from queue
        for (let i = granted.length - 1; i >= 0; i--) {
            waitingQueue.splice(granted[i], 1);
        }

        if (waitingQueue.length === 0) {
            this.waitingQueue.delete(lockKey);
        }
    }

    isCompatible(mode1, mode2) {
        return mode1 === 'SHARED' && mode2 === 'SHARED';
    }
}
