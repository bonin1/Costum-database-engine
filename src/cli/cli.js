import readline from 'readline';
import chalk from 'chalk';

/**
 * Command Line Interface for the database
 */
export class CLI {
    constructor(database) {
        this.database = database;
        this.rl = null;
        this.currentTransaction = null;
        this.history = [];
    }

    async start() {
        console.log(chalk.blue.bold('🚀 Custom Database Engine CLI'));
        console.log(chalk.gray('Type .help for available commands or enter SQL statements'));
        console.log(chalk.gray('Type .exit to quit\n'));

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.green('db> ')
        });

        this.rl.prompt();

        this.rl.on('line', async (input) => {
            await this.handleInput(input.trim());
            this.rl.prompt();
        });

        this.rl.on('close', async () => {
            console.log(chalk.yellow('\nGoodbye!'));
            await this.cleanup();
            process.exit(0);
        });
    }

    async handleInput(input) {
        if (!input) {
            return;
        }

        // Add to history
        this.history.push(input);

        try {
            // Handle meta commands
            if (input.startsWith('.')) {
                await this.handleMetaCommand(input);
                return;
            }

            // Handle SQL statements
            await this.handleSQL(input);
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async handleMetaCommand(command) {
        const [cmd, ...args] = command.split(' ');

        switch (cmd) {
            case '.help':
                this.showHelp();
                break;
            case '.tables':
                await this.showTables();
                break;
            case '.schema':
                await this.showSchema(args[0]);
                break;
            case '.indexes':
                await this.showIndexes();
                break;
            case '.stats':
                await this.showStats();
                break;
            case '.begin':
                await this.beginTransaction();
                break;
            case '.commit':
                await this.commitTransaction();
                break;
            case '.rollback':
                await this.rollbackTransaction();
                break;
            case '.history':
                this.showHistory();
                break;
            case '.clear':
                console.clear();
                break;
            case '.exit':
                this.rl.close();
                break;
            default:
                console.log(chalk.red(`Unknown command: ${cmd}`));
                console.log(chalk.gray('Type .help for available commands'));
        }
    }

    async handleSQL(sql) {
        const startTime = Date.now();
        
        try {
            const result = await this.database.execute(
                sql, 
                [], 
                this.currentTransaction?.id
            );
            
            const executionTime = Date.now() - startTime;
            this.displayResult(result, executionTime);
        } catch (error) {
            console.log(chalk.red(`SQL Error: ${error.message}`));
        }
    }

    displayResult(result, executionTime) {
        switch (result.type) {
            case 'SELECT':
                this.displaySelectResult(result, executionTime);
                break;
            case 'INSERT':
                console.log(chalk.green(`✓ ${result.rowsAffected} row(s) inserted`));
                if (result.insertId) {
                    console.log(chalk.gray(`Insert ID: ${result.insertId}`));
                }
                break;
            case 'UPDATE':
                console.log(chalk.green(`✓ ${result.rowsAffected} row(s) updated`));
                break;
            case 'DELETE':
                console.log(chalk.green(`✓ ${result.rowsAffected} row(s) deleted`));
                break;
            case 'CREATE_TABLE':
            case 'CREATE_INDEX':
            case 'DROP_TABLE':
            case 'DROP_INDEX':
                console.log(chalk.green(`✓ ${result.message}`));
                break;
            default:
                console.log(chalk.green('✓ Query executed successfully'));
        }
        
        console.log(chalk.gray(`Execution time: ${executionTime}ms`));
    }

    displaySelectResult(result, executionTime) {
        if (result.rows.length === 0) {
            console.log(chalk.yellow('No rows returned'));
            return;
        }

        // Get column names
        const columns = Object.keys(result.rows[0]);
        
        // Calculate column widths
        const widths = columns.map(col => {
            const maxValueWidth = Math.max(...result.rows.map(row => 
                String(row[col] || '').length
            ));
            return Math.max(col.length, maxValueWidth, 3);
        });

        // Print header
        const headerRow = columns.map((col, i) => 
            col.padEnd(widths[i])
        ).join(' | ');
        
        console.log(chalk.cyan(headerRow));
        console.log(chalk.gray('-'.repeat(headerRow.length)));

        // Print rows
        result.rows.forEach(row => {
            const dataRow = columns.map((col, i) => 
                String(row[col] || '').padEnd(widths[i])
            ).join(' | ');
            console.log(dataRow);
        });

        console.log(chalk.gray(`\n${result.rowCount} row(s) returned`));
    }

    showHelp() {
        console.log(chalk.blue.bold('Available Commands:'));
        console.log('');
        console.log(chalk.yellow('.help') + '          Show this help message');
        console.log(chalk.yellow('.tables') + '        List all tables');
        console.log(chalk.yellow('.schema [table]') + ' Show table schema');
        console.log(chalk.yellow('.indexes') + '       List all indexes');
        console.log(chalk.yellow('.stats') + '         Show database statistics');
        console.log(chalk.yellow('.begin') + '         Start a transaction');
        console.log(chalk.yellow('.commit') + '        Commit current transaction');
        console.log(chalk.yellow('.rollback') + '      Rollback current transaction');
        console.log(chalk.yellow('.history') + '       Show command history');
        console.log(chalk.yellow('.clear') + '         Clear screen');
        console.log(chalk.yellow('.exit') + '          Exit the CLI');
        console.log('');
        console.log(chalk.blue.bold('SQL Examples:'));
        console.log('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));');
        console.log('INSERT INTO users VALUES (1, \'Alice\');');
        console.log('SELECT * FROM users;');
        console.log('UPDATE users SET name = \'Bob\' WHERE id = 1;');
        console.log('DELETE FROM users WHERE id = 1;');
    }

    async showTables() {
        try {
            const schema = await this.database.getSchema();
            const tables = Object.keys(schema.tables);
            
            if (tables.length === 0) {
                console.log(chalk.yellow('No tables found'));
                return;
            }

            console.log(chalk.blue.bold('Tables:'));
            tables.forEach(table => {
                const tableInfo = schema.tables[table];
                console.log(`  ${chalk.cyan(table)} (${tableInfo.columns.length} columns, ${tableInfo.rowCount} rows)`);
            });
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async showSchema(tableName) {
        try {
            if (!tableName) {
                console.log(chalk.red('Please specify a table name'));
                return;
            }

            const schema = await this.database.getSchema();
            const table = schema.tables[tableName];
            
            if (!table) {
                console.log(chalk.red(`Table '${tableName}' not found`));
                return;
            }

            console.log(chalk.blue.bold(`Schema for table '${tableName}':`));
            console.log('');
            
            table.columns.forEach(column => {
                let columnInfo = `  ${chalk.cyan(column.name)} ${chalk.yellow(column.dataType.type)}`;
                
                if (column.dataType.size) {
                    columnInfo += `(${column.dataType.size})`;
                }
                
                if (!column.nullable) {
                    columnInfo += ' ' + chalk.red('NOT NULL');
                }
                
                if (column.defaultValue) {
                    columnInfo += ` DEFAULT ${column.defaultValue}`;
                }
                
                console.log(columnInfo);
            });

            // Show constraints
            if (table.constraints.length > 0) {
                console.log('');
                console.log(chalk.blue.bold('Constraints:'));
                table.constraints.forEach(constraint => {
                    console.log(`  ${constraint.type} on ${constraint.column}`);
                });
            }
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async showIndexes() {
        try {
            const schema = await this.database.getSchema();
            const indexes = Object.keys(schema.indexes);
            
            if (indexes.length === 0) {
                console.log(chalk.yellow('No indexes found'));
                return;
            }

            console.log(chalk.blue.bold('Indexes:'));
            indexes.forEach(indexName => {
                const index = schema.indexes[indexName];
                console.log(`  ${chalk.cyan(indexName)} on ${chalk.yellow(index.tableName)} (${index.columns.join(', ')})`);
            });
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async showStats() {
        try {
            const stats = await this.database.getStats();
            
            console.log(chalk.blue.bold('Database Statistics:'));
            console.log(`  Tables: ${chalk.cyan(stats.tables)}`);
            console.log(`  Indexes: ${chalk.cyan(stats.indexes)}`);
            console.log(`  Pages: ${chalk.cyan(stats.pages)}`);
            console.log(`  Active Transactions: ${chalk.cyan(stats.transactions)}`);
            
            if (stats.bufferPool) {
                console.log('');
                console.log(chalk.blue.bold('Buffer Pool:'));
                console.log(`  Total Pages: ${chalk.cyan(stats.bufferPool.totalPages)}`);
                console.log(`  Max Pages: ${chalk.cyan(stats.bufferPool.maxPages)}`);
                console.log(`  Hit Rate: ${chalk.cyan((stats.bufferPool.hitRate * 100).toFixed(2))}%`);
                console.log(`  Hits: ${chalk.cyan(stats.bufferPool.hits)}`);
                console.log(`  Misses: ${chalk.cyan(stats.bufferPool.misses)}`);
            }
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async beginTransaction() {
        try {
            if (this.currentTransaction) {
                console.log(chalk.yellow('Transaction already active'));
                return;
            }

            this.currentTransaction = await this.database.beginTransaction();
            console.log(chalk.green(`✓ Transaction ${this.currentTransaction.id} started`));
            this.updatePrompt();
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async commitTransaction() {
        try {
            if (!this.currentTransaction) {
                console.log(chalk.yellow('No active transaction'));
                return;
            }

            await this.currentTransaction.commit();
            console.log(chalk.green(`✓ Transaction ${this.currentTransaction.id} committed`));
            this.currentTransaction = null;
            this.updatePrompt();
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    async rollbackTransaction() {
        try {
            if (!this.currentTransaction) {
                console.log(chalk.yellow('No active transaction'));
                return;
            }

            await this.currentTransaction.rollback();
            console.log(chalk.green(`✓ Transaction ${this.currentTransaction.id} rolled back`));
            this.currentTransaction = null;
            this.updatePrompt();
        } catch (error) {
            console.log(chalk.red(`Error: ${error.message}`));
        }
    }

    showHistory() {
        if (this.history.length === 0) {
            console.log(chalk.yellow('No command history'));
            return;
        }

        console.log(chalk.blue.bold('Command History:'));
        this.history.slice(-10).forEach((cmd, i) => {
            console.log(`  ${chalk.gray((this.history.length - 10 + i + 1).toString().padStart(3))}: ${cmd}`);
        });
    }

    updatePrompt() {
        const prompt = this.currentTransaction 
            ? chalk.yellow('db*> ')  // * indicates active transaction
            : chalk.green('db> ');
        this.rl.setPrompt(prompt);
    }

    async cleanup() {
        if (this.currentTransaction) {
            try {
                await this.currentTransaction.rollback();
                console.log(chalk.yellow('Active transaction rolled back'));
            } catch (error) {
                console.error('Error rolling back transaction:', error);
            }
        }
    }
}
