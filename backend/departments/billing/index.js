const contract = require('../../shared/api/billing-contract');
const calculator = require('../../core/billing/calculator');
const service = require('./service');

module.exports = {
  name: 'billing',
  namespace: 'billing',
  path: __dirname,
  description: 'Financial truth and customer statement domain',
  contract,
  service,
  engine: calculator,
  adapterPaths: [
    '../../frontend/modules/billing/api/handlers.js',
    '../../frontend/modules/billing/api/routes.js'
  ],
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
