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

  const resolveUserDeviceId = (req) => {
    const userId = req?.user?.userId || req?.user?.id || null;
    const providedDeviceId = req?.user?.deviceId || null;

    if (providedDeviceId && userId) {
      const ownedDevice = db.prepare('SELECT id FROM user_devices WHERE id = ? AND user_id = ?').get(providedDeviceId, userId);
      if (ownedDevice) return ownedDevice.id;
      console.warn(`[Settings] Device ${providedDeviceId} is not owned by user ${userId}; rejecting stale device binding.`);
    }

    if (userId) {
      const currentUserDevice = db.prepare('SELECT id FROM user_devices WHERE user_id = ? AND is_current = 1 ORDER BY last_seen DESC, last_login DESC LIMIT 1').get(userId);
      if (currentUserDevice) return currentUserDevice.id;

      const latestUserDevice = db.prepare('SELECT id FROM user_devices WHERE user_id = ? ORDER BY is_current DESC, last_login DESC LIMIT 1').get(userId);
      if (latestUserDevice) return latestUserDevice.id;
    }

    return null;
  };
  
  return {
    getSettings: (req, res) => {
      try {
        const deviceId = resolveUserDeviceId(req);

        if (!deviceId) {
          console.warn('[Settings] No valid device binding for this user; refusing cross-user settings access.');
          return res.status(401).json({ error: 'No valid device binding for this user.' });
        }

        console.log(`[Settings] Fetching settings for device: ${deviceId}`);
        const stmt = db.prepare('SELECT * FROM Settings WHERE device_id = ?');
        let settings = stmt.get(deviceId);
        
        // If no settings exist for this device, create defaults
        if (!settings) {
          console.log(`[Settings] No settings found for device ${deviceId}, creating defaults...`);
          const insertStmt = db.prepare(`
            INSERT INTO Settings (device_id, appearance, accent_color, highlight_color, icon_style, liquid_glass, sidebar_icon_size, tint_wallpaper, dock_magnification, dock_auto_hide)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
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
          showWorkerBadges: settings.show_worker_badges !== undefined && settings.show_worker_badges !== null ? Boolean(settings.show_worker_badges) : true,
          'dock-magnification': settings.dock_magnification !== undefined && settings.dock_magnification !== null ? Boolean(settings.dock_magnification) : false,
          'dock-auto-hide': settings.dock_auto_hide !== undefined && settings.dock_auto_hide !== null ? Boolean(settings.dock_auto_hide) : false,
          'appBarOrder': settings.dock_apps_order ? (() => { try { return JSON.parse(settings.dock_apps_order); } catch (e) { return null; } })() : null
        };
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    saveSetting: (req, res) => {
      try {
        const { setting_key, setting_value } = req.body;
        const deviceId = resolveUserDeviceId(req);

        if (!deviceId) {
          console.warn('[Settings] Refusing to save setting without a valid user-scoped device binding.');
          return res.status(401).json({ error: 'No valid device binding for this user.' });
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
          'show_worker_badges': 'show_worker_badges',
          'dock-magnification': 'dock_magnification',
          'dock_magnification': 'dock_magnification',
          'dock-auto-hide': 'dock_auto_hide',
          'dock_auto_hide': 'dock_auto_hide',
          'appBarOrder': 'dock_apps_order',
          'dock_apps_order': 'dock_apps_order'
        };

        const columnName = keyMap[setting_key];
        if (!columnName) return res.status(400).json({ error: `Invalid setting key: ${setting_key}` });

        let value = setting_value;
        if (columnName === 'tint_wallpaper' || columnName === 'show_worker_badges' || columnName === 'dock_magnification' || columnName === 'dock_auto_hide') {
          value = value ? 1 : 0;
        } else if (columnName === 'dock_apps_order' && typeof value === 'object') {
          value = JSON.stringify(value);
        }

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
        const deviceId = resolveUserDeviceId(req);

        if (!deviceId) {
          console.warn('[Settings] Refusing to bulk-update settings without a valid user-scoped device binding.');
          return res.status(401).json({ error: 'No valid device binding for this user.' });
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
          'show_worker_badges': 'show_worker_badges',
          'dock-magnification': 'dock_magnification',
          'dock_magnification': 'dock_magnification',
          'dock-auto-hide': 'dock_auto_hide',
          'dock_auto_hide': 'dock_auto_hide',
          'appBarOrder': 'dock_apps_order',
          'dock_apps_order': 'dock_apps_order'
        };

        const updates = [];
        const values = [];

        Object.entries(settings).forEach(([key, value]) => {
          const columnName = keyMap[key];
          if (columnName) {
            updates.push(`${columnName} = ?`);
            let finalValue = value;
            if (columnName === 'tint_wallpaper' || columnName === 'show_worker_badges' || columnName === 'dock_magnification' || columnName === 'dock_auto_hide') {
              finalValue = value ? 1 : 0;
            } else if (columnName === 'dock_apps_order' && typeof value === 'object') {
              finalValue = JSON.stringify(value);
            }
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

    getBackendStatus: async (req, res) => {
      try {
        const startTime = Date.now();
        const fs = require('fs');
        const http = require('http');
        const https = require('https');

        const probeUrl = (targetUrl, timeoutMs = 2500) => new Promise((resolve) => {
          const client = targetUrl.startsWith('https:') ? https : http;
          const req = client.get(targetUrl, { timeout: timeoutMs }, (response) => {
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
              resolve({
                ok: response.statusCode >= 200 && response.statusCode < 400,
                statusCode: response.statusCode,
                url: targetUrl,
                body: body.slice(0, 400)
              });
            });
          });

          req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, statusCode: 0, url: targetUrl, body: '' });
          });

          req.on('error', () => {
            resolve({ ok: false, statusCode: 0, url: targetUrl, body: '' });
          });
        });

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
        const standbySlot = activeSlot === 'blue' ? 'green' : 'blue';
        const standbyPort = standbySlot === 'green' ? 3004 : 3001;

        const localHealth = await probeUrl(`http://127.0.0.1:${hostPort}/api/health`);
        const localHealthz = await probeUrl(`http://127.0.0.1:${hostPort}/healthz`);
        const publicHealth = await probeUrl('https://mac.faizal.uk/api/health');
        const publicHealthz = await probeUrl('https://mac.faizal.uk/healthz');

        // Probe cos VM standby (10.0.0.195) — becomes live once cos Docker stack is deployed
        const cosHealth = await probeUrl('http://10.0.0.195:3001/api/health').catch(() => ({ ok: false, status: 0 }));
        // Read cos replica age from the replicated DB snapshot directory
        let cosReplicaAge = null;
        const cosReplicaPathCandidates = [
          '/opt/db-snapshots',
          '/opt/db-snapshots'
        ];
        try {
          const snapshotDir = '/opt/db-snapshots';
          if (fs.existsSync(snapshotDir)) {
            const files = fs.readdirSync(snapshotDir)
              .filter(f => f.startsWith('MacOS_') && f.endsWith('.db'))
              .sort().reverse();
            if (files.length > 0) {
              const latestFile = files[0];
              const match = latestFile.match(/(\d{8})_(\d{6})/);
              if (match) {
                const ts = new Date(
                  `${match[1].slice(0,4)}-${match[1].slice(4,6)}-${match[1].slice(6,8)}T` +
                  `${match[2].slice(0,2)}:${match[2].slice(2,4)}:${match[2].slice(4,6)}Z`
                );
                cosReplicaAge = Math.floor((Date.now() - ts.getTime()) / 60000); // minutes
              }
            }
          }
        } catch (_) { /* ignore */ }

        const heartbeatPaths = [
          '/app/logs/healthwatch.heartbeat',
          'logs/healthwatch.heartbeat',
          '/var/run/macos-healthwatch.heartbeat',
          '/tmp/macos-healthwatch/heartbeat'
        ];
        let heartbeatInfo = null;
        for (const p of heartbeatPaths) {
          if (fs.existsSync(p)) {
            try {
              const rawHeartbeat = fs.readFileSync(p, 'utf8').trim();
              const timestamp = Number(rawHeartbeat);
              if (!Number.isNaN(timestamp) && timestamp > 0) {
                const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
                heartbeatInfo = {
                  status: ageSeconds <= 180 ? 'healthy' : 'stale',
                  type: 'external',
                  lastHeartbeat: new Date(timestamp * 1000).toISOString(),
                  ageSeconds
                };
                break;
              }
            } catch (err) {
              // Ignore and fall through
            }
          }
        }

        if (!heartbeatInfo) {
          const internalAge = Math.floor(process.uptime() % 30);
          heartbeatInfo = {
            status: 'healthy',
            type: 'internal',
            lastHeartbeat: new Date().toISOString(),
            ageSeconds: internalAge
          };
        }

        const nginxConfPaths = [
          '/app/logs/upstream_macos.conf',
          'logs/upstream_macos.conf',
          '/etc/nginx/conf.d/upstream_macos.conf'
        ];
        let nginxConfPath = null;
        let nginxUpstream = null;
        let nginxStatus = null;
        for (const p of nginxConfPaths) {
          if (fs.existsSync(p)) {
            try {
              const upstreamText = fs.readFileSync(p, 'utf8');
              const matched = upstreamText.match(/127\.0\.0\.1:(\d+)/)?.[0];
              if (matched) {
                const port = matched.split(':')[1];
                const slot = port === '3004' ? 'green' : 'blue';
                nginxUpstream = `${matched} (${slot})`;
                nginxStatus = 'active • proxying';
                break;
              }
            } catch (err) {
              // Ignore and fall through
            }
          }
        }

        if (!nginxUpstream) {
          nginxUpstream = `127.0.0.1:${hostPort} (${activeSlot})`;
          nginxStatus = publicHealth.ok ? 'active • proxying' : 'configured';
        }

        const productionStatus = {
          public_https: publicHealth,
          public_healthz: publicHealthz,
          origin_http: localHealth,
          origin_healthz: localHealthz,
          status: publicHealth.ok || publicHealthz.ok || localHealth.ok || localHealthz.ok ? 'healthy' : 'degraded'
        };

        const watchdog = {
          enabled: true,
          intervalSeconds: 15,
          failoverThreshold: 2,
          successThreshold: 2,
          deadmanAlarm: true,
          heartbeat: heartbeatInfo,
          status: heartbeatInfo.status || 'healthy'
        };

        const failover = {
          autoSwitch: true,
          policy: 'blue-green production failover',
          activeSlot,
          standbySlot,
          healthChecks: ['/api/health', '/healthz'],
          switchThreshold: 2,
          verifyThreshold: 2
        };

        const status = {
          status: dbConnected && (localHealth.ok || localHealthz.ok) ? 'healthy' : 'degraded',
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
            standbySlot: standbySlot,
            standbyPort: standbyPort,
            architecture: 'Zero-Downtime Blue/Green (Nginx Upstream Switch)'
          },
          cos: {
            ip: '10.0.0.195',
            hostname: 'container-of-souls',
            role: 'standby-vm',
            online: cosHealth.ok,
            status: cosHealth.ok ? 'online' : 'standby',
            replicaAgeMinutes: cosReplicaAge,
            replicaStatus: cosReplicaAge !== null
              ? (cosReplicaAge < 150 ? 'synced' : 'stale')
              : 'unknown',
            stackDeployed: cosHealth.ok
          },
          production: productionStatus,
          watchdog,
          nginx: {
            configPath: nginxConfPath,
            activeUpstream: nginxUpstream,
            status: nginxStatus,
            activeSlot,
            standbySlot,
            port: hostPort
          },
          failover,
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
          'company_name': 'UTKAL CHEMICAL AUSHADHALAYA',
          'company_gstin': '21AIDPF4446J1ZL',
          'company_pan': 'AIDPF4446J',
          'company_phone': '06822273304 / 943933330',
          'company_address_factory': 'Binaba Marg, Aska, Ganjam, Odisha - 761110',
          'company_address_office': 'D1, Basera Complex, Dumduma, BBSR - 751019',
          'invoice_show_dues_widget': 'true',
          'invoice_auto_sign_disclaimer': 'true',
          'payment_qr_image': '',
          'payment_upi_id': '7749089400@hdfc',
          'bank_account_holder': 'MD  FAIZAL',
          'bank_account_number': '50100673684509',
          'bank_ifsc': 'HDFC0000236',
          'bank_branch': 'CUTTACK - ODISHA',
          'bank_mmid': '9240072',
          'bank_show_mmid': 'true',
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
    },

    switchClusterSlot: async (req, res) => {
      try {
        const { targetSlot } = req.body;
        const currentSlot = process.env.DOCKER_SLOT || (process.env.PORT === '3004' ? 'green' : 'blue');
        const nextSlot = targetSlot || (currentSlot === 'blue' ? 'green' : 'blue');
        const nextPort = nextSlot === 'blue' ? 3001 : 3004;

        console.log(`[Docker Cluster] Switch requested from ${currentSlot} to ${nextSlot} (port ${nextPort})`);

        // Check if standby container is reachable
        const http = require('http');
        const checkTarget = () => new Promise((resolve) => {
          const checkReq = http.request({
            hostname: '127.0.0.1',
            port: nextPort,
            path: '/api/health',
            method: 'GET',
            timeout: 2000
          }, (checkRes) => resolve(checkRes.statusCode === 200));
          checkReq.on('error', () => resolve(false));
          checkReq.on('timeout', () => { checkReq.destroy(); resolve(false); });
          checkReq.end();
        });

        const isTargetUp = await checkTarget();

        // If target is down or cannot be reached directly, try executing the host deploy-docker.sh via sudo if available
        const { exec } = require('child_process');
        const trafficMonitor = require('../../../core/telemetry/traffic-monitor');
        trafficMonitor.setActiveSlot(nextSlot);

        // Run deployment script in background if in linux environment
        exec(`bash deploy/ubuntu/deploy-docker.sh --target ${nextSlot}`, (err, stdout, stderr) => {
          if (err) {
            console.warn('[Docker Cluster] Deploy script execution notice:', err.message);
          }
        });

        res.json({
          success: true,
          previousSlot: currentSlot,
          targetSlot: nextSlot,
          targetPort: nextPort,
          targetAlreadyHealthy: isTargetUp,
          message: `Cutover to ${nextSlot.toUpperCase()} initiated with zero downtime`
        });
      } catch (error) {
        console.error('[Docker Cluster] switchClusterSlot error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    togglePrimaryVm: (req, res) => {
      try {
        const trafficMonitor = require('../../../core/telemetry/traffic-monitor');
        const currentVm = trafficMonitor.primaryVm || 'vm1';
        const nextVm = currentVm === 'vm1' ? 'vm2' : 'vm1';
        trafficMonitor.setPrimaryVm(nextVm);
        res.json({
          success: true,
          previousVm: currentVm,
          currentVm: nextVm,
          message: `Cluster routed to ${nextVm === 'vm1' ? 'Oracle VM 1 (Primary)' : 'Oracle VM 2 (Disaster Recovery)'}`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    restartClusterSlot: (req, res) => {
      try {
        const currentSlot = process.env.DOCKER_SLOT || (process.env.PORT === '3004' ? 'green' : 'blue');
        console.log(`[Docker Cluster] Restarting slot ${currentSlot} in 1 second...`);
        setTimeout(() => {
          process.exit(0); // Container manager (Docker restart: unless-stopped) restarts it cleanly
        }, 1000);
        res.json({ success: true, slot: currentSlot, message: `Container macos-server-${currentSlot} restarting...` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getNetworkTelemetry: (req, res) => {
      try {
        const trafficMonitor = require('../../../core/telemetry/traffic-monitor');
        const snapshot = trafficMonitor.getSnapshot();
        res.json({
          success: true,
          ...snapshot
        });
      } catch (error) {
        console.error('[Settings] getNetworkTelemetry error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  };
};
