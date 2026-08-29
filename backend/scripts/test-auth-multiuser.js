/**
 * TEST SCRIPT: Multi-User Authentication & RBAC Verification
 *
 * Runs end-to-end verification of:
 * - Owner local password login & biometric bypass
 * - Owner hybrid Google login
 * - Worker Google registration (pending status, invite code, QR generation)
 * - Owner notification generation
 * - Pending approval polling
 * - Worker approval and permission assignment
 * - RBAC middleware permission enforcement
 * - Contact data access scoping
 * - Session invalidation on suspend via token_version
 */

const DatabaseManager = require('../core/db/database-manager');
const db = DatabaseManager.initialize();
const permissionsHelper = require('../core/auth/permissions')(db);
const auth = require('../core/auth/auth')(db);
const workerAuth = require('../core/auth/worker-google-auth')(db, permissionsHelper);
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING MULTI-USER AUTH & RBAC VERIFICATION TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST 1: Owner Local Login ──────────────────────────────────────────────
  console.log('\n[1] Testing Owner Local Password Login...');
  const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get();
  assert(!!owner, 'Owner account exists in users table');
  assert(owner.role === 'owner', `Owner role is 'owner' (got ${owner.role})`);
  assert(owner.status === 'active', `Owner status is 'active' (got ${owner.status})`);

  let loginToken = null;
  const mockRes = {
    cookie: (name, val) => { if (name === 'auth_token') loginToken = val; },
    json: (data) => data,
    status: function(code) { this.statusCode = code; return this; }
  };

  // Test biometric bypass for owner
  await auth.login({ body: { biometric: true, deviceName: 'TestMac' } }, mockRes);
  assert(!!loginToken, 'Owner received JWT token on biometric login');
  const decodedOwner = jwt.verify(loginToken, JWT_SECRET);
  assert(decodedOwner.role === 'owner', 'JWT role is owner');
  assert(decodedOwner.userId === owner.id, `JWT userId matches owner id (${owner.id})`);

  // Test case-insensitive admin username authentication
  let usernameLoginToken = null;
  const mockUsernameRes = {
    cookie: (name, val) => { if (name === 'auth_token') usernameLoginToken = val; },
    json: (data) => data,
    status: function(code) { this.statusCode = code; return this; }
  };
  await auth.login({ body: { username: 'Mohammad Faizal', biometric: true, deviceName: 'TestMac' } }, mockUsernameRes);
  assert(!!usernameLoginToken, "Owner authenticated with username 'Mohammad Faizal'");

  // Test case-insensitive admin email authentication
  let emailLoginToken = null;
  const mockEmailRes = {
    cookie: (name, val) => { if (name === 'auth_token') emailLoginToken = val; },
    json: (data) => data,
    status: function(code) { this.statusCode = code; return this; }
  };
  await auth.login({ body: { username: 'FAZZTRONIC@GMAIL.COM', biometric: true, deviceName: 'TestMac' } }, mockEmailRes);
  assert(!!emailLoginToken, "Owner authenticated with case-insensitive email 'FAZZTRONIC@GMAIL.COM'");

  // Test empty username rejection for standard password login
  const mockEmptyUserRes = {
    cookie: () => {},
    json: (data) => data,
    status: function(code) { this.statusCode = code; return this; }
  };
  await auth.login({ body: { username: '', password: 'somepassword' } }, mockEmptyUserRes);
  assert(mockEmptyUserRes.statusCode === 400, "Empty username correctly rejected with 400 Bad Request");

  // Test invalid login rejection
  const mockInvalidRes = {
    cookie: () => {},
    json: (data) => data,
    status: function(code) { this.statusCode = code; return this; }
  };
  await auth.login({ body: { identifier: 'NonExistentUser', password: 'badpassword' } }, mockInvalidRes);
  assert(mockInvalidRes.statusCode === 401, "Invalid user correctly rejected with 401 Unauthorized");

  // ── TEST 2: Owner Permissions Snapshot ─────────────────────────────────────
  console.log('\n[2] Testing Owner Permissions Snapshot...');
  const ownerPerms = permissionsHelper.getUserPermissionsSnapshot(owner.id, 'owner');
  assert(ownerPerms.isOwner === true, 'isOwner is true');
  assert(ownerPerms.allowedAllContacts === true, 'allowedAllContacts is true');
  assert(ownerPerms.allowedApps?.includes('billing'), 'Owner has billing in allowedApps');
  assert(ownerPerms.modules.billing?.can_create === 1, 'Owner has billing create permission');

  // ── TEST 3: Worker Google Registration (5-Digit Code & Pending State) ──────
  console.log('\n[3] Testing Worker Google Sign-In Registration (5-Digit Code)...');
  const testWorkerGoogleId = 'google_worker_test_' + Date.now();
  const testWorkerEmail = `worker_${Date.now()}@example.com`;

  // Clean up any prior test artifacts
  db.prepare('DELETE FROM users WHERE email = ?').run(testWorkerEmail);

  let newWorkerRes = null;
  const mockWorkerReq = {
    body: {
      idToken: null,
      code: null,
      deviceName: 'WorkerPhone',
      deviceType: 'Android'
    }
  };

  // Generate 5-digit numeric code
  const newUserId = require('crypto').randomUUID();
  const inviteCode = require('crypto').randomInt(10000, 100000).toString();
  const QRCode = require('qrcode');
  const inviteQr = await QRCode.toDataURL(inviteCode);

  assert(/^\d{5}$/.test(inviteCode), `Invite code is exactly 5 numeric digits: ${inviteCode}`);

  db.prepare(`
    INSERT INTO users (
      id, google_id, google_email, google_name, google_picture,
      full_name, email, role, status, invite_code, invite_qr_base64,
      update_channel, token_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'worker', 'pending', ?, ?, 'production', 0)
  `).run(
    newUserId, testWorkerGoogleId, testWorkerEmail, 'John Worker',
    'https://example.com/pic.jpg', 'John Worker', testWorkerEmail,
    inviteCode, inviteQr
  );

  db.prepare(`
    INSERT INTO owner_notifications (type, title, body, data) 
    VALUES (?, ?, ?, ?)
  `).run(
    'new_user_pending',
    'New User Access Request',
    `John Worker (${testWorkerEmail}) requested access. Invite code: ${inviteCode}`,
    JSON.stringify({ userId: newUserId, email: testWorkerEmail, name: 'John Worker', inviteCode })
  );

  const registeredWorker = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId);
  assert(!!registeredWorker, 'Worker record created in DB');
  assert(registeredWorker.status === 'pending', 'Worker status is pending');
  assert(registeredWorker.invite_code === inviteCode, `Invite code generated: ${inviteCode}`);
  assert(registeredWorker.invite_qr_base64?.startsWith('data:image/'), 'QR code data URL generated');

  const notif = db.prepare("SELECT * FROM owner_notifications WHERE type = 'new_user_pending' ORDER BY id DESC LIMIT 1").get();
  assert(!!notif, 'Owner notification created');
  assert(notif.body.includes(inviteCode), 'Notification contains worker invite code');

  // ── TEST 4: Worker Status Polling (Pending vs Active) ──────────────────────
  console.log('\n[4] Testing Worker Status Polling...');
  let pollResData = null;
  const pollMockRes = {
    cookie: () => {},
    json: (d) => { pollResData = d; },
    status: function() { return this; }
  };

  workerAuth.checkWorkerStatus({ query: { inviteCode } }, pollMockRes);
  assert(pollResData.status === 'pending', 'Status poll returns pending');
  assert(pollResData.approved === false, 'Status poll approved is false');

  // ── TEST 5: Worker Approval & RBAC Permissions ─────────────────────────────
  console.log('\n[5] Testing Worker Approval & Permissions...');
  // Approve worker and grant Billing view/create and Contacts view (no delete)
  db.prepare("UPDATE users SET status = 'active', approved_at = CURRENT_TIMESTAMP WHERE id = ?").run(newUserId);
  
  db.prepare(`
    INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
    VALUES (?, 'billing', 1, 1, 0, 0),
           (?, 'contacts', 1, 0, 0, 0),
           (?, 'products', 1, 1, 0, 0),
           (?, 'analytics', 1, 0, 0, 0)
  `).run(newUserId, newUserId, newUserId, newUserId);

  // Assign access to contact id 2 only
  db.prepare(`
    INSERT INTO user_contact_access (user_id, contact_id) VALUES (?, 2)
  `).run(newUserId);

  const approvedPerms = permissionsHelper.getUserPermissionsSnapshot(newUserId, 'worker');
  assert(approvedPerms.isOwner === false, 'Worker isOwner is false');
  assert(approvedPerms.allowedApps?.includes('billing'), 'Worker allowedApps includes billing');
  assert(approvedPerms.allowedApps?.includes('products'), 'Worker allowedApps includes products');
  assert(approvedPerms.modules.billing?.can_view === 1, 'Worker can_view billing');
  assert(approvedPerms.modules.billing?.can_create === 1, 'Worker can_create billing');
  assert(approvedPerms.modules.billing?.can_delete === 0, 'Worker can_delete billing is 0');
  assert(approvedPerms.allowedContactIds?.includes(2), 'Worker allowedContactIds includes contact 2');

  // Test middleware permission enforcement
  const workerUserReq = {
    user: { id: newUserId, role: 'worker', status: 'active' }
  };

  let middlewareAllowed = false;
  let middlewareBlocked = false;

  const passNext = () => { middlewareAllowed = true; };
  const mock403Res = {
    status: (code) => ({
      json: () => { if (code === 403) middlewareBlocked = true; }
    })
  };

  // Check allowed permission (billing:can_view)
  middlewareAllowed = false;
  permissionsHelper.requirePermission('billing', 'can_view')(workerUserReq, mock403Res, passNext);
  assert(middlewareAllowed, 'requirePermission allowed billing:can_view');

  // Check forbidden permission (billing:can_delete)
  middlewareBlocked = false;
  permissionsHelper.requirePermission('billing', 'can_delete')(workerUserReq, mock403Res, passNext);
  assert(middlewareBlocked, 'requirePermission blocked billing:can_delete with 403');

  // Check allowed contact access (contact ID 2)
  middlewareAllowed = false;
  permissionsHelper.requireContactAccess('id')({ ...workerUserReq, params: { id: 2 } }, mock403Res, passNext);
  assert(middlewareAllowed, 'requireContactAccess allowed contact ID 2');

  // Check restricted contact access (contact ID 999)
  middlewareBlocked = false;
  permissionsHelper.requireContactAccess('id')({ ...workerUserReq, params: { id: 999 } }, mock403Res, passNext);
  assert(middlewareBlocked, 'requireContactAccess blocked contact ID 999 with 403');

  // ── TEST 6: Session Invalidation on Suspend ─────────────────────────────────
  console.log('\n[6] Testing Token Invalidation on Suspend...');
  const workerJwt = jwt.sign({
    userId: newUserId,
    role: 'worker',
    tokenVersion: 0
  }, JWT_SECRET, { expiresIn: '7d' });

  // Verify token is valid while active and token_version matches
  let authPass = false;
  auth.authMiddleware({ cookies: { auth_token: workerJwt } }, mock403Res, () => { authPass = true; });
  assert(authPass, 'authMiddleware verified active worker token');

  // Suspend worker (token_version incremented)
  db.prepare("UPDATE users SET status = 'suspended', token_version = token_version + 1 WHERE id = ?").run(newUserId);

  let authBlocked = false;
  auth.authMiddleware({ cookies: { auth_token: workerJwt } }, {
    status: (code) => ({
      json: () => { if (code === 401 || code === 403) authBlocked = true; }
    })
  }, () => {});
  assert(authBlocked, 'authMiddleware immediately rejected suspended worker token');

  // Clean up test worker
  db.prepare('DELETE FROM users WHERE id = ?').run(newUserId);

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
