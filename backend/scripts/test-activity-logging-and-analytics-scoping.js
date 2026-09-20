const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing Activity Logger & Analytics Access Scoping...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const contactsHandlers = require('../departments/contacts/engine/handlers')(db);
const billingHandlers = require('../departments/billing/engine/handlers')(db);
const paymentsHandlers = require('../core/invoices/payments')(db);
const ordersHandlers = require('../core/orders/handlers')(db);
const productHandlers = require('../departments/product-list/engine/handlers')(db);
const analyticsHandlers = require('../departments/analytics/engine/handlers')(db);

const ownerReq = { user: { id: 'admin_test', userId: 'admin_test', role: 'owner' }, query: {}, body: {}, params: {}, headers: {} };
const workerReq = { user: { id: 'worker_audit_1', userId: 'worker_audit_1', role: 'worker' }, query: {}, body: {}, params: {}, headers: {} };

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.data = payload; return this; }
  };
  return res;
}

async function runTests() {
  // Ensure test users exist (INSERT OR IGNORE so FK constraints are satisfied without modifying immutable logs)
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, role, status)
    VALUES 
      ('admin_test', 'admin_test', 'admin@test.com', 'owner', 'active'),
      ('worker_audit_1', 'worker_audit_1', 'worker1@test.com', 'worker', 'active')
  `).run();

  // ==========================
  // TEST 1: CONTACT AUDIT LOGGING
  // ==========================
  const resContact = mockRes();
  await contactsHandlers.createContact({
    user: workerReq.user,
    body: { name: 'AUDIT_TEST_WorkerContact', type: 'Customer', opening_balance: 1000 }
  }, resContact);
  const workerContactId = resContact.data.id;
  assert.ok(workerContactId, 'Worker contact should be created');

  const contactLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'worker_audit_1' AND module = 'contacts' AND action = 'create' 
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(contactLog, 'Activity log should have a create contact record');
  assert.strictEqual(contactLog.resource_id, String(workerContactId));
  assert.strictEqual(contactLog.resource_name, 'AUDIT_TEST_WorkerContact');
  console.log('✅ Contact creation audit log verified');

  // Contact Update
  const resUpdateContact = mockRes();
  contactsHandlers.updateContact({
    user: workerReq.user,
    params: { id: workerContactId },
    body: { name: 'AUDIT_TEST_WorkerContact_Updated' }
  }, resUpdateContact);

  const contactUpdateLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'worker_audit_1' AND module = 'contacts' AND action = 'update'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(contactUpdateLog, 'Activity log should record contact update');
  console.log('✅ Contact update audit log verified');

  // ==========================
  // TEST 2: PRODUCT AUDIT LOGGING
  // ==========================
  const resProduct = mockRes();
  productHandlers.createProduct({
    user: ownerReq.user,
    body: { name: 'AUDIT_TEST_ProductA', category_id: 2, classification: 'General', variants: [] }
  }, resProduct);
  const prodId = resProduct.data.id;
  assert.ok(prodId, 'Product should be created');

  const prodLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'admin_test' AND module = 'products' AND action = 'create'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(prodLog, 'Activity log should record product creation');
  assert.strictEqual(prodLog.resource_id, String(prodId));
  assert.strictEqual(prodLog.resource_name, 'AUDIT_TEST_ProductA');
  console.log('✅ Product creation audit log verified');

  // ==========================
  // TEST 3: INVOICE AUDIT & CREATOR TRACKING
  // ==========================
  const resInvoice = mockRes();
  await billingHandlers.createBill({
    user: workerReq.user,
    body: {
      customer_id: workerContactId,
      customer_name: 'AUDIT_TEST_WorkerContact_Updated',
      invoice_no: `INV_AUDIT_${Date.now()}`,
      products: [{ product_id: prodId, product_name: 'AUDIT_TEST_ProductA', rate: 100, quantity: 5, total: 500 }],
      grand_total: 500
    }
  }, resInvoice);
  const invoiceId = resInvoice.data.id;
  assert.ok(invoiceId, 'Invoice should be created');

  const invoiceRow = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  assert.strictEqual(invoiceRow.created_by_user_id, 'worker_audit_1', 'Invoice should save created_by_user_id');

  const invoiceLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'worker_audit_1' AND module = 'billing' AND action = 'create'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(invoiceLog, 'Activity log should record invoice creation');
  console.log('✅ Invoice creation audit log and created_by_user_id verified');

  // ==========================
  // TEST 4: PAYMENT AUDIT & CREATOR TRACKING
  // ==========================
  const resPayment = mockRes();
  paymentsHandlers.createPayment({
    user: workerReq.user,
    body: {
      customer_id: workerContactId,
      invoice_id: invoiceId,
      amount: 300,
      payment_medium: 'UPI'
    }
  }, resPayment);
  const paymentId = resPayment.data.payment_id;
  assert.ok(paymentId, 'Payment should be created');

  const paymentRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  assert.strictEqual(paymentRow.created_by_user_id, 'worker_audit_1', 'Payment should save created_by_user_id');

  const paymentLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'worker_audit_1' AND module = 'payments' AND action = 'create'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(paymentLog, 'Activity log should record payment creation');
  console.log('✅ Payment creation audit log and created_by_user_id verified');

  // ==========================
  // TEST 5: ORDER AUDIT & CREATOR TRACKING
  // ==========================
  const resOrder = mockRes();
  await ordersHandlers.createOrder({
    user: workerReq.user,
    body: {
      customer_id: workerContactId,
      items: [{ product_id: prodId, qty: 2, price: 100 }]
    }
  }, resOrder);
  const orderId = resOrder.data.id;
  assert.ok(orderId, 'Order should be created');

  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  assert.strictEqual(orderRow.created_by_user_id, 'worker_audit_1', 'Order should save created_by_user_id');

  const orderLog = db.prepare(`
    SELECT * FROM activity_log 
    WHERE user_id = 'worker_audit_1' AND module = 'orders' AND action = 'create'
    ORDER BY id DESC LIMIT 1
  `).get();
  assert.ok(orderLog, 'Activity log should record order creation');
  console.log('✅ Order creation audit log and created_by_user_id verified');

  // ==========================
  // TEST 6: ANALYTICS SCOPING VERIFICATION
  // ==========================
  // Create an Owner private contact
  const resOwnerContact = mockRes();
  await contactsHandlers.createContact({
    user: ownerReq.user,
    body: { name: 'AUDIT_TEST_OwnerPrivateContact', type: 'Customer', opening_balance: 5000 }
  }, resOwnerContact);
  const ownerContactId = resOwnerContact.data.id;

  // Invoice on Owner private contact
  const resOwnerInvoice = mockRes();
  await billingHandlers.createBill({
    user: ownerReq.user,
    body: {
      customer_id: ownerContactId,
      customer_name: 'AUDIT_TEST_OwnerPrivateContact',
      invoice_no: `INV_OWNER_${Date.now()}`,
      products: [{ product_id: prodId, rate: 200, quantity: 10, total: 2000 }],
      grand_total: 2000
    }
  }, resOwnerInvoice);

  // Worker calls getTopCustomers in Analytics
  const resWorkerTopCust = mockRes();
  analyticsHandlers.getTopCustomers(workerReq, resWorkerTopCust);
  const workerTopCustIds = resWorkerTopCust.data.map(c => c.id);
  assert.ok(workerTopCustIds.includes(workerContactId), 'Worker should see own contact in Top Customers');
  assert.ok(!workerTopCustIds.includes(ownerContactId), 'Worker must NOT see Owner private contact in Top Customers');
  console.log('✅ Analytics Top Customers scoping verified (Worker cannot see unassigned accounts)');

  // Worker calls getARAging in Analytics
  const resWorkerAging = mockRes();
  analyticsHandlers.getARAging(workerReq, resWorkerAging);
  const debtorCustIds = (resWorkerAging.data.top_debtors || []).map(d => d.customer_id);
  assert.ok(!debtorCustIds.includes(ownerContactId), 'Worker must NOT see Owner private contact in AR Aging Top Debtors');
  console.log('✅ Analytics AR Aging scoping verified (Worker cannot see unassigned debtors)');

  // Cleanup test data (activity_log entries remain immutable)
  db.prepare("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id IN (?, ?))").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM invoices WHERE customer_id IN (?, ?)").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM payments WHERE customer_id IN (?, ?)").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN (?, ?))").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM orders WHERE customer_id IN (?, ?)").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM customer_item_memory WHERE customer_id IN (?, ?)").run(workerContactId, ownerContactId);
  try { db.prepare("DELETE FROM ledger WHERE customer_id IN (?, ?)").run(workerContactId, ownerContactId); } catch (_) {}
  db.prepare("DELETE FROM user_contact_access WHERE user_id = 'worker_audit_1'").run();
  db.prepare("DELETE FROM contacts WHERE id IN (?, ?)").run(workerContactId, ownerContactId);
  db.prepare("DELETE FROM products WHERE id = ?").run(prodId);

  console.log('\n🎉 ALL ACTIVITY LOGGING & ANALYTICS SCOPING TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
