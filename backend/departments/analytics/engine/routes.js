module.exports = function(router, handlers) {
  router.get('/', handlers.getAnalytics);
  router.post('/', handlers.createAnalytic);
  router.get('/type/:metricType', handlers.getAnalyticsByType);
  router.get('/executive-kpi', handlers.getExecutiveKPI);
  router.get('/sales-deep-dive', handlers.getSalesDeepDive);
  router.get('/order-funnel', handlers.getOrderFunnel);
  router.get('/ar-aging', handlers.getARAging);
  router.get('/rfm-segmentation', handlers.getRFMSegmentation);
  router.get('/product-velocity', handlers.getProductVelocity);
  router.get('/comparative-analysis', handlers.getComparativeAnalysis);
  router.get('/top-products', handlers.getTopProducts);
  router.get('/top-customers', handlers.getTopCustomers);
  router.get('/customer/:id/stats', handlers.getCustomerStats);
  router.get('/sales-trend', handlers.getSalesTrend);
  router.get('/category-performance', handlers.getProductCategoryPerformance);
  router.get('/summary/dashboard', handlers.getDashboardSummary);
  router.put('/:id', handlers.updateAnalytic);
  router.delete('/:id', handlers.deleteAnalytic);
  
  return router;
};

