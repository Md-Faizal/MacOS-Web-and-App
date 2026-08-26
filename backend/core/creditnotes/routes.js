module.exports = function(router, handlers) {
  router.post('/', handlers.createCreditNote);
  router.get('/', handlers.getCreditNotes);
  router.get('/summary', handlers.getCreditNoteSummary);
  router.get('/:id', handlers.getCreditNote);
  router.put('/:id', handlers.updateCreditNote);
  router.delete('/:id', handlers.deleteCreditNote);
  
  return router;
};
