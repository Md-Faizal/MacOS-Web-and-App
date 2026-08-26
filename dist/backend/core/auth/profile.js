module.exports = function(db) {
  return {
    /**
     * Get the user's profile information
     */
    getProfile: (req, res) => {
      try {
        const userId = req.user?.id || 'admin_auth';

        // 1. Fetch user from users table
        const user = db.prepare(`
          SELECT id, full_name, email, google_id, google_email, google_name, google_picture, role, status 
          FROM users 
          WHERE id = ?
        `).get(userId);

        // 2. Fetch custom display settings from user_profile if exists
        let legacyProfile = null;
        try {
          legacyProfile = db.prepare(`
            SELECT profile_picture, name_source, picture_source 
            FROM user_profile 
            WHERE id = ?
          `).get(userId);
        } catch (e) {}

        // 3. Fetch Google Identity status
        const googleIdentity = db.prepare("SELECT provider_user_id, provider_email FROM user_identities WHERE user_id = ? AND provider = 'google'").get(userId);

        const profile = {
          id: user ? user.id : userId,
          full_name: user?.full_name || '',
          email_id: user?.email || '',
          google_id: googleIdentity ? googleIdentity.provider_user_id : null,
          google_email: googleIdentity ? googleIdentity.provider_email : null,
          google_name: user?.google_name || null,
          google_picture: user?.google_picture || null,
          profile_picture: legacyProfile?.profile_picture || null,
          name_source: legacyProfile?.name_source || (user?.google_id ? 'google' : 'local'),
          picture_source: legacyProfile?.picture_source || (user?.google_picture ? 'google' : 'local'),
          role: user?.role || 'worker',
          status: user?.status || 'active'
        };

        // Compute display values based on sources
        profile.display_name = (profile.name_source === 'google' && profile.google_name) ? profile.google_name : profile.full_name;
        profile.display_email = (profile.name_source === 'google' && profile.google_email) ? profile.google_email : profile.email_id;
        profile.display_picture = (profile.picture_source === 'google' && profile.google_picture) ? profile.google_picture : (profile.profile_picture || profile.google_picture);

        res.json({ success: true, profile });
      } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to retrieve profile' });
      }
    },

    /**
     * Update the user's profile information
     */
    updateProfile: (req, res) => {
      try {
        const userId = req.user?.id || 'admin_auth';
        const { full_name, email_id, profile_picture, name_source, picture_source } = req.body;

        if (!full_name || !email_id) {
          return res.status(400).json({ error: 'Name and Email are required' });
        }

        // Update users table
        db.prepare(`
          UPDATE users SET 
            full_name = ?,
            email = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(full_name, email_id, userId);

        // Update / Insert user_profile display preferences
        try {
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
            `).run(full_name, email_id, profile_picture || null, name_source || 'local', picture_source || 'local', userId);
          } else {
            db.prepare(`
              INSERT INTO user_profile (id, full_name, email_id, profile_picture, name_source, picture_source) 
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(userId, full_name, email_id, profile_picture || null, name_source || 'local', picture_source || 'local');
          }
        } catch (e) {}

        res.json({ success: true, message: 'Profile updated successfully' });
      } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
      }
    },

    disconnectGoogle: (req, res) => {
      try {
        const userId = req.user?.id || 'admin_auth';
        
        db.prepare("DELETE FROM user_identities WHERE user_id = ? AND provider = 'google'").run(userId);
        
        try {
           db.prepare("UPDATE users SET google_id = NULL, google_email = NULL, google_name = NULL, google_picture = NULL WHERE id = ?").run(userId);
           db.prepare("UPDATE user_profile SET google_id = NULL, google_email = NULL, google_name = NULL, google_picture = NULL, name_source = 'local', picture_source = 'local' WHERE id = ?").run(userId);
        } catch (e) {}

        res.json({ success: true, message: 'Google account disconnected' });
      } catch (error) {
        console.error('Disconnect Google error:', error);
        res.status(500).json({ error: 'Failed to disconnect Google' });
      }
    }
  };
};
