const express = require('express');
const router = express.Router();

/**
 * Reminders API - Handles desktop widget reminders
 */
module.exports = function(globalDb, authMiddleware) {
  
  // GET /api/reminders/:widgetId - Fetch all reminders for a specific widget or account fallback
  router.get('/:widgetId', authMiddleware, (req, res) => {
    try {
      const { widgetId } = req.params;
      const userId = req.user?.userId || req.user?.id || 'admin_auth';
      
      const stmt = globalDb.prepare('SELECT id, text, completed FROM reminders WHERE widget_id = ? ORDER BY updated_at ASC');
      let reminders = stmt.all(widgetId);
      
      // If no reminders found for this widget instance, check for user's reminders across devices
      if ((!reminders || reminders.length === 0) && userId) {
        try {
          const userStmt = globalDb.prepare('SELECT id, text, completed FROM reminders WHERE user_id = ? ORDER BY updated_at ASC');
          const userReminders = userStmt.all(userId);
          if (userReminders && userReminders.length > 0) {
            reminders = userReminders;
          }
        } catch (colErr) {
          // Column user_id not yet queried
        }
      }
      
      res.json({ success: true, reminders: reminders || [] });
    } catch (error) {
      console.error('[Reminders API] GET error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve reminders' });
    }
  });

  // POST /api/reminders/:widgetId - Batch update reminders for a specific widget
  router.post('/:widgetId', authMiddleware, (req, res) => {
    const { widgetId } = req.params;
    const userId = req.user?.userId || req.user?.id || 'admin_auth';
    const { reminders } = req.body; // Array of { id, text, completed }
    
    if (!Array.isArray(reminders)) {
      return res.status(400).json({ error: 'Invalid reminders data' });
    }

    const transaction = globalDb.transaction((items) => {
      // Clear existing reminders for this widget
      globalDb.prepare('DELETE FROM reminders WHERE widget_id = ?').run(widgetId);
      
      // Insert new ones (with user_id for cross-device persistence)
      let insertWithUser;
      try {
        insertWithUser = globalDb.prepare(`
          INSERT INTO reminders (id, widget_id, user_id, text, completed, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
      } catch (e) {
        insertWithUser = null;
      }
      
      const fallbackInsert = globalDb.prepare(`
        INSERT INTO reminders (id, widget_id, text, completed, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      
      for (const item of items) {
        if (insertWithUser) {
          try {
            insertWithUser.run(item.id.toString(), widgetId, userId, item.text, item.completed ? 1 : 0);
            continue;
          } catch (e) {}
        }
        fallbackInsert.run(item.id.toString(), widgetId, item.text, item.completed ? 1 : 0);
      }
    });

    try {
      transaction(reminders);
      res.json({ success: true, message: 'Reminders synced' });
    } catch (error) {
      console.error('[Reminders API] POST error:', error.message);
      res.status(500).json({ error: 'Failed to sync reminders' });
    }
  });

  // DELETE /api/reminders/:widgetId - Remove all reminders for a specific widget
  router.delete('/:widgetId', authMiddleware, (req, res) => {
    try {
      const { widgetId } = req.params;
      const stmt = globalDb.prepare('DELETE FROM reminders WHERE widget_id = ?');
      stmt.run(widgetId);
      res.json({ success: true, message: 'Reminders deleted' });
    } catch (error) {
      console.error('[Reminders API] DELETE error:', error.message);
      res.status(500).json({ error: 'Failed to delete reminders' });
    }
  });

  return router;
};
