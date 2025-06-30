// Core database tests
import assert from 'assert';
import { describe, it, before, after } from 'node:test';
import { Database } from '../src/core/database.js';
import fs from 'fs/promises';

describe('Database Core Tests', () => {
    let database;
    const testDataPath = './test-data';

    before(async () => {
        // Clean up test data directory
        try {
            await fs.rm(testDataPath, { recursive: true, force: true });
        } catch (error) {
            // Directory might not exist, ignore error
            console.log('Test data directory cleanup skipped:', error.message);
        }

        database = new Database({
            dataPath: testDataPath,
            pageSize: 4096,
            bufferPoolSize: 10,
            walEnabled: true
        });

        await database.initialize();
    });

    after(async () => {
        if (database) {
            await database.close();
        }
        
        // Clean up test data
        try {
            await fs.rm(testDataPath, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors in tests
            console.log('Test cleanup error ignored:', error.message);
        }
    });

    it('should initialize database successfully', async () => {
        assert.strictEqual(database.isInitialized, true);
    });

    it('should create a table', async () => {
        const sql = `
            CREATE TABLE users (
                id INT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(255),
                age INT
            )
        `;

        const result = await database.execute(sql);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.type, 'CREATE_TABLE');
    });

    it('should insert data into table', async () => {
        const sql = `INSERT INTO users (id, name, email, age) VALUES (1, 'John Doe', 'john@example.com', 30)`;

        const result = await database.execute(sql);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.type, 'INSERT');
    });

    it('should select data from table', async () => {
        const sql = `SELECT * FROM users WHERE id = 1`;

        const result = await database.execute(sql);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.type, 'SELECT');
        assert(Array.isArray(result.rows));
    });

    it('should handle transactions', async () => {
        const transaction = await database.beginTransaction();
        assert(transaction);
        assert.strictEqual(typeof transaction.id, 'number');

        await transaction.commit();
    });

    it('should get database statistics', async () => {
        const stats = await database.getStats();
        assert(typeof stats.tables === 'number');
        assert(typeof stats.indexes === 'number');
        assert(typeof stats.pages === 'number');
    });

    it('should get database schema', async () => {
        const schema = await database.getSchema();
        assert(typeof schema === 'object');
        assert(typeof schema.tables === 'object');
        assert(typeof schema.indexes === 'object');
    });
});
