const path = require('path');
const fs = require('fs');

// Robust BackupManager loader (works both in dev, PM2, and Docker container /app)
function getBackupManagerClass() {
  const candidates = [
    path.resolve(__dirname, '../../../../backend/core/backup-manager.js'),
    path.join(process.cwd(), 'backend', 'core', 'backup-manager.js'),
    '/app/backend/core/backup-manager.js'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  return require('../../../../backend/core/backup-manager.js');
}

module.exports = function(db) {
  const BackupManager = getBackupManagerClass();
  // Simple ID generator
  const generateId = () => `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    getSettings: (req, res) => {
      try {
        let deviceId = req.user?.deviceId;
        
        if (!deviceId) {
          console.log('[Settings] Device ID missing from token, attempting fallback to is_current device...');
          const currentDevice = db.prepare('SELECT id FROM user_devices WHERE is_current = 1').get();
          deviceId = currentDevice?.id;
        }

        if (!deviceId && req.user?.userId) {
          const userDevice = db.prepare('SELECT id FROM user_devices WHERE user_id = ? ORDER BY is_current DESC, last_login DESC LIMIT 1').get(req.user.userId);
          deviceId = userDevice?.id;
        }

        if (!deviceId) {
          const anyDevice = db.prepare('SELECT id FROM user_devices ORDER BY is_current DESC, last_login DESC LIMIT 1').get();
          deviceId = anyDevice ? anyDevice.id : 1;
        }

        console.log(`[Settings] Fetching settings for device: ${deviceId}`);
        const stmt = db.prepare('SELECT * FROM Settings WHERE device_id = ?');
        let settings = stmt.get(deviceId);
        
        // If no settings exist for this device, create defaults
        if (!settings) {
          console.log(`[Settings] No settings found for device ${deviceId}, creating defaults...`);
          const insertStmt = db.prepare(`
            INSERT INTO Settings (device_id, appearance, accent_color, highlight_color, icon_style, liquid_glass, sidebar_icon_size, tint_wallpaper)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insertStmt.run(deviceId, 'auto', 'blue', 'blue', 'default', 'clear', 'medium', 1);
          settings = db.prepare('SELECT * FROM Settings WHERE device_id = ?').get(deviceId);
        }
        
        // Map DB columns back to frontend keys
        const result = {
          theme: settings.appearance,
          accentColor: settings.accent_color,
          highlightColor: settings.highlight_color,
          iconStyle: settings.icon_style,
          liquidGlass: settings.liquid_glass,
          'sidebar-size': settings.sidebar_icon_size,
          'tint-wallpaper': !!settings.tint_wallpaper,
          showWorkerBadges: settings.show_worker_badges !== undefined && settings.show_worker_badges !== null ? Boolean(settings.show_worker_badges) : true
        };
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    saveSetting: (req, res) => {
      try {
        const { setting_key, setting_value } = req.body;
        let deviceId = req.user?.deviceId;
        if (!deviceId) {
          console.log('[Settings] Device ID missing from token during single save, attempting fallback...');
          const currentDevice = db.prepare('SELECT id FROM user_devices WHERE is_current = 1').get();
          deviceId = currentDevice?.id;
        }

        if (!deviceId && req.user?.userId) {
          const userDevice = db.prepare('SELECT id FROM user_devices WHERE user_id = ? ORDER BY is_current DESC, last_login DESC LIMIT 1').get(req.user.userId);
          deviceId = userDevice?.id;
        }

        if (!deviceId) {
          const anyDevice = db.prepare('SELECT id FROM user_devices ORDER BY is_current DESC, last_login DESC LIMIT 1').get();
          deviceId = anyDevice ? anyDevice.id : 1;
        }

        console.log(`[Settings] Saving single setting: ${setting_key} = ${setting_value} for device: ${deviceId}`);

        // Map frontend keys to DB columns
        const keyMap = {
          'theme': 'appearance',
          'accentColor': 'accent_color',
          'highlightColor': 'highlight_color',
          'iconStyle': 'icon_style',
          'liquidGlass': 'liquid_glass',
          'sidebar-size': 'sidebar_icon_size',
          'tint-wallpaper': 'tint_wallpaper',
          'showWorkerBadges': 'show_worker_badges',
          'show_worker_badges': 'show_worker_badges'
        };

        const columnName = keyMap[setting_key];
        if (!columnName) return res.status(400).json({ error: `Invalid setting key: ${setting_key}` });

        let value = setting_value;
        if (columnName === 'tint_wallpaper' || columnName === 'show_worker_badges') value = value ? 1 : 0;

        const stmt = db.prepare(`
          UPDATE Settings SET ${columnName} = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?
        `);
        const result = stmt.run(value, deviceId);

        if (result.changes === 0) {
          console.log(`[Settings] No row found for device ${deviceId} during single update, inserting instead...`);
          // Initialize if not exists
          const columns = ['device_id', columnName];
          const placeholders = ['?', '?'];
          const values = [deviceId, value];
          
          db.prepare(`INSERT INTO Settings (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`).run(...values);
        }

        res.json({ success: true, setting_key, setting_value });
      } catch (error) {
        console.error(`[Settings] Save error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    },

    bulkUpdateSettings: (req, res) => {
      try {
        const settings = req.body;
        let deviceId = req.user?.deviceId;
        if (!deviceId) {
          console.log('[Settings] Device ID missing from token during bulk update, attempting fallback...');
          const currentDevice = db.prepare('SELECT id FROM user_devices WHERE is_current = 1').get();
          deviceId = currentDevice?.id;
        }

        if (!deviceId && req.user?.userId) {
          const userDevice = db.prepare('SELECT id FROM user_devices WHERE user_id = ? ORDER BY is_current DESC, last_login DESC LIMIT 1').get(req.user.userId);
          deviceId = userDevice?.id;
        }

        if (!deviceId) {
          const anyDevice = db.prepare('SELECT id FROM user_devices ORDER BY is_current DESC, last_login DESC LIMIT 1').get();
          deviceId = anyDevice ? anyDevice.id : 1;
        }

        const keyMap = {
          'theme': 'appearance',
          'accentColor': 'accent_color',
          'highlightColor': 'highlight_color',
          'iconStyle': 'icon_style',
          'liquidGlass': 'liquid_glass',
          'sidebar-size': 'sidebar_icon_size',
          'tint-wallpaper': 'tint_wallpaper',
          'showWorkerBadges': 'show_worker_badges',
          'show_worker_badges': 'show_worker_badges'
        };

        const updates = [];
        const values = [];

        Object.entries(settings).forEach(([key, value]) => {
          const columnName = keyMap[key];
          if (columnName) {
            updates.push(`${columnName} = ?`);
            let finalValue = value;
            if (columnName === 'tint_wallpaper' || columnName === 'show_worker_badges') finalValue = value ? 1 : 0;
            values.push(finalValue);
          }
        });

        if (updates.length > 0) {
          console.log(`[Settings] Bulk updating ${updates.length} settings for device: ${deviceId}`);
          values.push(deviceId);
          const updateStmt = db.prepare(`
            UPDATE Settings SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?
          `);
          const result = updateStmt.run(...values);
          
          if (result.changes === 0) {
            console.log(`[Settings] No row found for device ${deviceId} during bulk update, inserting instead...`);
            // Remove deviceId from values and column lists first
            const updateValues = values.slice(0, -1);
            const columns = ['device_id', ...updates.map(u => u.split(' =')[0])];
            const placeholders = columns.map(() => '?').join(', ');
            
            db.prepare(`
              INSERT INTO Settings (${columns.join(', ')}) 
              VALUES (${placeholders})
            `).run(deviceId, ...updateValues);
          }
        }

        res.json({ success: true, count: Object.keys(settings).length });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getBackendStatus: (req, res) => {
      try {
        const startTime = Date.now();
        
        // Check database connection
        const dbCheck = db.prepare('SELECT 1').get();
        const dbConnected = !!dbCheck;
        
        // Get Settings count
        const settingsCount = db.prepare('SELECT COUNT(*) as count FROM Settings').get().count;
        
        // Get recent status checks
        const recentChecks = db.prepare(
          'SELECT check_type, status, response_time_ms, checked_at FROM status_checks ORDER BY checked_at DESC LIMIT 10'
        ).all();
        
        const responseTime = Date.now() - startTime;
        
        // Record this status check
        const checkId = generateId();
        const insertStmt = db.prepare(`
          INSERT INTO status_checks (id, check_type, status, response_time_ms, details)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        insertStmt.run(
          checkId,
          'backend_health',
          dbConnected ? 'healthy' : 'unhealthy',
          responseTime,
          JSON.stringify({ settings_count: settingsCount, timestamp: new Date().toISOString() })
        );
        
        const activeSlot = process.env.DOCKER_SLOT || (process.env.PORT === '3004' ? 'green' : 'blue');
        const hostPort = activeSlot === 'green' ? 3004 : 3001;

        const status = {
          status: dbConnected ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          database: {
            connected: dbConnected,
            settings_count: settingsCount
          },
          backend: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '1.0.0'
          },
          docker: {
            isDocker: true,
            activeSlot: activeSlot,
            activeContainer: `macos-server-${activeSlot}`,
            hostPort: hostPort,
            standbySlot: activeSlot === 'blue' ? 'green' : 'blue',
            standbyPort: activeSlot === 'blue' ? 3004 : 3001,
            architecture: 'Zero-Downtime Blue/Green (Nginx Upstream Switch)'
          },
          response_time_ms: responseTime,
          recent_checks: recentChecks.slice(0, 5)
        };
        
        res.json(status);
      } catch (error) {
        const checkId = generateId();
        try {
          const insertStmt = db.prepare(`
            INSERT INTO status_checks (id, check_type, status, details)
            VALUES (?, ?, ?, ?)
          `);
          insertStmt.run(
            checkId,
            'backend_health',
            'error',
            JSON.stringify({ error: error.message })
          );
        } catch (e) {
          // Ignore DB logging errors if the DB is truly broken
        }

        res.status(500).json({ 
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    },

    getStatusHistory: (req, res) => {
      try {
        const { type = 'backend_health', limit = 20 } = req.query;
        const stmt = db.prepare(`
          SELECT id, check_type, status, response_time_ms, details, checked_at 
          FROM status_checks 
          WHERE check_type = ? 
          ORDER BY checked_at DESC 
          LIMIT ?
        `);
        
        const history = stmt.all(type, parseInt(limit));
        res.json(history);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getDbTables: (req, res) => {
      try {
        const ALLOWED_TABLES = [
          'notes', 'note_images', 'status_checks', 'categories', 'products',
          'variants', 'batches', 'ledger', 'order_items', 'user_devices',
          'login_history', 'Settings', 'user_profile', 'invoice_items', 'orders',
          'invoices', 'customer_item_memory', 'contacts', 'desktop_state',
          'clock_settings', 'weather_settings', 'quick_notes', 'reminders',
          'payments', 'cloud_files', 'cloud_batch_shares'
        ];

        const query = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        const dbTables = query.all().map(r => r.name).filter(name => ALLOWED_TABLES.includes(name));

        const tablesInfo = dbTables.map(name => {
          const colQuery = db.prepare(`PRAGMA table_info(\`${name}\`)`);
          const columns = colQuery.all().map(c => c.name);

          const countQuery = db.prepare(`SELECT COUNT(*) as count FROM \`${name}\``);
          const count = countQuery.get().count;

          return { name, columns, count };
        });

        res.json({ tables: tablesInfo });
      } catch (error) {
        console.error('[Settings API] getDbTables error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    getDbTableRows: (req, res) => {
      try {
        const tableName = req.params.name;
        const ALLOWED_TABLES = [
          'notes', 'note_images', 'status_checks', 'categories', 'products',
          'variants', 'batches', 'ledger', 'order_items', 'user_devices',
          'login_history', 'Settings', 'user_profile', 'invoice_items', 'orders',
          'invoices', 'customer_item_memory', 'contacts', 'desktop_state',
          'clock_settings', 'weather_settings', 'quick_notes', 'reminders',
          'payments', 'cloud_files', 'cloud_batch_shares'
        ];

        if (!ALLOWED_TABLES.includes(tableName)) {
          return res.status(400).json({ error: 'Access denied: Invalid or restricted table name.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        let sortBy = req.query.sortBy || '';
        let sortOrder = req.query.sortOrder || 'ASC';

        const columnData = db.prepare(`PRAGMA table_info(\`${tableName}\`)`).all();
        const columns = columnData.map(c => c.name);
        const columnTypes = {};
        columnData.forEach(c => { columnTypes[c.name] = c.type; });

        if (sortBy && !columns.includes(sortBy)) {
          sortBy = '';
        }
        if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
          sortOrder = 'ASC';
        }

        let whereClause = '';
        let params = [];
        if (search) {
          whereClause = ' WHERE ' + columns.map(col => `\`${col}\` LIKE ?`).join(' OR ');
          params = columns.map(() => `%${search}%`);
        }

        const countQuery = db.prepare(`SELECT COUNT(*) as count FROM \`${tableName}\` ${whereClause}`);
        const total = countQuery.get(...params).count;

        const offset = (page - 1) * limit;
        let queryStr = `SELECT * FROM \`${tableName}\` ${whereClause}`;
        if (sortBy) {
          queryStr += ` ORDER BY \`${sortBy}\` ${sortOrder}`;
        }
        queryStr += ' LIMIT ? OFFSET ?';

        const rows = db.prepare(queryStr).all(...params, limit, offset);

        res.json({
          rows,
          total,
          page,
          limit,
          columns,
          columnTypes
        });
      } catch (error) {
        console.error('[Settings API] getDbTableRows error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    addDbTableRow: (req, res) => {
      try {
        const tableName = req.params.name;
        const ALLOWED_TABLES = [
          'notes', 'note_images', 'status_checks', 'categories', 'products',
          'variants', 'batches', 'ledger', 'order_items', 'user_devices',
          'login_history', 'Settings', 'user_profile', 'invoice_items', 'orders',
          'invoices', 'customer_item_memory', 'contacts', 'desktop_state',
          'clock_settings', 'weather_settings', 'quick_notes', 'reminders',
          'payments', 'cloud_files', 'cloud_batch_shares'
        ];

        if (!ALLOWED_TABLES.includes(tableName)) {
          return res.status(400).json({ error: 'Access denied: Invalid or restricted table name.' });
        }

        const { data } = req.body;
        if (!data || typeof data !== 'object') {
          return res.status(400).json({ error: 'Invalid body data' });
        }

        const columns = db.prepare(`PRAGMA table_info(\`${tableName}\`)`).all().map(c => c.name);

        const cols = [];
        const placeholders = [];
        const params = [];

        Object.entries(data).forEach(([col, val]) => {
          if (columns.includes(col) && (col !== 'id' || (val !== '' && val !== null))) {
            cols.push(`\`${col}\``);
            placeholders.push('?');
            params.push(val);
          }
        });

        if (cols.length === 0) {
          return res.status(400).json({ error: 'No valid fields provided for insertion' });
        }

        const stmt = db.prepare(`INSERT INTO \`${tableName}\` (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`);
        stmt.run(...params);

        res.json({ success: true });
      } catch (error) {
        console.error('[Settings API] addDbTableRow error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    updateDbTableRow: (req, res) => {
      try {
        const tableName = req.params.name;
        const ALLOWED_TABLES = [
          'notes', 'note_images', 'status_checks', 'categories', 'products',
          'variants', 'batches', 'ledger', 'order_items', 'user_devices',
          'login_history', 'Settings', 'user_profile', 'invoice_items', 'orders',
          'invoices', 'customer_item_memory', 'contacts', 'desktop_state',
          'clock_settings', 'weather_settings', 'quick_notes', 'reminders',
          'payments', 'cloud_files', 'cloud_batch_shares'
        ];

        if (!ALLOWED_TABLES.includes(tableName)) {
          return res.status(400).json({ error: 'Access denied: Invalid or restricted table name.' });
        }

        const { rowIdColumn, rowIdValue, data } = req.body;
        if (!rowIdColumn || rowIdValue === undefined || !data) {
          return res.status(400).json({ error: 'Missing required parameters: rowIdColumn, rowIdValue, or data' });
        }

        const columns = db.prepare(`PRAGMA table_info(\`${tableName}\`)`).all().map(c => c.name);

        if (!columns.includes(rowIdColumn)) {
          return res.status(400).json({ error: 'Invalid row identifier column' });
        }

        const updateFields = [];
        const params = [];

        Object.entries(data).forEach(([col, val]) => {
          if (col !== rowIdColumn && columns.includes(col)) {
            updateFields.push(`\`${col}\` = ?`);
            params.push(val);
          }
        });

        if (updateFields.length === 0) {
          return res.json({ success: true, message: 'No fields to update' });
        }

        params.push(rowIdValue);
        const stmt = db.prepare(`UPDATE \`${tableName}\` SET ${updateFields.join(', ')} WHERE \`${rowIdColumn}\` = ?`);
        stmt.run(...params);

        res.json({ success: true });
      } catch (error) {
        console.error('[Settings API] updateDbTableRow error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    deleteDbTableRows: (req, res) => {
      try {
        const tableName = req.params.name;
        const ALLOWED_TABLES = [
          'notes', 'note_images', 'status_checks', 'categories', 'products',
          'variants', 'batches', 'ledger', 'order_items', 'user_devices',
          'login_history', 'Settings', 'user_profile', 'invoice_items', 'orders',
          'invoices', 'customer_item_memory', 'contacts', 'desktop_state',
          'clock_settings', 'weather_settings', 'quick_notes', 'reminders',
          'payments', 'cloud_files', 'cloud_batch_shares'
        ];

        if (!ALLOWED_TABLES.includes(tableName)) {
          return res.status(400).json({ error: 'Access denied: Invalid or restricted table name.' });
        }

        const { rowIdColumn, rowIds, selectAll, search, excludedRowIds } = req.body;
        if (!rowIdColumn) {
          return res.status(400).json({ error: 'Missing rowIdColumn' });
        }

        const columns = db.prepare(`PRAGMA table_info(\`${tableName}\`)`).all().map(c => c.name);

        if (!columns.includes(rowIdColumn)) {
          return res.status(400).json({ error: 'Invalid row identifier column' });
        }

        let result;
        if (selectAll) {
          let whereClause = '';
          let params = [];
          if (search) {
            whereClause = ' WHERE (' + columns.map(col => `\`${col}\` LIKE ?`).join(' OR ') + ')';
            params = columns.map(() => `%${search}%`);
          }
          
          if (Array.isArray(excludedRowIds) && excludedRowIds.length > 0) {
            const placeholders = excludedRowIds.map(() => '?').join(', ');
            if (whereClause) {
              whereClause += ` AND \`${rowIdColumn}\` NOT IN (${placeholders})`;
            } else {
              whereClause = ` WHERE \`${rowIdColumn}\` NOT IN (${placeholders})`;
            }
            params.push(...excludedRowIds);
          }
          
          const stmt = db.prepare(`DELETE FROM \`${tableName}\` ${whereClause}`);
          result = stmt.run(...params);
        } else {
          if (!Array.isArray(rowIds) || rowIds.length === 0) {
            return res.status(400).json({ error: 'Missing rowIds array for target deletion' });
          }
          const placeholders = rowIds.map(() => '?').join(', ');
          const stmt = db.prepare(`DELETE FROM \`${tableName}\` WHERE \`${rowIdColumn}\` IN (${placeholders})`);
          result = stmt.run(...rowIds);
        }

        res.json({ success: true, deletedCount: result.changes });
      } catch (error) {
        console.error('[Settings API] deleteDbTableRows error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    executeDbQuery: (req, res) => {
      try {
        const { sql } = req.body;
        if (!sql || typeof sql !== 'string') {
          return res.status(400).json({ error: 'SQL query string required' });
        }

        const cleanSql = sql.trim().replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)--.*$/gm, '');
        const isSelect = /^\s*select\b/i.test(cleanSql);
        const hasWriteKeywords = /\b(insert|update|delete|drop|alter|create|replace|truncate|grant|revoke|pragma|vacuum|into|reindex)\b/i.test(cleanSql);

        if (!isSelect || hasWriteKeywords) {
          return res.status(403).json({ error: 'Security constraint violation: Only read-only SELECT queries are allowed.' });
        }

        const rows = db.prepare(sql).all();
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        res.json({ rows, columns });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    getBackupConfig: (req, res) => {
      try {
        const backupManager = new BackupManager(db);
        const config = backupManager.getConfig();
        // Mask secret key partially for security when sending to frontend
        const maskedConfig = { ...config };
        if (maskedConfig.r2SecretAccessKey && maskedConfig.r2SecretAccessKey.length > 8) {
          maskedConfig.r2SecretAccessKeyMasked = maskedConfig.r2SecretAccessKey.slice(0, 4) + '••••••••' + maskedConfig.r2SecretAccessKey.slice(-4);
        } else {
          maskedConfig.r2SecretAccessKeyMasked = '';
        }
        res.json({ success: true, config: maskedConfig });
      } catch (error) {
        console.error('[Settings] getBackupConfig error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    saveBackupConfig: (req, res) => {
      try {
        const backupManager = new BackupManager(db);
        const newSettings = req.body;
        
        // If user left masked secret key as empty or unchanged placeholder, don't overwrite with dots
        if (newSettings.r2SecretAccessKey && newSettings.r2SecretAccessKey.includes('••••')) {
          delete newSettings.r2SecretAccessKey;
        }

        backupManager.saveConfig(newSettings);
        res.json({ success: true });
      } catch (error) {
        console.error('[Settings] saveBackupConfig error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    testBackupR2: async (req, res) => {
      try {
        const backupManager = new BackupManager(db);
        let testConfig = req.body;
        
        // If secret was omitted, fallback to saved secret
        if (!testConfig.r2SecretAccessKey || testConfig.r2SecretAccessKey.includes('••••')) {
          const current = backupManager.getConfig();
          testConfig.r2SecretAccessKey = current.r2SecretAccessKey;
        }

        const result = await backupManager.testR2Connection(testConfig);
        res.json(result);
      } catch (error) {
        console.error('[Settings] testBackupR2 error:', error);
        res.status(400).json({ error: error.message });
      }
    },

    createDbBackup: async (req, res) => {
      try {
        const backupManager = new BackupManager(db);
        const result = await backupManager.runBackup({ source: 'manual-ui' });
        res.json(result);
      } catch (error) {
        console.error('[Backup System] createDbBackup error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    getDbBackups: (req, res) => {
      try {
        const backupManager = new BackupManager(db);
        const files = backupManager.listLocalBackups();
        res.json({ backups: files });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    restoreDbBackup: async (req, res) => {
      try {
        const { filename } = req.body;
        if (!filename || typeof filename !== 'string') {
          return res.status(400).json({ error: 'Filename parameter required' });
        }
        
        const backupManager = new BackupManager(db);
        const result = await backupManager.restoreBackup(filename);
        res.json(result);
      } catch (error) {
        console.error('[Backup System] restoreDbBackup error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    deleteDbBackup: (req, res) => {
      try {
        const { filename } = req.body;
        if (!filename || typeof filename !== 'string') {
          return res.status(400).json({ error: 'Filename parameter required' });
        }
        
        const backupManager = new BackupManager(db);
        const result = backupManager.deleteBackup(filename);
        res.json(result);
      } catch (error) {
        console.error('[Backup System] deleteDbBackup error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    getAppSettings: (req, res) => {
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT DEFAULT 'string',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
        const app_settings = {};
        for (const row of rows) {
          app_settings[row.setting_key] = row.setting_value;
        }

        const defaults = {
          'invoice_duplex_print': 'true',
          'payment_qr_image': '',
          'payment_upi_id': '7749089400@hdfc',
          'bank_account_holder': 'MD  FAIZAL',
          'bank_account_number': '50100673684509',
          'bank_ifsc': 'HDFC0000236',
          'bank_branch': 'CUTTACK - ODISHA',
          'bank_mmid': '9240072',
          'bank_account_type': 'Savings Account',
          'portal_base_url': 'https://mac.faizal.uk'
        };

        for (const [k, v] of Object.entries(defaults)) {
          if (app_settings[k] === undefined || app_settings[k] === null) {
            app_settings[k] = v;
          }
        }

        res.json(app_settings);
      } catch (error) {
        console.error('[Settings] getAppSettings error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    saveAppSettings: (req, res) => {
      try {
        db.prepare(`
          CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT NOT NULL UNIQUE,
            setting_value TEXT NOT NULL,
            setting_type TEXT DEFAULT 'string',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        const generateId = () => `set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const settings = req.body.settings || req.body;
        const insertStmt = db.prepare(`
          INSERT INTO app_settings (id, setting_key, setting_value, setting_type, updated_at)
          VALUES (?, ?, ?, 'string', CURRENT_TIMESTAMP)
          ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
        `);

        const transaction = db.transaction(() => {
          for (const [k, v] of Object.entries(settings)) {
            if (k && typeof k === 'string') {
              const strVal = v === null || v === undefined ? '' : String(v);
              insertStmt.run(generateId(), k, strVal);
            }
          }
        });
        transaction();

        res.json({ success: true });
      } catch (error) {
        console.error('[Settings] saveAppSettings error:', error);
        res.status(500).json({ error: error.message });
      }
    }
  };
};
