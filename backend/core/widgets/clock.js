const express = require('express');
const router = express.Router();

/**
 * Clock API - Handles system-wide time settings and world clocks
 */
module.exports = function(globalDb, authMiddleware) {
  
  // GET /api/clock/settings - Retrieve settings for the current user
  router.get('/settings', authMiddleware, (req, res) => {
    try {
      const userId = req.user.id || 'admin_auth'; // Fallback to avoid crashes if token is somehow partial
      const stmt = globalDb.prepare('SELECT * FROM clock_settings WHERE user_id = ?');
      let settings = stmt.get(userId);
      
      if (!settings) {
        // Return defaults if no settings found
        return res.json({
          mode: 'auto',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          cityName: 'Local Time',
          manualOffset: 0,
          worldClocks: [
            { id: 'cupertino', name: 'Cupertino', timezone: 'America/Los_Angeles' },
            { id: 'london', name: 'London', timezone: 'Europe/London' },
            { id: 'tokyo', name: 'Tokyo', timezone: 'Asia/Tokyo' }
          ]
        });
      }

      // Parse worldClocks JSON string
      try {
        settings.worldClocks = JSON.parse(settings.worldClocks);
      } catch (e) {
        settings.worldClocks = [];
      }
      
      res.json(settings);
    } catch (error) {
      console.error('[Clock API] GET /settings error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve clock settings' });
    }
  });

  // POST /api/clock/settings - Update settings for the current user
  router.post('/settings', authMiddleware, (req, res) => {
    try {
      const userId = req.user.id || 'admin_auth';
      const { mode, timezone, cityName, manualOffset, worldClocks } = req.body;
      
      const worldClocksStr = Array.isArray(worldClocks) ? JSON.stringify(worldClocks) : '[]';
      
      const stmt = globalDb.prepare(`
        INSERT INTO clock_settings (user_id, mode, timezone, cityName, manualOffset, worldClocks, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          mode = excluded.mode,
          timezone = excluded.timezone,
          cityName = excluded.cityName,
          manualOffset = excluded.manualOffset,
          worldClocks = excluded.worldClocks,
          updated_at = datetime('now')
      `);
      
      stmt.run(
        userId, 
        mode || 'auto', 
        timezone || null, 
        cityName || 'Local Time', 
        manualOffset || 0, 
        worldClocksStr
      );
      
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      console.error('[Clock API] POST /settings error:', error.message);
      res.status(500).json({ error: 'Failed to save clock settings' });
    }
  });

  return router;
};
