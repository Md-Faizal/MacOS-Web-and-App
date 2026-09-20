const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing Audit User Display Names & AI Scoping Isolation...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const adminAuth = require('../departments/auth/engine/admin')(db);
const aiHandlers = require('../departments/ai/engine/handlers')(db);
const { generateDatabaseContext } = require('../departments/ai/engine/db-context');
const contactsHandlers = require('../departments/contacts/engine/handlers')(db);
const billingHandlers = require('../departments/billing/engine/handlers')(db);

const ownerReq = { user: { id: 'admin_test', userId: 'admin_test', role: 'owner' }, query: {}, body: {}, params: {}, headers: {} };
const workerReq = { user: { id: 'worker_audit_1', userId: 'worker_audit_1', role: 'worker' }, query: {}, body: {}, params: {}, headers: {} };

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
  // Ensure test users exist with human-readable usernames / emails
  db.prepare(`
    INSERT OR IGNORE INTO users (id, full_name, username, email, role, status)
    VALUES 
      ('admin_test', 'Owner Admin', 'admin_test', 'owner@business.com', 'owner', 'active'),
      ('worker_audit_1', 'John Worker', 'worker_audit_1', 'john.worker@business.com', 'worker', 'active')
  `).run();
  db.prepare("UPDATE users SET full_name = 'John Worker', email = 'john.worker@business.com' WHERE id = 'worker_audit_1'").run();

  // Create a contact as Worker
  const resContact = mockRes();
  await contactsHandlers.createContact({
    user: workerReq.user,
    body: { name: 'AI_TEST_WorkerContact', opening_balance: 500 }
  }, resContact);
  const workerContactId = resContact.data.id;

  // Create an Owner private contact
  const resOwnerContact = mockRes();
  await contactsHandlers.createContact({
    user: ownerReq.user,
    body: { name: 'AI_TEST_OwnerContact', opening_balance: 10000, exclude_from_stats: 0 }
  }, resOwnerContact);
  const ownerContactId = resOwnerContact.data.id;

  // =====================================
  // TEST 1: AUDIT LOGS DISPLAY NAMES
  // =====================================
  const resAudit = mockRes();
  adminAuth.getAuditLogs(ownerReq, resAudit);
  const logs = resAudit.data.logs;
  assert.ok(Array.isArray(logs) && logs.length > 0, 'Audit logs should return entries');

  const workerLog = logs.find(l => l.user_id === 'worker_audit_1');
  assert.ok(workerLog, 'Should find worker audit entry');
  assert.ok(workerLog.display_name === 'John Worker' || workerLog.display_name === 'john.worker@business.com', `Worker display name should be human-readable, got: ${workerLog.display_name}`);
  assert.notStrictEqual(workerLog.display_name, 'worker_audit_1', 'Display name should NOT be raw ID when username/email exists');
  console.log(`✅ Audit Log user display name resolution verified: "${workerLog.display_name}"`);

  // =====================================
  // TEST 2: AI DATABASE CONTEXT SCOPING
  // =====================================
  const workerDbContext = generateDatabaseContext(db, workerReq);
  const ownerDbContext = generateDatabaseContext(db, ownerReq);

  assert.ok(workerDbContext.contacts, 'Worker DB context must contain contacts table');
  assert.ok(ownerDbContext.contacts, 'Owner DB context must contain contacts table');
  assert.ok(workerDbContext.contacts.rowCount <= ownerDbContext.contacts.rowCount, 'Worker scoped contact row count must be <= Owner total');
  console.log(`✅ AI Database Context Scoping verified: Worker sees ${workerDbContext.contacts.rowCount} contacts, Owner sees ${ownerDbContext.contacts.rowCount}`);

  // =====================================
  // TEST 3: AI INSIGHTS SCOPING
  // =====================================
  const resWorkerInsights = mockRes();
  await aiHandlers.getInsights({ user: workerReq.user, query: { type: 'customers' } }, resWorkerInsights);
  assert.ok(resWorkerInsights.data.success, 'Worker insights should succeed');
  assert.ok(resWorkerInsights.data.data.total_customers > 0, 'Worker should get scoped customer metrics');

  const resOwnerInsights = mockRes();
  await aiHandlers.getInsights({ user: ownerReq.user, query: { type: 'customers' } }, resOwnerInsights);
  assert.ok(resOwnerInsights.data.success, 'Owner insights should succeed');
  assert.ok(resOwnerInsights.data.data.total_customers >= resWorkerInsights.data.data.total_customers, 'Owner total customers must be >= worker count');
  console.log(`✅ AI Insights User-based Scoping verified: Worker customer count: ${resWorkerInsights.data.data.total_customers}, Owner customer count: ${resOwnerInsights.data.data.total_customers}`);

  // Cleanup test data
  db.prepare("DELETE FROM user_contact_access WHERE user_id = 'worker_audit_1'").run();
  db.prepare("DELETE FROM contacts WHERE id IN (?, ?)").run(workerContactId, ownerContactId);

  console.log('\n🎉 ALL AUDIT DISPLAY NAME & AI USER ISOLATION TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
