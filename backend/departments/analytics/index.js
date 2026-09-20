const express = require('express');
const contract = require('../../shared/api/analytics-contract');
const billingCalculator = require('../../core/billing/calculator');
const service = require('./service');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'analytics',
  namespace: 'analytics',
  path: __dirname,
  description: 'Executive reporting and aggregated performance domain',
  contract,
  service,
  engine: billingCalculator,
  adapterPaths: [],
  create(db) {
    if (!db) throw new TypeError('Analytics department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
    router.get('/', (req, res) => res.json({ status: 'running', name: 'Analytics App' }));
    return {
      name: 'analytics',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() { createRoutes(router, domainService); },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'dashboard-summary',
    'executive-kpi',
    'sales-trend',
    'top-products',
    'top-customers',
    'customer-performance'
  ]
};
