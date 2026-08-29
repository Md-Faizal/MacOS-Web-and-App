function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (!hasColumn(db, 'auth_sessions', 'elevated_until')) {
    db.exec('ALTER TABLE auth_sessions ADD COLUMN elevated_until DATETIME');
  }
}

module.exports = { up };