const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'database', 'MacOS.db');
const db = new sqlite3(dbPath);

try {
  // Add invoice_id column to payments table
  db.prepare('ALTER TABLE payments ADD COLUMN invoice_id INTEGER;').run();
  console.log('✓ Added invoice_id column to payments table');
} catch (err) {
  if (err.message.includes('duplicate column name')) {
    console.log('○ invoice_id column already exists in payments table');
  } else {
    console.error('❌ Error adding column:', err.message);
  }
}

db.close();
