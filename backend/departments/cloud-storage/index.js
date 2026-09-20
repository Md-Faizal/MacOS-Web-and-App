const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'cloud-storage',
  namespace: 'cloud-storage',
  path: __dirname,
  description: 'Private cloud files, media, shares, and batch downloads domain',
  adapterPaths: [],
  ownedResponsibilities: ['files', 'media', 'public-shares', 'batch-downloads'],
  create(db) {
    if (!db) throw new TypeError('Cloud storage department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    return {
      name: 'cloud-storage',
      compatibilityEngine: false,
      router,
      service,
      initializeDatabase() {
        createRoutes(router, service);
      },
      getDatabase() {
        return db;
      }
    };
  }
};