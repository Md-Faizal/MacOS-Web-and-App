const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();
let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Payments using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
    
  } catch (error) {
    console.error('✗ Error initializing Payments:', error.message);
    throw error;
  }
}

// Info endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'Payments Module',
    version: '1.0.0',
    description: 'Payment transaction tracking and reconciliation',
    endpoints: {
      list: 'GET /api/payments',
      create: 'POST /api/payments',
      get: 'GET /api/payments/:id',
      update: 'PUT /api/payments/:id',
      delete: 'DELETE /api/payments/:id',
      summary: 'GET /api/payments/summary'
    }
  });
});

module.exports = {
  router,
  initializeDatabase
};

