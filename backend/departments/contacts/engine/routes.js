module.exports = function(router, handlers) {
  router.get('/', handlers.getContacts);
  router.post('/', handlers.createContact);
  router.get('/:id', handlers.getContact);
  router.put('/:id', handlers.updateContact);
  router.delete('/:id', handlers.deleteContact);
  
  // Worker contact access / sharing endpoints
  router.get('/:id/access', handlers.getContactAccess);
  router.post('/:id/access', handlers.updateContactAccess);
  
  // Activity status endpoints
  router.get('/:customerId/activity-status', handlers.checkAndUpdateActivityStatus);
  router.post('/activity/update-all', handlers.updateAllActivityStatuses);
  
  return router;
};
