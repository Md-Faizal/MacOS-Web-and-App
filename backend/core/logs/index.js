const express = require('express');

const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ App Logs module using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    const handlers = createHandlers(db);
    createRoutes(router, handlers);
  } catch (error) {
    console.error('✗ Error initializing App Logs module:', error.message);
    throw error;
  }
}

module.exports = {
  router,
  initializeDatabase
};
