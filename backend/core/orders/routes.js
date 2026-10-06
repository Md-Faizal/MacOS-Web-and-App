module.exports = function(router, handlers) {
  router.post('/resolve-invoice-qr', handlers.resolveInvoiceQr);
  router.post('/', handlers.createOrder);
  router.get('/', handlers.getOrders);
  router.get('/next-number', handlers.getNextOrderNumber);
  router.get('/:id', handlers.getOrder);
  router.put('/:id', handlers.updateOrder);
  router.delete('/:id', handlers.deleteOrder);
  
  return router;
};
