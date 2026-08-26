const express = require('express');

const createProductHandlers = require('./handlers');
const createProductRoutes = require('./routes');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Product List using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    const handlers = createProductHandlers(db);
    createProductRoutes(router, handlers);
  } catch (error) {
    console.error('✗ Error initializing Product List API:', error.message);
    throw error;
  }
}

// Health / status endpoint for the Product List API
router.get('/health', (req, res) => {
  res.json({
    status: 'running',
    name: 'Product List App',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      variants: '/api/products/variants',
      batches: '/api/products/batches'
    }
  });
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};

