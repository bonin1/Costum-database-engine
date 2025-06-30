/**
 * Query Planner - creates optimal execution plans
 */
export class QueryPlanner {
    constructor(options = {}) {
        this.schemaManager = options.schemaManager;
        this.storageEngine = options.storageEngine;
        this.stats = {
            plansCreated: 0,
            avgPlanTime: 0
        };
    }

    async createSelectPlan(ast) {
        const startTime = Date.now();
        
        try {
            const plan = new SelectPlan();
            
            // Add table scan
            const tableScan = await this.createTableScan(ast.from);
            plan.addOperation(tableScan);

            // Add where clause if present
            if (ast.where) {
                const filter = await this.createFilter(ast.where, ast.from.name);
                plan.addOperation(filter);
            }

            // Add join if present
            if (ast.join) {
                const join = await this.createJoin(ast.join, ast.from);
                plan.addOperation(join);
            }

            // Add group by if present
            if (ast.groupBy) {
                const groupBy = await this.createGroupBy(ast.groupBy, ast.from.name);
                plan.addOperation(groupBy);
            }

            // Add projection
            const projection = await this.createProjection(ast.columns, ast.from.name);
            plan.addOperation(projection);

            // Add order by if present
            if (ast.orderBy) {
                const sort = await this.createSort(ast.orderBy);
                plan.addOperation(sort);
            }

            // Add limit if present
            if (ast.limit) {
                const limit = await this.createLimit(ast.limit);
                plan.addOperation(limit);
            }

            // Optimize the plan
            await this.optimizePlan(plan);

            this.stats.plansCreated++;
            this.stats.avgPlanTime = (this.stats.avgPlanTime + (Date.now() - startTime)) / this.stats.plansCreated;

            return plan;
        } catch (error) {
            console.error('Error creating select plan:', error);
            throw error;
        }
    }

    async createUpdatePlan(ast) {
        const plan = new UpdatePlan();
        
        // Add table scan
        const tableScan = await this.createTableScan({ name: ast.tableName });
        plan.addOperation(tableScan);

        // Add where clause if present
        if (ast.where) {
            const filter = await this.createFilter(ast.where, ast.tableName);
            plan.addOperation(filter);
        }

        // Add update operation
        const update = await this.createUpdate(ast.assignments, ast.tableName);
        plan.addOperation(update);

        return plan;
    }

    async createDeletePlan(ast) {
        const plan = new DeletePlan();
        
        // Add table scan
        const tableScan = await this.createTableScan({ name: ast.tableName });
        plan.addOperation(tableScan);

        // Add where clause if present
        if (ast.where) {
            const filter = await this.createFilter(ast.where, ast.tableName);
            plan.addOperation(filter);
        }

        // Add delete operation
        const deleteOp = await this.createDelete(ast.tableName);
        plan.addOperation(deleteOp);

        return plan;
    }

    async createTableScan(fromClause) {
        const tableName = fromClause.name;
        const table = await this.schemaManager.getTable(tableName);
        
        if (!table) {
            throw new Error(`Table '${tableName}' not found`);
        }

        // Check for available indexes
        const indexes = await this.schemaManager.getTableIndexes(tableName);
        
        return new TableScanOperation({
            tableName,
            alias: fromClause.alias,
            table,
            indexes,
            estimatedRows: table.rowCount || 1000
        });
    }

    async createFilter(whereClause, tableName) {
        const table = await this.schemaManager.getTable(tableName);
        
        // Analyze filter for index usage
        const indexUsage = await this.analyzeFilterForIndexes(whereClause, tableName);
        
        return new FilterOperation({
            condition: whereClause,
            tableName,
            indexUsage,
            selectivity: this.estimateSelectivity(whereClause, table)
        });
    }

