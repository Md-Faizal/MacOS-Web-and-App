// Request handlers for Payments module
module.exports = function(db) {
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

    // Update payment
    updatePayment: (req, res) => {
      const { id } = req.params;
      const { status, processed_at, notes } = req.body;

      const updates = [];
      const values = [];

      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (processed_at !== undefined) {
        updates.push('processed_at = ?');
        values.push(processed_at);
      }
      if (created_at !== undefined) {
        updates.push('created_at = ?');
        values.push(created_at);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      values.push(id);
      const sql = `UPDATE payments SET ${updates.join(', ')} WHERE id = ?`;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
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

      try {
        // First check if payment exists
        const payment = db.prepare('SELECT id, customer_id FROM payments WHERE id = ?').get(id);
        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        const customer_id = payment.customer_id;

        // Delete the payment
        const stmt = db.prepare('DELETE FROM payments WHERE id = ?');
        const result = stmt.run(id);

        // Recalculate customer's current_due
        const totals = db.prepare(`
          SELECT 
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = ?), 0) as total_debit,
            COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ? AND type = 'PAYMENT'), 0) as total_payments,
            COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = ? AND type = 'CREDIT_NOTE'), 0) as total_credits,
            (SELECT COUNT(*) FROM invoices WHERE customer_id = ?) as total_bills,
            (SELECT COUNT(*) FROM payments WHERE customer_id = ?) as total_payments_count
        `).get(customer_id, customer_id, customer_id, customer_id, customer_id);

        const total_credit = totals.total_payments + totals.total_credits;
        const current_due = totals.total_debit - total_credit;
        
        // Determine current status based on current_due
        let current_status = 'PENDING';
        if (current_due < 0) {
          current_status = 'CREDIT';
        } else if (current_due === 0) {
          current_status = 'SETTLED';
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
