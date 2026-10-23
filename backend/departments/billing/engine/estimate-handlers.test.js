const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const createBillingHandlers = require('./handlers');
const createBillingRoutes = require('./routes');

function createTestDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY, name TEXT, phone TEXT, address TEXT, gstin TEXT,
      licence_no TEXT, pan TEXT, created_by_user_id TEXT
    );
    CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT);
    CREATE TABLE user_contact_access (user_id TEXT, contact_id INTEGER, exclude_from_stats INTEGER);
    CREATE TABLE estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER, party_name TEXT NOT NULL, phone TEXT, address TEXT, gstin TEXT,
      licence_no TEXT, pan TEXT, estimate_date DATE, valid_until DATE, subject TEXT,
      products_json TEXT NOT NULL, terms_json TEXT NOT NULL DEFAULT '[]',
      total_amount REAL DEFAULT 0, total_discount REAL DEFAULT 0,
      total_sgst REAL DEFAULT 0, total_cgst REAL DEFAULT 0, round_off REAL DEFAULT 0,
      grand_total REAL DEFAULT 0, duplex_print INTEGER DEFAULT 1, created_by_user_id TEXT,
      last_edited_by_user_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES contacts(id) ON DELETE SET NULL
    );
    CREATE TABLE activity_log (
      user_id TEXT, platform TEXT, module TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, resource_name TEXT, metadata TEXT, ip_address TEXT,
      user_agent TEXT, created_at DATETIME
    );
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, total REAL);
    CREATE TABLE ledger (id INTEGER PRIMARY KEY, customer_id INTEGER, current_due REAL);
    CREATE TABLE products (id INTEGER PRIMARY KEY, stock INTEGER);
    CREATE TABLE batches (id INTEGER PRIMARY KEY, units_sold INTEGER);
    INSERT INTO contacts (id, name, phone, address, gstin, licence_no, pan)
    VALUES (7, 'Catalog Customer', '1234567890', 'Database Address', 'GST-DB', 'DL-DB', 'PAN-DB');
    INSERT INTO products (id, stock) VALUES (1, 25);
    INSERT INTO batches (id, units_sold) VALUES (1, 4);
  `);
  return db;
}

function invoke(handler, { body = {}, params = {}, query = {}, user = { id: 'owner-1', role: 'owner' } } = {}) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    }
  };
  handler({ body, params, query, user }, res);
  return result;
}

test('estimate handlers persist, update, list and delete without billing side effects', () => {
  const db = createTestDatabase();
  try {
    const handlers = createBillingHandlers(db);
    const created = invoke(handlers.createEstimate, {
      body: {
        estimate_no: 'EST-TEST-001',
        customer_id: 7,
        party_name: 'Forged Name',
        phone: 'forged',
        products: [{ product_id: 1, name: 'Catalog Product', qty: 2, rate: 50 }],
        grand_total: 100
      }
    });

    assert.equal(created.statusCode, 201);
    assert.equal(created.body.estimate.party_name, 'Catalog Customer');
    assert.equal(created.body.estimate.phone, '1234567890');
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + 7);
    assert.equal(
      created.body.estimate.valid_until,
      `${expectedExpiry.getFullYear()}-${String(expectedExpiry.getMonth() + 1).padStart(2, '0')}-${String(expectedExpiry.getDate()).padStart(2, '0')}`
    );
    assert.equal(created.body.estimate.address, 'Database Address');
    assert.equal(created.body.estimate.products[0].product_id, 1);
    assert.equal(created.body.estimate.terms.length, 3);

    const updated = invoke(handlers.updateEstimate, {
      params: { id: created.body.estimate.id },
      body: {
        estimate_no: 'EST-TEST-001',
        customer_id: 7,
        party_name: 'Catalog Customer',
        products: [{ product_id: 1, name: 'Catalog Product', qty: 3, rate: 50 }],
        grand_total: 150
      }
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.estimate.products[0].qty, 3);
    assert.equal(updated.body.estimate.terms.length, 3);
    assert.equal(invoke(handlers.getEstimates).body.length, 1);

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count, 0);
    assert.equal(db.prepare('SELECT stock FROM products WHERE id = 1').get().stock, 25);
    assert.equal(db.prepare('SELECT units_sold FROM batches WHERE id = 1').get().units_sold, 4);

    const deleted = invoke(handlers.deleteEstimate, { params: { id: created.body.estimate.id } });
    assert.equal(deleted.statusCode, 200);
    assert.equal(invoke(handlers.getEstimates).body.length, 0);
  } finally {
    db.close();
  }
});

test('worker estimate access is limited to accessible registered customers and own walk-ins', () => {
  const db = createTestDatabase();
  try {
    const handlers = createBillingHandlers(db);
    const ownerCreated = invoke(handlers.createEstimate, {
      body: {
        estimate_no: 'EST-REGISTERED-001',
        customer_id: 7,
        products: [{ product_id: 1, name: 'Catalog Product', qty: 1, rate: 50 }]
      }
    }).body.estimate;

    const denied = invoke(handlers.getEstimate, {
      params: { id: ownerCreated.id },
      user: { id: 'worker-1', role: 'worker' }
    });
    assert.equal(denied.statusCode, 403);
    const deniedValidityChange = invoke(handlers.updateEstimateValidity, {
      params: { id: ownerCreated.id },
      body: { valid_until: '2026-12-31' },
      user: { id: 'worker-1', role: 'worker' }
    });
    assert.equal(deniedValidityChange.statusCode, 403);

    db.prepare('INSERT INTO user_contact_access (user_id, contact_id) VALUES (?, ?)').run('worker-2', 7);
    const allowed = invoke(handlers.getEstimate, {
      params: { id: ownerCreated.id },
      user: { id: 'worker-2', role: 'worker' }
    });
    assert.equal(allowed.statusCode, 200);

    const workerCreated = invoke(handlers.createEstimate, {
      user: { id: 'worker-1', role: 'worker' },
      body: {
        estimate_no: 'EST-WALKIN-001',
        party_name: 'Walk-in Customer',
        products: [{ product_id: 1, name: 'Catalog Product', qty: 1, rate: 50 }]
      }
    });
    assert.equal(workerCreated.statusCode, 201);
    assert.equal(invoke(handlers.getEstimates, {
      user: { id: 'worker-1', role: 'worker' }
    }).body.length, 1);
  } finally {
    db.close();
  }
});

test('estimate handlers reject missing products and inaccessible customer references', () => {
  const db = createTestDatabase();
  try {
    const handlers = createBillingHandlers(db);
    const missingItems = invoke(handlers.createEstimate, {
      body: { estimate_no: 'EST-INVALID-001', party_name: 'Customer', products: [] }
    });
    assert.equal(missingItems.statusCode, 400);

    const deniedCustomer = invoke(handlers.createEstimate, {
      user: { id: 'worker-1', role: 'worker' },
      body: {
        estimate_no: 'EST-INVALID-002',
        customer_id: 7,
        products: [{ product_id: 1, name: 'Catalog Product', qty: 1, rate: 50 }]
      }
    });
    assert.equal(deniedCustomer.statusCode, 403);
  } finally {
    db.close();
  }
});

test('estimate validity can be extended or expired without changing estimate details', () => {
  const db = createTestDatabase();
  try {
    const handlers = createBillingHandlers(db);
    const created = invoke(handlers.createEstimate, {
      body: {
        estimate_no: 'EST-VALIDITY-001',
        party_name: 'Walk-in Customer',
        estimate_date: '2026-10-01',
        valid_until: '2026-10-31',
        subject: 'Original subject',
        products: [{ product_id: 1, name: 'Catalog Product', qty: 1, rate: 50 }]
      }
    }).body.estimate;

    const extended = invoke(handlers.updateEstimateValidity, {
      params: { id: created.id },
      body: { valid_until: '2026-11-30' }
    });
    assert.equal(extended.statusCode, 200);
    assert.equal(extended.body.estimate.valid_until, '2026-11-30');
    assert.equal(extended.body.estimate.subject, 'Original subject');
    assert.equal(extended.body.estimate.products[0].qty, 1);

    const expired = invoke(handlers.updateEstimateValidity, {
      params: { id: created.id },
      body: { valid_until: '2026-10-22' }
    });
    assert.equal(expired.statusCode, 200);
    assert.equal(expired.body.estimate.valid_until, '2026-10-22');

    const invalidDate = invoke(handlers.updateEstimateValidity, {
      params: { id: created.id },
      body: { valid_until: '2026-02-30' }
    });
    assert.equal(invalidDate.statusCode, 400);
    assert.equal(invoke(handlers.getEstimate, { params: { id: created.id } }).body.valid_until, '2026-10-22');
  } finally {
    db.close();
  }
});

test('estimate numbers are generated when omitted and duplicate numbers return a conflict', () => {
  const db = createTestDatabase();
  try {
    const handlers = createBillingHandlers(db);
    const year = String(new Date().getFullYear()).slice(-2);
    const estimateDate = `${new Date().getFullYear()}-10-23`;
    const payload = {
      party_name: 'Walk-in Customer',
      estimate_date: estimateDate,
      products: [{ product_id: 1, name: 'Catalog Product', qty: 1, rate: 50 }]
    };
    const nextRef = invoke(handlers.getNextEstimateNumber, {
      query: { estimate_date: estimateDate }
    });
    assert.equal(nextRef.body.estimate_no, `EST-${year}0001`);
    const created = invoke(handlers.createEstimate, { body: payload });
    assert.equal(created.statusCode, 201);
    assert.match(created.body.estimate.estimate_no, /^EST-\d{6}$/);
    assert.equal(created.body.estimate.estimate_no, nextRef.body.estimate_no);
    assert.equal(invoke(handlers.getNextEstimateNumber, {
      query: { estimate_date: estimateDate }
    }).body.estimate_no, `EST-${year}0002`);

    const duplicate = invoke(handlers.createEstimate, {
      body: { ...payload, estimate_no: created.body.estimate.estimate_no }
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.body.error, 'Estimate number already exists.');
  } finally {
    db.close();
  }
});

test('estimate routes are registered before the generic bill ID route', () => {
  const registered = [];
  const router = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [
    method,
    (routePath, handler) => registered.push({ method, routePath, handler })
  ]));
  const handlers = new Proxy({}, { get: () => () => {} });
  createBillingRoutes(router, handlers);

  const estimateRoutes = registered.filter(route => route.routePath.startsWith('/estimates'));
  assert.deepEqual(estimateRoutes.map(({ method, routePath }) => [method, routePath]), [
    ['get', '/estimates/next-number'],
    ['get', '/estimates'],
    ['post', '/estimates'],
    ['get', '/estimates/:id'],
    ['patch', '/estimates/:id/validity'],
    ['put', '/estimates/:id'],
    ['delete', '/estimates/:id']
  ]);
  assert.ok(registered.findIndex(route => route.method === 'get' && route.routePath === '/estimates') <
    registered.findIndex(route => route.method === 'get' && route.routePath === '/:id'));
});
