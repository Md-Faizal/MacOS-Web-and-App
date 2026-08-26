const express = require('express');
const path = require('path');

const createHandlers = require('./handlers');
const createRoutes = require('./routes');

// Core domain modules that conceptually belong to Billing app
const ordersModule = require('../../../../backend/core/orders');
const paymentsModule = require('../../../../backend/core/payments');
const variantsModule = require('../../../../backend/core/variants');
const batchesModule = require('../../../../backend/core/batches');
const creditNotesModule = require('../../../../backend/core/creditnotes');
const invoicesModule = require('../../../../backend/core/invoices');

const router = express.Router();

let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Billing using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    // Initialize and mount related core domain routers on subpaths
    ordersModule.initializeDatabase(db);
    paymentsModule.initializeDatabase(db);
    variantsModule.initializeDatabase(db);
    batchesModule.initializeDatabase(db);
    creditNotesModule.initializeDatabase(db);
    invoicesModule.initializeDatabase(db);

    // Expose their routers under their existing public prefixes so URLs stay the same
    // IMPORTANT: These must be mounted BEFORE createRoutes to avoid the /:id catch-all
    router.use('/orders', ordersModule.router);
    router.use('/payments', paymentsModule.router);
    router.use('/variants', variantsModule.router);
    router.use('/batches', batchesModule.router);
    router.use('/creditnotes', creditNotesModule.router);
    router.use('/invoices', invoicesModule.router);

    // Create billing handlers and routes (mounted under /api/billing)
    const handlers = createHandlers(db);
    createRoutes(router, handlers);
  } catch (error) {
    console.error('✗ Error initializing Billing App:', error.message);
    throw error;
  }
}

// Status endpoint at /status instead of / to avoid conflicting with getBills
router.get('/status', (req, res) => {
  res.json({
    status: 'running',
    name: 'Billing App',
    version: '1.0.1',
    description: 'Handles transactions, invoices, and related financial domains',
    endpoints: {
      billing: '/api/billing',
      products: '/api/billing/products',
      orders: '/api/billing/orders',
      payments: '/api/billing/payments',
      variants: '/api/billing/variants',
      batches: '/api/billing/batches',
      creditnotes: '/api/billing/creditnotes',
      invoices: '/api/billing/invoices'
    }
  });
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};
