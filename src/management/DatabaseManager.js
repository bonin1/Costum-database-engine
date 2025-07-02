const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class DatabaseManager {
  constructor(baseDataDir = './databases') {
    this.baseDataDir = baseDataDir;
    this.databases = new Map();
    this.configFile = path.join(baseDataDir, 'databases.json');
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.initializeManager();
      this.initialized = true;
    }
    return this;
  }

  async initializeManager() {
    try {
      await fs.ensureDir(this.baseDataDir);
      
      if (!await fs.pathExists(this.configFile)) {
        await this.saveDatabasesConfig({
          version: '1.0.0',
          databases: {},
          created: new Date().toISOString()
        });
      }
    } catch (error) {
      throw new Error(`Failed to initialize database manager: ${error.message}`);
    }
  }

  async loadDatabasesConfig() {
    try {
      const config = await fs.readJson(this.configFile);
      return config;
    } catch (error) {
      throw new Error(`Failed to load databases config: ${error.message}`);
    }
  }

  async saveDatabasesConfig(config) {
    try {
      await fs.writeJson(this.configFile, config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save databases config: ${error.message}`);
    }
  }

  sanitizeDatabaseName(name) {
    // Security: Sanitize database name to prevent path traversal
    return name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  }

  validateDatabaseName(name) {
    // Security: Validate database name
    if (!name || typeof name !== 'string') {
      throw new Error('Database name must be a non-empty string');
    }
    
    if (name.length > 50) {
      throw new Error('Database name must be 50 characters or less');
    }
    
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      throw new Error('Database name must start with a letter and contain only letters, numbers, underscores, and hyphens');
    }
    
    const reservedNames = ['config', 'system', 'admin', 'root', 'default', 'temp', 'backup'];
    if (reservedNames.includes(name.toLowerCase())) {
      throw new Error(`Database name '${name}' is reserved`);
    }
    
    return true;
  }

  async createDatabase(name, options = {}) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    
    const config = await this.loadDatabasesConfig();
    
    if (config.databases[sanitizedName]) {
      throw new Error(`Database '${sanitizedName}' already exists`);
    }

    const dbDir = path.join(this.baseDataDir, sanitizedName);
    const dbId = crypto.randomUUID();
    
    const dbInfo = {
      id: dbId,
      name: sanitizedName,
      displayName: name,
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      directory: dbDir,
      description: options.description || '',
      settings: {
        maxTableSize: options.maxTableSize || 10000,
        maxTables: options.maxTables || 100,
        enableLogging: options.enableLogging !== false,
        enableBackup: options.enableBackup !== false,
        ...options.settings
      }
    };

    // Create database directory structure
    await fs.ensureDir(dbDir);
    await fs.ensureDir(path.join(dbDir, 'tables'));
    await fs.ensureDir(path.join(dbDir, 'indexes'));
    await fs.ensureDir(path.join(dbDir, 'logs'));
    await fs.ensureDir(path.join(dbDir, 'backups'));

    // Create database metadata
    const metadataFile = path.join(dbDir, 'metadata.json');
    await fs.writeJson(metadataFile, {
      version: '1.0.0',
      id: dbId,
      name: sanitizedName,
      created: dbInfo.created,
      tables: {},
      indexes: {},
      lastTransactionId: 0,
      settings: dbInfo.settings
    }, { spaces: 2 });

    // Update global config
    config.databases[sanitizedName] = dbInfo;
    await this.saveDatabasesConfig(config);

    return dbInfo;
  }

  async listDatabases() {
    const config = await this.loadDatabasesConfig();
    const databaseList = Object.values(config.databases);
    
    // Add computed properties
    const results = [];
    for (const db of databaseList) {
      results.push({
        ...db,
        tables: await this.countTables(db.directory),
        size: await this.getDirectorySize(db.directory)
      });
    }
    return results;
  }

  async countTables(dbDir) {
    try {
      const tablesFile = path.join(dbDir, 'tables.json');
      if (!await fs.pathExists(tablesFile)) return 0;
      const tables = await fs.readJson(tablesFile);
      return Object.keys(tables).length;
    } catch (error) {
      console.warn(`Warning: Could not count tables in ${dbDir}:`, error.message);
      return 0;
    }
  }

  async getDirectorySize(dbDir) {
    try {
      if (!await fs.pathExists(dbDir)) return '0 B';
      const files = await fs.readdir(dbDir);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = path.join(dbDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
      
      if (totalSize === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(totalSize) / Math.log(k));
      return parseFloat((totalSize / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch (error) {
      console.warn(`Warning: Could not get directory size for ${dbDir}:`, error.message);
      return '0 B';
    }
  }

  async getDatabaseInfo(name) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    
    const config = await this.loadDatabasesConfig();
    const dbInfo = config.databases[sanitizedName];
    
    if (!dbInfo) {
      throw new Error(`Database '${sanitizedName}' does not exist`);
    }

    // Update last accessed time
    dbInfo.lastAccessed = new Date().toISOString();
    config.databases[sanitizedName] = dbInfo;
    await this.saveDatabasesConfig(config);

    return dbInfo;
  }

  async deleteDatabase(name, confirmationKey = null) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    
    const config = await this.loadDatabasesConfig();
    const dbInfo = config.databases[sanitizedName];
    
    if (!dbInfo) {
      throw new Error(`Database '${sanitizedName}' does not exist`);
    }

    // Security: Require confirmation key for deletion
    const expectedKey = crypto.createHash('sha256')
      .update(`delete-${sanitizedName}-${dbInfo.id}`)
      .digest('hex')
      .substring(0, 16);
    
    if (confirmationKey !== expectedKey) {
      throw new Error(`Invalid confirmation key. Expected: ${expectedKey}`);
    }

    // Create backup before deletion if enabled
    if (dbInfo.settings.enableBackup) {
      await this.createBackup(sanitizedName);
    }

    // Remove database directory
    if (await fs.pathExists(dbInfo.directory)) {
      await fs.remove(dbInfo.directory);
    }

    // Update config
    delete config.databases[sanitizedName];
    await this.saveDatabasesConfig(config);

    return { deleted: true, backup: dbInfo.settings.enableBackup };
  }

  async createBackup(name) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    
    const dbInfo = await this.getDatabaseInfo(sanitizedName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${sanitizedName}-${timestamp}`;
    const backupDir = path.join(this.baseDataDir, 'backups', backupName);
    
    await fs.ensureDir(path.dirname(backupDir));
    await fs.copy(dbInfo.directory, backupDir);
    
    return {
      name: backupName,
      path: backupDir,
      created: new Date().toISOString(),
      database: sanitizedName
    };
  }

  async restoreBackup(backupName, newDatabaseName = null) {
    const backupDir = path.join(this.baseDataDir, 'backups', backupName);
    
    if (!await fs.pathExists(backupDir)) {
      throw new Error(`Backup '${backupName}' not found`);
    }

    // Extract original database name from backup
    const originalName = backupName.split('-')[1];
    const targetName = newDatabaseName || `restored-${originalName}`;
    
    this.validateDatabaseName(targetName);
    const sanitizedTargetName = this.sanitizeDatabaseName(targetName);
    
    const config = await this.loadDatabasesConfig();
    
    if (config.databases[sanitizedTargetName]) {
      throw new Error(`Database '${sanitizedTargetName}' already exists`);
    }

    const targetDir = path.join(this.baseDataDir, sanitizedTargetName);
    await fs.copy(backupDir, targetDir);
    
    // Update metadata with new name and ID
    const metadataFile = path.join(targetDir, 'metadata.json');
    const metadata = await fs.readJson(metadataFile);
    metadata.id = crypto.randomUUID();
    metadata.name = sanitizedTargetName;
    metadata.restored = new Date().toISOString();
    await fs.writeJson(metadataFile, metadata, { spaces: 2 });
    
    // Add to config
    const dbInfo = {
      id: metadata.id,
      name: sanitizedTargetName,
      displayName: targetName,
      created: metadata.created,
      restored: metadata.restored,
      lastAccessed: new Date().toISOString(),
      directory: targetDir,
      description: `Restored from backup: ${backupName}`,
      settings: metadata.settings || {}
    };
    
    config.databases[sanitizedTargetName] = dbInfo;
    await this.saveDatabasesConfig(config);
    
    return dbInfo;
  }

  getDatabaseDirectory(name) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    return path.join(this.baseDataDir, sanitizedName);
  }

  async getDatabasePath(name) {
    this.validateDatabaseName(name);
    const sanitizedName = this.sanitizeDatabaseName(name);
    
    const config = await this.loadDatabasesConfig();
    const dbInfo = config.databases[sanitizedName];
    
    if (!dbInfo) {
      throw new Error(`Database '${sanitizedName}' does not exist`);
    }
    
    return dbInfo.directory;
  }

  async getDatabaseStats() {
    const config = await this.loadDatabasesConfig();
    const stats = {
      totalDatabases: Object.keys(config.databases).length,
      databases: {}
    };

    for (const [name, dbInfo] of Object.entries(config.databases)) {
      try {
        const metadataFile = path.join(dbInfo.directory, 'metadata.json');
        if (await fs.pathExists(metadataFile)) {
          const metadata = await fs.readJson(metadataFile);
          stats.databases[name] = {
            tables: Object.keys(metadata.tables || {}).length,
            totalRows: Object.values(metadata.tables || {}).reduce((sum, table) => sum + (table.rowCount || 0), 0),
            lastAccessed: dbInfo.lastAccessed,
            size: await this.getDatabaseSize(dbInfo.directory)
          };
        }
      } catch (error) {
        stats.databases[name] = { error: error.message };
      }
    }

    return stats;
  }

  async getDatabaseSize(directory) {
    try {
      let totalSize = 0;
      const files = await fs.readdir(directory, { recursive: true, withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(file.path || directory, file.name);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = DatabaseManager;
