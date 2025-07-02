const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const DatabaseEngine = require('./DatabaseEngine');

const app = express();
const db = new DatabaseEngine();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize database
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await db.initialize();
    dbInitialized = true;
  }
}

// Routes
app.get('/', async (req, res) => {
  try {
    await ensureDbInitialized();
    const tables = await db.getAllTables();
    const tableNames = Object.keys(tables);
    
    res.render('index', { 
      title: 'Custom Database Engine',
      tables: tables,
      tableNames: tableNames
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/table/:tableName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName } = req.params;
    const { group } = req.query;
    
    const tables = await db.getAllTables();
    
    if (!tables[tableName]) {
      return res.status(404).render('error', { error: `Table '${tableName}' not found` });
    }
    
    const tableInfo = tables[tableName];
    const data = await db.getTableData(tableName, group);
    const groups = await db.getTableGroups(tableName);
    
    res.render('table', {
      title: `Table: ${tableName}`,
      tableName,
      tableInfo,
      data,
      groups,
      selectedGroup: group,
      tables: tables
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/create-table', async (req, res) => {
  try {
    await ensureDbInitialized();
    const tables = await db.getAllTables();
    res.render('create-table', { 
      title: 'Create Table',
      tables: tables
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/create-table', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, columns } = req.body;
    
    if (!tableName || !columns) {
      throw new Error('Table name and columns are required');
    }
    
    const schema = {};
    columns.split(',').forEach(col => {
      const [name, type] = col.trim().split(':');
      if (name && type) {
        schema[name.trim()] = { type: type.trim() };
      }
    });
    
    await db.createTableDirect(tableName, schema);
    res.redirect(`/table/${tableName}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/add-row/:tableName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName } = req.params;
    const tables = await db.getAllTables();
    
    if (!tables[tableName]) {
      return res.status(404).render('error', { error: `Table '${tableName}' not found` });
    }
    
    const tableInfo = tables[tableName];
    const groups = await db.getTableGroups(tableName);
    
    res.render('add-row', {
      title: `Add Row to ${tableName}`,
      tableName,
      tableInfo,
      groups,
      tables: tables
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/add-row/:tableName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName } = req.params;
    const { group, ...data } = req.body;
    
    // Remove empty fields
    Object.keys(data).forEach(key => {
      if (data[key] === '') {
        delete data[key];
      }
    });
    
    await db.insertRowDirect(tableName, data, group || null);
    res.redirect(`/table/${tableName}${group ? `?group=${group}` : ''}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/edit-row/:tableName/:rowId', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, rowId } = req.params;
    const tables = await db.getAllTables();
    
    if (!tables[tableName]) {
      return res.status(404).render('error', { error: `Table '${tableName}' not found` });
    }
    
    const data = await db.getTableData(tableName);
    const row = data.find(r => r.id === rowId);
    
    if (!row) {
      return res.status(404).render('error', { error: 'Row not found' });
    }
    
    const tableInfo = tables[tableName];
    const groups = await db.getTableGroups(tableName);
    
    res.render('edit-row', {
      title: `Edit Row in ${tableName}`,
      tableName,
      tableInfo,
      row,
      groups,
      tables: tables
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/edit-row/:tableName/:rowId', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, rowId } = req.params;
    const { group, ...updates } = req.body;
    
    // Remove empty fields and system fields
    delete updates.id;
    delete updates.created;
    delete updates.updated;
    
    Object.keys(updates).forEach(key => {
      if (updates[key] === '') {
        delete updates[key];
      }
    });
    
    if (group !== undefined) {
      updates.group = group || null;
    }
    
    await db.updateRowDirect(tableName, rowId, updates);
    res.redirect(`/table/${tableName}${group ? `?group=${group}` : ''}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/delete-row/:tableName/:rowId', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, rowId } = req.params;
    const { returnGroup } = req.body;
    
    await db.deleteRowDirect(tableName, rowId);
    res.redirect(`/table/${tableName}${returnGroup ? `?group=${returnGroup}` : ''}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/create-group/:tableName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName } = req.params;
    const tables = await db.getAllTables();
    
    if (!tables[tableName]) {
      return res.status(404).render('error', { error: `Table '${tableName}' not found` });
    }
    
    res.render('create-group', {
      title: `Create Group in ${tableName}`,
      tableName,
      tables: tables
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/create-group/:tableName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName } = req.params;
    const { groupName } = req.body;
    
    if (!groupName) {
      throw new Error('Group name is required');
    }
    
    await db.createGroupDirect(tableName, groupName);
    res.redirect(`/table/${tableName}?group=${groupName}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/delete-group/:tableName/:groupName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, groupName } = req.params;
    
    await db.deleteGroupDirect(tableName, groupName);
    res.redirect(`/table/${tableName}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/query', async (req, res) => {
  try {
    await ensureDbInitialized();
    const tables = await db.getAllTables();
    res.render('query', {
      title: 'SQL Query Interface',
      tables: tables,
      result: null
    });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/query', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { sql } = req.body;
    const tables = await db.getAllTables();
    
    if (!sql) {
      throw new Error('SQL query is required');
    }
    
    const result = await db.executeQuery(sql);
    
    res.render('query', {
      title: 'SQL Query Interface',
      tables: tables,
      result: result,
      query: sql
    });
  } catch (error) {
    const tables = await db.getAllTables();
    res.render('query', {
      title: 'SQL Query Interface',
      tables: tables,
      result: { success: false, error: error.message },
      query: req.body.sql
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { error: 'Page not found' });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await ensureDbInitialized();
    
    app.listen(PORT, () => {
      console.log(`🚀 Custom Database Engine running on http://localhost:${PORT}`);
      console.log(`📊 Web Interface: http://localhost:${PORT}`);
      console.log(`💻 CLI: npm run cli`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
