const express = require('express');
const contract = require('../../shared/api/product-list-contract');
const service = require('./service');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

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
  adapterPaths: [],
  create(db) {
    if (!db) throw new TypeError('Product list department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
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
    return {
      name: 'product-list',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() { createRoutes(router, domainService); },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'products',
    'categories',
    'variants',
    'batches',
    'catalog-public'
  ]
};
