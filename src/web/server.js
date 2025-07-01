import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseEngine } from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Web Server - HTTP API for the database
 */
export class WebServer {
    constructor(database) {
        this.database = database;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Serve static files from public directory
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Error handling middleware
        this.app.use((error, req, res, next) => {
            console.error('API Error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message
            });
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString()
            });
        });

        // Execute SQL
        this.app.post('/sql', async (req, res) => {
            try {
                const { sql, parameters = [] } = req.body;
                
                if (!sql) {
                    return res.status(400).json({
                        success: false,
                        error: 'SQL statement is required'
                    });
                }

                const startTime = Date.now();
                const result = await this.database.execute(sql, parameters);
                const executionTime = Date.now() - startTime;

                res.json({
                    success: true,
                    result: {
                        ...result,
                        executionTime
                    }
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get database schema
        this.app.get('/schema', async (req, res) => {
            try {
                const schema = await this.database.getSchema();
                res.json({
                    success: true,
                    data: schema
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get database statistics
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = await this.database.getStats();
                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Transaction endpoints
        this.app.post('/transactions', async (req, res) => {
            try {
                const transaction = await this.database.beginTransaction();
                res.json({
                    success: true,
                    data: {
                        transactionId: transaction.id,
                        message: 'Transaction started'
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post('/transactions/:id/commit', async (req, res) => {
            try {
                const transactionId = parseInt(req.params.id);
                const transaction = this.database.transactionManager.getTransaction(transactionId);
                
                if (!transaction) {
                    return res.status(404).json({
                        success: false,
                        error: 'Transaction not found'
                    });
                }

                await transaction.commit();
                res.json({
                    success: true,
                    data: {
                        transactionId,
                        message: 'Transaction committed'
                    }
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post('/transactions/:id/rollback', async (req, res) => {
            try {
                const transactionId = parseInt(req.params.id);
                const transaction = this.database.transactionManager.getTransaction(transactionId);
                
                if (!transaction) {
                    return res.status(404).json({
                        success: false,
                        error: 'Transaction not found'
                    });
                }

                await transaction.rollback();
                res.json({
                    success: true,
                    data: {
                        transactionId,
                        message: 'Transaction rolled back'
                    }
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Execute SQL within transaction
        this.app.post('/transactions/:id/sql', async (req, res) => {
            try {
                const transactionId = parseInt(req.params.id);
                const { sql, parameters = [] } = req.body;
                
                if (!sql) {
                    return res.status(400).json({
                        success: false,
                        error: 'SQL statement is required'
                    });
                }

                const transaction = this.database.transactionManager.getTransaction(transactionId);
                if (!transaction) {
                    return res.status(404).json({
                        success: false,
                        error: 'Transaction not found'
                    });
                }

                const startTime = Date.now();
                const result = await this.database.execute(sql, parameters, transactionId);
                const executionTime = Date.now() - startTime;

                res.json({
                    success: true,
                    result: {
                        ...result,
                        executionTime,
                        transactionId
                    }
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // List all tables
        this.app.get('/tables', async (req, res) => {
            try {
                const tables = await this.database.schemaManager.getAllTables();
                res.json({
                    success: true,
                    data: tables
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get table information
        this.app.get('/tables/:tableName', async (req, res) => {
            try {
                const { tableName } = req.params;
                const table = await this.database.schema.getTable(tableName);
                if (!table) {
                    return res.status(404).json({
                        success: false,
                        error: 'Table not found'
                    });
                }
                res.json({
                    success: true,
                    data: table
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get table data with pagination
        this.app.get('/tables/:tableName/data', async (req, res) => {
            try {
                const { tableName } = req.params;
                const { limit = 50, offset = 0 } = req.query;
                
                const sql = `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset}`;
                const result = await this.database.execute(sql);
                
                res.json({
                    success: true,
                    data: result.rows || [],
                    meta: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        count: result.rows?.length || 0
                    }
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create a new table
        this.app.post('/tables', async (req, res) => {
            try {
                const { sql } = req.body;
                
                if (!sql?.toLowerCase().includes('create table')) {
                    return res.status(400).json({
                        success: false,
                        error: 'CREATE TABLE SQL statement is required'
                    });
                }

                const result = await this.database.execute(sql);
                res.json({
                    success: true,
                    data: result,
                    message: 'Table created successfully'
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Drop a table
        this.app.delete('/tables/:tableName', async (req, res) => {
            try {
                const { tableName } = req.params;
                const sql = `DROP TABLE ${tableName}`;
                
                const result = await this.database.execute(sql);
                res.json({
                    success: true,
                    data: result,
                    message: `Table '${tableName}' dropped successfully`
                });
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export table data
        this.app.get('/tables/:tableName/export', async (req, res) => {
            try {
                const { tableName } = req.params;
                const { format = 'json' } = req.query;
                
                const sql = `SELECT * FROM ${tableName}`;
                const result = await this.database.execute(sql);
                
                if (format === 'csv') {
                    // Convert to CSV
                    const rows = result.rows || [];
                    if (rows.length === 0) {
                        return res.json({ success: true, data: '' });
                    }
                    
                    const headers = Object.keys(rows[0]);
                    const csvData = [
                        headers.join(','),
                        ...rows.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
                    ].join('\n');
                    
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
                    res.send(csvData);
                } else {
                    res.json({
                        success: true,
                        data: result.rows || []
                    });
                }
            } catch (error) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // API documentation
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'Custom Database Engine API',
                version: '1.0.0',
                endpoints: {
                    'GET /health': 'Health check',
                    'POST /sql': 'Execute SQL statement',
                    'GET /schema': 'Get database schema',
                    'GET /stats': 'Get database statistics',
                    'GET /tables': 'List all tables',
                    'GET /tables/:name': 'Get table information',
                    'GET /tables/:name/data': 'Get table data',
                    'POST /tables': 'Create a new table',
                    'DELETE /tables/:name': 'Drop a table',
                    'GET /tables/:name/export': 'Export table data',
                    'POST /transactions': 'Start a new transaction',
                    'POST /transactions/:id/commit': 'Commit a transaction',
                    'POST /transactions/:id/rollback': 'Rollback a transaction',
                    'POST /transactions/:id/sql': 'Execute SQL within a transaction'
                },
                documentation: 'https://github.com/your-repo/custom-database-engine'
            });
        });

        // Serve main UI
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found'
            });
        });
    }

    async start(port = 3000) {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`🌐 Web server started on port ${port}`);
                    console.log(`📚 API documentation: http://localhost:${port}`);
                    console.log(`🔍 Health check: http://localhost:${port}/health`);
                    resolve(server);
                }
            });
        });
    }
}

// Auto-start web server if this file is run directly
if (process.argv[1].endsWith('server.js')) {
    async function startWebServer() {
        try {
            const engine = new DatabaseEngine({
                dbPath: './demo-data',
                mode: 'web'
            });
            
            await engine.initialize();
            const webServer = new WebServer(engine.database);
            await webServer.start(3000);
        } catch (error) {
            console.error('❌ Failed to start web server:', error.message);
            process.exit(1);
        }
    }
    
    startWebServer();
}
