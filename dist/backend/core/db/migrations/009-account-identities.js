const crypto = require('crypto');

module.exports = {
  up: (db) => {
    console.log('  ⚙️  Running Migration 009: Account Identities (Pre-Hijacking Defense)...');
    try {
      // 1. Create user_identities table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL, -- 'local', 'google', 'webauthn'
          provider_user_id TEXT, -- e.g., google_id or local username/email
          provider_email TEXT,
          password_hash TEXT,
          is_verified BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(provider, provider_user_id)
        );
      `);

      // 2. Add is_verified to users table (SQLite doesn't support complex ALTER, but we can add columns safely)
      try {
        db.exec("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0;");
      } catch (err) {
        // Ignore if column already exists
      }

      // 3. Migrate existing Local accounts
      const localUsers = db.prepare("SELECT id, email, full_name, password_hash FROM users WHERE password_hash IS NOT NULL").all();
      const insertIdentity = db.prepare(`
        INSERT OR IGNORE INTO user_identities (id, user_id, provider, provider_user_id, provider_email, password_hash, is_verified)
        VALUES (?, ?, 'local', ?, ?, ?, 1)
      `);
      
      const updateVerified = db.prepare("UPDATE users SET is_verified = 1 WHERE id = ?");

      db.transaction(() => {
        for (const user of localUsers) {
          if (user.password_hash) {
            // we will use email as provider_user_id for local, fallback to full_name if no email
            const identifier = user.email || user.full_name || user.id;
            insertIdentity.run(
              crypto.randomUUID(),
              user.id,
              identifier.toLowerCase(),
              user.email ? user.email.toLowerCase() : null,
              user.password_hash
            );
            updateVerified.run(user.id);
          }
        }
      })();

      // 4. Migrate existing Google accounts
      const googleUsers = db.prepare("SELECT id, google_id, google_email FROM users WHERE google_id IS NOT NULL").all();
      const insertGoogle = db.prepare(`
        INSERT OR IGNORE INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified)
        VALUES (?, ?, 'google', ?, ?, 1)
      `);

      db.transaction(() => {
        for (const user of googleUsers) {
          if (user.google_id) {
            insertGoogle.run(
              crypto.randomUUID(),
              user.id,
              user.google_id,
              user.google_email
            );
            updateVerified.run(user.id);
          }
        }
      })();

      console.log('  ✅ Migration 009 completed successfully');
      return true;
    } catch (error) {
      console.error('  ❌ Migration 009 failed:', error);
      throw error;
    }
  },
  down: (db) => {
    db.exec(`DROP TABLE IF EXISTS user_identities;`);
  }
};
