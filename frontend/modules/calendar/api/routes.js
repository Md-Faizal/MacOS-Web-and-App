module.exports = function(router, handlers) {
  router.get('/', handlers.getEvents);
  router.post('/', handlers.createEvent);
  router.get('/range/:startDate/:endDate', handlers.getEventsByDateRange);
  router.get('/:id', handlers.getEvent);
  router.put('/:id', handlers.updateEvent);
  router.delete('/:id', handlers.deleteEvent);
  
  return router;
};
