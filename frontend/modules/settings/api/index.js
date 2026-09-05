const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Settings using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      const handlers = createHandlers(db);
      createRoutes(router, handlers);

      // Start Background Backup & Disaster Recovery Scheduler
      try {
        const path = require('path');
        const fs = require('fs');
        const candidates = [
          path.resolve(__dirname, '../../../../backend/core/backup-manager.js'),
          path.join(process.cwd(), 'backend', 'core', 'backup-manager.js'),
          '/app/backend/core/backup-manager.js'
        ];
        let BackupManager = null;
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            BackupManager = require(c);
            break;
          }
        }
        if (!BackupManager) {
          BackupManager = require('../../../../backend/core/backup-manager.js');
        }
        const backupManager = new BackupManager(db);
        console.log('✓ Backup & Disaster Recovery manager initialized');
      } catch (backupInitErr) {
        console.warn('⚠️ Backup scheduler initialization warning:', backupInitErr.message);
      }
    } catch (err) {
      console.error('✗ Failed to mount settings routes:', err.message);
    }
  } catch (error) {
    console.error('✗ Error initializing Settings App:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({ status: 'running', name: 'Settings App' });
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
