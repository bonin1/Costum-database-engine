import { DatabaseEngine } from './index.js';

/**
 * CLI Entry Point
 */
async function main() {
    try {
        const engine = new DatabaseEngine({
            dbPath: './data',
            mode: 'cli'
        });

        await engine.startCLI();
    } catch (error) {
        console.error('Error starting CLI:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

main();
