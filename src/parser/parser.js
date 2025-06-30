import { Lexer } from './lexer.js';

/**
 * SQL Parser using recursive descent parsing
 */
export class Parser {
    constructor() {
        this.lexer = new Lexer();
        this.tokens = [];
        this.current = 0;
    }

    parse(sql) {
        this.tokens = this.lexer.tokenize(sql);
        this.current = 0;
        
        try {
            return this.parseStatement();
        } catch (error) {
            throw new Error(`Parse error: ${error.message}`);
        }
    }

    parseStatement() {
        const token = this.peek();
        
        if (!token) {
            throw new Error('Empty statement');
        }

        switch (token.type) {
            case 'SELECT':
                return this.parseSelect();
            case 'INSERT':
                return this.parseInsert();
            case 'UPDATE':
                return this.parseUpdate();
            case 'DELETE':
                return this.parseDelete();
            case 'CREATE':
                return this.parseCreate();
            case 'DROP':
                return this.parseDrop();
            default:
                throw new Error(`Unexpected token: ${token.value}`);
        }
    }

    parseSelect() {
        this.consume('SELECT');
        
        const columns = this.parseSelectList();
        
        this.consume('FROM');
        const from = this.parseFromClause();
        
        let where = null;
        if (this.match('WHERE')) {
            where = this.parseWhereClause();
        }

        let join = null;
        if (this.match('JOIN') || this.match('LEFT') || this.match('RIGHT') || this.match('INNER')) {
            join = this.parseJoinClause();
        }

        let groupBy = null;
        if (this.match('GROUP')) {
            this.consume('BY');
            groupBy = this.parseGroupByClause();
        }

        let orderBy = null;
        if (this.match('ORDER')) {
            this.consume('BY');
            orderBy = this.parseOrderByClause();
        }

        let limit = null;
        if (this.match('LIMIT')) {
            limit = this.parseExpression();
        }

        return {
            type: 'SELECT',
            columns,
            from,
            where,
            join,
            groupBy,
            orderBy,
            limit
        };
    }

    parseInsert() {
        this.consume('INSERT');
        this.consume('INTO');
        
        const tableName = this.consume('IDENTIFIER').value;
        
        let columns = null;
        if (this.match('(')) {
            columns = this.parseColumnList();
            this.consume(')');
        }

        this.consume('VALUES');
        this.consume('(');
        const values = this.parseValueList();
        this.consume(')');

        return {
            type: 'INSERT',
            tableName,
            columns,
            values
        };
    }

    parseUpdate() {
        this.consume('UPDATE');
        
        const tableName = this.consume('IDENTIFIER').value;
        
        this.consume('SET');
        const assignments = this.parseAssignmentList();
        
        let where = null;
        if (this.match('WHERE')) {
            where = this.parseWhereClause();
        }

        return {
            type: 'UPDATE',
            tableName,
            assignments,
            where
        };
    }

    parseDelete() {
        this.consume('DELETE');
        this.consume('FROM');
        
        const tableName = this.consume('IDENTIFIER').value;
        
        let where = null;
        if (this.match('WHERE')) {
            where = this.parseWhereClause();
        }

        return {
            type: 'DELETE',
            tableName,
            where
        };
    }

    parseCreate() {
        this.consume('CREATE');
        
        if (this.match('TABLE')) {
            return this.parseCreateTable();
        } else if (this.match('INDEX')) {
            return this.parseCreateIndex();
        } else {
            throw new Error('Expected TABLE or INDEX after CREATE');
        }
    }

    parseCreateTable() {
        const tableName = this.consume('IDENTIFIER').value;
        
        this.consume('(');
        const columns = this.parseColumnDefinitions();
        this.consume(')');

        return {
            type: 'CREATE_TABLE',
            tableName,
            columns
        };
    }

    parseCreateIndex() {
        const indexName = this.consume('IDENTIFIER').value;
        
        this.consume('ON');
        const tableName = this.consume('IDENTIFIER').value;
        
        this.consume('(');
        const columns = this.parseColumnList();
        this.consume(')');

        return {
            type: 'CREATE_INDEX',
            indexName,
            tableName,
            columns
        };
    }

