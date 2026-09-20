const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'suggestions',
  namespace: 'suggestions',
  path: __dirname,
  description: 'Customer and product recommendation domain',
  adapterPaths: [],
  ownedResponsibilities: ['customer-suggestions', 'item-suggestions', 'segments'],
  create(db) {
    if (!db) throw new TypeError('Suggestions department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    return {
      name: 'suggestions',
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