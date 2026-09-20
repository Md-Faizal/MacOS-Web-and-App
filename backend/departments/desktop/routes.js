const express = require('express');

module.exports = function createDesktopRouter(db, authMiddleware) {
  const router = express.Router();

  router.get('/state', authMiddleware, (req, res) => {
    try {
      const row = db.prepare('SELECT state FROM desktop_state WHERE user_id = ?').get(req.user.userId);
      res.json({ success: true, state: row ? JSON.parse(row.state) : null });
    } catch (err) {
      console.error('Get desktop state error:', err);
      res.status(500).json({ error: 'Failed to retrieve desktop state' });
    }
  });

  router.post('/state', authMiddleware, (req, res) => {
    try {
      const userId = req.user.userId;
      const { state } = req.body;
      if (!state) return res.status(400).json({ error: 'State is required' });

      const fullStateStr = JSON.stringify(req.body);
      const existing = db.prepare('SELECT user_id FROM desktop_state WHERE user_id = ?').get(userId);

      if (existing) {
        db.prepare('UPDATE desktop_state SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(fullStateStr, userId);
      } else {
        db.prepare('INSERT INTO desktop_state (user_id, state) VALUES (?, ?)').run(userId, fullStateStr);
      }

      res.json({ success: true, message: 'Desktop state saved successfully' });
    } catch (err) {
      console.error('Save desktop state error:', err);
      res.status(500).json({ error: 'Failed to save desktop state' });
    }
  });

  return router;
};
