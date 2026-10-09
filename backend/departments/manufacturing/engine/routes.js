module.exports = function(router, handlers) {
  // 1. Raw Materials & Inward
  router.get('/raw-materials', handlers.getRawMaterials);
  router.post('/raw-materials', handlers.createRawMaterial);
  router.put('/raw-materials/:id', handlers.updateRawMaterial);
  router.delete('/raw-materials/:id', handlers.deleteRawMaterial);
  router.get('/raw-materials/inward', handlers.getRawMaterialInward);
  router.post('/raw-materials/inward', handlers.createRawMaterialInward);

  // 2. Master Formulas (MFR / Recipes)
  router.get('/master-formulas', handlers.getMasterFormulas);
  router.post('/master-formulas', handlers.createMasterFormula);
  router.post('/recipes/scale', handlers.scaleRecipeRust);

  // 3. Batch Manufacturing Records (BMR)
  router.get('/batches', handlers.getBmrBatches);
  router.post('/batches', handlers.createBmrBatch);
  router.patch('/batches/:id/status', handlers.updateBatchStatus);
  router.post('/batches/reconcile-yield', handlers.reconcileYieldRust);

  // 4. Batch Release (Statutory Validation in Rust & Catalog sync)
  router.post('/batches/:id/release', handlers.releaseBatch);

  // 5. Statutory BMR Dossier PDF Generation (Rust Vector Engine)
  router.get('/batches/:id/pdf', handlers.renderBmrDossierPdf);

  // 6. Attachments & Photos/Documents
  router.get('/attachments/:entityType/:entityId', handlers.getAttachments);
  router.post('/attachments', handlers.createAttachment);
  router.delete('/attachments/:id', handlers.deleteAttachment);

  // 7. Technical Staff & Doctors Master
  router.get('/technical-staff', handlers.getTechnicalStaff);
  router.post('/technical-staff', handlers.createTechnicalStaff);
  router.put('/technical-staff/:id', handlers.updateTechnicalStaff);
  router.delete('/technical-staff/:id', handlers.deleteTechnicalStaff);

  // 8. Inward Suppliers & Supplier Ledger
  router.get('/suppliers', handlers.getSuppliers);
  router.post('/suppliers', handlers.createSupplier);
  router.get('/suppliers/:id/ledger', handlers.getSupplierLedger);

  // 9. Purchase Orders (Inward Orders)
  router.get('/purchase-orders', handlers.getPurchaseOrders);
  router.post('/purchase-orders', handlers.createPurchaseOrder);
  router.patch('/purchase-orders/:id/status', handlers.updatePurchaseOrderStatus);

  // 10. Supplier Payments (Disbursements)
  router.get('/supplier-payments', handlers.getSupplierPayments);
  router.post('/supplier-payments', handlers.createSupplierPayment);

  // 11. AI Ayurvedic Formulation & Document Vision
  router.post('/ai/formulation-advice', handlers.getAiFormulationAdvice);
  router.post('/ai/scan-document', handlers.scanDocumentAi);

  return router;
};