    async createJoin(joinClause, leftTable) {
        const rightTable = await this.schemaManager.getTable(joinClause.tableName);
        
        if (!rightTable) {
            throw new Error(`Table '${joinClause.tableName}' not found`);
        }

        // Choose join algorithm based on table sizes and indexes
        const joinAlgorithm = await this.chooseJoinAlgorithm(leftTable, rightTable, joinClause.condition);

        return new JoinOperation({
            joinType: joinClause.joinType,
            rightTable: joinClause.tableName,
            condition: joinClause.condition,
            algorithm: joinAlgorithm
        });
    }

    async createProjection(columns, tableName) {
        // Handle columns with expressions properly
        const resolvedColumns = [];
        
        for (const column of columns) {
            if (column.type === 'WILDCARD') {
                // Add wildcard marker - executor will handle expanding this
                resolvedColumns.push({
                    type: 'WILDCARD'
                });
            } else {
                resolvedColumns.push({
                    ...column,
                    tableName
                });
            }
        }

        return new ProjectionOperation({
            columns: resolvedColumns,
            tableName
        });
    }

    async createSort(orderByClause) {
        return new SortOperation({
            columns: orderByClause,
            algorithm: 'QUICKSORT' // Could choose based on data size
        });
    }

    async createLimit(limitValue) {
        return new LimitOperation({
            limit: limitValue.value || limitValue
        });
    }

    async createGroupBy(groupByClause, tableName) {
        return new GroupByOperation({
            columns: groupByClause,
            tableName
        });
    }

    async createUpdate(assignments, tableName) {
        return new UpdateOperation({
            tableName,
            assignments
        });
    }

    async createDelete(tableName) {
        return new DeleteOperation({
            tableName
        });
    }

    async analyzeFilterForIndexes(condition, tableName) {
        const indexes = await this.schemaManager.getTableIndexes(tableName);
        
        // Simple index analysis - in practice, this would be more sophisticated
        if (condition.type === 'BINARY' && condition.operator === '=') {
            const columnName = condition.left.name;
            
            for (const index of indexes) {
                if (index.columns.includes(columnName)) {
                    return {
                        indexName: index.name,
                        columns: [columnName],
                        type: 'EQUALITY'
                    };
                }
            }
        }

        return null;
    }

    estimateSelectivity(condition, table) {
        // Simple selectivity estimation
        if (condition.type === 'BINARY') {
            switch (condition.operator) {
                case '=':
                    return 0.1; // 10% selectivity for equality
                case '<':
                case '>':
                    return 0.3; // 30% for range
                default:
                    return 0.5; // 50% default
            }
        }
        
        return 0.5; // Default selectivity
    }

    async chooseJoinAlgorithm(leftTable, rightTable, condition) {
        // Simple join algorithm selection
        const leftSize = leftTable.rowCount || 1000;
        const rightSize = rightTable.rowCount || 1000;

        if (leftSize < 1000 && rightSize < 1000) {
            return 'NESTED_LOOP';
        } else if (leftSize > rightSize * 10) {
            return 'HASH_JOIN';
        } else {
            return 'SORT_MERGE';
        }
    }

    async optimizePlan(plan) {
        // Apply optimization rules
        this.pushDownFilters(plan);
        this.reorderJoins(plan);
        this.eliminateRedundantOperations(plan);
    }

    pushDownFilters(plan) {
        // Move filter operations closer to table scans
        // Simplified implementation
        console.log('Applying filter pushdown optimization');
    }

    reorderJoins(plan) {
        // Reorder joins for optimal execution
        // Simplified implementation
        console.log('Applying join reordering optimization');
    }

    eliminateRedundantOperations(plan) {
        // Remove unnecessary operations
        // Simplified implementation
        console.log('Eliminating redundant operations');
    }

    getStats() {
        return { ...this.stats };
    }
}

// Plan classes
class SelectPlan {
    constructor() {
        this.operations = [];
        this.estimatedCost = 0;
        this.estimatedRows = 0;
    }

