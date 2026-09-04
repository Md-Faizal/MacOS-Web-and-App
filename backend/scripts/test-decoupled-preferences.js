/**
 * Verification test for decoupled Exclude from Stats & Duplex Printing preferences
 * Run with: node backend/scripts/test-decoupled-preferences.js
 */
const DatabaseManager = require('../core/db/database-manager');
const createContactsHandlers = require('../../frontend/modules/contacts/api/handlers');

const db = DatabaseManager.initialize();
const contactsHandlers = createContactsHandlers(db);

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

console.log('--- Testing Database Columns ---');
const ucaColumns = db.prepare('PRAGMA table_info(user_contact_access)').all().map(c => c.name);
assert(ucaColumns.includes('exclude_from_stats'), 'user_contact_access has exclude_from_stats column');
assert(ucaColumns.includes('disable_duplex_export'), 'user_contact_access has disable_duplex_export column');

console.log('--- Testing Contact Creation & Scoping ---');
// Setup test users if needed
let adminUser = db.prepare("SELECT id, role FROM users WHERE role = 'owner' LIMIT 1").get();
if (!adminUser) {
  adminUser = { id: 'admin_test', role: 'owner' };
}
let workerUser = db.prepare("SELECT id, role FROM users WHERE role = 'worker' LIMIT 1").get();
if (!workerUser) {
  db.prepare("INSERT OR IGNORE INTO users (id, username, email, role, status) VALUES ('worker_test_1', 'workertest', 'worker@test.com', 'worker', 'active')").run();
  workerUser = { id: 'worker_test_1', role: 'worker' };
}

// 1. Worker creates a contact
const mockReqWorker = {
  user: { id: workerUser.id, role: 'worker' },
  body: {
    name: `Worker Test Contact ${Date.now()}`,
    phone: '9999999999',
    exclude_from_stats: 0,
    disable_duplex_export: 0
  }
};
let createdContactId = null;
const mockResWorker = {
  status: (code) => ({
    json: (data) => {
      createdContactId = data.id;
    }
  })
};

contactsHandlers.createContact(mockReqWorker, mockResWorker);
assert(createdContactId !== null, 'Worker successfully created contact');

// Check Admin master view of this contact
const adminContact = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM contacts WHERE id = ?').get(createdContactId);
assert(adminContact.exclude_from_stats === 1, 'Worker-created contact is EXCLUDED by default for Admin');
assert(adminContact.disable_duplex_export === 1, 'Worker-created contact has Duplex OFF by default for Admin');

// Check Worker's own view of this contact in user_contact_access
const workerAccess = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM user_contact_access WHERE user_id = ? AND contact_id = ?').get(workerUser.id, createdContactId);
assert(workerAccess.exclude_from_stats === 0, 'Worker-created contact is INCLUDED for creating Worker');
assert(workerAccess.disable_duplex_export === 0, 'Worker-created contact has Duplex ON for creating Worker');

// 2. Admin creates a contact
const mockReqAdmin = {
  user: { id: adminUser.id, role: 'owner' },
  body: {
    name: `Admin Test Contact ${Date.now()}`,
    phone: '8888888888',
    exclude_from_stats: 0,
    disable_duplex_export: 0
  }
};
let adminCreatedId = null;
const mockResAdmin = {
  status: (code) => ({
    json: (data) => {
      adminCreatedId = data.id;
    }
  })
};

contactsHandlers.createContact(mockReqAdmin, mockResAdmin);
const adminNewContact = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM contacts WHERE id = ?').get(adminCreatedId);
assert(adminNewContact.exclude_from_stats === 0, 'Admin-created contact uses Admin choice (Included)');
assert(adminNewContact.disable_duplex_export === 0, 'Admin-created contact uses Admin choice (Duplex ON)');

// 3. Admin shares this contact with Worker via contact access endpoint
const mockReqShare = {
  user: { id: adminUser.id, role: 'owner' },
  params: { id: adminCreatedId },
  body: { userIds: [workerUser.id] }
};
let shareResData = null;
const mockResShare = {
  json: (data) => { shareResData = data; }
};
contactsHandlers.updateContactAccess(mockReqShare, mockResShare);
assert(shareResData && shareResData.success === true, 'Admin successfully shared contact with Worker');

