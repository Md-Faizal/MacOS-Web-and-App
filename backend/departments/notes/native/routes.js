module.exports = function(router, handlers) {
  // GET all notes
  router.get('/', handlers.getNotes);
  
  // POST create note
  router.post('/', handlers.createNote);

  // SSE real-time event stream — MUST be before /:id to avoid 'events' being parsed as a note ID
  router.get('/events', handlers.subscribeSSE);
  
  // GET single note
  router.get('/:id', handlers.getNote);
  
  // PUT update note (title + content only, images handled separately)
  router.put('/:id', handlers.updateNote);
  
  // POST live content stream — zero-persistence, SSE broadcast only (WhatsApp-style sync)
  router.post('/:id/stream', handlers.streamNoteContent);

  
  // Staggered image loading / partial uploads
  router.get('/:id/images/meta', handlers.getImageMeta);
  router.get('/:id/images/:imageId', handlers.getSingleImage);
  router.post('/:id/images', handlers.uploadSingleImage);
  router.delete('/:id/images/:imageId', handlers.deleteSingleImage);
  
  // DELETE note
  router.delete('/:id', handlers.deleteNote);
  
  return router;
};
