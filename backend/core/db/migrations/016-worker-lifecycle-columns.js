function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (!hasColumn(db, 'users', 'deletion_requested_at')) {
    db.exec('ALTER TABLE users ADD COLUMN deletion_requested_at DATETIME');
  }
  if (!hasColumn(db, 'users', 'deletion_reason')) {
    db.exec('ALTER TABLE users ADD COLUMN deletion_reason TEXT');
  }
  if (!hasColumn(db, 'users', 'deleted_at')) {
    db.exec('ALTER TABLE users ADD COLUMN deleted_at DATETIME');
  }
  if (!hasColumn(db, 'users', 'deleted_by')) {
    db.exec('ALTER TABLE users ADD COLUMN deleted_by TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_lifecycle_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'worker',
      status TEXT DEFAULT 'active',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT,
      approved_at DATETIME,
      deletion_reason TEXT,
      deleted_at DATETIME,
      deleted_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_user ON worker_lifecycle_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_worker_lifecycle_email ON worker_lifecycle_history(email);
  `);
}

module.exports = { up };