    parseDrop() {
        this.consume('DROP');
        
        if (this.match('TABLE')) {
            const tableName = this.consume('IDENTIFIER').value;
            return {
                type: 'DROP_TABLE',
                tableName
            };
        } else if (this.match('INDEX')) {
            const indexName = this.consume('IDENTIFIER').value;
            return {
                type: 'DROP_INDEX',
                indexName
            };
        } else {
            throw new Error('Expected TABLE or INDEX after DROP');
        }
    }

    parseSelectList() {
        const columns = [];
        
        do {
            if (this.match('*')) {
                columns.push({ type: 'WILDCARD' });
            } else {
                const expr = this.parseExpression();
                let alias = null;
                
                if (this.match('AS')) {
                    alias = this.consume('IDENTIFIER').value;
                } else if (this.peek() && this.peek().type === 'IDENTIFIER' && 
                          !['FROM', 'WHERE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT'].includes(this.peek().value.toUpperCase())) {
                    // Handle alias without AS keyword
                    alias = this.advance().value;
                }
                
                columns.push({
                    type: 'COLUMN',
                    expression: expr,
                    alias
                });
            }
        } while (this.match(','));

        return columns;
    }

    parseFromClause() {
        const tableName = this.consume('IDENTIFIER').value;
        let alias = null;
        
        if (this.peek() && this.peek().type === 'IDENTIFIER') {
            alias = this.advance().value;
        }

        return {
            type: 'TABLE',
            name: tableName,
            alias
        };
    }

    parseWhereClause() {
        return this.parseExpression();
    }

    parseJoinClause() {
        let joinType = 'INNER';
        
        if (this.previous().value === 'LEFT') {
            joinType = 'LEFT';
            this.consume('JOIN');
        } else if (this.previous().value === 'RIGHT') {
            joinType = 'RIGHT';
            this.consume('JOIN');
        } else if (this.previous().value === 'INNER') {
            this.consume('JOIN');
        }

        const tableName = this.consume('IDENTIFIER').value;
        let alias = null;
        
        if (this.peek() && this.peek().type === 'IDENTIFIER' && this.peek().value.toUpperCase() !== 'ON') {
            alias = this.advance().value;
        }
        
        this.consume('ON');
        const condition = this.parseExpression();

        return {
            type: 'JOIN',
            joinType,
            tableName,
            alias,
            condition
        };
    }

    parseOrderByClause() {
        const columns = [];
        
        do {
            const column = this.consume('IDENTIFIER').value;
            let direction = 'ASC';
            
            if (this.match('ASC') || this.match('DESC')) {
                direction = this.previous().value;
            }
            
            columns.push({ column, direction });
        } while (this.match(','));

        return columns;
    }

    parseGroupByClause() {
        const columns = [];
        
        do {
            const expr = this.parseExpression();
            columns.push(expr);
        } while (this.match(','));

        return columns;
    }

    parseColumnDefinitions() {
        const columns = [];
        
        do {
            const name = this.consume('IDENTIFIER').value;
            const dataType = this.parseDataType();
            
            const constraints = [];
            while (this.match('PRIMARY', 'UNIQUE', 'NOT', 'DEFAULT', 'NULL')) {
                const constraint = this.parseConstraint();
                if (constraint) {
                    constraints.push(constraint);
                }
            }

            columns.push({
                name,
                dataType,
                constraints
            });
        } while (this.match(','));

        return columns;
    }

