import fs from 'fs/promises';

/**
 * Cleanup script to remove data and log files
 */
async function clean() {
    const dirsToClean = ['./data', './test-data', './logs'];
    
    console.log('🧹 Cleaning up database files...');
    
    for (const dir of dirsToClean) {
        try {
            await fs.rm(dir, { recursive: true, force: true });
            console.log(`✓ Cleaned ${dir}`);
        } catch (error) {
            console.log(`⚠️  Could not clean ${dir}: ${error.message}`);
        }
    }
    
    console.log('✨ Cleanup complete!');
}

clean().catch(console.error);