    addOperation(operation) {
        this.operations.push(operation);
        this.estimatedCost += operation.estimatedCost || 1;
        this.estimatedRows = operation.estimatedRows || this.estimatedRows;
    }

    summary() {
        return {
            operationCount: this.operations.length,
            operations: this.operations.map(op => op.type),
            estimatedCost: this.estimatedCost,
            estimatedRows: this.estimatedRows
        };
    }

    explain() {
        return this.operations.map(op => op.explain());
    }

    getCost() {
        return this.estimatedCost;
    }

    getEstimatedRows() {
        return this.estimatedRows;
    }
}

class UpdatePlan extends SelectPlan {}
class DeletePlan extends SelectPlan {}

// Operation classes
class TableScanOperation {
    constructor(options) {
        this.type = 'TABLE_SCAN';
        this.tableName = options.tableName;
        this.alias = options.alias;
        this.estimatedRows = options.estimatedRows;
        this.estimatedCost = options.estimatedRows * 0.1; // Simple cost model
    }

    explain() {
        return `Table Scan on ${this.tableName} (est. rows: ${this.estimatedRows})`;
    }
}

class FilterOperation {
    constructor(options) {
        this.type = 'FILTER';
        this.condition = options.condition;
        this.tableName = options.tableName;
        this.indexUsage = options.indexUsage;
        this.selectivity = options.selectivity;
        this.estimatedCost = options.indexUsage ? 1 : 10; // Index usage is cheaper
    }

    explain() {
        const indexText = this.indexUsage ? ` using index ${this.indexUsage.indexName}` : '';
        return `Filter${indexText} (selectivity: ${this.selectivity})`;
    }
}

class JoinOperation {
    constructor(options) {
        this.type = 'JOIN';
        this.joinType = options.joinType;
        this.rightTable = options.rightTable;
        this.condition = options.condition;
        this.algorithm = options.algorithm;
        this.estimatedCost = this.getJoinCost(options.algorithm);
    }

    getJoinCost(algorithm) {
        switch (algorithm) {
            case 'NESTED_LOOP': return 100;
            case 'HASH_JOIN': return 50;
            case 'SORT_MERGE': return 75;
            default: return 100;
        }
    }

    explain() {
        return `${this.joinType} Join with ${this.rightTable} using ${this.algorithm}`;
    }
}

class ProjectionOperation {
    constructor(options) {
        this.type = 'PROJECTION';
        this.columns = options.columns;
        this.tableName = options.tableName;
        this.estimatedCost = this.columns.length * 0.1;
    }

    explain() {
        return `Project ${this.columns.length} columns`;
    }
}

class SortOperation {
    constructor(options) {
        this.type = 'SORT';
        this.columns = options.columns;
        this.algorithm = options.algorithm;
        this.estimatedCost = 10; // Simplified
    }

    explain() {
        return `Sort by ${this.columns.length} columns using ${this.algorithm}`;
    }
}

class LimitOperation {
    constructor(options) {
        this.type = 'LIMIT';
        this.limit = options.limit;
        this.estimatedCost = 1;
    }

    explain() {
        return `Limit to ${this.limit} rows`;
    }
}

class GroupByOperation {
    constructor(options) {
        this.type = 'GROUP_BY';
        this.columns = options.columns;
        this.tableName = options.tableName;
        this.estimatedCost = this.columns.length * 2; // Grouping has cost
    }

    explain() {
        return `Group by ${this.columns.length} columns`;
    }
}

class UpdateOperation {
    constructor(options) {
        this.type = 'UPDATE';
        this.tableName = options.tableName;
        this.assignments = options.assignments;
        this.estimatedCost = this.assignments.length;
    }

    explain() {
        return `Update ${this.assignments.length} columns in ${this.tableName}`;
    }
}

class DeleteOperation {
    constructor(options) {
        this.type = 'DELETE';
        this.tableName = options.tableName;
        this.estimatedCost = 5;
    }

    explain() {
        return `Delete from ${this.tableName}`;
    }
}
