/**
 * Migration 021: Device Client Type Distinction (PWA vs Native Android vs Web)
 * Adds client_type to user_devices to accurately distinguish PWA and Native apps
 */

module.exports = {
  version: 21,
  name: '021-device-client-type',
  up: (db) => {
    const hasColumn = (database, table, column) => {
      try {
        const info = database.prepare(`PRAGMA table_info(${table})`).all();
        return info.some(col => col.name === column);
      } catch (e) {
        return false;
      }
    };

    if (!hasColumn(db, 'user_devices', 'client_type')) {
      db.exec("ALTER TABLE user_devices ADD COLUMN client_type TEXT DEFAULT 'web'");
    }
  }
};
