function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (!hasColumn(db, 'auth_refresh_tokens', 'provider')) {
    db.exec('ALTER TABLE auth_refresh_tokens ADD COLUMN provider TEXT');
  }
}

module.exports = { up };
