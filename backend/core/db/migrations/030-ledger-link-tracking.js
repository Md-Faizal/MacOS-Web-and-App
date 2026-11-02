function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  const migrate = db.transaction(() => {
    if (!hasColumn(db, 'contacts', 'last_portal_opened_at')) {
      db.exec('ALTER TABLE contacts ADD COLUMN last_portal_opened_at DATETIME');
    }
    if (!hasColumn(db, 'contacts', 'portal_open_count')) {
      db.exec('ALTER TABLE contacts ADD COLUMN portal_open_count INTEGER DEFAULT 0');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_link_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        ledger_token TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'VIEW',
        ip_address TEXT,
        user_agent TEXT,
        device_type TEXT,
        os TEXT,
        browser TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        isp TEXT,
        dwell_seconds INTEGER DEFAULT 0,
        scroll_depth INTEGER DEFAULT 0,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_logs_token ON ledger_link_access_logs(ledger_token);
      CREATE INDEX IF NOT EXISTS idx_ledger_logs_customer ON ledger_link_access_logs(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_logs_created ON ledger_link_access_logs(created_at);
    `);
  });

  migrate();
}

module.exports = { up };

