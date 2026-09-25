const createActivityLogger = require('../../../core/audit/activity-logger');
const { buildContactsListResponse } = require('../../../shared/api/contacts-contract');
const { generateLedgerToken } = require('../../../core/billing/ledger-token');
const contactsDepartment = require('../service');

module.exports = function(db) {
  const activityLogger = createActivityLogger(db);

  function getWorkerContactScope(req, tableAlias = 'c') {
    if (req.user && req.user.role === 'worker') {
      const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
      return `(${tableAlias}.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR ${tableAlias}.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR ${tableAlias}.created_by_user_id = '${safeUserId}')`;
    }
    return null;
  }

  function isContactAccessible(req, contactId) {
    if (!req.user || req.user.role !== 'worker') return true;
    const workerScope = getWorkerContactScope(req, 'contacts');
    const row = db.prepare(`SELECT id FROM contacts WHERE id = ? AND ${workerScope}`).get(contactId);
    return Boolean(row);
  }

  return {
    getContacts: (req, res) => {
      try {
        const isWorker = req.user && req.user.role === 'worker';
        const safeUserId = isWorker ? String(req.user.id || req.user.userId).replace(/'/g, "''") : null;
        const workerScope = getWorkerContactScope(req, 'c');
        const whereClause = workerScope ? ` WHERE ${workerScope} ` : '';

        const selectFields = isWorker
          ? `c.*,
             COALESCE(uca.exclude_from_stats, 0) as exclude_from_stats,
             COALESCE(uca.disable_duplex_export, 0) as disable_duplex_export,`
          : `c.*,`;

        const joinUca = isWorker
          ? `LEFT JOIN user_contact_access uca ON uca.contact_id = c.id AND uca.user_id = '${safeUserId}'`
          : '';

        const stmt = db.prepare(`
          SELECT 
            ${selectFields}
            COALESCE(u_creator.role, 'owner') as created_by_role,
            COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
            u_editor.role as last_edited_by_role,
            COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
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
          ${joinUca}
          LEFT JOIN users u_creator ON c.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON c.last_edited_by_user_id = u_editor.id
          LEFT JOIN invoices i ON c.id = i.customer_id
          ${whereClause}
          GROUP BY c.id
          ORDER BY c.name ASC
        `);
        const contacts = stmt.all();
        const response = contactsDepartment.getContacts(contacts, { requestId: req.requestId });
        return res.json(response);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    },

    createContact: (req, res) => {
      try {
        const { name, email, phone, address, gstin, licence_no, pan, total_sales, avg_sales, favorite_product_id, opening_balance, notes, transport_preference, disable_duplex_export, exclude_from_stats } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });

        const isWorker = req.user && req.user.role === 'worker';
        const creatorId = req.user ? (req.user.id || req.user.userId) : null;

        // When created by Worker:
        // - Admin master view: exclude_from_stats = 1 (EXCLUDED by default for Admin), disable_duplex_export = 1 (Duplex OFF by default for Admin)
        // - Worker view (in user_contact_access): worker's choice (default exclude = 0, default duplex = 0 / ON)
        // When created by Admin:
        // - Admin master view: exclude_from_stats from body (default 0), disable_duplex_export from body (default 0 / ON)
        const adminExclude = isWorker ? 1 : (exclude_from_stats !== undefined ? Number(exclude_from_stats) : 0);
        const adminDuplex = isWorker ? 1 : (disable_duplex_export !== undefined ? Number(disable_duplex_export) : 0);

        const workerExclude = exclude_from_stats !== undefined ? Number(exclude_from_stats) : 0;
        const workerDuplex = disable_duplex_export !== undefined ? Number(disable_duplex_export) : 0;

        const ledgerToken = generateLedgerToken();
        const stmt = db.prepare(`
          INSERT INTO contacts (
            name, email, phone, address, gstin, licence_no, pan,
            total_sales, avg_sales, favorite_product_id, opening_balance, exclude_from_stats, notes, transport_preference, disable_duplex_export, created_by_user_id, ledger_token
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          name, email || null, phone || null, address || null,
          gstin || null, licence_no || null, pan || null,
          total_sales || 0, avg_sales || 0, favorite_product_id || null,
          opening_balance || 0, adminExclude, notes || null, transport_preference || null, adminDuplex, creatorId, ledgerToken
        );

        const newContactId = info.lastInsertRowid;

        // If created by a worker, automatically associate with that worker in user_contact_access with worker's preferences
        if (isWorker && creatorId) {
          try {
            db.prepare(`
              INSERT INTO user_contact_access (user_id, contact_id, exclude_from_stats, disable_duplex_export)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, contact_id) DO UPDATE SET
                exclude_from_stats = excluded.exclude_from_stats,
                disable_duplex_export = excluded.disable_duplex_export
            `).run(creatorId, newContactId, workerExclude, workerDuplex);
          } catch (accessErr) {
            console.warn('Failed to associate contact with worker:', accessErr.message);
          }
        }

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'contacts',
          action: 'create',
          resourceType: 'contact',
          resourceId: newContactId,
          resourceName: name,
          metadata: { phone, email, opening_balance, exclude_from_stats: isWorker ? workerExclude : adminExclude }
        });

        res.status(201).json({ success: true, id: newContactId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getContact: (req, res) => {
      try {
        const { id } = req.params;
        if (!isContactAccessible(req, id)) {
          return res.status(403).json({ error: 'Access denied to this contact' });
        }

        const isWorker = req.user && req.user.role === 'worker';
        const safeUserId = isWorker ? String(req.user.id || req.user.userId).replace(/'/g, "''") : null;

        const selectFields = isWorker
          ? `c.*,
             COALESCE(uca.exclude_from_stats, 0) as exclude_from_stats,
             COALESCE(uca.disable_duplex_export, 0) as disable_duplex_export,`
          : `c.*,`;

        const joinUca = isWorker
          ? `LEFT JOIN user_contact_access uca ON uca.contact_id = c.id AND uca.user_id = '${safeUserId}'`
          : '';

        const stmt = db.prepare(`
          SELECT 
            ${selectFields}
            COALESCE(u_creator.role, 'owner') as created_by_role,
            COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
            u_editor.role as last_edited_by_role,
            COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
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
          ${joinUca}
          LEFT JOIN users u_creator ON c.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON c.last_edited_by_user_id = u_editor.id
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
        if (!isContactAccessible(req, id)) {
          return res.status(403).json({ error: 'Access denied to update this contact' });
        }

        const isWorker = req.user && req.user.role === 'worker';
        const userId = req.user ? (req.user.id || req.user.userId) : null;

        if (isWorker && userId) {
          // If worker, update user_contact_access for exclude_from_stats and disable_duplex_export
          if (req.body.exclude_from_stats !== undefined || req.body.disable_duplex_export !== undefined) {
            const currentUca = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM user_contact_access WHERE user_id = ? AND contact_id = ?').get(userId, id);
            const nextExclude = req.body.exclude_from_stats !== undefined ? Number(req.body.exclude_from_stats) : (currentUca ? currentUca.exclude_from_stats : 0);
            const nextDuplex = req.body.disable_duplex_export !== undefined ? Number(req.body.disable_duplex_export) : (currentUca ? currentUca.disable_duplex_export : 0);

            db.prepare(`
              INSERT INTO user_contact_access (user_id, contact_id, exclude_from_stats, disable_duplex_export)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, contact_id) DO UPDATE SET
                exclude_from_stats = excluded.exclude_from_stats,
                disable_duplex_export = excluded.disable_duplex_export
            `).run(userId, id, nextExclude, nextDuplex);
          }
        }

        // Shared contact fields to update in contacts table
        const updates = [];
        const params = [];
        
        // If worker, exclude_from_stats and disable_duplex_export are NOT written to contacts table
        const fields = isWorker
          ? [
              'name', 'email', 'phone', 'address', 'gstin', 'licence_no', 'pan',
              'total_sales', 'avg_sales', 'favorite_product_id', 'opening_balance',
              'notes', 'transport_preference', 'type', 'active', 'last_activity'
            ]
          : [
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

        if (userId) {
          updates.push('last_edited_by_user_id = ?');
          params.push(userId);
        }

        if (updates.length > 0) {
          updates.push("updated_at = datetime('now')");
          params.push(id);

          const sql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;
          db.prepare(sql).run(...params);
        }

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'contacts',
          action: 'update',
          resourceType: 'contact',
          resourceId: id,
          resourceName: req.body.name || null,
          metadata: req.body
        });

        res.json({ success: true, id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getContactAccess: (req, res) => {
      try {
        const { id } = req.params;
        if (req.user && req.user.role === 'worker') {
          return res.status(403).json({ error: 'Only admin can view worker assignments' });
        }

        const workers = db.prepare(`
          SELECT 
            u.id, 
            u.username, 
            u.email, 
            u.full_name,
            (SELECT COUNT(1) FROM user_contact_access uca WHERE uca.user_id = u.id AND uca.contact_id = ?) as has_access
          FROM users u
          WHERE u.role = 'worker' AND (u.status = 'active' OR u.status IS NULL)
          ORDER BY u.full_name ASC, u.username ASC
        `).all(id);

        res.json({
          success: true,
          contactId: Number(id),
          workers: workers.map(w => ({
            id: w.id,
            username: w.username,
            email: w.email,
            fullName: w.full_name || w.username,
            hasAccess: Boolean(w.has_access)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateContactAccess: (req, res) => {
      try {
        const { id } = req.params;
        if (req.user && req.user.role === 'worker') {
          return res.status(403).json({ error: 'Only admin can manage worker assignments' });
        }

        const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];

        db.transaction(() => {
          // Get currently assigned workers
          const currentWorkers = db.prepare('SELECT user_id FROM user_contact_access WHERE contact_id = ?').all(id).map(r => r.user_id);
          
          // Remove workers not in userIds
          for (const currentUserId of currentWorkers) {
            if (!userIds.includes(currentUserId)) {
              db.prepare('DELETE FROM user_contact_access WHERE contact_id = ? AND user_id = ?').run(id, currentUserId);
            }
          }

          // Add newly assigned workers with defaults: exclude_from_stats = 0 (Included), disable_duplex_export = 0 (Duplex ON)
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO user_contact_access (user_id, contact_id, exclude_from_stats, disable_duplex_export)
            VALUES (?, ?, 0, 0)
          `);
          for (const userId of userIds) {
            insertStmt.run(userId, id);
          }

          activityLogger.logActivity(req, {
            module: 'contacts',
            action: 'share',
            resourceType: 'contact',
            resourceId: id,
            metadata: { assignedWorkerCount: userIds.length, userIds }
          });
        })();

        res.json({ success: true, message: 'Contact access updated successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteContact: (req, res) => {
      try {
        const { id } = req.params;
        if (!isContactAccessible(req, id)) {
          return res.status(403).json({ error: 'Access denied to delete this contact' });
        }

        const contactStmt = db.prepare('SELECT name FROM contacts WHERE id = ?');
        const contact = contactStmt.get(id);
        
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }
        
        const contactName = contact.name;
        
        // Execute deletion in a transaction to clean up dependent records and avoid FK constraint errors
        const deleteTransaction = db.transaction(() => {
          try { db.prepare('DELETE FROM user_contact_access WHERE contact_id = ?').run(id); } catch (_) {}
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
        
        // Audit Log
        activityLogger.logActivity(req, {
          module: 'contacts',
          action: 'delete',
          resourceType: 'contact',
          resourceId: id,
          resourceName: contactName
        });
        
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
        const workerScope = getWorkerContactScope(req, 'contacts');
        const whereClause = workerScope ? ` WHERE (type IS NULL OR LOWER(type) = 'customer') AND ${workerScope}` : " WHERE type IS NULL OR LOWER(type) = 'customer'";
        
        const contactsStmt = db.prepare(`SELECT id, name FROM contacts ${whereClause}`);
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
