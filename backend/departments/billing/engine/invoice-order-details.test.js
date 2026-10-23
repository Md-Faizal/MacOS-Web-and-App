const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { findLinkedOrderDetails } = require('./invoice-order-details');

test('loads dispatch data only from the matching customer order linked to the invoice', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT,
        customer_id INTEGER,
        order_date TEXT,
        bill_reference TEXT,
        lr_no TEXT,
        lr_date TEXT,
        transport TEXT,
        cases INTEGER,
        updated_at TEXT
      );
      INSERT INTO orders
        (id, order_number, customer_id, order_date, bill_reference, lr_no, lr_date, transport, cases, updated_at)
      VALUES
        (1, 'ORD-OTHER-CUSTOMER', 2, '2025-02-10', 'INV-25-1', 'WRONG', NULL, NULL, 0, '2025-02-12'),
        (2, 'ORD-LINKED', 1, '2025-02-11', ' inv-25-1 ', 'LR-51', '2025-02-12', 'Sample Transport', 3, '2025-02-13')
    `);

    assert.deepEqual(findLinkedOrderDetails(db, 1, 'INV-25-1'), {
      order_no: 'ORD-LINKED',
      order_date: '2025-02-11',
      lr_no: 'LR-51',
      lr_date: '2025-02-12',
      transport: 'Sample Transport',
      cases: 3
    });
    assert.equal(findLinkedOrderDetails(db, 1, 'INV-NOT-LINKED'), null);
  } finally {
    db.close();
  }
});
