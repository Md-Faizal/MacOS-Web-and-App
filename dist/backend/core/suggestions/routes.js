module.exports = function(router, handlers) {
  // Customer-based suggestions
  router.get('/customer/suggestions', handlers.getCustomerSuggestions);
  router.get('/customer/history/:customer_name', handlers.getCustomerHistory);
  router.get('/customer/top-products', handlers.getTopProductsByCustomer);
  router.get('/customer/smart-billing/:customer_name', handlers.getSmartBillingItems);
  
  // Trend/seasonal analysis
  router.get('/trends/seasonal', handlers.getSeasonalSuggestions);
  
  // Analytics
  router.get('/analytics/segments', handlers.getCustomerSegmentAnalysis);
  
  return router;
};
