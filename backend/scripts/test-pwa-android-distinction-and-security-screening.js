/**
 * Verification Test: PWA vs Native Android Distinction and Security Screening Enforcement
 */

const Database = require('better-sqlite3');
const path = require('path');
const assert = require('assert');

console.log('🧪 Testing PWA vs Native Android Distinction & Security Screening...');

const dbPath = path.join(__dirname, '../../database/MacOS.db');
const db = new Database(dbPath);

const authModule = require('../departments/auth/engine/auth')(db);
const activityLogger = require('../core/audit/activity-logger')(db);
const adminModule = require('../departments/auth/engine/admin')(db);

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    cookies: {},
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.data = payload; return this; },
    cookie(name, val, opts) { this.cookies[name] = { val, opts }; return this; },
    clearCookie(name) { delete this.cookies[name]; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; }
  };
  return res;
}

async function runTests() {
  const testUserId = `test_pwa_worker_${Date.now()}`;
  const testUsername = `mobile_worker_${Date.now().toString().slice(-6)}`;

  // Clean setup
  db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
  db.prepare("DELETE FROM user_devices WHERE user_id = ?").run(testUserId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testUserId);

  db.prepare(`
    INSERT INTO users (id, email, username, role, status)
    VALUES (?, ?, ?, 'worker', 'active')
  `).run(testUserId, `${testUsername}@test.com`, testUsername);

  // Setup initial credentials via elevated request
  const setupRes = mockRes();
  authModule.updateSecurity({
    user: { id: testUserId, userId: testUserId, role: 'worker', elevated: true },
    body: {
      newPassword: 'WorkerPass123!',
      securityQuestion: 'What is your pet?',
      securityAnswer: 'dog'
    },
    headers: {},
    cookies: {}
  }, setupRes);
  assert.strictEqual(setupRes.statusCode, 200, 'Initial security setup must succeed');

  console.log('1. Testing PWA vs Native Android Login Distinction...');

  // 1. Login via Mobile PWA
  const pwaRes = mockRes();
  authModule.login({
    body: {
      identifier: testUsername,
      password: 'WorkerPass123!',
      deviceName: 'Samsung Galaxy S23',
      deviceType: 'Mobile (PWA)',
      clientType: 'pwa'
    },
    headers: {
      'x-client-platform': 'pwa',
      'user-agent': 'Mozilla/5.0 (Linux; Android 14; Mobile)'
    },
    cookies: {}
  }, pwaRes);

  assert.strictEqual(pwaRes.statusCode, 200, 'PWA login should succeed');
  assert.ok(pwaRes.data.user, 'PWA user should be returned');

  // 2. Login via Native Android App on the SAME device
  const nativeRes = mockRes();
  authModule.login({
    body: {
      identifier: testUsername,
      password: 'WorkerPass123!',
      deviceName: 'Samsung Galaxy S23',
      deviceType: 'Android App',
      clientType: 'native_android'
    },
    headers: {
      'x-client-platform': 'android',
      'user-agent': 'Dalvik/2.1.0 (Linux; U; Android 14)'
    },
    cookies: {}
  }, nativeRes);

  assert.strictEqual(nativeRes.statusCode, 200, 'Native Android login should succeed');

  // 3. Verify user_devices has both distinct devices registered without collision
  const devices = db.prepare("SELECT * FROM user_devices WHERE user_id = ?").all(testUserId);
  assert.strictEqual(devices.length, 2, 'Both PWA and Native Android devices must coexist');

  const pwaDevice = devices.find(d => d.client_type === 'pwa');
  const nativeDevice = devices.find(d => d.client_type === 'android');

  assert.ok(pwaDevice, 'PWA device entry must exist with client_type=pwa');
  assert.ok(nativeDevice, 'Native Android device entry must exist with client_type=android');
  assert.ok(pwaDevice.device_name.includes('PWA'), `PWA device name should include (PWA): ${pwaDevice.device_name}`);
  assert.ok(nativeDevice.device_name.includes('Native App'), `Native device name should include (Native App): ${nativeDevice.device_name}`);
  console.log('✅ Both PWA and Native Android devices registered independently without collision');

  // 4. Verify getDevices returns client_type correctly
  const getDevicesRes = mockRes();
  authModule.getDevices({
    user: { id: testUserId }
  }, getDevicesRes);

  assert.strictEqual(getDevicesRes.statusCode, 200, 'getDevices should return 200');
  assert.strictEqual(getDevicesRes.data.devices.length, 2, 'Should return 2 devices');
  const pwaApiDevice = getDevicesRes.data.devices.find(d => d.clientType === 'pwa');
  const nativeApiDevice = getDevicesRes.data.devices.find(d => d.clientType === 'android');
  assert.ok(pwaApiDevice, 'API returned PWA device with clientType=pwa');
  assert.ok(nativeApiDevice, 'API returned Native Android device with clientType=android');
  console.log('✅ getDevices returns correct clientType distinction');

  // 5. Verify Activity Logger logs platform distinction
  console.log('\n2. Testing Activity Logger Platform Distinction...');
  activityLogger.logActivity(
    {
      headers: { 'x-client-platform': 'pwa' },
      user: { id: testUserId, role: 'worker', clientType: 'pwa' },
      ip: '127.0.0.1'
    },
    {
      module: 'orders',
      action: 'create',
      resourceType: 'order',
      resourceId: 'ORD-001',
      resourceName: 'Created order ORD-001'
    }
  );

  activityLogger.logActivity(
    {
      headers: { 'x-client-platform': 'android' },
      user: { id: testUserId, role: 'worker', clientType: 'native_android' },
      ip: '127.0.0.1'
    },
    {
      module: 'products',
      action: 'scan',
      resourceType: 'product',
      resourceId: 'PROD-001',
      resourceName: 'Scanned item via camera'
    }
  );

  const logs = db.prepare("SELECT * FROM activity_log WHERE user_id = ? ORDER BY id ASC").all(testUserId);
  assert.strictEqual(logs.length, 2, 'Should have logged 2 activity records');
  assert.strictEqual(logs[0].platform, 'pwa', 'First activity log must have platform=pwa');
  assert.strictEqual(logs[1].platform, 'android', 'Second activity log must have platform=android');
  console.log('✅ Activity logger accurately scopes platform to pwa and android');

  // 6. Verify Admin listUsers exposes client_type and platform
  console.log('\n3. Testing Admin listUsers Worker Device Metadata...');
  const listUsersRes = mockRes();
  adminModule.listUsers({
    user: { id: 'admin_auth', role: 'owner' }
  }, listUsersRes);

  assert.strictEqual(listUsersRes.statusCode, 200, 'listUsers should succeed');
  const workerInList = listUsersRes.data.users.find(u => u.id === testUserId);
  assert.ok(workerInList, 'Worker should be in admin list');
  assert.ok(workerInList.last_client_type, 'Worker should have last_client_type populated');
  assert.ok(['android', 'pwa'].includes(workerInList.last_client_type), `last_client_type should be android or pwa, got: ${workerInList.last_client_type}`);
  console.log(`✅ Admin listUsers reflects worker client_type: ${workerInList.last_client_type}`);

  // 7. Security Screening Gate: Non-elevated session blocked from updating security credentials
  console.log('\n4. Testing Security Screening Gate...');
  const unElevatedReq = {
    user: { id: testUserId, userId: testUserId, role: 'worker', elevated: false },
    body: {
      username: 'hacked_worker_username',
      newPassword: 'HackedPassword123!'
    },
    headers: {},
    cookies: {}
  };
  const unElevatedRes = mockRes();
  authModule.updateSecurity(unElevatedReq, unElevatedRes);
  assert.strictEqual(unElevatedRes.statusCode, 401, 'Non-elevated worker session MUST be rejected with 401');
  assert.strictEqual(unElevatedRes.data.requiresSecurityCheck, true, 'Response must require security check');
  console.log('✅ Non-elevated worker correctly blocked with 401 (requiresSecurityCheck: true)');

  // 8. Elevate via security answer verification and preserve deviceId
  const answerReq = {
    user: { id: testUserId, userId: testUserId, role: 'worker', deviceId: pwaDevice.id },
    body: {
      answer: 'dog'
    },
    headers: {},
    cookies: {}
  };
  const answerRes = mockRes();
  authModule.verifyAnswer(answerReq, answerRes);
  assert.strictEqual(answerRes.statusCode, 200, 'Security answer verification should succeed');
  assert.ok(answerRes.cookies['auth_session'], 'Elevated session cookie issued');
  console.log('✅ Security question answered and elevated session cookie issued');

  // 9. Elevated session succeeds
  const updatedUsername = `legit_worker_${Date.now().toString().slice(-6)}`;
  const elevatedReq = {
    user: { id: testUserId, userId: testUserId, role: 'worker', elevated: true },
    body: {
      username: updatedUsername,
      newPassword: 'BrandNewPass123!'
    },
    headers: {},
    cookies: {}
  };
  const elevatedRes = mockRes();
  authModule.updateSecurity(elevatedReq, elevatedRes);
  assert.strictEqual(elevatedRes.statusCode, 200, 'Elevated session must succeed in updating credentials');
  console.log('✅ Elevated worker session successfully updated credentials');

  // Clean up test data
  db.prepare("DELETE FROM user_devices WHERE user_id = ?").run(testUserId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testUserId);

  console.log('\n🎉 ALL PWA vs NATIVE ANDROID & SECURITY SCREENING TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
