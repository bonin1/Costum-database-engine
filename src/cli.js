#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const DatabaseEngine = require('./DatabaseEngine');

const program = new Command();
const db = new DatabaseEngine('./databases');
let currentDatabase = 'main';

program
  .name('customdb')
  .description('Custom Database Engine CLI')
  .version('1.0.0');

program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.blue.bold('🗄️  Custom Database Engine CLI'));
    console.log(chalk.gray('Type "help" for available commands or "exit" to quit\n'));
    
    await db.initialize(currentDatabase);
    console.log(chalk.green(`Connected to database: ${currentDatabase}\n`));
    
    while (true) {
      try {
        const { command } = await inquirer.prompt([
          {
            type: 'input',
            name: 'command',
            message: chalk.yellow('customdb>'),
            prefix: ''
          }
        ]);

        if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'quit') {
          console.log(chalk.green('Goodbye!'));
          process.exit(0);
        }

        if (command.toLowerCase() === 'help') {
          showHelp();
          continue;
        }

        // Database management commands
        /* CUSTOMIZATION POINT: DATABASE COMMANDS
         * Add new database management commands here.
         * Follow the pattern: check command, validate, execute, continue
         */
        if (command.toLowerCase() === 'show databases') {
          await showDatabases();
          continue;
        }

        if (command.toLowerCase().startsWith('use ')) {
          const dbName = command.substring(4).trim();
          await switchDatabase(dbName);
          continue;
        }

        if (command.toLowerCase().startsWith('create database ')) {
          const dbName = command.substring(16).trim();
          await createDatabase(dbName);
          continue;
        }

        if (command.toLowerCase().startsWith('drop database ')) {
          const dbName = command.substring(14).trim();
          await dropDatabase(dbName);
          continue;
        }

        // Table management commands
        /* CUSTOMIZATION POINT: TABLE COMMANDS
         * Add new table management commands here.
         * Examples: ALTER TABLE, CREATE INDEX, etc.
         */
        if (command.toLowerCase() === 'show tables') {
          await showTables();
          continue;
        }

        if (command.toLowerCase().startsWith('describe ')) {
          const tableName = command.substring(9).trim();
          await describeTable(tableName);
          continue;
        }

        if (command.toLowerCase().startsWith('show indexes ')) {
          const tableName = command.substring(13).trim();
          await showIndexes(tableName);
          continue;
        }

        if (command.toLowerCase().startsWith('show constraints ')) {
          const tableName = command.substring(17).trim();
          await showConstraints(tableName);
          continue;
        }

        // Security and monitoring commands  
        /* CUSTOMIZATION POINT: SECURITY COMMANDS
         * Add new security and monitoring commands here.
         */
        if (command.toLowerCase() === 'security report') {
          await showSecurityReport();
          continue;
        }

        // Group management commands
        /* CUSTOMIZATION POINT: GROUP COMMANDS
         * Add new group management commands here.
         */
        if (command.toLowerCase().startsWith('show groups ')) {
          const tableName = command.substring(12).trim();
          await showGroups(tableName);
          continue;
        }

        // Advanced CREATE TABLE command with constraints
        /* CUSTOMIZATION POINT: ADVANCED CREATE COMMANDS
         * This is where you can add parsing for advanced CREATE TABLE syntax.
         * The current implementation supports SQL parsing, but you can add
         * interactive prompts for easier table creation.
         */
        if (command.toLowerCase().startsWith('create table ')) {
          await handleAdvancedCreateTable(command);
          continue;
        }

        // Execute SQL command
        await executeSQL(command);
        
      } catch (error) {
        console.log(chalk.red(`Error: ${error.message}`));
      }
    }
  });

