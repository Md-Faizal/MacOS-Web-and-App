const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'logs',
  namespace: 'logs',
  path: __dirname,
  description: 'Application observability, ingestion, inspection, and retention domain',
  adapterPaths: [],
  ownedResponsibilities: ['app-ingestion', 'inspection', 'export', 'retention'],
  create(db) {
    if (!db) throw new TypeError('Logs department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    return {
      name: 'logs',
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