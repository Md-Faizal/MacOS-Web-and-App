const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'manufacturing',
  namespace: 'manufacturing',
  path: __dirname,
  description: 'Ayurvedic Medicine Manufacturing and Schedule T GMP Compliance Engine',
  create(db) {
    if (!db) throw new TypeError('Manufacturing department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
    return {
      name: 'manufacturing',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() { createRoutes(router, domainService); },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'raw-materials-inventory',
    'master-formulas-recipes',
    'recipe-scaling-rust',
    'bmr-batch-records',
    'yield-reconciliation-rust',
    'statutory-batch-release-rust',
    'bmr-dossier-pdf-rust'
  ]
};