// Verify shared contact defaults for the worker
const sharedWorkerAccess = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM user_contact_access WHERE user_id = ? AND contact_id = ?').get(workerUser.id, adminCreatedId);
assert(sharedWorkerAccess.exclude_from_stats === 0, 'Admin-shared contact is INCLUDED (0) by default for Worker');
assert(sharedWorkerAccess.disable_duplex_export === 0, 'Admin-shared contact has Duplex ON (0) by default for Worker');

// 4. Worker updates their own exclusion toggle to 1 (Excluded)
const mockReqWorkerUpdate = {
  user: { id: workerUser.id, role: 'worker' },
  params: { id: adminCreatedId },
  body: { exclude_from_stats: 1, disable_duplex_export: 1 }
};
contactsHandlers.updateContact(mockReqWorkerUpdate, { json: () => {} });

// Verify Worker UCA updated, but Admin contacts table unchanged
const workerAccessAfterUpdate = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM user_contact_access WHERE user_id = ? AND contact_id = ?').get(workerUser.id, adminCreatedId);
assert(workerAccessAfterUpdate.exclude_from_stats === 1, 'Worker updated their exclusion preference to 1');
assert(workerAccessAfterUpdate.disable_duplex_export === 1, 'Worker updated their duplex preference to 1 (OFF)');

const adminContactAfterWorkerUpdate = db.prepare('SELECT exclude_from_stats, disable_duplex_export FROM contacts WHERE id = ?').get(adminCreatedId);
assert(adminContactAfterWorkerUpdate.exclude_from_stats === 0, 'Admin exclusion preference remains completely decoupled and intact (0)');
assert(adminContactAfterWorkerUpdate.disable_duplex_export === 0, 'Admin duplex preference remains completely decoupled and intact (0)');

// 5. Test Ledger Customers endpoint for Admin vs Worker
const createBillingHandlers = require('../../frontend/modules/billing/api/handlers');
const billingHandlers = createBillingHandlers(db);

// Set Admin contact to excluded (1) and give opening balance so it appears in ledger
db.prepare('UPDATE contacts SET exclude_from_stats = 1, opening_balance = 500 WHERE id = ?').run(adminCreatedId);
// Ensure Worker contact access is included (0)
db.prepare('UPDATE user_contact_access SET exclude_from_stats = 0 WHERE user_id = ? AND contact_id = ?').run(workerUser.id, adminCreatedId);

// Worker calls getLedgerCustomers
let workerLedgerData = null;
billingHandlers.getLedgerCustomers({ user: { id: workerUser.id, role: 'worker' } }, {
  json: (res) => { workerLedgerData = res.data; }
});
const workerLedgerCustomer = workerLedgerData.find(c => c.customer_id === adminCreatedId);
assert(workerLedgerCustomer && workerLedgerCustomer.exclude_from_stats === 0, 'Worker getLedgerCustomers returns exclude_from_stats = 0 for shared contact (even though Admin has it on 1)');

// Admin calls getLedgerCustomers
let adminLedgerData = null;
billingHandlers.getLedgerCustomers({ user: { id: adminUser.id, role: 'owner' } }, {
  json: (res) => { adminLedgerData = res.data; }
});
const adminLedgerCustomer = adminLedgerData.find(c => c.customer_id === adminCreatedId);
assert(adminLedgerCustomer && adminLedgerCustomer.exclude_from_stats === 1, 'Admin getLedgerCustomers returns exclude_from_stats = 1 for this contact');

// Clean up test contacts
db.prepare('DELETE FROM contacts WHERE id IN (?, ?)').run(createdContactId, adminCreatedId);
db.prepare('DELETE FROM user_contact_access WHERE contact_id IN (?, ?)').run(createdContactId, adminCreatedId);

console.log('\nAll decoupled preference and sharing tests PASSED successfully!');

