module.exports = function(db) {
  return {
    insertLog: function(log) {
      const stmt = db.prepare(`INSERT INTO app_logs (session_id, device_id, user_id, user_name, level, message, stack, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      stmt.run(
        log.sessionId || null,
        log.deviceId || null,
        log.userId || null,
        log.userName || null,
        log.level || 'INFO',
        log.message || '',
        log.stack || null,
        log.metadata ? JSON.stringify(log.metadata) : null
      );
      return { success: true };
    },

    fetchLogs: function(options) {
      options = options || {};
      const limit = options.limit && Number(options.limit) > 0 ? Number(options.limit) : 100;
      const level = options.level || null;
      const userId = options.userId || null;
      const search = options.search || null;
      const since = options.since || null;
      const until = options.until || null;

      let sql = `SELECT id, session_id AS sessionId, device_id AS deviceId, user_id AS userId, user_name AS userName, level, message, stack, metadata, created_at AS createdAt FROM app_logs WHERE 1=1`;
      const params = [];

      if (level) {
        sql += ` AND level = ?`;
        params.push(level);
      }
      if (userId) {
        sql += ` AND user_id = ?`;
        params.push(userId);
      }
      if (since) {
        sql += ` AND datetime(created_at) >= datetime(?)`;
        params.push(since);
      }
      if (until) {
        sql += ` AND datetime(created_at) <= datetime(?)`;
        params.push(until);
      }
      if (search) {
        sql += ` AND (message LIKE ? OR stack LIKE ? OR metadata LIKE ?)`;
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      sql += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        // Parse metadata JSON where present
        rows.forEach(r => {
          try { r.metadata = r.metadata ? JSON.parse(r.metadata) : null } catch (e) { r.metadata = r.metadata }
        });
        return rows;
      } catch (err) {
        throw err;
      }
    }
  };
};
