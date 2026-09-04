function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_contact_access'").get()) {
    if (!hasColumn(db, 'user_contact_access', 'exclude_from_stats')) {
      db.exec('ALTER TABLE user_contact_access ADD COLUMN exclude_from_stats INTEGER DEFAULT 0');
    }
    if (!hasColumn(db, 'user_contact_access', 'disable_duplex_export')) {
      db.exec('ALTER TABLE user_contact_access ADD COLUMN disable_duplex_export INTEGER DEFAULT 0');
    }
  }
}

module.exports = { up };