program
  .command('query <sql>')
  .alias('q')
  .description('Execute a SQL query')
  .action(async (sql) => {
    try {
      await db.initialize();
      await executeSQL(sql);
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('tables')
  .alias('t')
  .description('List all tables')
  .action(async () => {
    try {
      await db.initialize();
      await showTables();
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('describe <table>')
  .alias('desc')
  .description('Describe table structure and data')
  .action(async (tableName) => {
    try {
      await db.initialize();
      await describeTable(tableName);
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('create-sample')
  .description('Create sample data for testing')
  .action(async () => {
    try {
      await db.initialize();
      await createSampleData();
      console.log(chalk.green('Sample data created successfully!'));
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

async function executeSQL(sql) {
  try {
    const result = await db.executeQuery(sql);
    
    if (result.success) {
      if (result.data) {
        if (Array.isArray(result.data)) {
          console.log(chalk.green(`\n✅ Query executed successfully. ${result.rowCount} row(s) returned.\n`));
          console.table(result.data);
        } else {
          console.log(chalk.green(`✅ ${result.message || 'Query executed successfully'}`));
          if (typeof result.data === 'object') {
            console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
          }
        }
      } else {
        console.log(chalk.green(`✅ ${result.message || 'Query executed successfully'}`));
      }
    } else {
      console.log(chalk.red(`❌ Query failed: ${result.message}`));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error.message}`));
  }
}

async function showTables() {
  try {
    const tables = await db.getAllTables();
    const tableNames = Object.keys(tables);
    
    if (tableNames.length === 0) {
      console.log(chalk.yellow('No tables found.'));
      return;
    }

    console.log(chalk.green('\n📋 Tables:'));
    tableNames.forEach(name => {
      const table = tables[name];
      const groupCount = Object.keys(table.groups || {}).length;
      console.log(chalk.blue(`  • ${name}`) + chalk.gray(` (${table.rowCount} rows, ${groupCount} groups)`));
    });
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function describeTable(tableName) {
  try {
    const tables = await db.getAllTables();
    
    if (!tables[tableName]) {
      console.log(chalk.red(`Table '${tableName}' does not exist.`));
      return;
    }

    const table = tables[tableName];
    const data = await db.getTableData(tableName);
    const groups = await db.getTableGroups(tableName);

    console.log(chalk.green(`\n📋 Table: ${tableName}`));
    console.log(chalk.gray(`Created: ${table.created}`));
    console.log(chalk.gray(`Rows: ${table.rowCount}`));
    console.log(chalk.gray(`Groups: ${Object.keys(groups).length}`));

    if (table.schema) {
      console.log(chalk.blue('\n🏗️  Schema:'));
      Object.entries(table.schema).forEach(([col, info]) => {
        console.log(chalk.blue(`  • ${col}`) + chalk.gray(` (${info.type})`));
      });
    }

    if (Object.keys(groups).length > 0) {
      console.log(chalk.blue('\n👥 Groups:'));
      Object.entries(groups).forEach(([groupName, groupInfo]) => {
        console.log(chalk.blue(`  • ${groupName}`) + chalk.gray(` (${groupInfo.rowCount} rows)`));
      });
    }

    if (data.length > 0) {
      console.log(chalk.blue('\n📊 Sample Data (first 5 rows):'));
      console.table(data.slice(0, 5));
    } else {
      console.log(chalk.yellow('\n📊 No data found.'));
    }
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function showGroups(tableName) {
  try {
    const groups = await db.getTableGroups(tableName);
    
    if (Object.keys(groups).length === 0) {
      console.log(chalk.yellow(`No groups found in table '${tableName}'.`));
      return;
    }

    console.log(chalk.green(`\n👥 Groups in table '${tableName}':`));
    Object.entries(groups).forEach(([groupName, groupInfo]) => {
      console.log(chalk.blue(`  • ${groupName}`) + chalk.gray(` (${groupInfo.rowCount} rows, created: ${groupInfo.created})`));
    });
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function createSampleData() {
  // Create users table
  await db.executeQuery(`
    CREATE TABLE users (
      id VARCHAR(255),
      name VARCHAR(255),
      email VARCHAR(255),
      age NUMBER
    )
  `);

  // Create groups
  await db.executeQuery("CREATE GROUP admins IN users");
  await db.executeQuery("CREATE GROUP developers IN users");

  // Insert sample data
  await db.executeQuery("INSERT INTO users GROUP admins (name, email, age) VALUES ('Alice Admin', 'alice@example.com', 30)");
  await db.executeQuery("INSERT INTO users GROUP admins (name, email, age) VALUES ('Bob Boss', 'bob@example.com', 45)");
  
  await db.executeQuery("INSERT INTO users GROUP developers (name, email, age) VALUES ('Carol Coder', 'carol@example.com', 28)");
  await db.executeQuery("INSERT INTO users GROUP developers (name, email, age) VALUES ('Dave Developer', 'dave@example.com', 35)");
  
  await db.executeQuery("INSERT INTO users (name, email, age) VALUES ('Eve User', 'eve@example.com', 25)");

  // Create products table
  await db.executeQuery(`
    CREATE TABLE products (
      id VARCHAR(255),
      name VARCHAR(255),
      price NUMBER,
      category VARCHAR(255)
    )
  `);

  await db.executeQuery("CREATE GROUP electronics IN products");
  await db.executeQuery("CREATE GROUP books IN products");

  await db.executeQuery("INSERT INTO products GROUP electronics (name, price, category) VALUES ('Laptop', 999.99, 'Electronics')");
  await db.executeQuery("INSERT INTO products GROUP electronics (name, price, category) VALUES ('Mouse', 29.99, 'Electronics')");
  
  await db.executeQuery("INSERT INTO products GROUP books (name, price, category) VALUES ('JavaScript Guide', 39.99, 'Books')");
  await db.executeQuery("INSERT INTO products GROUP books (name, price, category) VALUES ('Database Design', 49.99, 'Books')");
}

/* 
 * CUSTOMIZATION POINT: CLI COMMAND PARSING
 * 
 * This section handles interactive CLI commands. To add new commands:
 * 
 * 1. Add command parsing logic in the interactive command loop below
 * 2. Create a new function to handle the command (see examples below)
 * 3. Add the command to the help system (see showHelp function)
 * 4. For SQL commands, enhance the SQLParser in src/parser/SQLParser.js
 * 
 * Examples of custom commands you can add:
 * - CREATE INDEX commands
 * - ALTER TABLE commands  
 * - BACKUP/RESTORE commands
 * - Performance analysis commands
 * - Custom data import/export commands
 */

// Database management functions
async function showDatabases() {
  try {
    const databases = await db.listDatabases();
    console.log(chalk.green('\n📊 Available Databases:'));
    if (databases.length === 0) {
      console.log(chalk.gray('  No databases found'));
    } else {
      databases.forEach(database => {
        const marker = database.name === currentDatabase ? chalk.green('► ') : '  ';
        const info = chalk.gray(`(${database.tables} tables, ${database.size})`);
        console.log(`${marker}${chalk.blue(database.name)} ${info}`);
      });
    }
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error listing databases: ${error.message}`));
  }
}

async function switchDatabase(dbName) {
  try {
    await db.switchDatabase(dbName);
    currentDatabase = dbName;
    console.log(chalk.green(`✓ Switched to database: ${dbName}`));
  } catch (error) {
    console.log(chalk.red(`Error switching database: ${error.message}`));
  }
}

async function createDatabase(dbName) {
  try {
    await db.createDatabase(dbName);
    console.log(chalk.green(`✓ Database '${dbName}' created successfully`));
  } catch (error) {
    console.log(chalk.red(`Error creating database: ${error.message}`));
  }
}

async function dropDatabase(dbName) {
  try {
    if (dbName === currentDatabase) {
      console.log(chalk.red('Cannot delete the currently active database'));
      return;
    }
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to delete database '${dbName}'? This action cannot be undone.`,
        default: false
      }
    ]);
    
    if (confirm) {
      await db.deleteDatabase(dbName);
      console.log(chalk.green(`✓ Database '${dbName}' deleted successfully`));
    } else {
      console.log(chalk.gray('Database deletion cancelled'));
    }
  } catch (error) {
    console.log(chalk.red(`Error deleting database: ${error.message}`));
  }
}

async function showSecurityReport() {
  try {
    const report = await db.getSecurityReport();
    console.log(chalk.green('\n🔒 Security Report:'));
    console.log(chalk.blue(`  Total Queries: ${report.totalQueries}`));
    console.log(chalk.blue(`  Suspicious Activities: ${report.suspiciousActivities}`));
    console.log(chalk.blue(`  Blocked IPs: ${report.blockedIPs}`));
    console.log(chalk.blue(`  Recent Security Events: ${report.recentEvents.length}`));
    
    if (report.recentEvents.length > 0) {
      console.log(chalk.yellow('\n  Recent Security Events:'));
      report.recentEvents.slice(0, 5).forEach(event => {
        const time = new Date(event.timestamp).toLocaleString();
        console.log(chalk.gray(`    ${time} - ${event.type}: ${event.details || 'N/A'}`));
      });
    }
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error generating security report: ${error.message}`));
  }
}

function showHelp() {
  console.log(chalk.green('\n📚 Available Commands:'));
  
  console.log(chalk.blue('  Database Management:'));
  console.log(chalk.white('    show databases       - List all databases'));
  console.log(chalk.white('    use <database>       - Switch to database'));
  console.log(chalk.white('    create database <n>  - Create new database'));
  console.log(chalk.white('    drop database <n>    - Delete database (with confirmation)'));
  
  console.log(chalk.blue('  Table Management:'));
  console.log(chalk.white('    show tables          - List all tables'));
  console.log(chalk.white('    describe <table>     - Show table structure and data'));
  console.log(chalk.white('    show indexes <table> - Show indexes for table'));
  console.log(chalk.white('    show constraints <t> - Show constraints for table'));
  console.log(chalk.white('    show groups <table>  - Show groups in table'));
  
  console.log(chalk.blue('  Advanced SQL Commands:'));
  console.log(chalk.white('    CREATE TABLE <name> ('));
  console.log(chalk.white('      column1 TYPE [PRIMARY KEY] [UNIQUE] [NOT NULL],'));
  console.log(chalk.white('      column2 TYPE [AUTO_INCREMENT] [DEFAULT value],'));
  console.log(chalk.white('      column3 TYPE [FOREIGN_KEY(table.column)],'));
  console.log(chalk.white('      column4 TYPE [CHECK($value > 0)]'));
  console.log(chalk.white('    )'));
  console.log(chalk.white('    CREATE GROUP <group> IN <table>'));
  console.log(chalk.white('    CREATE INDEX <name> ON <table> (columns)'));
  console.log(chalk.white('    INSERT INTO <table> [GROUP <group>] [(columns)] VALUES (values)'));
  console.log(chalk.white('    SELECT * FROM <table> [GROUP <group>] [WHERE conditions]'));
  
  console.log(chalk.blue('  Security & Monitoring:'));
  console.log(chalk.white('    security report      - Show security report'));
  
  console.log(chalk.blue('  System Commands:'));
  console.log(chalk.white('    help                 - Show this help'));
  console.log(chalk.white('    exit                 - Exit the CLI'));
  
  console.log(chalk.blue('\n  💡 Advanced Table Creation Examples:'));
  console.log(chalk.gray('    CREATE TABLE users ('));
  console.log(chalk.gray('      id NUMBER PRIMARY KEY AUTO_INCREMENT,'));
  console.log(chalk.gray('      username VARCHAR(50) UNIQUE NOT NULL,'));
  console.log(chalk.gray('      email VARCHAR(255) UNIQUE NOT NULL,'));
  console.log(chalk.gray('      age NUMBER CHECK($value >= 0),'));
  console.log(chalk.gray('      active BOOLEAN DEFAULT true'));
  console.log(chalk.gray('    )'));
  console.log();
  console.log(chalk.gray('    CREATE TABLE orders ('));
  console.log(chalk.gray('      id NUMBER PRIMARY KEY AUTO_INCREMENT,'));
  console.log(chalk.gray('      user_id NUMBER FOREIGN_KEY(users.id),'));
  console.log(chalk.gray('      total NUMBER CHECK($value >= 0)'));
  console.log(chalk.gray('    )'));
  
  console.log(chalk.blue('\n  🔧 Customization Notes:'));
  console.log(chalk.yellow('    • Add new commands in the interactive loop (src/cli.js)'));
  console.log(chalk.yellow('    • Extend SQL parsing in src/parser/SQLParser.js'));
  console.log(chalk.yellow('    • Add new storage features in src/storage/StorageEngine.js'));
  console.log(chalk.yellow('    • Look for "CUSTOMIZATION POINT" comments in the code'));
  console.log('');
}

// Run the CLI
if (require.main === module) {
  program.parse();
}

module.exports = { db };

// NEW CLI FUNCTIONS FOR ADVANCED FEATURES
/* CUSTOMIZATION POINT: NEW CLI FUNCTIONS
 * Add new CLI functions here to support advanced database features.
 * Follow the existing patterns for error handling and output formatting.
 */

async function showIndexes(tableName) {
  try {
    const tables = await db.getAllTables();
    if (!tables[tableName]) {
      console.log(chalk.red(`Table '${tableName}' does not exist.`));
      return;
    }
    
    const tableInfo = tables[tableName];
    const indexes = tableInfo.indexes || [];
    
    if (indexes.length === 0) {
      console.log(chalk.yellow(`No indexes found for table '${tableName}'.`));
      return;
    }
    
    console.log(chalk.green(`\n📊 Indexes for table '${tableName}':`));
    indexes.forEach(index => {
      const uniqueText = index.unique ? ' (UNIQUE)' : '';
      console.log(chalk.blue(`  • ${index.name}`) + chalk.gray(` on (${index.columns.join(', ')})${uniqueText}`));
    });
    console.log();
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function showConstraints(tableName) {
  try {
    const tables = await db.getAllTables();
    if (!tables[tableName]) {
      console.log(chalk.red(`Table '${tableName}' does not exist.`));
      return;
    }
    
    const tableInfo = tables[tableName];
    const constraints = tableInfo.constraints || {};
    
    console.log(chalk.green(`\n🔒 Constraints for table '${tableName}':`));
    
    // Primary Key
    if (constraints.primaryKey) {
      console.log(chalk.blue(`  Primary Key: ${constraints.primaryKey}`));
    }
    
    // Unique constraints
    if (constraints.unique && constraints.unique.length > 0) {
      console.log(chalk.blue(`  Unique: ${constraints.unique.join(', ')}`));
    }
    
    // Not Null constraints
    if (constraints.notNull && constraints.notNull.length > 0) {
      console.log(chalk.blue(`  Not Null: ${constraints.notNull.join(', ')}`));
    }
    
    // Check constraints
    if (constraints.check && constraints.check.length > 0) {
      console.log(chalk.blue(`  Check Constraints:`));
      constraints.check.forEach(check => {
        console.log(chalk.gray(`    ${check.column}: ${check.condition}`));
      });
    }
    
    // Foreign Keys
    if (tableInfo.foreignKeys && tableInfo.foreignKeys.length > 0) {
      console.log(chalk.blue(`  Foreign Keys:`));
      tableInfo.foreignKeys.forEach(fk => {
        console.log(chalk.gray(`    ${fk.column} → ${fk.references} (${fk.onDelete}/${fk.onUpdate})`));
      });
    }
    
    // Auto-increment columns
    if (tableInfo.autoIncrement && Object.keys(tableInfo.autoIncrement).length > 0) {
      console.log(chalk.blue(`  Auto Increment: ${Object.keys(tableInfo.autoIncrement).join(', ')}`));
    }
    
    console.log();
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}

async function handleAdvancedCreateTable(command) {
  /* CUSTOMIZATION POINT: ADVANCED CREATE TABLE PARSING
   * This function handles advanced CREATE TABLE commands.
   * You can modify this to add more sophisticated parsing
   * or interactive prompts for table creation.
   */
  try {
    // Extract everything after "create table "
    const sqlCommand = command.substring(0, 12) + command.substring(12);
    
    console.log(chalk.blue('Parsing advanced CREATE TABLE command...'));
    await executeSQL(sqlCommand);
    
    // Show examples of advanced syntax
    console.log(chalk.green('\n💡 Advanced CREATE TABLE syntax examples:'));
    console.log(chalk.gray('CREATE TABLE users ('));
    console.log(chalk.gray('  id NUMBER PRIMARY KEY AUTO_INCREMENT,'));
    console.log(chalk.gray('  username VARCHAR(50) UNIQUE NOT NULL,'));
    console.log(chalk.gray('  email VARCHAR(255) UNIQUE NOT NULL,'));
    console.log(chalk.gray('  age NUMBER CHECK($value >= 0),'));
    console.log(chalk.gray('  active BOOLEAN DEFAULT true'));
    console.log(chalk.gray(');'));
    console.log();
  } catch (error) {
    console.log(chalk.red(`Error: ${error.message}`));
  }
}
