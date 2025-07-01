// Custom Database Engine - Frontend Application
class DatabaseApp {
    constructor() {
        this.apiBase = '/';
        this.currentDatabase = 'main';
        this.currentTable = null;
        this.activeTransactions = new Map();
        this.lastQueryResult = null;
        
        this.init();
    }

    async init() {
        try {
            await this.checkConnection();
            await this.loadDatabaseInfo();
            await this.loadTables();
            await this.loadStats();
            this.setupEventListeners();
            this.showToast('success', 'Connected', 'Successfully connected to database');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateConnectionStatus(false);
            this.showToast('error', 'Connection Failed', error.message);
        }
    }

    async checkConnection() {
        const response = await fetch(`${this.apiBase}health`);
        if (!response.ok) {
            throw new Error('Database connection failed');
        }
        this.updateConnectionStatus(true);
        return response.json();
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator');
        if (connected) {
            indicator.innerHTML = '<i class="fas fa-circle"></i><span>Connected</span>';
            indicator.className = 'status-indicator';
        } else {
            indicator.innerHTML = '<i class="fas fa-circle"></i><span>Disconnected</span>';
            indicator.className = 'status-indicator disconnected';
        }
    }

    async loadDatabaseInfo() {
        try {
            const response = await fetch(`${this.apiBase}schema`);
            const result = await response.json();
            
            if (result.success) {
                this.displaySchema(result.data);
            }
        } catch (error) {
            console.error('Failed to load database info:', error);
        }
    }

