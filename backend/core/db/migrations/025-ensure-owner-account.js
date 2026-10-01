/**
 * 025-ensure-owner-account.js
 *
 * Guarantees that the canonical owner account ('admin_auth', 'fazztronic@gmail.com')
 * is always fully configured, active, and verified with valid local password hash
 * and Google identity link.
 *
 * Also auto-heals:
 * 1. Accidental 'pending' or 'worker' rows created for the owner email during first-time Google sign-in.
 * 2. Unverified or passwordless test owners (e.g. 'admin_test') that could shadow the real owner.
 * 3. Legacy auth_credentials and user_profile sync.
 */

function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function up(db) {
  if (!tableExists(db, 'users')) return;

  const OWNER_ID = 'admin_auth';
  const OWNER_EMAIL = 'fazztronic@gmail.com';
  const OWNER_USERNAME = 'faizal';
  const OWNER_NAME = 'Mohammad Faizal';
  const OWNER_GOOGLE_ID = '106343452762594034847';
  const OWNER_GOOGLE_PICTURE = 'https://lh3.googleusercontent.com/a/ACg8ocJZmpS8N2hlKJWhusmi0LwY6fAfvjg6mX-9u4pmOsMU6Rl-u6clVw=s96-c';
  const OWNER_PASSWORD_HASH = '$2b$10$R6pAVdxRZFeiGxwSpqqAOOHVJc66oMShruT1xkkTXe7XIxm/9i40S';
  const OWNER_SECURITY_QUESTION = 'In what city were you born?';
  const OWNER_SECURITY_ANSWER_HASH = '$2b$10$zt3seWWQ862UlzbRLyWlT.KQzqU2DWwpiadjqm0iY1uy4J1CLZHzi';
  const OWNER_SECURITY_ANSWER = 'c';

  // 1. Demote any dummy test accounts that have role='owner' without a password
  try {
    db.prepare(`
      UPDATE users 
      SET role = 'worker' 
      WHERE (id = 'admin_test' OR username = 'admin_test' OR email = 'admin@test.com') 
        AND role = 'owner'
    `).run();
  } catch (_) {}

  // 2. Clean up any accidental pending worker account created for owner email
  try {
    const pendingOwners = db.prepare(`
      SELECT id FROM users 
      WHERE (LOWER(email) = LOWER(?) OR LOWER(google_email) = LOWER(?))
        AND id <> ?
    `).all(OWNER_EMAIL, OWNER_EMAIL, OWNER_ID);

    for (const pending of pendingOwners) {
      if (tableExists(db, 'user_identities')) {
        db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(pending.id);
      }
      if (tableExists(db, 'worker_lifecycle_history')) {
        db.prepare('DELETE FROM worker_lifecycle_history WHERE user_id = ?').run(pending.id);
      }
      if (tableExists(db, 'user_devices')) {
        db.prepare('DELETE FROM user_devices WHERE user_id = ?').run(pending.id);
      }
      if (tableExists(db, 'auth_sessions')) {
        db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(pending.id);
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(pending.id);
      console.log(`✓ Purged accidental pending worker row ${pending.id} for owner email`);
    }
  } catch (err) {
    console.warn('⚠️ Pending owner cleanup warning:', err.message);
  }

  // 3. Ensure 'admin_auth' exists in users table with full owner credentials
  try {
    const existing = db.prepare('SELECT id, password_hash, security_question FROM users WHERE id = ?').get(OWNER_ID);

    if (!existing) {
      db.prepare(`
        INSERT INTO users (
          id, username, google_id, google_email, google_name, google_picture,
          full_name, email, password_hash, security_question, security_answer_hash, security_answer,
          is_verified, role, status, update_channel, token_version
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          1, 'owner', 'active', 'production', 1
        )
      `).run(
        OWNER_ID, OWNER_USERNAME, OWNER_GOOGLE_ID, OWNER_EMAIL, OWNER_NAME, OWNER_GOOGLE_PICTURE,
        OWNER_NAME, OWNER_EMAIL, OWNER_PASSWORD_HASH, OWNER_SECURITY_QUESTION, OWNER_SECURITY_ANSWER_HASH, OWNER_SECURITY_ANSWER
      );
      console.log('✅ Seeded canonical owner account admin_auth into users table');
    } else {
      db.prepare(`
        UPDATE users SET
          username = COALESCE(username, ?),
          email = COALESCE(email, ?),
          google_email = COALESCE(google_email, ?),
          google_id = COALESCE(google_id, ?),
          google_name = COALESCE(google_name, ?),
          google_picture = COALESCE(google_picture, ?),
          full_name = COALESCE(full_name, ?),
          password_hash = COALESCE(password_hash, ?),
          security_question = COALESCE(security_question, ?),
          security_answer_hash = COALESCE(security_answer_hash, ?),
          security_answer = COALESCE(security_answer, ?),
          role = 'owner',
          status = 'active',
          is_verified = 1
        WHERE id = ?
      `).run(
        OWNER_USERNAME, OWNER_EMAIL, OWNER_EMAIL, OWNER_GOOGLE_ID, OWNER_NAME, OWNER_GOOGLE_PICTURE,
        OWNER_NAME, OWNER_PASSWORD_HASH, OWNER_SECURITY_QUESTION, OWNER_SECURITY_ANSWER_HASH, OWNER_SECURITY_ANSWER,
        OWNER_ID
      );
      console.log('✅ Verified and ensured canonical owner credentials on admin_auth');
    }
  } catch (err) {
    console.error('✗ Failed to ensure owner user:', err.message);
  }

  // 4. Ensure legacy auth_credentials has admin_auth
  if (tableExists(db, 'auth_credentials')) {
    try {
      db.prepare(`
        INSERT INTO auth_credentials (id, user_role, password_hash, security_question, security_answer_hash)
        VALUES (?, 'admin', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          password_hash = COALESCE(auth_credentials.password_hash, excluded.password_hash),
          security_question = COALESCE(auth_credentials.security_question, excluded.security_question),
          security_answer_hash = COALESCE(auth_credentials.security_answer_hash, excluded.security_answer_hash)
      `).run(OWNER_ID, OWNER_PASSWORD_HASH, OWNER_SECURITY_QUESTION, OWNER_SECURITY_ANSWER_HASH);
    } catch (_) {}
  }

  // 5. Ensure user_profile has admin_auth
  if (tableExists(db, 'user_profile')) {
    try {
      db.prepare(`
        INSERT INTO user_profile (id, full_name, email_id, profile_picture, google_id, google_email, google_name, google_picture)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          full_name = COALESCE(user_profile.full_name, excluded.full_name),
          email_id = COALESCE(user_profile.email_id, excluded.email_id),
          google_id = COALESCE(user_profile.google_id, excluded.google_id),
          google_email = COALESCE(user_profile.google_email, excluded.google_email),
          google_name = COALESCE(user_profile.google_name, excluded.google_name),
          google_picture = COALESCE(user_profile.google_picture, excluded.google_picture)
      `).run(OWNER_ID, OWNER_NAME, OWNER_EMAIL, '/assets/Images/DefaultUser.png', OWNER_GOOGLE_ID, OWNER_EMAIL, OWNER_NAME, OWNER_GOOGLE_PICTURE);
    } catch (_) {}
  }

  // 6. Ensure user_identities has Google and local identities for admin_auth
  if (tableExists(db, 'user_identities')) {
    try {
      // Remove any conflicting identity records that belong to deleted workers or other IDs
      db.prepare(`
        DELETE FROM user_identities 
        WHERE ((provider = 'google' AND provider_user_id = ?) 
           OR (provider = 'google' AND LOWER(provider_email) = LOWER(?)))
           AND user_id <> ?
      `).run(OWNER_GOOGLE_ID, OWNER_EMAIL, OWNER_ID);

      const crypto = require('crypto');
      const existingGoogleIdentity = db.prepare(`
        SELECT id FROM user_identities 
        WHERE provider = 'google' AND (provider_user_id = ? OR LOWER(provider_email) = LOWER(?))
      `).get(OWNER_GOOGLE_ID, OWNER_EMAIL);

      if (!existingGoogleIdentity) {
        db.prepare(`
          INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified)
          VALUES (?, ?, 'google', ?, ?, 1)
        `).run(crypto.randomUUID(), OWNER_ID, OWNER_GOOGLE_ID, OWNER_EMAIL);
      } else {
        db.prepare(`
          UPDATE user_identities SET
            user_id = ?,
            provider_user_id = ?,
            provider_email = ?,
            is_verified = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(OWNER_ID, OWNER_GOOGLE_ID, OWNER_EMAIL, existingGoogleIdentity.id);
      }

      // Also ensure local identity
      const existingLocalIdentity = db.prepare(`
        SELECT id FROM user_identities WHERE user_id = ? AND provider = 'local'
      `).get(OWNER_ID);

      if (!existingLocalIdentity) {
        db.prepare(`
          INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, password_hash, is_verified)
          VALUES (?, ?, 'local', ?, ?, ?, 1)
        `).run(crypto.randomUUID(), OWNER_ID, OWNER_USERNAME, OWNER_EMAIL, OWNER_PASSWORD_HASH);
      } else {
        db.prepare(`
          UPDATE user_identities SET
            password_hash = COALESCE(password_hash, ?),
            is_verified = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(OWNER_PASSWORD_HASH, existingLocalIdentity.id);
      }
      console.log('✅ Synchronized user_identities for owner Google and local auth');
    } catch (err) {
      console.warn('⚠️ user_identities sync warning:', err.message);
    }
  }
}

module.exports = { up };
