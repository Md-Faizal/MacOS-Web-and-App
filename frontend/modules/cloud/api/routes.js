module.exports = function(router, handlers) {
  // Get all files
  router.get('/', handlers.getFiles);

  // Get storage stats
  router.get('/stats', handlers.getStats);

  // Upload a file
  router.post('/upload', handlers.uploadMiddleware, handlers.uploadFile);

  // Download a file
  router.get('/download/:id', handlers.downloadFile);

  // Get file thumbnail
  router.get('/thumbnail/:id', handlers.getThumbnail);

  // Delete a file
  router.delete('/:id', handlers.deleteFile);

  // Rename a file
  router.post('/rename', handlers.renameFile);

  // Share a file (generate link)
  router.post('/:id/share', handlers.shareFile);

  // Public share link (preview page)
  router.get('/share/:token', handlers.getSharedFile);

  // Shared file download (actual download)
  router.get('/share/:token/download', handlers.downloadSharedFile);

  // Batch Share (Collection)
  router.post('/batch-share', handlers.createBatchShare);
  router.get('/share/batch/:token', handlers.getBatchSharedPage);
  router.get('/share/batch/:token/download/:fileId', handlers.downloadBatchFile);
  router.get('/share/batch/:token/zip', handlers.downloadBatchZip);
  router.post('/share/batch/:token/revoke', handlers.revokeBatchShare);

  // Get single file info (internal)
  router.get('/:id', handlers.getFile);

  // Revoke share (internal)
  router.post('/:id/revoke', handlers.revokeShare);
};
