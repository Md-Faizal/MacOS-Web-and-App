const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const createOrderHandlers = require('./handlers');

function createTestDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      role TEXT,
      full_name TEXT,
      username TEXT,
      google_name TEXT
    );
    CREATE TABLE contacts (id INTEGER PRIMARY KEY, created_by_user_id INTEGER);
    CREATE TABLE user_contact_access (contact_id INTEGER, user_id INTEGER);
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT,
      customer_id INTEGER,
      current_stage TEXT,
      order_date TEXT,
      order_notes TEXT,
      qc_date TEXT,
      qc_notes TEXT,
      delivery_notes TEXT,
      checklist_items TEXT,
      delivery_date TEXT,
      bill_reference TEXT,
      lr_no TEXT,
      lr_date TEXT,
      transport TEXT,
      cases INTEGER DEFAULT 1,
      total_amount REAL,
      status TEXT,
      created_by_user_id INTEGER,
      last_edited_by_user_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      variant_id INTEGER,
      batch_id INTEGER,
      quantity REAL,
      received_quantity REAL,
      unit_price REAL,
      line_total REAL
    );
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE variants (id INTEGER PRIMARY KEY, pack_size_value TEXT, pack_size_type TEXT);
    CREATE TABLE batches (id INTEGER PRIMARY KEY, batch_no TEXT, mrp REAL, exp_date TEXT);
    CREATE TABLE activity_log (
      user_id TEXT, platform TEXT, module TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, resource_name TEXT, metadata TEXT, ip_address TEXT,
      user_agent TEXT, created_at TEXT
    );
  `);
  return db;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function request(body, id) {
  return {
    body,
    params: id === undefined ? {} : { id: String(id) },
    user: { id: 1, role: 'owner' },
    headers: {}
  };
}

test('persists dispatch details and prevents duplicate invoice references', async () => {
  const db = createTestDatabase();
  try {
    const handlers = createOrderHandlers(db);
    const createResponse = responseRecorder();
    await handlers.createOrder(request({
      customer_id: 7,
      order_number: 'ORD-TEST-1',
      lr_no: 'LR-123',
      lr_date: '2025-03-12',
      transport: 'Sample Transport',
      cases: 4,
      items: [{ product_id: 8, qty: 2, price: 15 }]
    }), createResponse);

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createResponse.body.lr_no, 'LR-123');
    assert.equal(createResponse.body.lr_date, '2025-03-12');
    assert.equal(createResponse.body.transport, 'Sample Transport');
    assert.equal(createResponse.body.cases, 4);

    const linkResponse = responseRecorder();
    await handlers.updateOrder(request({ bill_reference: 'INV-TEST-1' }, createResponse.body.id), linkResponse);
    assert.equal(linkResponse.body.bill_reference, 'INV-TEST-1');

    const secondOrderResponse = responseRecorder();
    await handlers.createOrder(request({
      customer_id: 7,
      order_number: 'ORD-TEST-2',
      items: [{ product_id: 8, qty: 1, price: 15 }]
    }), secondOrderResponse);
    assert.equal(secondOrderResponse.statusCode, 201);

    const duplicateLinkResponse = responseRecorder();
    await handlers.updateOrder(
      request({ bill_reference: ' inv-test-1 ' }, secondOrderResponse.body.id),
      duplicateLinkResponse
    );
    assert.equal(duplicateLinkResponse.statusCode, 409);
    assert.match(duplicateLinkResponse.body.error, /already linked/);

    const persistedOrder = db.prepare('SELECT lr_no, lr_date, transport, cases FROM orders WHERE id = ?')
      .get(createResponse.body.id);
    assert.deepEqual(persistedOrder, {
      lr_no: 'LR-123',
      lr_date: '2025-03-12',
      transport: 'Sample Transport',
      cases: 4
    });

    const defaultCasesOrder = responseRecorder();
    await handlers.createOrder(request({
      customer_id: 7,
      order_number: 'ORD-TEST-DEFAULT-CASES',
      items: [{ product_id: 8, qty: 1, price: 15 }]
    }), defaultCasesOrder);
    assert.equal(defaultCasesOrder.statusCode, 201);
    assert.equal(defaultCasesOrder.body.cases, 1);
  } finally {
    db.close();
  }
});
