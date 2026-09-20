const createSessionService = require('./session-service');
const createAuditService = require('./audit-service');

module.exports = function(db) {
  const sessionService = createSessionService(db);
  const auditService = createAuditService(db);
  return {
    /**
     * Get the user's profile information
     */
    getProfile: (req, res) => {
      try {
        const stmt = db.prepare(`
          SELECT u.id, u.username, u.full_name, u.email, u.google_id, u.google_email,
                 u.google_name, u.google_picture, p.email_id, p.profile_picture,
                 p.name_source, p.picture_source, p.google_email AS profile_google_email,
                 p.google_name AS profile_google_name, p.google_picture AS profile_google_picture
          FROM users u
          LEFT JOIN user_profile p ON p.id = u.id
          WHERE u.id = ?
        `);
        let profile = stmt.get(req.user.userId);

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        profile.email_id = profile.email || profile.email_id;
        profile.google_email = profile.profile_google_email || profile.google_email;
        profile.google_name = profile.profile_google_name || profile.google_name;
        profile.google_picture = profile.profile_google_picture || profile.google_picture;

        // Compute display values based on sources
        // Note: name_source is now treated as the master 'identity_source' for Name & Email
        profile.display_name = profile.name_source === 'google' && profile.google_name ? profile.google_name : profile.full_name;
        profile.display_email = profile.name_source === 'google' && profile.google_email ? profile.google_email : profile.email_id;
        
        // Default to Google picture if no local picture is uploaded
        if (profile.picture_source === 'google') {
          profile.display_picture = profile.google_picture || profile.profile_picture || null;
        } else if (!profile.profile_picture && profile.google_picture) {
          profile.display_picture = profile.google_picture;
          profile.picture_source = 'google';
        } else {
          profile.display_picture = profile.profile_picture || null;
        }
        
        res.json({ success: true, profile });
      } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to retrieve profile' });
      }
    },

    disconnectGoogle: (req, res) => {
      try {
        const userId = req.user.userId;
        const updateUser = db.prepare(`
          UPDATE users
          SET google_id = NULL, google_email = NULL, google_name = NULL, google_picture = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        const updateProfile = db.prepare(`
          UPDATE user_profile
          SET google_id = NULL, google_email = NULL, google_name = NULL, google_picture = NULL,
              name_source = 'local', picture_source = 'local', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        const deleteGoogleIdentity = db.prepare(`
          DELETE FROM user_identities
          WHERE user_id = ? AND provider = 'google'
        `);
        const invalidateSessions = db.prepare(`
          UPDATE users
          SET token_version = token_version + 1
          WHERE id = ?
        `);

        const transaction = db.transaction(() => {
          updateUser.run(userId);
          updateProfile.run(userId);
          deleteGoogleIdentity.run(userId);
          invalidateSessions.run(userId);
          sessionService.revokeUser(userId, 'identity_unlinked');
          auditService.record({ req, eventType: 'identity_unlink', outcome: 'success', userId, sessionId: req.user.sessionId, deviceId: req.user.deviceId, platform: req.user.platform, provider: 'google' });
        });
        transaction();

        res.json({ success: true });
      } catch (error) {
        console.error('Disconnect Google error:', error);
        res.status(500).json({ error: 'Failed to disconnect Google account' });
      }
    },

    /**
     * Update the user's profile information
     */
    updateProfile: (req, res) => {
      try {
        const userId = req.user.userId;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        const { full_name, email_id, email, display_name, username, profile_picture, name_source, picture_source } = req.body;
        
        const effectiveName = (full_name || display_name || user.full_name || '').trim();
        const effectiveEmail = (email_id || email || user.email || '').trim().toLowerCase();
        const normalizedUsername = username && typeof username === 'string' && username.trim() ? username.trim() : (user.username || null);

        if (!effectiveName || !effectiveEmail) {
          return res.status(400).json({ error: 'Name and Email are required' });
        }

        const conflict = db.prepare(`
          SELECT id FROM users
          WHERE (
              LOWER(email) = ?
              OR LOWER(google_email) = ?
              OR (? IS NOT NULL AND LOWER(username) = LOWER(?))
            )
            AND id <> ?
          LIMIT 1
        `).get(
          effectiveEmail,
          effectiveEmail,
          normalizedUsername,
          normalizedUsername,
          userId
        );

        if (conflict) {
          return res.status(409).json({ error: 'Username or email is already in use by another account' });
        }

        const userUpdates = ['full_name = ?', 'email = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const userParams = [effectiveName, effectiveEmail];

        if (normalizedUsername !== null) {
          userUpdates.push('username = ?');
          userParams.push(normalizedUsername);
        }

        userParams.push(userId);
        db.prepare(`
          UPDATE users SET ${userUpdates.join(', ')}
          WHERE id = ?
        `).run(...userParams);

        // Sync legacy user_profile only if FK matches auth_credentials
        try {
          const inAuthCreds = db.prepare('SELECT id FROM auth_credentials WHERE id = ?').get(userId);
          if (inAuthCreds) {
            const existing = db.prepare('SELECT id FROM user_profile WHERE id = ?').get(userId);
            if (existing) {
              db.prepare(`
                UPDATE user_profile SET 
                  full_name = ?,
                  email_id = ?,
                  profile_picture = ?,
                  name_source = ?,
                  picture_source = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(effectiveName, effectiveEmail, profile_picture || null, name_source || 'local', picture_source || 'local', userId);
            } else {
              db.prepare(`
                INSERT INTO user_profile (id, full_name, email_id, profile_picture, name_source, picture_source)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(userId, effectiveName, effectiveEmail, profile_picture || null, name_source || 'local', picture_source || 'local');
            }
          }
        } catch (profileErr) {
          console.warn('Optional user_profile sync skipped:', profileErr.message);
        }
        
        res.json({ success: true, message: 'Profile updated successfully' });
      } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: error.message || 'Failed to update profile' });
      }
    },

    /**
     * Request worker account deletion (pending owner approval)
     */
    requestAccountDeletion: (req, res) => {
      try {
        const userId = req.user.userId;
        const { reason, password } = req.body;

        const user = db.prepare('SELECT id, role, email, full_name, password_hash FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'owner') {
          return res.status(400).json({ error: 'Owner account cannot be deleted via worker lifecycle' });
        }

        // Verify password if local password exists
        if (user.password_hash && password) {
          const bcrypt = require('bcryptjs');
          if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Incorrect password' });
          }
        }

        db.transaction(() => {
          db.prepare(`
            UPDATE users SET 
              status = 'pending_deletion',
              deletion_requested_at = CURRENT_TIMESTAMP,
              deletion_reason = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(reason || 'Worker requested account deletion', userId);

          db.prepare(`
            INSERT INTO owner_notifications (type, title, body, data)
            VALUES ('worker_deletion_request', 'Worker Deletion Request', ?, ?)
          `).run(
            `Worker ${user.full_name || user.email} requested account deletion.`,
            JSON.stringify({ userId, email: user.email, name: user.full_name, reason: reason || 'Not specified' })
          );

          auditService.record({
            req,
            eventType: 'deletion_request',
            outcome: 'success',
            userId,
            sessionId: req.user.sessionId,
            platform: 'web',
            provider: 'local'
          });
        })();

        res.json({
          success: true,
          message: 'Account deletion request submitted. Pending Owner approval.',
          status: 'pending_deletion'
        });
      } catch (error) {
        console.error('Request account deletion error:', error);
        res.status(500).json({ error: 'Failed to submit deletion request' });
      }
    },

    /**
     * Cancel pending deletion request
     */
    cancelAccountDeletion: (req, res) => {
      try {
        const userId = req.user.userId;
        const result = db.prepare(`
          UPDATE users SET 
            status = 'active',
            deletion_requested_at = NULL,
            deletion_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND role = 'worker' AND status = 'pending_deletion'
        `).run(userId);

        if (!result.changes) {
          return res.status(400).json({ error: 'No active deletion request to cancel' });
        }

        res.json({ success: true, message: 'Deletion request cancelled. Your account remains active.', status: 'active' });
      } catch (error) {
        console.error('Cancel deletion error:', error);
        res.status(500).json({ error: 'Failed to cancel deletion request' });
      }
    },

    /**
     * Export personal profile data as JSON
     */
    exportData: (req, res) => {
      try {
        const userId = req.user.userId;
        const user = db.prepare(`
          SELECT id, username, email, full_name, role, status, created_at, last_login
          FROM users WHERE id = ?
        `).get(userId);

        const devices = db.prepare(`
          SELECT device_name, device_type, last_login, last_seen
          FROM user_devices WHERE user_id = ?
        `).all(userId);

        const activity = db.prepare(`
          SELECT module, action, resource_type, created_at
          FROM activity_log WHERE user_id = ?
          ORDER BY created_at DESC LIMIT 50
        `).all(userId);

        const exportPayload = {
          exported_at: new Date().toISOString(),
          user,
          devices,
          recent_activity: activity
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="macos_profile_${user?.username || 'export'}.json"`);
        res.json(exportPayload);
      } catch (error) {
        console.error('Export data error:', error);
        res.status(500).json({ error: 'Failed to export profile data' });
      }
    }
  };
};
