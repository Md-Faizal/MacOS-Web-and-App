/**
 * Compliance Department Express Routes
 * Mounts endpoints for Staff, KYC Vault, Licenses, Deadlines, SOPs & AI
 */

module.exports = function(router, handlers) {
  // 1. Executive "God's Eye" Overview
  router.get('/overview', handlers.getOverview);

  // 2. Staff Directory (Workers, Office, Technical Staff)
  router.get('/staff', handlers.getStaffList);
  router.get('/staff/next-emp-code', handlers.getNextEmployeeCode);
  router.post('/staff', handlers.createStaff);
  router.get('/staff/:id', handlers.getStaffById);
  router.put('/staff/:id', handlers.updateStaff);
  router.delete('/staff/:id', handlers.deleteStaff);

  // 3. Worker KYC & Document Vault
  router.get('/staff/:id/documents', handlers.getStaffDocuments);
  router.post('/staff/:id/documents', handlers.uploadStaffDocument);
  router.patch('/documents/:docId/status', handlers.updateDocumentStatus);
  router.delete('/documents/:docId', handlers.deleteStaffDocument);

  // 4. Statutory & Corporate Compliances / Licenses
  router.get('/licenses', handlers.getLicenses);
  router.post('/licenses', handlers.createLicense);
  router.get('/licenses/:id', handlers.getLicenseById);
  router.put('/licenses/:id', handlers.updateLicense);
  router.delete('/licenses/:id', handlers.deleteLicense);

  // 5. Deadlines & Renewal Timeline
  router.get('/deadlines', handlers.getDeadlines);
  router.post('/deadlines', handlers.createDeadline);
  router.patch('/deadlines/:id/status', handlers.updateDeadlineStatus);
  router.delete('/deadlines/:id', handlers.deleteDeadline);

  // 6. Internal Policies, SOPs & Corporate Governance
  router.get('/sops', handlers.getSops);
  router.post('/sops', handlers.createSop);
  router.put('/sops/:id', handlers.updateSop);
  router.delete('/sops/:id', handlers.deleteSop);

  // 7. AI Document Scanner & Compliance Advisor
  router.post('/ai/scan-document', handlers.scanDocumentAi);
  router.post('/ai/compliance-advisor', handlers.getComplianceAdvice);

  // 8. Company Holy Bible Vault & Paper Trail Indexer
  router.get('/vault/directories', handlers.getVaultDirectories);
  router.post('/vault/directories', handlers.createVaultDirectory);
  router.put('/vault/directories/:id', handlers.updateVaultDirectory);
  router.delete('/vault/directories/:id', handlers.deleteVaultDirectory);

  router.get('/vault/documents', handlers.getVaultDocuments);
  router.get('/vault/next-ref', handlers.getNextDocRef);
  router.post('/vault/documents', handlers.createVaultDocument);
  router.put('/vault/documents/:id', handlers.updateVaultDocument);
  router.delete('/vault/documents/:id', handlers.deleteVaultDocument);
  router.post('/vault/documents/batch', handlers.batchVaultOperation);
  router.get('/vault/documents/:id/pdf', handlers.renderVaultDocumentPdf);
  router.get('/vault/documents/:id/thumbnail', handlers.getVaultDocumentThumbnail);

  router.get('/vault/trails/timeline', handlers.getUnifiedTimeline);
  router.get('/vault/documents/:id/trail', handlers.getDocumentPaperTrail);
  router.post('/vault/trail', handlers.linkDocumentPaperTrail);
  router.delete('/vault/trail/:trailId', handlers.deletePaperTrailLink);

  return router;
};
