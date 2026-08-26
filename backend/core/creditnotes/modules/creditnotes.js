module.exports = function(db) {
  // Ensure credit_notes table exists
  const createTableSQL = `
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
  
  db.exec(createTableSQL);

  return {
    // Create a new credit note
    createCreditNote: (req, res) => {
      const { transaction_id, customer_id, amount, reason, status = 'active', reference_number, notes } = req.body;
      
      if (!customer_id || !amount || !reason) {
        return res.status(400).json({ error: 'Missing required fields: customer_id, amount, reason' });
      }

      try {
        const creditNoteNumber = 'CN-' + Date.now();
        const sql = `
          INSERT INTO credit_notes (credit_note_number, transaction_id, customer_id, amount, reason, status, reference_number, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const stmt = db.prepare(sql);
        const result = stmt.run(
          creditNoteNumber,
          transaction_id || null,
          customer_id,
          amount,
          reason,
          status,
          reference_number || null,
          notes || null
        );
        
        res.status(201).json({
          id: result.lastInsertRowid,
          credit_note_number: creditNoteNumber,
          transaction_id,
          customer_id,
          amount,
          reason,
          status,
          reference_number,
          notes,
          issued_date: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get all credit notes
    getCreditNotes: (req, res) => {
      const { customer_id, status, limit = 100, offset = 0 } = req.query;
      
      let sql = 'SELECT * FROM credit_notes WHERE 1=1';
      const params = [];

      if (customer_id) {
        sql += ' AND customer_id = ?';
        params.push(customer_id);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY issued_date DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get single credit note
    getCreditNote: (req, res) => {
      const { id } = req.params;
      const sql = 'SELECT * FROM credit_notes WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(id);
        
        if (!row) {
          return res.status(404).json({ error: 'Credit note not found' });
        }
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Update credit note
    updateCreditNote: (req, res) => {
      const { id } = req.params;
      const { status, notes } = req.body;

      const sql = `
        UPDATE credit_notes 
        SET status = ?, notes = ?
        WHERE id = ?
      `;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(status || 'active', notes || null, id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Credit note not found' });
        }
        
        const getStmt = db.prepare('SELECT * FROM credit_notes WHERE id = ?');
        const creditNote = getStmt.get(id);
        res.json(creditNote);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Delete credit note
    deleteCreditNote: (req, res) => {
      const { id } = req.params;
      const sql = 'DELETE FROM credit_notes WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Credit note not found' });
        }
        
        res.json({ message: 'Credit note deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get credit note summary
    getCreditNoteSummary: (req, res) => {
      const { start_date, end_date, customer_id } = req.query;
      
      let sql = `
        SELECT 
          COUNT(*) as total_credit_notes,
          SUM(amount) as total_credit_amount,
          status,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_notes
        FROM credit_notes
        WHERE 1=1
      `;
      const params = [];

      if (start_date) {
        sql += ' AND issued_date >= ?';
        params.push(start_date);
      }

      if (end_date) {
        sql += ' AND issued_date <= ?';
        params.push(end_date);
      }

      if (customer_id) {
        sql += ' AND customer_id = ?';
        params.push(customer_id);
      }

      sql += ' GROUP BY status';

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
