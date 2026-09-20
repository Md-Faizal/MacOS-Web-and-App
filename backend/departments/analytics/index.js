const contract = require('../../shared/api/analytics-contract');
const billingCalculator = require('../../core/billing/calculator');
const service = require('./service');

module.exports = {
  name: 'analytics',
  namespace: 'analytics',
  path: __dirname,
  description: 'Executive reporting and aggregated performance domain',
  contract,
  service,
  engine: billingCalculator,
  adapterPaths: [
    '../../frontend/modules/analytics/api/handlers.js',
    '../../frontend/modules/analytics/api/routes.js'
  ],
  ownedResponsibilities: [
    'dashboard-summary',
    'executive-kpi',
    'sales-trend',
    'top-products',
    'top-customers',
    'customer-performance'
  ]
};
