const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'ai',
  namespace: 'ai',
  path: __dirname,
  description: 'Assistant, intelligence, and product vision domain',
  adapterPaths: [],
  ownedResponsibilities: ['assistant', 'insights', 'vision', 'learning'],
  create(db) {
    if (!db) throw new TypeError('AI department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    return {
      name: 'ai',
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