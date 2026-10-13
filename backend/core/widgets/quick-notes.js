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
      const userId = req.user?.userId || req.user?.id || 'admin_auth';
      
      const stmt = globalDb.prepare('SELECT * FROM quick_notes WHERE id = ?');
      let note = stmt.get(id);
      
      // If note not found for this specific instance id, fall back to the user's latest note (cross-device sync)
      if (!note && userId) {
        try {
          const userStmt = globalDb.prepare('SELECT * FROM quick_notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1');
          note = userStmt.get(userId);
        } catch (colErr) {
          // If user_id column is not yet queried
        }
      }
      
      if (!note) {
        // Just return empty if not found
        return res.json({ id, title: '', content: '' });
      }
      
      res.json({ id: note.id, title: note.title || '', content: note.content || '' });
    } catch (error) {
      console.error('[QuickNotes API] GET error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve quick note' });
    }
  });

  // POST /api/quick-notes/:id - Save or update a sticky note
  router.post('/:id', authMiddleware, (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.userId || req.user?.id || 'admin_auth';
      const { title, content } = req.body;
      
      try {
        const stmt = globalDb.prepare(`
          INSERT INTO quick_notes (id, user_id, title, content, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            title = excluded.title,
            content = excluded.content,
            updated_at = datetime('now')
        `);
        stmt.run(id, userId, title || '', content || '');
      } catch (colErr) {
        // Fallback if column user_id is in migration phase
        const stmt = globalDb.prepare(`
          INSERT INTO quick_notes (id, title, content, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            updated_at = datetime('now')
        `);
        stmt.run(id, title || '', content || '');
      }
      
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
