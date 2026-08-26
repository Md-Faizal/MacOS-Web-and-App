const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Contacts using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      const handlers = createHandlers(db);
      createRoutes(router, handlers);
    } catch (err) {
      console.error('✗ Failed to mount contacts routes:', err.message);
    }
  } catch (error) {
    console.error('✗ Error initializing Contacts App:', error.message);
    throw error;
  }
}

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
