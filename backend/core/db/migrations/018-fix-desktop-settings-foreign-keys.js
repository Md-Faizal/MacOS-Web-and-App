/**
 * Migration 018: Fix foreign keys for desktop_state, clock_settings, and weather_settings to reference users(id)
 */

module.exports = {
  version: 18,
  name: 'fix-desktop-settings-foreign-keys',
  
  up: (db) => {
    try {
      db.exec(`
        -- 1. Migrate desktop_state
        CREATE TABLE IF NOT EXISTS desktop_state_new (
          user_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT OR IGNORE INTO desktop_state_new (user_id, state, updated_at)
        SELECT user_id, state, updated_at FROM desktop_state WHERE user_id IN (SELECT id FROM users);

        DROP TABLE IF EXISTS desktop_state;
        ALTER TABLE desktop_state_new RENAME TO desktop_state;

        -- 2. Migrate clock_settings
        CREATE TABLE IF NOT EXISTS clock_settings_new (
          user_id TEXT PRIMARY KEY,
          mode TEXT DEFAULT 'auto',
          timezone TEXT,
          cityName TEXT,
          manualOffset INTEGER DEFAULT 0,
          worldClocks TEXT DEFAULT '[]',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT OR IGNORE INTO clock_settings_new (user_id, mode, timezone, cityName, manualOffset, worldClocks, updated_at)
        SELECT user_id, mode, timezone, cityName, manualOffset, worldClocks, updated_at FROM clock_settings WHERE user_id IN (SELECT id FROM users);

        DROP TABLE IF EXISTS clock_settings;
        ALTER TABLE clock_settings_new RENAME TO clock_settings;

        -- 3. Migrate weather_settings
        CREATE TABLE IF NOT EXISTS weather_settings_new (
          user_id TEXT PRIMARY KEY,
          city TEXT DEFAULT 'London',
          lat REAL DEFAULT 51.5074,
          lon REAL DEFAULT -0.1278,
          unit TEXT DEFAULT 'C',
          isExpanded INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT OR IGNORE INTO weather_settings_new (user_id, city, lat, lon, unit, isExpanded, updated_at)
        SELECT user_id, city, lat, lon, unit, isExpanded, updated_at FROM weather_settings WHERE user_id IN (SELECT id FROM users);

        DROP TABLE IF EXISTS weather_settings;
        ALTER TABLE weather_settings_new RENAME TO weather_settings;
      `);
      console.log('  ✓ Fixed desktop_state, clock_settings, and weather_settings foreign keys');
    } catch (err) {
      console.warn('  ⚠️ Migration 018 warning:', err.message);
    }
  },
  
  down: (db) => {
    // No-op rollback
  }
};
