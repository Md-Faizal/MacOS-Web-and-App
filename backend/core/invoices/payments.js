const createActivityLogger = require('../audit/activity-logger');
const dataBus = require('../sync/data-bus');

/**
 * Payment Handlers
 * Handles both payments and credit notes in a unified payments table
 */

module.exports = function(db) {
  const activityLogger = createActivityLogger(db);

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

  function syncCustomerLedgerAndPriorDues(customerId) {
    if (!customerId) return null;
    try {
      const customerData = db.prepare('SELECT id, opening_balance FROM contacts WHERE id = ?').get(customerId);
      if (!customerData) return null;
      const opening_balance = customerData.opening_balance || 0;

      // Calculate total invoiced (debit)
      const invoiceStats = db.prepare(`
        SELECT 
          COALESCE(SUM(grand_total), 0) as total_debit,
          COUNT(*) as total_bills
        FROM invoices 
        WHERE customer_id = ?
      `).get(customerId);

      // Calculate total payments (credit)
      const paymentStats = db.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as payment_credit,
          COALESCE(SUM(CASE WHEN type = 'CREDIT_NOTE' THEN credit_amount ELSE 0 END), 0) as credit_note_credit,
          COUNT(*) as total_payments
        FROM payments 
        WHERE customer_id = ?
      `).get(customerId);

      const total_debit = (invoiceStats && invoiceStats.total_debit) || 0;
      const total_bills = (invoiceStats && invoiceStats.total_bills) || 0;
      const total_credit = ((paymentStats && paymentStats.payment_credit) || 0) + ((paymentStats && paymentStats.credit_note_credit) || 0);
      const total_payments = (paymentStats && paymentStats.total_payments) || 0;
      const current_due = total_debit - total_credit;
      const current_status = current_due > 0 ? 'OUTSTANDING' : (current_due < 0 ? 'OVERPAID' : 'SETTLED');

      // Update or insert into ledger table
      const existingLedger = db.prepare('SELECT id FROM ledger WHERE customer_id = ?').get(customerId);
      if (existingLedger) {
        db.prepare(`
          UPDATE ledger 
          SET current_due = ?, total_debit = ?, total_credit = ?, current_status = ?, 
              total_bills = ?, total_payments = ?, updated_at = datetime('now')
          WHERE customer_id = ?
        `).run(current_due, total_debit, total_credit, current_status, total_bills, total_payments, customerId);
      } else {
        db.prepare(`
          INSERT INTO ledger (customer_id, current_due, total_debit, total_credit, current_status, total_bills, total_payments, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(customerId, current_due, total_debit, total_credit, current_status, total_bills, total_payments);
      }

      // Recalculate previous_due for all invoices of this customer chronologically
      const allInvoices = db.prepare(`
        SELECT id, invoice_no, grand_total, invoice_date, created_at FROM invoices
        WHERE customer_id = ?
        ORDER BY COALESCE(invoice_date, created_at) ASC, id ASC
      `).all(customerId);
      
      const allPayments = db.prepare(`
        SELECT id, reference_number, amount, payment_date, created_at FROM payments
        WHERE customer_id = ? AND type = 'PAYMENT'
      `).all(customerId);
      
      const allCredits = db.prepare(`
        SELECT id, reference_number, credit_amount, payment_date, created_at FROM payments
        WHERE customer_id = ? AND type = 'CREDIT_NOTE'
      `).all(customerId);

      allInvoices.forEach(invoice => {
        const priorInvoiceTotal = allInvoices
          .filter(inv => isStrictlyPrior(inv.invoice_date, inv.created_at, inv.id, invoice.invoice_date, invoice.created_at, invoice.id))
          .reduce((sum, inv) => sum + inv.grand_total, 0);
        
        const totalPriorPayments = allPayments
          .filter(p => isStrictlyPrior(p.payment_date, p.created_at, p.id, invoice.invoice_date, invoice.created_at, undefined))
          .reduce((sum, p) => sum + p.amount, 0);
        
        const totalPriorCredits = allCredits
          .filter(c => isStrictlyPrior(c.payment_date, c.created_at, c.id, invoice.invoice_date, invoice.created_at, undefined))
          .reduce((sum, c) => sum + c.credit_amount, 0);
        
        const calculatedPreviousDue = opening_balance + priorInvoiceTotal - (totalPriorPayments + totalPriorCredits);
        db.prepare('UPDATE invoices SET previous_due = ? WHERE id = ?').run(calculatedPreviousDue, invoice.id);
      });

      return {
        current_due,
        total_debit,
        total_credit,
        current_status,
        opening_balance,
        total_outstanding: current_due + opening_balance
      };
    } catch (err) {
      console.error(`Error syncing ledger for customer ${customerId}:`, err);
      return null;
    }
  }

  return {
    /**
     * GET NEXT PAYMENT REFERENCE (Preview - does not create record)
     */
    getNextPaymentReference: (req, res) => {
      try {
        const { customer_id, payment_date = new Date().toISOString() } = req.query;

        if (!customer_id) {
          return res.status(400).json({ error: 'customer_id is required' });
        }

        const dateObj = new Date(payment_date);
        const reference = generatePaymentReference(db, parseInt(customer_id), dateObj);
        
        res.json({
          success: true,
          reference_number: reference
        });
      } catch (error) {
        console.error('Error generating payment reference:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET NEXT CREDIT NOTE REFERENCE (Preview - does not create record)
     */
    getNextCreditNoteReference: (req, res) => {
      try {
        const { customer_id, payment_date = new Date().toISOString() } = req.query;

        if (!customer_id) {
          return res.status(400).json({ error: 'customer_id is required' });
        }

        const dateObj = new Date(payment_date);
        const reference = generateCreditNoteReference(db, parseInt(customer_id), dateObj);
        
        res.json({
          success: true,
          reference_number: reference
        });
      } catch (error) {
        console.error('Error generating credit note reference:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * CREATE PAYMENT (type: 'PAYMENT')
     */
    createPayment: (req, res) => {
      try {
        const {
          invoice_id = null,
          customer_id,
          amount,
          payment_medium = null,
          reference_number = null,
          payment_date = null,
          notes = null
        } = req.body;

        if (!customer_id || !amount) {
          return res.status(400).json({ error: 'customer_id and amount are required' });
        }

        if (!isCustomerAccessible(req, customer_id)) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to record payments for this customer.' });
        }

        // Validate invoice if provided (optional for general payments)
        if (invoice_id) {
          const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
          if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
          }
        }

        const creatorId = req.user ? (req.user.id || req.user.userId) : null;

        // Generate payment reference if not provided
        const paymentDateObj = payment_date ? new Date(payment_date) : new Date();
        const finalReferenceNumber = reference_number || generatePaymentReference(db, customer_id, paymentDateObj);
        // Convert Date to string format for SQLite
        const finalPaymentDate = paymentDateObj.toISOString().split('T')[0];

        // Insert payment record
        const paymentStmt = db.prepare(`
          INSERT INTO payments 
          (customer_id, type, amount, payment_medium, reference_number, payment_date, invoice_id, notes, created_by_user_id, created_at, updated_at)
          VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const paymentResult = paymentStmt.run(customer_id, amount, payment_medium, finalReferenceNumber, finalPaymentDate || null, invoice_id, notes, creatorId);
        const payment_id = paymentResult.lastInsertRowid;

        // Authoritatively sync customer ledger and prior invoice dues
        const ledgerSync = syncCustomerLedgerAndPriorDues(customer_id);

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'payments',
          action: 'create',
          resourceType: 'payment',
          resourceId: payment_id,
          resourceName: finalReferenceNumber,
          metadata: { amount, customer_id, invoice_id, payment_medium }
        });

        try {
          dataBus.broadcast('billing:payment', 'created', {
            id: payment_id,
            reference_number: finalReferenceNumber,
            customer_id,
            amount
          });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id });
        } catch (_) {}

        res.status(201).json({
          success: true,
          payment_id,
          reference_number: finalReferenceNumber,
          invoice_id,
          customer_id,
          amount,
          current_due: ledgerSync ? ledgerSync.current_due : undefined,
          total_outstanding: ledgerSync ? ledgerSync.total_outstanding : undefined,
          created_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * CREATE CREDIT NOTE (type: 'CREDIT_NOTE')
     */
    createCreditNote: (req, res) => {
      try {
        const {
          invoice_id,
          customer_id,
          amount,
          reason,
          product_name = null,
          quantity_returned = null,
          unit_price = null,
          payment_date = null,
          reference_number = null,
          notes = null,
          attachment_data = null
        } = req.body;

        if (!customer_id || !amount || !reason) {
          return res.status(400).json({ error: 'customer_id, amount, and reason are required' });
        }

        if (!isCustomerAccessible(req, customer_id)) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to issue credit notes for this customer.' });
        }

        // Get invoice if provided
        let invoice = null;
        if (invoice_id) {
          invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
          if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
          }
        }

        const creatorId = req.user ? (req.user.id || req.user.userId) : null;

        // Generate credit note reference if not provided
        const creditDateObj = payment_date ? new Date(payment_date) : new Date();
        const finalReferenceNumber = reference_number || generateCreditNoteReference(db, customer_id, creditDateObj);
        // Convert Date to string format for SQLite
        const finalPaymentDate = creditDateObj.toISOString().split('T')[0];

        // Insert credit note record
        const creditStmt = db.prepare(`
          INSERT INTO payments 
          (customer_id, type, amount, credit_amount, reason, reference_number, payment_date, invoice_id, notes, attachment_data, created_by_user_id, created_at, updated_at)
          VALUES (?, 'CREDIT_NOTE', 0, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const creditResult = creditStmt.run(
          customer_id, 
          amount, 
          reason, 
          finalReferenceNumber, 
          finalPaymentDate || null, 
          invoice_id || null,
          notes || null,
          attachment_data,
          creatorId
        );

        const payment_id = creditResult.lastInsertRowid;

        // Authoritatively sync customer ledger and prior invoice dues
        const ledgerSync = syncCustomerLedgerAndPriorDues(customer_id);

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'payments',
          action: 'create',
          resourceType: 'credit_note',
          resourceId: payment_id,
          resourceName: finalReferenceNumber,
          metadata: { credit_amount: amount, customer_id, invoice_id, reason }
        });

        try {
          dataBus.broadcast('billing:creditnote', 'created', {
            id: payment_id,
            reference_number: finalReferenceNumber,
            customer_id,
            amount
          });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id });
        } catch (_) {}

        res.status(201).json({
          success: true,
          payment_id,
          reference_number: finalReferenceNumber,
          type: 'CREDIT_NOTE',
          invoice_id: invoice_id || null,
          customer_id,
          amount,
          reason,
          current_due: ledgerSync ? ledgerSync.current_due : undefined,
          total_outstanding: ledgerSync ? ledgerSync.total_outstanding : undefined,
          created_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error creating credit note:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET PAYMENTS/CREDIT NOTES (for an invoice or customer)
     */
    getPayments: (req, res) => {
      try {
        const { customer_id, type, id, limit = 100, offset = 0 } = req.query;
        
        // If specific ID requested, return single payment
        if (id) {
          const payment = db.prepare(`
            SELECT 
              p.id,
              p.customer_id,
              p.invoice_id,
              p.type,
              p.amount,
              p.payment_medium,
              p.reason,
              p.credit_amount,
              p.notes,
              p.attachment_data,
              p.reference_number,
              p.payment_date,
              p.created_at,
              p.updated_at,
              COALESCE(u_creator.role, 'owner') as created_by_role,
              COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
              u_editor.role as last_edited_by_role,
              COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
              c.name as customer_name
            FROM payments p
            LEFT JOIN contacts c ON p.customer_id = c.id
            LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
            LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
            WHERE p.id = ?
          `).get(id);
          
          if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
          }

          if (payment.customer_id && !isCustomerAccessible(req, payment.customer_id)) {
            return res.status(403).json({ error: 'Access denied to this payment' });
          }
          
          return res.json([payment]);
        }
        
        // Build query to get payments/credit notes
        let sql = `
          SELECT 
            p.id,
            p.customer_id,
            p.invoice_id,
            p.type,
            p.amount,
            p.payment_medium,
            p.reason,
            p.credit_amount,
            p.notes,
            p.attachment_data,
            p.reference_number,
            p.payment_date,
            p.created_at,
            p.updated_at,
            COALESCE(u_creator.role, 'owner') as created_by_role,
            COALESCE(u_creator.full_name, u_creator.username, u_creator.google_name, 'Admin') as created_by_name,
            u_editor.role as last_edited_by_role,
            COALESCE(u_editor.full_name, u_editor.username, u_editor.google_name) as last_edited_by_name,
            c.name as customer_name
          FROM payments p
          LEFT JOIN contacts c ON p.customer_id = c.id
          LEFT JOIN users u_creator ON p.created_by_user_id = u_creator.id
          LEFT JOIN users u_editor ON p.last_edited_by_user_id = u_editor.id
          WHERE 1=1
        `;
        const params = [];

        if (customer_id) {
          sql += ' AND p.customer_id = ?';
          params.push(customer_id);
        }

        if (type) {
          sql += ' AND p.type = ?';
          params.push(type);
        }

        const workerScope = getWorkerContactScope(req, 'c');
        if (workerScope) {
          sql += ` AND ${workerScope}`;
        }

        sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const payments = db.prepare(sql).all(...params);
        res.json(payments);

      } catch (error) {
        console.error('Error getting payments:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * UPDATE PAYMENT OR CREDIT NOTE
     */
    updatePayment: (req, res) => {
      try {
        const { id } = req.params;
        const {
          amount,
          payment_medium,
          reference_number,
          payment_date,
          notes,
          reason,
          credit_amount,
          attachment_data
        } = req.body;

        // Get current payment record
        const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (!isCustomerAccessible(req, payment.customer_id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const customer_id = payment.customer_id;
        let oldAmount = 0;
        let newAmount = 0;

        // Build update query dynamically based on payment type
        let updateFields = ['updated_at = ?'];
        let updateValues = [new Date().toISOString()];

        if (payment.type === 'PAYMENT') {
          oldAmount = payment.amount || 0;
          newAmount = amount !== undefined ? amount : oldAmount;
          
          if (amount !== undefined) {
            updateFields.push('amount = ?');
            updateValues.push(amount);
          }
          if (payment_medium !== undefined) {
            updateFields.push('payment_medium = ?');
            updateValues.push(payment_medium);
          }
          if (reference_number !== undefined) {
            updateFields.push('reference_number = ?');
            updateValues.push(reference_number);
          }
          if (payment_date !== undefined) {
            updateFields.push('payment_date = ?');
            updateValues.push(payment_date);
          }
          if (notes !== undefined) {
            updateFields.push('notes = ?');
            updateValues.push(notes);
          }
        } else if (payment.type === 'CREDIT_NOTE') {
          oldAmount = payment.credit_amount || 0;
          newAmount = credit_amount !== undefined ? credit_amount : oldAmount;
          
          if (credit_amount !== undefined) {
            updateFields.push('credit_amount = ?');
            updateValues.push(credit_amount);
          }
          if (reason !== undefined) {
            updateFields.push('reason = ?');
            updateValues.push(reason);
          }
          if (reference_number !== undefined) {
            updateFields.push('reference_number = ?');
            updateValues.push(reference_number);
          }
          if (payment_date !== undefined) {
            updateFields.push('payment_date = ?');
            updateValues.push(payment_date);
          }
          if (notes !== undefined) {
            updateFields.push('notes = ?');
            updateValues.push(notes);
          }
          if (attachment_data !== undefined) {
            updateFields.push('attachment_data = ?');
            updateValues.push(attachment_data);
          }
        }

        const editorId = req.user ? (req.user.id || req.user.userId) : null;
        if (editorId) {
          updateFields.push('last_edited_by_user_id = ?');
          updateValues.push(editorId);
        }

        // Update payment record
        updateValues.push(id);
        const updateQuery = `UPDATE payments SET ${updateFields.join(', ')} WHERE id = ?`;
        try {
          db.prepare(updateQuery).run(...updateValues);
        } catch (sqlError) {
          console.error('SQL Error:', sqlError.message, 'Query:', updateQuery);
          throw sqlError;
        }

        // Get updated payment to return
        const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);

        // Authoritatively sync customer ledger and prior invoice dues
        const ledgerSync = syncCustomerLedgerAndPriorDues(customer_id);

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'payments',
          action: 'update',
          resourceType: updatedPayment?.type === 'CREDIT_NOTE' ? 'credit_note' : 'payment',
          resourceId: id,
          resourceName: updatedPayment?.reference_number || null,
          metadata: { amount: updatedPayment?.amount || updatedPayment?.credit_amount, customer_id: updatedPayment?.customer_id }
        });

        // Real-time reactive broadcast
        try {
          dataBus.broadcast('billing:payment', 'updated', { id, customer_id: updatedPayment?.customer_id });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id: updatedPayment?.customer_id });
        } catch (_) {}

        res.json({
          success: true,
          message: 'Payment updated successfully',
          payment: updatedPayment,
          current_due: ledgerSync ? ledgerSync.current_due : undefined,
          total_outstanding: ledgerSync ? ledgerSync.total_outstanding : undefined
        });

      } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * DELETE PAYMENT (removes the payment and its ledger entry)
     */
    deletePayment: (req, res) => {
      try {
        const { id } = req.params;

        const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (!isCustomerAccessible(req, payment.customer_id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const customer_id = payment.customer_id;

        // Delete payment record
        db.prepare('DELETE FROM payments WHERE id = ?').run(id);

        // Authoritatively sync customer ledger and prior invoice dues
        const ledgerSync = syncCustomerLedgerAndPriorDues(customer_id);

        // Audit Log
        activityLogger.logActivity(req, {
          module: 'payments',
          action: 'delete',
          resourceType: payment.type === 'CREDIT_NOTE' ? 'credit_note' : 'payment',
          resourceId: id,
          resourceName: payment.reference_number || null,
          metadata: { customer_id, amount: payment.amount || payment.credit_amount }
        });

        // Real-time reactive broadcast
        try {
          dataBus.broadcast('billing:payment', 'deleted', { id, customer_id });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id });
        } catch (_) {}

        res.json({ 
          success: true, 
          message: 'Payment deleted successfully',
          customer_id,
          current_due: ledgerSync ? ledgerSync.current_due : undefined,
          total_outstanding: ledgerSync ? ledgerSync.total_outstanding : undefined
        });

      } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET PAYMENT SUMMARY
     */
    getPaymentSummary: (req, res) => {
      try {
        const { customer_id } = req.query;
        let whereClause = '1=1';
        const params = [];

        if (customer_id) {
          whereClause += ' AND p.customer_id = ?';
          params.push(customer_id);
        }

        const workerScope = getWorkerContactScope(req, 'c');
        let filterClause = '';
        if (workerScope) {
          const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
          filterClause = ` AND ${workerScope} AND (
            c.id NOT IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}' AND exclude_from_stats = 1)
          )`;
        } else {
          filterClause = ` AND (c.exclude_from_stats IS NULL OR c.exclude_from_stats = 0)`;
        }

        const result = {
          payments: 0,
          credit_notes: 0,
          total_payments: 0,
          total_credits: 0
        };

        // Get payment totals
        const paymentRecord = db.prepare(`
          SELECT 
            COUNT(*) as count,
            COALESCE(SUM(p.amount), 0) as total
          FROM payments p
          JOIN contacts c ON p.customer_id = c.id
          WHERE ${whereClause} AND p.type = 'PAYMENT' ${filterClause}
        `).get(...params);

        if (paymentRecord && paymentRecord.count > 0) {
          result.payments = paymentRecord.count;
          result.total_payments = parseFloat((paymentRecord.total || 0).toFixed(2));
        }

        // Get credit note totals
        const creditRecord = db.prepare(`
          SELECT 
            COUNT(*) as count,
            COALESCE(SUM(p.credit_amount), 0) as total
          FROM payments p
          JOIN contacts c ON p.customer_id = c.id
          WHERE ${whereClause} AND p.type = 'CREDIT_NOTE' ${filterClause}
        `).get(...params);

        if (creditRecord && creditRecord.count > 0) {
          result.credit_notes = creditRecord.count;
          result.total_credits = parseFloat((creditRecord.total || 0).toFixed(2));
        }

        res.json(result);

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET TOTAL COLLECTED - Simple sum of all payments and credit notes
     */
    getTotalCollected: (req, res) => {
      try {
        const workerScope = getWorkerContactScope(req, 'c');
        let filterClause = '';
        if (workerScope) {
          const safeUserId = String(req.user.id || req.user.userId).replace(/'/g, "''");
          filterClause = ` AND ${workerScope} AND (
            c.id NOT IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}' AND exclude_from_stats = 1)
          )`;
        } else {
          filterClause = ` AND (c.exclude_from_stats IS NULL OR c.exclude_from_stats = 0)`;
        }

        const result = db.prepare(`
          SELECT 
            COALESCE(SUM(p.amount), 0) as payments_total,
            COALESCE(SUM(p.credit_amount), 0) as credits_total
          FROM payments p
          JOIN contacts c ON p.customer_id = c.id
          WHERE (p.type = 'PAYMENT' OR p.type = 'CREDIT_NOTE')
            ${filterClause}
        `).get();

        const total_payments = parseFloat((result.payments_total || 0).toFixed(2));
        const total_credits = parseFloat((result.credits_total || 0).toFixed(2));
        const total_collected = parseFloat((total_payments + total_credits).toFixed(2));

        res.json({
          total_payments,
          total_credits,
          total_collected
        });

      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * GET CUSTOMER OUTSTANDING - Calculate outstanding for a specific customer
     */
    getCustomerOutstanding: (req, res) => {
      try {
        const { customer_id, customer_name } = req.query;
        
        if (!customer_id && !customer_name) {
          return res.status(400).json({ error: 'customer_id or customer_name required' });
        }

        // Get customer ID if name provided
        let cust_id = customer_id;
        let opening_balance = 0;
        
        if (customer_name && !customer_id) {
          const customer = db.prepare('SELECT id, opening_balance FROM contacts WHERE name = ? OR id = ?').get(customer_name, customer_name);
          if (!customer) {
            return res.json({
              customer_id: null,
              total_invoiced: 0,
              total_paid: 0,
              total_credited: 0,
              total_collected: 0,
              total_outstanding: 0,
              opening_balance: 0,
              total_bills: 0,
              partial_bills: 0,
              outstanding_bills_count: 0
            });
          }
          cust_id = customer.id;
          opening_balance = customer.opening_balance || 0;
        } else if (customer_id) {
          const customer = db.prepare('SELECT opening_balance FROM contacts WHERE id = ?').get(customer_id);
          if (customer) {
            opening_balance = customer.opening_balance || 0;
          }
        }

        if (cust_id && !isCustomerAccessible(req, cust_id)) {
          return res.status(403).json({ error: 'Access denied: You do not have permission to view this customer.' });
        }

        // Get total invoiced for customer
        const invoiceStats = db.prepare(`
          SELECT 
            COALESCE(SUM(grand_total), 0) as total_invoiced,
            COUNT(*) as total_bills
          FROM invoices 
          WHERE customer_id = ?
        `).get(cust_id);

        // Get payment totals for customer
        const paymentStats = db.prepare(`
          SELECT 
            COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) as total_paid,
            COALESCE(SUM(CASE WHEN type = 'CREDIT_NOTE' THEN credit_amount ELSE 0 END), 0) as total_credited
          FROM payments 
          WHERE customer_id = ?
        `).get(cust_id);

        const total_invoiced = parseFloat((invoiceStats.total_invoiced || 0).toFixed(2));
        const total_paid = parseFloat((paymentStats.total_paid || 0).toFixed(2));
        const total_credited = parseFloat((paymentStats.total_credited || 0).toFixed(2));
        const total_collected = parseFloat((total_paid + total_credited).toFixed(2));
        const total_outstanding = parseFloat((total_invoiced + opening_balance - total_collected).toFixed(2));
        const total_bills = invoiceStats.total_bills || 0;
        
        // Estimate outstanding bills based on outstanding amount vs average bill
        const avg_bill = total_bills > 0 ? total_invoiced / total_bills : 0;
        const outstanding_bills_count = avg_bill > 0 ? Math.ceil(total_outstanding / avg_bill) : 0;
        
        // Count partial payments (invoices with some payment)
        // Since we don't track per-invoice payments, estimate as invoices with remainder
        const partial_bills = Math.min(outstanding_bills_count, total_bills);

        res.json({
          customer_id: cust_id,
          total_invoiced,
          total_paid,
          total_credited,
          total_collected,
          total_outstanding,
          opening_balance,
          total_bills,
          partial_bills,
          outstanding_bills_count
        });

      } catch (error) {
        console.error('Error getting customer outstanding:', error);
        res.status(500).json({ error: error.message });
      }
    },

    /**
     * RECALCULATE LEDGER - Refresh ledger entries from invoices and payments tables
     * Also recalculates previous_due for all invoices based on sequence-based ordering
     * Called when ledger page loads to ensure accurate current balances
     */
    recalculateLedger: (req, res) => {
      try {
        // Get all customers with transactions
        const customers = db.prepare(`
          SELECT DISTINCT id, name FROM contacts WHERE id IN (
            SELECT customer_id FROM invoices 
            UNION 
            SELECT customer_id FROM payments
            UNION
            SELECT id FROM contacts WHERE COALESCE(opening_balance, 0) != 0
          )
        `).all();

        // Clear and rebuild ledger for each customer
        db.prepare('DELETE FROM ledger').run();

        customers.forEach(customer => {
          syncCustomerLedgerAndPriorDues(customer.id);
        });

        res.json({
          success: true,
          message: `Ledger recalculated for ${customers.length} customers`,
          customers_count: customers.length
        });

      } catch (error) {
        console.error('Error recalculating ledger:', error);
        res.status(500).json({ error: error.message });
      }
    }
  };
};

// Helper function to get calendar year (Jan-Dec)
function getCalendarYear(date = new Date()) {
  const year = date.getFullYear();
  return year.toString().slice(-2);
}

// Helper function to determine if record A is logically strictly prior to record B for ledgers
function isStrictlyPrior(dateA, createdA, idA, dateB, createdB, idB) {
  const normalize = (d, c) => {
    let t = d ? new Date(d) : new Date(c);
    t.setHours(0,0,0,0);
    return t.getTime();
  };
  
  const dayA = normalize(dateA, createdA);
  const dayB = normalize(dateB, createdB);
  
  if (dayA < dayB) return true;
  if (dayA > dayB) return false;
  
  const exactA = new Date(createdA).getTime();
  const exactB = new Date(createdB).getTime();
  if (exactA < exactB) return true;
  if (exactA > exactB) return false;
  
  if (idA !== undefined && idB !== undefined) return idA < idB;
  return false;
}

// Helper function to get calendar year start date (January 1st)
function getCalendarYearStart(date = new Date()) {
  const year = date.getFullYear();
  return new Date(year, 0, 1);
}

// Helper function to get calendar year end date (December 31st)
function getCalendarYearEnd(date = new Date()) {
  const year = date.getFullYear();
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

// Helper function to generate payment reference
// Format: PAY-YY#### where YY = calendar year, #### = 4-digit global serial per calendar year
function generatePaymentReference(db, customerId, paymentDate = new Date()) {
  try {
    const yr = getCalendarYear(paymentDate);
    const yrStart = getCalendarYearStart(paymentDate);
    const yrEnd = getCalendarYearEnd(paymentDate);
    
    // Global count for PAYMENT type records in this calendar year (removed customer_id filter)
    const countResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM payments p
      WHERE p.type = 'PAYMENT'
        AND date(p.payment_date) >= date(?)
        AND date(p.payment_date) <= date(?)
    `).get(yrStart.toISOString().split('T')[0], yrEnd.toISOString().split('T')[0]);
    
    const sequence = (countResult?.count || 0) + 1;
    const sequenceStr = String(sequence).padStart(4, '0');
    
    return `PAY-${yr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating payment reference:', err);
    return `PAY-${Date.now().toString().slice(-8)}`;
  }
}

// Helper function to generate credit note reference
// Format: CREDIT-YY#### where YY = calendar year, #### = 4-digit global serial per calendar year
function generateCreditNoteReference(db, customerId, paymentDate = new Date()) {
  try {
    const yr = getCalendarYear(paymentDate);
    const yrStart = getCalendarYearStart(paymentDate);
    const yrEnd = getCalendarYearEnd(paymentDate);
    
    // Global count for CREDIT_NOTE type records in this calendar year (removed customer_id filter)
    const countResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM payments p
      WHERE p.type = 'CREDIT_NOTE'
        AND date(p.payment_date) >= date(?)
        AND date(p.payment_date) <= date(?)
    `).get(yrStart.toISOString().split('T')[0], yrEnd.toISOString().split('T')[0]);
    
    const sequence = (countResult?.count || 0) + 1;
    const sequenceStr = String(sequence).padStart(4, '0');
    
    return `CREDIT-${yr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating credit note reference:', err);
    return `CREDIT-${Date.now().toString().slice(-8)}`;
  }
}

// Helper function to generate invoice reference
// Format: GST-YY#### or NGST-YY#### where YY = calendar year, #### = 4-digit global serial per calendar year
function generateInvoiceReference(db, customerId, invoiceDate = new Date()) {
  try {
    const yr = getCalendarYear(invoiceDate);
    const yrStart = getCalendarYearStart(invoiceDate);
    const yrEnd = getCalendarYearEnd(invoiceDate);
    
    // Check if customer has GSTIN
    const customer = db.prepare('SELECT gstin FROM contacts WHERE id = ?').get(customerId);
    const hasGST = customer && customer.gstin && customer.gstin.trim().length > 0;
    const prefix = hasGST ? 'GST' : 'NGST';
    
    // Global count for invoices in this calendar year
    const countResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM invoices
      WHERE date(invoice_date) >= date(?)
        AND date(invoice_date) <= date(?)
    `).get(yrStart.toISOString().split('T')[0], yrEnd.toISOString().split('T')[0]);
    
    const sequence = (countResult?.count || 0) + 1;
    const sequenceStr = String(sequence).padStart(4, '0');
    
    return `${prefix}-${yr}${sequenceStr}`;
  } catch (err) {
    console.error('Error generating invoice reference:', err);
    return `INV-${Date.now().toString().slice(-8)}`;
  }
}

// Helper function to extract sequence number from reference
// Extracts last 4 digits from formats like GST-260001, NGST-260001, PAY-240002, CREDIT-260003
function extractSequenceFromReference(refNumber) {
  if (!refNumber) return 0;
  // Match the last 4 digits before end of string
  const match = refNumber.match(/(\d{4})$/);
  return match ? parseInt(match[1], 10) : 0;
}

module.exports.helpers = {
  getCalendarYear,
  getCalendarYearStart,
  getCalendarYearEnd,
  generatePaymentReference,
  generateCreditNoteReference,
  generateInvoiceReference,
  extractSequenceFromReference
};
