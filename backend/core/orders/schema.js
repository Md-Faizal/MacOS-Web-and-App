const schema = `
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    current_stage TEXT DEFAULT 'stage1',
    status TEXT DEFAULT 'pending',
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_notes TEXT,
    qc_date DATETIME,
    qc_notes TEXT,
    delivery_notes TEXT,
    checklist_items TEXT,
    delivery_date DATETIME,
    bill_reference TEXT,
    recommended_products TEXT,
    total_amount REAL NOT NULL,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    shipping_address TEXT,
    notes TEXT,
    share_token TEXT,
    plant_status TEXT DEFAULT 'pending',
    plant_submitted_at DATETIME,
    plant_notes TEXT,
    plant_cases INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(customer_id, order_number)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    variant_id INTEGER,
    batch_id INTEGER,
    quantity INTEGER NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    plant_status TEXT DEFAULT 'pending',
    packed_quantity REAL,
    packed_batch_id INTEGER,
    packed_batch_no TEXT,
    packed_expiry TEXT,
    plant_notes TEXT,
    last_known_quantity REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS plant_manifests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    title TEXT,
    status TEXT DEFAULT 'active',
    cases_count INTEGER DEFAULT 0,
    plant_notes TEXT,
    version INTEGER DEFAULT 1,
    submitted_at DATETIME,
    created_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plant_manifest_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manifest_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(manifest_id, order_id),
    FOREIGN KEY (manifest_id) REFERENCES plant_manifests(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
`;

module.exports = { schema };
