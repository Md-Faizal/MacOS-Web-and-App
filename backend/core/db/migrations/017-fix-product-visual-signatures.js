/**
 * Migration 017: Align product_visual_signatures table schema with master definitions
 */

module.exports = {
  version: 17,
  name: 'fix-product-visual-signatures',
  
  up: (db) => {
    try {
      db.exec(`
        DROP TABLE IF EXISTS product_visual_signatures;
        CREATE TABLE IF NOT EXISTS product_visual_signatures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          variant_id INTEGER,
          image_base64 TEXT NOT NULL,
          metadata TEXT,
          learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
        );
      `);
      console.log('  ✓ product_visual_signatures table aligned successfully');
    } catch (err) {
      console.warn('  ⚠️ Migration 017 warning:', err.message);
    }
  },
  
  down: (db) => {
    // No-op rollback
  }
};
