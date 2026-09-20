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
    
    // Resolve targetUser, prioritizing active/pending accounts over archived/deleted ones
    let targetUser = null;
    let resolvedUserIds = userIds;

    if (userIds.length === 1) {
      targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userIds[0]);
    } else if (userIds.length > 1) {
      const allMatchedUsers = userIds
        .map(id => db.prepare('SELECT * FROM users WHERE id = ?').get(id))
        .filter(Boolean);

      const activeUsers = allMatchedUsers.filter(u => u.status !== 'deleted');
      if (activeUsers.length === 1) {
        // Exactly one active/pending user matches; ignore archived deleted records
        targetUser = activeUsers[0];
        resolvedUserIds = [targetUser.id];
      } else if (activeUsers.length === 0 && allMatchedUsers.length > 0) {
        // All matches are deleted accounts; pick the most recently updated/created one to re-activate
        allMatchedUsers.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
        targetUser = allMatchedUsers[0];
        resolvedUserIds = [targetUser.id];
      }
    }

    return {
      provider,
      providerUserId,
      providerEmail: normalizedProviderEmail,
      canonical,
      targetUser,
      userIds: resolvedUserIds,
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