class SQLParser {
  constructor() {
    this.keywords = new Set([
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
      'DELETE', 'CREATE', 'TABLE', 'DROP', 'GROUP', 'BY', 'ORDER', 'LIMIT',
      'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL'
    ]);
  }

  tokenize(sql) {
    const tokens = [];
    let current = 0;
    const chars = sql.trim();

    while (current < chars.length) {
      let char = chars[current];

      // Skip whitespace
      if (/\s/.test(char)) {
        current++;
        continue;
      }

      // Handle strings
      if (char === "'" || char === '"') {
        let value = '';
        const quote = char;
        current++; // Skip opening quote

        while (current < chars.length && chars[current] !== quote) {
          if (chars[current] === '\\' && current + 1 < chars.length) {
            current++; // Skip escape character
            value += chars[current];
          } else {
            value += chars[current];
          }
          current++;
        }

        if (current < chars.length) current++; // Skip closing quote
        tokens.push({ type: 'STRING', value });
        continue;
      }

      // Handle numbers
      if (/\d/.test(char)) {
        let value = '';
        while (current < chars.length && /[\d.]/.test(chars[current])) {
          value += chars[current];
          current++;
        }
        tokens.push({ 
          type: 'NUMBER', 
          value: value.includes('.') ? parseFloat(value) : parseInt(value) 
        });
        continue;
      }

      // Handle operators and punctuation
      if (/[=<>!]/.test(char)) {
        let value = char;
        current++;
        if (current < chars.length && /[=<>]/.test(chars[current])) {
          value += chars[current];
          current++;
        }
        tokens.push({ type: 'OPERATOR', value });
        continue;
      }

      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        current++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        current++;
        continue;
      }

      if (char === ',') {
        tokens.push({ type: 'COMMA', value: ',' });
        current++;
        continue;
      }

      if (char === ';') {
        tokens.push({ type: 'SEMICOLON', value: ';' });
        current++;
        continue;
      }

      if (char === '*') {
        tokens.push({ type: 'STAR', value: '*' });
        current++;
        continue;
      }

      // Handle identifiers and keywords
      if (/[a-zA-Z_]/.test(char)) {
        let value = '';
        while (current < chars.length && /[a-zA-Z0-9_]/.test(chars[current])) {
          value += chars[current];
          current++;
        }

        const upperValue = value.toUpperCase();
        if (this.keywords.has(upperValue)) {
          tokens.push({ type: 'KEYWORD', value: upperValue });
        } else {
          tokens.push({ type: 'IDENTIFIER', value });
        }
        continue;
      }

      throw new Error(`Unexpected character: ${char}`);
    }

