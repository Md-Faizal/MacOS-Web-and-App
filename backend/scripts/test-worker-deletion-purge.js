const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

console.log('🧪 Testing Worker Account Deletion & Complete Credential Purge...');

let dbPath = path.join(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(__dirname, '../../database/app.db');
}
const db = new Database(dbPath);

const adminModule = require('../departments/auth/engine/admin')(db);
const profileModule = require('../departments/auth/engine/profile')(db);
const authModule = require('../departments/auth/engine/auth')(db);

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

async function runPurgeTests() {
  const testWorkerId = 'worker_purge_test_user_id';
  const testOwnerId = 'owner_admin_test_user_id';

  // 1. Cleanup and setup
  db.pragma('foreign_keys = OFF');
  db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(testWorkerId, testOwnerId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testWorkerId);
  db.prepare("DELETE FROM user_identities WHERE user_id = ?").run(testWorkerId);
  try { db.prepare("DELETE FROM webauthn_credentials WHERE user_id = ?").run(testWorkerId); } catch(e) {}
  db.prepare("DELETE FROM user_profile WHERE id = ?").run(testWorkerId);
  db.prepare("DELETE FROM user_devices WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM clock_settings WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM weather_settings WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM user_contact_access WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(testWorkerId);
  db.prepare("DELETE FROM auth_refresh_tokens WHERE user_id = ?").run(testWorkerId);
  db.pragma('foreign_keys = ON');

  // Setup Owner
  db.prepare(`
    INSERT INTO users (id, role, username, email, status)
    VALUES (?, 'owner', 'admin_owner', 'admin@system.local', 'active')
  `).run(testOwnerId);

  // Setup Worker with FULL profile, credentials, security questions, devices, permissions
  const passwordHash = bcrypt.hashSync('WorkerPass123!', 10);
  const answerHash = bcrypt.hashSync('fluffy', 10);

  db.prepare(`
    INSERT INTO users (
      id, username, google_id, google_email, google_name, google_picture,
      full_name, email, password_hash, security_question, security_answer_hash,
      role, status, token_version
    ) VALUES (
      ?, 'worker_to_delete', 'google_id_9999', 'worker.purge@gmail.com', 'Purge Worker', 'https://avatar.url',
      'Purge Worker Full', 'worker.purge@gmail.com', ?, 'What was the name of your first pet?', ?,
      'worker', 'active', 1
    )
  `).run(testWorkerId, passwordHash, answerHash);

  // Auxiliary data
  db.prepare("INSERT INTO auth_credentials (id, user_role) VALUES (?, 'worker')").run(testWorkerId);
  db.prepare("INSERT INTO user_profile (id, full_name, email_id) VALUES (?, 'Purge Worker Full', 'worker.purge@gmail.com')").run(testWorkerId);
  const devInfo = db.prepare("INSERT INTO user_devices (user_id, device_name, device_type) VALUES (?, 'Worker MacBook', 'desktop')").run(testWorkerId);
  const deviceId = devInfo.lastInsertRowid;

  db.prepare("INSERT INTO clock_settings (user_id, mode, timezone) VALUES (?, 'analog', 'UTC')").run(testWorkerId);
  db.prepare("INSERT INTO weather_settings (user_id, city, unit) VALUES (?, 'London', 'metric')").run(testWorkerId);
  db.prepare("INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete) VALUES (?, 'billing', 1, 1, 0, 0)").run(testWorkerId);
  
  let contact = db.prepare("SELECT id FROM contacts LIMIT 1").get();
  if (!contact) {
    const info = db.prepare("INSERT INTO contacts (name, type) VALUES ('Test Contact', 'Customer')").run();
    contact = { id: info.lastInsertRowid };
  }
  db.prepare("INSERT INTO user_contact_access (user_id, contact_id) VALUES (?, ?)").run(testWorkerId, contact.id);

  db.prepare(`
    INSERT INTO auth_sessions (id, secret_hash, user_id, device_id, idle_expires_at, absolute_expires_at)
    VALUES ('sess_999', 'hash_secret_999', ?, ?, datetime('now', '+1 hour'), datetime('now', '+12 hours'))
  `).run(testWorkerId, deviceId);

  db.prepare(`
    INSERT INTO auth_refresh_tokens (id, user_id, family_id, token_hash, expires_at)
    VALUES ('tok_999', ?, 'fam_999', 'hash_tok_999', datetime('now', '+30 days'))
  `).run(testWorkerId);

  console.log('✅ Initial worker state with full credentials & auxiliary records created');

  // TEST 1: Worker requests account deletion
  const reqWorker = {
    user: { userId: testWorkerId, id: testWorkerId, role: 'worker', sessionId: 'sess_999' },
    body: { reason: 'Leaving company for new opportunity', password: 'WorkerPass123!' }
  };
  const resReq = mockRes();
  profileModule.requestAccountDeletion(reqWorker, resReq);

  assert.strictEqual(resReq.statusCode, 200, 'requestAccountDeletion should return 200');
  const userPending = db.prepare("SELECT status, deletion_requested_at, deletion_reason FROM users WHERE id = ?").get(testWorkerId);
  assert.strictEqual(userPending.status, 'pending_deletion', 'Status should transition to pending_deletion');
  assert.ok(userPending.deletion_requested_at, 'deletion_requested_at timestamp should be populated');
  assert.strictEqual(userPending.deletion_reason, 'Leaving company for new opportunity');
  console.log('✅ Worker deletion request verified (status: pending_deletion)');

  // TEST 2: Owner approves deletion (calls approveDeletion)
  const reqOwner = {
    user: { userId: testOwnerId, id: testOwnerId, role: 'owner' },
    params: { userId: testWorkerId }
  };
  const resApprove = mockRes();
  adminModule.approveDeletion(reqOwner, resApprove);

  assert.strictEqual(resApprove.statusCode, 200, 'approveDeletion should return 200');

  // TEST 3: Validate ALL purged fields in users table
  const userDeleted = db.prepare(`
    SELECT id, username, password_hash, security_question, security_answer_hash,
           google_id, google_email, google_name, google_picture, status, deleted_at, deleted_by
    FROM users WHERE id = ?
  `).get(testWorkerId);

  assert.strictEqual(userDeleted.status, 'deleted', 'User status must be deleted');
  assert.strictEqual(userDeleted.username, null, 'Username must be wiped to NULL (free for new accounts)');
  assert.strictEqual(userDeleted.password_hash, null, 'Password hash must be wiped to NULL');
  assert.strictEqual(userDeleted.security_question, null, 'Security question must be wiped to NULL');
  assert.strictEqual(userDeleted.security_answer_hash, null, 'Security answer hash must be wiped to NULL');
  assert.strictEqual(userDeleted.google_id, null, 'Google ID must be unlinked/NULL');
  assert.strictEqual(userDeleted.google_email, null, 'Google email must be unlinked/NULL');
  assert.strictEqual(userDeleted.google_name, null, 'Google name must be wiped/NULL');
  assert.strictEqual(userDeleted.google_picture, null, 'Google picture must be wiped/NULL');
  assert.ok(userDeleted.deleted_at, 'deleted_at timestamp must be recorded');
  assert.strictEqual(userDeleted.deleted_by, testOwnerId, 'deleted_by must record owner ID');
  console.log('✅ User table credentials, identity, and personal data wipe verified');

  // TEST 4: Validate purge across all auxiliary tables
  const profileCount = db.prepare("SELECT COUNT(*) as c FROM user_profile WHERE id = ?").get(testWorkerId).c;
  const devicesCount = db.prepare("SELECT COUNT(*) as c FROM user_devices WHERE user_id = ?").get(testWorkerId).c;
  const clockCount = db.prepare("SELECT COUNT(*) as c FROM clock_settings WHERE user_id = ?").get(testWorkerId).c;
  const weatherCount = db.prepare("SELECT COUNT(*) as c FROM weather_settings WHERE user_id = ?").get(testWorkerId).c;
  const permsCount = db.prepare("SELECT COUNT(*) as c FROM user_permissions WHERE user_id = ?").get(testWorkerId).c;
  const contactAccessCount = db.prepare("SELECT COUNT(*) as c FROM user_contact_access WHERE user_id = ?").get(testWorkerId).c;

  assert.strictEqual(profileCount, 0, 'user_profile must have 0 rows');
  assert.strictEqual(devicesCount, 0, 'user_devices must have 0 rows');
  assert.strictEqual(clockCount, 0, 'clock_settings must have 0 rows');
  assert.strictEqual(weatherCount, 0, 'weather_settings must have 0 rows');
  assert.strictEqual(permsCount, 0, 'user_permissions must have 0 rows');
  assert.strictEqual(contactAccessCount, 0, 'user_contact_access must have 0 rows');
  console.log('✅ Auxiliary tables (profile, devices, settings, permissions, contact access) purge verified');

  // TEST 5: Validate session and refresh token revocations
  const activeSessions = db.prepare("SELECT COUNT(*) as c FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL").get(testWorkerId).c;
  const activeTokens = db.prepare("SELECT COUNT(*) as c FROM auth_refresh_tokens WHERE user_id = ? AND revoked_at IS NULL").get(testWorkerId).c;
  assert.strictEqual(activeSessions, 0, 'All auth_sessions must be revoked');
  assert.strictEqual(activeTokens, 0, 'All auth_refresh_tokens must be revoked');
  console.log('✅ Active sessions and refresh tokens revocation verified');

  // TEST 6: Validate lifecycle history audit record
  const lifecycle = db.prepare("SELECT * FROM worker_lifecycle_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(testWorkerId);
  assert.ok(lifecycle, 'worker_lifecycle_history must retain an audit record of deletion');
  assert.strictEqual(lifecycle.status, 'deleted');
  assert.strictEqual(lifecycle.deleted_by, testOwnerId);
  console.log('✅ Worker lifecycle audit trail record verified');

  // TEST 7: Login attempt with old credentials must fail
  const resLoginFail = mockRes();
  authModule.login({
    body: {
      identifier: 'worker_to_delete',
      password: 'WorkerPass123!'
    },
    headers: {}
  }, resLoginFail);

  assert.notStrictEqual(resLoginFail.statusCode, 200, 'Login with deleted worker credentials must fail');
  console.log('✅ Login blocking for deleted worker verified');

  // Cleanup
  db.pragma('foreign_keys = OFF');
  db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(testWorkerId, testOwnerId);
  db.prepare("DELETE FROM auth_credentials WHERE id = ?").run(testWorkerId);
  db.prepare("DELETE FROM worker_lifecycle_history WHERE user_id = ?").run(testWorkerId);
  db.pragma('foreign_keys = ON');

  console.log('\n🎉 ALL WORKER ACCOUNT DELETION & CREDENTIAL PURGE TESTS PASSED!\n');
}

runPurgeTests().catch(err => {
  console.error('❌ Deletion purge test failed:', err);
  process.exit(1);
});
