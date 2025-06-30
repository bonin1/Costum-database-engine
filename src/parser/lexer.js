/**
 * SQL Lexer - tokenizes SQL statements
 */
export class Lexer {
    constructor() {
        this.keywords = new Set([
            'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
            'DELETE', 'CREATE', 'TABLE', 'INDEX', 'DROP', 'ALTER', 'PRIMARY', 'KEY',
            'FOREIGN', 'REFERENCES', 'UNIQUE', 'NOT', 'NULL', 'DEFAULT', 'AUTO_INCREMENT',
            'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'ORDER', 'BY',
            'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'AND', 'OR',
            'INT', 'INTEGER', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'FLOAT', 'DOUBLE',
            'DECIMAL', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'COUNT', 'SUM', 'AVG',
            'MAX', 'MIN'
        ]);
    }

    tokenize(sql) {
        const tokens = [];
        let current = 0;
        
        while (current < sql.length) {
            let char = sql[current];

            // Skip whitespace
            if (this.isWhitespace(char)) {
                current++;
                continue;
            }

            // Skip comments
            if (char === '-' && sql[current + 1] === '-') {
                // Single line comment
                while (current < sql.length && sql[current] !== '\n') {
                    current++;
                }
                continue;
            }

            if (char === '/' && sql[current + 1] === '*') {
                // Multi-line comment
                current += 2;
                while (current < sql.length - 1) {
                    if (sql[current] === '*' && sql[current + 1] === '/') {
                        current += 2;
                        break;
                    }
                    current++;
                }
                continue;
            }

            // Numbers
            if (this.isDigit(char)) {
                const token = this.scanNumber(sql, current);
                tokens.push(token);
                current = token.end;
                continue;
            }

            // Strings
            if (char === '"' || char === "'") {
                const token = this.scanString(sql, current);
                tokens.push(token);
                current = token.end;
                continue;
            }

            // Identifiers and keywords
            if (this.isAlpha(char)) {
                const token = this.scanIdentifier(sql, current);
                tokens.push(token);
                current = token.end;
                continue;
            }

            // Operators and punctuation
            const operator = this.scanOperator(sql, current);
            if (operator) {
                tokens.push(operator);
                current = operator.end;
                continue;
            }

            // Single character tokens
            switch (char) {
                case '(':
                    tokens.push({ type: '(', value: '(', start: current, end: current + 1 });
                    break;
                case ')':
                    tokens.push({ type: ')', value: ')', start: current, end: current + 1 });
                    break;
                case ',':
                    tokens.push({ type: ',', value: ',', start: current, end: current + 1 });
                    break;
                case ';':
                    tokens.push({ type: ';', value: ';', start: current, end: current + 1 });
                    break;
                case '*':
                    tokens.push({ type: '*', value: '*', start: current, end: current + 1 });
                    break;
                case '.':
                    tokens.push({ type: '.', value: '.', start: current, end: current + 1 });
                    break;
                default:
                    throw new Error(`Unexpected character: ${char} at position ${current}`);
            }
            
            current++;
        }

        return tokens;
    }

    scanNumber(sql, start) {
        let current = start;
        let hasDecimal = false;

        while (current < sql.length && (this.isDigit(sql[current]) || sql[current] === '.')) {
            if (sql[current] === '.') {
                if (hasDecimal) break;
                hasDecimal = true;
            }
            current++;
        }

        const value = sql.substring(start, current);
        return {
            type: 'NUMBER',
            value,
            start,
            end: current
        };
    }

    scanString(sql, start) {
        const quote = sql[start];
        let current = start + 1;
        let value = '';

        while (current < sql.length && sql[current] !== quote) {
            if (sql[current] === '\\') {
                // Handle escape sequences
                current++;
                if (current < sql.length) {
                    switch (sql[current]) {
                        case 'n':
                            value += '\n';
                            break;
                        case 't':
                            value += '\t';
                            break;
                        case 'r':
                            value += '\r';
                            break;
                        case '\\':
                            value += '\\';
                            break;
                        case quote:
                            value += quote;
                            break;
                        default:
                            value += sql[current];
                    }
                }
            } else {
                value += sql[current];
            }
            current++;
        }

        if (current >= sql.length) {
            throw new Error(`Unterminated string starting at position ${start}`);
        }

        current++; // Skip closing quote

        return {
            type: 'STRING',
            value,
            start,
            end: current
        };
    }

    scanIdentifier(sql, start) {
        let current = start;

        while (current < sql.length && (this.isAlphaNumeric(sql[current]) || sql[current] === '_')) {
            current++;
        }

        const value = sql.substring(start, current);
        const type = this.keywords.has(value.toUpperCase()) ? value.toUpperCase() : 'IDENTIFIER';

        return {
            type,
            value,
            start,
            end: current
        };
    }

    scanOperator(sql, start) {
        const char = sql[start];
        const nextChar = sql[start + 1];

        // Two-character operators
        const twoChar = char + (nextChar || '');
        switch (twoChar) {
            case '<=':
            case '>=':
            case '!=':
            case '<>':
                return {
                    type: twoChar,
                    value: twoChar,
                    start,
                    end: start + 2
                };
        }

        // Single-character operators
        switch (char) {
            case '=':
            case '<':
            case '>':
            case '+':
            case '-':
            case '/':
            case '%':
                return {
                    type: char,
                    value: char,
                    start,
                    end: start + 1
                };
        }

        return null;
    }

    isWhitespace(char) {
        return /\s/.test(char);
    }

    isDigit(char) {
        return /\d/.test(char);
    }

    isAlpha(char) {
        return /[a-zA-Z]/.test(char);
    }

    isAlphaNumeric(char) {
        return /[a-zA-Z0-9]/.test(char);
    }
}
