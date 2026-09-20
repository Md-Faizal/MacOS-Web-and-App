const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing AI Assistant Fuzzy & Broken Phrase Intelligence...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const { generateDatabaseContext, getEntityDirectory } = require('../departments/ai/engine/db-context');
const aiHandlers = require('../departments/ai/engine/handlers')(db);

const ownerReq = { user: { id: 'admin_test', userId: 'admin_test', role: 'owner' }, query: {}, body: {}, params: {}, headers: {} };
const workerReq = { user: { id: 'worker_test_fuzzy', userId: 'worker_test_fuzzy', role: 'worker' }, query: {}, body: {}, params: {}, headers: {} };

async function runTests() {
  // Insert sample test data
  db.prepare(`
    INSERT OR IGNORE INTO users (id, full_name, username, email, role, status)
    VALUES ('worker_test_fuzzy', 'Fuzzy Worker', 'worker_fuzzy', 'worker_fuzzy@business.com', 'worker', 'active')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO contacts (id, name, phone, address, opening_balance, exclude_from_stats)
    VALUES (99901, 'Dacca Medical Store', '9876543210', 'Dhaka Central', 1200, 0)
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO products (id, name, category_id, classification)
    VALUES (99902, 'Crocin Advance 500mg', 1, 'General')
  `).run();

  // Test 1: Entity Directory Extraction
  const ownerDir = getEntityDirectory(db, ownerReq);
  assert.ok(Array.isArray(ownerDir.knownCustomers), 'knownCustomers must be an array');
  assert.ok(Array.isArray(ownerDir.knownProducts), 'knownProducts must be an array');
  
  const daccaCustomer = ownerDir.knownCustomers.find(c => c.name.includes('Dacca'));
  assert.ok(daccaCustomer, 'Directory should contain Dacca Medical Store');
  console.log(`✅ Entity Directory extracted successfully: Found ${ownerDir.knownCustomers.length} customers, ${ownerDir.knownProducts.length} products`);

  // Test 2: Worker Scoped Entity Directory Extraction
  const workerDir = getEntityDirectory(db, workerReq);
  assert.ok(Array.isArray(workerDir.knownCustomers), 'Worker directory knownCustomers must be an array');
  // Worker has no access to contact 99901 yet, so it should NOT be in worker directory
  const workerDacca = workerDir.knownCustomers.find(c => c.id === 99901);
  assert.strictEqual(workerDacca, undefined, 'Worker should not see unassigned contact in directory');
  console.log('✅ Worker Scoped Entity Directory verified: Unassigned customers strictly excluded');

  // Grant access to worker and test again
  db.prepare("INSERT OR IGNORE INTO user_contact_access (user_id, contact_id) VALUES ('worker_test_fuzzy', 99901)").run();
  const workerDirAfter = getEntityDirectory(db, workerReq);
  const workerDaccaAfter = workerDirAfter.knownCustomers.find(c => c.id === 99901);
  assert.ok(workerDaccaAfter, 'Worker should now see assigned contact in directory');
  console.log('✅ Worker Entity Directory dynamically reflects assigned contacts');

  // Cleanup test data
  db.prepare("DELETE FROM user_contact_access WHERE user_id = 'worker_test_fuzzy'").run();
  db.prepare("DELETE FROM contacts WHERE id = 99901").run();
  db.prepare("DELETE FROM products WHERE id = 99902").run();

  console.log('\n🎉 ALL AI FUZZY & BROKEN PHRASE INTELLIGENCE TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
