const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');

class SecurityManager {
  constructor(options = {}) {
    this.options = {
      maxQueryLength: options.maxQueryLength || 10000,
      maxTableNameLength: options.maxTableNameLength || 50,
      maxColumnNameLength: options.maxColumnNameLength || 50,
      maxValueLength: options.maxValueLength || 10000,
      maxTablesPerDatabase: options.maxTablesPerDatabase || 100,
      maxRowsPerTable: options.maxRowsPerTable || 10000,
      maxGroupsPerTable: options.maxGroupsPerTable || 50,
      enableQueryLogging: options.enableQueryLogging !== false,
      enableRateLimiting: options.enableRateLimiting !== false,
      trustedHosts: options.trustedHosts || ['localhost', '127.0.0.1'],
      ...options
    };
    
    this.queryLog = [];
    this.suspiciousActivity = [];
    this.blockedIPs = new Set();
  }

  // Input Validation and Sanitization
  sanitizeInput(input, type = 'general') {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Remove potential XSS and injection attempts
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/data:text\/html/gi, '');

    switch (type) {
      case 'sql':
        return this.sanitizeSQLInput(sanitized);
      case 'identifier':
        return this.sanitizeIdentifier(sanitized);
      case 'value':
        return this.sanitizeValue(sanitized);
      default:
        return sanitized.trim();
    }
  }

  sanitizeSQLInput(sql) {
    // Basic SQL injection prevention
    const dangerous = [
      /(\b(ALTER|CREATE|DELETE|DROP|EXEC|EXECUTE|INSERT|MERGE|SELECT|UPDATE|UNION|USE)\b)/gi,
      /(\b(AND|OR)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/gi,
      /([\'\"].*[\'\"].*[\'\"])/gi, // Multiple quotes
      /(\-\-|\#|\/\*|\*\/)/g, // SQL comments
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT|ONLOAD|ONERROR|ONCLICK)\b)/gi
    ];

    // Only allow our supported keywords
    const allowedKeywords = [
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'CREATE', 'TABLE',
      'GROUP', 'BY', 'ORDER', 'LIMIT', 'AND', 'OR', 'NOT', 'LIKE', 'BETWEEN',
      'IS', 'NULL', 'VARCHAR', 'NUMBER', 'BOOLEAN', 'TEXT'
    ];

    return sql.trim();
  }

  sanitizeIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier must be a non-empty string');
    }

    // Only allow alphanumeric, underscore, and hyphen
    const sanitized = identifier.replace(/[^a-zA-Z0-9_-]/g, '');
    
    if (sanitized.length === 0) {
      throw new Error('Identifier contains no valid characters');
    }

    if (sanitized.length > this.options.maxColumnNameLength) {
      throw new Error(`Identifier too long (max ${this.options.maxColumnNameLength} characters)`);
    }

    return sanitized;
  }

  sanitizeValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = String(value);
    
    if (stringValue.length > this.options.maxValueLength) {
      throw new Error(`Value too long (max ${this.options.maxValueLength} characters)`);
    }

    // Escape special characters
    return stringValue
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  // Query Validation
  validateQuery(query, context = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    if (query.length > this.options.maxQueryLength) {
      throw new Error(`Query too long (max ${this.options.maxQueryLength} characters)`);
    }

    // Check for suspicious patterns
    this.detectSuspiciousQuery(query, context);

    // Log query if enabled
    if (this.options.enableQueryLogging) {
      this.logQuery(query, context);
    }

    return true;
  }

  detectSuspiciousQuery(query, context) {
    const suspiciousPatterns = [
      /\b(UNION|UNION\s+ALL)\b/gi,
      /\b(EXEC|EXECUTE|SP_)\b/gi,
      /\b(XP_|SP_CONFIGURE|SP_PASSWORD)\b/gi,
      /((\%27)|(\'))\s*((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi, // OR injection
      /((\%27)|(\'))\s*union/gi,
      /\b(AND|OR)\s+[\d\w]+\s*=\s*[\d\w]+\s*(--|\#)/gi,
      /\b(SELECT|INSERT|UPDATE|DELETE)\s.*\b(FROM|INTO)\s.*\b(WHERE|SET)\s.*=/gi,
      /\b(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/gi,
      /\b(BENCHMARK|SLEEP|USER|VERSION|DATABASE)\s*\(/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(query)) {
        this.reportSuspiciousActivity('sql_injection_attempt', {
          query,
          pattern: pattern.source,
          context
        });
        throw new Error('Potentially malicious query detected');
      }
    }
  }

  // SQL Injection Detection
  detectSQLInjection(sql) {
    const suspiciousPatterns = [
      /((%27)|(')\s*((%6F)|o|(%4F))((%72)|r|(%52)))/gi, // OR injection
      /union[\s\w]*select/gi, // UNION SELECT
      /drop[\s\w]*table/gi, // DROP TABLE  
      /delete[\s\w]*from/gi, // DELETE FROM (without proper WHERE)
      /insert[\s\w]*into[\s\w]*values\s*\(/gi, // Malicious INSERT
      /update[\s\w]*set/gi, // Potentially malicious UPDATE
      /;\s*(drop|delete|insert|update|create|alter)/gi, // Multiple statements
      /\/\*.*\*\//gi, // SQL comments
      /--[\s\S]*/gi, // SQL line comments
      /exec[\s\w]*\(/gi, // EXEC functions
      /script[\s\w]*:/gi, // Script injection
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sql)) {
        this.logSecurityEvent('sql_injection_attempt', {
          query: sql.substring(0, 100),
          pattern: pattern.toString()
        });
        throw new Error('Potentially malicious SQL detected');
      }
    }
    
    return true;
  }

  // Resource Limits
  validateTableLimits(database, tableName) {
    // Check if we're within table limits
    const tableCount = Object.keys(database.tables || {}).length;
    if (tableCount >= this.options.maxTablesPerDatabase) {
      throw new Error(`Maximum number of tables (${this.options.maxTablesPerDatabase}) exceeded`);
    }

    return true;
  }

  validateRowLimits(tableData) {
    if (tableData.rows && tableData.rows.length >= this.options.maxRowsPerTable) {
      throw new Error(`Maximum number of rows (${this.options.maxRowsPerTable}) exceeded`);
    }

    return true;
  }

  validateGroupLimits(tableData) {
    const groupCount = Object.keys(tableData.groups || {}).length;
    if (groupCount >= this.options.maxGroupsPerTable) {
      throw new Error(`Maximum number of groups (${this.options.maxGroupsPerTable}) exceeded`);
    }

    return true;
  }

  // Table and data validation methods
  validateTableName(tableName) {
    if (typeof tableName !== 'string') {
      throw new Error('Table name must be a string');
    }
    
    if (tableName.length === 0) {
      throw new Error('Table name cannot be empty');
    }
    
    if (tableName.length > this.options.maxTableNameLength) {
      throw new Error(`Table name too long (max ${this.options.maxTableNameLength} characters)`);
    }
    
    // Check for valid identifier pattern
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error('Table name must start with a letter and contain only letters, numbers, and underscores');
    }
    
    return true;
  }

  validateTableSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Table schema must be an object');
    }
    
    const columns = Object.keys(schema);
    if (columns.length === 0) {
      throw new Error('Table schema cannot be empty');
    }
    
    for (const column of columns) {
      this.validateColumnName(column);
      this.validateColumnType(schema[column]);
    }
    
    return true;
  }

  validateColumnName(columnName) {
    if (typeof columnName !== 'string') {
      throw new Error('Column name must be a string');
    }
    
    if (columnName.length > this.options.maxColumnNameLength) {
      throw new Error(`Column name too long (max ${this.options.maxColumnNameLength} characters)`);
    }
    
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(columnName)) {
      throw new Error('Column name must start with a letter and contain only letters, numbers, and underscores');
    }
    
    return true;
  }

  validateColumnType(columnType) {
    if (typeof columnType !== 'string') {
      throw new Error('Column type must be a string');
    }
    
    const validTypes = ['VARCHAR', 'TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME'];
    const baseType = columnType.split('(')[0].toUpperCase();
    
    if (!validTypes.includes(baseType)) {
      throw new Error(`Invalid column type: ${columnType}`);
    }
    
    return true;
  }

  validateRowData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Row data must be an object');
    }
    
    const sanitizedData = {};
    for (const [key, value] of Object.entries(data)) {
      this.validateColumnName(key);
      
      if (typeof value === 'string' && value.length > this.options.maxValueLength) {
        throw new Error(`Value too long for column ${key} (max ${this.options.maxValueLength} characters)`);
      }
      
      sanitizedData[key] = this.sanitizeInput(String(value), 'value');
    }
    
    return sanitizedData;
  }

  // Rate Limiting Middleware
  createRateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
    if (!this.options.enableRateLimiting) {
      return (req, res, next) => next();
    }

    return rateLimit({
      windowMs,
      max,
      message: {
        error: 'Too many requests from this IP',
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.reportSuspiciousActivity('rate_limit_exceeded', {
          ip: this.getClientIP(req),
          userAgent: req.get('User-Agent')
        });
        res.status(429).json({
          error: 'Too many requests from this IP',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
    });
  }

  // Security Headers Middleware
  createSecurityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
          styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "cdn.jsdelivr.net"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for development
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  // IP Validation and Blocking
  validateClientIP(req) {
    const clientIP = this.getClientIP(req);
    
    if (this.blockedIPs.has(clientIP)) {
      throw new Error('IP address is blocked');
    }

    // Check if IP is in trusted hosts (for development)
    if (this.options.trustedHosts.includes(clientIP)) {
      return true;
    }

    // Validate IP format
    if (!validator.isIP(clientIP)) {
      throw new Error('Invalid IP address');
    }

    return true;
  }

  getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           '127.0.0.1';
  }

  blockIP(ip, reason = 'security_violation', duration = 24 * 60 * 60 * 1000) {
    this.blockedIPs.add(ip);
    
    // Auto-unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ip);
    }, duration);

    this.reportSuspiciousActivity('ip_blocked', { ip, reason, duration });
  }

  // Activity Logging and Monitoring
  logQuery(query, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      query: query.substring(0, 500), // Truncate for storage
      ip: context.ip || 'unknown',
      userAgent: context.userAgent || 'unknown',
      database: context.database || 'default',
      id: crypto.randomUUID()
    };

    this.queryLog.push(logEntry);

    // Keep only last 1000 entries
    if (this.queryLog.length > 1000) {
      this.queryLog = this.queryLog.slice(-1000);
    }

    return logEntry;
  }

  reportSuspiciousActivity(type, details = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      type,
      details,
      id: crypto.randomUUID()
    };

    this.suspiciousActivity.push(report);

    // Keep only last 500 entries
    if (this.suspiciousActivity.length > 500) {
      this.suspiciousActivity = this.suspiciousActivity.slice(-500);
    }

    // Auto-block IP if multiple violations
    if (details.ip && this.shouldAutoBlock(details.ip)) {
      this.blockIP(details.ip, 'multiple_violations');
    }

    console.warn(`🚨 Suspicious Activity: ${type}`, details);
    return report;
  }

  shouldAutoBlock(ip) {
    const recentViolations = this.suspiciousActivity.filter(
      activity => 
        activity.details.ip === ip && 
        new Date() - new Date(activity.timestamp) < 60 * 60 * 1000 // Last hour
    );

    return recentViolations.length >= 5; // 5 violations in an hour = auto-block
  }

  // Data Encryption for Sensitive Fields
  encryptSensitiveData(data, fields = []) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const encrypted = { ...data };
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);

    for (const field of fields) {
      if (encrypted[field] && typeof encrypted[field] === 'string') {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAAD(Buffer.from(field)); // Additional authenticated data
        
        let encryptedData = cipher.update(encrypted[field], 'utf8', 'hex');
        encryptedData += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        encrypted[field] = {
          encrypted: true,
          data: encryptedData,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex')
        };
      }
    }

    return encrypted;
  }

  decryptSensitiveData(data, fields = []) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const decrypted = { ...data };
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);

    for (const field of fields) {
      if (decrypted[field] && typeof decrypted[field] === 'object' && decrypted[field].encrypted) {
        try {
          const decipher = crypto.createDecipher(algorithm, key);
          decipher.setAAD(Buffer.from(field));
          decipher.setAuthTag(Buffer.from(decrypted[field].authTag, 'hex'));

          let decryptedData = decipher.update(decrypted[field].data, 'hex', 'utf8');
          decryptedData += decipher.final('utf8');

          decrypted[field] = decryptedData;
        } catch (error) {
          console.error(`Failed to decrypt field ${field}:`, error.message);
          decrypted[field] = '[DECRYPTION_FAILED]';
        }
      }
    }

    return decrypted;
  }

  // Security Monitoring
  getSecurityReport() {
    return {
      timestamp: new Date().toISOString(),
      blockedIPs: Array.from(this.blockedIPs),
      recentSuspiciousActivity: this.suspiciousActivity.slice(-10),
      recentQueries: this.queryLog.slice(-10),
      statistics: {
        totalQueries: this.queryLog.length,
        totalSuspiciousActivities: this.suspiciousActivity.length,
        blockedIPsCount: this.blockedIPs.size
      }
    };
  }

  // Request Validation Middleware
  validateRequest() {
    return (req, res, next) => {
      try {
        // Validate IP
        this.validateClientIP(req);

        // Add security context to request
        req.security = {
          ip: this.getClientIP(req),
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        };

        next();
      } catch (error) {
        this.reportSuspiciousActivity('request_validation_failed', {
          ip: this.getClientIP(req),
          userAgent: req.get('User-Agent'),
          error: error.message
        });

        res.status(403).json({
          error: 'Access denied',
          message: error.message
        });
      }
    };
  }

  // Database Operation Security Wrapper
  secureOperation(operation, context = {}) {
    return async (...args) => {
      try {
        // Pre-operation security checks
        if (context.query) {
          this.validateQuery(context.query, context);
        }

        // Execute operation
        const result = await operation(...args);

        // Post-operation logging
        this.logQuery(context.query || 'direct_operation', context);

        return result;
      } catch (error) {
        this.reportSuspiciousActivity('operation_failed', {
          operation: operation.name,
          error: error.message,
          context
        });
        throw error;
      }
    };
  }

  // Security reporting and logging
  generateSecurityReport() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentEvents = this.suspiciousActivity
      .filter(event => new Date(event.timestamp) > last24Hours)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
    
    const recentQueries = this.queryLog
      .filter(query => new Date(query.timestamp) > last24Hours);
    
    return {
      totalQueries: this.queryLog.length,
      recentQueries: recentQueries.length,
      suspiciousActivities: this.suspiciousActivity.length,
      recentSuspiciousActivities: recentEvents.length,
      blockedIPs: this.blockedIPs.size,
      recentEvents: recentEvents,
      generatedAt: now.toISOString()
    };
  }

  logSecurityEvent(type, details = {}) {
    const event = {
      type,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.suspiciousActivity.push(event);
    
    // Keep only last 1000 events
    if (this.suspiciousActivity.length > 1000) {
      this.suspiciousActivity = this.suspiciousActivity.slice(-1000);
    }
    
    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SECURITY] ${type}:`, details);
    }
  }

  clearLogs() {
    this.queryLog = [];
    this.suspiciousActivity = [];
    this.blockedIPs.clear();
    return { success: true, message: 'Security logs cleared' };
  }

  validateAndSanitizeQuery(sql) {
    if (typeof sql !== 'string') {
      throw new Error('SQL query must be a string');
    }
    
    if (sql.length > this.options.maxQueryLength) {
      throw new Error(`Query too long (max ${this.options.maxQueryLength} characters)`);
    }
    
    // Check for suspicious patterns
    this.detectSQLInjection(sql);
    
    // Validate query structure
    this.validateQuery(sql);
    
    // Sanitize the query
    return this.sanitizeInput(sql, 'sql');
  }

  // Express middleware methods
  getSecurityHeaders() {
    const helmet = require('helmet');
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    });
  }

  getRateLimiter() {
    if (!this.options.enableRateLimiting) {
      return (req, res, next) => next();
    }

    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(15 * 60 / 60) // in minutes
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logSecurityEvent('rate_limit_exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          url: req.url
        });
        
        res.status(429).json({
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(15 * 60 / 60)
        });
      },
      skip: (req) => {
        // Skip rate limiting for trusted hosts
        return this.options.trustedHosts.includes(req.ip);
      }
    });
  }
}

module.exports = SecurityManager;
