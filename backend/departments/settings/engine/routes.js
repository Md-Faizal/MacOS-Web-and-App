module.exports = function(router, handlers) {
  router.get('/', handlers.getSettings);
  router.post('/', handlers.saveSetting);
  router.post('/save', handlers.saveSetting);
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
  
  // Backup & Disaster Recovery settings
  router.get('/backup-config', handlers.getBackupConfig);
  router.post('/backup-config', handlers.saveBackupConfig);
  router.post('/backup/test-r2', handlers.testBackupR2);
  
  // Docker Cluster Management
  router.post('/docker/switch', handlers.switchClusterSlot);
  router.post('/docker/toggle-vm', handlers.togglePrimaryVm);
  router.post('/docker/restart', handlers.restartClusterSlot);
  
  // Real-Time Network & Cluster Telemetry
  router.get('/network/telemetry', handlers.getNetworkTelemetry);
  
  return router;
};
