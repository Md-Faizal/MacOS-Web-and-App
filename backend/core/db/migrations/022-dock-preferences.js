/**
 * Migration 022: Dock Preferences Server-Side Storage
 * Adds dock_magnification, dock_auto_hide, and dock_apps_order to Settings table
 */

module.exports = {
  version: 22,
  name: '022-dock-preferences',
  up: (db) => {
    const hasColumn = (database, table, column) => {
      try {
        const info = database.prepare(`PRAGMA table_info(${table})`).all();
        return info.some(col => col.name === column);
      } catch (e) {
        return false;
      }
    };

    if (!hasColumn(db, 'Settings', 'dock_magnification')) {
      db.exec('ALTER TABLE Settings ADD COLUMN dock_magnification INTEGER DEFAULT 0');
    }

    if (!hasColumn(db, 'Settings', 'dock_auto_hide')) {
      db.exec('ALTER TABLE Settings ADD COLUMN dock_auto_hide INTEGER DEFAULT 0');
    }

    if (!hasColumn(db, 'Settings', 'dock_apps_order')) {
      db.exec('ALTER TABLE Settings ADD COLUMN dock_apps_order TEXT DEFAULT NULL');
    }
  }
};
