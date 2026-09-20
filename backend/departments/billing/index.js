const express = require('express');
const contract = require('../../shared/api/billing-contract');
const calculator = require('../../core/billing/calculator');
const service = require('./service');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');
const ordersModule = require('../../core/orders');
const paymentsModule = require('../../core/payments');
const variantsModule = require('../../core/variants');
const batchesModule = require('../../core/batches');
const creditNotesModule = require('../../core/creditnotes');
const invoicesModule = require('../../core/invoices');

module.exports = {
  name: 'billing',
  namespace: 'billing',
  path: __dirname,
  description: 'Financial truth and customer statement domain',
  contract,
  service,
  engine: calculator,
  adapterPaths: [],
  create(db) {
    if (!db) throw new TypeError('Billing department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
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
    return {
      name: 'billing',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() {
        const relatedModules = [ordersModule, paymentsModule, variantsModule, batchesModule, creditNotesModule, invoicesModule];
        relatedModules.forEach(module => module.initializeDatabase(db));
        router.use('/orders', ordersModule.router);
        router.use('/payments', paymentsModule.router);
        router.use('/variants', variantsModule.router);
        router.use('/batches', batchesModule.router);
        router.use('/creditnotes', creditNotesModule.router);
        router.use('/invoices', invoicesModule.router);
        createRoutes(router, domainService);
      },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'invoices',
    'payments',
    'credit-notes',
    'ledger',
    'aging',
    'customer-statements',
    'dashboard-metrics'
  ]
};
