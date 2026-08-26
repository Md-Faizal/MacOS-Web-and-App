CREATE TABLE customer_item_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  discount_1 REAL DEFAULT 0,
  discount_2 REAL DEFAULT 0,
  scheme TEXT,
  tax_percent REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE(customer_id, product_id)
)