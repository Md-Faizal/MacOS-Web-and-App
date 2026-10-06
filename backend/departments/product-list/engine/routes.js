module.exports = function(router, handlers) {
  // Category routes (MUST come before /:id to avoid being matched by the ID parameter)
  router.get('/categories', handlers.getCategories);
  router.post('/categories', handlers.createCategory);
  router.put('/categories/:id', handlers.updateCategory);
  router.delete('/categories/:id', handlers.deleteCategory);
  
  // Batch and Variant routes (MUST come before /:id)
  router.post('/variants', handlers.createVariant);
  router.put('/variants/:id', handlers.updateVariant);
  router.post('/batches', handlers.createBatch);
  router.put('/batches/:id', handlers.updateBatch);
  router.delete('/batches/:id', handlers.deleteBatch);
  
  // MRP Update route
  router.post('/update-mrp', handlers.updateMRP);
  
  // PDF Catalog Generation route (MUST come before /:id)
  router.get('/catalog/pdf', handlers.generateCatalogPDF);
  router.post('/catalog/pdf', handlers.generateCatalogPDF);
  router.post('/catalog/print-assets', handlers.generateCatalogPrintAssets);
  
  // Product routes (general ID-based routes come last)
  router.get('/', handlers.getProducts);
  router.post('/', handlers.createProduct);
  router.get('/:id', handlers.getProduct);
  router.put('/:id', handlers.updateProduct);
  router.delete('/:id', handlers.deleteProduct);
  
  // Public product route
  router.get('/public/catalog', handlers.getPublicCatalog);
  router.get('/public/:sku', handlers.getPublicProduct);
  
  return router;
};
