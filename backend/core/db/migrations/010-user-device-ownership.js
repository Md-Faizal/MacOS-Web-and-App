/**
 * Scope device records to the authenticated user.
 * Existing devices are assigned to the current owner during migration.
 */
function tableExists(db, tableName) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);
}

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (!tableExists(db, 'user_devices') || !tableExists(db, 'users')) return;

  if (!hasColumn(db, 'user_devices', 'user_id')) {
    db.exec('ALTER TABLE user_devices ADD COLUMN user_id TEXT');
  }

  const owner = db.prepare(
    "SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1"
  ).get();

  if (owner) {
    db.prepare('UPDATE user_devices SET user_id = ? WHERE user_id IS NULL')
      .run(owner.id);
  }

  const tableSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_devices'"
  ).get()?.sql || '';
  if (/device_name\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(tableSql)) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE user_devices_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        device_name TEXT NOT NULL,
        device_type TEXT,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_current INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, device_name)
      );
      INSERT INTO user_devices_migrated
        (id, user_id, device_name, device_type, last_login, last_seen, is_current, created_at)
      SELECT id, user_id, device_name, device_type, last_login, last_seen, is_current, created_at
      FROM user_devices;
      DROP TABLE user_devices;
      ALTER TABLE user_devices_migrated RENAME TO user_devices;
    `);
    db.pragma('foreign_keys = ON');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices (user_id)');
}

module.exports = { up };
