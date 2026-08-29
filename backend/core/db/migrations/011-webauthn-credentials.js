/**
 * Add storage for account-bound WebAuthn credentials.
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

function up(db) {
  if (!tableExists(db, 'user_identities')) return;

  if (!hasColumn(db, 'user_identities', 'credential_public_key')) {
    db.exec('ALTER TABLE user_identities ADD COLUMN credential_public_key BLOB');
  }
  if (!hasColumn(db, 'user_identities', 'credential_counter')) {
    db.exec('ALTER TABLE user_identities ADD COLUMN credential_counter INTEGER DEFAULT 0');
  }
  if (!hasColumn(db, 'user_identities', 'credential_transports')) {
    db.exec('ALTER TABLE user_identities ADD COLUMN credential_transports TEXT');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_identities_webauthn
    ON user_identities (user_id, provider)
  `);
}

module.exports = { up };
