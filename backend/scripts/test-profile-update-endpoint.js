const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

console.log('🧪 Testing POST /api/profile for both Owner and Worker Accounts...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const profileModule = require('../departments/auth/engine/profile')(db);

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.data = payload; return this; }
  };
  return res;
}

async function runProfileTests() {
  const testWorkerId = 'worker_profile_test_1';
  const testOwnerId = 'owner_profile_test_1';

  // Setup cleanup
  db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(testWorkerId, testOwnerId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testOwnerId);
  db.prepare("DELETE FROM user_profile WHERE id = ?").run(testOwnerId);

  // 1. Create Worker (Note: NOT in auth_credentials)
  db.prepare(`
    INSERT INTO users (id, username, email, full_name, role, status)
    VALUES (?, 'worker_sam', 'sam.worker@company.com', 'Sam Worker', 'worker', 'active')
  `).run(testWorkerId);

  // 2. Create Owner (In auth_credentials and user_profile)
  db.prepare(`
    INSERT INTO users (id, username, email, full_name, role, status)
    VALUES (?, 'owner_boss', 'boss@company.com', 'Boss Owner', 'owner', 'active')
  `).run(testOwnerId);
  db.prepare(`
    INSERT INTO auth_credentials (id, user_role)
    VALUES (?, 'admin')
  `).run(testOwnerId);
  db.prepare(`
    INSERT INTO user_profile (id, full_name, email_id)
    VALUES (?, 'Boss Owner', 'boss@company.com')
  `).run(testOwnerId);

  // TEST 1: Update Worker profile
  const resWorker = mockRes();
  profileModule.updateProfile({
    user: { userId: testWorkerId, id: testWorkerId, role: 'worker' },
    body: {
      full_name: 'Sam Worker Updated',
      email_id: 'sam.worker.new@company.com',
      username: 'sam_worker_new',
      profile_picture: null,
      name_source: 'local',
      picture_source: 'local'
    }
  }, resWorker);

  assert.strictEqual(resWorker.statusCode, 200, `Worker profile update should return 200, got ${resWorker.statusCode}: ${JSON.stringify(resWorker.data)}`);
  const workerInDb = db.prepare("SELECT full_name, email, username FROM users WHERE id = ?").get(testWorkerId);
  assert.strictEqual(workerInDb.full_name, 'Sam Worker Updated');
  assert.strictEqual(workerInDb.email, 'sam.worker.new@company.com');
  assert.strictEqual(workerInDb.username, 'sam_worker_new');
  console.log('✅ Worker profile update without auth_credentials FK error verified');

  // TEST 2: Update Owner profile
  const resOwner = mockRes();
  profileModule.updateProfile({
    user: { userId: testOwnerId, id: testOwnerId, role: 'owner' },
    body: {
      full_name: 'Boss Owner Updated',
      email_id: 'boss.new@company.com',
      username: 'boss_owner_new',
      profile_picture: 'data:image/jpeg;base64,sample',
      name_source: 'local',
      picture_source: 'local'
    }
  }, resOwner);

  assert.strictEqual(resOwner.statusCode, 200, `Owner profile update should return 200, got ${resOwner.statusCode}: ${JSON.stringify(resOwner.data)}`);
  const ownerInDb = db.prepare("SELECT full_name, email, username FROM users WHERE id = ?").get(testOwnerId);
  assert.strictEqual(ownerInDb.full_name, 'Boss Owner Updated');
  assert.strictEqual(ownerInDb.email, 'boss.new@company.com');
  assert.strictEqual(ownerInDb.username, 'boss_owner_new');
  const ownerLegacyProfile = db.prepare("SELECT full_name, email_id, profile_picture FROM user_profile WHERE id = ?").get(testOwnerId);
  assert.strictEqual(ownerLegacyProfile.full_name, 'Boss Owner Updated');
  console.log('✅ Owner profile update with user_profile sync verified');

  // TEST 3: Duplicate conflict detection
  const resConflict = mockRes();
  profileModule.updateProfile({
    user: { userId: testWorkerId, id: testWorkerId, role: 'worker' },
    body: {
      full_name: 'Sam Worker Duplicate Test',
      email_id: 'boss.new@company.com', // Clashes with owner
      username: 'sam_worker_conflict'
    }
  }, resConflict);

  assert.strictEqual(resConflict.statusCode, 409, 'Conflict on existing email should return 409');
  console.log('✅ Conflict detection verified');

  // TEST 4: Google photo default for worker with Google linked
  db.prepare("UPDATE users SET google_id = 'g_123', google_email = 'sam.google@gmail.com', google_picture = 'https://lh3.googleusercontent.com/photo.jpg' WHERE id = ?").run(testWorkerId);
  const resGetProfile = mockRes();
  profileModule.getProfile({ user: { userId: testWorkerId } }, resGetProfile);
  assert.strictEqual(resGetProfile.statusCode, 200);
  assert.strictEqual(resGetProfile.data.profile.display_picture, 'https://lh3.googleusercontent.com/photo.jpg', 'Google photo must be default display_picture when local photo is absent');
  assert.strictEqual(resGetProfile.data.profile.picture_source, 'google');
  console.log('✅ Default Google photo on account creation / fetch verified');

  // Cleanup
  db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(testWorkerId, testOwnerId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testOwnerId);
  db.prepare("DELETE FROM user_profile WHERE id = ?").run(testOwnerId);

  console.log('\n🎉 ALL PROFILE UPDATE & GOOGLE DEFAULT PICTURE TESTS PASSED!\n');
}

runProfileTests().catch(err => {
  console.error('❌ Profile test failed:', err);
  process.exit(1);
});
