module.exports = function(router, handlers) {
  // POST /api/logs/app
  router.post('/app', (req, res) => {
    try {
      const body = req.body || {};
      handlers.insertLog(body);
      res.json({ success: true });
    } catch (err) {
      console.error('[Logs] Failed to insert log:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs - inspection endpoint (supports filtering)
  router.get('/', (req, res) => {
    try {
      const q = req.query || {};
      const opts = {
        limit: q.limit || 100,
        level: q.level,
        userId: q.user_id || q.userId,
        search: q.search,
        since: q.since,
        until: q.until
      };
      const rows = handlers.fetchLogs(opts);
      res.json({ success: true, count: rows.length, logs: rows });
    } catch (err) {
      console.error('[Logs] Failed to fetch logs:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
};
