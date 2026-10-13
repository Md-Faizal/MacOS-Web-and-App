const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const createSessionService = require('./session-service');
const createMobileSessionService = require('./mobile-session-service');
const createAuditService = require('./audit-service');

// These should be in your .env file
const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';
const RECOVERY_KEY = process.env.RECOVERY_KEY || 'emergency_recovery_access';
function challengeKey(userId, kind) {
  return `${kind}:${userId}`;
}

function expectedOrigin(req) {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN;
  const origins = new Set();
  if (req?.headers?.origin) origins.add(req.headers.origin);
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  const host = req?.headers?.['x-forwarded-host'] || (typeof req?.get === 'function' ? req.get('host') : req?.hostname);
  if (host) {
    origins.add(`${proto}://${host}`);
    origins.add(`https://${host.split(':')[0]}`);
    origins.add(`http://${host.split(':')[0]}`);
  }
  origins.add('https://mac.faizal.uk');
  origins.add('https://erp.faizal.uk');
  origins.add('http://localhost:5173');
  origins.add('http://localhost:3000');
  origins.add('http://127.0.0.1:5173');
  origins.add('http://127.0.0.1:3000');
  return Array.from(origins);
}

function getExpectedRPID(req) {
  const rpIDs = new Set();
  if (process.env.WEBAUTHN_RP_ID) rpIDs.add(process.env.WEBAUTHN_RP_ID);
  if (req?.hostname) rpIDs.add(req.hostname);
  const host = (req?.headers?.['x-forwarded-host'] || (typeof req?.get === 'function' ? req.get('host') : '') || '').split(':')[0];
  if (host) rpIDs.add(host);
  rpIDs.add('mac.faizal.uk');
  rpIDs.add('erp.faizal.uk');
  rpIDs.add('localhost');
  return Array.from(rpIDs);
}

function webAuthnUserId(userId) {
  return new Uint8Array(Buffer.from(String(userId), 'utf8'));
}

function saveChallenge(db, key, challenge) {
  db.prepare(`
    INSERT INTO webauthn_challenges (challenge_key, challenge, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(challenge_key) DO UPDATE SET challenge = excluded.challenge, expires_at = excluded.expires_at
  `).run(key, challenge, Date.now() + 5 * 60 * 1000);
}

function consumeChallenge(db, key) {
  const stored = db.prepare(
    'SELECT challenge, expires_at FROM webauthn_challenges WHERE challenge_key = ?'
  ).get(key);
  db.prepare('DELETE FROM webauthn_challenges WHERE challenge_key = ?').run(key);
  if (!stored || stored.expires_at < Date.now()) return null;
  return stored.challenge;
}

