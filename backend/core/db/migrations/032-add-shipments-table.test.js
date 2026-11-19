const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { up } = require('./032-add-shipments-table');

test('creates shipments table and is idempotent', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare("INSERT INTO contacts (id, name) VALUES (1, 'Test Chemist')").run();
    up(db);
    // Running again should be safe and idempotent
    up(db);

    const columns = db.prepare('PRAGMA table_info(shipments)').all();
    const names = columns.map(c => c.name);
    assert.ok(names.includes('id'));
    assert.ok(names.includes('shipment_uid'));
    assert.ok(names.includes('contact_id'));
    assert.ok(names.includes('contact_name'));
    assert.ok(names.includes('recipient_address'));
    assert.ok(names.includes('recipient_pincode'));
    assert.ok(names.includes('sender_address'));
    assert.ok(names.includes('boxes_count'));
    assert.ok(names.includes('route_note'));
    assert.ok(names.includes('status'));

    db.prepare(`
      INSERT INTO shipments (
        shipment_uid, contact_id, contact_name, recipient_address,
        recipient_pincode, sender_address, boxes_count, route_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('SHIP-2611-0001', 1, 'Test Chemist', 'Main Road, Aska', '761110', 'Cuttack', 2, 'Jagannath Bus');

    const row = db.prepare('SELECT * FROM shipments WHERE shipment_uid = ?').get('SHIP-2611-0001');
    assert.equal(row.contact_name, 'Test Chemist');
    assert.equal(row.recipient_pincode, '761110');
    assert.equal(row.boxes_count, 2);
    assert.equal(row.route_note, 'Jagannath Bus');
    assert.equal(row.status, 'GENERATED');
  } finally {
    db.close();
  }
});
