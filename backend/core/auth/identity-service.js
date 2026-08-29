const crypto = require('crypto');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

function identityConflict(message = 'This identity is already linked to another account.') {
  const error = new Error(message);
  error.code = 'IDENTITY_CONFLICT';
  return error;
}

function createIdentityService(db) {
  const resolveProviderIdentity = (provider, providerUserId, providerEmail) => {
    if (!provider || !providerUserId) throw new Error('Provider identity is incomplete');

    const normalizedProviderEmail = normalizeEmail(providerEmail);
    const canonical = db.prepare(`
      SELECT * FROM user_identities
      WHERE provider = ? AND provider_user_id = ?
      LIMIT 1
    `).get(provider, providerUserId);

    const matches = new Map();
    const addMatch = (userId, source) => {
      if (!userId) return;
      if (!matches.has(userId)) matches.set(userId, []);
      matches.get(userId).push(source);
    };

    addMatch(canonical?.user_id, 'canonical');

    if (provider === 'google') {
      const legacyUsers = db.prepare(`
        SELECT id FROM users
        WHERE google_id = ?
           OR (? IS NOT NULL AND LOWER(google_email) = ?)
           OR (? IS NOT NULL AND LOWER(email) = ?)
      `).all(providerUserId, normalizedProviderEmail, normalizedProviderEmail, normalizedProviderEmail, normalizedProviderEmail);
      legacyUsers.forEach(user => addMatch(user.id, 'users'));

      const legacyProfiles = db.prepare(`
        SELECT id FROM user_profile
        WHERE google_id = ?
           OR (? IS NOT NULL AND LOWER(google_email) = ?)
      `).all(providerUserId, normalizedProviderEmail, normalizedProviderEmail);
      legacyProfiles.forEach(profile => addMatch(profile.id, 'user_profile'));
    }

    const userIds = [...matches.keys()];
    const targetUser = userIds.length === 1
      ? db.prepare('SELECT * FROM users WHERE id = ?').get(userIds[0])
      : null;

    return {
      provider,
      providerUserId,
      providerEmail: normalizedProviderEmail,
      canonical,
      targetUser,
      userIds,
      matches: Object.fromEntries(matches)
    };
  };

  const assertCanLink = (resolution, requestedUserId) => {
    if (resolution.userIds.length > 1 ||
        (resolution.userIds.length === 1 && resolution.userIds[0] !== requestedUserId)) {
      throw identityConflict();
    }
    return true;
  };

  const link = ({ userId, provider, providerUserId, providerEmail, verified = true }) => {
    const resolution = resolveProviderIdentity(provider, providerUserId, providerEmail);
    assertCanLink(resolution, userId);
    const existing = db.prepare(
      'SELECT id FROM user_identities WHERE provider = ? AND provider_user_id = ?'
    ).get(provider, providerUserId);

    if (existing) {
      db.prepare(`
        UPDATE user_identities
        SET provider_email = ?, is_verified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(normalizeEmail(providerEmail), verified ? 1 : 0, existing.id);
      return existing.id;
    }

    const identityId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO user_identities
        (id, user_id, provider, provider_user_id, provider_email, is_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(identityId, userId, provider, providerUserId, normalizeEmail(providerEmail), verified ? 1 : 0);
    return identityId;
  };

  return { normalizeEmail, resolveProviderIdentity, assertCanLink, link };
}

module.exports = createIdentityService;