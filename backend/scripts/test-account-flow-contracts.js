/**
 * Contract checks for the login/Profile account flow.
 * Run with: node backend/scripts/test-account-flow-contracts.js
 */
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../core/db/database-manager');

const root = path.resolve(__dirname, '../..');
const authSource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/auth.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'backend/main/macos-api-server.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(root, 'frontend/modules/settings/js/Profile.js'), 'utf8');
const oauthSource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/oauth.js'), 'utf8');
const workerGoogleSource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/worker-google-auth.js'), 'utf8');
const profileAuthSource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/profile.js'), 'utf8');
const identitySource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/identity-service.js'), 'utf8');
const serverSecuritySource = fs.readFileSync(path.join(root, 'backend/main/macos-api-server.js'), 'utf8');
const csrfClientSource = fs.readFileSync(path.join(root, 'frontend/scripts/shared/csrf.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const homeSource = fs.readFileSync(path.join(root, 'frontend/home.html'), 'utf8');
const providerReadme = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/providers/README.md'), 'utf8');
const providerRegistrySource = fs.readFileSync(path.join(root, 'backend/departments/auth/engine/providers/provider-registry.js'), 'utf8');
const authDepartmentIndex = path.join(root, 'backend/departments/auth/index.js');
const adminDepartmentIndex = path.join(root, 'backend/departments/admin/index.js');
const departmentRegistrySource = fs.readFileSync(path.join(root, 'backend/departments/index.js'), 'utf8');
const db = DatabaseManager.initialize();
const sessionService = require('../departments/auth/engine/session-service')(db);
const auditService = require('../departments/auth/engine/audit-service')(db);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

assert(serverSource.includes("app.post('/api/auth/verify-answer'"), 'security-answer route is registered');
assert(serverSource.includes("app.get('/api/auth/google/link'"), 'Google account-link route is registered');
assert(serverSource.includes("app.get('/api/auth/webauthn/registration-options'"), 'WebAuthn registration route is registered');
assert(serverSource.includes("app.post('/api/auth/webauthn/authentication-verify'"), 'WebAuthn authentication route is registered');
assert(authSource.includes('identifier: this.authIdentifier') === false, 'backend remains independent from frontend identifiers');
assert(authSource.includes('consumeChallenge(db'), 'WebAuthn challenges are consumed from persistent storage');
assert(authSource.includes('token_version = token_version + 1'), 'logout revokes server-side sessions');
assert(authSource.includes("decoded.deviceId && !db.prepare('SELECT 1 FROM user_devices"), 'device logout invalidates device-bound sessions');
assert(profileSource.includes("body: JSON.stringify({\n                    answer,") || profileSource.includes('identifier: this.authIdentifier'), 'Profile sends account identifiers for verification');
assert(serverSource.includes("app.get('/api/auth/google/callback', authModule.authMiddleware"), 'OAuth callback requires the current authenticated session');
assert(oauthSource.includes('oauth_states') && oauthSource.includes('expires_at'), 'OAuth linking uses expiring server-side state');
assert(oauthSource.includes('identityService.resolveProviderIdentity'), 'Profile linking uses centralized identity resolution');
assert(workerGoogleSource.includes('identityService.resolveProviderIdentity'), 'Google login uses centralized identity resolution');
assert(identitySource.includes('providerUserId') && identitySource.includes('assertCanLink'), 'Identity service keys providers by stable subject and enforces ownership');
assert(serverSource.includes("app.post('/api/auth/mobile/refresh'"), 'mobile refresh route is registered');
assert(serverSource.includes("app.post('/api/auth/mobile/logout'"), 'mobile logout route is registered');
assert(fs.readFileSync(path.join(root, 'backend/departments/auth/engine/mobile-session-service.js'), 'utf8').includes('refresh_reuse'), 'mobile refresh-token reuse revokes the token family');
assert(profileAuthSource.includes('req.body.google_id') === false, 'Profile updates cannot write Google identity fields from the browser');

const sessionOwner = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1").get();
if (sessionOwner) {
  const sessionRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: () => 'auth-contract-test',
    requestId: `auth-contract-${Date.now()}`
  };
  const createdSession = sessionService.create({ userId: sessionOwner.id, platform: 'web', provider: 'local', req: sessionRequest });
  assert(!!createdSession.sessionId && !!createdSession.secret, 'opaque server session is created');
  const resolvedSession = sessionService.resolve(createdSession.secret, sessionRequest);
  assert(resolvedSession?.userId === sessionOwner.id, 'opaque server session resolves to its owner');
  sessionService.revoke(createdSession.sessionId, 'contract_test');
  assert(sessionService.resolve(createdSession.secret, sessionRequest) === null, 'revoked server session cannot be reused');
  auditService.record({ req: sessionRequest, eventType: 'contract_test', outcome: 'success', userId: sessionOwner.id, sessionId: createdSession.sessionId, platform: 'web', provider: 'local' });
  const auditEvent = db.prepare('SELECT * FROM auth_audit_events WHERE request_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1').get(sessionRequest.requestId, 'contract_test');
  assert(!!auditEvent && auditEvent.user_id === sessionOwner.id && auditEvent.session_id === createdSession.sessionId, 'auth audit event records user and session context');
}

const deviceColumns = db.prepare('PRAGMA table_info(user_devices)').all().map(column => column.name);
const challengeColumns = db.prepare('PRAGMA table_info(webauthn_challenges)').all().map(column => column.name);
const oauthStateColumns = db.prepare('PRAGMA table_info(oauth_states)').all().map(column => column.name);
const refreshTokenColumns = db.prepare('PRAGMA table_info(auth_refresh_tokens)').all().map(column => column.name);
const authSessionColumns = db.prepare('PRAGMA table_info(auth_sessions)').all().map(column => column.name);
assert(deviceColumns.includes('user_id'), 'devices are user-scoped');
assert(challengeColumns.includes('challenge_key') && challengeColumns.includes('expires_at'), 'WebAuthn challenges are persisted');
assert(oauthStateColumns.includes('state') && oauthStateColumns.includes('user_id') && oauthStateColumns.includes('expires_at'), 'OAuth state is persisted and user-scoped');
assert(refreshTokenColumns.includes('token_hash') && refreshTokenColumns.includes('family_id') && refreshTokenColumns.includes('replaced_by'), 'mobile refresh tokens are hashed and rotatable');
assert(authSessionColumns.includes('elevated_until'), 'elevated browser sessions have an explicit expiry field');
assert(workerGoogleSource.includes('requiresReauthentication: true') && !workerGoogleSource.includes('status: \'active\',\n            approved: true,\n            token,'), 'approval status cannot mint a session');
assert(workerGoogleSource.includes('crypto.randomInt(10000, 100000)'), 'new approval invite codes are 5-digit numeric codes');
assert(serverSecuritySource.includes("req.get('x-csrf-token') !== csrfToken"), 'browser mutations enforce CSRF tokens');
assert(csrfClientSource.includes("X-CSRF-Token"), 'shared browser client sends CSRF tokens');
assert(indexSource.includes('/scripts/shared/csrf.js') && homeSource.includes('/scripts/shared/csrf.js'), 'login and home pages load centralized CSRF client');
assert(serverSecuritySource.includes("express.json({ limit: '25mb' })") && serverSecuritySource.includes("express.urlencoded({ limit: '1mb'"), 'API body parsers have bounded limits');
assert(serverSecuritySource.includes('Strict-Transport-Security') && serverSecuritySource.includes('X-Content-Type-Options'), 'production security headers are applied centrally');
assert(serverSecuritySource.includes('GOOGLE_CLIENT_ID') && serverSecuritySource.includes('GOOGLE_CLIENT_SECRET') && serverSecuritySource.includes('GOOGLE_ANDROID_CLIENT_ID'), 'production startup requires web and Android Google OAuth credentials');
assert(providerReadme.includes('providerUserId') && providerReadme.includes('Apple'), 'future providers have a normalized adapter contract');
assert(providerRegistrySource.includes('normalizeIdentity') && providerRegistrySource.includes('register'), 'provider registry normalizes and registers adapters');
assert(fs.existsSync(authDepartmentIndex), 'auth department module exists');
assert(fs.existsSync(adminDepartmentIndex), 'admin department module exists');
assert(departmentRegistrySource.includes("'auth'") && departmentRegistrySource.includes("'admin'"), 'department registry owns auth and admin domains');
assert(serverSource.includes("require('../departments')") && serverSource.includes('departments.auth.create'), 'server uses department auth module');
assert(serverSource.includes("require('../departments')") && serverSource.includes('departments.admin.create'), 'server uses department admin module');
const conflictColumns = db.prepare('PRAGMA table_info(auth_identity_conflicts)').all().map(column => column.name);
assert(conflictColumns.includes('identity_key') && conflictColumns.includes('status') && conflictColumns.includes('resolved_at'), 'legacy identity conflicts have a reviewable quarantine table');

console.log('Account-flow contract checks passed.');
