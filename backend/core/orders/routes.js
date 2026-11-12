module.exports = function(router, handlers) {
  // Public plant fulfillment routes
  router.get('/public/manifest/:token', handlers.getPublicManifestData);
  router.post('/public/manifest/:token/submit', handlers.submitPublicManifestData);

  // Plant manifest management routes
  router.post('/manifest', handlers.createOrAppendManifest);
  router.post('/share-link', handlers.createOrAppendManifest);
  router.get('/manifests', handlers.getManifests);
  router.get('/manifests/:id', handlers.getManifestById);
  router.put('/manifests/:id', handlers.updateManifest);
  router.delete('/manifests/:id', handlers.deleteManifest);

  // Core order routes
  router.post('/resolve-invoice-qr', handlers.resolveInvoiceQr);
  router.post('/', handlers.createOrder);
  router.get('/', handlers.getOrders);
  router.get('/next-number', handlers.getNextOrderNumber);
  router.get('/:id', handlers.getOrder);
  router.put('/:id', handlers.updateOrder);
  router.delete('/:id', handlers.deleteOrder);
  
  return router;
};
