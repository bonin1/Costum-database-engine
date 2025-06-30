/**
 * Query Executor - executes query plans
 */
export class QueryExecutor {
    constructor(options = {}) {
        this.storageEngine = options.storageEngine;
        this.schemaManager = options.schemaManager;
        this.stats = {
            queriesExecuted: 0,
            totalExecutionTime: 0,
            avgExecutionTime: 0
        };
    }

    async executeSelect(plan, parameters = [], transaction = null) {
        const startTime = Date.now();
        
        try {
            let rows = [];
            
            // Execute plan operations in sequence
            for (const operation of plan.operations) {
                switch (operation.type) {
                    case 'TABLE_SCAN':
                        rows = await this.executeTableScan(operation);
                        break;
                    case 'FILTER':
                        rows = await this.executeFilter(operation, rows);
                        break;
                    case 'JOIN':
                        rows = await this.executeJoin(operation, rows);
                        break;
                    case 'GROUP_BY':
                        rows = await this.executeGroupBy(operation, rows);
                        break;
                    case 'PROJECTION':
                        rows = await this.executeProjection(operation, rows);
                        break;
                    case 'SORT':
                        rows = await this.executeSort(operation, rows);
                        break;
                    case 'LIMIT':
                        rows = await this.executeLimit(operation, rows);
                        break;
                    default:
                        console.warn(`Unknown operation type: ${operation.type}`);
                }
            }

            const executionTime = Date.now() - startTime;
            this.updateStats(executionTime);

            return {
                rows,
                executionTime
            };
        } catch (error) {
            console.error('Error executing SELECT:', error);
            throw error;
        }
    }

    async executeInsert(ast, parameters = [], transaction = null) {
        const startTime = Date.now();
        
        try {
            // Simulate insert operation
            const insertId = Math.floor(Math.random() * 1000000);
            
            const executionTime = Date.now() - startTime;
            this.updateStats(executionTime);

            return {
                rowsAffected: 1,
                insertId,
                executionTime
            };
        } catch (error) {
            console.error('Error executing INSERT:', error);
            throw error;
        }
    }

    async executeUpdate(plan, parameters = [], transaction = null) {
        const startTime = Date.now();
        
        try {
            // Simulate update operation
            const rowsAffected = Math.floor(Math.random() * 10) + 1;
            
            const executionTime = Date.now() - startTime;
            this.updateStats(executionTime);

            return {
                rowsAffected,
                executionTime
            };
        } catch (error) {
            console.error('Error executing UPDATE:', error);
            throw error;
        }
    }

    async executeDelete(plan, parameters = [], transaction = null) {
        const startTime = Date.now();
        
        try {
            // Simulate delete operation
            const rowsAffected = Math.floor(Math.random() * 5) + 1;
            
            const executionTime = Date.now() - startTime;
            this.updateStats(executionTime);

            return {
                rowsAffected,
                executionTime
            };
        } catch (error) {
            console.error('Error executing DELETE:', error);
            throw error;
        }
    }

    async executeTableScan(operation) {
        // Simulate table scan by returning sample data
        const sampleData = this.generateSampleData(operation.tableName, operation.estimatedRows || 10);
        return sampleData;
    }

    async executeFilter(operation, rows) {
        // Apply filter condition
        return rows.filter(row => this.evaluateCondition(operation.condition, row));
    }

    async executeJoin(operation, leftRows) {
        // Simulate join operation
        const rightRows = this.generateSampleData(operation.rightTable, 5);
        const joinedRows = [];

        for (const leftRow of leftRows) {
            for (const rightRow of rightRows) {
                if (this.evaluateJoinCondition(operation.condition, leftRow, rightRow)) {
                    joinedRows.push({ ...leftRow, ...rightRow });
                }
            }
        }

        return joinedRows;
    }

    async executeGroupBy(operation, rows) {
        // Group rows by the specified columns
        const groups = new Map();
        
        for (const row of rows) {
            // Create group key from specified columns
            const groupKey = operation.columns.map(col => {
                return this.evaluateExpression(col, row);
            }).join('|');
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey).push(row);
        }

        // Convert groups back to rows
        const groupedRows = [];
        for (const [, groupRows] of groups) {
            // For now, just return the first row of each group
            // The actual aggregation will be handled in projection
            const representativeRow = { ...groupRows[0] };
            representativeRow._groupRows = groupRows; // Store group for aggregation
            groupedRows.push(representativeRow);
        }

