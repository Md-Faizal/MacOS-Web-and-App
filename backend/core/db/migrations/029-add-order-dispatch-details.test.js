const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { up } = require('./029-add-order-dispatch-details');

test('adds order dispatch columns to existing databases and is idempotent', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY)');
    up(db);
    up(db);

    const columns = db.prepare('PRAGMA table_info(orders)').all();
    const names = columns.map(column => column.name);
    assert.ok(names.includes('lr_no'));
    assert.ok(names.includes('lr_date'));
    assert.ok(names.includes('transport'));
    assert.ok(names.includes('cases'));
    assert.equal(columns.filter(column => column.name === 'lr_no').length, 1);

    db.prepare('INSERT INTO orders (id) VALUES (1)').run();
    assert.equal(db.prepare('SELECT cases FROM orders WHERE id = 1').get().cases, 1);
  } finally {
    db.close();
  }
});
