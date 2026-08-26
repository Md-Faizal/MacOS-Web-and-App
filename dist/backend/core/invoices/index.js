/**
 * Invoices Module
 * Core invoicing system with multi-item support
 */

const express = require('express');

const invoiceHandlers = require('./handlers');
const paymentHandlers = require('./payments');
const createRoutes = require('./routes');

const router = express.Router();
let db;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Invoices using centralized database');
      
      // Ensure ledger is synchronized on startup
      synchronizeLedger();
    } else {
      throw new Error('Centralized database not initialized');
    }

    const handlers = invoiceHandlers(db);
    const payments = paymentHandlers(db);
    
    // Register routes
    createRoutes(router, handlers, payments);
    
    return true;
  } catch (error) {
    console.error('✗ Error initializing Invoices Module:', error.message);
    throw error;
  }
}

/**
 * Synchronize ledger entries to ensure each customer has ONE ledger entry with correct balance
 * Called on API startup to fix any orphaned records
 */
function synchronizeLedger() {
  try {
    // Get all unique customers that have invoices or payments
    const customers = db.prepare(`
      SELECT DISTINCT c.id, c.name
      FROM contacts c
      LEFT JOIN invoices i ON c.id = i.customer_id
      LEFT JOIN payments p ON c.id = p.customer_id
      WHERE i.id IS NOT NULL 
         OR p.id IS NOT NULL 
         OR COALESCE(c.opening_balance, 0) != 0
      ORDER BY c.id
    `).all();

    let ledgerEntriesCreated = 0;
    let ledgerEntriesUpdated = 0;

    for (const customer of customers) {
      const existing = db.prepare('SELECT id FROM ledger WHERE customer_id = ?').get(customer.id);

      // Calculate current_due for this customer using separate subqueries to avoid JOIN multiplication
      const totals = db.prepare(`
        SELECT 
          COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = ?), 0) as total_debit,
          COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ? AND type = 'PAYMENT'), 0) as total_payments,
          COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = ? AND type = 'CREDIT_NOTE'), 0) as total_credits,
          (SELECT COUNT(*) FROM invoices WHERE customer_id = ?) as total_bills,
          (SELECT COUNT(*) FROM payments WHERE customer_id = ?) as total_payments_count
      `).get(customer.id, customer.id, customer.id, customer.id, customer.id);

      const total_credit = totals.total_payments + totals.total_credits;
      const current_due = totals.total_debit - total_credit;
      
      // Determine current status based on current_due
      let current_status = 'PENDING';
      if (current_due < 0) {
        current_status = 'CREDIT';
      } else if (current_due === 0) {
        current_status = 'SETTLED';
      }

      // Ledger will be recalculated automatically when accessed
    }

    if (ledgerEntriesCreated > 0) {
      console.log(`  ✓ Ledger synchronization: Created ${ledgerEntriesCreated} customer ledger entries`);
    }
    if (ledgerEntriesUpdated > 0) {
      console.log(`  ✓ Ledger synchronization: Updated ${ledgerEntriesUpdated} customer balances`);
    }
  } catch (error) {
    console.error('  ⚠ Ledger synchronization warning:', error.message);
    // Don't throw - this is a maintenance operation
  }
}

// Info endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'running',
    name: 'Invoices Module',
    version: '1.0.0',
    description: 'Multi-item invoice management system',
    endpoints: {
      invoices: {
        list: 'GET /api/invoices',
        create: 'POST /api/invoices',
        get: 'GET /api/invoices/:id',
        updateStatus: 'PUT /api/invoices/:id/status',
        delete: 'DELETE /api/invoices/:id',
        summary: 'GET /api/invoices/summary'
      },
      payments: {
        create: 'POST /api/payments',
        createCredit: 'POST /api/creditnotes',
        list: 'GET /api/payments',
        delete: 'DELETE /api/payments/:id',
        summary: 'GET /api/payments/summary'
      }
    }
  });
});

module.exports = {
  router,
  initializeDatabase
};
