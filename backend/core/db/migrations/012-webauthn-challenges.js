/**
 * Store WebAuthn challenges in SQLite so they survive process restarts.
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      challenge_key TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
}

module.exports = { up };
