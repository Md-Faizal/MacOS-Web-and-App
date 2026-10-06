const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { encryptInvoiceLedgerReference } = require('../billing/invoice-ledger-ref');
const createOrdersHandlers = require('./handlers');

const SECRET = 'test-only-stable-secret-that-is-long-enough';

function createResponse() {
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

function createTestDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE activity_log (
      user_id TEXT, platform TEXT, module TEXT, action TEXT, resource_type TEXT,
      resource_id TEXT, resource_name TEXT, metadata TEXT, ip_address TEXT,
      user_agent TEXT, created_at TEXT
    );
    CREATE TABLE contacts (id INTEGER PRIMARY KEY, ledger_token TEXT, created_by_user_id TEXT);
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY, customer_id INTEGER, invoice_no TEXT,
      invoice_date TEXT, created_at TEXT, grand_total REAL, total_amount REAL
    );
    INSERT INTO contacts (id, ledger_token) VALUES (42, 'ledger-secret');
    INSERT INTO invoices (id, customer_id, invoice_no, grand_total)
      VALUES (9876, 42, 'INV-9876', 125.50);
  `);
  return db;
}

test('resolves an encrypted invoice reference only for its customer and ledger token', () => {
  const priorSecret = process.env.INVOICE_LEDGER_QR_SECRET;
  process.env.INVOICE_LEDGER_QR_SECRET = SECRET;
  const db = createTestDatabase();
  try {
    const resolveInvoiceQr = createOrdersHandlers(db).resolveInvoiceQr;
    const reference = encryptInvoiceLedgerReference(42, 9876, SECRET);

    const validResponse = createResponse();
    resolveInvoiceQr({
      body: { reference, ledgerToken: 'ledger-secret', customerId: 42 },
      user: { role: 'owner' }
    }, validResponse);
    assert.equal(validResponse.statusCode, 200);
    assert.deepEqual(validResponse.body.invoice, {
      id: 9876,
      invoice_no: 'INV-9876',
      invoice_date: null,
      grand_total: 125.5
    });

    const wrongTokenResponse = createResponse();
    resolveInvoiceQr({
      body: { reference, ledgerToken: 'wrong-token', customerId: 42 },
      user: { role: 'owner' }
    }, wrongTokenResponse);
    assert.equal(wrongTokenResponse.statusCode, 404);

    const wrongCustomerResponse = createResponse();
    resolveInvoiceQr({
      body: { reference, ledgerToken: 'ledger-secret', customerId: 43 },
      user: { role: 'owner' }
    }, wrongCustomerResponse);
    assert.equal(wrongCustomerResponse.statusCode, 404);
  } finally {
    db.close();
    if (priorSecret === undefined) delete process.env.INVOICE_LEDGER_QR_SECRET;
    else process.env.INVOICE_LEDGER_QR_SECRET = priorSecret;
  }
});
