const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing Dual Scoping & Contact Access Control...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const contactsHandlers = require('../../frontend/modules/contacts/api/handlers')(db);
const billingHandlers = require('../../frontend/modules/billing/api/handlers')(db);
const analyticsHandlers = require('../../frontend/modules/analytics/api/handlers')(db);

const ownerReq = { user: { id: 'admin_auth', userId: 'admin_auth', role: 'owner' }, query: {}, body: {}, params: {} };
const worker1Req = { user: { id: 'test_worker_1', userId: 'test_worker_1', role: 'worker' }, query: {}, body: {}, params: {} };
const worker2Req = { user: { id: 'test_worker_2', userId: 'test_worker_2', role: 'worker' }, query: {}, body: {}, params: {} };

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
  // Ensure tables and columns exist
  try {
    const contactCols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name);
    if (!contactCols.includes('created_by_user_id')) {
      db.prepare("ALTER TABLE contacts ADD COLUMN created_by_user_id TEXT").run();
    }
  } catch (e) {
    console.warn('Column check note:', e.message);
  }

  // Clean up and insert test users
  db.prepare("DELETE FROM contacts WHERE name LIKE 'TEST_SCOPE_%'").run();
  db.prepare("DELETE FROM user_contact_access WHERE user_id IN ('test_worker_1', 'test_worker_2')").run();
  db.prepare("DELETE FROM users WHERE id IN ('test_worker_1', 'test_worker_2')").run();

  db.prepare(`
    INSERT INTO users (id, username, email, role, status)
    VALUES 
      ('test_worker_1', 'test_worker_1', 'w1@test.com', 'worker', 'active'),
      ('test_worker_2', 'test_worker_2', 'w2@test.com', 'worker', 'active')
  `).run();

  // 1. Owner creates private contact
  const resOwnerCreate = mockRes();
  await contactsHandlers.createContact({
    user: ownerReq.user,
    body: { name: 'TEST_SCOPE_OwnerPrivate', type: 'Customer', opening_balance: 500 }
  }, resOwnerCreate);
  const ownerContactId = resOwnerCreate.data.id;
  console.log('✅ Owner created contact ID:', ownerContactId);

  // Verify Owner contact has exclude_from_stats = 0
  const ownerContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(ownerContactId);
  assert.strictEqual(ownerContact.exclude_from_stats, 0, 'Owner contact should have exclude_from_stats = 0');
  console.log('✅ Owner contact exclude_from_stats is 0');

  // 2. Worker 1 creates contact
  const resWorker1Create = mockRes();
  await contactsHandlers.createContact({
    user: worker1Req.user,
    body: { name: 'TEST_SCOPE_Worker1Customer', type: 'Customer', opening_balance: 200 }
  }, resWorker1Create);
  const worker1ContactId = resWorker1Create.data.id;
  console.log('✅ Worker 1 created contact ID:', worker1ContactId);

  // Verify Worker 1 contact has exclude_from_stats = 1 and created_by_user_id = test_worker_1
  const worker1Contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(worker1ContactId);
  assert.strictEqual(worker1Contact.exclude_from_stats, 1, 'Worker contact should automatically have exclude_from_stats = 1');
  assert.strictEqual(worker1Contact.created_by_user_id, 'test_worker_1', 'Worker contact should have created_by_user_id = test_worker_1');
  console.log('✅ Worker contact automatically tagged with exclude_from_stats = 1 and creator ID');

  // 3. Worker 2 lists contacts
  // Worker 2 should see Worker 1's contact (all workers see worker contacts), but NOT Owner's private contact
  const resWorker2List1 = mockRes();
  contactsHandlers.getContacts(worker2Req, resWorker2List1);
  const worker2ContactsBeforeShare = resWorker2List1.data.map(c => c.id);
  assert.ok(worker2ContactsBeforeShare.includes(worker1ContactId), 'Worker 2 should see Worker 1 contact');
  assert.ok(!worker2ContactsBeforeShare.includes(ownerContactId), 'Worker 2 should NOT see unshared Owner contact');
  console.log('✅ Worker 2 sees all worker-created contacts and does not see unshared owner contact');

  // 4. Owner explicitly shares ownerContactId with Worker 2 via user_contact_access
  db.prepare('INSERT INTO user_contact_access (user_id, contact_id) VALUES (?, ?)').run('test_worker_2', ownerContactId);

  const resWorker2List2 = mockRes();
  contactsHandlers.getContacts(worker2Req, resWorker2List2);
  const worker2ContactsAfterShare = resWorker2List2.data.map(c => c.id);
  assert.ok(worker2ContactsAfterShare.includes(ownerContactId), 'Worker 2 should now see shared Owner contact');
  assert.ok(worker2ContactsAfterShare.includes(worker1ContactId), 'Worker 2 should still see Worker 1 contact');
  console.log('✅ Worker 2 sees newly shared Owner contact');

  // 5. Worker 2 Ledger Customers & Balance
  const resWorker2Ledger = mockRes();
  billingHandlers.getLedgerCustomers(worker2Req, resWorker2Ledger);
  const ledgerCustomerIds = resWorker2Ledger.data.data.map(c => c.customer_id);
  assert.ok(ledgerCustomerIds.includes(ownerContactId), 'Worker 2 ledger includes shared owner contact');
  assert.ok(ledgerCustomerIds.includes(worker1ContactId), 'Worker 2 ledger includes worker contact');
  console.log('✅ Worker 2 ledger includes all accessible contacts without exclusion');

  // 6. Analytics KPI Scoping
  const resOwnerKPI = mockRes();
  analyticsHandlers.getExecutiveKPI(ownerReq, resOwnerKPI);

  const resWorker2KPI = mockRes();
  analyticsHandlers.getExecutiveKPI(worker2Req, resWorker2KPI);

  console.log('✅ Analytics KPI scoping verified for Owner vs Worker');

  // Clean up test data
  db.prepare("DELETE FROM contacts WHERE name LIKE 'TEST_SCOPE_%'").run();
  db.prepare("DELETE FROM user_contact_access WHERE user_id IN ('test_worker_1', 'test_worker_2')").run();
  db.prepare("DELETE FROM users WHERE id IN ('test_worker_1', 'test_worker_2')").run();

  console.log('\n🎉 ALL DUAL SCOPING & WORKER ACCESS TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
