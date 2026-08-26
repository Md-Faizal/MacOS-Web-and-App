module.exports = function(db) {
  return {
    /**
     * Get the user's profile information
     */
    getProfile: (req, res) => {
      try {
        const stmt = db.prepare('SELECT full_name, email_id, profile_picture, google_id, google_email, google_name, google_picture, name_source, picture_source FROM user_profile WHERE id = ?');
        let profile = stmt.get('admin_auth');
        
        // If profile doesn't exist, return default values
        if (!profile) {
          profile = {
            full_name: "Mohammad Faizal",
            email_id: "m.faizal@cloud.com",
            profile_picture: null,
            name_source: 'local',
            picture_source: 'local'
          };
        }

        // Compute display values based on sources
        // Note: name_source is now treated as the master 'identity_source' for Name & Email
        profile.display_name = profile.name_source === 'google' && profile.google_name ? profile.google_name : profile.full_name;
        profile.display_email = profile.name_source === 'google' && profile.google_email ? profile.google_email : profile.email_id;
        profile.display_picture = profile.picture_source === 'google' && profile.google_picture ? profile.google_picture : profile.profile_picture;
        
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
        const { full_name, email_id, profile_picture, name_source, picture_source } = req.body;
        
        if (!full_name || !email_id) {
          return res.status(400).json({ error: 'Name and Email are required' });
        }

        const existing = db.prepare('SELECT id, google_id, google_email, google_name, google_picture FROM user_profile WHERE id = ?').get('admin_auth');
        
        if (existing) {
          const stmt = db.prepare(`
            UPDATE user_profile SET 
              full_name = ?,
              email_id = ?,
              profile_picture = ?,
              name_source = ?,
              picture_source = ?,
              google_id = ?,
              google_email = ?,
              google_name = ?,
              google_picture = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `);
          stmt.run(
            full_name, 
            email_id, 
            profile_picture, 
            name_source || 'local', 
            picture_source || 'local',
            req.body.google_id || existing.google_id, 
            req.body.google_email || existing.google_email,
            req.body.google_name || existing.google_name,
            req.body.google_picture || existing.google_picture,
            'admin_auth'
          );
        } else {
          const stmt = db.prepare(`
            INSERT INTO user_profile (id, full_name, email_id, profile_picture, name_source, picture_source, google_id, google_email, google_name, google_picture)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            'admin_auth', 
            full_name, 
            email_id, 
            profile_picture, 
            name_source || 'local', 
            picture_source || 'local',
            req.body.google_id || null, 
            req.body.google_email || null,
            req.body.google_name || null,
            req.body.google_picture || null
          );
        }
        
        res.json({ success: true, message: 'Profile updated successfully' });
      } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
      }
    }
  };
};
