
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
            await this.loadMetadata();
        } catch (error) {
            console.log('Creating new metadata file:', error.message);
            await this.createMetadataFile();
        }

        this.isInitialized = true;
        console.log('Schema manager initialized');
    }

    async createMetadataFile() {
        this.metadataFileId = await this.storageEngine.createTableFile('_metadata');
        
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
                
                for (const [tableName, tableInfo] of Object.entries(metadata.tables)) {
                    this.tables.set(tableName, tableInfo);
                }

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

        this.validateColumns(columns);

        const fileId = await this.storageEngine.createTableFile(tableName);

        const table = {
            name: tableName,
            fileId,
            columns: this.processColumns(columns),
            rowCount: 0,
            createdAt: new Date().toISOString(),
            constraints: this.extractConstraints(columns)
        };

        this.tables.set(tableName, table);

        const primaryKeyColumns = columns
            .filter(col => col.constraints.some(c => c.type === 'PRIMARY_KEY'))
            .map(col => col.name);

        if (primaryKeyColumns.length > 0) {
            await this.createIndex(`pk_${tableName}`, tableName, primaryKeyColumns, transaction, true);
        }

        await this.saveMetadata();

        console.log(`Table '${tableName}' created successfully`);
        return table;
    }

    async dropTable(tableName, transaction = null) {
        const table = this.tables.get(tableName);
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        const tableIndexes = Array.from(this.indexes.values())
            .filter(index => index.tableName === tableName);

        for (const index of tableIndexes) {
            await this.dropIndex(index.name, transaction);
        }

        await this.storageEngine.deleteFile(`${tableName}.tbl`);

        this.tables.delete(tableName);

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

        for (const columnName of columns) {
            const column = table.columns.find(col => col.name === columnName);
            if (!column) {
                throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
            }
        }

        const fileId = await this.storageEngine.createIndexFile(indexName);

        const index = {
            name: indexName,
            tableName,
            columns,
            fileId,
            type: isPrimary ? 'PRIMARY' : 'SECONDARY',
            unique: isPrimary,
            createdAt: new Date().toISOString()
        };

        this.indexes.set(indexName, index);

        await this.saveMetadata();

        console.log(`Index '${indexName}' created successfully`);
        return index;
    }

    async dropIndex(indexName, transaction = null) {
        const index = this.indexes.get(indexName);
        if (!index) {
            throw new Error(`Index '${indexName}' does not exist`);
        }

        await this.storageEngine.deleteFile(`${indexName}.idx`);

        this.indexes.delete(indexName);

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

    async getAllTables() {
        return Array.from(this.tables.values()).map(table => ({
            name: table.name,
            columns: table.columns,
            constraints: table.constraints,
            rowCount: 0
        }));
    }
}
