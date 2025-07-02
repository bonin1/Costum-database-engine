const StorageEngine = require('./storage/StorageEngine');
const SQLParser = require('./parser/SQLParser');
const DatabaseManager = require('./management/DatabaseManager');
const SecurityManager = require('./security/SecurityManager');

class DatabaseEngine {
  constructor(dataDir = './data', securityOptions = {}) {
    this.baseDataDir = dataDir;
    this.currentDatabase = null;
    this.storage = null;
    this.parser = new SQLParser();
    this.databaseManager = new DatabaseManager(dataDir);
    this.security = new SecurityManager(securityOptions);
    this.initialized = false;
  }

  async initialize(databaseName = 'default') {
    if (!this.initialized) {
      await this.databaseManager.initialize();
      this.initialized = true;
    }
    
    if (this.currentDatabase !== databaseName) {
      await this.switchDatabase(databaseName);
    }
    
    return this;
  }

  async switchDatabase(databaseName) {
    const StorageEngine = require('./storage/StorageEngine');
    
    const sanitizedName = this.security.sanitizeInput(databaseName, 'identifier');
    
    const databases = await this.databaseManager.listDatabases();
    if (!databases.find(db => db.name === sanitizedName)) {
      await this.databaseManager.createDatabase(sanitizedName);
    }
    
    // Switch to the database
    const dbPath = await this.databaseManager.getDatabasePath(sanitizedName);
    this.storage = new StorageEngine(dbPath);
    await this.storage.initialize();
    this.currentDatabase = sanitizedName;
    
    return this;
  }

  getCurrentDatabase() {
    return this.currentDatabase;
  }

  async listDatabases() {
    return await this.databaseManager.listDatabases();
  }

  async createDatabase(databaseName) {
    const sanitizedName = this.security.sanitizeInput(databaseName, 'identifier');
    return await this.databaseManager.createDatabase(sanitizedName);
  }

  async deleteDatabase(databaseName) {
    const sanitizedName = this.security.sanitizeInput(databaseName, 'identifier');
    return await this.databaseManager.deleteDatabase(sanitizedName);
  }

  async executeQuery(sql, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }

    try {
      // Security validation
      const sanitizedSQL = this.security.validateAndSanitizeQuery(sql);
      
      // Log query for security monitoring
      this.security.logQuery(sanitizedSQL, metadata);
      
      const query = this.parser.parse(sanitizedSQL);
      return await this.executeAST(query);
    } catch (error) {
      // Log security events
      this.security.logSecurityEvent('query_error', {
        sql: sql.substring(0, 100) + '...',
        error: error.message,
        ...metadata
      });
      
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
    
    const message = group 
      ? `Row inserted successfully in group '${group}'`
      : 'Row inserted successfully';
    
    return {
      success: true,
      data: row,
      message: message
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

  async insertRowDirect(tableName, data, groupName = null, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate inputs
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    const sanitizedData = this.security.validateRowData(data);
    const sanitizedGroup = groupName ? this.security.sanitizeInput(groupName, 'identifier') : null;
    
    // Check resource limits
    const rows = await this.storage.getRows(sanitizedTableName, sanitizedGroup);
    if (rows.length >= this.security.options.maxRowsPerTable) {
      throw new Error(`Maximum number of rows (${this.security.options.maxRowsPerTable}) exceeded for table`);
    }
    
    // Log operation
    this.security.logSecurityEvent('row_inserted', {
      tableName: sanitizedTableName,
      group: sanitizedGroup,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.insertRow(sanitizedTableName, sanitizedData, sanitizedGroup);
  }

  async updateRowDirect(tableName, rowId, data, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate inputs
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    const sanitizedData = this.security.validateRowData(data);
    
    // Log operation
    this.security.logSecurityEvent('row_updated', {
      tableName: sanitizedTableName,
      rowId: rowId,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.updateRow(sanitizedTableName, rowId, sanitizedData);
  }

  async deleteRowDirect(tableName, rowId, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate inputs
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    
    // Log operation
    this.security.logSecurityEvent('row_deleted', {
      tableName: sanitizedTableName,
      rowId: rowId,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.deleteRow(sanitizedTableName, rowId);
  }

  // Security-validated direct operations
  async createTableDirect(tableName, schema, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate table name and schema
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    this.security.validateTableName(sanitizedTableName);
    this.security.validateTableSchema(schema);
    
    // Check resource limits
    const tables = await this.storage.getAllTables();
    if (Object.keys(tables).length >= this.security.options.maxTablesPerDatabase) {
      throw new Error(`Maximum number of tables (${this.security.options.maxTablesPerDatabase}) exceeded`);
    }
    
    // Log operation
    this.security.logSecurityEvent('table_created', {
      tableName: sanitizedTableName,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.createTable(sanitizedTableName, schema);
  }

  async createGroupDirect(tableName, groupName, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate inputs
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    const sanitizedGroupName = this.security.sanitizeInput(groupName, 'identifier');
    this.security.validateTableName(sanitizedTableName);
    this.security.validateTableName(sanitizedGroupName);
    
    // Check resource limits
    const table = await this.storage.getTable(sanitizedTableName);
    if (table.groups && Object.keys(table.groups).length >= this.security.options.maxGroupsPerTable) {
      throw new Error(`Maximum number of groups (${this.security.options.maxGroupsPerTable}) exceeded for table`);
    }
    
    // Log operation
    this.security.logSecurityEvent('group_created', {
      tableName: sanitizedTableName,
      groupName: sanitizedGroupName,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.createGroup(sanitizedTableName, sanitizedGroupName);
  }

  async deleteGroupDirect(tableName, groupName, metadata = {}) {
    if (!this.initialized || !this.storage) {
      throw new Error('Database engine not initialized or no database selected');
    }
    
    // Validate inputs
    const sanitizedTableName = this.security.sanitizeInput(tableName, 'identifier');
    const sanitizedGroupName = this.security.sanitizeInput(groupName, 'identifier');
    
    // Log operation
    this.security.logSecurityEvent('group_deleted', {
      tableName: sanitizedTableName,
      groupName: sanitizedGroupName,
      database: this.currentDatabase,
      ...metadata
    });
    
    return await this.storage.deleteGroup(sanitizedTableName, sanitizedGroupName);
  }

  // Security and monitoring methods
  getSecurityManager() {
    return this.security;
  }

  async getSecurityReport() {
    return this.security.generateSecurityReport();
  }

  async clearSecurityLogs() {
    return this.security.clearLogs();
  }
}

module.exports = DatabaseEngine;
