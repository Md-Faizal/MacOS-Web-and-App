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

module.exports = function(db, permissionsHelper = null) {
  const sessionService = createSessionService(db);
  const mobileSessionService = createMobileSessionService(db);
  const auditService = createAuditService(db);
  if (!permissionsHelper) {
    try {
      permissionsHelper = require('./permissions')(db);
    } catch (_) {}
  }
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

  const issueWebSession = (req, res, user, deviceId, provider = 'local', elevated = false, platform = 'web') => {
    const session = sessionService.create({
      userId: user.id,
      deviceId,
      platform,
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
          excludeCredentials: [],
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
        
        // Remove previous webauthn credentials for clean overwrite/re-enrollment
        try {
          db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'webauthn'").run(user.id);
        } catch (e) {}

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

        const clientPlatformHeader = (req.headers['x-client-platform'] || '').toLowerCase();
        const isPWA = (clientType === 'pwa') || (deviceType && deviceType.toLowerCase().includes('pwa')) || (clientPlatformHeader === 'pwa');
        const isAndroidApp = (clientType === 'native_android') || (deviceType && (deviceType.toLowerCase() === 'android' || deviceType.toLowerCase() === 'android app')) || (clientPlatformHeader === 'android' && !isPWA) || (req.headers['x-app-type'] === 'native_android');
        const isWebLogin = !isAndroidApp;

        const resolvedClientType = isAndroidApp ? 'android' : (isPWA ? 'pwa' : 'web');
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
          INSERT INTO user_devices (user_id, device_name, device_type, client_type, is_current, last_login, last_seen)
          VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          ON CONFLICT(user_id, device_name) DO UPDATE SET
            last_login = excluded.last_login,
            last_seen = excluded.last_seen,
            is_current = 1,
            device_type = excluded.device_type,
            client_type = excluded.client_type
        `).run(user.id, resolvedDeviceName, resolvedDeviceType, resolvedClientType, 1);

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
          const session = issueWebSession(req, res, user, deviceId, 'local', false, resolvedClientType);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: session.sessionId, deviceId, platform: resolvedClientType, provider: 'local' });
          return res.json({ success: true, sessionId: session.sessionId, user: publicUser(user, deviceId), permissions });
        }

        if (typeof req?.get === 'function') {
          const mobileSession = issueMobileSession(req, user, deviceId);
          auditService.record({ req, eventType: 'login', outcome: 'success', userId: user.id, sessionId: mobileSession.refreshTokenId, deviceId, platform: 'android', provider: 'local' });
          return res.json({ success: true, token: mobileSession.accessToken, refreshToken: mobileSession.refreshToken, expiresIn: mobileSession.expiresIn, user: publicUser(user, deviceId), permissions });
        }

        const token = createSessionToken(user, deviceId);
        setSessionCookie(req, res, token);
        return res.json({ success: true, token, user: publicUser(user, deviceId), permissions });

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
            return {
              ...d,
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
      res.json({ success: true, authenticated: true, user: req.user });
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
