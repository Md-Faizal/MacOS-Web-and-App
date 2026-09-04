const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('🔄 Checking & migrating creator columns...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const migrations = [
  { table: 'contacts', column: 'created_by_user_id', type: 'TEXT' },
  { table: 'invoices', column: 'created_by_user_id', type: 'TEXT' },
  { table: 'invoices', column: 'last_edited_by', type: 'TEXT' },
  { table: 'payments', column: 'created_by_user_id', type: 'TEXT' },
  { table: 'orders', column: 'created_by_user_id', type: 'TEXT' }
];

for (const { table, column, type } of migrations) {
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!tableExists) continue;

    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
      console.log(`➕ Adding column '${column}' to table '${table}'...`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`✅ Column '${column}' added to '${table}'.`);
    } else {
      console.log(`✓ Table '${table}' already has column '${column}'.`);
    }
  } catch (err) {
    console.error(`❌ Error migrating ${table}.${column}:`, err.message);
  }
}

console.log('🎉 Column migration complete!');
