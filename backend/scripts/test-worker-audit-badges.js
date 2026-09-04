/**
 * Contract & Integration Test Suite for Worker Audit Badges & Settings Toggle
 */

const DatabaseManager = require('../core/db/database-manager');
const createContactsHandlers = require('../../frontend/modules/contacts/api/handlers');
const createProductsHandlers = require('../../frontend/modules/product-list/api/handlers');
const createOrdersHandlers = require('../core/orders/handlers');
const createInvoicesHandlers = require('../core/invoices/handlers');
const createPaymentsHandlers = require('../core/invoices/payments');
const createSettingsHandlers = require('../../frontend/modules/settings/api/handlers');
const createBillingHandlers = require('../../frontend/modules/billing/api/handlers');

const db = DatabaseManager.initialize();
const contactsApi = createContactsHandlers(db);
const productsApi = createProductsHandlers(db);
const ordersApi = createOrdersHandlers(db);
const invoicesApi = createInvoicesHandlers(db);
const paymentsApi = createPaymentsHandlers(db);
const settingsApi = createSettingsHandlers(db);
const billingApi = createBillingHandlers(db);

function createMockReqRes(user = { id: 'admin_auth', role: 'admin', username: 'admin' }, body = {}, params = {}, query = {}) {
  let resData = null;
  let resStatus = 200;
  return {
    req: { user, body, params, query, headers: {}, session: {} },
    res: {
      status(code) { resStatus = code; return this; },
      json(data) { resData = data; return this; },
      send(data) { resData = data; return this; },
      _getData() { return resData; },
      _getStatus() { return resStatus; }
    }
  };
}