    return tokens;
  }

  parse(sql) {
    const tokens = this.tokenize(sql);
    let current = 0;

    const peek = () => tokens[current];
    const consume = (expectedType = null) => {
      const token = tokens[current];
      if (expectedType && (!token || token.type !== expectedType)) {
        throw new Error(`Expected ${expectedType}, got ${token ? token.type : 'EOF'}`);
      }
      current++;
      return token;
    };

    if (!peek()) {
      throw new Error('Empty query');
    }

    const firstToken = peek();
    
    switch (firstToken.value) {
      case 'SELECT':
        return this.parseSelect(tokens, current);
      case 'INSERT':
        return this.parseInsert(tokens, current);
      case 'UPDATE':
        return this.parseUpdate(tokens, current);
      case 'DELETE':
        return this.parseDelete(tokens, current);
      case 'CREATE':
        return this.parseCreate(tokens, current);
      case 'DROP':
        return this.parseDrop(tokens, current);
      default:
        throw new Error(`Unsupported query type: ${firstToken.value}`);
    }
  }

  parseSelect(tokens, startIndex) {
    let current = startIndex;
    const consume = () => tokens[current++];
    const peek = () => tokens[current];

    consume(); // SELECT

    // Parse columns
    const columns = [];
    do {
      const token = consume();
      if (token.type === 'STAR') {
        columns.push('*');
      } else if (token.type === 'IDENTIFIER') {
        columns.push(token.value);
      } else {
        throw new Error(`Expected column name, got ${token.type}`);
      }

      if (peek() && peek().type === 'COMMA') {
        consume(); // consume comma
      } else {
        break;
      }
    } while (peek());

    // FROM clause
    if (!peek() || peek().value !== 'FROM') {
      throw new Error('Expected FROM clause');
    }
    consume(); // FROM

    const tableToken = consume();
    if (tableToken.type !== 'IDENTIFIER') {
      throw new Error('Expected table name');
    }
    const tableName = tableToken.value;

    // Optional GROUP clause (for our custom groups)
    let groupName = null;
    if (peek() && peek().value === 'GROUP') {
      consume(); // GROUP
      const groupToken = consume();
      if (groupToken.type !== 'IDENTIFIER') {
        throw new Error('Expected group name');
      }
      groupName = groupToken.value;
    }

    // Optional WHERE clause
    let whereConditions = {};
    if (peek() && peek().value === 'WHERE') {
      consume(); // WHERE
      whereConditions = this.parseWhereClause(tokens, current);
    }

    return {
      type: 'SELECT',
      columns,
      table: tableName,
      group: groupName,
      where: whereConditions
    };
  }

  parseInsert(tokens, startIndex) {
    let current = startIndex;
    const consume = () => tokens[current++];
    const peek = () => tokens[current];

    consume(); // INSERT
    
    if (peek().value !== 'INTO') {
      throw new Error('Expected INTO after INSERT');
    }
    consume(); // INTO

    const tableToken = consume();
    if (tableToken.type !== 'IDENTIFIER') {
      throw new Error('Expected table name');
    }
    const tableName = tableToken.value;

    // Optional GROUP clause
    let groupName = null;
    if (peek() && peek().value === 'GROUP') {
      consume(); // GROUP
      const groupToken = consume();
      if (groupToken.type !== 'IDENTIFIER') {
        throw new Error('Expected group name');
      }
      groupName = groupToken.value;
    }

    // Parse columns (optional)
    let columns = [];
    if (peek() && peek().type === 'LPAREN') {
      consume(); // (
      do {
        const columnToken = consume();
        if (columnToken.type !== 'IDENTIFIER') {
          throw new Error('Expected column name');
        }
        columns.push(columnToken.value);

        if (peek() && peek().type === 'COMMA') {
          consume();
        } else {
          break;
        }
      } while (peek());

      if (peek().type !== 'RPAREN') {
        throw new Error('Expected closing parenthesis');
      }
      consume(); // )
    }

    if (peek().value !== 'VALUES') {
      throw new Error('Expected VALUES clause');
    }
    consume(); // VALUES

    if (peek().type !== 'LPAREN') {
      throw new Error('Expected opening parenthesis for values');
    }
    consume(); // (

    const values = [];
    do {
      const valueToken = consume();
      if (valueToken.type === 'STRING' || valueToken.type === 'NUMBER') {
        values.push(valueToken.value);
      } else if (valueToken.type === 'IDENTIFIER') {
        values.push(valueToken.value);
      } else {
        throw new Error(`Unexpected value type: ${valueToken.type}`);
      }

      if (peek() && peek().type === 'COMMA') {
        consume();
      } else {
        break;
      }
    } while (peek());

    if (peek().type !== 'RPAREN') {
      throw new Error('Expected closing parenthesis for values');
    }
    consume(); // )

    return {
      type: 'INSERT',
      table: tableName,
      group: groupName,
      columns,
      values
    };
  }

  parseCreate(tokens, startIndex) {
    let current = startIndex;
    const consume = () => tokens[current++];
    const peek = () => tokens[current];

    consume(); // CREATE

    if (peek().value === 'TABLE') {
      consume(); // TABLE
      
      const tableToken = consume();
      if (tableToken.type !== 'IDENTIFIER') {
        throw new Error('Expected table name');
      }
      const tableName = tableToken.value;

      if (peek().type !== 'LPAREN') {
        throw new Error('Expected opening parenthesis for table definition');
      }
      consume(); // (

      const schema = {};
      do {
        const columnToken = consume();
        if (columnToken.type !== 'IDENTIFIER') {
          throw new Error('Expected column name');
        }
        const columnName = columnToken.value;

        const typeToken = consume();
        if (typeToken.type !== 'IDENTIFIER') {
          throw new Error('Expected column type');
        }
        let columnType = typeToken.value;

        // Handle type parameters like VARCHAR(255)
        if (peek() && peek().type === 'LPAREN') {
          consume(); // consume (
          const paramToken = consume();
          if (paramToken.type === 'NUMBER') {
            columnType += `(${paramToken.value})`;
          }
          if (peek() && peek().type === 'RPAREN') {
            consume(); // consume )
          }
        }

        schema[columnName] = { type: columnType };

        if (peek() && peek().type === 'COMMA') {
          consume();
        } else {
          break;
        }
      } while (peek());

      if (peek().type !== 'RPAREN') {
        throw new Error('Expected closing parenthesis');
      }
      consume(); // )

      return {
        type: 'CREATE_TABLE',
        table: tableName,
        schema
      };
    } else if (peek().value === 'GROUP') {
      consume(); // GROUP
      
      const groupToken = consume();
      if (groupToken.type !== 'IDENTIFIER') {
        throw new Error('Expected group name');
      }
      const groupName = groupToken.value;

      if (peek().value !== 'IN') {
        throw new Error('Expected IN after group name');
      }
      consume(); // IN

      const tableToken = consume();
      if (tableToken.type !== 'IDENTIFIER') {
        throw new Error('Expected table name');
      }
      const tableName = tableToken.value;

      return {
        type: 'CREATE_GROUP',
        table: tableName,
        group: groupName
      };
    }

    throw new Error('Invalid CREATE statement');
  }

  parseWhereClause(tokens, startIndex) {
    let current = startIndex;
    const consume = () => tokens[current++];
    const peek = () => tokens[current];

    const conditions = {};
    
    // Simple WHERE parsing - just support column = value for now
    const columnToken = consume();
    if (columnToken.type !== 'IDENTIFIER') {
      throw new Error('Expected column name in WHERE clause');
    }

    const operatorToken = consume();
    if (operatorToken.type !== 'OPERATOR') {
      throw new Error('Expected operator in WHERE clause');
    }

    const valueToken = consume();
    if (valueToken.type !== 'STRING' && valueToken.type !== 'NUMBER' && valueToken.type !== 'IDENTIFIER') {
      throw new Error('Expected value in WHERE clause');
    }

    // Convert operator to our internal format
    let operator = 'eq';
    switch (operatorToken.value) {
      case '=': operator = 'eq'; break;
      case '!=': 
      case '<>': operator = 'ne'; break;
      case '>': operator = 'gt'; break;
      case '>=': operator = 'gte'; break;
      case '<': operator = 'lt'; break;
      case '<=': operator = 'lte'; break;
    }

    conditions[columnToken.value] = {
      operator,
      value: valueToken.value
    };

    return conditions;
  }
}

module.exports = SQLParser;
