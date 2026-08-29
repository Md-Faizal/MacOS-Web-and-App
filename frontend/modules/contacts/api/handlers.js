module.exports = function(db) {
  return {
    getContacts: (req, res) => {
      try {
        let whereClause = '';
        if (req.user && req.user.role === 'worker') {
          const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
          whereClause = ` WHERE c.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') `;
        }

        const stmt = db.prepare(`
          SELECT 
            c.*, 
            COALESCE(SUM(i.grand_total), 0) as real_total_sales,
            COALESCE(AVG(i.grand_total), 0) as real_avg_sales,
            (
              SELECT p.name 
              FROM invoice_items ii 
              JOIN products p ON ii.product_id = p.id 
              JOIN invoices inv ON ii.invoice_id = inv.id
              WHERE inv.customer_id = c.id
              GROUP BY ii.product_id 
              ORDER BY COUNT(*) DESC 
              LIMIT 1
            ) as favorite_product,
            (
              COALESCE(c.opening_balance, 0) +
              COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0) -
              COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT'), 0) -
              COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = c.id AND type = 'CREDIT_NOTE'), 0)
            ) as current_due,
            (SELECT MAX(COALESCE(invoice_date, created_at)) FROM invoices WHERE customer_id = c.id) as last_bill_date,
            (SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT') as last_payment_date
          FROM contacts c
          LEFT JOIN invoices i ON c.id = i.customer_id
          ${whereClause}
          GROUP BY c.id
          ORDER BY c.name ASC
        `);
        const contacts = stmt.all();
        res.json(contacts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    createContact: (req, res) => {
      try {
        const { name, email, phone, address, gstin, licence_no, pan, total_sales, avg_sales, favorite_product_id, opening_balance, notes, transport_preference, disable_duplex_export } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });

        const isWorker = req.user && req.user.role === 'worker';
        // For workers: default to exclude_from_stats = 1 (excluded from Admin's master books by default)
        const excludeFlag = isWorker ? 1 : (req.body.exclude_from_stats !== undefined ? Number(req.body.exclude_from_stats) : 0);

        const stmt = db.prepare(`
          INSERT INTO contacts (
            name, email, phone, address, gstin, licence_no, pan,
            total_sales, avg_sales, favorite_product_id, opening_balance, exclude_from_stats, notes, transport_preference, disable_duplex_export
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          name, email || null, phone || null, address || null,
          gstin || null, licence_no || null, pan || null,
          total_sales || 0, avg_sales || 0, favorite_product_id || null,
          opening_balance || 0, excludeFlag, notes || null, transport_preference || null, disable_duplex_export || 0
        );

        // If created by a worker, automatically associate with that worker in user_contact_access
        if (isWorker) {
          try {
            const workerId = req.user.id || req.user.userId;
            db.prepare('INSERT OR IGNORE INTO user_contact_access (user_id, contact_id) VALUES (?, ?)').run(workerId, info.lastInsertRowid);
          } catch (accessErr) {
            console.warn('Failed to associate contact with worker:', accessErr.message);
          }
        }

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getContact: (req, res) => {
      try {
        const { id } = req.params;
        const stmt = db.prepare(`
          SELECT 
            c.*, 
            COALESCE(SUM(i.grand_total), 0) as real_total_sales,
            COALESCE(AVG(i.grand_total), 0) as real_avg_sales,
            (
              SELECT p.name 
              FROM invoice_items ii 
              JOIN products p ON ii.product_id = p.id 
              JOIN invoices inv ON ii.invoice_id = inv.id
              WHERE inv.customer_id = c.id
              GROUP BY ii.product_id 
              ORDER BY COUNT(*) DESC 
              LIMIT 1
            ) as favorite_product
          FROM contacts c
          LEFT JOIN invoices i ON c.id = i.customer_id
          WHERE c.id = ?
          GROUP BY c.id
        `);
        const contact = stmt.get(id);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateContact: (req, res) => {
      try {
        const { id } = req.params;
        const updates = [];
        const params = [];
        
        // List of all possible fields that can be updated
        const fields = [
          'name', 'email', 'phone', 'address', 'gstin', 'licence_no', 'pan',
          'total_sales', 'avg_sales', 'favorite_product_id', 'opening_balance',
          'exclude_from_stats', 'notes', 'transport_preference', 'type', 'active', 'last_activity', 'disable_duplex_export'
        ];

        // Build dynamic query
        fields.forEach(field => {
          if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(req.body[field]);
          }
        });

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields provided to update' });
        }

        // Add updated_at and ID
        updates.push("updated_at = datetime('now')");
        params.push(id);

        const sql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run(...params);

        res.json({ success: true, id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteContact: (req, res) => {
      try {
        const { id } = req.params;
        const contactStmt = db.prepare('SELECT name FROM contacts WHERE id = ?');
        const contact = contactStmt.get(id);
        
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }
        
        const contactName = contact.name;
        
        // Execute deletion in a transaction to clean up dependent records and avoid FK constraint errors
        const deleteTransaction = db.transaction(() => {
          try { db.prepare('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)').run(id); } catch (_) {}
          try { db.prepare('DELETE FROM invoices WHERE customer_id = ?').run(id); } catch (_) {}
          try { db.prepare('DELETE FROM payments WHERE customer_id = ?').run(id); } catch (_) {}
          try { db.prepare('DELETE FROM orders WHERE customer_id = ?').run(id); } catch (_) {}
          try { db.prepare('DELETE FROM customer_item_memory WHERE customer_id = ?').run(id); } catch (_) {}
          try { db.prepare('DELETE FROM ledger WHERE customer_id = ?').run(id); } catch (_) {}
          db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
        });

        deleteTransaction();
        
        console.log(`✓ Deleted contact "${contactName}" (ID: ${id})`);
        
        res.json({ 
          success: true, 
          deleted: {
            contact_id: id,
            contact_name: contactName
          }
        });
      } catch (error) {
        console.error('Delete contact error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    checkAndUpdateActivityStatus: (req, res) => {
      try {
        const { customerId } = req.params;
        
        // Calculate date from 30 days ago using SQLite datetime
        const oneMonthAgoStmt = db.prepare("SELECT datetime('now', '-30 days') as date");
        const { date: oneMonthAgoDate } = oneMonthAgoStmt.get();
        
        // Check for activity in past 1 month from correct tables
        const billsStmt = db.prepare(`
          SELECT COUNT(*) as count FROM invoices 
          WHERE customer_id = ? AND created_at >= ?
        `);
        const bills = billsStmt.get(customerId, oneMonthAgoDate);
        
        const paymentsStmt = db.prepare(`
          SELECT COUNT(*) as count FROM payments 
          WHERE customer_id = ? AND type = 'PAYMENT' AND created_at >= ?
        `);
        const payments = paymentsStmt.get(customerId, oneMonthAgoDate);
        
        const creditNotesStmt = db.prepare(`
          SELECT COUNT(*) as count FROM payments 
          WHERE customer_id = ? AND type = 'CREDIT_NOTE' AND created_at >= ?
        `);
        const creditNotes = creditNotesStmt.get(customerId, oneMonthAgoDate);
        
        const ordersStmt = db.prepare(`
          SELECT COUNT(*) as count FROM orders 
          WHERE customer_id = ? AND created_at >= ?
        `);
        const orders = ordersStmt.get(customerId, oneMonthAgoDate);
        
        // Find the most recent transaction date from any activity
        const mostRecentActivityStmt = db.prepare(`
          SELECT MAX(recent_date) as most_recent FROM (
            SELECT MAX(COALESCE(invoice_date, created_at)) as recent_date FROM invoices WHERE customer_id = ?
            UNION ALL
            SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = ? AND type IN ('PAYMENT', 'CREDIT_NOTE')
            UNION ALL
            SELECT MAX(created_at) FROM orders WHERE customer_id = ?
          )
        `);
        const { most_recent: mostRecentDate } = mostRecentActivityStmt.get(customerId, customerId, customerId);
        
        // Determine if customer is active (has any activity in past month)
        const totalActivity = (bills?.count || 0) + (payments?.count || 0) + (creditNotes?.count || 0) + (orders?.count || 0);
        const isActive = totalActivity > 0 ? 'ACTIVE' : 'INACTIVE';
        const lastActivityDate = mostRecentDate || null;
        
        // Update contact's activity status and last_activity
        const updateStmt = db.prepare(`
          UPDATE contacts SET 
            active = ?,
            last_activity = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `);
        updateStmt.run(isActive, lastActivityDate, customerId);
        
        console.log(`✓ Activity Status Updated: Customer ${customerId} - Status: ${isActive} (Bills: ${bills?.count || 0}, Payments: ${payments?.count || 0}, Credit Notes: ${creditNotes?.count || 0}, Orders: ${orders?.count || 0})`);
        
        res.json({
          success: true,
          customerId,
          status: isActive,
          activityCount: totalActivity,
          lastActivity: lastActivityDate,
          details: {
            bills: bills?.count || 0,
            payments: payments?.count || 0,
            creditNotes: creditNotes?.count || 0,
            orders: orders?.count || 0
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateAllActivityStatuses: (req, res) => {
      try {
        // Get all customers that are type 'Customer'
        const contactsStmt = db.prepare("SELECT id, name FROM contacts WHERE type IS NULL OR LOWER(type) = 'customer'");
        const customers = contactsStmt.all();
        
        // Calculate date from 30 days ago using SQLite datetime
        const oneMonthAgoStmt = db.prepare("SELECT datetime('now', '-30 days') as date");
        const { date: oneMonthAgoDate } = oneMonthAgoStmt.get();
        
        let updated = 0;
        const updatedStatuses = {};
        
        customers.forEach(customer => {
          // Check invoices (bills)
          const billsStmt = db.prepare(`
            SELECT COUNT(*) as count FROM invoices 
            WHERE customer_id = ? AND created_at >= ?
          `);
          const bills = billsStmt.get(customer.id, oneMonthAgoDate);
          
          // Check payments
          const paymentsStmt = db.prepare(`
            SELECT COUNT(*) as count FROM payments 
            WHERE customer_id = ? AND type = 'PAYMENT' AND created_at >= ?
          `);
          const payments = paymentsStmt.get(customer.id, oneMonthAgoDate);
          
          // Check credit notes
          const creditNotesStmt = db.prepare(`
            SELECT COUNT(*) as count FROM payments 
            WHERE customer_id = ? AND type = 'CREDIT_NOTE' AND created_at >= ?
          `);
          const creditNotes = creditNotesStmt.get(customer.id, oneMonthAgoDate);
          
          // Check orders
          const ordersStmt = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE customer_id = ? AND created_at >= ?
          `);
          const orders = ordersStmt.get(customer.id, oneMonthAgoDate);
          
          const totalActivity = (bills?.count || 0) + (payments?.count || 0) + (creditNotes?.count || 0) + (orders?.count || 0);
          const isActive = totalActivity > 0 ? 'ACTIVE' : 'INACTIVE';
          
          // Find the most recent transaction date for this customer
          const mostRecentActivityStmt = db.prepare(`
            SELECT MAX(recent_date) as most_recent FROM (
              SELECT MAX(COALESCE(invoice_date, created_at)) as recent_date FROM invoices WHERE customer_id = ?
              UNION ALL
              SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = ? AND type IN ('PAYMENT', 'CREDIT_NOTE')
              UNION ALL
              SELECT MAX(created_at) FROM orders WHERE customer_id = ?
            )
          `);
          const { most_recent: mostRecentDate } = mostRecentActivityStmt.get(customer.id, customer.id, customer.id);
          const lastActivityDate = mostRecentDate || null;
          
          // Update contact's activity status and last_activity
          const updateStmt = db.prepare(`
            UPDATE contacts SET 
              active = ?,
              last_activity = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `);
          updateStmt.run(isActive, lastActivityDate, customer.id);
          
          updatedStatuses[customer.name] = {
            status: isActive,
            activityCount: totalActivity,
            lastActivity: lastActivityDate,
            details: { bills: bills?.count || 0, payments: payments?.count || 0, creditNotes: creditNotes?.count || 0, orders: orders?.count || 0 }
          };
          updated++;
        });
        
        console.log(`✓ Activity Statuses Updated: ${updated}/${customers.length} customers processed`);
        
        res.json({
          success: true,
          updated,
          totalCustomers: customers.length,
          statuses: updatedStatuses
        });
      } catch (error) {
        console.error('Error updating activity statuses:', error);
        res.status(500).json({ error: error.message });
      }
    }
  };
};
