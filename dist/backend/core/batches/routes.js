module.exports = function(router, handlers) {
  router.post('/', handlers.createBatch);
  router.get('/', handlers.getBatches);
  router.get('/expiring', handlers.getExpiringBatches);
  router.get('/summary', handlers.getBatchSummary);
  router.get('/:id', handlers.getBatch);
  router.put('/:id', handlers.updateBatch);
  router.delete('/:id', handlers.deleteBatch);
  
  return router;
};
