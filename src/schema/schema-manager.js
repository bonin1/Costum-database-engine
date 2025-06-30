/**
 * Schema Manager - handles database schema and metadata
 */
export class SchemaManager {
    constructor(storageEngine) {
        this.storageEngine = storageEngine;
        this.tables = new Map();
        this.indexes = new Map();
        this.metadataFileId = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Try to load existing metadata
            await this.loadMetadata();
        } catch (error) {
            // Create new metadata file if it doesn't exist
            console.log('Creating new metadata file:', error.message);
            await this.createMetadataFile();
        }

        this.isInitialized = true;
        console.log('Schema manager initialized');
    }

    async createMetadataFile() {
        this.metadataFileId = await this.storageEngine.createTableFile('_metadata');
        
        // Initialize empty metadata
        const metadata = {
            version: 1,
            tables: {},
            indexes: {},
            nextTableId: 1,
            nextIndexId: 1
        };

        await this.saveMetadata(metadata);
    }

    async loadMetadata() {
        try {
            this.metadataFileId = await this.storageEngine.openFile('_metadata.tbl');
            const page = await this.storageEngine.readPage(this.metadataFileId, 0);
            const data = page.getData();
            
            if (data.length > 0) {
                const metadata = JSON.parse(data.toString());
                
                // Load tables
                for (const [tableName, tableInfo] of Object.entries(metadata.tables)) {
                    this.tables.set(tableName, tableInfo);
                }

                // Load indexes
                for (const [indexName, indexInfo] of Object.entries(metadata.indexes)) {
                    this.indexes.set(indexName, indexInfo);
                }
            }
        } catch (error) {
            console.warn('Could not load metadata:', error.message);
            throw error;
        }
    }

    async saveMetadata(metadata) {
        if (!metadata) {
            metadata = {
                version: 1,
                tables: Object.fromEntries(this.tables),
                indexes: Object.fromEntries(this.indexes),
                nextTableId: this.tables.size + 1,
                nextIndexId: this.indexes.size + 1
            };
        }

        const data = Buffer.from(JSON.stringify(metadata, null, 2));
        await this.storageEngine.writePage(this.metadataFileId, 0, data);
    }

    async createTable(tableName, columns, transaction = null) {
        if (this.tables.has(tableName)) {
            throw new Error(`Table '${tableName}' already exists`);
        }

        // Validate columns
        this.validateColumns(columns);

        // Create table file
        const fileId = await this.storageEngine.createTableFile(tableName);

        // Create table metadata
        const table = {
            name: tableName,
            fileId,
            columns: this.processColumns(columns),
            rowCount: 0,
            createdAt: new Date().toISOString(),
            constraints: this.extractConstraints(columns)
        };

        // Add to tables map
        this.tables.set(tableName, table);

        // Create primary key index if specified
        const primaryKeyColumns = columns
            .filter(col => col.constraints.some(c => c.type === 'PRIMARY_KEY'))
            .map(col => col.name);

        if (primaryKeyColumns.length > 0) {
            await this.createIndex(`pk_${tableName}`, tableName, primaryKeyColumns, transaction, true);
        }

        // Save metadata
        await this.saveMetadata();

        console.log(`Table '${tableName}' created successfully`);
        return table;
    }

    async dropTable(tableName, transaction = null) {
        const table = this.tables.get(tableName);
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Drop all indexes for this table
        const tableIndexes = Array.from(this.indexes.values())
            .filter(index => index.tableName === tableName);

        for (const index of tableIndexes) {
            await this.dropIndex(index.name, transaction);
        }

        // Delete table file
        await this.storageEngine.deleteFile(`${tableName}.tbl`);

        // Remove from tables map
        this.tables.delete(tableName);

        // Save metadata
        await this.saveMetadata();

        console.log(`Table '${tableName}' dropped successfully`);
    }

    async createIndex(indexName, tableName, columns, transaction = null, isPrimary = false) {
        if (this.indexes.has(indexName)) {
            throw new Error(`Index '${indexName}' already exists`);
        }

        const table = this.tables.get(tableName);
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Validate columns exist in table
        for (const columnName of columns) {
            const column = table.columns.find(col => col.name === columnName);
            if (!column) {
                throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
            }
        }

        // Create index file
        const fileId = await this.storageEngine.createIndexFile(indexName);

        // Create index metadata
        const index = {
            name: indexName,
            tableName,
            columns,
            fileId,
            type: isPrimary ? 'PRIMARY' : 'SECONDARY',
            unique: isPrimary,
            createdAt: new Date().toISOString()
        };

        // Add to indexes map
        this.indexes.set(indexName, index);

        // Save metadata
        await this.saveMetadata();

        console.log(`Index '${indexName}' created successfully`);
        return index;
    }

    async dropIndex(indexName, transaction = null) {
        const index = this.indexes.get(indexName);
        if (!index) {
            throw new Error(`Index '${indexName}' does not exist`);
        }

        // Delete index file
        await this.storageEngine.deleteFile(`${indexName}.idx`);

        // Remove from indexes map
        this.indexes.delete(indexName);

        // Save metadata
        await this.saveMetadata();

        console.log(`Index '${indexName}' dropped successfully`);
    }

    validateColumns(columns) {
        if (!columns || columns.length === 0) {
            throw new Error('Table must have at least one column');
        }

        const columnNames = new Set();
        
        for (const column of columns) {
            if (!column.name) {
                throw new Error('Column name is required');
            }

            if (columnNames.has(column.name)) {
                throw new Error(`Duplicate column name: ${column.name}`);
            }

            columnNames.add(column.name);

            if (!column.dataType?.type) {
                throw new Error(`Data type is required for column: ${column.name}`);
            }

            this.validateDataType(column.dataType);
        }
    }

    validateDataType(dataType) {
        const validTypes = ['INT', 'INTEGER', 'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP'];
        
        if (!validTypes.includes(dataType.type.toUpperCase())) {
            throw new Error(`Invalid data type: ${dataType.type}`);
        }

        if (['VARCHAR', 'CHAR'].includes(dataType.type.toUpperCase()) && (!dataType.size || dataType.size <= 0)) {
            throw new Error(`Size is required for ${dataType.type} columns`);
        }
    }

    processColumns(columns) {
        return columns.map(column => ({
            name: column.name,
            dataType: {
                type: column.dataType.type.toUpperCase(),
                size: column.dataType.size
            },
            nullable: !column.constraints.some(c => c.type === 'NOT_NULL'),
            defaultValue: this.extractDefaultValue(column.constraints),
            autoIncrement: column.constraints.some(c => c.type === 'AUTO_INCREMENT')
        }));
    }

    extractConstraints(columns) {
        const constraints = [];
        
        for (const column of columns) {
            for (const constraint of column.constraints) {
                constraints.push({
                    type: constraint.type,
                    column: column.name,
                    value: constraint.value
                });
            }
        }

        return constraints;
    }

    extractDefaultValue(constraints) {
        const defaultConstraint = constraints.find(c => c.type === 'DEFAULT');
        return defaultConstraint ? defaultConstraint.value : null;
    }

    // Getter methods
    async getTable(tableName) {
        return this.tables.get(tableName) || null;
    }

    async getIndex(indexName) {
        return this.indexes.get(indexName) || null;
    }

    async getTableIndexes(tableName) {
        return Array.from(this.indexes.values())
            .filter(index => index.tableName === tableName);
    }

    async getTableCount() {
        return this.tables.size;
    }

    async getIndexCount() {
        return this.indexes.size;
    }

    async getSchema() {
        return {
            tables: Object.fromEntries(this.tables),
            indexes: Object.fromEntries(this.indexes),
            tableCount: this.tables.size,
            indexCount: this.indexes.size
        };
    }

    async getTableColumns(tableName) {
        const table = this.tables.get(tableName);
        return table ? table.columns : [];
    }

    async getTableConstraints(tableName) {
        const table = this.tables.get(tableName);
        return table ? table.constraints : [];
    }
}
