const express = require('express');

const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Smart Suggestions using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    // Create handlers and routes
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
    
  } catch (error) {
    console.error('✗ Error initializing Smart Suggestions:', error.message);
    throw error;
  }
}

// Note: This router doesn't have a root GET endpoint
// All endpoints require specific parameters
// Examples:
// GET /api/suggestions/customer/John?limit=10
// GET /api/suggestions/history/John
// GET /api/suggestions/top/John?limit=5
// GET /api/suggestions/seasonal?months_back=6
// GET /api/suggestions/smart-items/John
// GET /api/suggestions/segment-analysis

module.exports = {
  router,
  initializeDatabase
};
