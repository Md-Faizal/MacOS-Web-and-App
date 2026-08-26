CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  current_stage TEXT DEFAULT 'stage1',
  order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  order_notes TEXT,
  qc_date DATETIME,
  qc_notes TEXT,
  checklist_items TEXT,
  delivery_date DATETIME,
  bill_reference TEXT,
  total_amount REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, discount REAL DEFAULT 0, tax REAL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)