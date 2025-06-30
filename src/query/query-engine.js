import { QueryPlanner } from './query-planner.js';
import { QueryExecutor } from './query-executor.js';

/**
 * Query Engine - processes parsed SQL statements
 */
export class QueryEngine {
    constructor(options = {}) {
        this.storageEngine = options.storageEngine;
        this.schemaManager = options.schemaManager;
        this.transactionManager = options.transactionManager;
        
        this.planner = new QueryPlanner({
            schemaManager: this.schemaManager,
            storageEngine: this.storageEngine
        });
        
        this.executor = new QueryExecutor({
            storageEngine: this.storageEngine,
            schemaManager: this.schemaManager
        });
    }

    async execute(ast, parameters = [], transactionId = null) {
        try {
            // Get transaction if provided
            let transaction = null;
            if (transactionId) {
                transaction = this.transactionManager.getTransaction(transactionId);
                if (!transaction) {
                    throw new Error(`Transaction ${transactionId} not found`);
                }
            }

            // Handle different statement types
            switch (ast.type) {
                case 'SELECT':
                    return await this.executeSelect(ast, parameters, transaction);
                case 'INSERT':
                    return await this.executeInsert(ast, parameters, transaction);
                case 'UPDATE':
                    return await this.executeUpdate(ast, parameters, transaction);
                case 'DELETE':
                    return await this.executeDelete(ast, parameters, transaction);
                case 'CREATE_TABLE':
                    return await this.executeCreateTable(ast, transaction);
                case 'CREATE_INDEX':
                    return await this.executeCreateIndex(ast, transaction);
                case 'DROP_TABLE':
                    return await this.executeDropTable(ast, transaction);
                case 'DROP_INDEX':
                    return await this.executeDropIndex(ast, transaction);
                default:
                    throw new Error(`Unsupported statement type: ${ast.type}`);
            }
        } catch (error) {
            console.error('Query execution error:', error);
            throw error;
        }
    }

    async executeSelect(ast, parameters, transaction) {
        // Create query plan
        const plan = await this.planner.createSelectPlan(ast);
        
        // Execute the plan
        const result = await this.executor.executeSelect(plan, parameters, transaction);
        
        return {
            type: 'SELECT',
            success: true,
            rows: result.rows,
            rowCount: result.rows.length,
            executionTime: result.executionTime,
            plan: plan.summary()
        };
    }

    async executeInsert(ast, parameters, transaction) {
        // Validate table exists
        const table = await this.schemaManager.getTable(ast.tableName);
        if (!table) {
            throw new Error(`Table '${ast.tableName}' does not exist`);
        }

        // Execute insert
        const result = await this.executor.executeInsert(ast, parameters, transaction);
        
        return {
            type: 'INSERT',
            success: true,
            rowsAffected: result.rowsAffected,
            insertId: result.insertId,
            executionTime: result.executionTime
        };
    }

    async executeUpdate(ast, parameters, transaction) {
        // Validate table exists
        const table = await this.schemaManager.getTable(ast.tableName);
        if (!table) {
            throw new Error(`Table '${ast.tableName}' does not exist`);
        }

        // Create update plan
        const plan = await this.planner.createUpdatePlan(ast);
        
        // Execute update
        const result = await this.executor.executeUpdate(plan, parameters, transaction);
        
        return {
            type: 'UPDATE',
            success: true,
            rowsAffected: result.rowsAffected,
            executionTime: result.executionTime
        };
    }

    async executeDelete(ast, parameters, transaction) {
        // Validate table exists
        const table = await this.schemaManager.getTable(ast.tableName);
        if (!table) {
            throw new Error(`Table '${ast.tableName}' does not exist`);
        }

        // Create delete plan
        const plan = await this.planner.createDeletePlan(ast);
        
        // Execute delete
        const result = await this.executor.executeDelete(plan, parameters, transaction);
        
        return {
            type: 'DELETE',
            success: true,
            rowsAffected: result.rowsAffected,
            executionTime: result.executionTime
        };
    }

    async executeCreateTable(ast, transaction) {
        // Check if table already exists
        const existingTable = await this.schemaManager.getTable(ast.tableName);
        if (existingTable) {
            throw new Error(`Table '${ast.tableName}' already exists`);
        }

        // Create table
        await this.schemaManager.createTable(ast.tableName, ast.columns, transaction);
        
        return {
            type: 'CREATE_TABLE',
            success: true,
            tableName: ast.tableName,
            message: `Table '${ast.tableName}' created successfully`
        };
    }

    async executeCreateIndex(ast, transaction) {
        // Validate table exists
        const table = await this.schemaManager.getTable(ast.tableName);
        if (!table) {
            throw new Error(`Table '${ast.tableName}' does not exist`);
        }

        // Check if index already exists
        const existingIndex = await this.schemaManager.getIndex(ast.indexName);
        if (existingIndex) {
            throw new Error(`Index '${ast.indexName}' already exists`);
        }

        // Create index
        await this.schemaManager.createIndex(ast.indexName, ast.tableName, ast.columns, transaction);
        
        return {
            type: 'CREATE_INDEX',
            success: true,
            indexName: ast.indexName,
            message: `Index '${ast.indexName}' created successfully`
        };
    }

    async executeDropTable(ast, transaction) {
        // Check if table exists
        const table = await this.schemaManager.getTable(ast.tableName);
        if (!table) {
            throw new Error(`Table '${ast.tableName}' does not exist`);
        }

        // Drop table
        await this.schemaManager.dropTable(ast.tableName, transaction);
        
        return {
            type: 'DROP_TABLE',
            success: true,
            tableName: ast.tableName,
            message: `Table '${ast.tableName}' dropped successfully`
        };
    }

    async executeDropIndex(ast, transaction) {
        // Check if index exists
        const index = await this.schemaManager.getIndex(ast.indexName);
        if (!index) {
            throw new Error(`Index '${ast.indexName}' does not exist`);
        }

        // Drop index
        await this.schemaManager.dropIndex(ast.indexName, transaction);
        
        return {
            type: 'DROP_INDEX',
            success: true,
            indexName: ast.indexName,
            message: `Index '${ast.indexName}' dropped successfully`
        };
    }

    /**
     * Explain query execution plan
     */
    async explain(ast) {
        switch (ast.type) {
            case 'SELECT':
                const plan = await this.planner.createSelectPlan(ast);
                return {
                    type: 'EXPLAIN',
                    statement: ast.type,
                    plan: plan.explain(),
                    estimatedCost: plan.getCost(),
                    estimatedRows: plan.getEstimatedRows()
                };
            default:
                return {
                    type: 'EXPLAIN',
                    statement: ast.type,
                    message: 'EXPLAIN not supported for this statement type'
                };
        }
    }

    /**
     * Get query statistics
     */
    getStats() {
        return {
            planner: this.planner.getStats(),
            executor: this.executor.getStats()
        };
    }
}
