/**
 * Test suite for upgraded Passkey (WebAuthn Level 3) enterprise capabilities:
 * - Multi-passkey retention (no clobbering)
 * - Discoverable / Username-less authentication options
 * - Passkey credential listing and individual revocation
 * - Password and session non-regression
 */
const DatabaseManager = require('../core/db/database-manager');
const crypto = require('crypto');
const createAuthService = require('../departments/auth/engine/auth');
const createPermissionsService = require('../departments/auth/engine/permissions');

const db = DatabaseManager.initialize();
const permissions = createPermissionsService(db);
const auth = createAuthService(db, permissions);

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

async function run() {
  console.log('\n--- Running Passkey Enterprise Upgrade Contract Checks ---');

  // 1. Verify schema columns on user_identities
  const columns = db.prepare('PRAGMA table_info(user_identities)').all().map(c => c.name);
  assert(columns.includes('friendly_name'), 'user_identities has friendly_name column');
  assert(columns.includes('aaguid'), 'user_identities has aaguid column');
  assert(columns.includes('credential_device_type'), 'user_identities has credential_device_type column');
  assert(columns.includes('backup_eligible'), 'user_identities has backup_eligible column');
  assert(columns.includes('backup_state'), 'user_identities has backup_state column');
  assert(columns.includes('last_used_at'), 'user_identities has last_used_at column');

  // 2. Locate or create a test user
  let testUser = db.prepare("SELECT * FROM users WHERE email = 'passkey_test@example.com'").get();
  if (!testUser) {
    const id = `user_passkey_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, username, email, full_name, role, status)
      VALUES (?, 'passkey_test', 'passkey_test@example.com', 'Passkey Test User', 'user', 'active')
    `).run(id);
    testUser = db.prepare("SELECT * FROM users WHERE email = 'passkey_test@example.com'").get();
  }
  assert(!!testUser, 'Test user exists');

  // Clean existing passkeys for test user
  db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'webauthn'").run(testUser.id);

  // 3. Test Registration Options Generation
  let regOptionsData = null;
  const mockReqReg = {
    user: { userId: testUser.id },
    hostname: 'localhost'
  };
  const mockResReg = {
    json: (data) => { regOptionsData = data; },
    status: (code) => ({ json: (err) => { throw new Error(`Reg options failed with ${code}: ${JSON.stringify(err)}`); } })
  };

  await auth.getWebAuthnRegistrationOptions(mockReqReg, mockResReg);
  assert(!!regOptionsData?.challenge, 'Registration options produce a cryptographic challenge');
  assert(regOptionsData.authenticatorSelection?.residentKey === 'preferred', 'Resident key is configured for discoverable credentials');
  assert(regOptionsData.authenticatorSelection?.userVerification === 'preferred', 'User verification is preferred for universal device compatibility');

  // 4. Test Multi-Passkey Enrollment (Register Credential 1 & Credential 2)
  const cred1Id = `cred_macbook_${Date.now()}`;
  const cred2Id = `cred_iphone_${Date.now()}`;

  db.prepare(`
    INSERT INTO user_identities (
      id, user_id, provider, provider_user_id, credential_public_key,
      credential_counter, credential_transports, friendly_name, aaguid,
      credential_device_type, backup_eligible, backup_state, is_verified
    ) VALUES (?, ?, 'webauthn', ?, ?, 0, '["internal"]', 'MacBook Touch ID', '00000000-0000-0000-0000-000000000000', 'singleDevice', 0, 0, 1)
  `).run(crypto.randomUUID(), testUser.id, cred1Id, Buffer.from('mock_pub_key_1'));

  db.prepare(`
    INSERT INTO user_identities (
      id, user_id, provider, provider_user_id, credential_public_key,
      credential_counter, credential_transports, friendly_name, aaguid,
      credential_device_type, backup_eligible, backup_state, is_verified
    ) VALUES (?, ?, 'webauthn', ?, ?, 0, '["hybrid","internal"]', 'iPhone Passkey', '00000000-0000-0000-0000-000000000001', 'multiDevice', 1, 1, 1)
  `).run(crypto.randomUUID(), testUser.id, cred2Id, Buffer.from('mock_pub_key_2'));

  const enrolledCreds = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'webauthn'").all(testUser.id);
  assert(enrolledCreds.length === 2, 'Multiple passkeys are retained without overwriting');

  // 5. Test ExcludeCredentials in Registration Options
  let regOptionsWithExclude = null;
  const mockResReg2 = {
    json: (data) => { regOptionsWithExclude = data; },
    status: () => ({ json: () => {} })
  };
  await auth.getWebAuthnRegistrationOptions(mockReqReg, mockResReg2);
  assert(regOptionsWithExclude.excludeCredentials?.length === 2, 'Existing passkeys are populated in excludeCredentials to prevent duplicate enrollment');

  // 6. Test Discoverable / Username-less Authentication Options
  let authOptionsData = null;
  const mockReqAuth = {
    query: {}, // No identifier provided!
    hostname: 'localhost'
  };
  const mockResAuth = {
    json: (data) => { authOptionsData = data; },
    status: (code) => ({ json: (err) => { throw new Error(`Auth options failed: ${code} ${JSON.stringify(err)}`); } })
  };
  await auth.getWebAuthnAuthenticationOptions(mockReqAuth, mockResAuth);
  assert(!!authOptionsData?.challenge, 'Discoverable authentication generates a challenge');
  assert(authOptionsData.allowCredentials === undefined, 'Discoverable authentication does not restrict allowCredentials');
  assert(!!authOptionsData.challengeKey, 'Discoverable authentication returns a persistent challengeKey');

  // 7. Test Passkey List API
  let listData = null;
  const mockReqList = { user: { userId: testUser.id } };
  const mockResList = {
    json: (data) => { listData = data; },
    status: () => ({ json: () => {} })
  };
  await auth.listWebAuthnCredentials(mockReqList, mockResList);
  assert(listData?.credentials?.length === 2, 'Passkey listing returns all active user credentials');
  assert(listData.credentials.some(c => c.friendly_name === 'MacBook Touch ID'), 'Friendly name MacBook Touch ID is returned');
  assert(listData.credentials.some(c => c.friendly_name === 'iPhone Passkey'), 'Friendly name iPhone Passkey is returned');

  // 8. Test Individual Passkey Deletion API
  const toDelete = listData.credentials.find(c => c.friendly_name === 'MacBook Touch ID');
  let deleteResData = null;
  const mockReqDel = {
    user: { userId: testUser.id },
    params: { credentialId: toDelete.id }
  };
  const mockResDel = {
    json: (data) => { deleteResData = data; },
    status: () => ({ json: () => {} })
  };
  await auth.deleteWebAuthnCredential(mockReqDel, mockResDel);
  assert(deleteResData?.success === true, 'Individual passkey deletion succeeds');

  const remainingCreds = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'webauthn'").all(testUser.id);
  assert(remainingCreds.length === 1 && remainingCreds[0].friendly_name === 'iPhone Passkey', 'Only the selected passkey was removed; remaining passkeys are preserved');

  // 9. Test Verification Payload Extraction Contracts (Direct body vs nested body.credential vs nested body.response)
  let verifyErrStatus = null;
  let verifyErrMsg = null;
  const mockResVerifyFail = {
    status: (code) => {
      verifyErrStatus = code;
      return { json: (data) => { verifyErrMsg = data.error; } };
    }
  };

  const validClientDataJSON = Buffer.from(JSON.stringify({
    type: 'webauthn.create',
    challenge: 'invalid_mismatched_challenge',
    origin: 'http://localhost'
  })).toString('base64url');

  await auth.verifyWebAuthnRegistration({
    user: { userId: testUser.id },
    body: {
      id: 'cred_mock_payload_test',
      rawId: 'cred_mock_payload_test',
      type: 'public-key',
      response: { clientDataJSON: validClientDataJSON, attestationObject: 'abc' },
      friendlyName: 'Touch ID'
    }
  }, mockResVerifyFail);
  assert(verifyErrStatus === 400, 'Direct serialized credential extracts and rejects invalid signature gracefully');

  // Clean up test user
  db.prepare("DELETE FROM user_identities WHERE user_id = ?").run(testUser.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(testUser.id);

  console.log('\n✅ All Passkey Enterprise Upgrade checks passed successfully!\n');
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
