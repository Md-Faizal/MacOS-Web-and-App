function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(column => column.name === columnName);
}

function up(db) {
  if (tableExists(db, 'user_devices') && !hasColumn(db, 'user_devices', 'app_name')) {
    db.exec('ALTER TABLE user_devices ADD COLUMN app_name TEXT NOT NULL DEFAULT "macos"');
  }

  if (tableExists(db, 'auth_sessions') && !hasColumn(db, 'auth_sessions', 'app_name')) {
    db.exec('ALTER TABLE auth_sessions ADD COLUMN app_name TEXT NOT NULL DEFAULT "macos"');
  }

  if (tableExists(db, 'auth_sessions') && !hasColumn(db, 'auth_sessions', 'device_id')) {
    db.exec('ALTER TABLE auth_sessions ADD COLUMN device_id INTEGER');
  }

  if (tableExists(db, 'user_devices')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_user_devices_app_name ON user_devices (user_id, app_name, is_current)');
  }

  if (tableExists(db, 'auth_sessions')) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_app_name ON auth_sessions (user_id, app_name, revoked_at, absolute_expires_at)');
  }
}

module.exports = { up };
