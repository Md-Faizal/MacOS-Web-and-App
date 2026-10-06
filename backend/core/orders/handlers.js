const createActivityLogger = require('../audit/activity-logger');
const dataBus = require('../sync/data-bus');
const { decryptInvoiceLedgerReference } = require('../billing/invoice-ledger-ref');

module.exports = function(db) {
  const activityLogger = createActivityLogger(db);

  // Helper to fetch full order with items and details
  const getFullOrderById = (id) => {
    const orderStmt = db.prepare(`
      SELECT o.*,
             COALESCE(u_creator.role, 'owner') as created_by_role,
             COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
             u_editor.role as last_edited_by_role,
             COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
      FROM orders o
      LEFT JOIN users u_creator ON o.created_by_user_id = u_creator.id
      LEFT JOIN users u_editor ON o.last_edited_by_user_id = u_editor.id
      WHERE o.id = ?
    `);
    const order = orderStmt.get(id);
    
    if (!order) return null;

    const itemsStmt = db.prepare(`
      SELECT oi.*, p.name as product_name, v.pack_size_value, v.pack_size_type, b.batch_no, b.mrp, b.exp_date
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN variants v ON oi.variant_id = v.id
      LEFT JOIN batches b ON oi.batch_id = b.id
      WHERE oi.order_id = ?
    `);
    const items = itemsStmt.all(id);

    return {
      ...order,
      checklist_items: typeof order.checklist_items === 'string' ? JSON.parse(order.checklist_items || '{}') : order.checklist_items,
      items: items
    };
  };

  function getWorkerContactScope(req, tableAlias = 'c') {
    if (req.user && req.user.role === 'worker') {
      const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
      return `(${tableAlias}.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR ${tableAlias}.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR ${tableAlias}.created_by_user_id = '${safeUserId}')`;
    }
    return null;
  }

  function isCustomerAccessible(req, customerId) {
    if (!req.user || req.user.role !== 'worker') return true;
    const workerScope = getWorkerContactScope(req, 'contacts');
    const row = db.prepare(`SELECT id FROM contacts WHERE id = ? AND ${workerScope}`).get(customerId);
    return Boolean(row);
  }

  return {
    resolveInvoiceQr: (req, res) => {
      const { reference, ledgerToken, customerId } = req.body || {};
      if (
        typeof reference !== 'string' || reference.length > 160 ||
        typeof ledgerToken !== 'string' || ledgerToken.length > 160 ||
        !customerId
      ) {
        return res.status(400).json({ error: 'A ledger QR reference and customer are required.' });
      }

      let decoded;
      try {
        decoded = decryptInvoiceLedgerReference(reference);
      } catch (error) {
        return res.status(400).json({ error: 'This invoice QR reference is invalid or expired.' });
      }

      if (String(decoded.customerId) !== String(customerId)) {
        return res.status(404).json({ error: 'This invoice QR belongs to a different customer.' });
      }

      try {
        const invoice = db.prepare(`
          SELECT i.id, i.customer_id, i.invoice_no,
                 COALESCE(i.invoice_date, i.created_at) AS invoice_date,
                 COALESCE(i.grand_total, i.total_amount, 0) AS grand_total
          FROM invoices i
          JOIN contacts c ON c.id = i.customer_id
          WHERE i.id = ? AND i.customer_id = ? AND c.ledger_token = ?
        `).get(decoded.invoiceId, decoded.customerId, ledgerToken);

        if (!invoice) {
          return res.status(404).json({ error: 'The invoice QR does not match this customer ledger.' });
        }
        if (!isCustomerAccessible(req, invoice.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this invoice.' });
        }

        return res.json({
          success: true,
          invoice: {
            id: invoice.id,
            invoice_no: invoice.invoice_no,
            invoice_date: invoice.invoice_date,
            grand_total: Number(invoice.grand_total || 0)
          }
        });
      } catch (error) {
        console.error('[Orders] Unable to resolve invoice QR:', error);
        return res.status(500).json({ error: 'Unable to resolve this invoice QR.' });
      }
    },

    createOrder: async (req, res) => {
      const {
        customer_id,
        order_number,
        current_stage = 'stage1',
        order_date,
        order_notes = '',
        qc_date = null,
        qc_notes = '',
        checklist_items = '{}',
        delivery_date = null,
        bill_reference = '',
        total_amount,
        status = 'pending',
        items = []
      } = req.body;
      
      if (!customer_id) {
        return res.status(400).json({ error: 'customer_id is required' });
      }
      if (!isCustomerAccessible(req, customer_id)) {
        return res.status(403).json({ error: 'Access denied to this customer' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must have at least one item.' });
      }

      try {
        const creatorId = req.user ? (req.user.id || req.user.userId) : null;
        // Use order_number from frontend if provided, otherwise generate a standardized global one
        const finalOrderNumber = order_number || generateOrderNumber(db, new Date(order_date || Date.now()));
        // Calculate total_amount if not provided
        let total = 0;
        items.forEach(item => {
          const qty = item.qty || item.quantity || 1;
          const price = item.price || item.unit_price || 0;
          total += qty * price;
        });
        const orderTotal = total_amount !== undefined ? total_amount : total;

        // Check for existing order_number to provide idempotence (GLOBAL search)
        const checkStmt = db.prepare('SELECT id, customer_id FROM orders WHERE order_number = ?');
        const existingOrder = checkStmt.get(finalOrderNumber);
        
        if (existingOrder) {
          if (existingOrder.customer_id !== customer_id) {
            return res.status(409).json({ error: `Order number ${finalOrderNumber} is already used by another customer.` });
          }
          // If it's the same customer, skip creation and just return the existing record (simulating successful POST)
          const order = getFullOrderById(existingOrder.id);
          return res.json({
            ...order,
            _retried: true
          });
        }

        // Insert order with created_at and updated_at
        const now = new Date().toISOString();
        const insertOrderSQL = `
          INSERT INTO orders (
            order_number, customer_id, current_stage, order_date,
            order_notes, qc_date, qc_notes, checklist_items, delivery_date,
            bill_reference, total_amount, status, created_by_user_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const stmtOrder = db.prepare(insertOrderSQL);
        const orderResult = stmtOrder.run(
          finalOrderNumber,
          customer_id,
          current_stage,
          order_date || now,
          order_notes || '',
          qc_date || null,
          qc_notes || '',
          typeof checklist_items === 'string' ? checklist_items : JSON.stringify(checklist_items),
          delivery_date || null,
          bill_reference || '',
          orderTotal,
          status,
          creatorId,
          now,
          now
        );
        const orderId = orderResult.lastInsertRowid;

        // Insert order items
        const insertItemSQL = `
          INSERT INTO order_items (order_id, product_id, variant_id, batch_id, quantity, received_quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const stmtItem = db.prepare(insertItemSQL);
        const enrichedItems = [];
        items.forEach(item => {
          const variantId = item.variant_id ? parseInt(item.variant_id) : null;
          const batchId = item.batch_id ? parseInt(item.batch_id) : null;
          const productId = item.product_id ? parseInt(item.product_id) : null;
          const qty = item.qty || item.quantity || 1;
          const price = item.price || item.unit_price || 0;
          const receivedQty = item.received_quantity || 0;
          const lineTotal = qty * price;
          stmtItem.run(
            orderId,
            productId,
            variantId,
            batchId,
            qty,
            receivedQty,
            price,
            lineTotal
          );
          enrichedItems.push({
            product_id: productId,
            variant_id: variantId,
            batch_id: batchId,
            qty,
            price,
            received_quantity: receivedQty,
            line_total: lineTotal
          });
        });

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'orders',
          action: 'create',
          resourceType: 'order',
          resourceId: orderId,
          resourceName: finalOrderNumber,
          metadata: { total_amount: orderTotal, customer_id, items_count: items.length }
        });

        const fullOrder = getFullOrderById(orderId);
        res.status(201).json(fullOrder);
      } catch (err) {
        console.error('❌ CREATE ORDER ERROR:', err.message, err.stack);
        res.status(500).json({ error: err.message });
      }
    },

    getOrders: (req, res) => {
      const { customer_id, current_stage, limit = 100, offset = 0 } = req.query;
      
      let sql = `
        SELECT o.*,
               COALESCE(u_creator.role, 'owner') as created_by_role,
               COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
               u_editor.role as last_edited_by_role,
               COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name
        FROM orders o
        LEFT JOIN users u_creator ON o.created_by_user_id = u_creator.id
        LEFT JOIN users u_editor ON o.last_edited_by_user_id = u_editor.id
        WHERE 1=1
      `;
      const params = [];

      if (customer_id) {
        sql += ' AND o.customer_id = ?';
        params.push(customer_id);
      }

      if (current_stage) {
        sql += ' AND o.current_stage = ?';
        params.push(current_stage);
      }

      if (req.user && req.user.role === 'worker') {
        const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
        sql += ` AND (o.customer_id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR o.customer_id IN (SELECT id FROM contacts WHERE created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR created_by_user_id = '${safeUserId}'))`;
      }

      sql += ' ORDER BY o.order_date DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit) || 100, parseInt(offset) || 0);

      try {
        console.log('📋 GET /api/orders - Query:', { sql, params: params.slice(0, -2) });
        
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        
        console.log('📋 GET /api/orders - Results:', { totalRows: rows.length, rows });
        
        // Parse JSON fields and fetch items with variant/batch details
        const orders = rows.map(row => {
          const itemsStmt = db.prepare(`
            SELECT oi.*, p.name as product_name, v.pack_size_value, v.pack_size_type, b.batch_no, b.mrp, b.exp_date
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN variants v ON oi.variant_id = v.id
            LEFT JOIN batches b ON oi.batch_id = b.id
            WHERE oi.order_id = ?
          `);
          const items = itemsStmt.all(row.id);
          
          return {
            ...row,
            checklist_items: typeof row.checklist_items === 'string' ? JSON.parse(row.checklist_items || '{}') : row.checklist_items,
            items: items
          };
        });
        
        res.json({ data: orders });
      } catch (err) {
        console.error('❌ GET /api/orders - Error:', err);
        res.status(500).json({ error: err.message });
      }
    },

    getOrder: (req, res) => {
      const { id } = req.params;

      try {
        const order = getFullOrderById(id);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (order.customer_id && !isCustomerAccessible(req, order.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this order' });
        }
        res.json(order);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateOrder: (req, res) => {
      const { id } = req.params;
      const {
        order_number,
        current_stage,
        order_date,
        order_notes,
        qc_date,
        qc_notes,
        checklist_items,
        delivery_date,
        bill_reference,
        total_amount,
        status,
        items
      } = req.body;

      const existing = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (existing.customer_id && !isCustomerAccessible(req, existing.customer_id)) {
        return res.status(403).json({ error: 'Access denied to this order' });
      }

      const updates = [];
      const values = [];
      if (order_number !== undefined) {
        updates.push('order_number = ?');
        values.push(order_number);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }
      if (current_stage !== undefined) {
        updates.push('current_stage = ?');
        values.push(current_stage);
      }
      if (order_date !== undefined) {
        updates.push('order_date = ?');
        values.push(order_date);
      }
      if (order_notes !== undefined) {
        updates.push('order_notes = ?');
        values.push(order_notes);
      }
      if (qc_date !== undefined) {
        updates.push('qc_date = ?');
        values.push(qc_date);
      }
      if (qc_notes !== undefined) {
        updates.push('qc_notes = ?');
        values.push(qc_notes);
      }
      if (checklist_items !== undefined) {
        updates.push('checklist_items = ?');
        values.push(typeof checklist_items === 'string' ? checklist_items : JSON.stringify(checklist_items));
      }
      if (delivery_date !== undefined) {
        updates.push('delivery_date = ?');
        values.push(delivery_date);
      }
      if (bill_reference !== undefined) {
        updates.push('bill_reference = ?');
        values.push(bill_reference);
      }
      if (total_amount !== undefined) {
        updates.push('total_amount = ?');
        values.push(total_amount);
      }

      const editorId = req.user ? (req.user.id || req.user.userId) : null;
      if (editorId) {
        updates.push('last_edited_by_user_id = ?');
        values.push(editorId);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const now = new Date().toISOString();
      updates.push('updated_at = ?');
      values.push(now);
      values.push(id);

      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...values);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Order not found' });
        }

        // Update items if provided
        if (Array.isArray(items) && items.length > 0) {
          // Delete existing items
          const deleteStmt = db.prepare('DELETE FROM order_items WHERE order_id = ?');
          deleteStmt.run(id);

          // Insert new items
          const insertItemSQL = `
            INSERT INTO order_items (order_id, product_id, variant_id, batch_id, quantity, unit_price, received_quantity, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const stmtItem = db.prepare(insertItemSQL);

          items.forEach(item => {
            stmtItem.run(
              id,
              item.product_id || null,
              item.variant_id || null,
              item.batch_id || null,
              item.qty || item.quantity || 1,
              item.price || item.unit_price || 0,
              item.received_quantity !== undefined ? item.received_quantity : (item.received_qty !== undefined ? item.received_qty : 0),
              (item.qty || item.quantity || 1) * (item.price || item.unit_price || 0)
            );
          });
        }
        
        const fullOrder = getFullOrderById(id);

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'orders',
          action: current_stage !== undefined ? 'stage_change' : 'update',
          resourceType: 'order',
          resourceId: id,
          resourceName: fullOrder?.order_number || null,
          metadata: { current_stage: fullOrder?.current_stage, status: fullOrder?.status, total_amount: fullOrder?.total_amount }
        });

        res.json(fullOrder);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteOrder: (req, res) => {
      const { id } = req.params;

      try {
        const existing = db.prepare('SELECT customer_id, order_number FROM orders WHERE id = ?').get(id);
        if (!existing) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (existing.customer_id && !isCustomerAccessible(req, existing.customer_id)) {
          return res.status(403).json({ error: 'Access denied to this order' });
        }

        const deleteItemsStmt = db.prepare('DELETE FROM order_items WHERE order_id = ?');
        deleteItemsStmt.run(id);

        const deleteOrderStmt = db.prepare('DELETE FROM orders WHERE id = ?');
        const result = deleteOrderStmt.run(id);
        
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Order not found' });
        }
        
        // Audit Log
        activityLogger.logActivity(req, {
          module: 'orders',
          action: 'delete',
          resourceType: 'order',
          resourceId: id,
          resourceName: existing.order_number || null,
          metadata: { customer_id: existing.customer_id }
        });

        res.json({ message: 'Order deleted successfully', id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getOrderSummary: (req, res) => {
      const { start_date, end_date, customer_id, current_stage } = req.query;
      
      let sql = `
        SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as average_order_value,
          current_stage,
          COUNT(CASE WHEN current_stage = 'stage3' THEN 1 END) as completed_orders
        FROM orders
        WHERE 1=1
      `;
      const params = [];

      if (start_date) {
        sql += ' AND order_date >= ?';
        params.push(start_date);
      }

      if (end_date) {
        sql += ' AND order_date <= ?';
        params.push(end_date);
      }

      if (customer_id) {
        sql += ' AND customer_id = ?';
        params.push(customer_id);
      }

      if (current_stage) {
        sql += ' AND current_stage = ?';
        params.push(current_stage);
      }

      sql += ' GROUP BY current_stage';

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
    },

    getNextOrderNumber: (req, res) => {
      try {
        const { order_date = new Date().toISOString() } = req.query;
        const nextRef = generateOrderNumber(db, new Date(order_date));
        
        res.json({
          success: true,
          order_number: nextRef,
          reference_number: nextRef
        });
      } catch (error) {
        console.error('Error getting next order number:', error);
        res.status(500).json({ error: error.message });
      }
    }
  };
};

/**
 * Global Order Number Generator
 * Format: ORD-YY#### where YY = calendar year, #### = 4-digit global serial per calendar year
 */
function generateOrderNumber(db, orderDate = new Date()) {
  try {
    const year = orderDate.getFullYear();
    const yrShort = String(year).slice(-2);
    const yrStart = new Date(year, 0, 1).toISOString().split('T')[0];
    const yrEnd = new Date(year, 11, 31, 23, 59, 59, 999).toISOString().split('T')[0];
    
    // Global count for ALL orders in this calendar year
    const countResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE date(order_date) >= date(?)
        AND date(order_date) <= date(?)
    `).get(yrStart, yrEnd);
    
    const sequence = (countResult?.count || 0) + 1;
    const sequenceStr = String(sequence).padStart(4, '0');
    
    return `ORD-${yrShort}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating order number:', err);
    return `ORD-${Date.now().toString().slice(-8)}`;
  }
}
