const express = require('express');
const path = require('path');
const fs = require('fs');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'settings',
  namespace: 'settings',
  path: __dirname,
  description: 'Application preferences, backup, and settings administration domain',
  adapterPaths: [],
  ownedResponsibilities: ['preferences', 'backup', 'settings-health'],
  create(db) {
    if (!db) throw new TypeError('Settings department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    let backupManager = null;
    return {
      name: 'settings',
      compatibilityEngine: false,
      router,
      service,
      initializeDatabase() {
        createRoutes(router, service);
        try {
          const candidates = [
            path.resolve(__dirname, '../../core/backup-manager.js'),
            path.join(process.cwd(), 'backend', 'core', 'backup-manager.js'),
            '/app/backend/core/backup-manager.js'
          ];
          let BackupManager = null;
          for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
              BackupManager = require(candidate);
              break;
            }
          }
          if (!BackupManager) throw new Error('Backup manager not found');
          backupManager = new BackupManager(db);
          console.log('✓ Backup & Disaster Recovery manager initialized');
        } catch (error) {
          console.warn('⚠️ Backup scheduler initialization warning:', error.message);
        }
      },
      getDatabase() {
        return db;
      },
      getBackupManager() {
        return backupManager;
      }
    };
  }
};