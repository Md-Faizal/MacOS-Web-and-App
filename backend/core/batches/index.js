const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Batches using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    // Create handlers and routes
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
    
  } catch (error) {
    console.error('✗ Error initializing Batches:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'Batches Module',
    version: '1.0.0',
    description: 'Handles inventory batch tracking and expiry management',
    endpoints: {
      list: 'GET /api/batches',
      create: 'POST /api/batches',
      get: 'GET /api/batches/:id',
      update: 'PUT /api/batches/:id',
      delete: 'DELETE /api/batches/:id',
      expiring: 'GET /api/batches/expiring',
      summary: 'GET /api/batches/summary'
    }
  });
});

module.exports = {
  router,
  initializeDatabase
};
