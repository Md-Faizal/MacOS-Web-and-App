const crypto = require('crypto');

module.exports = function(db) {
  function computeErrorHash(message, stack) {
    if (!message && !stack) return null;
    const str = `${message || ''}::${(stack || '').split('\n').slice(0, 3).join('\n')}`;
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
  }

  return {
    insertLog: function(log) {
      const stmt = db.prepare(`
        INSERT INTO app_logs (
          session_id, device_id, user_id, user_name, level, 
          platform, app_version, os_version, message, stack, 
          breadcrumbs, metadata, status, error_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const errorHash = computeErrorHash(log.message, log.stack);
      const breadcrumbsStr = log.breadcrumbs ? (typeof log.breadcrumbs === 'string' ? log.breadcrumbs : JSON.stringify(log.breadcrumbs)) : null;
      const metadataStr = log.metadata ? (typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)) : null;

      const result = stmt.run(
        log.sessionId || log.session_id || null,
        log.deviceId || log.device_id || null,
        log.userId || log.user_id || null,
        log.userName || log.user_name || null,
        (log.level || 'INFO').toUpperCase(),
        (log.platform || 'android').toLowerCase(),
        log.appVersion || log.app_version || null,
        log.osVersion || log.os_version || null,
        log.message || '',
        log.stack || null,
        breadcrumbsStr,
        metadataStr,
        log.status || 'open',
        errorHash
      );

      return { success: true, id: result.lastInsertRowid };
    },

    insertBatchLogs: function(logsArray) {
      if (!Array.isArray(logsArray) || logsArray.length === 0) {
        return { success: true, insertedCount: 0 };
      }

      const stmt = db.prepare(`
        INSERT INTO app_logs (
          session_id, device_id, user_id, user_name, level, 
          platform, app_version, os_version, message, stack, 
          breadcrumbs, metadata, status, error_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((logs) => {
        let count = 0;
        for (const log of logs) {
          const errorHash = computeErrorHash(log.message, log.stack);
          const breadcrumbsStr = log.breadcrumbs ? (typeof log.breadcrumbs === 'string' ? log.breadcrumbs : JSON.stringify(log.breadcrumbs)) : null;
          const metadataStr = log.metadata ? (typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)) : null;

          stmt.run(
            log.sessionId || log.session_id || null,
            log.deviceId || log.device_id || null,
            log.userId || log.user_id || null,
            log.userName || log.user_name || null,
            (log.level || 'INFO').toUpperCase(),
            (log.platform || 'android').toLowerCase(),
            log.appVersion || log.app_version || null,
            log.osVersion || log.os_version || null,
            log.message || '',
            log.stack || null,
            breadcrumbsStr,
            metadataStr,
            log.status || 'open',
            errorHash
          );
          count++;
        }
        return count;
      });

      const insertedCount = insertMany(logsArray);
      return { success: true, insertedCount };
    },

    fetchLogs: function(options) {
      options = options || {};
      const limit = options.limit && Number(options.limit) > 0 ? Math.min(Number(options.limit), 500) : 100;
      const offset = options.offset && Number(options.offset) >= 0 ? Number(options.offset) : 0;
      const level = options.level && options.level !== 'ALL' ? options.level.toUpperCase() : null;
      const platform = options.platform && options.platform !== 'all' ? options.platform.toLowerCase() : null;
      const status = options.status && options.status !== 'all' ? options.status.toLowerCase() : null;
      const userId = options.userId || null;
      const search = options.search || null;
      const since = options.since || null;
      const until = options.until || null;

      let whereClause = ` WHERE 1=1`;
      const params = [];

      if (level) {
        whereClause += ` AND level = ?`;
        params.push(level);
      }
      if (platform) {
        whereClause += ` AND platform = ?`;
        params.push(platform);
      }
      if (status) {
        whereClause += ` AND status = ?`;
        params.push(status);
      }
      if (userId) {
        whereClause += ` AND user_id = ?`;
        params.push(userId);
      }
      if (since) {
        whereClause += ` AND datetime(created_at) >= datetime(?)`;
        params.push(since);
      }
      if (until) {
        whereClause += ` AND datetime(created_at) <= datetime(?)`;
        params.push(until);
      }
      if (search) {
        whereClause += ` AND (message LIKE ? OR stack LIKE ? OR metadata LIKE ? OR user_name LIKE ? OR device_id LIKE ?)`;
        const like = `%${search}%`;
        params.push(like, like, like, like, like);
      }

      // Count total matching
      const countSql = `SELECT COUNT(*) AS total FROM app_logs ${whereClause}`;
      const totalRow = db.prepare(countSql).get(...params);
      const total = totalRow ? totalRow.total : 0;

      // Select matching rows
      const sql = `
        SELECT 
          id, 
          session_id AS sessionId, 
          device_id AS deviceId, 
          user_id AS userId, 
          user_name AS userName, 
          level, 
          platform,
          app_version AS appVersion,
          os_version AS osVersion,
          message, 
          stack, 
          breadcrumbs,
          metadata, 
          status,
          error_hash AS errorHash,
          created_at AS createdAt 
        FROM app_logs 
        ${whereClause} 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(sql).all(...params, limit, offset);

      // Parse JSON fields
      rows.forEach(r => {
        try { r.metadata = r.metadata ? JSON.parse(r.metadata) : null; } catch (e) { /* keep as is */ }
        try { r.breadcrumbs = r.breadcrumbs ? JSON.parse(r.breadcrumbs) : null; } catch (e) { /* keep as is */ }
      });

      return { total, limit, offset, logs: rows };
    },

    getLogStats: function() {
      // 1. Total counts
      const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM app_logs`).get() || { total: 0 };
      
      // 2. Unresolved crashes
      const crashRow = db.prepare(`SELECT COUNT(*) AS unresolvedCrashes FROM app_logs WHERE level = 'CRASH' AND (status = 'open' OR status IS NULL)`).get() || { unresolvedCrashes: 0 };

      // 3. Last 24 hours errors/crashes
      const errors24hRow = db.prepare(`
        SELECT COUNT(*) AS count24h 
        FROM app_logs 
        WHERE (level = 'ERROR' OR level = 'CRASH') 
          AND datetime(created_at) >= datetime('now', '-24 hours')
      `).get() || { count24h: 0 };

      // 4. Breakdown by level
      const levelRows = db.prepare(`SELECT level, COUNT(*) as count FROM app_logs GROUP BY level`).all();
      const byLevel = { CRASH: 0, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
      levelRows.forEach(r => {
        if (r.level) byLevel[r.level.toUpperCase()] = r.count;
      });

      // 5. Breakdown by platform
      const platformRows = db.prepare(`SELECT COALESCE(platform, 'android') as platform, COUNT(*) as count FROM app_logs GROUP BY platform`).all();
      const byPlatform = { android: 0, web: 0, backend: 0, pwa: 0 };
      platformRows.forEach(r => {
        if (r.platform) byPlatform[r.platform.toLowerCase()] = r.count;
      });

      // 6. Breakdown by status
      const statusRows = db.prepare(`SELECT COALESCE(status, 'open') as status, COUNT(*) as count FROM app_logs GROUP BY status`).all();
      const byStatus = { open: 0, resolved: 0, ignored: 0 };
      statusRows.forEach(r => {
        if (r.status) byStatus[r.status.toLowerCase()] = r.count;
      });

      return {
        total: totalRow.total,
        unresolvedCrashes: crashRow.unresolvedCrashes,
        errorsLast24h: errors24hRow.count24h,
        byLevel,
        byPlatform,
        byStatus
      };
    },

    updateLogStatus: function(id, status) {
      const validStatus = ['open', 'resolved', 'ignored'].includes(status) ? status : 'open';
      const stmt = db.prepare(`UPDATE app_logs SET status = ? WHERE id = ?`);
      const result = stmt.run(validStatus, id);
      return { success: result.changes > 0 };
    },

    bulkUpdateStatus: function(ids, status) {
      if (!Array.isArray(ids) || ids.length === 0) return { success: true, updatedCount: 0 };
      const validStatus = ['open', 'resolved', 'ignored'].includes(status) ? status : 'open';
      const placeholders = ids.map(() => '?').join(',');
      const stmt = db.prepare(`UPDATE app_logs SET status = ? WHERE id IN (${placeholders})`);
      const result = stmt.run(validStatus, ...ids);
      return { success: true, updatedCount: result.changes };
    },

    deleteLogs: function(options) {
      options = options || {};
      if (options.id) {
        const stmt = db.prepare(`DELETE FROM app_logs WHERE id = ?`);
        const result = stmt.run(options.id);
        return { success: true, deletedCount: result.changes };
      }
      if (options.clearResolved) {
        const stmt = db.prepare(`DELETE FROM app_logs WHERE status = 'resolved' OR status = 'ignored'`);
        const result = stmt.run();
        return { success: true, deletedCount: result.changes };
      }
      if (options.olderThanDays && Number(options.olderThanDays) > 0) {
        const stmt = db.prepare(`DELETE FROM app_logs WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')`);
        const result = stmt.run(Number(options.olderThanDays));
        return { success: true, deletedCount: result.changes };
      }
      if (options.all) {
        const stmt = db.prepare(`DELETE FROM app_logs`);
        const result = stmt.run();
        return { success: true, deletedCount: result.changes };
      }
      return { success: false, error: 'No deletion criteria provided' };
    },

    exportLogs: function(options) {
      options = options || {};
      const { logs } = this.fetchLogs({ ...options, limit: 1000, offset: 0 });
      return logs;
    }
  };
};
