/**
 * Promote the existing local owner credentials to the canonical users table.
 * This migration is intentionally idempotent because migrations are loaded on
 * every application startup by DatabaseManager.
 */
function tableExists(db, tableName) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);
}

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function deriveUsername(email) {
  if (!email) return null;

  const localPart = email.split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');

  return localPart || null;
}

function selectAvailableUsername(db, requestedUsername, ownerId) {
  if (!requestedUsername) return null;

  let username = requestedUsername;
  let suffix = 2;

  while (true) {
    const conflict = db.prepare(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?'
    ).get(username, ownerId);

    if (!conflict) return username;
    username = `${requestedUsername}${suffix}`;
    suffix += 1;
  }
}

function up(db) {
  if (!tableExists(db, 'users')) return;

  if (!hasColumn(db, 'users', 'username')) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }

  if (!tableExists(db, 'auth_credentials')) return;

  const legacyCredentials = db.prepare(
    'SELECT password_hash, security_question, security_answer_hash FROM auth_credentials WHERE id = ?'
  ).get('admin_auth');

  if (!legacyCredentials) return;

  const profile = tableExists(db, 'user_profile')
    ? db.prepare(
      'SELECT full_name, email_id, profile_picture, google_id, google_email, google_name, google_picture FROM user_profile WHERE id = ?'
    ).get('admin_auth')
    : null;

  let existingOwner = db.prepare(
    "SELECT id, username, email FROM users WHERE id = ? OR role = 'owner' ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1"
  ).get('admin_auth', 'admin_auth');

  if (!existingOwner) {
    db.prepare(`
      INSERT INTO users (id, role, status, token_version)
      VALUES (?, 'owner', 'active', 0)
    `).run('admin_auth');
    existingOwner = { id: 'admin_auth', username: null, email: null };
  }

  const ownerId = existingOwner.id;
  const email = (existingOwner.email || profile?.google_email || profile?.email_id || null)?.trim().toLowerCase() || null;
  const requestedUsername = existingOwner.username || deriveUsername(email);
  const username = existingOwner.username || selectAvailableUsername(db, requestedUsername, ownerId);

  db.prepare(`
    UPDATE users SET
      username = COALESCE(username, ?),
      email = COALESCE(email, ?),
      full_name = COALESCE(full_name, ?),
      password_hash = COALESCE(password_hash, ?),
      security_question = COALESCE(security_question, ?),
      security_answer_hash = COALESCE(security_answer_hash, ?),
      role = 'owner',
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    username,
    email,
    profile?.google_name || profile?.full_name || null,
    legacyCredentials.password_hash,
    legacyCredentials.security_question,
    legacyCredentials.security_answer_hash,
    ownerId
  );

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized ON users (LOWER(username)) WHERE username IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON users (LOWER(email)) WHERE email IS NOT NULL');

  if (tableExists(db, 'user_identities') && legacyCredentials.password_hash) {
    const localIdentity = db.prepare(
      "SELECT id FROM user_identities WHERE user_id = ? AND provider = 'local' LIMIT 1"
    ).get(ownerId);

    if (localIdentity) {
      db.prepare(`
        UPDATE user_identities SET
          provider_user_id = COALESCE(provider_user_id, ?),
          provider_email = COALESCE(provider_email, ?),
          password_hash = ?,
          is_verified = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(username || email, email, legacyCredentials.password_hash, localIdentity.id);
    }
  }
}

module.exports = { up };