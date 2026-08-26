/**
 * Variants Schema - Unified with Products and Batches
 * 
 * This schema is now managed centrally via products/schema-unified.js
 * This file is kept for backward compatibility
 */

const schema = `
  CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    variant_name TEXT NOT NULL,
    variant_type TEXT,
    variant_value TEXT,
    pack_size_value REAL,
    pack_size_type TEXT,
    price REAL NOT NULL,
    cost REAL,
    quantity INTEGER DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    description TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )
`;

module.exports = { schema };
