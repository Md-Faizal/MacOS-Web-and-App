const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;
let isInitialized = false;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Cloud Storage using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      // Create handlers with database instance
      const handlers = createHandlers(db);
      
      // Register routes on the router
      createRoutes(router, handlers);
      
      isInitialized = true;
    } catch (err) {
      console.error('✗ Failed to mount cloud storage routes:', err.message);
      throw err;
    }
  } catch (error) {
    console.error('✗ Error initializing Cloud Storage App:', error.message);
    throw error;
  }
}

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
