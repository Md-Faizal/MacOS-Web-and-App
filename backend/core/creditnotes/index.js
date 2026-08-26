const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Credit Notes using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    // Create handlers and routes
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
    
  } catch (error) {
    console.error('✗ Error initializing Credit Notes:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'Credit Notes Module',
    version: '1.0.0',
    description: 'Handles credit note tracking and accounting',
    endpoints: {
      list: 'GET /api/creditnotes',
      create: 'POST /api/creditnotes',
      get: 'GET /api/creditnotes/:id',
      update: 'PUT /api/creditnotes/:id',
      delete: 'DELETE /api/creditnotes/:id',
      summary: 'GET /api/creditnotes/summary'
    }
  });
});

module.exports = {
  router,
  initializeDatabase
};
