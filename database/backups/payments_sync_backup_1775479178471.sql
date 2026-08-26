CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('PAYMENT', 'CREDIT_NOTE')),
  amount REAL,
  credit_amount REAL,
  reason TEXT,
  payment_medium TEXT,
  reference_number TEXT,
  payment_date DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)