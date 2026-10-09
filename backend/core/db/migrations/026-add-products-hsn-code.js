/**
 * 026-add-products-hsn-code.js
 *
 * Ensures `hsn_code` column exists on `products` table and assigns the
 * canonical 8-digit Ayurvedic medicament HSN code '30049011' to all existing products.
 */

function up(db) {
  try {
    const prodCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
    if (!prodCols.includes('hsn_code')) {
      db.exec("ALTER TABLE products ADD COLUMN hsn_code TEXT DEFAULT '30049011'");
      console.log('✓ Migration 026: Added hsn_code column to products table');
    }

    const res = db.prepare("UPDATE products SET hsn_code = '30049011' WHERE hsn_code IS NULL OR TRIM(hsn_code) = ''").run();
    if (res.changes > 0) {
      console.log(`✓ Migration 026: Updated ${res.changes} product(s) to canonical HSN code 30049011`);
    }
  } catch (err) {
    console.error('Migration 026 error:', err.message);
  }
}

module.exports = { up };
