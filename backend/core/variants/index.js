const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Variants using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }
    
    // Create handlers and routes
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
    
  } catch (error) {
    console.error('✗ Error initializing Variants:', error.message);
    throw error;
  }
}

router.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'Variants Module',
    version: '1.0.0',
    description: 'Handles product variants (sizes, colors, SKUs)',
    endpoints: {
      list: 'GET /api/variants',
      create: 'POST /api/variants',
      get: 'GET /api/variants/:id',
      update: 'PUT /api/variants/:id',
      delete: 'DELETE /api/variants/:id',
      productVariants: 'GET /api/variants/product/:product_id',
      lowStock: 'GET /api/variants/low-stock'
    }
  });
});

module.exports = {
  router,
  initializeDatabase
};
