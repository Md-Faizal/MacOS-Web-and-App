/**
 * Invoice Routes
 * Routes for invoices and payments
 */

module.exports = function(router, invoiceHandlers, paymentHandlers) {
  
  // ===== INVOICE ENDPOINTS =====
  
  // Create new invoice with items
  router.post('/invoices', invoiceHandlers.createInvoice);
  
  // Get all invoices (with optional filters)
  router.get('/invoices', invoiceHandlers.getInvoices);
  
  // Get invoice summary (MUST come before /:id wildcard route)
  router.get('/invoices/summary', invoiceHandlers.getInvoiceSummary);
  
  // Get invoice item count (MUST come before /:id route)
  router.get('/invoices/:id/item-count', invoiceHandlers.getInvoiceItemCount);
  
  // Get specific invoice with all items
  router.get('/invoices/:id', invoiceHandlers.getInvoice);
  
  // Update invoice status (MUST come before generic /:id PUT route)
  router.put('/invoices/:id/status', invoiceHandlers.updateInvoiceStatus);
  
  // Update invoice (edit items and amounts)
  router.put('/invoices/:id', invoiceHandlers.updateInvoice);
  
  // Delete invoice
  router.delete('/invoices/:id', invoiceHandlers.deleteInvoice);
  
  // ===== PAYMENT ENDPOINTS =====
  
  // Get next payment reference (preview - no record created)
  router.get('/payments/next-reference', paymentHandlers.getNextPaymentReference);

  // Get next credit note reference (preview - no record created)
  router.get('/payments/next-credit-reference', paymentHandlers.getNextCreditNoteReference);
  
  // Create payment for invoice
  router.post('/payments', paymentHandlers.createPayment);
  
  // Create credit note
  router.post('/creditnotes', paymentHandlers.createCreditNote);
  
  // Get payments/credit notes
  router.get('/payments', paymentHandlers.getPayments);

  // Get total collected from payments
  router.get('/payments/total-collected', paymentHandlers.getTotalCollected);

  // Get customer outstanding amount and stats
  router.get('/customers/outstanding', paymentHandlers.getCustomerOutstanding);

  // Recalculate ledger from invoices and payments tables
  router.post('/ledger/recalculate', paymentHandlers.recalculateLedger);

  // Update payment or credit note
  router.put('/payments/:id', paymentHandlers.updatePayment);
  
  // Delete payment/credit note
  router.delete('/payments/:id', paymentHandlers.deletePayment);
  
  // Get payment summary
  router.get('/payments/summary', paymentHandlers.getPaymentSummary);
  
  return router;
};
