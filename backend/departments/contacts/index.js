const contract = require('../../shared/api/contacts-contract');
const service = require('./service');

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
  adapterPaths: [
    '../../frontend/modules/contacts/api/handlers.js',
    '../../frontend/modules/contacts/api/routes.js'
  ],
  ownedResponsibilities: [
    'contacts',
    'contact-access',
    'customer-master',
    'contact-activity'
  ]
};
