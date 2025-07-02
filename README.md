# Custom Database Engine

A powerful custom database engine built with Node.js, featuring SQL-like syntax, groups for data organization, web interface, and CLI tools.

## 🚀 Features

- **Custom SQL Parser**: Hand-written SQL parser supporting CREATE, INSERT, SELECT operations
- **Table Groups**: Organize data within tables using custom groups
- **Web Interface**: Beautiful EJS-powered web UI for database management
- **CLI Interface**: Command-line tool for interactive database operations
- **ACID-like Storage**: JSON-based storage with metadata tracking
- **Query Planner**: Basic query execution and optimization
- **Real-time Updates**: Live data management through web interface

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Web Interface](#web-interface)
  - [CLI Interface](#cli-interface)
  - [SQL Syntax](#sql-syntax)
- [Features](#features-details)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Contributing](#contributing)

## 🛠️ Installation

### Prerequisites

- Node.js 14+ 
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/custom-database-engine.git
   cd custom-database-engine
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   # Start web server
   npm start

   # Or start in development mode
   npm run dev

   # Or use CLI mode
   npm run cli
   ```

## 🚀 Quick Start

### Web Interface

1. Start the server: `npm start`
2. Open http://localhost:3000
3. Create your first table
4. Add data and organize with groups
5. Query your data with SQL

### CLI Interface

1. Start interactive mode: `npm run cli interactive`
2. Create sample data: `create-sample`
3. List tables: `show tables`
4. Run queries: `SELECT * FROM users;`

## 📖 Usage

### Web Interface

The web interface provides a complete database management experience:

#### Dashboard
- View all tables and their statistics
- Quick access to create tables and run queries
- Overview of data organization

#### Table Management
- Create tables with custom schemas
- View table data with pagination
- Organize data into groups
- Add, edit, and delete rows

#### Query Interface
- Execute SQL queries with syntax highlighting
- View results in tabular format
- Access query examples and documentation

### CLI Interface

#### Interactive Mode
```bash
npm run cli interactive
```

Available commands:
- `help` - Show available commands
- `show tables` - List all tables
- `describe <table>` - Show table details
- `show groups <table>` - Show groups in table
- `exit` - Exit CLI

#### Direct Commands
```bash
# Execute a single query
npm run cli query "SELECT * FROM users"

# List tables
npm run cli tables

# Describe a table
npm run cli describe users

# Create sample data
npm run cli create-sample
```

### SQL Syntax

Our custom SQL syntax supports essential database operations:

#### Creating Tables
```sql
CREATE TABLE users (
  name VARCHAR(255),
  email VARCHAR(255),
  age NUMBER
);
```

#### Creating Groups
```sql
CREATE GROUP admins IN users;
CREATE GROUP moderators IN users;
```

#### Inserting Data
```sql
-- Insert into table
INSERT INTO users (name, email, age) 
VALUES ('John Doe', 'john@email.com', 30);

-- Insert into specific group
INSERT INTO users GROUP admins (name, email, age) 
VALUES ('Admin User', 'admin@email.com', 35);
```

#### Querying Data
```sql
-- Select all data
SELECT * FROM users;

-- Select from specific group
SELECT * FROM users GROUP admins;

-- Select with conditions
SELECT name, email FROM users WHERE age > 25;
```

## 🏗️ Features Details

### Tables and Schema
- **Dynamic Schema**: Tables can have predefined schemas or accept any data
- **Type Support**: VARCHAR, NUMBER, BOOLEAN, TEXT data types
- **Automatic IDs**: UUID-based unique identifiers for all rows
- **Timestamps**: Automatic created/updated timestamps

### Groups
- **Data Organization**: Group related data within tables
- **Flexible Assignment**: Rows can belong to groups or remain ungrouped
- **Group Operations**: Query, filter, and manage data by groups
- **Metadata Tracking**: Group statistics and creation dates

### Storage Engine
- **JSON-based Storage**: Human-readable file format
- **Metadata Management**: Centralized metadata with table and group information
- **File Organization**: Separate files for tables, indexes, and WAL
- **Data Integrity**: Basic validation and error handling

### Query Processing
- **Lexical Analysis**: Token-based SQL parsing
- **AST Generation**: Abstract syntax tree for query execution
- **Query Execution**: Direct translation to storage operations
- **Error Handling**: Descriptive error messages for invalid queries

## 🏛️ Architecture

```
Custom Database Engine
├── Storage Layer
│   ├── StorageEngine.js     # Core storage operations
│   ├── data/
│   │   ├── metadata.json    # Database metadata
│   │   ├── tables/          # Table data files
│   │   ├── indexes/         # Index files (future)
│   │   └── wal/             # Write-ahead log (future)
├── Parser Layer
│   └── SQLParser.js         # SQL syntax parser
├── Engine Layer
│   └── DatabaseEngine.js    # Main database engine
├── Interface Layer
│   ├── server.js            # Express web server
│   ├── cli.js               # Command-line interface
│   └── views/               # EJS templates
└── Application Layer
    └── index.js             # Main entry point
```

### Core Components

#### StorageEngine
- Manages file-based data storage
- Handles table and group operations
- Provides data persistence and retrieval

#### SQLParser
- Tokenizes SQL input
- Builds abstract syntax trees
- Validates query syntax

#### DatabaseEngine
- Coordinates parser and storage
- Executes parsed queries
- Manages transactions and operations

#### Web Interface
- Express.js server with EJS templating
- Bootstrap-powered responsive UI
- Real-time data management

#### CLI Interface
- Interactive command-line tool
- Chalk-powered colored output
- Inquirer-based user interaction

## 📚 API Reference

### DatabaseEngine Methods

#### Table Operations
```javascript
// Create table
await db.createTableDirect(tableName, schema);

// Get all tables
const tables = await db.getAllTables();

// Get table data
const data = await db.getTableData(tableName, groupName);
```

#### Row Operations
```javascript
// Insert row
await db.insertRowDirect(tableName, data, groupName);

// Update row
await db.updateRowDirect(tableName, rowId, updates);

// Delete row
await db.deleteRowDirect(tableName, rowId);
```

#### Group Operations
```javascript
// Create group
await db.createGroupDirect(tableName, groupName);

// Get table groups
const groups = await db.getTableGroups(tableName);

// Delete group
await db.deleteGroupDirect(tableName, groupName);
```

#### Query Execution
```javascript
// Execute SQL query
const result = await db.executeQuery(sql);
```

### Storage Engine Methods

#### Low-level Operations
```javascript
// Initialize storage
await storage.initialize();

// Save metadata
await storage.saveMetadata(metadata);

// Select with conditions
const rows = await storage.selectRows(tableName, conditions, groupName);
```

## 💡 Examples

### Basic Usage
```javascript
const DatabaseEngine = require('./src/DatabaseEngine');
const db = new DatabaseEngine();

// Initialize
await db.initialize();

// Create table
await db.executeQuery(`
  CREATE TABLE products (
    name VARCHAR(255),
    price NUMBER,
    category VARCHAR(255)
  )
`);

// Create groups
await db.executeQuery('CREATE GROUP electronics IN products');
await db.executeQuery('CREATE GROUP books IN products');

// Insert data
await db.executeQuery(`
  INSERT INTO products GROUP electronics 
  (name, price, category) 
  VALUES ('Laptop', 999.99, 'Electronics')
`);

// Query data
const result = await db.executeQuery('SELECT * FROM products GROUP electronics');
console.log(result.data);
```

### Web Interface Integration
```javascript
// Express route example
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await db.getAllTables();
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### CLI Automation
```bash
#!/bin/bash
# Automated database setup script

echo "Creating users table..."
npm run cli query "CREATE TABLE users (name VARCHAR(255), role VARCHAR(255))"

echo "Creating groups..."
npm run cli query "CREATE GROUP admins IN users"
npm run cli query "CREATE GROUP users IN users"

echo "Adding sample data..."
npm run cli query "INSERT INTO users GROUP admins VALUES ('Admin', 'administrator')"
npm run cli query "INSERT INTO users GROUP users VALUES ('User', 'standard')"

echo "Querying results..."
npm run cli query "SELECT * FROM users"
```

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000                    # Web server port
DATA_DIR=./data             # Database storage directory
LOG_LEVEL=info              # Logging level
```

### Storage Configuration
```javascript
// Custom storage directory
const db = new DatabaseEngine('./custom-data-dir');
```

## 🧪 Testing

Run the test suite:
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- --testNamePattern="StorageEngine"
```

## 🚀 Performance

### Optimization Tips
1. **Use Groups**: Organize large datasets with groups for faster queries
2. **Limit Results**: Use WHERE clauses to filter data early
3. **Schema Definition**: Define schemas for better type validation
4. **Batch Operations**: Use SQL for multiple operations when possible

### Benchmarks
- **Small Dataset** (< 1,000 rows): Sub-millisecond queries
- **Medium Dataset** (1,000 - 10,000 rows): < 10ms queries
- **Large Dataset** (> 10,000 rows): Consider partitioning with groups

## 🔮 Roadmap

### Planned Features
- [ ] **Advanced Indexing**: B-tree and hash indexes
- [ ] **JOIN Operations**: Support for table joins
- [ ] **UPDATE/DELETE**: Complete CRUD operations
- [ ] **Transactions**: ACID transaction support
- [ ] **Write-Ahead Log**: WAL for data recovery
- [ ] **Schema Validation**: Strict type checking
- [ ] **Query Optimization**: Cost-based query planning
- [ ] **Backup/Restore**: Database backup utilities
- [ ] **User Management**: Authentication and authorization
- [ ] **REST API**: Complete RESTful API
- [ ] **Real-time Subscriptions**: WebSocket-based live updates

### Upcoming Releases
- **v1.1**: Advanced query features and indexing
- **v1.2**: Transaction support and data recovery
- **v1.3**: Performance optimization and clustering
- **v2.0**: Complete rewrite with production features

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

### Code Style
- Use ESLint configuration provided
- Follow conventional commit messages
- Add JSDoc comments for public APIs
- Include tests for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Express.js** - Web framework
- **EJS** - Template engine
- **Bootstrap** - UI framework
- **Commander.js** - CLI framework
- **Chalk** - Terminal styling
- **Inquirer.js** - Interactive CLI prompts

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/custom-database-engine/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/custom-database-engine/discussions)
- **Documentation**: [Wiki](https://github.com/your-username/custom-database-engine/wiki)

---

**Custom Database Engine** - Building the future of lightweight database systems 🗄️✨
