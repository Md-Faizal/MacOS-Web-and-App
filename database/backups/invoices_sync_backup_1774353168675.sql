CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  invoice_no TEXT NOT NULL UNIQUE,
  due_date DATE,
  total_amount REAL DEFAULT 0,
  total_discount REAL DEFAULT 0,
  total_gst REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  previous_due REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, invoice_date DATETIME,
  FOREIGN KEY (customer_id) REFERENCES contacts(id)
)