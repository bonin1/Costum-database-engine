const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const DatabaseEngine = require('./DatabaseEngine');

const app = express();
const db = new DatabaseEngine('./databases');

const securityManager = db.getSecurityManager();
app.use(securityManager.getSecurityHeaders());
app.use(securityManager.getRateLimiter());


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const metadata = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.url
  };
  
  securityManager.logSecurityEvent('http_request', metadata);
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

let dbInitialized = false;
let currentDatabase = 'main';

async function ensureDbInitialized(databaseName = currentDatabase) {
  if (!dbInitialized || db.getCurrentDatabase() !== databaseName) {
    await db.initialize(databaseName);
    currentDatabase = databaseName;
    dbInitialized = true;
  }
}

app.use((req, res, next) => {
  if (req.query.db && req.query.db !== currentDatabase) {
    currentDatabase = req.query.db;
    dbInitialized = false;
  }
  next();
});

app.get('/', async (req, res) => {
  try {
    await ensureDbInitialized();
    const tables = await db.getAllTables();
    const tableNames = Object.keys(tables);
    const databases = await db.listDatabases();
    
    res.render('index', { 
      title: 'Custom Database Engine',
      tables: tables,
      tableNames: tableNames,
      databases: databases,
      currentDatabase: currentDatabase
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
    const { 
      tableName, 
      columnNames = [],
      columnTypes = [],
      columnLengths = [],
      primaryKey = [],
      notNull = [],
      unique = [],
      autoIncrement = [],
      defaultValues = [],
      foreignKeys = [],
      checkConstraints = [],
      indexes = '',
      triggers = ''
    } = req.body;
    
    if (!tableName || !columnNames.length) {
      throw new Error('Table name and at least one column are required');
    }
    
    const schema = {};
    const options = {
      indexes: [],
      triggers: []
    };
    
    for (let i = 0; i < columnNames.length; i++) {
      const columnName = columnNames[i];
      if (!columnName) continue;
      
      const columnDef = {
        type: columnTypes[i] || 'VARCHAR'
      };
      
      if (columnLengths[i] && ['VARCHAR', 'TEXT'].includes(columnDef.type)) {
        columnDef.type = `${columnDef.type}(${columnLengths[i]})`;
      }
      
      // Add constraints
      if (primaryKey.includes(i.toString())) {
        columnDef.primaryKey = true;
      }
      
      if (notNull.includes(i.toString())) {
        columnDef.notNull = true;
      }
      
      if (unique.includes(i.toString())) {
        columnDef.unique = true;
      }
      
      if (autoIncrement.includes(i.toString())) {
        columnDef.autoIncrement = true;
      }
      
      if (defaultValues[i] && defaultValues[i].trim()) {
        let defaultValue = defaultValues[i].trim();
        if (defaultValue.toLowerCase() === 'true') {
          defaultValue = true;
        } else if (defaultValue.toLowerCase() === 'false') {
          defaultValue = false;
        } else if (!isNaN(defaultValue) && !isNaN(parseFloat(defaultValue))) {
          defaultValue = parseFloat(defaultValue);
        }
        columnDef.default = defaultValue;
      }
      
      if (foreignKeys[i] && foreignKeys[i].trim()) {
        const fkParts = foreignKeys[i].trim().split('.');
        if (fkParts.length === 2) {
          columnDef.foreignKey = {
            references: foreignKeys[i].trim(),
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
          };
        }
      }
      
      if (checkConstraints[i] && checkConstraints[i].trim()) {
        columnDef.check = checkConstraints[i].trim();
      }
      
      schema[columnName] = columnDef;
    }
    
    // Process indexes
    if (indexes && indexes.trim()) {
      const indexLines = indexes.trim().split('\n');
      for (const line of indexLines) {
        if (line.trim()) {
          const isUnique = line.includes('UNIQUE');
          const columnsStr = line.replace('UNIQUE', '').trim();
          const columns = columnsStr.split(',').map(col => col.trim());
          
          if (columns.length > 0 && columns[0]) {
            options.indexes.push({
              name: `idx_${columns.join('_')}`,
              columns: columns,
              unique: isUnique
            });
          }
        }
      }
    }
    
    // Process triggers
    if (triggers && triggers.trim()) {
      const triggerLines = triggers.trim().split('\n');
      for (const line of triggerLines) {
        if (line.trim() && line.includes(':')) {
          const [timing_event, action] = line.split(':');
          const parts = timing_event.trim().split(' ');
          if (parts.length >= 2) {
            options.triggers.push({
              name: `trigger_${Date.now()}`,
              timing: parts[0],
              event: parts[1],
              action: action.trim()
            });
          }
        }
      }
    }
    
    await db.createTableDirect(tableName, schema, options, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
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
    
    Object.keys(data).forEach(key => {
      if (data[key] === '') {
        delete data[key];
      }
    });
    
    await db.insertRowDirect(tableName, data, group || null, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    const redirectUrl = group ? `/table/${tableName}?group=${group}` : `/table/${tableName}`;
    res.redirect(redirectUrl);
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
    
    await db.updateRowDirect(tableName, rowId, updates, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    const redirectUrl = group ? `/table/${tableName}?group=${group}` : `/table/${tableName}`;
    res.redirect(redirectUrl);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/delete-row/:tableName/:rowId', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, rowId } = req.params;
    const { returnGroup } = req.body;
    
    await db.deleteRowDirect(tableName, rowId, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    const redirectUrl = returnGroup ? `/table/${tableName}?group=${returnGroup}` : `/table/${tableName}`;
    res.redirect(redirectUrl);
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
    
    await db.createGroupDirect(tableName, groupName, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.redirect(`/table/${tableName}?group=${groupName}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/delete-group/:tableName/:groupName', async (req, res) => {
  try {
    await ensureDbInitialized();
    const { tableName, groupName } = req.params;
    
    await db.deleteGroupDirect(tableName, groupName, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
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
    
    const result = await db.executeQuery(sql, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
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

app.post('/switch-database', async (req, res) => {
  try {
    const { databaseName } = req.body;
    
    await db.switchDatabase(databaseName);
    currentDatabase = databaseName;
    dbInitialized = true;
    
    res.redirect(`/?db=${databaseName}`);
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/create-database', async (req, res) => {
  try {
    const { databaseName } = req.body;
    
    await db.createDatabase(databaseName);
    res.redirect('/');
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.post('/delete-database', async (req, res) => {
  try {
    const { databaseName } = req.body;
    
    if (databaseName === currentDatabase) {
      throw new Error('Cannot delete the currently active database');
    }
    
    await db.deleteDatabase(databaseName);
    res.redirect('/');
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.get('/security', async (req, res) => {
  try {
    const report = await db.getSecurityReport();
    res.render('security', { report: report, title: 'Security Report' });
  } catch (error) {
    res.render('error', { error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { error: 'Something went wrong!' });
});

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
