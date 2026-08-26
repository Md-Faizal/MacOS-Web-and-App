const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Analytics using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      const handlers = createHandlers(db);
      createRoutes(router, handlers);
    } catch (err) {
      console.error('✗ Failed to mount analytics routes:', err.message);
    }
  } catch (error) {
    console.error('✗ Error initializing Analytics App:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({ status: 'running', name: 'Analytics App' });
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
