module.exports = function(router, handlers) {
  router.get('/', handlers.getSettings);
  router.post('/', handlers.saveSetting);
  router.post('/bulk', handlers.bulkUpdateSettings);
  router.get('/app-settings', handlers.getAppSettings);
  router.post('/app-settings', handlers.saveAppSettings);
  router.get('/health/status', handlers.getBackendStatus);
  router.get('/health/history', handlers.getStatusHistory);
  
  // Database storage explorer routes
  router.get('/db/tables', handlers.getDbTables);
  router.get('/db/table/:name', handlers.getDbTableRows);
  router.post('/db/table/:name/row', handlers.addDbTableRow);
  router.put('/db/table/:name/row', handlers.updateDbTableRow);
  router.delete('/db/table/:name/row', handlers.deleteDbTableRows);
  router.post('/db/query', handlers.executeDbQuery);
  router.post('/db/backup', handlers.createDbBackup);
  router.get('/db/backups', handlers.getDbBackups);
  router.post('/db/backup/restore', handlers.restoreDbBackup);
  router.delete('/db/backup', handlers.deleteDbBackup);
  
  return router;
};
