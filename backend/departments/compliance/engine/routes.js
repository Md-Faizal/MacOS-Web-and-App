/**
 * Compliance Department Express Routes
 * Mounts endpoints for Staff, KYC Vault, Licenses, Deadlines, SOPs & AI
 */

const multer = require('multer');
const path = require('path');

const vaultDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'].includes(extension)) {
      callback(new Error('Supported files: PDF, Word (.doc/.docx), PNG, or JPEG.'));
      return;
    }
    callback(null, true);
  }
}).single('file');

module.exports = function(router, handlers) {
  // 1. Executive "God's Eye" Overview
  router.get('/overview', handlers.getOverview);

  // 2. Staff Directory (Workers, Office, Technical Staff)
  router.get('/staff', handlers.getStaffList);
  router.get('/staff/next-emp-code', handlers.getNextEmployeeCode);
  router.get('/staff/signatories', handlers.getSignatories);
  router.post('/staff', handlers.createStaff);
  router.get('/staff/:id', handlers.getStaffById);
  router.put('/staff/:id', handlers.updateStaff);
  router.delete('/staff/:id', handlers.deleteStaff);
  router.post('/staff/:id/signature', handlers.uploadStaffSignature);

  // 2b. Application & Letterhead Settings
  router.get('/settings', handlers.getAppSettings);
  router.post('/settings', handlers.updateAppSettings);

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
  router.put('/deadlines/:id', handlers.updateDeadline);
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
  router.get('/vault/document-options', handlers.getVaultDocumentOptions);
  router.get('/vault/next-ref', handlers.getNextDocRef);
  router.post('/vault/documents', handlers.createVaultDocument);
  router.post('/vault/documents/upload', (req, res, next) => {
    vaultDocumentUpload(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Select a file to upload' });
        return;
      }
      next();
    });
  }, handlers.createVaultDocument);
  router.put('/vault/documents/:id', handlers.updateVaultDocument);
  router.delete('/vault/documents/:id', handlers.deleteVaultDocument);
  router.post('/vault/documents/batch', handlers.batchVaultOperation);
  router.get('/vault/drafts', handlers.getVaultDrafts);
  router.get('/vault/documents/:id/pdf', handlers.renderVaultDocumentPdf);
  router.get('/vault/documents/:id/docx', handlers.renderVaultDocumentDocx);
  router.get('/vault/documents/:id/jpeg', handlers.renderVaultDocumentJpeg);
  router.get('/vault/documents/:id/download', handlers.downloadVaultDocumentOriginal);
  router.post('/vault/export/:format', handlers.exportDocumentDirect);
  router.get('/vault/documents/:id/thumbnail', handlers.getVaultDocumentThumbnail);

  router.get('/vault/trails/timeline', handlers.getUnifiedTimeline);
  router.get('/vault/documents/:id/trail', handlers.getDocumentPaperTrail);
  router.post('/vault/trail', handlers.linkDocumentPaperTrail);
  router.delete('/vault/trail/:trailId', handlers.deletePaperTrailLink);

  // 9. Document Vault AI: Auto-Tagging, Auto-Sort, In-Viewer Copilot & FTS5 Search
  router.post('/vault/documents/:id/ai-analyze', handlers.analyzeDocumentAi);
  router.post('/vault/documents/:id/auto-sort', handlers.autoSortDocument);
  router.post('/vault/documents/auto-sort-pending', handlers.autoSortAllPending);
  router.post('/vault/documents/:id/chat', handlers.chatWithDocument);
  router.get('/vault/ai/search', handlers.searchVaultAi);
  router.post('/vault/ai/generate-document', handlers.generateDocumentAi);

  return router;
};
