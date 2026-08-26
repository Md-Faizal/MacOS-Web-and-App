const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// These should be in your .env file
const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';
const RECOVERY_KEY = process.env.RECOVERY_KEY || 'emergency_recovery_access';

module.exports = function(db) {
  return {
    /**
     * Middleware to protect routes
     */
    authMiddleware: (req, res, next) => {
      // For simplicity, we check both Cookies and Authorization header
      const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // HEARTBEAT: Update last_seen for the device if deviceId is present in token
        if (decoded.deviceId) {
          try {
            db.prepare("UPDATE user_devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(decoded.deviceId);
          } catch (err) {
            // Silently ignore failures to update heartbeat (e.g., column doesn't exist yet)
            console.warn('Heartbeat update failed:', err.message);
          }
        }

        next();
      } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }
    },

    /**
     * Get security status (public)
     */
    getStatus: (req, res) => {
      try {
        const stmt = db.prepare('SELECT password_hash FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');
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

    /**
     * Get the user's selected security question (public)
     */
    getChallengeQuestion: (req, res) => {
      try {
        const stmt = db.prepare('SELECT security_question FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');
        res.json({ question: auth ? auth.security_question : null });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve challenge question' });
      }
    },

    /**
     * Verify security answer (public/session-based)
     */
    verifyAnswer: (req, res) => {
      try {
        const { answer } = req.body;
        if (!answer) return res.status(400).json({ error: 'Answer is required' });

        const stmt = db.prepare('SELECT security_answer_hash FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');

        if (!auth || !auth.security_answer_hash) {
          return res.status(404).json({ error: 'Security questions not set up' });
        }

        const isMatch = bcrypt.compareSync(answer.toLowerCase().trim(), auth.security_answer_hash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Incorrect answer' });
        }

        // Grant temporary elevation (1 hour)
        const token = jwt.sign({ role: 'admin', elevated: true }, JWT_SECRET, { expiresIn: '1h' });
        
        // Set HttpOnly cookie for elevation
        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
          sameSite: 'Lax', // Relaxed to Lax for handled sessions across prod subdomains if needed
          path: '/'
        });

        res.json({ success: true, elevationToken: token });

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
        const { password, deviceName, deviceType, biometric } = req.body;

        // Get the current password hash from the auth_credentials table
        const stmt = db.prepare('SELECT password_hash FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');

        // NO PASSWORD SET: Allow login immediately
        if (!auth || !auth.password_hash) {
          const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
          
          // Set HttpOnly cookie
          res.cookie('auth_token', token, {
            httpOnly: true,
            secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
            sameSite: 'Lax',
            path: '/'
          });

          // Record device info
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

            // Record history and get deviceId
            const device = db.prepare('SELECT id FROM user_devices WHERE device_name = ?').get(deviceName);
            const deviceId = device?.id;

            if (device) {
              db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(device.id, 'success');
            }

            const token = jwt.sign({ role: 'admin', deviceId }, JWT_SECRET, { expiresIn: '7d' });
            
            // Set HttpOnly cookie
            res.cookie('auth_token', token, {
              httpOnly: true,
              secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
              sameSite: 'Lax',
              path: '/'
            });

            return res.json({ success: true, message: 'Unlocked (No password)', token });
          }
        }

        // BIOMETRIC LOGIN: Trust client-side WebAuthn result (password bypass)
        if (biometric) {
           // Skip password requirement, proceed to token generation
        } else if (!password) {
           return res.status(400).json({ error: 'Password is required' });
        } else if (password === RECOVERY_KEY) {
           // REDUNDANCY: Recovery Key bypass
           const token = jwt.sign({ role: 'admin', recovery: true }, JWT_SECRET, { expiresIn: '1h' });
           return res.json({ success: true, message: 'Recovery access granted', token, needsReset: true });
        }

        // NORMAL LOGIN: Compare provided password with stored hash or check biometric success
        const isMatch = biometric || (password && bcrypt.compareSync(password, auth.password_hash));
        
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid password' });
        }

        // Record device info
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

          // Record history and get deviceId
          const device = db.prepare('SELECT id FROM user_devices WHERE device_name = ?').get(deviceName);
          const deviceId = device?.id;

          if (device) {
            db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(device.id, 'success');
          }

          const token = jwt.sign({ role: 'admin', deviceId }, JWT_SECRET, { expiresIn: '7d' });
          
          // Set HttpOnly cookie
          res.cookie('auth_token', token, {
            httpOnly: true,
            secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
            sameSite: 'Lax',
            path: '/'
          });

          return res.json({ success: true, token });
        }

        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        
        // Set HttpOnly cookie
        res.cookie('auth_token', token, {
          httpOnly: true,
           secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
           sameSite: 'Lax',
          path: '/'
        });

        res.json({ success: true, token });

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
        console.error('Failed to retrieve device history:', error);
        res.status(500).json({ error: 'Failed to retrieve device history' });
      }
    },

    /**
     * Disable password protection (authenticated)
     */
    disableSecurity: (req, res) => {
      try {
        const { currentPassword } = req.body;
        
        const stmt = db.prepare('SELECT password_hash FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');
        
        if (!auth || !auth.password_hash) {
          return res.status(400).json({ error: 'Password is not set' });
        }

        if (!bcrypt.compareSync(currentPassword, auth.password_hash)) {
          return res.status(401).json({ error: 'Incorrect password' });
        }

        // Clear security
        db.prepare('UPDATE auth_credentials SET password_hash = NULL, security_answer_hash = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('admin_auth');

        res.json({ success: true, message: 'Password protection disabled' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to disable security' });
      }
    },

    /**
     * Update/Setup security settings (authenticated/elevated)
     */
    updateSecurity: (req, res) => {
      try {
        const { currentPassword, newPassword, securityQuestion, securityAnswer } = req.body;
        
        const stmt = db.prepare('SELECT password_hash FROM auth_credentials WHERE id = ?');
        const auth = stmt.get('admin_auth');
        const isInitialSetup = !auth || !auth.password_hash;

        // Ensure user is EITHER correct on password OR elevated via security question OR it's initial setup
        if (!isInitialSetup && !req.user.elevated && !req.user.recovery) {
          if (!auth || !auth.password_hash || !currentPassword || !bcrypt.compareSync(currentPassword, auth.password_hash)) {
            return res.status(401).json({ error: 'Authentication required to change security settings' });
          }
        }

        // Prepare Updates
        const updates = [];
        const params = [];

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
            const insertSql = `INSERT INTO auth_credentials (id, user_role, ${updates.map(u => u.split('=')[0]).join(', ')}) VALUES (?, ?, ${updates.map(() => '?').join(', ')})`;
            db.prepare(insertSql).run('admin_auth', 'admin', ...params);
          } else {
            const sql = `UPDATE auth_credentials SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            params.push('admin_auth');
            db.prepare(sql).run(...params);
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

    /**
     * Explicit Logout
     */
    logout: (req, res) => {
      res.clearCookie('auth_token', { path: '/' });
      res.json({ success: true, message: 'Logged out successfully' });
    }
  };
};
