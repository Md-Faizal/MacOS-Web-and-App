const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const createHandlers = require('./handlers');

test('contacts shipment endpoints: create, list, and public track lookup', async () => {
  const db = new Database(':memory:');
  
  // Setup minimal contacts schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.prepare(`
    INSERT INTO contacts (id, name, phone, address) 
    VALUES (1, 'Maa Tarini Medical Store', '9437123456', 'Main Road, Aska, 761110')
  `).run();

  const handlers = createHandlers(db);

  // 1. Test createShipment handler
  let createResData = null;
  const mockReqCreate = {
    params: { id: '1' },
    body: {
      contact_name: 'Maa Tarini Medical Store',
      recipient_address: 'Main Road, Aska, Ganjam',
      recipient_phone: '9437123456',
      recipient_pincode: '761110',
      sender_address: 'Beside Sai Hospital Annex, Mangalabagh, Cuttack - 753001',
      sender_phone: '7749089400',
      boxes_count: 2,
      route_note: 'Jagannath Bus / Berhampur Stand'
    }
  };
  const mockResCreate = {
    json: (data) => { createResData = data; return mockResCreate; },
    status: (code) => mockResCreate
  };

  handlers.createShipment(mockReqCreate, mockResCreate);
  assert.ok(createResData);
  assert.equal(createResData.success, true);
  assert.ok(createResData.shipment.shipment_uid.startsWith('SHIP-'));
  assert.equal(createResData.shipment.contact_name, 'Maa Tarini Medical Store');
  assert.equal(createResData.shipment.boxes_count, 2);
  assert.equal(createResData.shipment.route_note, 'Jagannath Bus / Berhampur Stand');
  assert.ok(createResData.tracking_url.includes('/track/shipment?id=SHIP-'));

  const generatedUid = createResData.shipment.shipment_uid;

  // 2. Test getContactShipments handler
  let listResData = null;
  const mockReqList = { params: { id: '1' } };
  const mockResList = {
    json: (data) => { listResData = data; return mockResList; },
    status: (code) => mockResList
  };

  handlers.getContactShipments(mockReqList, mockResList);
  assert.ok(listResData);
  assert.equal(listResData.success, true);
  assert.equal(listResData.shipments.length, 1);
  assert.equal(listResData.shipments[0].shipment_uid, generatedUid);

  // 3. Test getShipmentPublic handler
  let publicResData = null;
  const mockReqPublic = { params: { uid: generatedUid } };
  const mockResPublic = {
    json: (data) => { publicResData = data; return mockResPublic; },
    status: (code) => mockResPublic
  };

  handlers.getShipmentPublic(mockReqPublic, mockResPublic);
  assert.ok(publicResData);
  assert.equal(publicResData.success, true);
  assert.equal(publicResData.shipment.contact_name, 'Maa Tarini Medical Store');
  assert.equal(publicResData.shipment.recipient_pincode, '761110');
  assert.equal(publicResData.shipment.sender_phone, '7749089400');

  db.close();
});
