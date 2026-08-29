const crypto = require('crypto');

function tableExists(db, tableName) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);
}

function up(db) {
  if (!tableExists(db, 'users') || !tableExists(db, 'user_profile') || !tableExists(db, 'auth_identity_conflicts')) return;

  const records = db.prepare(`
    SELECT id AS user_id, google_id AS identity_key, google_email AS provider_email, 'users.google_id' AS source
    FROM users WHERE google_id IS NOT NULL
    UNION ALL
    SELECT id, LOWER(google_email), google_email, 'users.google_email'
    FROM users WHERE google_email IS NOT NULL
    UNION ALL
    SELECT id, google_id, google_email, 'user_profile.google_id'
    FROM user_profile WHERE google_id IS NOT NULL
    UNION ALL
    SELECT id, LOWER(google_email), google_email, 'user_profile.google_email'
    FROM user_profile WHERE google_email IS NOT NULL
  `).all();

  const grouped = new Map();
  for (const record of records) {
    const key = record.identity_key?.trim().toLowerCase();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO auth_identity_conflicts
      (id, provider, identity_key, provider_email, user_id, source, details)
    VALUES (?, 'google', ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const [identityKey, matches] of grouped) {
      const userIds = new Set(matches.map(match => match.user_id));
      if (userIds.size < 2) continue;
      for (const match of matches) {
        insert.run(
          crypto.randomUUID(),
          identityKey,
          match.provider_email?.trim().toLowerCase() || null,
          match.user_id,
          match.source,
          JSON.stringify({ conflictingUserIds: [...userIds] })
        );
      }
    }
  });
  transaction();
}

module.exports = { up };