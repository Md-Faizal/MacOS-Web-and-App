const createAdminService = require('../auth/engine/admin');

module.exports = {
  name: 'admin',
  namespace: 'admin',
  path: __dirname,
  description: 'Owner administration, worker lifecycle, permissions, and account governance domain',
  engine: createAdminService,
  create(db) {
    if (!db) throw new TypeError('Admin department requires a database');
    const service = createAdminService(db);
    return {
      name: 'admin',
      compatibilityEngine: false,
      service,
      ...service,
      initializeDatabase() {},
      getDatabase() { return db; }
    };
  },
  adapterPaths: [
    '../auth/engine/admin.js',
    '../auth/engine/permissions.js',
    '../auth/engine/audit-service.js'
  ],
  ownedResponsibilities: [
    'worker-approval',
    'worker-lifecycle',
    'permissions',
    'owner-notifications',
    'account-audit'
  ]
};
