module.exports = function(db) {
  // Ensure payments table exists
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reference_number TEXT UNIQUE,
      processed_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.exec(createTableSQL);

  return {
    // Create a new payment
    createPayment: (req, res) => {
      const { transaction_id, amount, payment_method, reference_number, notes } = req.body;
      
      if (!amount || !payment_method) {
        return res.status(400).json({ error: 'Missing required fields: amount, payment_method' });
      }

      const sql = `
        INSERT INTO payments (transaction_id, amount, payment_method, reference_number, notes, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(transaction_id || null, amount, payment_method, reference_number || null, notes || null);
        
        res.status(201).json({
          id: result.lastInsertRowid,
          transaction_id: transaction_id || null,
          amount,
          payment_method,
          reference_number: reference_number || null,
          status: 'pending',
          notes,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get all payments
    getPayments: (req, res) => {
      const { status, payment_method, limit = 100, offset = 0 } = req.query;
      
      let sql = 'SELECT * FROM payments WHERE 1=1';
      const params = [];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      if (payment_method) {
        sql += ' AND payment_method = ?';
        params.push(payment_method);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get single payment
    getPayment: (req, res) => {
      const { id } = req.params;
      const sql = 'SELECT * FROM payments WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(id);
        
        if (!row) {
          return res.status(404).json({ error: 'Payment not found' });
        }
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Update payment status
    updatePayment: (req, res) => {
      const { id } = req.params;
      const { status, processed_at, notes } = req.body;

      const sql = `
        UPDATE payments 
        SET status = ?, processed_at = ?, notes = ?
        WHERE id = ?
      `;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(status || 'pending', processed_at || null, notes || null, id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Payment not found' });
        }
        
        const getStmt = db.prepare('SELECT * FROM payments WHERE id = ?');
        const payment = getStmt.get(id);
        res.json(payment);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Delete payment
    deletePayment: (req, res) => {
      const { id } = req.params;
      const sql = 'DELETE FROM payments WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Payment not found' });
        }
        
        res.json({ message: 'Payment deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get payment summary statistics
    getPaymentSummary: (req, res) => {
      const { start_date, end_date } = req.query;
      
      let sql = `
        SELECT 
          COUNT(*) as total_payments,
          SUM(amount) as total_amount,
          payment_method,
          status,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
        FROM payments
        WHERE 1=1
      `;
      const params = [];

      if (start_date) {
        sql += ' AND created_at >= ?';
        params.push(start_date);
      }

      if (end_date) {
        sql += ' AND created_at <= ?';
        params.push(end_date);
      }

      sql += ' GROUP BY payment_method, status';

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        res.json({
          summary: rows,
          date_range: { start: start_date, end: end_date }
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};
