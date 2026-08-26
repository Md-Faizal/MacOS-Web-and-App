/**
 * Batches Schema - Unified with Products and Variants
 * 
 * This schema is now managed centrally via products/schema-unified.js
 * This file is kept for backward compatibility
 */

const schema = `
  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    batch_number TEXT NOT NULL UNIQUE,
    batch_no TEXT,
    mrp REAL,
    purchase_date DATETIME,
    expiry_date DATETIME,
    exp_date DATE,
    mfg_date DATE,
    manufacturing_date DATETIME,
    quantity INTEGER NOT NULL,
    units_sold INTEGER DEFAULT 0,
    unit_cost REAL,
    supplier TEXT,
    location TEXT,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
  )
`;

module.exports = { schema };
