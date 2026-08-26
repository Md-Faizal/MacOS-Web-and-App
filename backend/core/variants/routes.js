module.exports = function(router, handlers) {
  router.post('/', handlers.createVariant);
  router.get('/', handlers.getVariants);
  router.get('/low-stock', handlers.getLowStockVariants);
  router.get('/:id', handlers.getVariant);
  router.get('/product/:product_id', handlers.getProductVariants);
  router.put('/:id', handlers.updateVariant);
  router.delete('/:id', handlers.deleteVariant);
  
  return router;
};