        return groupedRows;
    }

    async executeProjection(operation, rows) {
        // Project only specified columns
        return rows.map(row => {
            const projectedRow = {};
            
            for (const column of operation.columns) {
                if (column.type === 'WILDCARD') {
                    // Include all columns
                    Object.assign(projectedRow, row);
                } else if (column.expression) {
                    const value = this.evaluateExpression(column.expression, row);
                    const columnName = column.alias || this.getColumnDisplayName(column.expression);
                    projectedRow[columnName] = value;
                }
            }
            
            return projectedRow;
        });
    }

    evaluateExpression(expr, row) {
        switch (expr.type) {
            case 'COLUMN':
                return row[expr.name];
            case 'QUALIFIED_COLUMN':
                // For qualified columns, try both qualified and unqualified names
                return row[expr.name] || row[expr.column];
            case 'LITERAL':
                return expr.value;
            case 'FUNCTION':
                return this.evaluateFunction(expr, row);
            case 'BINARY': {
                const left = this.evaluateExpression(expr.left, row);
                const right = this.evaluateExpression(expr.right, row);
                return this.evaluateBinaryOperation(expr.operator, left, right);
            }
            default:
                console.warn(`Unknown expression type: ${expr.type}`);
                return null;
        }
    }

    evaluateFunction(func, row) {
        const groupRows = row._groupRows || [row];
        
        switch (func.name) {
            case 'COUNT':
                if (func.arguments.length > 0 && func.arguments[0].type === 'COLUMN') {
                    // COUNT(column) - count non-null values
                    const columnName = func.arguments[0].name;
                    return groupRows.filter(r => r[columnName] != null).length;
                } else {
                    // COUNT(*) - count all rows
                    return groupRows.length;
                }
            case 'SUM':
                if (func.arguments.length > 0) {
                    const columnName = func.arguments[0].name;
                    return groupRows.reduce((sum, r) => {
                        const value = r[columnName];
                        return sum + (typeof value === 'number' ? value : 0);
                    }, 0);
                }
                return 0;
            case 'AVG':
                if (func.arguments.length > 0) {
                    const columnName = func.arguments[0].name;
                    const values = groupRows.map(r => r[columnName]).filter(v => typeof v === 'number');
                    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
                }
                return 0;
            case 'MAX':
                if (func.arguments.length > 0) {
                    const columnName = func.arguments[0].name;
                    const values = groupRows.map(r => r[columnName]).filter(v => v != null);
                    return values.length > 0 ? Math.max(...values) : null;
                }
                return null;
            case 'MIN':
                if (func.arguments.length > 0) {
                    const columnName = func.arguments[0].name;
                    const values = groupRows.map(r => r[columnName]).filter(v => v != null);
                    return values.length > 0 ? Math.min(...values) : null;
                }
                return null;
            default:
                console.warn(`Unknown function: ${func.name}`);
                return null;
        }
    }

    evaluateBinaryOperation(operator, left, right) {
        switch (operator) {
            case '=': return left === right;
            case '!=': 
            case '<>': return left !== right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            default:
                console.warn(`Unknown operator: ${operator}`);
                return false;
        }
    }

    getColumnDisplayName(expr) {
        switch (expr.type) {
            case 'COLUMN':
                return expr.name;
            case 'QUALIFIED_COLUMN':
                return expr.column;
            case 'FUNCTION':
                return expr.name.toLowerCase() + '(' + expr.arguments.map(arg => this.getColumnDisplayName(arg)).join(', ') + ')';
            default:
                return 'value';
        }
    }

    async executeSort(operation, rows) {
        // Sort rows based on specified columns
        return rows.sort((a, b) => {
            for (const sortCol of operation.columns) {
                const aVal = a[sortCol.column];
                const bVal = b[sortCol.column];
                
                let comparison = 0;
                if (aVal < bVal) comparison = -1;
                else if (aVal > bVal) comparison = 1;
                
                if (sortCol.direction === 'DESC') {
                    comparison *= -1;
                }
                
                if (comparison !== 0) {
                    return comparison;
                }
            }
            return 0;
        });
    }

    async executeLimit(operation, rows) {
        // Limit number of rows
        return rows.slice(0, operation.limit);
    }

    evaluateCondition(condition, row) {
        if (condition.type === 'BINARY') {
            const leftValue = this.getValue(condition.left, row);
            const rightValue = this.getValue(condition.right, row);
            
            switch (condition.operator) {
                case '=':
                    return leftValue === rightValue;
                case '!=':
                case '<>':
                    return leftValue !== rightValue;
                case '<':
                    return leftValue < rightValue;
                case '>':
                    return leftValue > rightValue;
                case '<=':
                    return leftValue <= rightValue;
                case '>=':
                    return leftValue >= rightValue;
                default:
                    return true;
            }
        }
        
        return true;
    }

    evaluateJoinCondition(condition, leftRow, rightRow) {
        // Simplified join condition evaluation
        return true; // For demonstration
    }

    getValue(expression, row) {
        if (typeof expression === 'string') {
            return row[expression];
        }
        
        return this.evaluateExpression(expression, row);
    }

    generateSampleData(tableName, count) {
        const data = [];
        
        for (let i = 1; i <= count; i++) {
            switch (tableName) {
                case 'users':
                    data.push({
                        id: i,
                        name: `User ${i}`,
                        email: `user${i}@example.com`,
                        age: 20 + (i % 40)
                    });
                    break;
                case 'posts':
                    data.push({
                        id: i,
                        user_id: (i % 5) + 1,
                        title: `Post ${i}`,
                        content: `Content for post ${i}`,
                        created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
                    });
                    break;
                default:
                    data.push({
                        id: i,
                        value: `Sample ${i}`,
                        created_at: new Date().toISOString()
                    });
            }
        }
        
        return data;
    }

    updateStats(executionTime) {
        this.stats.queriesExecuted++;
        this.stats.totalExecutionTime += executionTime;
        this.stats.avgExecutionTime = this.stats.totalExecutionTime / this.stats.queriesExecuted;
    }

    getStats() {
        return { ...this.stats };
    }
}
