# Custom Database Engine

A full-featured custom database engine built from scratch with Node.js, featuring SQL-like syntax, ACID transactions, and a custom binary storage format.

## 🚀 Features

- **SQL-like Query Language**: Support for SELECT, INSERT, UPDATE, DELETE operations
- **Custom Storage Engine**: Binary file format with B-Tree indexing
- **ACID Transactions**: Full transaction support with rollback capabilities
- **Write-Ahead Logging (WAL)**: Crash recovery and data durability
- **Query Optimizer**: Cost-based query planning and optimization
- **Multiple Interfaces**: CLI tool and HTTP API
- **Schema Management**: Table creation, indexes, constraints
- **Concurrency Control**: Multi-version concurrency control (MVCC)

## 🏗️ Architecture

```
├── src/
│   ├── core/                 # Core database engine
│   │   ├── storage/          # Storage engine and file management
│   │   ├── btree/            # B-Tree implementation
│   │   ├── wal/              # Write-Ahead Logging
│   │   ├── transactions/     # Transaction management
│   │   └── concurrency/      # Concurrency control
│   ├── parser/               # SQL parser and lexer
│   ├── query/                # Query planner and optimizer
│   ├── schema/               # Schema management
│   ├── cli/                  # Command-line interface
│   ├── web/                  # HTTP API server
│   └── utils/                # Utilities and helpers
├── test/                     # Test suites
└── docs/                     # Documentation
```

## 🛠️ Installation

```bash
npm install
```

## 📋 Usage

### CLI Mode
```bash
npm run cli
```

### HTTP API Mode
```bash
npm run web
```

### Development Mode
```bash
npm run dev
```

## 🔧 SQL Examples

```sql
-- Create a table
CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    age INT
);

-- Create an index
CREATE INDEX idx_email ON users(email);

-- Insert data
INSERT INTO users (id, name, email, age) VALUES (1, 'John Doe', 'john@example.com', 30);

-- Query data
SELECT * FROM users WHERE age > 25;

-- Join tables
SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id;

-- Update data
UPDATE users SET age = 31 WHERE id = 1;

-- Delete data
DELETE FROM users WHERE age < 18;
```

## 🧪 Testing

```bash
npm test
```

## 📚 Key Concepts Implemented

- **Lexical Analysis**: Hand-written tokenizer for SQL parsing
- **Recursive Descent Parser**: SQL statement parsing
- **B-Tree Implementation**: Self-balancing tree for indexing
- **Page-based Storage**: Fixed-size pages with overflow handling
- **MVCC**: Multi-version concurrency control
- **Cost-based Optimization**: Query plan selection
- **Buffer Pool Management**: Memory management for pages
- **Crash Recovery**: WAL-based recovery mechanism

## 🔄 Transaction Example

```javascript
const tx = db.beginTransaction();
try {
    tx.execute("INSERT INTO users VALUES (1, 'Alice', 'alice@example.com', 25)");
    tx.execute("INSERT INTO posts VALUES (1, 1, 'Hello World')");
    tx.commit();
} catch (error) {
    tx.rollback();
    console.error('Transaction failed:', error);
}
```

## 📊 Performance

- **B-Tree Operations**: O(log n) for search, insert, delete
- **Transaction Overhead**: Minimal with efficient WAL
- **Concurrent Reads**: Non-blocking with MVCC
- **Memory Usage**: Configurable buffer pool size

## 🛣️ Roadmap

- [ ] Advanced join algorithms (hash join, sort-merge join)
- [ ] Query result caching
- [ ] Replication support
- [ ] Compression for storage
- [ ] Full-text search capabilities
- [ ] Document store mode (MongoDB-like)
