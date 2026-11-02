function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  const migrate = db.transaction(() => {
    // Add source and ref_number to ledger_link_access_logs
    if (!hasColumn(db, 'ledger_link_access_logs', 'source')) {
      db.exec("ALTER TABLE ledger_link_access_logs ADD COLUMN source TEXT DEFAULT 'manual_share'");
    }
    if (!hasColumn(db, 'ledger_link_access_logs', 'ref_number')) {
      db.exec('ALTER TABLE ledger_link_access_logs ADD COLUMN ref_number TEXT DEFAULT NULL');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ledger_logs_source ON ledger_link_access_logs(source);
    `);
  });

  migrate();
}

module.exports = { up };
