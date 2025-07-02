#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const DatabaseEngine = require('./DatabaseEngine');

const program = new Command();
const db = new DatabaseEngine();

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
    
    await db.initialize();
    
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

        if (command.toLowerCase() === 'show tables') {
          await showTables();
          continue;
        }

        if (command.toLowerCase().startsWith('describe ')) {
          const tableName = command.substring(9).trim();
          await describeTable(tableName);
          continue;
        }

        if (command.toLowerCase().startsWith('show groups ')) {
          const tableName = command.substring(12).trim();
          await showGroups(tableName);
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

function showHelp() {
  console.log(chalk.green('\n📚 Available Commands:'));
  console.log(chalk.blue('  SQL Commands:'));
  console.log(chalk.white('    CREATE TABLE <name> (col1 type1, col2 type2, ...)'));
  console.log(chalk.white('    CREATE GROUP <group> IN <table>'));
  console.log(chalk.white('    INSERT INTO <table> [GROUP <group>] [(columns)] VALUES (values)'));
  console.log(chalk.white('    SELECT * FROM <table> [GROUP <group>] [WHERE conditions]'));
  console.log(chalk.blue('\n  Special Commands:'));
  console.log(chalk.white('    help                 - Show this help'));
  console.log(chalk.white('    show tables          - List all tables'));
  console.log(chalk.white('    describe <table>     - Show table details'));
  console.log(chalk.white('    show groups <table>  - Show groups in table'));
  console.log(chalk.white('    exit                 - Exit the CLI'));
  console.log(chalk.blue('\n  Examples:'));
  console.log(chalk.gray('    CREATE TABLE users (name VARCHAR(255), age NUMBER)'));
  console.log(chalk.gray('    CREATE GROUP admins IN users'));
  console.log(chalk.gray('    INSERT INTO users GROUP admins (name, age) VALUES (\'John\', 30)'));
  console.log(chalk.gray('    SELECT * FROM users GROUP admins'));
  console.log('');
}

// Run the CLI
if (require.main === module) {
  program.parse();
}

module.exports = { db };
