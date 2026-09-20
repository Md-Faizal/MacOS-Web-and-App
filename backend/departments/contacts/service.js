const { buildContactsListResponse } = require('../../shared/api/contacts-contract');

function normalizeListOptions(options = {}) {
  return {
    requestId: options.requestId || null,
    search: options.search || null,
    workerScope: options.workerScope || null
  };
}

function getContacts(contacts, options = {}) {
  const normalized = normalizeListOptions(options);
  return buildContactsListResponse(Array.isArray(contacts) ? contacts : [], normalized.requestId);
}

module.exports = {
  name: 'contacts',
  normalizeListOptions,
  getContacts
};
