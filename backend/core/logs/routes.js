module.exports = function(router, handlers) {
  // POST /api/logs/app - Ingest single log (Mobile / Web / Worker)
  router.post('/app', (req, res) => {
    try {
      const body = req.body || {};
      const result = handlers.insertLog(body);
      res.json({ success: true, id: result.id });
    } catch (err) {
      console.error('[Logs] Failed to insert log:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/logs/batch - Ingest batch logs (Offline sync / Mobile FIFO flusher)
  router.post('/batch', (req, res) => {
    try {
      const body = req.body || {};
      const logs = Array.isArray(body) ? body : (body.logs || []);
      const result = handlers.insertBatchLogs(logs);
      res.json({ success: true, insertedCount: result.insertedCount });
    } catch (err) {
      console.error('[Logs] Failed to insert batch logs:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs/stats - Telemetry summary metrics
  router.get('/stats', (req, res) => {
    try {
      const stats = handlers.getLogStats();
      res.json({ success: true, stats });
    } catch (err) {
      console.error('[Logs] Failed to fetch stats:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs/export - Export logs as JSON or CSV
  router.get('/export', (req, res) => {
    try {
      const q = req.query || {};
      const format = (q.format || 'json').toLowerCase();
      const logs = handlers.exportLogs(q);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="system_logs_${Date.now()}.csv"`);
        
        const headers = ['ID', 'Created At', 'Level', 'Platform', 'App Version', 'OS Version', 'User', 'Message', 'Status', 'Stack'];
        const csvRows = [headers.join(',')];

        for (const log of logs) {
          const row = [
            log.id,
            `"${log.createdAt || ''}"`,
            `"${log.level || ''}"`,
            `"${log.platform || ''}"`,
            `"${log.appVersion || ''}"`,
            `"${log.osVersion || ''}"`,
            `"${(log.userName || log.userId || '').replace(/"/g, '""')}"`,
            `"${(log.message || '').replace(/"/g, '""')}"`,
            `"${log.status || ''}"`,
            `"${(log.stack || '').replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(','));
        }
        return res.send(csvRows.join('\n'));
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="system_logs_${Date.now()}.json"`);
      return res.json(logs);
    } catch (err) {
      console.error('[Logs] Failed to export logs:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs - Inspection endpoint (supports filtering and pagination)
  router.get('/', (req, res) => {
    try {
      const q = req.query || {};
      const opts = {
        limit: q.limit,
        offset: q.offset,
        level: q.level,
        platform: q.platform,
        status: q.status,
        userId: q.user_id || q.userId,
        search: q.search,
        since: q.since,
        until: q.until
      };
      const result = handlers.fetchLogs(opts);
      res.json({ 
        success: true, 
        total: result.total,
        count: result.logs.length, 
        limit: result.limit,
        offset: result.offset,
        logs: result.logs 
      });
    } catch (err) {
      console.error('[Logs] Failed to fetch logs:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/logs/:id - Update status (resolve, reopen, ignore)
  router.patch('/:id', (req, res) => {
    try {
      const id = req.params.id;
      const status = req.body?.status || 'resolved';
      const result = handlers.updateLogStatus(id, status);
      res.json({ success: result.success });
    } catch (err) {
      console.error('[Logs] Failed to update log status:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/logs/bulk-action - Bulk resolve or bulk delete
  router.post('/bulk-action', (req, res) => {
    try {
      const { action, ids, status } = req.body || {};
      if (action === 'status') {
        const result = handlers.bulkUpdateStatus(ids, status || 'resolved');
        return res.json({ success: true, updatedCount: result.updatedCount });
      }
      if (action === 'delete') {
        let deleted = 0;
        if (Array.isArray(ids)) {
          for (const id of ids) {
            handlers.deleteLogs({ id });
            deleted++;
          }
        }
        return res.json({ success: true, deletedCount: deleted });
      }
      res.status(400).json({ success: false, error: 'Invalid bulk action' });
    } catch (err) {
      console.error('[Logs] Failed bulk action:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/logs - Purge logs
  router.delete('/', (req, res) => {
    try {
      const q = req.query || {};
      const result = handlers.deleteLogs({
        id: q.id,
        clearResolved: q.clearResolved === 'true',
        olderThanDays: q.olderThanDays,
        all: q.all === 'true'
      });
      res.json({ success: result.success, deletedCount: result.deletedCount });
    } catch (err) {
      console.error('[Logs] Failed to delete logs:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
};
