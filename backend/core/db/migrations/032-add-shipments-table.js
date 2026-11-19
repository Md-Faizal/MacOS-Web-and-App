function hasColumn(db, tableName, columnName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().some(c => c.name === columnName);
  } catch (_) {
    return false;
  }
}

function up(db) {
  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipment_uid TEXT NOT NULL UNIQUE,
        contact_id INTEGER NOT NULL,
        contact_name TEXT NOT NULL,
        recipient_address TEXT NOT NULL,
        recipient_phone TEXT,
        recipient_pincode TEXT,
        sender_address TEXT NOT NULL,
        sender_phone TEXT,
        boxes_count INTEGER DEFAULT 1,
        invoice_ref TEXT,
        route_note TEXT,
        status TEXT DEFAULT 'GENERATED',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_shipments_uid ON shipments(shipment_uid);
      CREATE INDEX IF NOT EXISTS idx_shipments_contact ON shipments(contact_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(created_at);
    `);

    if (!hasColumn(db, 'shipments', 'invoice_ref')) {
      db.exec('ALTER TABLE shipments ADD COLUMN invoice_ref TEXT');
    }
  });

  migrate();
}

module.exports = { up };
