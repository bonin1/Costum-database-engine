import { Database } from './core/database.js';
import { CLI } from './cli/cli.js';
import { WebServer } from './web/server.js';

/**
 * Main entry point for the Custom Database Engine
 */
class DatabaseEngine {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './data';
        this.mode = options.mode || 'standalone';
        this.database = null;
    }

    async initialize() {
        console.log('🚀 Initializing Custom Database Engine...');
        
        try {
            this.database = new Database({
                dataPath: this.dbPath,
                pageSize: 4096,
                bufferPoolSize: 100,
                walEnabled: true
            });
            
            await this.database.initialize();
            console.log('✅ Database engine initialized successfully');
            
            return this.database;
        } catch (error) {
            console.error('❌ Failed to initialize database:', error.message);
            throw error;
        }
    }

    async startCLI() {
        if (!this.database) {
            await this.initialize();
        }
        
        const cli = new CLI(this.database);
        await cli.start();
    }

    async startWebServer(port = 3000) {
        if (!this.database) {
            await this.initialize();
        }
        
        const webServer = new WebServer(this.database);
        await webServer.start(port);
    }

    async shutdown() {
        if (this.database) {
            await this.database.close();
            console.log('🔄 Database engine shutdown complete');
        }
    }
}

export { DatabaseEngine };

// Auto-start based on command line arguments
if (process.argv[2] === 'cli') {
    const engine = new DatabaseEngine();
    engine.startCLI().catch(console.error);
} else if (process.argv[2] === 'web') {
    const engine = new DatabaseEngine();
    const port = process.argv[3] || 3000;
    engine.startWebServer(port).catch(console.error);
}
