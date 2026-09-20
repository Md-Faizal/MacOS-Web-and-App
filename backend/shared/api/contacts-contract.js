function buildContactsListResponse(contacts, requestId) {
  const items = Array.isArray(contacts) ? contacts : [];

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'contacts',
      resource: 'contacts',
      items,
      count: items.length,
      generatedAt: new Date().toISOString()
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      count: items.length,
      source: 'contacts-engine'
    },
    count: items.length,
    items
  };
}

module.exports = {
  buildContactsListResponse
};
