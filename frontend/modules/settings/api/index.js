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
        const BackupManager = require('../../../backend/core/backup-manager');
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
