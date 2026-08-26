CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER,
  variant_id INTEGER,
  batch_id INTEGER,
  pack_value TEXT,
  pack_type TEXT,
  batch_no TEXT,
  exp_date DATE,
  qty INTEGER NOT NULL,
  scheme TEXT,
  free INTEGER DEFAULT 0,
  mrp REAL,
  rate REAL NOT NULL,
  -- Calculated amounts (for audit trail)
  amount REAL,                        -- qty × rate (before discounts)
  discount_1_percent REAL DEFAULT 0,  -- First discount as percentage
  discount_1_amount REAL DEFAULT 0,   -- First discount as monetary amount
  discount_2_percent REAL DEFAULT 0,  -- Second discount as percentage
  discount_2_amount REAL DEFAULT 0,   -- Second discount as monetary amount
  gst_percent REAL DEFAULT 0,         -- GST/Tax percentage
  gst_amount REAL DEFAULT 0,          -- GST/Tax monetary amount
  sgst_amount REAL DEFAULT 0,         -- SGST (state GST) amount
  cgst_amount REAL DEFAULT 0,         -- CGST (central GST) amount
  final_amount REAL,                  -- Final amount after all discounts and tax
  gst_reverse INTEGER DEFAULT 0,      -- GST Reverse indicator (1 = enabled, 0 = disabled)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
)