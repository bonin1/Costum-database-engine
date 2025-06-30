import { DatabaseEngine } from '../src/index.js';

/**
 * Demo script showcasing database capabilities
 */
async function runDemo() {
    console.log('🚀 Custom Database Engine Demo\n');

    const engine = new DatabaseEngine({
        dbPath: './demo-data',
        mode: 'demo'
    });

    try {
        // Initialize database
        console.log('📊 Initializing database...');
        const database = await engine.initialize();
        console.log('✅ Database initialized\n');

        // Create tables
        console.log('🏗️ Creating tables...');
        
        await database.execute(`
            CREATE TABLE users (
                id INT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(255),
                age INT
            )
        `);
        console.log('✅ Created users table');

        await database.execute(`
            CREATE TABLE posts (
                id INT PRIMARY KEY,
                user_id INT,
                title VARCHAR(200),
                content TEXT,
                published BOOLEAN
            )
        `);
        console.log('✅ Created posts table\n');

        // Create indexes
        console.log('📋 Creating indexes...');
        await database.execute('CREATE INDEX idx_user_email ON users(email)');
        await database.execute('CREATE INDEX idx_post_user ON posts(user_id)');
        console.log('✅ Created indexes\n');

        // Insert sample data
        console.log('📝 Inserting sample data...');
        
        const users = [
            [1, 'Alice Johnson', 'alice@example.com', 28],
            [2, 'Bob Smith', 'bob@example.com', 34],
            [3, 'Carol Davis', 'carol@example.com', 22],
            [4, 'David Wilson', 'david@example.com', 31],
            [5, 'Eve Brown', 'eve@example.com', 26]
        ];

        for (const [id, name, email, age] of users) {
            await database.execute(
                `INSERT INTO users (id, name, email, age) VALUES (${id}, '${name}', '${email}', ${age})`
            );
        }
        console.log(`✅ Inserted ${users.length} users`);

        const posts = [
            [1, 1, 'Getting Started with Databases', 'This is a comprehensive guide...', true],
            [2, 1, 'Advanced SQL Techniques', 'Learn about complex queries...', true],
            [3, 2, 'Web Development Best Practices', 'Important tips for developers...', false],
            [4, 3, 'Data Modeling Fundamentals', 'Understanding database design...', true],
            [5, 4, 'Performance Optimization', 'Making your queries faster...', false]
        ];

        for (const [id, userId, title, content, published] of posts) {
            await database.execute(
                `INSERT INTO posts (id, user_id, title, content, published) VALUES (${id}, ${userId}, '${title}', '${content}', ${published})`
            );
        }
        console.log(`✅ Inserted ${posts.length} posts\n`);

        // Demonstrate queries
        console.log('🔍 Running demo queries...\n');

        // Simple SELECT
        console.log('1️⃣ All users:');
        const allUsers = await database.execute('SELECT * FROM users');
        console.table(allUsers.rows);

        // Filtered SELECT
        console.log('2️⃣ Users older than 25:');
        const olderUsers = await database.execute('SELECT name, age FROM users WHERE age > 25');
        console.table(olderUsers.rows);

        // JOIN query (simulated)
        console.log('3️⃣ Users with their post count:');
        const usersWithPosts = await database.execute(`
            SELECT u.name, u.email, COUNT(p.id) as post_count
            FROM users u
            LEFT JOIN posts p ON u.id = p.user_id
            GROUP BY u.id, u.name, u.email
        `);
        console.table(usersWithPosts.rows);

        // UPDATE operation
        console.log('4️⃣ Updating user age:');
        const updateResult = await database.execute(
            'UPDATE users SET age = 29 WHERE id = 1'
        );
        console.log(`✅ Updated ${updateResult.rowsAffected} row(s)`);

        // Transaction demo
        console.log('\n💳 Transaction Demo:');
        const transaction = await database.beginTransaction();
        console.log(`✅ Started transaction ${transaction.id}`);

        try {
            await transaction.execute('INSERT INTO users (id, name, email, age) VALUES (6, "Test User", "test@example.com", 25)');
            await transaction.execute('INSERT INTO posts (id, user_id, title, content) VALUES (6, 6, "Test Post", "This is a test")');
            
            console.log('✅ Executed operations in transaction');
            await transaction.commit();
            console.log('✅ Transaction committed');
        } catch (error) {
            console.log('❌ Transaction error, rolling back:', error.message);
            await transaction.rollback();
        }

        // Show database statistics
        console.log('\n📊 Database Statistics:');
        const stats = await database.getStats();
        console.log(`Tables: ${stats.tables}`);
        console.log(`Indexes: ${stats.indexes}`);
        console.log(`Pages: ${stats.pages}`);
        console.log(`Active Transactions: ${stats.transactions}`);

        if (stats.bufferPool) {
            console.log(`Buffer Pool Hit Rate: ${(stats.bufferPool.hitRate * 100).toFixed(2)}%`);
        }

        console.log('\n🎉 Demo completed successfully!');
        console.log('\n💡 Try the CLI: npm run cli');
        console.log('💡 Try the web API: npm run web');

    } catch (error) {
        console.error('❌ Demo failed:', error.message);
        console.error(error.stack);
    } finally {
        await engine.shutdown();
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nDemo interrupted, shutting down...');
    process.exit(0);
});

runDemo().catch(console.error);
