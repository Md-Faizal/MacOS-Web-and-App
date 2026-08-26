module.exports = function(db) {
  // Ensure orders table exists
  const ordersTableSQL = `
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      total_amount REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      shipping_address TEXT,
      delivery_date DATETIME,
      notes TEXT,
      sent_to_factory_date DATETIME,
      actual_received_date DATETIME,
      actual_received_qty INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Add columns to existing table if they don't exist
  const addColumnsSQL = `
    PRAGMA table_info(orders);
  `;

  const orderItemsTableSQL = `
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      line_total REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `;

  db.exec(ordersTableSQL);
  db.exec(orderItemsTableSQL);

  return {
    // Create a new order (simplified - single product per order)
    createOrder: (req, res) => {
      const { 
        customer_id, 
        order_date = new Date().toISOString(),
        product_id, 
        product_name,
        quantity, 
        unit_price,
        status = 'pending',
        total_amount = quantity * unit_price
      } = req.body;
      
      if (!customer_id || !product_id || !quantity || unit_price === undefined) {
        return res.status(400).json({ error: 'Missing required fields: customer_id, product_id, quantity, unit_price' });
      }

      try {
        const orderNumber = 'ORD-' + Date.now();
        const insertOrderSQL = `
          INSERT INTO orders (
            order_number, customer_id, order_date, product_id, product_name, 
            quantity, unit_price, status, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const stmt = db.prepare(insertOrderSQL);
        const result = stmt.run(
          orderNumber,
          customer_id,
          order_date,
          product_id,
          product_name,
          quantity,
          unit_price,
          status,
          total_amount
        );

        res.status(201).json({
          id: result.lastInsertRowid,
          order_number: orderNumber,
          customer_id,
          order_date,
          product_id,
          product_name,
          quantity,
          unit_price,
          status,
          total_amount,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
          items,
          created_at: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get all orders
    getOrders: (req, res) => {
      const { customer_id, status, limit = 100, offset = 0 } = req.query;
      
      let sql = 'SELECT * FROM orders WHERE 1=1';
      const params = [];

      if (customer_id) {
        sql += ' AND customer_id = ?';
        params.push(customer_id);
      }

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
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

    // Get single order
    getOrder: (req, res) => {
      const { id } = req.params;

      try {
        const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
        const order = orderStmt.get(id);
        
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Update order (supports new tracking fields)
    updateOrder: (req, res) => {
      const { id } = req.params;
      const { 
        status, 
        total_amount, 
        quantity,
        unit_price,
        discount, 
        tax, 
        delivery_date, 
        notes,
        sent_to_factory_date,
        actual_received_date,
        actual_received_qty
      } = req.body;

      const updates = [];
      const values = [];

      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (total_amount !== undefined) {
        updates.push('total_amount = ?');
        values.push(total_amount);
      }
      if (quantity !== undefined) {
        updates.push('quantity = ?');
        values.push(quantity);
      }
      if (unit_price !== undefined) {
        updates.push('unit_price = ?');
        values.push(unit_price);
      }
      if (discount !== undefined) {
        updates.push('discount = ?');
        values.push(discount);
      }
      if (tax !== undefined) {
        updates.push('tax = ?');
        values.push(tax);
      }
      if (delivery_date !== undefined) {
        updates.push('delivery_date = ?');
        values.push(delivery_date);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes);
      }
      if (sent_to_factory_date !== undefined) {
        updates.push('sent_to_factory_date = ?');
        values.push(sent_to_factory_date);
      }
      if (actual_received_date !== undefined) {
        updates.push('actual_received_date = ?');
        values.push(actual_received_date);
      }
      if (actual_received_qty !== undefined) {
        updates.push('actual_received_qty = ?');
        values.push(actual_received_qty);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields provided to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Order not found' });
        }
        
        const getStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
        const order = getStmt.get(id);
        res.json(order);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Delete order
    deleteOrder: (req, res) => {
      const { id } = req.params;

      try {
        const deleteOrderStmt = db.prepare('DELETE FROM orders WHERE id = ?');
        const result = deleteOrderStmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json({ message: 'Order deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get order summary
    getOrderSummary: (req, res) => {
      const { start_date, end_date, customer_id } = req.query;
      
      let sql = `
        SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as average_order_value,
          status,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders
        FROM orders
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
