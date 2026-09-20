const contract = require('../../shared/api/product-list-contract');
const service = require('./service');

module.exports = {
  name: 'product-list',
  namespace: 'product-list',
  path: __dirname,
  description: 'Product catalog and inventory catalog domain',
  contract,
  service,
  engine: {
    kind: 'catalog',
    source: 'frontend/modules/product-list/api/handlers.js'
  },
  adapterPaths: [
    '../../frontend/modules/product-list/api/handlers.js',
    '../../frontend/modules/product-list/api/routes.js'
  ],
  ownedResponsibilities: [
    'products',
    'categories',
    'variants',
    'batches',
    'catalog-public'
  ]
};
