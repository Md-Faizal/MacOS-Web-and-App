/**
 * MIGRATION 008: Multi-User Foundation
 *
 * 1. Creates new tables:
 *    - users (multi-user accounts with hybrid owner & Google worker support)
 *    - user_permissions (RBAC module-level permissions)
 *    - user_contact_access (granular contact data access)
 *    - activity_log (audit log for all mutations across web and android)
 *    - owner_notifications (in-app notifications for owner)
 *    - android_update_channels (production vs testing APK distribution)
 * 2. Adds triggers to activity_log for tamper resistance (append-only)
 * 3. Adds user-tracking columns to contacts, invoices, payments, orders
 * 4. Seeds the initial owner record from existing auth_credentials & user_profile
 * 5. Backfills existing contacts/invoices/payments/orders with owner user id
 * 6. Seeds default android update channels ('production' and 'testing')
 */

module.exports = {
  up: (db) => {
    console.log('  ⚙️  Running Migration 008: Multi-User Foundation...');

    try {
      // 1. Create `users` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          google_id TEXT UNIQUE,
          google_email TEXT,
          google_name TEXT,
          google_picture TEXT,
          full_name TEXT,
          email TEXT,
          password_hash TEXT,
          security_question TEXT,
          security_answer_hash TEXT,
          role TEXT DEFAULT 'worker',
          status TEXT DEFAULT 'pending',
          invite_code TEXT UNIQUE,
          invite_qr_base64 TEXT,
          approved_by TEXT,
          approved_at DATETIME,
          update_channel TEXT DEFAULT 'production',
          token_version INTEGER DEFAULT 0,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
      `);

      // 2. Create `user_permissions` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          module TEXT NOT NULL,
          can_view INTEGER DEFAULT 0,
          can_create INTEGER DEFAULT 0,
          can_edit INTEGER DEFAULT 0,
          can_delete INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, module)
        );
        CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
      `);

      // 3. Create `user_contact_access` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_contact_access (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          contact_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          UNIQUE(user_id, contact_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_contact_access_user ON user_contact_access(user_id);
      `);

      // 4. Create `activity_log` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          platform TEXT NOT NULL,
          module TEXT,
          action TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          resource_name TEXT,
          metadata TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_activity_log_module ON activity_log(module);
      `);

      // 5. Append-only triggers for activity_log (tamper resistance)
      try {
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS trg_prevent_activity_log_update
          BEFORE UPDATE ON activity_log
          BEGIN
            SELECT RAISE(ABORT, 'Activity log entries cannot be modified');
          END;

          CREATE TRIGGER IF NOT EXISTS trg_prevent_activity_log_delete
          BEFORE DELETE ON activity_log
          BEGIN
            SELECT RAISE(ABORT, 'Activity log entries cannot be deleted');
          END;
        `);
      } catch (trgErr) {
        console.warn('    Note: activity_log trigger setup warning:', trgErr.message);
      }

      // 6. Create `owner_notifications` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS owner_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          data TEXT,
          read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_owner_notifications_read ON owner_notifications(read);
      `);

      // 7. Create `android_update_channels` table
      db.exec(`
        CREATE TABLE IF NOT EXISTS android_update_channels (
          id TEXT PRIMARY KEY,
          version_name TEXT,
          version_code INTEGER,
          apk_filename TEXT,
          release_notes TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed default update channels
      db.prepare(`
        INSERT OR IGNORE INTO android_update_channels (id, version_name, version_code, apk_filename, release_notes)
        VALUES 
          ('production', '1.0.0', 1, 'latest.apk', 'Production release channel'),
          ('testing', '1.0.0', 1, 'latest.apk', 'Testing / Preview release channel')
      `).run();

      // 8. Add user tracking columns to existing tables
      const addColumnIfNotExists = (tableName, columnName, columnDef) => {
        const info = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const hasCol = info.some(col => col.name === columnName);
        if (!hasCol) {
          console.log(`    + Adding column ${columnName} to ${tableName}`);
          db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`).run();
        }
      };

      addColumnIfNotExists('contacts', 'created_by_user_id', 'TEXT');
      addColumnIfNotExists('invoices', 'created_by_user_id', 'TEXT');
      addColumnIfNotExists('invoices', 'last_edited_by', 'TEXT');
      addColumnIfNotExists('payments', 'created_by_user_id', 'TEXT');
      addColumnIfNotExists('orders', 'created_by_user_id', 'TEXT');

      // 9. Seed/Migrate Owner Account
      const existingOwner = db.prepare("SELECT * FROM users WHERE role = 'owner' OR id = 'admin_auth'").get();
      
      let ownerId = 'admin_auth';

      if (!existingOwner) {
        // Read credentials and profile from legacy single-user tables if available
        let passwordHash = null;
        let secQuestion = null;
        let secAnswerHash = null;
        let googleId = null;
        let googleName = null;
        let googlePic = null;
        let fullName = 'Mohammad Faizal';
        let email = 'fazzronic@gmail.com';
        let googleEmail = 'fazzronic@gmail.com';

        try {
          const authRow = db.prepare("SELECT * FROM auth_credentials WHERE id = 'admin_auth'").get();
          if (authRow) {
            passwordHash = authRow.password_hash;
            secQuestion = authRow.security_question;
            secAnswerHash = authRow.security_answer_hash;
          }
        } catch (e) {
          // Ignore if table missing
        }

        try {
          const profileRow = db.prepare("SELECT * FROM user_profile WHERE id = 'admin_auth'").get();
          if (profileRow) {
            fullName = profileRow.full_name || fullName;
            email = profileRow.email_id || email;
            googleId = profileRow.google_id || null;
            googleEmail = profileRow.google_email || googleEmail;
            googleName = profileRow.google_name || null;
            googlePic = profileRow.google_picture || null;
          }
        } catch (e) {
          // Ignore if table missing
        }

        db.prepare(`
          INSERT INTO users (
            id, google_id, google_email, google_name, google_picture,
            full_name, email, password_hash, security_question, security_answer_hash,
            role, status, update_channel, token_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', 'active', 'production', 0)
        `).run(
          ownerId, googleId, googleEmail, googleName, googlePic,
          fullName, email, passwordHash, secQuestion, secAnswerHash
        );

        console.log('    ✓ Owner account seeded successfully in users table');
      } else {
        // Ensure default owner email is fazztronic@gmail.com if generic
        if (!existingOwner.email || existingOwner.email.includes('cloud.com') || existingOwner.email.includes('example.com') || existingOwner.email === 'fazzronic@gmail.com') {
          db.prepare("UPDATE users SET email = 'fazztronic@gmail.com', google_email = 'fazztronic@gmail.com', full_name = 'Mohammad Faizal' WHERE id = ?").run(ownerId);
        }
      }

      // 10. Backfill existing business data records with owner ID if empty
      db.prepare("UPDATE contacts SET created_by_user_id = ? WHERE created_by_user_id IS NULL").run(ownerId);
      db.prepare("UPDATE invoices SET created_by_user_id = ? WHERE created_by_user_id IS NULL").run(ownerId);
      db.prepare("UPDATE payments SET created_by_user_id = ? WHERE created_by_user_id IS NULL").run(ownerId);
      db.prepare("UPDATE orders SET created_by_user_id = ? WHERE created_by_user_id IS NULL").run(ownerId);

      console.log('  ✅ Migration 008 completed successfully');
    } catch (err) {
      console.error('  ✗ Migration failed (008-multi-user-foundation):', err.message);
      throw err;
    }
  }
};
