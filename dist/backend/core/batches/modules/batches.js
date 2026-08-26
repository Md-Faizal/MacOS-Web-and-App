module.exports = function(db) {
  // Ensure batches table exists
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      batch_number TEXT NOT NULL UNIQUE,
      purchase_date DATETIME NOT NULL,
      expiry_date DATETIME,
      manufacturing_date DATETIME,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      supplier TEXT,
      location TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.exec(createTableSQL);

  return {
    // Create a new batch
    createBatch: (req, res) => {
      const { product_id, variant_id, batch_number, purchase_date, expiry_date, manufacturing_date, quantity, unit_cost, supplier, location, status = 'active', notes } = req.body;
      
      if (!product_id || !batch_number || !purchase_date || !quantity || !unit_cost) {
        return res.status(400).json({ error: 'Missing required fields: product_id, batch_number, purchase_date, quantity, unit_cost' });
      }

      const sql = `
        INSERT INTO batches (product_id, variant_id, batch_number, purchase_date, expiry_date, manufacturing_date, quantity, unit_cost, supplier, location, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(
          product_id,
          variant_id || null,
          batch_number,
          purchase_date,
          expiry_date || null,
          manufacturing_date || null,
          quantity,
          unit_cost,
          supplier || null,
          location || null,
          status,
          notes || null
        );
        
        res.status(201).json({
          id: result.lastInsertRowid,
          product_id,
          variant_id,
          batch_number,
          purchase_date,
          expiry_date,
          manufacturing_date,
          quantity,
          unit_cost,
          supplier,
          location,
          status,
          notes,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get all batches
    getBatches: (req, res) => {
      const { product_id, status, limit = 100, offset = 0 } = req.query;
      
      let sql = 'SELECT * FROM batches WHERE 1=1';
      const params = [];

      if (product_id) {
        sql += ' AND product_id = ?';
        params.push(product_id);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY expiry_date ASC, created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get single batch
    getBatch: (req, res) => {
      const { id } = req.params;
      const sql = 'SELECT * FROM batches WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(id);
        
        if (!row) {
          return res.status(404).json({ error: 'Batch not found' });
        }
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Update batch
    updateBatch: (req, res) => {
      const { id } = req.params;
      const { batch_number, purchase_date, expiry_date, manufacturing_date, quantity, unit_cost, supplier, location, status, notes } = req.body;

      const updates = [];
      const values = [];

      if (batch_number !== undefined) {
        updates.push('batch_number = ?');
        values.push(batch_number);
      }
      if (purchase_date !== undefined) {
        updates.push('purchase_date = ?');
        values.push(purchase_date);
      }
      if (expiry_date !== undefined) {
        updates.push('expiry_date = ?');
        values.push(expiry_date);
      }
      if (manufacturing_date !== undefined) {
        updates.push('manufacturing_date = ?');
        values.push(manufacturing_date);
      }
      if (quantity !== undefined) {
        updates.push('quantity = ?');
        values.push(quantity);
      }
      if (unit_cost !== undefined) {
        updates.push('unit_cost = ?');
        values.push(unit_cost);
      }
      if (supplier !== undefined) {
        updates.push('supplier = ?');
        values.push(supplier);
      }
      if (location !== undefined) {
        updates.push('location = ?');
        values.push(location);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      values.push(id);

      const sql = `UPDATE batches SET ${updates.join(', ')} WHERE id = ?`;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Batch not found' });
        }
        
        const getStmt = db.prepare('SELECT * FROM batches WHERE id = ?');
        const batch = getStmt.get(id);
        res.json(batch);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Delete batch
    deleteBatch: (req, res) => {
      const { id } = req.params;
      const sql = 'DELETE FROM batches WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Batch not found' });
        }
        
        res.json({ message: 'Batch deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get expiring batches (expiry within 30 days)
    getExpiringBatches: (req, res) => {
      const sql = `
        SELECT * FROM batches 
        WHERE expiry_date IS NOT NULL 
        AND expiry_date BETWEEN datetime('now') AND datetime('now', '+30 days')
        AND status = 'active'
        ORDER BY expiry_date ASC
      `;

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all();
        res.json({
          expiring_batches: rows,
          expiry_window_days: 30,
          count: rows.length
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get batch summary statistics
    getBatchSummary: (req, res) => {
      const sql = `
        SELECT 
          COUNT(*) as total_batches,
          SUM(quantity) as total_quantity,
          SUM(quantity * unit_cost) as total_value,
          status,
          COUNT(CASE WHEN expiry_date < datetime('now') THEN 1 END) as expired_batches
        FROM batches
        GROUP BY status
      `;

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all();
        res.json({
          summary: rows
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};
