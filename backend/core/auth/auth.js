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
  return process.env.WEBAUTHN_ORIGIN || req.headers.origin || `${req.protocol}://${req.get('host')}`;
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

module.exports = function(db) {
  const sessionService = createSessionService(db);
  const mobileSessionService = createMobileSessionService(db);
  const auditService = createAuditService(db);
  const getOwner = () => db.prepare(`
    SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
           role, status, token_version
    FROM users
    WHERE role = 'owner'
    ORDER BY created_at ASC
    LIMIT 1
  `).get();

  const getUserById = (userId) => db.prepare(`
    SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
           role, status, token_version
    FROM users
    WHERE id = ?
  `).get(userId);

  const findUserByIdentifier = (identifier) => {
    if (!identifier || typeof identifier !== 'string') return null;
    const normalizedIdentifier = identifier.trim().toLowerCase();
    return db.prepare(`
      SELECT id, username, email, full_name, password_hash, security_question, security_answer_hash,
             role, status, token_version
      FROM users
      WHERE LOWER(username) = ? OR LOWER(email) = ? OR LOWER(full_name) = ?
      LIMIT 1
    `).get(normalizedIdentifier, normalizedIdentifier, normalizedIdentifier);
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

  const publicUser = (user, deviceId) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    deviceId
  });

  const issueWebSession = (req, res, user, deviceId, provider = 'local', elevated = false) => {
    const session = sessionService.create({
      userId: user.id,
      deviceId,
      platform: 'web',
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

      // For simplicity, we check both Cookies and Authorization header
      const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = decoded.userId
          ? db.prepare('SELECT id, role, status, token_version FROM users WHERE id = ?').get(decoded.userId)
          : null;

        if (!user || user.status !== 'active' ||
            (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.token_version) ||
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

        next();
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
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
          excludeCredentials: existingCredentials.map(credential => ({
            id: credential.provider_user_id,
            transports: credential.credential_transports
              ? JSON.parse(credential.credential_transports)
              : undefined
          })),
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required'
          }
        });

        saveChallenge(db, challengeKey(user.id, 'registration'), options.challenge);
        res.json(options);
      } catch (error) {
        console.error('WebAuthn registration options error:', error);
        res.status(500).json({ error: 'Unable to prepare Touch ID setup' });
      }
    },

    verifyWebAuthnRegistration: async (req, res) => {
      try {
        const user = getUserById(req.user.userId);
        const challenge = user
          ? consumeChallenge(db, challengeKey(req.user.userId, 'registration'))
          : null;
        if (!user || !challenge) {
          return res.status(400).json({ error: 'Touch ID setup has expired. Try again.' });
        }

        const verification = await verifyRegistrationResponse({
          response: req.body,
          expectedChallenge: challenge,
          expectedOrigin: expectedOrigin(req),
          expectedRPID: process.env.WEBAUTHN_RP_ID || req.hostname
        });
        if (!verification.verified || !verification.registrationInfo) {
          return res.status(400).json({ error: 'Touch ID registration was not verified' });
        }

        const credential = verification.registrationInfo.credential;
        db.prepare(`
          INSERT INTO user_identities (
            id, user_id, provider, provider_user_id, credential_public_key,
            credential_counter, credential_transports, is_verified
          ) VALUES (?, ?, 'webauthn', ?, ?, ?, ?, 1)
        `).run(
          crypto.randomUUID(),
          user.id,
          credential.id,
          Buffer.from(credential.publicKey),
          credential.counter,
          JSON.stringify(credential.transports || [])
        );

        res.json({ success: true, credentialId: credential.id });
      } catch (error) {
        console.error('WebAuthn registration verification error:', error);
        res.status(400).json({ error: 'Touch ID registration failed' });
      }
    },

    getWebAuthnAuthenticationOptions: async (req, res) => {
      try {
        const user = findUserByIdentifier(req.query.identifier || '');
        if (!user) return res.status(404).json({ error: 'Account not found' });

        const credentials = db.prepare(`
          SELECT provider_user_id, credential_transports
          FROM user_identities
          WHERE user_id = ? AND provider = 'webauthn' AND is_verified = 1
        `).all(user.id);
        if (credentials.length === 0) return res.status(404).json({ error: 'Touch ID is not configured' });

        const options = await generateAuthenticationOptions({
          rpID: process.env.WEBAUTHN_RP_ID || req.hostname,
          userVerification: 'required',
          allowCredentials: credentials.map(credential => ({
            id: credential.provider_user_id,
            transports: credential.credential_transports
              ? JSON.parse(credential.credential_transports)
              : undefined
          }))
        });
        saveChallenge(db, challengeKey(user.id, 'authentication'), options.challenge);
        res.json(options);
      } catch (error) {
        console.error('WebAuthn authentication options error:', error);
        res.status(500).json({ error: 'Unable to prepare Touch ID sign-in' });
      }
    },

    verifyWebAuthnAuthentication: async (req, res) => {
      try {
        const { identifier, deviceName, deviceType, response } = req.body;
        const user = findUserByIdentifier(identifier || '');
        const challenge = user
          ? consumeChallenge(db, challengeKey(user.id, 'authentication'))
          : null;
        if (!user || !challenge) {
          return res.status(401).json({ error: 'Touch ID sign-in has expired. Try again.' });
        }

        const credential = db.prepare(`
          SELECT provider_user_id, credential_public_key, credential_counter, credential_transports
          FROM user_identities
          WHERE user_id = ? AND provider = 'webauthn' AND provider_user_id = ? AND is_verified = 1
        `).get(user.id, response.id);
        if (!credential) return res.status(401).json({ error: 'Touch ID credential not recognized' });

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: expectedOrigin(req),
          expectedRPID: process.env.WEBAUTHN_RP_ID || req.hostname,
          credential: {
            id: credential.provider_user_id,
            publicKey: new Uint8Array(credential.credential_public_key),
            counter: credential.credential_counter || 0,
            transports: credential.credential_transports
              ? JSON.parse(credential.credential_transports)
              : undefined
          }
        });
        if (!verification.verified) return res.status(401).json({ error: 'Touch ID verification failed' });
        db.prepare('UPDATE user_identities SET credential_counter = ? WHERE user_id = ? AND provider_user_id = ?')
          .run(verification.authenticationInfo.newCounter, user.id, response.id);

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
        res.status(401).json({ error: 'Touch ID sign-in failed' });
      }
    },

    /**
     * Get the user's selected security question (public)
     */
    getChallengeQuestion: (req, res) => {
      try {
        const identifier = (req.query.identifier || '').trim();
        let auth = null;

        if (req.user) {
          auth = getUserById(req.user.userId);
        } else if (identifier) {
          auth = findUserByIdentifier(identifier);
          if (!auth) {
            return res.status(404).json({ error: 'No account found with this username or email' });
          }
        } else {
          auth = getOwner();
        }

        if (!auth) {
          return res.status(404).json({ error: 'Account not found' });
        }

        res.json({
          question: auth.security_question || null,
          hasSecurityQuestion: !!auth.security_question
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
          const session = issueWebSession(req, res, auth, null, 'recovery', true);
          auditService.record({ req, eventType: 'step_up', outcome: 'success', userId: auth.id, sessionId: session.sessionId, platform: 'web', provider: providerType });
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
        const { identifier, password, deviceName, deviceType, biometric } = req.body;
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

        const isWebLogin = typeof req?.get === 'function' && (deviceType || 'Web').toLowerCase() !== 'android';

        // Record device info
        if (deviceName) {
          db.prepare('UPDATE user_devices SET is_current = 0 WHERE user_id = ?').run(user.id);
          db.prepare(`
            INSERT INTO user_devices (user_id, device_name, device_type, is_current, last_login, last_seen)
            VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            ON CONFLICT(user_id, device_name) DO UPDATE SET
              last_login = excluded.last_login,
              last_seen = excluded.last_seen,
              is_current = 1,
              device_type = excluded.device_type
          `).run(user.id, deviceName, deviceType || 'Web', 1);

          // Record history and get deviceId
          const device = db.prepare('SELECT id FROM user_devices WHERE user_id = ? AND device_name = ?')
            .get(user.id, deviceName);
          const deviceId = device?.id;

          if (device) {
            db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(device.id, 'success');
          }

          if (isWebLogin) {
            const session = issueWebSession(req, res, user, deviceId);
            auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: session.sessionId, deviceId, platform: 'web', provider: 'local' });
            return res.json({ success: true, sessionId: session.sessionId, user: publicUser(user, deviceId) });
          }

          if (typeof req?.get === 'function') {
            const mobileSession = issueMobileSession(req, user, deviceId);
            auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: mobileSession.refreshTokenId, deviceId, platform: 'android', provider: 'local' });
            return res.json({ success: true, token: mobileSession.accessToken, refreshToken: mobileSession.refreshToken, expiresIn: mobileSession.expiresIn, user: publicUser(user, deviceId) });
          }

          const token = createSessionToken(user, deviceId);
          setSessionCookie(req, res, token);
          return res.json({ success: true, token, user: publicUser(user, deviceId) });
        }

        if (isWebLogin) {
          const session = issueWebSession(req, res, user, null);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: session.sessionId, platform: 'web', provider: 'local' });
          return res.json({ success: true, sessionId: session.sessionId, user: publicUser(user) });
        }

        if (typeof req?.get === 'function') {
          const mobileSession = issueMobileSession(req, user, null);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: mobileSession.refreshTokenId, platform: 'android', provider: 'local' });
          return res.json({ success: true, token: mobileSession.accessToken, refreshToken: mobileSession.refreshToken, expiresIn: mobileSession.expiresIn, user: publicUser(user) });
        }

        const token = createSessionToken(user);
        setSessionCookie(req, res, token);

        res.json({ success: true, token, user: publicUser(user) });

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
          devices: devices.map(d => ({
            ...d,
            isCurrent: Boolean(d.is_current_device),
            hasActiveSession: d.active_session_count > 0 || Boolean(d.is_current_device)
          })),
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

        if (keepCurrent && currentDeviceId) {
          // Keep this device, remove all other devices & sessions
          db.transaction(() => {
            db.prepare('DELETE FROM user_devices WHERE user_id = ? AND id != ?').run(userId, currentDeviceId);
            sessionService.revokeOtherSessions(userId, currentSessionId, 'all_other_devices_logged_out');
          })();
          res.json({ success: true, message: 'All other devices logged out successfully' });
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
        const { currentPassword, newPassword, securityQuestion, securityAnswer, email } = req.body;
        
        const auth = req.user ? getUserById(req.user.userId) : getOwner();
        const isInitialSetup = !auth || !auth.password_hash;

        // Ensure user is EITHER correct on password OR elevated via security question OR it's initial setup
        if (!isInitialSetup && !req.user?.elevated && !req.user?.recovery) {
          if (!auth || !auth.password_hash || !currentPassword || !bcrypt.compareSync(currentPassword, auth.password_hash)) {
            return res.status(401).json({ error: 'Authentication required to change security settings' });
          }
        }

        // Prepare Updates
        const updates = [];
        const params = [];

        if (email && typeof email === 'string' && email.trim()) {
          const cleanEmail = email.trim().toLowerCase();
          const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(cleanEmail, auth.id);
          if (existing) {
            return res.status(400).json({ error: 'This email is already in use by another account' });
          }
          updates.push('email = ?');
          params.push(cleanEmail);
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
      res.json({ success: true, authenticated: true, user: req.user });
    },

    refreshMobileSession: (req, res) => {
      const result = mobileSessionService.rotate({ refreshToken: req.body?.refreshToken, req });
      if (!result) {
        auditService.record({ req, eventType: 'refresh', outcome: 'failure', platform: 'android' });
        return res.status(401).json({ error: 'Refresh token is invalid, expired, or revoked' });
      }
      auditService.record({ req, eventType: 'refresh', outcome: 'success', userId: result.user.id, sessionId: result.refreshTokenId, platform: 'android' });
      res.json({ success: true, token: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn, user: publicUser(result.user, result.user.device_id) });
    },

    logoutMobileSession: (req, res) => {
      mobileSessionService.revoke(req.body?.refreshToken, 'logout');
      auditService.record({ req, eventType: 'logout', outcome: 'success', platform: 'android' });
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
        return res.json({ success: true, message: 'Logged out successfully' });
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
      res.json({ success: true, message: 'Logged out successfully' });
    }
  };
};