module.exports = function(db, permissionsHelper = null) {
  const sessionService = createSessionService(db);
  const mobileSessionService = createMobileSessionService(db);
  const auditService = createAuditService(db);
  if (!permissionsHelper) {
    try {
      permissionsHelper = require('./permissions')(db);
    } catch (_) {}
  }
  const getOwner = () => {
    return db.prepare(`
      SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
             role, status, token_version
      FROM users
      WHERE role = 'owner' OR id = 'admin_auth'
      ORDER BY 
        CASE 
          WHEN id = 'admin_auth' AND password_hash IS NOT NULL THEN 0
          WHEN role = 'owner' AND password_hash IS NOT NULL THEN 1
          WHEN id = 'admin_auth' THEN 2
          WHEN role = 'owner' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT 1
    `).get() || null;
  };

  const getUserById = (userId) => db.prepare(`
    SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
           role, status, token_version
    FROM users
    WHERE id = ?
  `).get(userId);

  const findUserByIdentifier = (identifier) => {
    if (!identifier || typeof identifier !== 'string') return null;
    const normalizedIdentifier = identifier.trim().toLowerCase();
    
    // Direct lookup by username, email, full name, or user id
    const user = db.prepare(`
      SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
             role, status, token_version
      FROM users
      WHERE LOWER(username) = ? 
         OR LOWER(email) = ? 
         OR LOWER(full_name) = ?
         OR id = ?
         OR (role = 'owner' AND ? IN ('admin', 'owner', 'administrator'))
      ORDER BY 
        CASE 
          WHEN LOWER(username) = ? THEN 0 
          WHEN LOWER(email) = ? THEN 1 
          WHEN id = 'admin_auth' THEN 2
          WHEN role = 'owner' THEN 3
          ELSE 4 
        END
      LIMIT 1
    `).get(
      normalizedIdentifier,
      normalizedIdentifier,
      normalizedIdentifier,
      normalizedIdentifier,
      normalizedIdentifier,
      normalizedIdentifier,
      normalizedIdentifier
    );

    if (user) return user;
    if (['admin', 'owner', 'administrator'].includes(normalizedIdentifier)) {
      return getOwner();
    }
    return null;
  };

  const createSessionToken = (user, deviceId, options = {}) => jwt.sign({
    userId: user.id,
    role: user.role,
    tokenVersion: user.token_version || 0,
    deviceId,
    ...options
  }, JWT_SECRET, { expiresIn: options.recovery || options.elevated ? '1h' : '7d' });

  const setSessionCookie = (req, res, token) => {
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
      sameSite: 'Lax',
      path: '/'
    });
  };

  const publicUser = (user, deviceId) => {
    let profile = null;
    try {
      profile = db.prepare('SELECT full_name, profile_picture, email_id, name_source, picture_source, google_name, google_email, google_picture FROM user_profile WHERE id = ?').get(user.id);
    } catch (_) {}
    const actualName = (profile?.name_source === 'google' && profile?.google_name)
      ? profile.google_name
      : (profile?.full_name || user.full_name || user.username);
    const loginEmail = profile?.email_id || user.email || profile?.google_email || '';
    let displayPicture = profile?.profile_picture || user.google_picture || profile?.google_picture || null;
    if (profile?.picture_source === 'google' && (user.google_picture || profile?.google_picture)) {
      displayPicture = user.google_picture || profile?.google_picture;
    }
    return {
      id: user.id,
      username: actualName,
      fullName: actualName,
      email: loginEmail,
      avatar: displayPicture,
      role: user.role,
      status: user.status,
      hasLocalPassword: !!user.password_hash,
      deviceId
    };
  };

  const getClientApp = (req, deviceType, clientType) => {
    const appHeader = (req?.headers?.['x-client-app'] || '').toString().trim().toLowerCase();
    const clientApp = (clientType || req?.body?.clientApp || appHeader || '').toString().trim().toLowerCase();
    const normalized = clientApp === 'zentra' ? 'zentra' :
      clientApp === 'android' ? 'android' :
      clientApp === 'macos' ? 'macos' :
      (deviceType || '').toString().toLowerCase().includes('android') ? 'android' :
      'macos';

    return normalized;
  };

  const issueWebSession = (req, res, user, deviceId, provider = 'local', elevated = false, platform = 'web', appName = 'macos') => {
    const session = sessionService.create({
      userId: user.id,
      deviceId,
      platform,
      appName,
      provider,
      elevated,
      req
    });
    sessionService.setCookie(req, res, session.secret);
    return session;
  };

  const issueMobileSession = (req, user, deviceId, provider = 'local') => mobileSessionService.create({
    user,
    deviceId,
    provider,
    req
  });

  return {
    /**
     * Middleware to protect routes
     */
    authMiddleware: (req, res, next) => {
      const isAndroidClient = (req.headers?.['x-app-type'] === 'native_android') ||
                              ((req.headers?.['x-client-platform'] || '').toLowerCase() === 'android');

      // 1. Authorization header (Bearer token) ALWAYS takes absolute priority over cookies.
      const authHeader = req.headers?.authorization;
      const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;

      if (bearerToken) {
        try {
          const decoded = jwt.verify(bearerToken, JWT_SECRET);
          const user = decoded.userId
            ? db.prepare('SELECT id, role, status, token_version FROM users WHERE id = ?').get(decoded.userId)
            : null;

          if (!user || user.status !== 'active' ||
              (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.token_version || 0)) ||
              (decoded.deviceId && !db.prepare('SELECT 1 FROM user_devices WHERE id = ? AND user_id = ?').get(decoded.deviceId, user.id))) {
            return res.status(401).json({ error: 'Unauthorized: Session is no longer valid' });
          }

          req.user = { ...decoded, userId: user.id, id: user.id, role: user.role };

          // HEARTBEAT: Update last_seen for the device if deviceId is present in token
          if (decoded.deviceId) {
            try {
              db.prepare("UPDATE user_devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND user_id = ?")
                .run(decoded.deviceId, req.user.userId);
            } catch (err) {
              // Non-critical, ignore
            }
          }

          return next();
        } catch (err) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
      }

      // Native Android requests MUST NOT fall back to ambient web cookies
      if (isAndroidClient) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      // 2. Web browser session fallback
      const serverSession = sessionService.resolve(req.cookies?.[sessionService.cookieName], req);
      if (serverSession) {
        if (serverSession.deviceId) {
          const deviceExists = db.prepare('SELECT 1 FROM user_devices WHERE id = ? AND user_id = ?').get(serverSession.deviceId, serverSession.userId);
          if (!deviceExists) {
            sessionService.revoke(serverSession.sessionId, 'device_unlinked_or_removed');
            sessionService.clearCookie(res);
            return res.status(401).json({ error: 'Unauthorized: Device has been logged out from this account' });
          }
          try {
            db.prepare("UPDATE user_devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND user_id = ?")
              .run(serverSession.deviceId, serverSession.userId);
          } catch (e) { }
        }
        req.user = serverSession;
        return next();
      }

      // 3. Fall back to browser auth_token cookie
      const cookieToken = req.cookies?.auth_token;
      if (cookieToken) {
        try {
          const decoded = jwt.verify(cookieToken, JWT_SECRET);
          const user = decoded.userId
            ? db.prepare('SELECT id, role, status, token_version FROM users WHERE id = ?').get(decoded.userId)
            : null;

          if (!user || user.status !== 'active' ||
              (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.token_version || 0)) ||
              (decoded.deviceId && !db.prepare('SELECT 1 FROM user_devices WHERE id = ? AND user_id = ?').get(decoded.deviceId, user.id))) {
            return res.status(401).json({ error: 'Unauthorized: Session is no longer valid' });
          }

          req.user = { ...decoded, userId: user.id, id: user.id, role: user.role };
          return next();
        } catch (err) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
      }

      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    },

    /**
     * Get security status (public)
     */
    getStatus: (req, res) => {
      try {
        const auth = req.user ? getUserById(req.user.userId) : getOwner();
        res.json({ 
          passwordSet: !!(auth && auth.password_hash),
          hasSecurityQuestion: !!(auth && auth.security_answer_hash)
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve security status' });
      }
    },

    /**
     * Check username availability (real-time validation)
     */
    checkUsername: (req, res) => {
      try {
        const username = req.query?.username || req.body?.username;
        if (!username || typeof username !== 'string') {
          return res.status(400).json({ available: false, message: 'Username is required' });
        }

        const cleanUsername = username.trim();
        if (cleanUsername.length < 3) {
          return res.json({ available: false, message: 'Must be at least 3 characters' });
        }
        if (cleanUsername.length > 30) {
          return res.json({ available: false, message: 'Cannot exceed 30 characters' });
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
          return res.json({ available: false, message: 'Only letters, numbers, underscores, dashes, or dots allowed' });
        }

        const reserved = ['admin', 'owner', 'root', 'system', 'api', 'guest', 'null', 'undefined'];
        if (reserved.includes(cleanUsername.toLowerCase())) {
          return res.json({ available: false, message: 'This username is reserved' });
        }

        let currentUserId = null;
        if (req.user?.userId) {
          currentUserId = req.user.userId;
        } else {
          const serverSession = sessionService?.resolve ? sessionService.resolve(req.cookies?.[sessionService.cookieName], req) : null;
          if (serverSession) currentUserId = serverSession.userId;
        }

        const existing = db.prepare(`
          SELECT id, username FROM users 
          WHERE (LOWER(username) = ? OR LOWER(email) = ?)
        `).get(cleanUsername.toLowerCase(), cleanUsername.toLowerCase());

        if (existing) {
          if (currentUserId && existing.id === currentUserId) {
            return res.json({ available: true, isCurrent: true, message: 'Current username' });
          }
          return res.json({ available: false, message: 'Username is already taken' });
        }

        return res.json({ available: true, message: 'Username is available' });
      } catch (error) {
        console.error('Check username error:', error);
        res.status(500).json({ available: false, error: 'Failed to check username availability' });
      }
    },

    /**
     * Get list of security questions
     */
    getSecurityQuestions: (req, res) => {
      const questions = [
        "What was the name of your first pet?",
        "In what city were you born?",
        "What was your childhood nickname?",
        "What is the name of your favorite book?",
        "What was the model of your first car?",
        "What school did you attend for sixth grade?",
        "What is the name of your favorite childhood friend?"
      ];
      res.json({ questions });
    },

    getWebAuthnRegistrationOptions: async (req, res) => {
      try {
        const user = getUserById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'Account not found' });

        const existingCredentials = db.prepare(`
          SELECT provider_user_id, credential_transports
          FROM user_identities
          WHERE user_id = ? AND provider = 'webauthn'
        `).all(user.id);

        const options = await generateRegistrationOptions({
          rpName: process.env.WEBAUTHN_RP_NAME || 'MacOS Web',
          rpID: process.env.WEBAUTHN_RP_ID || req.hostname,
          userID: webAuthnUserId(user.id),
          userName: user.email || user.username || user.id,
          userDisplayName: user.full_name || user.username || user.email || 'MacOS User',
          attestationType: 'none',
          excludeCredentials: existingCredentials.map(cred => ({
            id: cred.provider_user_id,
            transports: cred.credential_transports ? JSON.parse(cred.credential_transports) : undefined
          })),
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred'
          }
        });

        saveChallenge(db, challengeKey(user.id, 'registration'), options.challenge);
        res.json(options);
      } catch (error) {
        console.error('WebAuthn registration options error:', error);
        res.status(500).json({ error: 'Unable to prepare Passkey setup' });
      }
    },

    verifyWebAuthnRegistration: async (req, res) => {
      try {
        const user = getUserById(req.user.userId);
        const challenge = user
          ? consumeChallenge(db, challengeKey(req.user.userId, 'registration'))
          : null;
        if (!user || !challenge) {
          return res.status(400).json({ error: 'Passkey setup has expired. Try again.' });
        }

        // Extract the full credential payload with id, rawId, type, and response
        const rawResponse = (req.body && req.body.id ? req.body : null) ||
          (req.body && req.body.credential && req.body.credential.id ? req.body.credential : null) ||
          (req.body && req.body.response && req.body.response.id ? req.body.response : null) ||
          req.body;

        const verification = await verifyRegistrationResponse({
          response: rawResponse,
          expectedChallenge: challenge,
          expectedOrigin: expectedOrigin(req),
          expectedRPID: getExpectedRPID(req),
          requireUserVerification: false
        });
        if (!verification.verified || !verification.registrationInfo) {
          return res.status(400).json({ error: 'Passkey registration was not verified' });
        }

        const credential = verification.registrationInfo.credential;
        const { credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
        const friendlyName = (req.body.friendlyName || req.body.deviceName || (credentialDeviceType === 'multiDevice' ? 'Synced Passkey' : 'Device Passkey')).trim();

        // Check if this specific credential ID is already registered for this user
        const existingCred = db.prepare(`
          SELECT id FROM user_identities
          WHERE provider = 'webauthn' AND provider_user_id = ?
        `).get(credential.id);

        if (existingCred) {
          db.prepare(`
            UPDATE user_identities SET
              credential_public_key = ?,
              credential_counter = ?,
              credential_transports = ?,
              friendly_name = COALESCE(?, friendly_name),
              aaguid = COALESCE(?, aaguid),
              credential_device_type = ?,
              backup_eligible = ?,
              backup_state = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            Buffer.from(credential.publicKey),
            credential.counter,
            JSON.stringify(credential.transports || []),
            friendlyName,
            aaguid || null,
            credentialDeviceType || 'singleDevice',
            credentialBackedUp ? 1 : 0,
            credentialBackedUp ? 1 : 0,
            existingCred.id
          );
        } else {
          db.prepare(`
            INSERT INTO user_identities (
              id, user_id, provider, provider_user_id, credential_public_key,
              credential_counter, credential_transports, friendly_name, aaguid,
              credential_device_type, backup_eligible, backup_state, is_verified
            ) VALUES (?, ?, 'webauthn', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            crypto.randomUUID(),
            user.id,
            credential.id,
            Buffer.from(credential.publicKey),
            credential.counter,
            JSON.stringify(credential.transports || []),
            friendlyName,
            aaguid || null,
            credentialDeviceType || 'singleDevice',
            credentialBackedUp ? 1 : 0,
            credentialBackedUp ? 1 : 0
          );
        }

        res.json({ success: true, credentialId: credential.id });
      } catch (error) {
        console.error('WebAuthn registration verification error:', error);
        res.status(400).json({ error: 'Passkey registration failed' });
      }
    },

    getWebAuthnAuthenticationOptions: async (req, res) => {
      try {
        const identifier = (req.query.identifier || '').trim();
        let credentials = [];
        let user = null;

        if (identifier) {
          user = findUserByIdentifier(identifier);
          if (!user) return res.status(404).json({ error: 'Account not found' });

          credentials = db.prepare(`
            SELECT provider_user_id, credential_transports
            FROM user_identities
            WHERE user_id = ? AND provider = 'webauthn' AND is_verified = 1
          `).all(user.id);

          if (credentials.length === 0) {
            return res.status(404).json({ error: 'Passkey is not configured for this account' });
          }
        }

        const options = await generateAuthenticationOptions({
          rpID: process.env.WEBAUTHN_RP_ID || req.hostname,
          userVerification: 'preferred',
          allowCredentials: credentials.length > 0 ? credentials.map(credential => ({
            id: credential.provider_user_id,
            transports: credential.credential_transports
              ? JSON.parse(credential.credential_transports)
              : undefined
          })) : undefined
        });

        // Save challenge by user ID when identifier provided, and by unique challenge key for discoverable/conditional UI
        if (user) {
          saveChallenge(db, challengeKey(user.id, 'authentication'), options.challenge);
        }
        const globalChallengeKey = `passkey_challenge_${options.challenge}`;
        saveChallenge(db, globalChallengeKey, options.challenge);

        res.json({ ...options, challengeKey: globalChallengeKey });
      } catch (error) {
        console.error('WebAuthn authentication options error:', error);
        res.status(500).json({ error: 'Unable to prepare Passkey sign-in' });
      }
    },

    verifyWebAuthnAuthentication: async (req, res) => {
      try {
        const { identifier, deviceName, deviceType, challengeKey: clientChallengeKey } = req.body;
        const credResponse = (req.body && req.body.id ? req.body : null) ||
          (req.body && req.body.credential && req.body.credential.id ? req.body.credential : null) ||
          (req.body && req.body.response && req.body.response.id ? req.body.response : null) ||
          req.body.response ||
          req.body;
        const credentialId = credResponse?.id;

        let user = identifier ? findUserByIdentifier(identifier) : null;
        let challenge = null;

        if (user) {
          challenge = consumeChallenge(db, challengeKey(user.id, 'authentication'));
        }

        // Try challenge from clientChallengeKey or clientDataJSON challenge if not consumed yet
        if (!challenge && clientChallengeKey) {
          challenge = consumeChallenge(db, clientChallengeKey);
        }
        if (!challenge && credResponse?.response?.clientDataJSON) {
          try {
            const parsedClientData = JSON.parse(Buffer.from(credResponse.response.clientDataJSON, 'base64url').toString('utf8'));
            if (parsedClientData?.challenge) {
              challenge = consumeChallenge(db, `passkey_challenge_${parsedClientData.challenge}`);
            }
          } catch (e) {}
        }

        // Locate credential record
        let credential = null;
        if (user) {
          credential = db.prepare(`
            SELECT id, user_id, provider_user_id, credential_public_key, credential_counter, credential_transports
            FROM user_identities
            WHERE user_id = ? AND provider = 'webauthn' AND provider_user_id = ? AND is_verified = 1
          `).get(user.id, credentialId);
        }

        // If not found yet (e.g. discoverable login without initial identifier), locate user by credentialId
        if (!credential && credentialId) {
          credential = db.prepare(`
            SELECT id, user_id, provider_user_id, credential_public_key, credential_counter, credential_transports
            FROM user_identities
            WHERE provider = 'webauthn' AND provider_user_id = ? AND is_verified = 1
          `).get(credentialId);

          if (credential) {
            user = getUserById(credential.user_id);
            if (!challenge && user) {
              challenge = consumeChallenge(db, challengeKey(user.id, 'authentication'));
            }
          }
        }

        if (!user || !credential || !challenge) {
          return res.status(401).json({ error: 'Passkey sign-in has expired or credential is not recognized. Try again.' });
        }

        const verification = await verifyAuthenticationResponse({
          response: credResponse,
          expectedChallenge: challenge,
          expectedOrigin: expectedOrigin(req),
          expectedRPID: getExpectedRPID(req),
          requireUserVerification: false,
          credential: {
            id: credential.provider_user_id,
            publicKey: new Uint8Array(credential.credential_public_key),
            counter: credential.credential_counter || 0,
            transports: credential.credential_transports
              ? JSON.parse(credential.credential_transports)
              : undefined
          }
        });
        if (!verification.verified) return res.status(401).json({ error: 'Passkey verification failed' });

        try {
          db.prepare(`
            UPDATE user_identities 
            SET credential_counter = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(verification.authenticationInfo.newCounter, credential.id);
        } catch (e) {
          db.prepare('UPDATE user_identities SET credential_counter = ? WHERE id = ?')
            .run(verification.authenticationInfo.newCounter, credential.id);
        }

        const isWebLogin = typeof req?.get === 'function' && (deviceType || 'Web').toLowerCase() !== 'android';
        if (isWebLogin) {
          const session = issueWebSession(req, res, user, null, 'webauthn');
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: session.sessionId, platform: 'web', provider: 'webauthn' });
          return res.json({ success: true, sessionId: session.sessionId, user: publicUser(user) });
        }

        const token = createSessionToken(user);
        setSessionCookie(req, res, token);
        res.json({ success: true, token, user: publicUser(user) });
      } catch (error) {
        console.error('WebAuthn authentication verification error:', error);
        res.status(401).json({ error: 'Passkey sign-in failed' });
      }
    },

    listWebAuthnCredentials: async (req, res) => {
      try {
        const user = getUserById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'Account not found' });
        const credentials = db.prepare(`
          SELECT id, provider_user_id, friendly_name, aaguid, credential_device_type,
                 backup_eligible, backup_state, last_used_at, created_at
          FROM user_identities
          WHERE user_id = ? AND provider = 'webauthn' AND is_verified = 1
          ORDER BY created_at DESC
        `).all(user.id);
        res.json({ credentials });
      } catch (error) {
        console.error('List WebAuthn credentials error:', error);
        res.status(500).json({ error: 'Unable to list passkeys' });
      }
    },

    deleteWebAuthnCredential: async (req, res) => {
      try {
        const user = getUserById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'Account not found' });
        const credentialId = req.params.credentialId;
        const result = db.prepare(`
          DELETE FROM user_identities
          WHERE user_id = ? AND provider = 'webauthn' AND (id = ? OR provider_user_id = ?)
        `).run(user.id, credentialId, credentialId);
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Passkey not found' });
        }
        res.json({ success: true, message: 'Passkey removed' });
      } catch (error) {
        console.error('Delete WebAuthn credential error:', error);
        res.status(500).json({ error: 'Unable to remove passkey' });
      }
    },

    registerMobileBiometric: async (req, res) => {
      try {
        const user = req.user?.userId ? getUserById(req.user.userId) : null;
        if (!user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const { deviceId, deviceName } = req.body || {};
        const effectiveDeviceId = (deviceId || req.user.deviceId || `android_${Date.now()}`).trim();
        const effectiveDeviceName = (deviceName || 'Android Device').trim();

        // Remove previous android_biometric credentials for this user for clean enrollment
        db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'android_biometric'").run(user.id);

        db.prepare(`
          INSERT INTO user_identities (
            id, user_id, provider, provider_user_id, credential_device_type, is_verified, created_at, updated_at
          ) VALUES (?, ?, 'android_biometric', ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          `bio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          user.id,
          effectiveDeviceId,
          effectiveDeviceName
        );

        auditService.record({
          req,
          eventType: 'biometric_enrolled',
          outcome: 'success',
          userId: user.id,
          deviceId: effectiveDeviceId,
          platform: 'android',
          provider: 'android_biometric'
        });

        res.json({ success: true, message: 'Biometrics enrolled successfully' });
      } catch (error) {
        console.error('Mobile biometric registration error:', error);
        res.status(500).json({ error: 'Failed to register biometric credential' });
      }
    },

    revokeMobileBiometric: async (req, res) => {
      try {
        const user = req.user?.userId ? getUserById(req.user.userId) : null;
        if (!user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'android_biometric'").run(user.id);

        auditService.record({
          req,
          eventType: 'biometric_revoked',
          outcome: 'success',
          userId: user.id,
          platform: 'android',
          provider: 'android_biometric'
        });

        res.json({ success: true, message: 'Biometrics removed successfully' });
      } catch (error) {
        console.error('Mobile biometric revoke error:', error);
        res.status(500).json({ error: 'Failed to revoke biometric credential' });
      }
    },


    /**
     * Get the user's selected security question (public for challenges, populated with answer for authenticated callers)
     */
    getChallengeQuestion: (req, res) => {
      try {
        const identifier = (req.query.identifier || '').trim();
        let auth = null;
        let isAuth = false;

        if (req.user) {
          auth = getUserById(req.user.userId);
          isAuth = true;
        } else {
          // Check active session if req.user was not populated by optional middleware
          const session = sessionService?.resolve ? sessionService.resolve(req.cookies?.[sessionService.cookieName], req) : null;
          if (session) {
            auth = getUserById(session.userId);
            isAuth = true;
          } else if (identifier) {
            auth = findUserByIdentifier(identifier);
            if (!auth) {
              return res.status(404).json({ error: 'No account found with this username or email' });
            }
          } else {
            auth = getOwner();
          }
        }

        let answerPlain = null;
        if (isAuth && auth) {
          try {
            const colCheck = db.prepare("SELECT security_answer FROM users WHERE id = ?").get(auth.id);
            if (colCheck && colCheck.security_answer) {
              answerPlain = colCheck.security_answer;
            }
          } catch (e) {}
        }

        res.json({
          question: auth ? (auth.security_question || null) : null,
          answer: answerPlain,
          hasSecurityQuestion: !!(auth && (auth.security_question || auth.security_answer_hash))
        });
      } catch (error) {
        console.error('Challenge retrieval error:', error);
        res.status(500).json({ error: 'Failed to retrieve challenge question' });
      }
    },

    /**
     * Verify security answer / recovery key / password for step-up elevation
     */
    verifyAnswer: (req, res) => {
      try {
        const { answer, recoveryKey, password, identifier } = req.body;
        const targetIdentifier = identifier || (req.user ? (req.user.username || req.user.email) : '');

        const auth = req.user
          ? getUserById(req.user.userId)
          : (targetIdentifier ? findUserByIdentifier(targetIdentifier) : null);

        if (!auth) {
          return res.status(404).json({ error: 'Unable to verify account' });
        }

        let isVerified = false;
        let providerType = 'question';

        if (recoveryKey) {
          if (recoveryKey.trim() === RECOVERY_KEY) {
            isVerified = true;
            providerType = 'recovery_key';
          } else {
            return res.status(401).json({ error: 'Invalid recovery key' });
          }
        } else if (password) {
          if (auth.password_hash && bcrypt.compareSync(password, auth.password_hash)) {
            isVerified = true;
            providerType = 'password';
          } else {
            return res.status(401).json({ error: 'Incorrect password' });
          }
        } else if (answer) {
          if (!auth.security_answer_hash) {
            return res.status(404).json({ error: 'Security question not set up for this account' });
          }
          if (bcrypt.compareSync(answer.toLowerCase().trim(), auth.security_answer_hash)) {
            isVerified = true;
            providerType = 'security_question';
          } else {
            return res.status(401).json({ error: 'Incorrect answer' });
          }
        } else {
          return res.status(400).json({ error: 'Verification credential required' });
        }

        if (isVerified) {
          const deviceId = req.user?.deviceId || null;
          const session = issueWebSession(req, res, auth, deviceId, 'recovery', true);
          auditService.record({ req, eventType: 'step_up', outcome: 'success', userId: auth.id, sessionId: session.sessionId, deviceId, platform: 'web', provider: providerType });
          return res.json({ success: true, sessionId: session.sessionId, verifiedBy: providerType });
        }

        return res.status(401).json({ error: 'Verification failed' });
      } catch (error) {
        console.error('Verify answer error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    /**
     * Login handler
     */
    login: (req, res) => {
      try {
        const { identifier, password, deviceName, deviceType, clientType, biometric } = req.body;
        const owner = getOwner();

        if (!identifier && !biometric) {
          return res.status(400).json({ error: 'Username or email is required' });
        }
        const user = biometric ? owner : findUserByIdentifier(identifier);
        if (!user || user.status !== 'active' || !user.password_hash) {
          return res.status(401).json({ error: 'Invalid username/email or password' });
        }

        if (!biometric && password === RECOVERY_KEY) {
          if (typeof req?.get === 'function') {
            const session = issueWebSession(req, res, user, null, 'recovery', true);
            auditService.record({ req, eventType: 'recovery', outcome: 'success', userId: user.id, sessionId: session.sessionId, platform: 'web', provider: 'recovery' });
            return res.json({ success: true, message: 'Recovery access granted', sessionId: session.sessionId, needsReset: true });
          }
          const token = createSessionToken(user, undefined, { recovery: true });
          setSessionCookie(req, res, token);
          return res.json({ success: true, message: 'Recovery access granted', token, needsReset: true });
        }

        if (biometric !== true && !bcrypt.compareSync(password, user.password_hash)) {
          return res.status(401).json({ error: 'Invalid username/email or password' });
        }

        const clientPlatformHeader = (req.headers?.['x-client-platform'] || '').toLowerCase();
        const clientAppHeader = (req.headers?.['x-client-app'] || '').toLowerCase();
        const parsedClientType = (clientType || '').toLowerCase();
        const parsedDeviceType = (deviceType || '').toLowerCase();
        const detectedAppName = getClientApp(req, deviceType, clientType);
        const isPWA = (clientType === 'pwa') || (deviceType && deviceType.toLowerCase().includes('pwa')) || (clientPlatformHeader === 'pwa');
        const isAndroidApp =
          (clientType === 'native_android') ||
          (deviceType && (parsedDeviceType === 'android' || parsedDeviceType === 'android app')) ||
          (clientPlatformHeader === 'android' && !isPWA) ||
          (req.headers?.['x-app-type'] === 'native_android') ||
          (clientAppHeader === 'android') ||
          (parsedClientType === 'android') ||
          (parsedClientType === 'native_android');
        const isZentraApp = (detectedAppName === 'zentra') || (clientAppHeader === 'zentra') || (parsedClientType === 'zentra');
        const isWebLogin = !isAndroidApp;

        const resolvedClientType = isAndroidApp ? 'android' : (isPWA ? 'pwa' : (isZentraApp ? 'web' : 'web'));
        const resolvedDeviceType = isAndroidApp ? 'Android App' : (isPWA ? 'Mobile (PWA)' : (deviceType || (isWebLogin ? 'Desktop' : 'Mobile')));

        // Record device info scoped specifically to this authenticated user
        let resolvedDeviceName = (deviceName || '').trim();
        if (!resolvedDeviceName || resolvedDeviceName === 'Generic Device' || resolvedDeviceName.startsWith("Sign's ")) {
          resolvedDeviceName = isAndroidApp ? 'Android Device' : (isPWA ? 'Mobile Device' : (isWebLogin ? 'Windows PC (x64)' : 'Mobile Device'));
        }
        // Strip any previous or incorrect user name prefix
        resolvedDeviceName = resolvedDeviceName.replace(/^[A-Za-z0-9_]+'s\s+/, '');
        resolvedDeviceName = resolvedDeviceName.replace(/\s*\((PWA|Native App|Mobile Web)\)\s*$/i, '').trim();

        const firstName = (user.full_name || user.username || '').split(' ')[0].trim();
        if (firstName && !['sign', 'generic', 'user'].includes(firstName.toLowerCase())) {
          resolvedDeviceName = `${firstName}'s ${resolvedDeviceName}`;
        }

        if (isAndroidApp) {
          resolvedDeviceName = `${resolvedDeviceName} (Native App)`;
        } else if (isPWA) {
          resolvedDeviceName = `${resolvedDeviceName} (PWA)`;
        }

        db.prepare('UPDATE user_devices SET is_current = 0 WHERE user_id = ?').run(user.id);
        db.prepare(`
          INSERT INTO user_devices (user_id, device_name, device_type, client_type, app_name, is_current, last_login, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          ON CONFLICT(user_id, device_name) DO UPDATE SET
            last_login = excluded.last_login,
            last_seen = excluded.last_seen,
            is_current = 1,
            device_type = excluded.device_type,
            client_type = excluded.client_type,
            app_name = excluded.app_name
        `).run(user.id, resolvedDeviceName, resolvedDeviceType, resolvedClientType, detectedAppName, 1);

        // Record history and get deviceId
        const device = db.prepare('SELECT id FROM user_devices WHERE user_id = ? AND device_name = ?')
          .get(user.id, resolvedDeviceName);
        const deviceId = device?.id;

        if (device) {
          db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(device.id, 'success');
        }

        const permissions = permissionsHelper && user.role === 'worker'
          ? permissionsHelper.getUserPermissionsSnapshot(user.id, 'worker')
          : null;

        if (isWebLogin) {
          const session = issueWebSession(req, res, user, deviceId, 'local', false, resolvedClientType, detectedAppName);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: session.sessionId, deviceId, platform: resolvedClientType, provider: 'local' });
          const token = createSessionToken(user, deviceId);
          setSessionCookie(req, res, token);
          return res.json({ success: true, sessionId: session.sessionId, token, user: publicUser(user, deviceId), permissions, appName: detectedAppName });
        }

        if (typeof req?.get === 'function') {
          const mobileSession = issueMobileSession(req, user, deviceId);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: mobileSession.refreshTokenId, deviceId, platform: 'android', provider: 'local' });
          return res.json({ success: true, token: mobileSession.accessToken, refreshToken: mobileSession.refreshToken, expiresIn: mobileSession.expiresIn, user: publicUser(user, deviceId), permissions, appName: 'android' });
        }

        const token = createSessionToken(user, deviceId);
        setSessionCookie(req, res, token);
        return res.json({ success: true, token, user: publicUser(user, deviceId), permissions, appName: detectedAppName });

      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    /**
     * Get all logged in devices
     */
    getDevices: (req, res) => {
      try {
        const userId = req.user.userId || req.user.id;
        const currentDeviceId = req.user.deviceId || null;
        const currentSessionId = req.user.sessionId || null;

        const devices = db.prepare(`
          SELECT d.*,
                 (d.id = ?) as is_current_device,
                 (
                   SELECT COUNT(1) FROM auth_sessions s
                   WHERE s.user_id = d.user_id AND s.device_id = d.id AND s.revoked_at IS NULL
                     AND s.idle_expires_at > CURRENT_TIMESTAMP AND s.absolute_expires_at > CURRENT_TIMESTAMP
                 ) as active_session_count
          FROM user_devices d
          WHERE d.user_id = ?
          ORDER BY (d.id = ?) DESC, d.last_seen DESC, d.last_login DESC
        `).all(currentDeviceId, userId, currentDeviceId);

        res.json({
          devices: devices.map(d => {
            const resolvedClient = d.client_type || (d.device_type?.includes('PWA') ? 'pwa' : (d.device_type?.includes('Android') ? 'android' : 'web'));
            const resolvedApp = (d.app_name || (d.device_type?.includes('Android') ? 'android' : 'macos')).toString().trim().toLowerCase() || 'macos';
            return {
              ...d,
              app_name: resolvedApp,
              appName: resolvedApp,
              client_type: resolvedClient,
              clientType: resolvedClient,
              isCurrent: Boolean(d.is_current_device),
              hasActiveSession: d.active_session_count > 0 || Boolean(d.is_current_device)
            };
          }),
          currentDeviceId,
          currentSessionId
        });
      } catch (error) {
        console.error('Failed to retrieve devices:', error);
        res.status(500).json({ error: 'Failed to retrieve devices' });
      }
    },

    /**
     * Delete a device (Logout from this device)
     */
    logoutDevice: (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.userId || req.user.id;
        const isSelf = (req.user.deviceId && req.user.deviceId === id);
        const device = db.prepare('SELECT id, app_name FROM user_devices WHERE id = ? AND user_id = ?').get(id, userId);

        db.transaction(() => {
          db.prepare('DELETE FROM user_devices WHERE id = ? AND user_id = ?').run(id, userId);
          sessionService.revokeDevice(id, userId, 'device_logged_out');
        })();

        if (isSelf) {
          sessionService.clearCookie(res);
          res.clearCookie('auth_token', { path: '/' });
        }

        res.json({
          success: true,
          isSelf,
          appName: device?.app_name || 'macos',
          message: isSelf ? 'Current device session ended' : 'Device logged out successfully'
        });
      } catch (error) {
        console.error('Logout device error:', error);
        res.status(500).json({ error: 'Failed to logout device' });
      }
    },

    /**
     * Logout all devices (or all other devices)
     */
    logoutAllDevices: (req, res) => {
      try {
        const userId = req.user.userId || req.user.id;
        const currentDeviceId = req.user.deviceId || null;
        const currentSessionId = req.user.sessionId || null;
        const keepCurrent = req.query.keepCurrent === 'true' || req.body?.keepCurrent === true;
        const requestedAppName = ((req.headers?.['x-client-app'] || req.body?.appName || req.query?.appName || '').toString().trim().toLowerCase() || req.user?.appName || 'macos');

        if (keepCurrent && currentDeviceId) {
          // Keep this device, remove other devices & sessions only from the same app scope.
          db.transaction(() => {
            db.prepare('DELETE FROM user_devices WHERE user_id = ? AND id != ? AND app_name = ?').run(userId, currentDeviceId, requestedAppName);
            sessionService.revokeOtherSessions(userId, currentSessionId, 'all_other_devices_logged_out', requestedAppName);
          })();
          res.json({ success: true, appName: requestedAppName, message: 'All other devices for this app were logged out successfully' });
        } else {
          // Complete global logout
          db.transaction(() => {
            db.prepare('DELETE FROM user_devices WHERE user_id = ?').run(userId);
            db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
            sessionService.revokeUser(userId, 'global_logout');
          })();
          sessionService.clearCookie(res);
          res.clearCookie('auth_token', { path: '/' });
          res.json({ success: true, isSelf: true, message: 'All devices logged out' });
        }
      } catch (error) {
        console.error('Logout all devices error:', error);
        res.status(500).json({ error: 'Failed to logout all devices' });
      }
    },

    /**
     * Get login history for a specific device
     */
    getDeviceHistory: (req, res) => {
      try {
        const { id } = req.params;
        const history = db.prepare(`
          SELECT login_history.*
          FROM login_history
          INNER JOIN user_devices ON user_devices.id = login_history.device_id
          WHERE login_history.device_id = ? AND user_devices.user_id = ?
          ORDER BY login_history.login_time DESC
          LIMIT 10
        `).all(id, req.user.userId);
        res.json({ history });
      } catch (error) {
        console.error('Failed to retrieve device history:', error);
        res.status(500).json({ error: 'Failed to retrieve device history' });
      }
    },

    /**
     * Update/Setup security settings (authenticated/elevated)
     */
    updateSecurity: (req, res) => {
      try {
        const { currentPassword, newPassword, securityQuestion, securityAnswer, email, username, identifier } = req.body;
        
        const auth = req.user ? getUserById(req.user.userId) : getOwner();
        const isInitialSetup = !auth || !auth.password_hash;

        // Ensure user is EITHER correct on password OR elevated via security question OR it's initial setup
        if (!isInitialSetup && !req.user?.elevated && !req.user?.recovery) {
          if (!auth || !auth.password_hash || !currentPassword || !bcrypt.compareSync(currentPassword, auth.password_hash)) {
            return res.status(401).json({ 
              error: 'Authentication required to change security settings',
              requiresSecurityCheck: true 
            });
          }
        }

        // Prepare Updates
        const updates = [];
        const params = [];

        let targetEmail = email;
        let targetUsername = username;

        if (identifier && typeof identifier === 'string' && identifier.trim()) {
          const cleanId = identifier.trim();
          if (cleanId.includes('@')) {
            targetEmail = cleanId;
          } else {
            targetUsername = cleanId;
          }
        }

        if (targetEmail && typeof targetEmail === 'string' && targetEmail.trim()) {
          const cleanEmail = targetEmail.trim().toLowerCase();
          const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(cleanEmail, auth.id);
          if (existing) {
            return res.status(400).json({ error: 'This email is already in use by another account' });
          }
          updates.push('email = ?');
          params.push(cleanEmail);
        }

        if (targetUsername && typeof targetUsername === 'string' && targetUsername.trim()) {
          const cleanUsername = targetUsername.trim();
          const existing = db.prepare('SELECT id FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND id != ?').get(cleanUsername.toLowerCase(), cleanUsername.toLowerCase(), auth.id);
          if (existing) {
            return res.status(400).json({ error: 'This username is already taken' });
          }
          updates.push('username = ?');
          params.push(cleanUsername);
        }

        if (newPassword) {
          // Prevent setting the same password as the current one
          if (auth && auth.password_hash && bcrypt.compareSync(newPassword, auth.password_hash)) {
            return res.status(400).json({ error: 'New password cannot be the same as your current password' });
          }
          const salt = bcrypt.genSaltSync(10);
          updates.push('password_hash = ?');
          params.push(bcrypt.hashSync(newPassword, salt));
        }

        if (securityQuestion) {
          updates.push('security_question = ?');
          params.push(securityQuestion);
        }

        if (securityAnswer) {
          const salt = bcrypt.genSaltSync(10);
          updates.push('security_answer_hash = ?');
          params.push(bcrypt.hashSync(securityAnswer.toLowerCase().trim(), salt));
          try {
            // Check if column exists, if not add it
            try {
              db.exec('ALTER TABLE users ADD COLUMN security_answer TEXT');
            } catch (e) {}
            updates.push('security_answer = ?');
            params.push(securityAnswer.trim());
          } catch (e) {}
        }

        if (updates.length > 0) {
          if (!auth) {
            // Create record if somehow missing
            return res.status(404).json({ error: 'Owner account is not configured' });
          } else {
            const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            params.push(auth.id);
            db.prepare(sql).run(...params);
            if (typeof sessionService?.revokeOtherSessions === 'function' && req.user?.sessionId) {
              sessionService.revokeOtherSessions(auth.id, req.user.sessionId, 'security_change');
            } else if (typeof sessionService?.revokeUser === 'function') {
              sessionService.revokeUser(auth.id, 'security_change');
            }
          }
        }

        res.json({ success: true, message: 'Security settings updated successfully' });
      } catch (error) {
        console.error('Update security error:', error);
        res.status(500).json({ error: 'Failed to update security settings' });
      }
    },

    /**
     * Verify the current token
     */
    verify: (req, res) => {
      const targetUserId = req.user.userId || req.user.id;
      const user = getUserById(targetUserId);
      const role = user?.role || req.user.role || 'owner';
      const permissions = permissionsHelper
        ? permissionsHelper.getUserPermissionsSnapshot(targetUserId, role)
        : null;
      res.json({
        success: true,
        authenticated: true,
        user: user ? publicUser(user, req.user.deviceId) : req.user,
        permissions
      });
    },

    refreshMobileSession: (req, res) => {
      const result = mobileSessionService.rotate({ refreshToken: req.body?.refreshToken, req });
      if (!result) {
        auditService.record({ req, eventType: 'refresh', outcome: 'failure', platform: 'android' });
        return res.status(401).json({ error: 'Refresh token is invalid, expired, or revoked' });
      }
      auditService.record({ req, eventType: 'refresh', outcome: 'success', userId: result.user.id, sessionId: result.refreshTokenId, platform: 'android' });
      const permissions = permissionsHelper && result.user.role === 'worker'
        ? permissionsHelper.getUserPermissionsSnapshot(result.user.id, 'worker')
        : null;
      res.json({ success: true, token: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn, user: publicUser(result.user, result.user.device_id), permissions });
    },

    logoutMobileSession: (req, res) => {
      const refreshToken = req.body?.refreshToken;
      const revoked = mobileSessionService.revoke(refreshToken, 'logout');
      const authHeader = req.headers.authorization;
      const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : null;
      let targetUserId = revoked?.userId;
      if (!targetUserId && bearerToken) {
        try {
          const decoded = jwt.verify(bearerToken, JWT_SECRET);
          targetUserId = decoded.userId;
        } catch (_) {}
      }
      if (targetUserId) {
        try {
          db.prepare('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?').run(targetUserId);
        } catch (e) {
          console.warn('Failed to increment token_version on logout:', e.message);
        }
      }
      auditService.record({ req, eventType: 'logout', outcome: 'success', userId: targetUserId, platform: 'android' });
      res.clearCookie('auth_token', { path: '/' });
      res.clearCookie('auth_session', { path: '/' });
      res.clearCookie('macos_session', { path: '/' });
      res.clearCookie('token', { path: '/' });
      res.json({ success: true, message: 'Mobile session revoked' });
    },

    /**
     * Explicit Logout
     */
    logout: (req, res) => {
      const serverSession = sessionService.resolve(req.cookies?.[sessionService.cookieName], req);
      if (serverSession) {
        sessionService.revoke(serverSession.sessionId, 'logout');
        sessionService.clearCookie(res);
        auditService.record({ req, eventType: 'logout', outcome: 'success', userId: serverSession.userId, sessionId: serverSession.sessionId, deviceId: serverSession.deviceId, platform: 'web', provider: serverSession.provider });
      }

      const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          if (decoded.userId) {
            db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(decoded.userId);
          }
        } catch {
          // Always clear the browser cookie, including for expired tokens.
        }
      }
      res.clearCookie('auth_token', { path: '/' });
      res.clearCookie('macos_session', { path: '/' });
      res.clearCookie('token', { path: '/' });
      res.json({ success: true, message: 'Logged out successfully' });
    }
  };
};
