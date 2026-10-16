/**
 * Compliance, Staff Directory, KYC & Statutory Governance Department
 * "God's Eye" Governance Suite for Utkal Chemical Aushadhalaya & Enterprise
 */

const express = require('express');
const createHandlers = require('./engine/handlers');
const createRoutes = require('./engine/routes');

module.exports = {
  name: 'compliance',
  namespace: 'compliance',
  path: __dirname,
  description: 'Enterprise Staff Master, Worker KYC Vault, Statutory Compliance, Deadlines & Internal SOP Governance',
  create(db) {
    if (!db) throw new TypeError('Compliance department requires a database');
    const router = express.Router();
    const domainService = createHandlers(db);
    createRoutes(router, domainService);
    return {
      name: 'compliance',
      compatibilityEngine: false,
      router,
      service: domainService,
      initializeDatabase() {
        domainService.initDatabase();
      },
      getDatabase() { return db; }
    };
  },
  ownedResponsibilities: [
    'staff-directory',
    'worker-kyc-vault',
    'statutory-licenses',
    'compliance-deadlines',
    'internal-sops-policies',
    'ai-document-vision',
    'executive-compliance-overview'
  ]
};
