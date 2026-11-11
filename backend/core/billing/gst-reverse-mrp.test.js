const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');

const BillCalculator = require('../../../frontend/shared/bill-calculator');
const billingCalculator = require('./calculator');
const createBillingHandlers = require('../../departments/billing/engine/handlers');
const createInvoicesHandlers = require('../invoices/handlers');

function createInMemoryBillingDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      full_name TEXT,
      google_name TEXT,
      role TEXT
    );
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      active TEXT,
      phone TEXT,
      address TEXT,
      email TEXT,
      gstin TEXT,
      opening_balance REAL DEFAULT 0,
      current_due REAL DEFAULT 0,
      exclude_from_stats INTEGER DEFAULT 0,
      created_by_user_id INTEGER,
      ledger_token TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hsn_code TEXT,
      classification TEXT
    );
    CREATE TABLE variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      pack_size_value TEXT,
      pack_size_type TEXT
    );
    CREATE TABLE batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER,
      batch_no TEXT,
      exp_date TEXT,
      mrp REAL
    );
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      invoice_no TEXT NOT NULL,
      due_date TEXT,
      total_amount REAL,
      total_discount REAL,
      total_gst REAL,
      round_off REAL,
      grand_total REAL,
      previous_due REAL DEFAULT 0,
      notes TEXT,
      invoice_date TEXT,
      created_by_user_id INTEGER,
      last_edited_by_user_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      batch_id INTEGER,
      pack_value TEXT,
      pack_type TEXT,
      batch_no TEXT,
      exp_date TEXT,
      qty REAL,
      scheme TEXT,
      free INTEGER DEFAULT 0,
      mrp REAL,
      rate REAL,
      amount REAL,
      discount_1_percent REAL DEFAULT 0,
      discount_1_amount REAL DEFAULT 0,
      discount_2_percent REAL DEFAULT 0,
      discount_2_amount REAL DEFAULT 0,
      gst_percent REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      final_amount REAL DEFAULT 0,
      gst_reverse INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      type TEXT,
      reference_number TEXT,
      amount REAL DEFAULT 0,
      credit_amount REAL DEFAULT 0,
      payment_date TEXT,
      created_at TEXT
    );
    CREATE TABLE customer_item_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      product_id INTEGER,
      discount_1 REAL DEFAULT 0,
      discount_2 REAL DEFAULT 0,
      scheme TEXT,
      tax_percent REAL DEFAULT 0,
      gst_reverse INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(customer_id, product_id)
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      order_number TEXT,
      current_stage TEXT,
      status TEXT,
      bill_reference TEXT,
      total_amount REAL,
      order_date TEXT,
      delivery_date TEXT,
      lr_no TEXT,
      lr_date TEXT,
      transport TEXT,
      cases INTEGER,
      created_by_user_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT
    );
    CREATE TABLE ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER UNIQUE,
      current_due REAL DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      description TEXT,
      details TEXT,
      created_at TEXT
    );

    INSERT INTO users (id, username, full_name, role) VALUES (1, 'admin', 'Admin User', 'owner');
    INSERT INTO contacts (id, name, type, opening_balance) VALUES (1, 'Test Pharmacy', 'customer', 0);
    INSERT INTO ledger (customer_id, current_due) VALUES (1, 0);
    INSERT INTO products (id, name) VALUES (10, 'BR. SARIBADI SALASA'), (11, 'BR. BATAGAJANKUSH');
    INSERT INTO variants (id, product_id, pack_size_value, pack_size_type) VALUES (100, 10, '450.0', 'ML'), (101, 11, '8.0', 'GM');
    INSERT INTO batches (id, variant_id, batch_no, exp_date, mrp) VALUES
      (1000, 100, '03/011', '2028-01', 140),
      (1001, 101, '20/017', '2028-01', 700);
  `);
  return db;
}

function invokeHandler(handler, req) {
  let statusCode = 200;
  let body = null;
  const res = {
    setHeader() { },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };
  handler(req, res);
  return { statusCode, body };
}

test('BillCalculator does not apply 0.0477 twice when both mrp and already-deducted rate are provided', () => {
  // Fresh item input from New Bill
  const fresh = BillCalculator.calculateLineItem({
    mrp: 140,
    rate: 140,
    qty: 10,
    disc1: 30,
    disc2: 7,
    gstTotal: 5,
    gst_reverse: true
  });
  assert.equal(fresh.rate, 133.32);
  assert.equal(fresh.discounted_rate, 93.33);

  // Loaded item where DB rate already holds 133.32 while mrp is 140
  const reloaded = BillCalculator.calculateLineItem({
    mrp: 140,
    rate: 133.32,
    qty: 10,
    disc1: 30,
    disc2: 7,
    gstTotal: 5,
    gst_reverse: true
  });
  assert.equal(reloaded.rate, 133.32);
  assert.equal(reloaded.discounted_rate, 93.33);
  assert.equal(reloaded.final_amount, fresh.final_amount);

  // dbToFrontend restores base rate to MRP when gst_reverse is active
  const frontendObj = BillCalculator.dbToFrontend({
    id: 1,
    product_id: 10,
    product_name: 'BR. SARIBADI SALASA',
    qty: 10,
    mrp: 140,
    rate: 133.32,
    discount_1_percent: 30,
    discount_2_percent: 7,
    gst_percent: 5,
    gst_reverse: 1
  });
  assert.equal(frontendObj.mrp, 140);
  assert.equal(frontendObj.rate, 140);
  assert.equal(frontendObj.gst_reverse, true);

  // Backward compatibility: callers providing only rate without mrp keep 4.77% deduction
  const rateOnly = BillCalculator.calculateLineItem({
    rate: 100,
    qty: 10,
    disc1: 0,
    disc2: 0,
    gst_percent: 5,
    gst_reverse: true
  });
  assert.equal(rateOnly.rate, 95.23);
});

test('billing create -> get -> update -> get preserves exact MRP and Rate without compounding GST Reverse', () => {
  const db = createInMemoryBillingDb();
  try {
    const billingHandlers = createBillingHandlers(db);
    const invoiceHandlers = createInvoicesHandlers(db);
    const adminUser = { id: 1, role: 'owner' };

    const calc = billingCalculator.calculateBillItemsAndSummary(db, {
      customerId: 1,
      items: [
        {
          product_id: 10,
          variant_id: 100,
          batch_id: 1000,
          batch_no: '03/011',
          qty: 10,
          mrp: 140,
          rate: 133.32,
          disc1: 30,
          disc2: 7,
          gst_percent: 5,
          gst_reverse: true
        }
      ]
    });
    assert.equal(calc.items[0].mrp, 140);
    assert.equal(calc.items[0].rate, 133.32);
    assert.equal(calc.items[0].discounted_rate, 93.33);

    // 1. Create Bill (POST /api/billing)
    const created = invokeHandler(billingHandlers.createBill, {
      user: adminUser,
      body: {
        customer_id: 1,
        invoice_date: '2026-11-11T10:00',
        products: [
          {
            product_id: 10,
            variant_id: 100,
            batch_id: 1000,
            batch_no: '03/011',
            qty: 10,
            mrp: 140,
            rate: 140,
            discount_1_percent: 30,
            discount_2_percent: 7,
            gst_percent: 5,
            gst_reverse: true
          },
          {
            product_id: 11,
            variant_id: 101,
            batch_id: 1001,
            batch_no: '20/017',
            qty: 10,
            mrp: 700,
            rate: 700,
            discount_1_percent: 20,
            discount_2_percent: 7,
            gst_percent: 5,
            gst_reverse: true
          }
        ]
      }
    });
    assert.equal(created.statusCode, 201);
    const invoiceId = created.body.id;

    // 2. Fetch via GET /api/billing/invoices/invoices/:id (Edit flow) and GET /api/billing
    const fetchedInvoice = invokeHandler(invoiceHandlers.getInvoice, {
      params: { id: String(invoiceId) },
      user: adminUser
    });
    assert.equal(fetchedInvoice.statusCode, 200);
    assert.equal(fetchedInvoice.body.items[0].mrp, 140);
    assert.equal(fetchedInvoice.body.items[0].rate, 133.32);
    assert.equal(fetchedInvoice.body.items[1].mrp, 700);
    assert.equal(fetchedInvoice.body.items[1].rate, 666.61);

    const listedBills = invokeHandler(billingHandlers.getBills, {
      query: {},
      user: adminUser
    });
    assert.equal(listedBills.statusCode, 200);
    assert.equal(listedBills.body.data[0].items[0].mrp, 140);
    assert.equal(listedBills.body.data[0].items[1].mrp, 700);

    // 3. Re-save in Edit Mode (PUT /api/billing/:id) sending DB rate alongside MRP
    const updated = invokeHandler(billingHandlers.updateBill, {
      params: { id: String(invoiceId) },
      user: adminUser,
      body: {
        customer_id: 1,
        invoice_date: '2026-11-11T10:00',
        products: fetchedInvoice.body.items.map(item => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          batch_id: item.batch_id,
          batch_no: item.batch_no,
          qty: item.quantity,
          mrp: item.mrp,
          rate: item.rate,
          discount_1_percent: item.discount_1,
          discount_2_percent: item.discount_2,
          gst_percent: item.gst_percent,
          gst_reverse: Boolean(item.gst_reverse)
        }))
      }
    });
    assert.equal(updated.statusCode, 200);

    // 4. Verify MRP & Rate did NOT decay on edit save via both GET endpoints
    const refetched = invokeHandler(invoiceHandlers.getInvoice, {
      params: { id: String(invoiceId) },
      user: adminUser
    });
    assert.equal(refetched.body.items[0].mrp, 140);
    assert.equal(refetched.body.items[0].rate, 133.32);
    assert.equal(refetched.body.items[1].mrp, 700);
    assert.equal(refetched.body.items[1].rate, 666.61);

    const refetchedBill = invokeHandler(billingHandlers.getBill, {
      params: { id: String(invoiceId) },
      user: adminUser
    });
    assert.equal(refetchedBill.statusCode, 200);
    assert.equal(refetchedBill.body.data.items[0].mrp, 140);
    assert.equal(refetchedBill.body.data.items[0].rate, 133.32);
    assert.equal(refetchedBill.body.data.items[1].mrp, 700);
    assert.equal(refetchedBill.body.data.items[1].rate, 666.61);
  } finally {
    db.close();
  }
});