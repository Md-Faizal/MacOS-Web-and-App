function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  const columns = [
    ['lr_no', 'TEXT'],
    ['lr_date', 'DATE'],
    ['transport', 'TEXT'],
    ['cases', 'INTEGER DEFAULT 1']
  ];

  const migrate = db.transaction(() => {
    for (const [name, definition] of columns) {
      if (!hasColumn(db, 'orders', name)) {
        db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
      }
    }
  });

  migrate();
}

module.exports = { up };
