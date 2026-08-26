const schema = `
  CREATE TABLE IF NOT EXISTS credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_note_number TEXT UNIQUE NOT NULL,
    transaction_id INTEGER,
    customer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    issued_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    reference_number TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

module.exports = { schema };
