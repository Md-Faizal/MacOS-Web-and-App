const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sqliteDate(timestamp) {
  return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
}

function requestIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

function createMobileSessionService(db) {
  const create = ({ user, deviceId = null, req, provider = 'google' }) => {
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const refreshId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const ip = requestIp(req);

    db.prepare(`
      INSERT INTO auth_refresh_tokens (
        id, token_hash, family_id, user_id, device_id, platform,
        provider, expires_at, ip_address, ip_hash, user_agent
      ) VALUES (?, ?, ?, ?, ?, 'android', ?, ?, ?, ?, ?)
    `).run(
      refreshId,
      hashToken(refreshToken),
      familyId,
      user.id,
      deviceId,
      provider,
      sqliteDate(Date.now() + REFRESH_TOKEN_TTL_MS),
      ip,
      ip ? hashToken(ip) : null,
      req?.get?.('user-agent') || null
    );

    return {
      accessToken: createAccessToken(user, deviceId, provider, refreshId),
      refreshToken,
      refreshTokenId: refreshId,
      expiresIn: 15 * 60
    };
  };

  const createAccessToken = (user, deviceId, provider, refreshId) => jwt.sign({
    userId: user.id,
    role: user.role,
    tokenVersion: user.token_version || 0,
    deviceId,
    platform: 'android',
    provider,
    refreshTokenId: refreshId
  }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

  const rotate = ({ refreshToken, req }) => {
    if (!refreshToken) return null;
    const stored = db.prepare(`
      SELECT r.*, u.role, u.status, u.token_version, u.username, u.email, u.full_name
      FROM auth_refresh_tokens r
      INNER JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ?
      LIMIT 1
    `).get(hashToken(refreshToken));

    if (!stored || stored.revoked_at || Date.parse(`${stored.expires_at}Z`) <= Date.now() || stored.status !== 'active') {
      if (stored?.family_id) {
        db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'refresh_reuse' WHERE family_id = ? AND revoked_at IS NULL`).run(stored.family_id);
      }
      return null;
    }

    const user = {
      id: stored.user_id,
      role: stored.role,
      token_version: stored.token_version,
      username: stored.username,
      email: stored.email,
      full_name: stored.full_name
    };
    const replacement = crypto.randomBytes(48).toString('base64url');
    const replacementId = crypto.randomUUID();
    const ip = requestIp(req);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO auth_refresh_tokens (
          id, token_hash, family_id, user_id, device_id, platform,
          provider, expires_at, ip_address, ip_hash, user_agent
        ) VALUES (?, ?, ?, ?, ?, 'android', ?, ?, ?, ?, ?)
      `).run(
        replacementId,
        hashToken(replacement),
        stored.family_id,
        stored.user_id,
        stored.device_id,
        stored.provider || 'google',
        stored.expires_at,
        ip,
        ip ? hashToken(ip) : null,
        req?.get?.('user-agent') || stored.user_agent
      );
      db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'rotated', last_used_at = CURRENT_TIMESTAMP, replaced_by = ? WHERE id = ? AND revoked_at IS NULL`).run(replacementId, stored.id);
    })();

    return {
      accessToken: createAccessToken(user, stored.device_id, stored.provider || 'google', replacementId),
      refreshToken: replacement,
      refreshTokenId: replacementId,
      expiresIn: 15 * 60,
      user
    };
  };

  const revoke = (refreshToken, reason = 'logout') => {
    if (!refreshToken) return;
    db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE token_hash = ? AND revoked_at IS NULL`).run(reason, hashToken(refreshToken));
  };

  const revokeUser = (userId, reason = 'global_logout') => {
    db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL`).run(reason, userId);
  };

  return { create, rotate, revoke, revokeUser, hashToken };
}

module.exports = createMobileSessionService;