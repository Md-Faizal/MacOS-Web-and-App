const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Environment secrets
const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';
const RECOVERY_KEY = process.env.RECOVERY_KEY || 'emergency_recovery_access';

module.exports = function(db) {
  return {
    /**
     * Core authentication middleware to protect routes
     * Validates JWT signature, checks DB token_version for instant invalidation on suspend,
     * and attaches req.user object.
     */
    authMiddleware: (req, res, next) => {
      const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Fetch user from DB to verify status and token_version
        const userId = decoded.userId || decoded.id || (decoded.role === 'admin' ? 'admin_auth' : null);
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
        }

        const user = db.prepare('SELECT id, role, status, email, full_name, token_version FROM users WHERE id = ?').get(userId);

        if (!user) {
          return res.status(401).json({ error: 'Unauthorized: User account no longer exists' });
        }

        if (user.status !== 'active') {
          return res.status(403).json({ error: `Forbidden: Account is ${user.status}` });
        }

        // Check token_version to ensure session was not invalidated
        const tokenVer = decoded.tokenVersion ?? 0;
        const dbVer = user.token_version ?? 0;
        if (tokenVer !== dbVer && !decoded.recovery && !decoded.elevated) {
          return res.status(401).json({ error: 'Unauthorized: Session invalidated. Please log in again.' });
        }

        req.user = {
          id: user.id,
          userId: user.id,
          role: user.role,
          status: user.status,
          email: user.email,
          name: user.full_name,
          deviceId: decoded.deviceId || null,
          elevated: decoded.elevated || false,
          recovery: decoded.recovery || false
        };

        // HEARTBEAT: Update last_seen for device if deviceId is present
        if (decoded.deviceId) {
          try {
            db.prepare("UPDATE user_devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(decoded.deviceId);
          } catch (err) {
            // Silently ignore heartbeat update error
          }
        }

        next();
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }
    },

    /**
     * Middleware requiring Owner role
     */
    requireOwner: (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied: Owner privileges required' });
      }
      next();
    },

    /**
     * Middleware requiring active account status
     */
    requireActive: (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (req.user.status !== 'active') {
        return res.status(403).json({ error: `Access denied: Account status is ${req.user.status}` });
      }
      next();
    },

    getGoogleClientId: (req, res) => {
      res.json({ clientId: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID' });
    },

    /**
     * Get security status (public)
     */
    getStatus: (req, res) => {
      try {
        const owner = db.prepare(`
          SELECT u.id, u.password_hash, u.security_answer_hash, u.full_name, u.email, u.google_picture,
                 ui.password_hash AS identity_password_hash
          FROM users u
          LEFT JOIN user_identities ui ON u.id = ui.user_id AND ui.provider = 'local'
          WHERE u.role = 'owner' OR u.id = 'admin_auth'
        `).get();

        if (owner) {
          return res.json({
            passwordSet: !!(owner.password_hash || owner.identity_password_hash),
            hasSecurityQuestion: !!owner.security_answer_hash,
            user: {
              fullName: owner.full_name || '',
              email: owner.email || '',
              avatar: owner.google_picture || null
            }
          });
        }

        // Fallback to legacy auth_credentials
        const auth = db.prepare('SELECT password_hash, security_answer_hash FROM auth_credentials WHERE id = ?').get('admin_auth');
        res.json({
          passwordSet: !!(auth && auth.password_hash),
          hasSecurityQuestion: !!(auth && auth.security_answer_hash)
        });
      } catch (error) {
        console.error('Failed to retrieve security status:', error);
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

    /**
     * Get the owner's selected security question (validates administrator username)
     */
    getChallengeQuestion: (req, res) => {
      try {
        const username = (req.query.username || req.body.username || '').trim();
        
        if (!username) {
          return res.status(400).json({ error: 'Please enter your administrator username first.' });
        }

        // Look for user matching username/email/google_email/full_name/id
        let user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE OR google_email = ? COLLATE NOCASE OR full_name = ? COLLATE NOCASE OR id = ?").get(username, username, username, username);

        // Fallback for legacy admin_auth if table is empty
        if (!user && (username.toLowerCase() === 'admin' || username === 'admin_auth' || username.toLowerCase() === 'faizal')) {
          const auth = db.prepare('SELECT security_question FROM auth_credentials WHERE id = ?').get('admin_auth');
          if (auth && auth.security_question) {
            return res.json({ success: true, question: auth.security_question, username: 'Administrator' });
          }
        }

        if (!user) {
          return res.status(404).json({ error: 'No administrator account found with this username.' });
        }

        // Security check: only administrator/owner accounts have security questions
        if (user.role !== 'owner' && user.id !== 'admin_auth') {
          return res.status(403).json({ error: 'Security question recovery is only available for administrator accounts. Worker accounts must authenticate with Google.' });
        }

        if (!user.security_question) {
          return res.status(404).json({ error: 'No security question is configured for this administrator account.' });
        }

        res.json({
          success: true,
          question: user.security_question,
          username: user.full_name || user.email || 'Administrator'
        });
      } catch (error) {
        console.error('Challenge question error:', error);
        res.status(500).json({ error: 'Failed to retrieve challenge question' });
      }
    },

    /**
     * Verify security answer (public/session-based)
     */
    verifyAnswer: async (req, res) => {
      try {
        const { username, answer } = req.body;
        if (!answer) return res.status(400).json({ error: 'Answer is required' });

        let owner = null;
        if (username) {
          const trimmed = username.trim();
          owner = db.prepare("SELECT * FROM users WHERE (email = ? COLLATE NOCASE OR google_email = ? COLLATE NOCASE OR full_name = ? COLLATE NOCASE OR id = ?) AND role = 'owner'").get(trimmed, trimmed, trimmed, trimmed);
        }

        if (!owner) {
          owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get();
        }

        if (!owner || !owner.security_answer_hash) {
          const auth = db.prepare('SELECT security_answer_hash FROM auth_credentials WHERE id = ?').get('admin_auth');
          if (auth) {
            owner = { id: 'admin_auth', security_answer_hash: auth.security_answer_hash };
          }
        }

        if (!owner || !owner.security_answer_hash) {
          return res.status(404).json({ error: 'Security questions not set up' });
        }

        const isMatch = await bcrypt.compare(answer.toLowerCase().trim(), owner.security_answer_hash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Incorrect answer' });
        }

        // Grant temporary elevation (1 hour)
        const token = jwt.sign({
          userId: owner.id,
          role: 'owner',
          elevated: true
        }, JWT_SECRET, { expiresIn: '1h' });

        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
          sameSite: 'Lax',
          path: '/'
        });

        res.json({ success: true, elevationToken: token });
      } catch (error) {
        console.error('Verify answer error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },

    /**
     * Login handler (Owner local password + biometric login + remember me unlock)
     */
    login: async (req, res) => {
      try {
        const { username, password, deviceName, deviceType, biometric, rememberMeUnlock, token: rememberToken } = req.body;

        // REMEMBER ME UNLOCK FLOW
        if (rememberMeUnlock) {
          const clientToken = rememberToken || req.cookies?.auth_token;
          if (!clientToken) {
            return res.status(401).json({ error: 'Remember Me session expired. Please sign in.' });
          }
          try {
            const decoded = jwt.verify(clientToken, JWT_SECRET);
            const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.userId);
            if (!user || user.status !== 'active') {
              return res.status(401).json({ error: 'User is not active.' });
            }
            if (user.token_version !== undefined && decoded.tokenVersion !== undefined && user.token_version > decoded.tokenVersion) {
              return res.status(401).json({ error: 'Session invalidated. Please sign in.' });
            }

            const freshToken = jwt.sign({
              userId: user.id,
              role: user.role,
              tokenVersion: user.token_version || 0,
              deviceId: decoded.deviceId || deviceName
            }, JWT_SECRET, { expiresIn: '30d' });

            res.cookie('auth_token', freshToken, {
              httpOnly: true,
              secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
              sameSite: 'Lax',
              path: '/'
            });

            return res.json({ success: true, message: 'Unlocked via Remember Me', token: freshToken, role: user.role });
          } catch (jwtErr) {
            return res.status(401).json({ error: 'Remember Me token expired. Please sign in.' });
          }
        }

        // BIOMETRIC LOGIN: Trust client-side WebAuthn result for owner
        if (biometric) {
          const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get() || db.prepare("SELECT * FROM users WHERE id = 'admin_auth'").get();
          if (!owner) return res.status(404).json({ error: 'Owner account not found' });
          const token = jwt.sign({
            userId: owner.id,
            role: 'owner',
            tokenVersion: owner.token_version || 0,
            deviceId: deviceName
          }, JWT_SECRET, { expiresIn: '7d' });

          res.cookie('auth_token', token, {
            httpOnly: true,
            secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
            sameSite: 'Lax',
            path: '/'
          });

          return res.json({ success: true, token, role: 'owner' });
        }

        // PASSWORD-DISABLED UNLOCK FLOW: If password protection is disabled for owner, allow unlocking
        if (password === null || password === undefined || password === '') {
          const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get() || db.prepare("SELECT * FROM users WHERE id = 'admin_auth'").get();
          if (owner) {
            const localIdentity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'local'").get(owner.id);
            const passHash = localIdentity?.password_hash || owner.password_hash;
            if (!passHash) {
              // Password protection is OFF -> grant owner access
              const token = jwt.sign({
                userId: owner.id,
                role: 'owner',
                tokenVersion: owner.token_version || 0,
                deviceId: deviceName
              }, JWT_SECRET, { expiresIn: '7d' });

              res.cookie('auth_token', token, {
                httpOnly: true,
                secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
                sameSite: 'Lax',
                path: '/'
              });

              return res.json({ success: true, message: 'Unlocked without password', token, role: 'owner' });
            }
          }
        }

        // STANDARD PASSWORD LOGIN: BOTH USERNAME AND PASSWORD ARE REQUIRED
        if (!username || !username.trim()) {
          return res.status(400).json({ error: 'Please enter your username or email.' });
        }
        if (!password) {
          return res.status(400).json({ error: 'Please enter your password.' });
        }

        const trimmed = username.trim();
        const targetUser = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE OR google_email = ? COLLATE NOCASE OR full_name = ? COLLATE NOCASE OR id = ?").get(trimmed, trimmed, trimmed, trimmed);
        
        if (!targetUser) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        const owner = targetUser;

        // Emergency Recovery Key bypass
        if (password === RECOVERY_KEY) {
          const token = jwt.sign({
            userId: owner.id,
            role: 'owner',
            recovery: true
          }, JWT_SECRET, { expiresIn: '1h' });

          return res.json({ success: true, message: 'Recovery access granted', token, needsReset: true });
        }

        // Normal password check via user_identities with fallback to users table
        let localIdentity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'local'").get(owner.id);
        let passwordHashToCheck = localIdentity?.password_hash || owner.password_hash;

        if (!passwordHashToCheck) {
          return res.status(401).json({ error: 'No local password configured for this account' });
        }

        const isMatch = await bcrypt.compare(password, passwordHashToCheck);
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Auto-heal / sync user_identities if it was missing
        if (!localIdentity && owner.password_hash) {
          try {
            const crypto = require('crypto');
            db.prepare(`
              INSERT OR REPLACE INTO user_identities (id, user_id, provider, provider_user_id, provider_email, password_hash, is_verified)
              VALUES (?, ?, 'local', ?, ?, ?, 1)
            `).run(crypto.randomUUID(), owner.id, (owner.email || owner.full_name || owner.id).toLowerCase(), owner.email || null, owner.password_hash);
          } catch (e) {}
        }

        // Update owner last_login
        if (owner.id) {
          try {
            db.prepare("UPDATE users SET last_login = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(owner.id);
          } catch (e) {}
        }

        // Record device info
        let deviceId = null;
        if (deviceName) {
          db.prepare('UPDATE user_devices SET is_current = 0').run();
          db.prepare(`
            INSERT INTO user_devices (device_name, device_type, is_current, last_login, last_seen) 
            VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            ON CONFLICT(device_name) DO UPDATE SET 
              last_login = excluded.last_login,
              last_seen = excluded.last_seen,
              is_current = 1,
              device_type = excluded.device_type
          `).run(deviceName, deviceType || 'Web', 1);

          const device = db.prepare('SELECT id FROM user_devices WHERE device_name = ?').get(deviceName);
          deviceId = device?.id;
          if (device) {
            db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(device.id, 'success');
          }
        }

        const token = jwt.sign({
          userId: owner.id,
          role: 'owner',
          tokenVersion: owner.token_version || 0,
          deviceId
        }, JWT_SECRET, { expiresIn: req.body.rememberMe ? '30d' : '7d' });

        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
          sameSite: 'Lax',
          path: '/'
        });

        return res.json({
          success: true,
          token,
          user: {
            id: owner.id,
            name: owner.full_name || 'Owner',
            email: owner.email,
            role: 'owner'
          }
        });

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
        const devices = db.prepare('SELECT * FROM user_devices ORDER BY last_login DESC').all();
        res.json({ devices });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve devices' });
      }
    },

    /**
     * Delete a device (Logout from this device)
     */
    logoutDevice: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM user_devices WHERE id = ?').run(id);
        res.json({ success: true, message: 'Device logged out' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to logout device' });
      }
    },

    /**
     * Logout all devices
     */
    logoutAllDevices: (req, res) => {
      try {
        db.prepare('DELETE FROM user_devices').run();
        res.json({ success: true, message: 'All devices logged out' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to logout all devices' });
      }
    },

    /**
     * Get login history for a specific device
     */
    getDeviceHistory: (req, res) => {
      try {
        const { id } = req.params;
        const history = db.prepare('SELECT * FROM login_history WHERE device_id = ? ORDER BY login_time DESC LIMIT 10').all(id);
        res.json({ history });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve device history' });
      }
    },

    /**
     * Disable password protection (authenticated owner only)
     */
    disableSecurity: async (req, res) => {
      try {
        const { currentPassword } = req.body;
        const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get() || db.prepare("SELECT * FROM users WHERE id = 'admin_auth'").get();

        if (!owner) {
          return res.status(404).json({ error: 'Owner account not found' });
        }

        const localIdentity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'local'").get(owner.id);
        const passHash = localIdentity?.password_hash || owner.password_hash;

        if (!passHash) {
          return res.status(400).json({ error: 'Password is not set' });
        }

        const isMatch = await bcrypt.compare(currentPassword, passHash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Incorrect password' });
        }

        db.prepare("UPDATE users SET password_hash = NULL, security_answer_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(owner.id);

        try {
          db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'local'").run(owner.id);
        } catch (e) {}

        try {
          db.prepare("UPDATE auth_credentials SET password_hash = NULL, security_answer_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 'admin_auth'").run();
        } catch (e) {}

        res.json({ success: true, message: 'Password protection disabled' });
      } catch (error) {
        console.error('Disable security error:', error);
        res.status(500).json({ error: 'Failed to disable security' });
      }
    },

    /**
     * Update/Setup security settings (authenticated owner / elevated)
     */
    updateSecurity: async (req, res) => {
      try {
        const { currentPassword, newPassword, securityQuestion, securityAnswer } = req.body;
        const owner = db.prepare("SELECT * FROM users WHERE role = 'owner'").get() || db.prepare("SELECT * FROM users WHERE id = 'admin_auth'").get();
        
        const localIdentity = owner ? db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'local'").get(owner.id) : null;
        const currentHash = localIdentity?.password_hash || owner?.password_hash;
        const isInitialSetup = !owner || !currentHash;

        if (!isInitialSetup && !req.user?.elevated && !req.user?.recovery) {
          if (!currentHash || !currentPassword) {
            return res.status(401).json({ error: 'Authentication required to change security settings' });
          }
          const isMatch = await bcrypt.compare(currentPassword, currentHash);
          if (!isMatch) {
            return res.status(401).json({ error: 'Authentication required to change security settings' });
          }
        }

        const updates = [];
        const params = [];
        let newPasswordHash = null;

        if (newPassword) {
          if (currentHash) {
            const isMatch = await bcrypt.compare(newPassword, currentHash);
            if (isMatch) {
              return res.status(400).json({ error: 'New password cannot be the same as your current password' });
            }
          }
          const salt = await bcrypt.genSalt(10);
          newPasswordHash = await bcrypt.hash(newPassword, salt);
          updates.push('password_hash = ?');
          params.push(newPasswordHash);
        }

        if (securityQuestion) {
          updates.push('security_question = ?');
          params.push(securityQuestion);
        }

        if (securityAnswer) {
          const salt = await bcrypt.genSalt(10);
          updates.push('security_answer_hash = ?');
          params.push(await bcrypt.hash(securityAnswer.toLowerCase().trim(), salt));
        }

        if (updates.length > 0) {
          const ownerId = owner ? owner.id : 'admin_auth';
          const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          params.push(ownerId);
          db.prepare(sql).run(...params);

          if (newPasswordHash) {
            const crypto = require('crypto');
            const identifier = (owner?.email || owner?.full_name || ownerId).toLowerCase();
            try {
              db.prepare(`
                INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, password_hash, is_verified)
                VALUES (?, ?, 'local', ?, ?, ?, 1)
                ON CONFLICT(provider, provider_user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP
              `).run(crypto.randomUUID(), ownerId, identifier, owner?.email || null, newPasswordHash);
            } catch (e) {
              // Try update by user_id
              db.prepare("UPDATE user_identities SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND provider = 'local'").run(newPasswordHash, ownerId);
            }
          }

          try {
            const authSql = `UPDATE auth_credentials SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = 'admin_auth'`;
            db.prepare(authSql).run(...params.slice(0, params.length - 1));
          } catch (e) {}
        }

        res.json({ success: true, message: 'Security settings updated successfully' });
      } catch (error) {
        console.error('Update security error:', error);
        res.status(500).json({ error: 'Failed to update security settings' });
      }
    },

    /**
     * Verify the current token and return user info + permissions
     */
    verify: (req, res) => {
      const user = db.prepare('SELECT id, full_name, email, role, status, google_picture, update_channel FROM users WHERE id = ?').get(req.user.id);
      res.json({
        success: true,
        authenticated: true,
        user: user || req.user
      });
    },

    /**
     * Explicit Logout
     */
    logout: (req, res) => {
      res.clearCookie('auth_token', { path: '/' });
      res.json({ success: true, message: 'Logged out successfully' });
    }
  };
};
