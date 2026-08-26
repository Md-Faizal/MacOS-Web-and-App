const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Calendar using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      const handlers = createHandlers(db);
      createRoutes(router, handlers);
    } catch (err) {
      console.error('✗ Failed to mount calendar routes:', err.message);
    }
  } catch (error) {
    console.error('✗ Error initializing Calendar App:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({ status: 'running', name: 'Calendar App' });
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
