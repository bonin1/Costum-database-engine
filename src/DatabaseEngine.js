const StorageEngine = require('./storage/StorageEngine');
const SQLParser = require('./parser/SQLParser');

class DatabaseEngine {
  constructor(dataDir = './data') {
    this.storage = new StorageEngine(dataDir);
    this.parser = new SQLParser();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.storage.initialize();
      this.initialized = true;
    }
    return this;
  }

  async executeQuery(sql) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = this.parser.parse(sql);
      return await this.executeAST(query);
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async executeAST(ast) {
    switch (ast.type) {
      case 'SELECT':
        return await this.executeSelect(ast);
      case 'INSERT':
        return await this.executeInsert(ast);
      case 'UPDATE':
        return await this.executeUpdate(ast);
      case 'DELETE':
        return await this.executeDelete(ast);
      case 'CREATE_TABLE':
        return await this.executeCreateTable(ast);
      case 'CREATE_GROUP':
        return await this.executeCreateGroup(ast);
      case 'DROP_TABLE':
        return await this.executeDropTable(ast);
      default:
        throw new Error(`Unsupported query type: ${ast.type}`);
    }
  }

  async executeSelect(ast) {
    const { table, columns, where, group } = ast;
    
    const rows = await this.storage.selectRows(table, where, group);
    
    if (columns.includes('*')) {
      return {
        success: true,
        data: rows,
        rowCount: rows.length
      };
    }

    // Filter columns
    const filteredRows = rows.map(row => {
      const filtered = {};
      columns.forEach(col => {
        if (row.hasOwnProperty(col)) {
          filtered[col] = row[col];
        }
      });
      return filtered;
    });

    return {
      success: true,
      data: filteredRows,
      rowCount: filteredRows.length
    };
  }

  async executeInsert(ast) {
    const { table, columns, values, group } = ast;
    
    const data = {};
    if (columns.length > 0) {
      columns.forEach((col, index) => {
        data[col] = values[index];
      });
    } else {
      // Auto-generate column names if not provided
      values.forEach((value, index) => {
        data[`col_${index}`] = value;
      });
    }

    const row = await this.storage.insertRow(table, data, group);
    
    return {
      success: true,
      data: row,
      message: `Row inserted successfully${group ? ` in group '${group}'` : ''}`
    };
  }

  async executeUpdate(ast) {
    // Implementation for UPDATE queries
    throw new Error('UPDATE queries not yet implemented');
  }

  async executeDelete(ast) {
    // Implementation for DELETE queries
    throw new Error('DELETE queries not yet implemented');
  }

  async executeCreateTable(ast) {
    const { table, schema } = ast;
    
    const tableInfo = await this.storage.createTable(table, schema);
    
    return {
      success: true,
      data: tableInfo,
      message: `Table '${table}' created successfully`
    };
  }

  async executeCreateGroup(ast) {
    const { table, group } = ast;
    
    const groupInfo = await this.storage.createGroup(table, group);
    
    return {
      success: true,
      data: groupInfo,
      message: `Group '${group}' created in table '${table}'`
    };
  }

  async executeDropTable(ast) {
    const { table } = ast;
    
    await this.storage.dropTable(table);
    
    return {
      success: true,
      message: `Table '${table}' dropped successfully`
    };
  }

  // Direct storage methods for web interface
  async getAllTables() {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.getAllTables();
  }

  async getTableData(tableName, groupName = null) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.selectRows(tableName, {}, groupName);
  }

  async getTableGroups(tableName) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.getTableGroups(tableName);
  }

  async insertRowDirect(tableName, data, groupName = null) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.insertRow(tableName, data, groupName);
  }

  async updateRowDirect(tableName, rowId, updates) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.updateRow(tableName, rowId, updates);
  }

  async deleteRowDirect(tableName, rowId) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.deleteRow(tableName, rowId);
  }

  async createTableDirect(tableName, schema) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.createTable(tableName, schema);
  }

  async createGroupDirect(tableName, groupName) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.createGroup(tableName, groupName);
  }

  async deleteGroupDirect(tableName, groupName) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.storage.deleteGroup(tableName, groupName);
  }
}

module.exports = DatabaseEngine;
