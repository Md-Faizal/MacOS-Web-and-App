const express = require('express');
const contract = require('../../shared/api/contacts-contract');
const service = require('./service');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'contacts',
  namespace: 'contacts',
  path: __dirname,
  description: 'Customer and party master data domain',
  contract,
  service,
  engine: {
    kind: 'master-data',
    source: 'frontend/modules/contacts/api/handlers.js'
  },
  adapterPaths: [],
  create(db) {
    if (!db) throw new TypeError('Contacts department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
    return {
      name: 'contacts',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() { createRoutes(router, domainService); },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'contacts',
    'contact-access',
    'customer-master',
    'contact-activity'
  ]
};
