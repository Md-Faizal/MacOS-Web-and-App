const express = require('express');
const router = express.Router();

/**
 * Quick Notes API - Handles desktop widget sticky notes
 */
module.exports = function(globalDb, authMiddleware) {
  
  // GET /api/quick-notes/:id - Fetch a specific sticky note
  router.get('/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const stmt = globalDb.prepare('SELECT * FROM quick_notes WHERE id = ?');
      const note = stmt.get(id);
      
      if (!note) {
        // Just return empty if not found
        return res.json({ id, title: '', content: '' });
      }
      
      res.json(note);
    } catch (error) {
      console.error('[QuickNotes API] GET error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve quick note' });
    }
  });

  // POST /api/quick-notes/:id - Save or update a sticky note
  router.post('/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const { title, content } = req.body;
      
      const stmt = globalDb.prepare(`
        INSERT INTO quick_notes (id, title, content, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          updated_at = datetime('now')
      `);
      
      stmt.run(id, title || '', content || '');
      res.json({ success: true, message: 'Note saved' });
    } catch (error) {
      console.error('[QuickNotes API] POST error:', error.message);
      res.status(500).json({ error: 'Failed to save quick note' });
    }
  });

  // DELETE /api/quick-notes/:id - Remove a sticky note permanently
  router.delete('/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const stmt = globalDb.prepare('DELETE FROM quick_notes WHERE id = ?');
      const result = stmt.run(id);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }
      
      res.json({ success: true, message: 'Note deleted successfully' });
    } catch (error) {
      console.error('[QuickNotes API] DELETE error:', error.message);
      res.status(500).json({ error: 'Failed to delete quick note' });
    }
  });

  return router;
};
