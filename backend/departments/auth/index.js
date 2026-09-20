const createAuthService = require('./engine/auth');
const createProfileService = require('./engine/profile');
const createOAuthService = require('./engine/oauth');
const createPermissionsService = require('./engine/permissions');
const createWorkerGoogleService = require('./engine/worker-google-auth');
const createAuditService = require('./engine/audit-service');

module.exports = {
  name: 'auth',
  namespace: 'auth',
  path: __dirname,
  description: 'Authentication, sessions, identity verification, and account security domain',
  engine: createAuthService,
  create(db, permissionsHelper) {
    if (!db) throw new TypeError('Auth department requires a database');
    const permissions = permissionsHelper || createPermissionsService(db);
    return {
      name: 'auth',
      compatibilityEngine: false,
      auth: createAuthService(db, permissions),
      profile: createProfileService(db),
      oauth: createOAuthService(db),
      permissions,
      workerGoogle: createWorkerGoogleService(db, permissions),
      audit: createAuditService(db),
      initializeDatabase() {},
      getDatabase() { return db; }
    };
  },
  adapterPaths: [],
  ownedResponsibilities: [
    'local-login',
    'mobile-sessions',
    'webauthn',
    'security-challenges',
    'device-sessions',
    'identity-verification'
  ]
};
