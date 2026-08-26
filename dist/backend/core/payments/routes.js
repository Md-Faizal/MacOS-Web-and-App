// Route definitions for Payments module
module.exports = function(router, handlers) {
  router.post('/', handlers.createPayment);
  router.get('/', handlers.getPayments);
  router.get('/summary', handlers.getPaymentSummary);
  router.get('/:id', handlers.getPayment);
  router.put('/:id', handlers.updatePayment);
  router.delete('/:id', handlers.deletePayment);
  
  return router;
};