    async loadTables() {
        try {
            const response = await fetch(`${this.apiBase}tables`);
            const result = await response.json();
            
            if (result.success) {
                this.displayTables(result.data || []);
                this.displayTablesInSidebar(result.data || []);
            }
        } catch (error) {
            console.error('Failed to load tables:', error);
            this.displayTables([]);
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.apiBase}stats`);
            const result = await response.json();
            
            if (result.success) {
                this.displayStats(result.data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    displayStats(stats) {
        document.getElementById('tableCount').textContent = stats.tables || 0;
        document.getElementById('recordCount').textContent = stats.records || 0;
        document.getElementById('bufferHitRate').textContent = `${(stats.bufferHitRate || 0).toFixed(1)}%`;
        document.getElementById('activeTransactions').textContent = stats.activeTransactions || 0;
    }

    displaySchema(schema) {
        const container = document.getElementById('schemaContainer');
        
        if (!schema || Object.keys(schema).length === 0) {
            container.innerHTML = '<p class="text-muted">No tables found in the database.</p>';
            return;
        }

        const schemaHtml = Object.entries(schema).map(([tableName, table]) => `
            <div class="schema-table">
                <div class="schema-table-header">
                    <i class="fas fa-table"></i> ${tableName}
                </div>
                <div class="schema-columns">

                // error here
                
                ${table.columns.map(column => ` 

                // error here
                        <div class="schema-column">
                            <div class="column-info">
                                <span class="column-name">${column.name}</span>
                                <span class="column-type">${column.type}</span>
                            </div>
                            <div class="column-constraints">
                                ${column.primaryKey ? '<span class="constraint-badge primary">PK</span>' : ''}
                                ${column.unique ? '<span class="constraint-badge unique">UNIQUE</span>' : ''}
                                ${!column.nullable ? '<span class="constraint-badge not-null">NOT NULL</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        container.innerHTML = schemaHtml;
    }

    displayTables(tables) {
        const container = document.getElementById('tablesGrid');
        
        if (!tables || tables.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-table"></i>
                    <h3>No Tables Found</h3>
                    <p>Create your first table to get started</p>
                    <button class="btn btn-primary" onclick="openCreateTableModal()">
                        <i class="fas fa-plus"></i> Create Table
                    </button>
                </div>
            `;
            return;
        }

        const tablesHtml = tables.map(table => `
            <div class="table-card" onclick="viewTableData('${table.name}')">
                <div class="table-card-header">
                    <h3><i class="fas fa-table"></i> ${table.name}</h3>
                    <div class="table-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="exportTable('${table.name}')" title="Export">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="confirmDeleteTable('${table.name}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="table-meta">
                    ${table.columns ? table.columns.length : 0} columns • ${table.rowCount || 0} rows
                </div>
                <div class="table-columns">
                    <h4>Columns</h4>
                    <div class="column-list">
                        ${table.columns ? table.columns.slice(0, 5).map(col => 
                            `<span class="column-tag">${col.name}</span>`
                        ).join('') : ''}
                        ${table.columns && table.columns.length > 5 ? 
                            `<span class="column-tag">+${table.columns.length - 5} more</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = tablesHtml;
    }

    displayTablesInSidebar(tables) {
        const container = document.getElementById('tableList-main');
        
        const tablesHtml = tables.map(table => `
            <div class="table-item" onclick="selectTable('${table.name}')">
                <i class="fas fa-table"></i>
                <span>${table.name}</span>
            </div>
        `).join('');

        container.innerHTML = tablesHtml;
        
        // Show the table list
        container.classList.add('expanded');
        const header = container.parentElement.querySelector('.database-header');
        header.classList.add('expanded');
    }

    setupEventListeners() {
        // Auto-update table creation SQL
        document.addEventListener('input', (e) => {
            if (e.target.closest('#createTableModal')) {
                this.updateGeneratedSQL();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.closest('#createTableModal')) {
                this.updateGeneratedSQL();
            }
        });

        // Query editor shortcuts
        const queryEditor = document.getElementById('queryEditor');
        if (queryEditor) {
            queryEditor.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    this.executeQuery();
                }
                
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.target.selectionStart;
                    const end = e.target.selectionEnd;
                    
                    e.target.value = e.target.value.substring(0, start) + 
                                   '    ' + 
                                   e.target.value.substring(end);
                    
                    e.target.selectionStart = e.target.selectionEnd = start + 4;
                }
            });
        }
    }

    updateGeneratedSQL() {
        const tableName = document.getElementById('tableName').value;
        const columns = this.getColumnDefinitions();
        
        if (!tableName || columns.length === 0) {
            document.getElementById('generatedSQL').value = '';
            return;
        }

        const columnSQL = columns.map(col => {
            let def = `    ${col.name} ${col.type}`;
            if (col.primaryKey) def += ' PRIMARY KEY';
            if (!col.nullable && !col.primaryKey) def += ' NOT NULL';
            return def;
        }).join(',\n');

        const sql = `CREATE TABLE ${tableName} (\n${columnSQL}\n);`;
        document.getElementById('generatedSQL').value = sql;
    }

    getColumnDefinitions() {
        const rows = document.querySelectorAll('.column-row');
        const columns = [];

        rows.forEach(row => {
            const name = row.querySelector('.column-name').value.trim();
            const type = row.querySelector('.column-type').value;
            const primaryKey = row.querySelector('.column-primary').checked;
            const nullable = row.querySelector('.column-nullable').checked;

            if (name) {
                columns.push({ name, type, primaryKey, nullable });
            }
        });

        return columns;
    }

    async executeQuery() {
        const query = document.getElementById('queryEditor').value.trim();
        
        if (!query) {
            this.showToast('warning', 'No Query', 'Please enter a SQL query to execute');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`${this.apiBase}sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sql: query })
            });

            const result = await response.json();
            
            if (result.success) {
                this.displayQueryResults(result.result);
                this.showToast('success', 'Query Executed', 
                    `Query completed in ${result.result.executionTime}ms`);
                
                // Refresh data if it was a modification query
                if (query.toLowerCase().includes('insert') || 
                    query.toLowerCase().includes('update') || 
                    query.toLowerCase().includes('delete') ||
                    query.toLowerCase().includes('create') ||
                    query.toLowerCase().includes('drop')) {
                    await this.loadTables();
                    await this.loadStats();
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Query Failed', error.message);
            this.displayQueryError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displayQueryResults(result) {
        const container = document.getElementById('resultsContent');
        const actionsContainer = document.getElementById('resultsActions');
        
        this.lastQueryResult = result;

        if (result.rows && result.rows.length > 0) {
            const table = this.createDataTable(result.rows);
            container.innerHTML = table;
            actionsContainer.style.display = 'flex';
        } else if (result.affectedRows !== undefined) {
            container.innerHTML = `
                <div class="query-success">
                    <i class="fas fa-check-circle"></i>
                    <h3>Query Successful</h3>
                    <p>${result.affectedRows} row(s) affected</p>
                </div>
            `;
            actionsContainer.style.display = 'none';
        } else {
            container.innerHTML = `
                <div class="query-success">
                    <i class="fas fa-check-circle"></i>
                    <h3>Query Successful</h3>
                    <p>Query executed successfully</p>
                </div>
            `;
            actionsContainer.style.display = 'none';
        }
    }

    displayQueryError(error) {
        const container = document.getElementById('resultsContent');
        const actionsContainer = document.getElementById('resultsActions');
        
        container.innerHTML = `
            <div class="query-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Query Error</h3>
                <p>${error}</p>
            </div>
        `;
        actionsContainer.style.display = 'none';
    }

    createDataTable(rows) {
        if (!rows || rows.length === 0) {
            return '<p class="text-muted">No data returned</p>';
        }

        const headers = Object.keys(rows[0]);
        
        return `
            <table class="data-table">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${headers.map(header => `<td>${this.formatCellValue(row[header])}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    formatCellValue(value) {
        if (value === null || value === undefined) {
            return '<span class="text-muted">NULL</span>';
        }
        if (typeof value === 'string' && value.length > 100) {
            return value.substring(0, 100) + '...';
        }
        return String(value);
    }

    async viewTableData(tableName) {
        this.currentTable = tableName;
        
        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.apiBase}tables/${tableName}/data?limit=100`);
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('tableDataTitle').textContent = `${tableName} - Data`;
                
                const container = document.getElementById('tableDataContent');
                if (result.data && result.data.length > 0) {
                    container.innerHTML = this.createDataTable(result.data);
                } else {
                    container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <h3>No Data</h3>
                            <p>This table contains no records</p>
                        </div>
                    `;
                }
                
                this.openModal('tableDataModal');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Load Data', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async createTable() {
        const tableName = document.getElementById('tableName').value.trim();
        const sql = document.getElementById('generatedSQL').value.trim();
        
        if (!tableName || !sql) {
            this.showToast('warning', 'Incomplete Form', 'Please fill in all required fields');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.apiBase}tables`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sql })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('success', 'Table Created', `Table '${tableName}' created successfully`);
                this.closeModal('createTableModal');
                document.getElementById('createTableForm').reset();
                this.resetColumnBuilder();
                await this.loadTables();
                await this.loadStats();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Create Table', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async confirmDeleteTable(tableName) {
        if (confirm(`Are you sure you want to delete the table '${tableName}'? This action cannot be undone.`)) {
            await this.deleteTable(tableName);
        }
    }

    async deleteTable(tableName) {
        try {
            this.showLoading(true);
            
            const response = await fetch(`${this.apiBase}tables/${tableName}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            
            if (result.success) {
                this.showToast('success', 'Table Deleted', `Table '${tableName}' deleted successfully`);
                await this.loadTables();
                await this.loadStats();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Delete Table', error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async exportTable(tableName) {
        try {
            const response = await fetch(`${this.apiBase}tables/${tableName}/export?format=csv`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tableName}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToast('success', 'Export Complete', `Table '${tableName}' exported successfully`);
            } else {
                throw new Error('Export failed');
            }
        } catch (error) {
            this.showToast('error', 'Export Failed', error.message);
        }
    }

    exportResults(format) {
        if (!this.lastQueryResult || !this.lastQueryResult.rows) {
            this.showToast('warning', 'No Data', 'No query results to export');
            return;
        }

        const data = this.lastQueryResult.rows;
        
        if (format === 'json') {
            const jsonStr = JSON.stringify(data, null, 2);
            this.downloadFile(jsonStr, 'query_results.json', 'application/json');
        } else if (format === 'csv') {
            const csv = this.convertToCSV(data);
            this.downloadFile(csv, 'query_results.csv', 'text/csv');
        }
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`).join(',')
            )
        ].join('\n');
        
        return csvContent;
    }

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    resetColumnBuilder() {
        const container = document.getElementById('columnsContainer');
        container.innerHTML = `
            <div class="column-row">
                <input type="text" placeholder="Column name" class="column-name" required>
                <select class="column-type">
                    <option value="INT">INT</option>
                    <option value="VARCHAR(255)">VARCHAR(255)</option>
                    <option value="TEXT">TEXT</option>
                    <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                    <option value="DATE">DATE</option>
                    <option value="DATETIME">DATETIME</option>
                </select>
                <label>
                    <input type="checkbox" class="column-primary"> Primary Key
                </label>
                <label>
                    <input type="checkbox" class="column-nullable"> Nullable
                </label>
                <button type="button" class="btn-icon btn-danger" onclick="removeColumn(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }

    formatQuery() {
        const editor = document.getElementById('queryEditor');
        const query = editor.value;
        
        // Simple SQL formatting
        const formatted = query
            .replace(/\s+/g, ' ')
            .replace(/SELECT/gi, '\nSELECT')
            .replace(/FROM/gi, '\nFROM')
            .replace(/WHERE/gi, '\nWHERE')
            .replace(/GROUP BY/gi, '\nGROUP BY')
            .replace(/ORDER BY/gi, '\nORDER BY')
            .replace(/HAVING/gi, '\nHAVING')
            .replace(/INSERT INTO/gi, '\nINSERT INTO')
            .replace(/UPDATE/gi, '\nUPDATE')
            .replace(/SET/gi, '\nSET')
            .replace(/DELETE FROM/gi, '\nDELETE FROM')
            .replace(/CREATE TABLE/gi, '\nCREATE TABLE')
            .replace(/ALTER TABLE/gi, '\nALTER TABLE')
            .replace(/DROP TABLE/gi, '\nDROP TABLE')
            .trim();
            
        editor.value = formatted;
    }

    async startTransaction() {
        try {
            const response = await fetch(`${this.apiBase}transactions`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                const txId = result.data.transactionId;
                this.activeTransactions.set(txId, {
                    id: txId,
                    startTime: new Date(),
                    status: 'active'
                });
                
                this.updateTransactionsList();
                this.showToast('success', 'Transaction Started', `Transaction ${txId} started successfully`);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Start Transaction', error.message);
        }
    }

    updateTransactionsList() {
        const container = document.getElementById('transactionsList');
        
        if (this.activeTransactions.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No Active Transactions</h3>
                    <p>Start a transaction to manage database operations</p>
                </div>
            `;
            return;
        }

        const transactionsHtml = Array.from(this.activeTransactions.values()).map(tx => `
            <div class="transaction-card">
                <div class="transaction-header">
                    <h4>Transaction ${tx.id}</h4>
                    <span class="transaction-status ${tx.status}">${tx.status.toUpperCase()}</span>
                </div>
                <div class="transaction-info">
                    <p><strong>Started:</strong> ${tx.startTime.toLocaleString()}</p>
                </div>
                <div class="transaction-actions">
                    <button class="btn btn-success" onclick="app.commitTransaction(${tx.id})">
                        <i class="fas fa-check"></i> Commit
                    </button>
                    <button class="btn btn-danger" onclick="app.rollbackTransaction(${tx.id})">
                        <i class="fas fa-times"></i> Rollback
                    </button>
                </div>
            </div>
        `).join('');

        container.innerHTML = transactionsHtml;
    }

    async commitTransaction(txId) {
        try {
            const response = await fetch(`${this.apiBase}transactions/${txId}/commit`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                this.activeTransactions.delete(txId);
                this.updateTransactionsList();
                this.showToast('success', 'Transaction Committed', `Transaction ${txId} committed successfully`);
                await this.loadStats();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Commit Transaction', error.message);
        }
    }

    async rollbackTransaction(txId) {
        try {
            const response = await fetch(`${this.apiBase}transactions/${txId}/rollback`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                this.activeTransactions.delete(txId);
                this.updateTransactionsList();
                this.showToast('success', 'Transaction Rolled Back', `Transaction ${txId} rolled back successfully`);
                await this.loadStats();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast('error', 'Failed to Rollback Transaction', error.message);
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    showToast(type, title, message) {
        const container = document.getElementById('toastContainer');
        const toastId = 'toast-' + Date.now();
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-header">
                <div class="toast-icon">
                    <i class="fas fa-${this.getToastIcon(type)}"></i>
                </div>
                <div class="toast-title">${title}</div>
                <button class="toast-close" onclick="app.closeToast('${toastId}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="toast-body">${message}</div>
        `;
        
        container.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Auto hide after 5 seconds
        setTimeout(() => this.closeToast(toastId), 5000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    closeToast(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }
    }
}

// Global utility functions
function showTab(tabName) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab pane
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

function toggleDatabase(dbName) {
    const header = event.target.closest('.database-header');
    const tableList = document.getElementById(`tableList-${dbName}`);
    
    header.classList.toggle('expanded');
    tableList.classList.toggle('expanded');
}

function selectTable(tableName) {
    app.currentTable = tableName;
    
    // Remove active class from all table items
    document.querySelectorAll('.table-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to selected table
    event.target.classList.add('active');
}

function refreshDatabases() {
    app.loadTables();
    app.loadStats();
    app.showToast('info', 'Refreshed', 'Database information updated');
}

function openCreateDatabaseModal() {
    app.openModal('createDatabaseModal');
}

function openCreateTableModal() {
    app.openModal('createTableModal');
    app.resetColumnBuilder();
}

function closeModal(modalId) {
    app.closeModal(modalId);
}

function addColumn() {
    const container = document.getElementById('columnsContainer');
    const newRow = document.createElement('div');
    newRow.className = 'column-row';
    newRow.innerHTML = `
        <input type="text" placeholder="Column name" class="column-name" required>
        <select class="column-type">
            <option value="INT">INT</option>
            <option value="VARCHAR(255)">VARCHAR(255)</option>
            <option value="TEXT">TEXT</option>
            <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="DATE">DATE</option>
            <option value="DATETIME">DATETIME</option>
        </select>
        <label>
            <input type="checkbox" class="column-primary"> Primary Key
        </label>
        <label>
            <input type="checkbox" class="column-nullable"> Nullable
        </label>
        <button type="button" class="btn-icon btn-danger" onclick="removeColumn(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(newRow);
}

function removeColumn(button) {
    const row = button.closest('.column-row');
    row.remove();
    app.updateGeneratedSQL();
}

function createDatabase() {
    const dbName = document.getElementById('databaseName').value.trim();
    const description = document.getElementById('databaseDescription').value.trim();
    
    if (!dbName) {
        app.showToast('warning', 'Invalid Input', 'Please enter a database name');
        return;
    }
    
    // For now, just show a success message as we're working with a single database
    app.showToast('info', 'Feature Coming Soon', 'Multiple database support will be added in future versions');
    app.closeModal('createDatabaseModal');
}

function createTable() {
    app.createTable();
}

function executeQuery() {
    app.executeQuery();
}

function formatQuery() {
    app.formatQuery();
}

function exportResults(format) {
    app.exportResults(format);
}

function startTransaction() {
    app.startTransaction();
}

function viewTableData(tableName) {
    app.viewTableData(tableName);
}

function exportTable(tableName) {
    app.exportTable(tableName);
}

function confirmDeleteTable(tableName) {
    app.confirmDeleteTable(tableName);
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DatabaseApp();
    
    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
            document.body.style.overflow = '';
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(modal => {
                modal.classList.remove('show');
            });
            document.body.style.overflow = '';
        }
    });
});
