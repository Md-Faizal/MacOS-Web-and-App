const express = require('express');
const router = express.Router();

/**
 * Weather Settings API - Handles persistent weather preferences
 */
module.exports = function(globalDb, authMiddleware) {
  
  // GET /api/weather/settings - Retrieve settings for the current user
  router.get('/settings', authMiddleware, (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'admin_auth';
      const stmt = globalDb.prepare('SELECT * FROM weather_settings WHERE user_id = ?');
      let settings = stmt.get(userId);
      
      if (!settings) {
        return res.json({
          city: 'London',
          lat: 51.5074,
          lon: -0.1278,
          unit: 'C',
          isExpanded: 0,
          isDefault: true
        });
      }
      
      res.json({
        ...settings,
        isDefault: false
      });
    } catch (error) {
      console.error('[Weather API] GET /settings error:', error.message);
      res.status(500).json({ error: 'Failed to retrieve weather settings' });
    }
  });

  // POST /api/weather/settings - Update settings for the current user
  router.post('/settings', authMiddleware, (req, res) => {
    try {
      const userId = req.user?.userId || req.user?.id || 'admin_auth';
      const { city, lat, lon, unit, isExpanded } = req.body;
      
      const stmt = globalDb.prepare(`
        INSERT INTO weather_settings (user_id, city, lat, lon, unit, isExpanded, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          city = excluded.city,
          lat = excluded.lat,
          lon = excluded.lon,
          unit = excluded.unit,
          isExpanded = excluded.isExpanded,
          updated_at = datetime('now')
      `);
      
      stmt.run(
        userId, 
        city || 'London', 
        lat !== undefined ? Number(lat) : 51.5074, 
        lon !== undefined ? Number(lon) : -0.1278, 
        unit || 'C', 
        isExpanded ? 1 : 0
      );
      
      res.json({ success: true, message: 'Weather settings saved successfully' });
    } catch (error) {
      console.error('[Weather API] POST /settings error:', error.message);
      res.status(500).json({ error: 'Failed to save weather settings' });
    }
  });

  return router;
};
