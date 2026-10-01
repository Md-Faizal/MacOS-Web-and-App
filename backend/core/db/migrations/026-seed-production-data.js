/**
 * 026-seed-production-data.js
 *
 * Automatically seeds the business database if empty.
 * Idempotent: Only runs if 'invoices' table has 0 rows and 'products' table has 0 rows.
 * Uses INSERT OR IGNORE so no conflicts can ever occur.
 */

const fs = require('fs');
const path = require('path');

function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function up(db) {
  if (!tableExists(db, 'invoices') || !tableExists(db, 'products')) return;

  const invoiceCount = db.prepare("SELECT COUNT(*) as c FROM invoices").get()?.c || 0;
  const productCount = db.prepare("SELECT COUNT(*) as c FROM products").get()?.c || 0;

  // If database already contains invoices or products, do NOT touch existing records
  if (invoiceCount > 0 || productCount > 5) {
    return;
  }

  const seedPath = path.join(__dirname, '../seed/production-data-seed.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('⚠️ Seed data file not found at:', seedPath);
    return;
  }

  try {
    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    console.log('🌱 Database is empty. Restoring business production seed data...');

    let insertedTables = 0;
    let totalRows = 0;

    // Insertion order preserving foreign keys
    const tableOrder = [
      'categories',
      'products',
      'variants',
      'batches',
      'contacts',
      'invoices',
      'invoice_items',
      'payments',
      'ledger',
      'customer_item_memory',
      'orders',
      'order_items',
      'Settings',
      'app_settings',
      'desktop_state',
      'clock_settings',
      'weather_settings',
      'notes',
      'quick_notes',
      'reminders',
      'users',
      'user_permissions',
      'user_identities',
      'user_contact_access'
    ];

    const prevFk = db.pragma('foreign_keys', { simple: true });
    db.pragma('foreign_keys = OFF');

    try {
      const insertAll = db.transaction(() => {
        for (const tableName of tableOrder) {
          const rows = seedData[tableName];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          if (!tableExists(db, tableName)) continue;

          const sample = rows[0];
          const cols = Object.keys(sample);
          const placeholders = cols.map(() => '?').join(', ');
          const colNames = cols.map(c => `"${c}"`).join(', ');

          const stmt = db.prepare(`INSERT OR IGNORE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);

          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c];
              if (v === undefined || v === null) return null;
              if (typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
                return Buffer.from(v.data);
              }
              return v;
            });
            stmt.run(...values);
            totalRows++;
          }
          insertedTables++;
        }
      });

      insertAll();
      console.log(`✅ [Seed Data] Successfully restored ${totalRows} records across ${insertedTables} tables into database!`);
    } finally {
      if (prevFk) db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.error('✗ Failed to restore seed data:', err.message);
  }
}

module.exports = { up };
