module.exports = function(db) {
  // Helper to safely check if query tables exist
  function getTableList() {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      return tables.map(t => t.name);
    } catch {
      return [];
    }
  }

  return {
    getCustomerSuggestions: (req, res) => {
      const { customer_name, limit = 10 } = req.query;
      
      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name parameter is required' });
      }

      try {
        const tables = getTableList();
        if (!tables.includes('billing_transactions') || !tables.includes('contacts') || !tables.includes('products')) {
          return res.json({ customer_name, suggestions: [], count: 0, note: 'Data tables not yet populated' });
        }
        
        const sql = `
          SELECT 
            bt.product_id,
            p.name as product_name,
            p.description,
            p.seller_price,
            COUNT(*) as purchase_frequency,
            SUM(bt.quantity) as total_quantity,
            MAX(bt.created_at) as last_purchased,
            ROUND(AVG(bt.unit_price), 2) as average_price
          FROM billing_transactions bt
          JOIN contacts c ON bt.customer_id = c.id
          JOIN products p ON bt.product_id = p.id
          WHERE LOWER(c.name) LIKE LOWER(?)
          GROUP BY bt.product_id
          ORDER BY purchase_frequency DESC, last_purchased DESC
          LIMIT ?
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all('%' + customer_name + '%', limit);
        
        res.json({
          customer_name,
          suggestions: rows,
          count: rows.length,
          note: 'Based on customer purchase history'
        });
      } catch (err) {
        res.json({ customer_name, suggestions: [], count: 0, note: 'Analysis unavailable' });
      }
    },

    getCustomerHistory: (req, res) => {
      const { customer_name } = req.params;
      
      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name parameter is required' });
      }

      try {
        const tables = getTableList();
        if (!tables.includes('billing_transactions') || !tables.includes('contacts') || !tables.includes('products')) {
          return res.json({ customer_name, history: [], total_transactions: 0 });
        }

        const sql = `
          SELECT 
            bt.id,
            bt.product_id,
            p.name as product_name,
            bt.quantity,
            bt.unit_price,
            bt.total,
            bt.created_at
          FROM billing_transactions bt
          JOIN contacts c ON bt.customer_id = c.id
          JOIN products p ON bt.product_id = p.id
          WHERE LOWER(c.name) LIKE LOWER(?)
          ORDER BY bt.created_at DESC
          LIMIT 50
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all('%' + customer_name + '%');
        
        res.json({
          customer_name,
          history: rows,
          total_transactions: rows.length
        });
      } catch (err) {
        res.json({ customer_name, history: [], total_transactions: 0 });
      }
    },

    getTopProductsByCustomer: (req, res) => {
      const { customer_name, limit = 5 } = req.query;
      
      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name parameter is required' });
      }

      try {
        const tables = getTableList();
        if (!tables.includes('billing_transactions') || !tables.includes('contacts') || !tables.includes('products')) {
          return res.json({ customer_name, top_products: [], count: 0 });
        }

        const sql = `
          SELECT 
            p.id,
            p.name,
            p.seller_price,
            SUM(bt.quantity) as total_sold,
            AVG(bt.unit_price) as average_price,
            MAX(bt.created_at) as last_purchased
          FROM billing_transactions bt
          JOIN contacts c ON bt.customer_id = c.id
          JOIN products p ON bt.product_id = p.id
          WHERE LOWER(c.name) LIKE LOWER(?)
          GROUP BY p.id
          ORDER BY total_sold DESC
          LIMIT ?
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all('%' + customer_name + '%', limit);
        
        res.json({
          customer_name,
          top_products: rows,
          count: rows.length
        });
      } catch (err) {
        res.json({ customer_name, top_products: [], count: 0 });
      }
    },

    getSeasonalSuggestions: (req, res) => {
      const { months_back = 6, limit = 10 } = req.query;

      try {
        const tables = getTableList();
        if (!tables.includes('billing_transactions') || !tables.includes('products')) {
          return res.json({ trend_period_months: parseInt(months_back), seasonal_products: [], count: 0 });
        }

        const sql = `
          SELECT 
            p.id,
            p.name as product_name,
            p.seller_price,
            COUNT(bt.id) as recent_purchases,
            SUM(bt.quantity) as total_quantity,
            COUNT(DISTINCT bt.customer_id) as unique_customers
          FROM billing_transactions bt
          JOIN products p ON bt.product_id = p.id
          WHERE bt.created_at >= datetime('now', '-' || ? || ' months')
          GROUP BY p.id
          ORDER BY recent_purchases DESC, unique_customers DESC
          LIMIT ?
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all(parseInt(months_back), limit);
        
        res.json({
          trend_period_months: parseInt(months_back),
          seasonal_products: rows,
          count: rows.length,
          note: 'Popular products in recent period'
        });
      } catch (err) {
        res.json({ trend_period_months: parseInt(months_back || 6), seasonal_products: [], count: 0 });
      }
    },

    getSmartBillingItems: (req, res) => {
      const { customer_name } = req.params;
      const { limit = 20 } = req.query;
      
      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name parameter is required' });
      }

      try {
        const tables = getTableList();
        if (!tables.includes('products') || !tables.includes('billing_transactions') || !tables.includes('contacts')) {
          return res.json({ customer_name, smart_items: [], total_items: 0 });
        }

        const sql = `
          SELECT 
            p.id as product_id,
            p.name as product_name,
            p.seller_price,
            p.quantity as available_quantity,
            COUNT(bt.id) as purchase_count,
            ROUND(AVG(bt.quantity), 0) as typical_quantity,
            CASE 
              WHEN COUNT(bt.id) > 5 THEN 'High Priority'
              WHEN COUNT(bt.id) > 2 THEN 'Medium Priority'
              ELSE 'Regular'
            END as priority
          FROM products p
          LEFT JOIN billing_transactions bt ON p.id = bt.product_id
            AND bt.customer_id = (SELECT id FROM contacts WHERE LOWER(name) LIKE LOWER(?))
          WHERE p.quantity > 0
          GROUP BY p.id
          ORDER BY priority DESC, purchase_count DESC
          LIMIT ?
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all('%' + customer_name + '%', limit);
        
        res.json({
          customer_name,
          smart_items: rows,
          total_items: rows.length,
          note: 'Prioritized by customer purchase patterns'
        });
      } catch (err) {
        res.json({ customer_name, smart_items: [], total_items: 0 });
      }
    },

    getCustomerSegmentAnalysis: (req, res) => {
      try {
        const tables = getTableList();
        if (!tables.includes('contacts') || !tables.includes('billing_transactions')) {
          return res.json({ customer_segments: [], total_customers: 0, note: 'Data not yet available' });
        }

        const sql = `
          SELECT 
            c.id,
            c.name as customer_name,
            COUNT(bt.id) as total_transactions,
            SUM(bt.total) as total_spending,
            ROUND(AVG(bt.total), 2) as average_transaction_value,
            CASE 
              WHEN SUM(bt.total) > 100000 THEN 'Premium'
              WHEN SUM(bt.total) > 50000 THEN 'VIP'
              WHEN SUM(bt.total) > 10000 THEN 'Regular'
              ELSE 'New/Light'
            END as customer_segment,
            MAX(bt.created_at) as last_transaction
          FROM contacts c
          LEFT JOIN billing_transactions bt ON c.id = bt.customer_id
          WHERE c.type = 'Customer'
          GROUP BY c.id
          ORDER BY total_spending DESC
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all();
        
        res.json({
          customer_segments: rows,
          total_customers: rows.length,
          note: 'Customers segmented by total spending'
        });
      } catch (err) {
        res.json({ customer_segments: [], total_customers: 0, note: 'Analysis unavailable' });
      }
    }
  };
};
