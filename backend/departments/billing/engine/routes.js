module.exports = function(router, handlers) {
  // ============= PREFERENCES =============
  // These must come BEFORE the /:id route to avoid the generic route catching them!
  router.get('/preference/:customerName/:productName', handlers.getPreference);          // GET /api/billing/preference/:customerName/:productName
  router.get('/preferences/:customerName', handlers.getCustomerPreferences);             // GET /api/billing/preferences/:customerName
  router.get('/customer-bill-items/:customerName', handlers.getCustomerBillItems);      // GET /api/billing/customer-bill-items/:customerName
  router.post('/preference', handlers.savePreference);                                   // POST /api/billing/preference
  router.delete('/preference/:customerName/:productName', handlers.deletePreference);    // DELETE /api/billing/preference/:customerName/:productName
  
  // ============= PDF GENERATION =============
  // Invoice PDFs
  router.post('/preview-invoice-pdf', handlers.previewInvoicePDF);      // POST /api/billing/preview-invoice-pdf - Generate preview PDF
  router.post('/export-invoice-pdf', handlers.exportInvoicePDF);        // POST /api/billing/export-invoice-pdf - Generate export PDF
  router.get('/print-invoice-pdf', handlers.printInvoicePDF);           // GET /api/billing/print-invoice-pdf - Generate print PDF
  
  // Payment & Credit Note PDFs
  router.post('/preview-payment-pdf', handlers.previewPaymentPDF);      // POST /api/billing/preview-payment-pdf - Generate preview PDF
  router.post('/export-payment-pdf', handlers.exportPaymentPDF);        // POST /api/billing/export-payment-pdf - Generate export PDF
  router.get('/print-payment-pdf', handlers.printPaymentPDF);           // GET /api/billing/print-payment-pdf - Generate print PDF
  
  // Opening Balance PDFs
  router.post('/preview-opening-balance', handlers.previewOpeningBalancePDF);  // POST /api/billing/preview-opening-balance - Generate preview image
  router.post('/export-opening-balance', handlers.exportOpeningBalancePDF);  // POST /api/billing/export-opening-balance - Generate opening balance PDF
  router.get('/print-opening-balance', handlers.printOpeningBalancePDF);  // GET /api/billing/print-opening-balance - Generate print PDF
  
  // ============= PUBLIC ENDPOINTS =============
  router.get('/public/ledger/:customerId', handlers.getPublicLedger); // GET /api/billing/public/ledger/:customerId - Get public ledger data
  router.post('/public/export-invoice-pdf', handlers.exportInvoicePDF); // POST /api/billing/public/export-invoice-pdf - Public export PDF

  // ============= BILLS/INVOICES =============
  router.post('/calculate', handlers.calculateBill); // POST /api/billing/calculate - Authoritative calculation engine
  router.post('/orders/:id/convert-to-invoice', handlers.convertOrderToInvoice); // POST /api/billing/orders/:id/convert-to-invoice - Server order fulfillment
  router.post('/', handlers.createBill);           // POST /api/billing - Create bill
  router.get('/', handlers.getBills);              // GET /api/billing - List bills
  router.get('/summary', handlers.getBillingSummary); // GET /api/billing/summary - Billing summary
  router.get('/dashboard-metrics', handlers.getDashboardMetrics); // GET /api/billing/dashboard-metrics - Pre-calculated KPIs
  router.get('/ledger/customers', handlers.getLedgerCustomers); // GET /api/billing/ledger/customers - Get customers with ledger balances
  router.get('/customers/:id/statement', handlers.getCustomerStatement); // GET /api/billing/customers/:id/statement - Customer ledger statement
  router.get('/customer/:id/statement', handlers.getCustomerStatement);  // GET /api/billing/customer/:id/statement - Customer ledger statement alias
  router.get('/settings/app-settings', handlers.getAppSettings); // GET /api/billing/settings/app-settings - Get app settings
  router.post('/settings/app-settings', handlers.saveAppSettings); // POST /api/billing/settings/app-settings - Save app settings
  router.get('/:id', handlers.getBill);            // GET /api/billing/:id - Get bill detail (must be last!)
  router.put('/:id', handlers.updateBill);         // PUT /api/billing/:id - Update bill
  router.delete('/:id', handlers.deleteBill);      // DELETE /api/billing/:id - Delete bill
  
  return router;
};