async function runTests() {
  console.log('=== Starting Worker Audit Badges & Settings Contract Tests ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✕ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Settings Toggle Tests
  console.log('--- 1. Settings showWorkerBadges Toggle ---');
  try {
    const { req: sReq1, res: sRes1 } = createMockReqRes();
    settingsApi.getSettings(sReq1, sRes1);
    const settings = sRes1._getData();
    assert(settings && ('showWorkerBadges' in settings || 'show_worker_badges' in settings), 'getSettings returns showWorkerBadges');

    // Save toggle as false
    const { req: sReq2, res: sRes2 } = createMockReqRes({ id: 'admin_auth', role: 'admin' }, {
      setting_key: 'showWorkerBadges',
      setting_value: false
    });
    settingsApi.saveSetting(sReq2, sRes2);
    assert(sRes2._getData()?.success === true, 'saveSetting persists showWorkerBadges = false');

    // Save toggle as true
    const { req: sReq3, res: sRes3 } = createMockReqRes({ id: 'admin_auth', role: 'admin' }, {
      setting_key: 'showWorkerBadges',
      setting_value: true
    });
    settingsApi.saveSetting(sReq3, sRes3);
    assert(sRes3._getData()?.success === true, 'saveSetting persists showWorkerBadges = true');
  } catch (err) {
    console.error('Settings test error:', err);
    failed++;
  }

  // 2. Worker User Setup in DB
  const workerUserId = 'test_worker_' + Date.now();
  const workerEmail = 'worker_' + Date.now() + '@example.com';
  const workerName = 'Rida Worker';
  db.prepare(
    `INSERT INTO users (id, username, email, full_name, role, status)
     VALUES (?, ?, ?, ?, 'worker', 'active')`
  ).run(workerUserId, 'worker_' + Date.now(), workerEmail, workerName);

  // 3. Contacts Worker Audit
  console.log('\n--- 2. Contacts Worker Audit ---');
  let contactId;
  try {
    const contactInfo = db.prepare(
      `INSERT INTO contacts (name, phone, opening_balance, created_by_user_id)
       VALUES (?, ?, 500, ?)`
    ).run('Worker Test Customer ' + Date.now(), '9876543210', workerUserId);
    contactId = contactInfo.lastInsertRowid;

    const { req: cReq, res: cRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' }, {}, {}, { search: 'Worker Test Customer' });
    contactsApi.getContacts(cReq, cRes);
    const contactData = cRes._getData();
    const contact = (contactData.data || contactData).find(c => c.id === contactId);
    assert(contact && contact.created_by_role === 'worker', 'Contact returns created_by_role === "worker"');
    assert(contact && contact.created_by_name === workerName, 'Contact returns created_by_name');

    // Worker edits contact
    const { req: cEditReq, res: cEditRes } = createMockReqRes(
      { id: workerUserId, role: 'worker', full_name: workerName },
      { name: 'Worker Test Customer Edited' },
      { id: contactId }
    );
    contactsApi.updateContact(cEditReq, cEditRes);

    const { req: cReq2, res: cRes2 } = createMockReqRes({ id: 'admin_auth', role: 'admin' }, {}, {}, { search: 'Worker Test Customer Edited' });
    contactsApi.getContacts(cReq2, cRes2);
    const updatedContact = (cRes2._getData().data || cRes2._getData()).find(c => c.id === contactId);
    assert(updatedContact && updatedContact.last_edited_by_role === 'worker', 'Contact returns last_edited_by_role === "worker" after edit');
  } catch (err) {
    console.error('Contacts audit test error:', err);
    failed++;
  }

  // 4. Products Worker Audit
  console.log('\n--- 3. Products Worker Audit ---');
  try {
    let cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get();
    if (!cat) {
      const catInfo = db.prepare(`INSERT INTO categories (name) VALUES ('Test Category')`).run();
      cat = { id: catInfo.lastInsertRowid };
    }

    const { req: pReq, res: pRes } = createMockReqRes(
      { id: workerUserId, role: 'worker', full_name: workerName },
      {
        name: 'Worker Test Tonic ' + Date.now(),
        category_id: cat.id,
        classification: 'Non-Gold',
        variants: [{ pack_size_value: 100, pack_size_type: 'ML', batches: [{ batch_no: 'B1', mrp: 50 }] }]
      }
    );
    productsApi.createProduct(pReq, pRes);
    const createdProduct = pRes._getData();
    assert(createdProduct && createdProduct.id, 'createProduct successfully created product by worker');

    const { req: pGetReq, res: pGetRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    productsApi.getProducts(pGetReq, pGetRes);
    const allProducts = pGetRes._getData();
    const prod = allProducts.find(p => p.id === createdProduct.id);
    assert(prod && prod.created_by_role === 'worker', 'Product returns created_by_role === "worker"');
    assert(prod && prod.created_by_name === workerName, 'Product returns created_by_name');
  } catch (err) {
    console.error('Products audit test error:', err);
    failed++;
  }

  // 5. Orders Worker Audit
  console.log('\n--- 4. Orders Worker Audit ---');
  try {
    const orderNum = 'ORD-TEST-' + Date.now();
    const orderInfo = db.prepare(
      `INSERT INTO orders (order_number, customer_id, current_stage, status, created_by_user_id)
       VALUES (?, ?, 'stage1', 'pending', ?)`
    ).run(orderNum, contactId || 1, workerUserId);
    const orderId = orderInfo.lastInsertRowid;

    const { req: oReq, res: oRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    ordersApi.getOrders(oReq, oRes);
    const ordersResult = oRes._getData();
    const orders = ordersResult.data || ordersResult.rows || ordersResult;
    const ord = orders.find(o => String(o.id) === String(orderId));
    assert(ord && ord.created_by_role === 'worker', 'Order returns created_by_role === "worker"');
    assert(ord && ord.created_by_name === workerName, 'Order returns created_by_name');

    // Worker edits order
    const { req: oEditReq, res: oEditRes } = createMockReqRes(
      { id: workerUserId, role: 'worker' },
      { current_stage: 'stage2' },
      { id: orderId }
    );
    ordersApi.updateOrder(oEditReq, oEditRes);

    const { req: oReq2, res: oRes2 } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    ordersApi.getOrders(oReq2, oRes2);
    const updatedOrdersResult = oRes2._getData();
    const updatedOrders = updatedOrdersResult.data || updatedOrdersResult.rows || updatedOrdersResult;
    const updatedOrd = updatedOrders.find(o => String(o.id) === String(orderId));
    assert(updatedOrd && updatedOrd.last_edited_by_role === 'worker', 'Order returns last_edited_by_role === "worker" after edit');
  } catch (err) {
    console.error('Orders audit test error:', err);
    failed++;
  }

  // 6. Invoices Worker Audit
  console.log('\n--- 5. Invoices Worker Audit ---');
  try {
    const invoiceNo = 'INV-TEST-' + Date.now();
    const invInfo = db.prepare(
      `INSERT INTO invoices (invoice_no, customer_id, total_amount, grand_total, created_by_user_id)
       VALUES (?, ?, 100, 100, ?)`
    ).run(invoiceNo, contactId || 1, workerUserId);
    const invId = invInfo.lastInsertRowid;

    const { req: iReq, res: iRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    invoicesApi.getInvoices(iReq, iRes);
    const invoices = iRes._getData();
    const inv = invoices.find(i => String(i.id) === String(invId));
    assert(inv && inv.created_by_role === 'worker', 'Invoice returns created_by_role === "worker"');
    assert(inv && inv.created_by_name === workerName, 'Invoice returns created_by_name');
  } catch (err) {
    console.error('Invoices audit test error:', err);
    failed++;
  }

  // 7. Payments Worker Audit
  console.log('\n--- 6. Payments Worker Audit ---');
  try {
    const payRef = 'PAY-TEST-' + Date.now();
    const payInfo = db.prepare(
      `INSERT INTO payments (reference_number, customer_id, amount, type, created_by_user_id)
       VALUES (?, ?, 100, 'PAYMENT', ?)`
    ).run(payRef, contactId || 1, workerUserId);
    const paymentId = payInfo.lastInsertRowid;

    const { req: payReq, res: payRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    paymentsApi.getPayments(payReq, payRes);
    const payments = payRes._getData();
    const pay = payments.find(p => String(p.id) === String(paymentId));
    assert(pay && pay.created_by_role === 'worker', 'Payment returns created_by_role === "worker"');
    assert(pay && pay.created_by_name === workerName, 'Payment returns created_by_name');
  } catch (err) {
    console.error('Payments audit test error:', err);
    failed++;
  }

  // 8. Billing Ledger Customers Worker Audit
  console.log('\n--- 7. Ledger Customers Worker Audit ---');
  try {
    const { req: ledReq, res: ledRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    billingApi.getLedgerCustomers(ledReq, ledRes);
    const ledResult = ledRes._getData();
    const customers = ledResult.data || ledResult;
    const ledCust = customers.find(c => c.customer_id === contactId);
    assert(ledCust && ledCust.created_by_role === 'worker', 'Ledger Customer returns created_by_role === "worker"');
    assert(ledCust && ledCust.created_by_name === workerName, 'Ledger Customer returns created_by_name');
  } catch (err) {
    console.error('Ledger customers audit test error:', err);
    failed++;
  }

  // 9. Billing Bills Worker Audit
  console.log('\n--- 8. Billing Bills Worker Audit ---');
  try {
    const { req: bReq, res: bRes } = createMockReqRes({ id: 'admin_auth', role: 'admin' });
    billingApi.getBills(bReq, bRes);
    const billsRes = bRes._getData();
    const bills = billsRes.data || billsRes;
    const bill = bills.find(b => b.created_by_role === 'worker');
    assert(bill && bill.created_by_role === 'worker', 'Billing getBills returns created_by_role === "worker"');
    assert(bill && bill.created_by_name === workerName, 'Billing getBills returns created_by_name');
  } catch (err) {
    console.error('Billing bills audit test error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Test Summary: Passed: ${passed}, Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
