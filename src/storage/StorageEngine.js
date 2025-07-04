const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class StorageEngine {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.tablesDir = path.join(dataDir, 'tables');
    this.indexesDir = path.join(dataDir, 'indexes');
    this.walDir = path.join(dataDir, 'wal');
    this.metadataFile = path.join(dataDir, 'metadata.json');
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.initializeStorage();
      this.initialized = true;
    }
    return this;
  }

  async initializeStorage() {
    try {
      await fs.ensureDir(this.dataDir);
      await fs.ensureDir(this.tablesDir);
      await fs.ensureDir(this.indexesDir);
      await fs.ensureDir(this.walDir);
      
      if (!await fs.pathExists(this.metadataFile)) {
        await this.saveMetadata({
          version: '1.0.0',
          tables: {},
          indexes: {},
          lastTransactionId: 0
        });
      }
    } catch (error) {
      throw new Error(`Failed to initialize storage: ${error.message}`);
    }
  }

  async loadMetadata() {
    try {
      const metadata = await fs.readJson(this.metadataFile);
      return metadata;
    } catch (error) {
      throw new Error(`Failed to load metadata: ${error.message}`);
    }
  }

  async saveMetadata(metadata) {
    try {
      await fs.writeJson(this.metadataFile, metadata, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save metadata: ${error.message}`);
    }
  }

  async createTable(tableName, schema, options = {}) {
    const metadata = await this.loadMetadata();
    
    if (metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' already exists`);
    }

    // Enhanced schema with constraints, indexes, etc.
    const processedSchema = this.processTableSchema(schema, options);

    const tableInfo = {
      name: tableName,
      schema: processedSchema.columns,
      constraints: processedSchema.constraints,
      indexes: processedSchema.indexes,
      foreignKeys: processedSchema.foreignKeys,
      triggers: processedSchema.triggers,
      created: new Date().toISOString(),
      rowCount: 0,
      groups: {},
      autoIncrement: processedSchema.autoIncrement || {}
    };

    metadata.tables[tableName] = tableInfo;
    await this.saveMetadata(metadata);

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    await fs.writeJson(tableFile, { 
      rows: [], 
      groups: {},
      sequences: processedSchema.autoIncrement || {}
    }, { spaces: 2 });

    // Create indexes
    if (processedSchema.indexes.length > 0) {
      await this.createTableIndexes(tableName, processedSchema.indexes);
    }

    return tableInfo;
  }

  // NEW: Process and validate table schema with advanced features
  processTableSchema(schema, options = {}) {
    const columns = {};
    const constraints = {
      primaryKey: null,
      unique: [],
      check: [],
      notNull: []
    };
    const indexes = [];
    const foreignKeys = [];
    const triggers = options.triggers || [];
    const autoIncrement = {};

    // Process each column
    for (const [columnName, columnDef] of Object.entries(schema)) {
      let columnInfo;
      
      if (typeof columnDef === 'string') {
        // Simple string definition: "VARCHAR(255)"
        columnInfo = this.parseColumnDefinition(columnDef);
      } else {
        // Object definition with constraints
        columnInfo = { ...columnDef };
      }

      columns[columnName] = columnInfo;

      // Process constraints
      if (columnInfo.primaryKey) {
        if (constraints.primaryKey) {
          throw new Error('Table can only have one primary key');
        }
        constraints.primaryKey = columnName;
        constraints.notNull.push(columnName);
        indexes.push({ columns: [columnName], unique: true, name: `pk_${columnName}` });
      }

      if (columnInfo.unique) {
        constraints.unique.push(columnName);
        indexes.push({ columns: [columnName], unique: true, name: `uk_${columnName}` });
      }

      if (columnInfo.notNull) {
        constraints.notNull.push(columnName);
      }

      if (columnInfo.check) {
        constraints.check.push({ column: columnName, condition: columnInfo.check });
      }

      if (columnInfo.foreignKey) {
        foreignKeys.push({
          column: columnName,
          references: columnInfo.foreignKey.references,
          onDelete: columnInfo.foreignKey.onDelete || 'RESTRICT',
          onUpdate: columnInfo.foreignKey.onUpdate || 'RESTRICT'
        });
      }

      if (columnInfo.autoIncrement) {
        autoIncrement[columnName] = { current: 0, step: 1 };
      }

      if (columnInfo.index) {
        indexes.push({ columns: [columnName], unique: false, name: `idx_${columnName}` });
      }
    }

    // Process composite indexes
    if (options.indexes) {
      for (const indexDef of options.indexes) {
        indexes.push(indexDef);
      }
    }

    return {
      columns,
      constraints,
      indexes,
      foreignKeys,
      triggers,
      autoIncrement
    };
  }

  // NEW: Parse column definition string
  parseColumnDefinition(definition) {
    const parts = definition.trim().split(/\s+/);
    const type = parts[0];
    const columnInfo = { type };

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toUpperCase();
      switch (part) {
        case 'PRIMARY':
          if (parts[i + 1] && parts[i + 1].toUpperCase() === 'KEY') {
            columnInfo.primaryKey = true;
            i++; // skip "KEY"
          }
          break;
        case 'NOT':
          if (parts[i + 1] && parts[i + 1].toUpperCase() === 'NULL') {
            columnInfo.notNull = true;
            i++; // skip "NULL"
          }
          break;
        case 'UNIQUE':
          columnInfo.unique = true;
          break;
        case 'AUTO_INCREMENT':
        case 'AUTOINCREMENT':
          columnInfo.autoIncrement = true;
          break;
        case 'DEFAULT':
          if (parts[i + 1]) {
            columnInfo.default = parts[i + 1];
            i++; // skip default value
          }
          break;
      }
    }

    return columnInfo;
  }

  async dropTable(tableName) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    delete metadata.tables[tableName];
    await this.saveMetadata(metadata);

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    if (await fs.pathExists(tableFile)) {
      await fs.remove(tableFile);
    }
  }

  async insertRow(tableName, data, groupName = null) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    const tableInfo = metadata.tables[tableName];
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    // Validate constraints and process data
    const processedData = await this.validateAndProcessRowData(tableName, data, tableInfo, tableData);

    const row = {
      id: uuidv4(),
      ...processedData,
      created: new Date().toISOString(),
      group: groupName
    };

    // Add to main table
    tableData.rows.push(row);

    // Add to group if specified
    if (groupName) {
      if (!tableData.groups[groupName]) {
        tableData.groups[groupName] = [];
      }
      tableData.groups[groupName].push(row.id);
      
      // Update metadata
      if (!metadata.tables[tableName].groups[groupName]) {
        metadata.tables[tableName].groups[groupName] = {
          created: new Date().toISOString(),
          rowCount: 0
        };
      }
      metadata.tables[tableName].groups[groupName].rowCount++;
    }

    metadata.tables[tableName].rowCount++;
    
    await fs.writeJson(tableFile, tableData, { spaces: 2 });
    await this.saveMetadata(metadata);

    // Update indexes
    await this.updateIndexesForInsert(tableName, row);

    return row;
  }

  // NEW: Validate and process row data with constraints
  async validateAndProcessRowData(tableName, data, tableInfo, tableData) {
    const processedData = { ...data };
    const constraints = tableInfo.constraints || { notNull: [], unique: [], check: [] };
    const schema = tableInfo.schema || {};

    // Handle auto-increment columns FIRST
    for (const [column, autoInc] of Object.entries(tableInfo.autoIncrement || {})) {
      if (processedData[column] === undefined) {
        const currentSequence = tableData.sequences?.[column];
        const currentValue = typeof currentSequence === 'number' ? currentSequence : (autoInc.current || 0);
        const step = autoInc.step || 1;
        const newValue = currentValue + step;
        processedData[column] = newValue;
        
        // Update the sequence immediately
        tableData.sequences = tableData.sequences || {};
        tableData.sequences[column] = newValue;
      }
    }

    // Set default values
    for (const [column, columnInfo] of Object.entries(schema)) {
      if (processedData[column] === undefined && columnInfo.default !== undefined) {
        processedData[column] = columnInfo.default;
      }
    }

    // Check NOT NULL constraints AFTER auto-increment and defaults
    for (const column of constraints.notNull || []) {
      if (processedData[column] === undefined || processedData[column] === null) {
        throw new Error(`Column '${column}' cannot be null`);
      }
    }

    // Validate CHECK constraints
    for (const checkConstraint of constraints.check || []) {
      if (!this.evaluateCheckConstraint(processedData[checkConstraint.column], checkConstraint.condition)) {
        throw new Error(`Check constraint failed for column '${checkConstraint.column}'`);
      }
    }

    // Validate UNIQUE constraints
    for (const column of constraints.unique || []) {
      if (processedData[column] !== undefined) {
        const existingRow = tableData.rows.find(row => row[column] === processedData[column]);
        if (existingRow) {
          throw new Error(`Unique constraint violation for column '${column}'`);
        }
      }
    }

    // Validate PRIMARY KEY constraint
    if (constraints.primaryKey && processedData[constraints.primaryKey] !== undefined) {
      const existingRow = tableData.rows.find(row => row[constraints.primaryKey] === processedData[constraints.primaryKey]);
      if (existingRow) {
        throw new Error(`Primary key constraint violation for column '${constraints.primaryKey}'`);
      }
    }

    // Validate FOREIGN KEY constraints
    await this.validateForeignKeyConstraints(tableName, processedData, tableInfo.foreignKeys || []);

    return processedData;
  }

  // NEW: Validate foreign key constraints
  async validateForeignKeyConstraints(tableName, data, foreignKeys) {
    for (const fk of foreignKeys) {
      const value = data[fk.column];
      if (value !== undefined && value !== null) {
        const [refTable, refColumn] = fk.references.split('.');
        const refMetadata = await this.loadMetadata();
        
        if (!refMetadata.tables[refTable]) {
          throw new Error(`Referenced table '${refTable}' does not exist`);
        }

        const refTableFile = path.join(this.tablesDir, `${refTable}.json`);
        const refTableData = await fs.readJson(refTableFile);
        
        const referencedRow = refTableData.rows.find(row => row[refColumn] === value);
        if (!referencedRow) {
          throw new Error(`Foreign key constraint violation: value '${value}' not found in ${refTable}.${refColumn}`);
        }
      }
    }
  }

  // NEW: Evaluate check constraints
  evaluateCheckConstraint(value, condition) {
    try {
      // Simple check constraint evaluation
      // In a real implementation, you'd want a proper expression parser
      return eval(condition.replace(/\$value/g, JSON.stringify(value)));
    } catch (error) {
      return false;
    }
  }

  // NEW: Update auto-increment sequences
  async updateAutoIncrementSequences(tableName, tableData, data) {
    const metadata = await this.loadMetadata();
    const tableInfo = metadata.tables[tableName];
    
    for (const [column, value] of Object.entries(data)) {
      if (tableInfo.autoIncrement?.[column]) {
        tableData.sequences = tableData.sequences || {};
        const numericValue = typeof value === 'number' ? value : parseInt(value) || 0;
        tableData.sequences[column] = Math.max(
          tableData.sequences[column] || 0,
          numericValue
        );
      }
    }
  }

  // NEW: Create table indexes
  async createTableIndexes(tableName, indexes) {
    for (const indexDef of indexes) {
      await this.createIndex(tableName, indexDef);
    }
  }

  // NEW: Create an index
  async createIndex(tableName, indexDef) {
    const indexFile = path.join(this.indexesDir, `${tableName}_${indexDef.name}.json`);
    const indexData = {
      tableName,
      name: indexDef.name,
      columns: indexDef.columns,
      unique: indexDef.unique || false,
      created: new Date().toISOString(),
      entries: {}
    };

    // Build initial index from existing data
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    if (await fs.pathExists(tableFile)) {
      const tableData = await fs.readJson(tableFile);
      for (const row of tableData.rows) {
        const indexKey = this.buildIndexKey(row, indexDef.columns);
        if (!indexData.entries[indexKey]) {
          indexData.entries[indexKey] = [];
        }
        indexData.entries[indexKey].push(row.id);
      }
    }

    await fs.writeJson(indexFile, indexData, { spaces: 2 });
  }

  // NEW: Build index key from row data
  buildIndexKey(row, columns) {
    return columns.map(col => row[col] || '').join('|');
  }

  // NEW: Update indexes for insert
  async updateIndexesForInsert(tableName, row) {
    const metadata = await this.loadMetadata();
    const tableInfo = metadata.tables[tableName];
    
    if (!tableInfo.indexes) return;

    for (const indexDef of tableInfo.indexes) {
      const indexFile = path.join(this.indexesDir, `${tableName}_${indexDef.name}.json`);
      if (await fs.pathExists(indexFile)) {
        const indexData = await fs.readJson(indexFile);
        const indexKey = this.buildIndexKey(row, indexDef.columns);
        
        if (!indexData.entries[indexKey]) {
          indexData.entries[indexKey] = [];
        }
        indexData.entries[indexKey].push(row.id);
        
        await fs.writeJson(indexFile, indexData, { spaces: 2 });
      }
    }
  }

  // NEW: Advanced query methods with index support
  async selectRowsWithIndex(tableName, conditions = {}, options = {}) {
    const metadata = await this.loadMetadata();
    const tableInfo = metadata.tables[tableName];
    
    if (!tableInfo) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    // Try to use an index for the query
    const bestIndex = this.findBestIndex(tableInfo.indexes || [], conditions);
    
    if (bestIndex) {
      return await this.selectRowsUsingIndex(tableName, bestIndex, conditions, options);
    } else {
      return await this.selectRows(tableName, conditions, options.groupName);
    }
  }

  // NEW: Find best index for query conditions
  findBestIndex(indexes, conditions) {
    const conditionColumns = Object.keys(conditions);
    let bestIndex = null;
    let bestScore = 0;

    for (const index of indexes) {
      const matchingColumns = index.columns.filter(col => conditionColumns.includes(col));
      const score = matchingColumns.length / index.columns.length;
      
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    return bestScore > 0 ? bestIndex : null;
  }

  // NEW: Select rows using index
  async selectRowsUsingIndex(tableName, index, conditions, options) {
    const indexFile = path.join(this.indexesDir, `${tableName}_${index.name}.json`);
    const indexData = await fs.readJson(indexFile);
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    // Build search key from conditions
    const searchKey = index.columns.map(col => conditions[col] || '').join('|');
    const rowIds = indexData.entries[searchKey] || [];
    
    // Get rows by IDs
    let rows = tableData.rows.filter(row => rowIds.includes(row.id));
    
    // Apply remaining conditions not covered by index
    const remainingConditions = {};
    for (const [key, value] of Object.entries(conditions)) {
      if (!index.columns.includes(key)) {
        remainingConditions[key] = value;
      }
    }

    if (Object.keys(remainingConditions).length > 0) {
      rows = rows.filter(row => {
        return Object.entries(remainingConditions).every(([key, value]) => {
          if (typeof value === 'object' && value.operator) {
            return this.evaluateCondition(row[key], value.operator, value.value);
          }
          return row[key] === value;
        });
      });
    }

    return rows;
  }

  // NEW: Create triggers
  async createTrigger(tableName, triggerName, event, timing, action) {
    const metadata = await this.loadMetadata();
    const tableInfo = metadata.tables[tableName];
    
    if (!tableInfo) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    if (!tableInfo.triggers) {
      tableInfo.triggers = [];
    }

    const trigger = {
      name: triggerName,
      event, // INSERT, UPDATE, DELETE
      timing, // BEFORE, AFTER
      action,
      created: new Date().toISOString()
    };

    tableInfo.triggers.push(trigger);
    await this.saveMetadata(metadata);
  }

  // NEW: Execute triggers
  async executeTriggers(tableName, event, timing, oldRow = null, newRow = null) {
    const metadata = await this.loadMetadata();
    const tableInfo = metadata.tables[tableName];
    
    if (!tableInfo?.triggers) return;

    const triggers = tableInfo.triggers.filter(t => t.event === event && t.timing === timing);
    
    for (const trigger of triggers) {
      try {
        // Simple trigger execution - in practice you'd want a proper script engine
        const context = { oldRow, newRow, tableName };
        await this.executeTriggerAction(trigger.action, context);
      } catch (error) {
        console.warn(`Trigger ${trigger.name} failed:`, error.message);
      }
    }
  }

  // NEW: Execute trigger action
  async executeTriggerAction(action, context) {
    // Placeholder for trigger action execution
    // In a real implementation, you'd parse and execute the action
    console.log(`Executing trigger action: ${action}`, context);
  }

  async selectRows(tableName, conditions = {}, groupName = null) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    let rows = tableData.rows;

    // Filter by group if specified
    if (groupName) {
      if (tableData.groups[groupName]) {
        const groupRowIds = tableData.groups[groupName];
        rows = rows.filter(row => groupRowIds.includes(row.id));
      } else {
        return [];
      }
    }

    // Apply conditions
    if (Object.keys(conditions).length > 0) {
      rows = rows.filter(row => {
        return Object.entries(conditions).every(([key, value]) => {
          if (typeof value === 'object' && value.operator) {
            return this.evaluateCondition(row[key], value.operator, value.value);
          }
          return row[key] === value;
        });
      });
    }

    return rows;
  }

  async updateRow(tableName, rowId, updates) {
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    const rowIndex = tableData.rows.findIndex(row => row.id === rowId);
    if (rowIndex === -1) {
      throw new Error(`Row with id '${rowId}' not found`);
    }

    tableData.rows[rowIndex] = {
      ...tableData.rows[rowIndex],
      ...updates,
      updated: new Date().toISOString()
    };

    await fs.writeJson(tableFile, tableData, { spaces: 2 });
    return tableData.rows[rowIndex];
  }

  async deleteRow(tableName, rowId) {
    const metadata = await this.loadMetadata();
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    const rowIndex = tableData.rows.findIndex(row => row.id === rowId);
    if (rowIndex === -1) {
      throw new Error(`Row with id '${rowId}' not found`);
    }

    const row = tableData.rows[rowIndex];
    
    // Remove from group if it belongs to one
    if (row.group && tableData.groups[row.group]) {
      const groupIndex = tableData.groups[row.group].indexOf(rowId);
      if (groupIndex > -1) {
        tableData.groups[row.group].splice(groupIndex, 1);
        metadata.tables[tableName].groups[row.group].rowCount--;
      }
    }

    tableData.rows.splice(rowIndex, 1);
    metadata.tables[tableName].rowCount--;

    await fs.writeJson(tableFile, tableData, { spaces: 2 });
    await this.saveMetadata(metadata);

    return row;
  }

  async createGroup(tableName, groupName) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    if (tableData.groups[groupName]) {
      throw new Error(`Group '${groupName}' already exists in table '${tableName}'`);
    }

    tableData.groups[groupName] = [];
    metadata.tables[tableName].groups[groupName] = {
      created: new Date().toISOString(),
      rowCount: 0
    };

    await fs.writeJson(tableFile, tableData, { spaces: 2 });
    await this.saveMetadata(metadata);

    return { name: groupName, created: new Date().toISOString() };
  }

  async deleteGroup(tableName, groupName) {
    const metadata = await this.loadMetadata();
    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    if (!tableData.groups[groupName]) {
      throw new Error(`Group '${groupName}' does not exist in table '${tableName}'`);
    }

    // Remove group reference from all rows
    tableData.rows = tableData.rows.map(row => {
      if (row.group === groupName) {
        delete row.group;
      }
      return row;
    });

    delete tableData.groups[groupName];
    delete metadata.tables[tableName].groups[groupName];

    await fs.writeJson(tableFile, tableData, { spaces: 2 });
    await this.saveMetadata(metadata);
  }

  evaluateCondition(value, operator, target) {
    switch (operator) {
      case 'eq': return value === target;
      case 'ne': return value !== target;
      case 'gt': return value > target;
      case 'gte': return value >= target;
      case 'lt': return value < target;
      case 'lte': return value <= target;
      case 'like': return String(value).includes(String(target));
      default: return false;
    }
  }

  async getAllTables() {
    const metadata = await this.loadMetadata();
    return metadata.tables;
  }

  async getTableGroups(tableName) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    return metadata.tables[tableName].groups || {};
  }

  async getRows(tableName, groupName = null) {
    const metadata = await this.loadMetadata();
    
    if (!metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' does not exist`);
    }

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    let rows = tableData.rows;

    // Filter by group if specified
    if (groupName) {
      if (tableData.groups[groupName]) {
        const groupRowIds = tableData.groups[groupName];
        rows = rows.filter(row => groupRowIds.includes(row.id));
      } else {
        return [];
      }
    }

    return rows;
  }
}

module.exports = StorageEngine;
