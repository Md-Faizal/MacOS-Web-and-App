module.exports = function(db) {
  // Ensure variants table exists
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      variant_name TEXT NOT NULL,
      variant_type TEXT,
      variant_value TEXT,
      price REAL,
      cost REAL,
      quantity INTEGER DEFAULT 0,
      reorder_level INTEGER DEFAULT 10,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.exec(createTableSQL);

  return {
    // Create a new variant
    createVariant: (req, res) => {
      const { product_id, sku, variant_name, variant_type, variant_value, price, cost, quantity = 0, reorder_level = 10, description, image_url } = req.body;
      
      if (!product_id || !sku || !variant_name) {
        return res.status(400).json({ error: 'Missing required fields: product_id, sku, variant_name' });
      }

      const sql = `
        INSERT INTO variants (product_id, sku, variant_name, variant_type, variant_value, price, cost, quantity, reorder_level, description, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(
          product_id,
          sku,
          variant_name,
          variant_type || null,
          variant_value || null,
          price || null,
          cost || null,
          quantity,
          reorder_level,
          description || null,
          image_url || null
        );
        
        res.status(201).json({
          id: result.lastInsertRowid,
          product_id,
          sku,
          variant_name,
          variant_type,
          variant_value,
          price,
          cost,
          quantity,
          reorder_level,
          description,
          image_url,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get all variants
    getVariants: (req, res) => {
      const { product_id, limit = 100, offset = 0 } = req.query;
      
      let sql = 'SELECT * FROM variants WHERE 1=1';
      const params = [];

      if (product_id) {
        sql += ' AND product_id = ?';
        params.push(product_id);
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

    // Get single variant
    getVariant: (req, res) => {
      const { id } = req.params;
      const sql = 'SELECT * FROM variants WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(id);
        
        if (!row) {
          return res.status(404).json({ error: 'Variant not found' });
        }
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get variants for a specific product
    getProductVariants: (req, res) => {
      const { product_id } = req.params;
      const sql = 'SELECT * FROM variants WHERE product_id = ? ORDER BY created_at DESC';

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(product_id);
        res.json(rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Update variant
    updateVariant: (req, res) => {
      const { id } = req.params;
      const { sku, variant_name, variant_type, variant_value, price, cost, quantity, reorder_level, description, image_url } = req.body;

      const updates = [];
      const values = [];

      if (sku !== undefined) {
        updates.push('sku = ?');
        values.push(sku);
      }
      if (variant_name !== undefined) {
        updates.push('variant_name = ?');
        values.push(variant_name);
      }
      if (variant_type !== undefined) {
        updates.push('variant_type = ?');
        values.push(variant_type);
      }
      if (variant_value !== undefined) {
        updates.push('variant_value = ?');
        values.push(variant_value);
      }
      if (price !== undefined) {
        updates.push('price = ?');
        values.push(price);
      }
      if (cost !== undefined) {
        updates.push('cost = ?');
        values.push(cost);
      }
      if (quantity !== undefined) {
        updates.push('quantity = ?');
        values.push(quantity);
      }
      if (reorder_level !== undefined) {
        updates.push('reorder_level = ?');
        values.push(reorder_level);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
      }
      if (image_url !== undefined) {
        updates.push('image_url = ?');
        values.push(image_url);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      values.push(id);

      const sql = `UPDATE variants SET ${updates.join(', ')} WHERE id = ?`;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Variant not found' });
        }
        
        const getStmt = db.prepare('SELECT * FROM variants WHERE id = ?');
        const variant = getStmt.get(id);
        res.json(variant);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Delete variant
    deleteVariant: (req, res) => {
      const { id } = req.params;
      const sql = 'DELETE FROM variants WHERE id = ?';

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Variant not found' });
        }
        
        res.json({ message: 'Variant deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get low stock variants (for alerts)
    getLowStockVariants: (req, res) => {
      const { product_id } = req.query;
      
      let sql = 'SELECT * FROM variants WHERE quantity <= reorder_level';
      const params = [];

      if (product_id) {
        sql += ' AND product_id = ?';
        params.push(product_id);
      }

      sql += ' ORDER BY quantity ASC';

      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        res.json({
          low_stock_variants: rows,
          count: rows.length
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};
