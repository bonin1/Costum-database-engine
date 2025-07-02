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

  async createTable(tableName, schema) {
    const metadata = await this.loadMetadata();
    
    if (metadata.tables[tableName]) {
      throw new Error(`Table '${tableName}' already exists`);
    }

    const tableInfo = {
      name: tableName,
      schema: schema,
      created: new Date().toISOString(),
      rowCount: 0,
      groups: {}
    };

    metadata.tables[tableName] = tableInfo;
    await this.saveMetadata(metadata);

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    await fs.writeJson(tableFile, { rows: [], groups: {} }, { spaces: 2 });

    return tableInfo;
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

    const tableFile = path.join(this.tablesDir, `${tableName}.json`);
    const tableData = await fs.readJson(tableFile);

    const row = {
      id: uuidv4(),
      ...data,
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

    return row;
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
}

module.exports = StorageEngine;
