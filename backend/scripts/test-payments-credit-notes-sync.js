const Database = require('better-sqlite3');
const path = require('path');
const assert = require('assert');

const dbPath = path.join(__dirname, '../../database/MacOS.db');
const db = new Database(dbPath);

const createPaymentsHandlers = require('../core/invoices/payments');
const paymentsApi = createPaymentsHandlers(db);

console.log('🧪 Starting Payments & Credit Notes Ledger Synchronization Tests...\n');

// Wrap everything in a rollback transaction to avoid mutating production DB state
const runTest = db.transaction(() => {
  // 1. Setup a test customer
  const customerResult = db.prepare(`
    INSERT INTO contacts (name, phone, opening_balance, type, created_at, updated_at)
    VALUES ('Test Ledger Parity Customer', '9999988888', 500, 'customer', datetime('now'), datetime('now'))
  `).run();
  const testCustomerId = customerResult.lastInsertRowid;

  // 2. Setup two test invoices for this customer
  const inv1Result = db.prepare(`
    INSERT INTO invoices (invoice_no, customer_id, grand_total, total_amount, total_gst, invoice_date, created_at)
    VALUES ('TEST-INV-001', ?, 1200, 1200, 200, '2026-09-01', '2026-09-01 10:00:00')
  `).run(testCustomerId);
  const inv1Id = inv1Result.lastInsertRowid;

  const inv2Result = db.prepare(`
    INSERT INTO invoices (invoice_no, customer_id, grand_total, total_amount, total_gst, invoice_date, created_at)
    VALUES ('TEST-INV-002', ?, 800, 800, 100, '2026-09-10', '2026-09-10 10:00:00')
  `).run(testCustomerId);
  const inv2Id = inv2Result.lastInsertRowid;

  console.log('--- Test 1: createPayment updates ledger and previous_due ---');
  let resStatus = 200;
  let resData = null;
  const mockRes = {
    status: (code) => { resStatus = code; return mockRes; },
    json: (data) => { resData = data; return mockRes; }
  };

  const paymentReq = {
    body: {
      customer_id: testCustomerId,
      amount: 600,
      payment_medium: 'upi',
      payment_date: '2026-09-05',
      notes: 'Initial partial payment'
    },
    user: { id: 'admin_auth', role: 'owner' }
  };

  paymentsApi.createPayment(paymentReq, mockRes);
  assert.strictEqual(resStatus, 201, 'Payment should return 201 Created');
  assert.ok(resData.payment_id, 'Payment should return payment_id');
  const paymentId = resData.payment_id;

  // Verify ledger table in SQLite
  const ledgerRow = db.prepare('SELECT * FROM ledger WHERE customer_id = ?').get(testCustomerId);
  assert.ok(ledgerRow, 'Ledger entry must exist for customer');
  assert.strictEqual(ledgerRow.total_debit, 2000, 'Total debit must be 2000 (1200 + 800)');
  assert.strictEqual(ledgerRow.total_credit, 600, 'Total credit must be 600');
  assert.strictEqual(ledgerRow.current_due, 1400, 'Current due must be 1400 (2000 - 600)');
  assert.strictEqual(ledgerRow.total_bills, 2, 'Total bills count must be 2');
  assert.strictEqual(ledgerRow.total_payments, 1, 'Total payments count must be 1');

  // Verify invoice 2 previous_due (opening_balance 500 + inv1 1200 - payment 600 = 1100)
  const inv2Row = db.prepare('SELECT previous_due FROM invoices WHERE id = ?').get(inv2Id);
  assert.strictEqual(inv2Row.previous_due, 1100, 'Invoice 2 previous_due must be 1100');
  console.log('✅ Test 1 Passed: Payment inserted and ledger + prior dues updated perfectly.');

  console.log('\n--- Test 2: createCreditNote updates ledger ---');
  const creditReq = {
    body: {
      customer_id: testCustomerId,
      amount: 300,
      reason: 'discount',
      payment_date: '2026-09-12',
      notes: 'Goodwill credit'
    },
    user: { id: 'admin_auth', role: 'owner' }
  };

  paymentsApi.createCreditNote(creditReq, mockRes);
  assert.strictEqual(resStatus, 201, 'Credit note should return 201 Created');
  const creditNoteId = resData.payment_id;

  const ledgerAfterCredit = db.prepare('SELECT * FROM ledger WHERE customer_id = ?').get(testCustomerId);
  assert.strictEqual(ledgerAfterCredit.total_credit, 900, 'Total credit must now be 900 (600 + 300)');
  assert.strictEqual(ledgerAfterCredit.current_due, 1100, 'Current due must now be 1100 (2000 - 900)');
  assert.strictEqual(ledgerAfterCredit.total_payments, 2, 'Total payments count must be 2');
  console.log('✅ Test 2 Passed: Credit Note inserted and ledger updated.');

  console.log('\n--- Test 3: updatePayment adjusts ledger ---');
  const updateReq = {
    params: { id: paymentId },
    body: {
      amount: 1000
    },
    user: { id: 'admin_auth', role: 'owner' }
  };

  paymentsApi.updatePayment(updateReq, mockRes);
  const ledgerAfterUpdate = db.prepare('SELECT * FROM ledger WHERE customer_id = ?').get(testCustomerId);
  assert.strictEqual(ledgerAfterUpdate.total_credit, 1300, 'Total credit must now be 1300 (1000 + 300)');
  assert.strictEqual(ledgerAfterUpdate.current_due, 700, 'Current due must now be 700 (2000 - 1300)');
  console.log('✅ Test 3 Passed: Payment update recalculated ledger.');

  console.log('\n--- Test 4: deletePayment restores ledger balance ---');
  const deleteReq = {
    params: { id: creditNoteId },
    user: { id: 'admin_auth', role: 'owner' }
  };

  paymentsApi.deletePayment(deleteReq, mockRes);
  const ledgerAfterDelete = db.prepare('SELECT * FROM ledger WHERE customer_id = ?').get(testCustomerId);
  assert.strictEqual(ledgerAfterDelete.total_credit, 1000, 'Total credit must now be 1000 (credit note removed)');
  assert.strictEqual(ledgerAfterDelete.current_due, 1000, 'Current due must now be 1000 (2000 - 1000)');
  console.log('✅ Test 4 Passed: Payment deletion restored ledger balance.');

  // Always roll back test mutations so database stays pristine
  throw new Error('ROLLBACK_TEST_INTENTIONAL');
});

try {
  runTest();
} catch (e) {
  if (e.message === 'ROLLBACK_TEST_INTENTIONAL') {
    console.log('\n🎉 ALL PAYMENTS & CREDIT NOTES LEDGER SYNC TESTS PASSED (Database Cleanly Rolled Back)!');
    process.exit(0);
  } else {
    console.error('\n❌ Test Failure:', e);
    process.exit(1);
  }
}