    parseDataType() {
        // Accept either IDENTIFIER or keyword for data types
        let typeToken;
        const currentToken = this.peek();
        
        if (currentToken && (currentToken.type === 'IDENTIFIER' || 
            ['INT', 'INTEGER', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'FLOAT', 
             'DOUBLE', 'DECIMAL', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP'].includes(currentToken.value.toUpperCase()))) {
            typeToken = this.advance();
        } else {
            throw new Error(`Expected data type, got ${currentToken?.type || 'EOF'}`);
        }
        
        const type = typeToken.value.toUpperCase();
        
        let size = null;
        if (this.match('(')) {
            size = parseInt(this.consume('NUMBER').value);
            this.consume(')');
        }

        return { type, size };
    }

    parseConstraint() {
        const token = this.previous();
        
        switch (token.value.toUpperCase()) {
            case 'PRIMARY':
                this.consume('KEY');
                return { type: 'PRIMARY_KEY' };
            case 'UNIQUE':
                return { type: 'UNIQUE' };
            case 'NOT':
                if (this.match('NULL')) {
                    return { type: 'NOT_NULL' };
                } else {
                    // Put the token back and return null
                    this.current--;
                    return null;
                }
            case 'NULL':
                return { type: 'NULL' };
            case 'DEFAULT': {
                const value = this.parseExpression();
                return { type: 'DEFAULT', value };
            }
            default:
                return null;
        }
    }

    parseColumnList() {
        const columns = [];
        
        do {
            columns.push(this.consume('IDENTIFIER').value);
        } while (this.match(','));

        return columns;
    }

    parseValueList() {
        const values = [];
        
        do {
            values.push(this.parseExpression());
        } while (this.match(','));

        return values;
    }

    parseAssignmentList() {
        const assignments = [];
        
        do {
            const column = this.consume('IDENTIFIER').value;
            this.consume('=');
            const value = this.parseExpression();
            
            assignments.push({ column, value });
        } while (this.match(','));

        return assignments;
    }

    parseExpression() {
        return this.parseComparison();
    }

    parseComparison() {
        let expr = this.parseTerm();

        while (this.match('=', '!=', '<>', '<', '>', '<=', '>=')) {
            const operator = this.previous().value;
            const right = this.parseTerm();
            expr = {
                type: 'BINARY',
                left: expr,
                operator,
                right
            };
        }

        return expr;
    }

    parseTerm() {
        return this.parsePrimary();
    }

    parsePrimary() {
        if (this.match('NUMBER')) {
            return {
                type: 'LITERAL',
                dataType: 'NUMBER',
                value: parseFloat(this.previous().value)
            };
        }

        if (this.match('STRING')) {
            return {
                type: 'LITERAL',
                dataType: 'STRING',
                value: this.previous().value
            };
        }

        // Check for aggregate functions and other identifiers
        const aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];
        let identifier = null;
        
        if (this.match('IDENTIFIER')) {
            identifier = this.previous().value;
        } else {
            // Check for aggregate function keywords
            for (const func of aggregateFunctions) {
                if (this.match(func)) {
                    identifier = this.previous().value;
                    break;
                }
            }
        }
        
        if (identifier) {
            // Check for function call
            if (this.match('(')) {
                const args = [];
                
                if (!this.check(')')) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.match(','));
                }
                
                this.consume(')');
                
                return {
                    type: 'FUNCTION',
                    name: identifier.toUpperCase(),
                    arguments: args
                };
            }
            
            // Check for qualified column name (table.column)
            if (this.match('.')) {
                const columnName = this.consume('IDENTIFIER').value;
                return {
                    type: 'QUALIFIED_COLUMN',
                    table: identifier,
                    column: columnName,
                    name: `${identifier}.${columnName}`
                };
            }
            
            return {
                type: 'COLUMN',
                name: identifier
            };
        }

        if (this.match('(')) {
            const expr = this.parseExpression();
            this.consume(')');
            return expr;
        }

        throw new Error(`Unexpected token: ${this.peek()?.value}`);
    }

    // Utility methods
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    check(type) {
        if (this.isAtEnd()) return false;
        return this.peek().type === type || this.peek().value === type;
    }

    advance() {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    isAtEnd() {
        return this.current >= this.tokens.length;
    }

    peek() {
        return this.tokens[this.current];
    }

    previous() {
        return this.tokens[this.current - 1];
    }

    consume(type) {
        if (this.check(type)) {
            return this.advance();
        }

        const current = this.peek();
        throw new Error(`Expected ${type}, got ${current?.type || 'EOF'}`);
    }
}
