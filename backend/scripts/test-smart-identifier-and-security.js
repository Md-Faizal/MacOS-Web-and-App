const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const bcrypt = require('bcryptjs');

console.log('🧪 Testing Smart Username/Email Identifier & updateSecurity Flow...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const authModule = require('../core/auth/auth')(db);

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.data = payload; return this; },
    cookie() { return this; },
    clearCookie() { return this; },
    setHeader() { return this; }
  };
  return res;
}

async function runTests() {
  const testUserId = 'worker_test_smart_id';
  
  // Setup clean worker
  db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
  db.prepare(`
    INSERT INTO users (id, google_email, email, username, role, status)
    VALUES (?, 'worker.google@business.com', 'worker.google@business.com', NULL, 'worker', 'active')
  `).run(testUserId);

  const workerReq = {
    user: { id: testUserId, userId: testUserId, role: 'worker' },
    body: {},
    params: {},
    query: {},
    cookies: {},
    headers: {}
  };

  // TEST 1: Set a custom username, password, and security question via updateSecurity
  const res1 = mockRes();
  authModule.updateSecurity({
    ...workerReq,
    body: {
      username: 'john_custom_worker',
      newPassword: 'MySecurePassword123!',
      securityQuestion: 'What was the name of your first pet?',
      securityAnswer: 'Buddy'
    }
  }, res1);

  assert.strictEqual(res1.statusCode, 200, 'updateSecurity with username and security question should return 200');
  const userAfter1 = db.prepare("SELECT username, email, password_hash, security_question, security_answer_hash FROM users WHERE id = ?").get(testUserId);
  assert.strictEqual(userAfter1.username, 'john_custom_worker', 'Username should be updated in database');
  assert.ok(userAfter1.password_hash, 'Password hash should be set');
  assert.strictEqual(userAfter1.security_question, 'What was the name of your first pet?', 'Security question should be saved');
  assert.ok(userAfter1.security_answer_hash, 'Security answer hash should be saved');
  assert.ok(bcrypt.compareSync('buddy', userAfter1.security_answer_hash), 'Security answer hash should match lowercase answer');
  console.log('✅ updateSecurity with custom username and security question verified');

  // TEST 2: Login with the newly created username
  const resLogin1 = mockRes();
  authModule.login({
    body: {
      identifier: 'john_custom_worker',
      password: 'MySecurePassword123!'
    },
    headers: {}
  }, resLogin1);

  assert.strictEqual(resLogin1.statusCode, 200, 'Login with custom username should succeed');
  assert.ok(resLogin1.data.success, 'Login response should indicate success');
  console.log('✅ Login with custom username verified');

  // TEST 3: Update with smart identifier (email)
  const res2 = mockRes();
  authModule.updateSecurity({
    ...workerReq,
    body: {
      identifier: 'john.alternate@business.com',
      currentPassword: 'MySecurePassword123!',
      newPassword: 'NewSecurePassword456!'
    }
  }, res2);

  assert.strictEqual(res2.statusCode, 200, 'updateSecurity with smart email identifier should return 200');
  const userAfter2 = db.prepare("SELECT email FROM users WHERE id = ?").get(testUserId);
  assert.strictEqual(userAfter2.email, 'john.alternate@business.com', 'Email should be updated in database');
  console.log('✅ updateSecurity with smart email identifier verified');

  // TEST 4: Login with the updated email
  const resLogin2 = mockRes();
  authModule.login({
    body: {
      identifier: 'john.alternate@business.com',
      password: 'NewSecurePassword456!'
    },
    headers: {}
  }, resLogin2);

  assert.strictEqual(resLogin2.statusCode, 200, 'Login with updated email should succeed');
  assert.ok(resLogin2.data.success, 'Login response should indicate success');
  console.log('✅ Login with updated email verified');

  // TEST 5: Check Username Availability API
  const resCheckAvail = mockRes();
  authModule.checkUsername({ query: { username: 'available_worker_123' } }, resCheckAvail);
  assert.strictEqual(resCheckAvail.data.available, true, 'Unique username should be available');
  console.log('✅ checkUsername available verified');

  const resCheckShort = mockRes();
  authModule.checkUsername({ query: { username: 'ab' } }, resCheckShort);
  assert.strictEqual(resCheckShort.data.available, false, 'Short username should not be available');
  console.log('✅ checkUsername length check verified');

  const resCheckReserved = mockRes();
  authModule.checkUsername({ query: { username: 'admin' } }, resCheckReserved);
  assert.strictEqual(resCheckReserved.data.available, false, 'Reserved username should not be available');
  console.log('✅ checkUsername reserved word check verified');

  const resCheckTaken = mockRes();
  authModule.checkUsername({ query: { username: 'john.alternate@business.com' } }, resCheckTaken);
  assert.strictEqual(resCheckTaken.data.available, false, 'Existing email/username should be reported taken');
  console.log('✅ checkUsername taken check verified');

  // Cleanup
  db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

  console.log('\n🎉 ALL SMART USERNAME/EMAIL & REAL-TIME AVAILABILITY TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
