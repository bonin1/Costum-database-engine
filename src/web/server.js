import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { DatabaseEngine } from '../index.js';

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

        // API documentation
        this.app.get('/', (req, res) => {
            res.json({
                name: 'Custom Database Engine API',
                version: '1.0.0',
                endpoints: {
                    'GET /health': 'Health check',
                    'POST /sql': 'Execute SQL statement',
                    'GET /schema': 'Get database schema',
                    'GET /stats': 'Get database statistics',
                    'POST /transactions': 'Start a new transaction',
                    'POST /transactions/:id/commit': 'Commit a transaction',
                    'POST /transactions/:id/rollback': 'Rollback a transaction',
                    'POST /transactions/:id/sql': 'Execute SQL within a transaction'
                },
                documentation: 'https://github.com/your-repo/custom-database-engine'
            });
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
                dbPath: './data',
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
