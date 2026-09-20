const crypto = require('crypto');

const SESSION_COOKIE = 'auth_session';
const SESSION_SECRET_BYTES = 32;
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

function toSqliteDate(timestamp) {
  return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

function createSessionService(db) {
  const create = ({ userId, deviceId = null, platform = 'web', provider = null, req, elevated = false }) => {
    const secret = crypto.randomBytes(SESSION_SECRET_BYTES).toString('base64url');
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const ip = requestIp(req);

    db.prepare(`
      INSERT INTO auth_sessions (
        id, secret_hash, user_id, device_id, platform, provider,
        ip_address, ip_hash, user_agent, idle_expires_at, absolute_expires_at, elevated_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      hashSecret(secret),
      userId,
      deviceId,
      platform,
      provider,
      ip,
      ip ? hashSecret(ip) : null,
      req?.get?.('user-agent') || null,
      toSqliteDate(now + (elevated ? 60 * 60 * 1000 : IDLE_TIMEOUT_MS)),
      toSqliteDate(now + (elevated ? 60 * 60 * 1000 : ABSOLUTE_TIMEOUT_MS)),
      elevated ? toSqliteDate(now + 60 * 60 * 1000) : null
    );

    return { sessionId, secret, deviceId };
  };

  const resolve = (secret, req) => {
    if (!secret) return null;
    const session = db.prepare(`
      SELECT s.*, u.role, u.status, u.username, u.email, u.full_name
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.secret_hash = ?
        AND s.revoked_at IS NULL
        AND s.idle_expires_at > CURRENT_TIMESTAMP
        AND s.absolute_expires_at > CURRENT_TIMESTAMP
        AND u.status = 'active'
      LIMIT 1
    `).get(hashSecret(secret));

    if (!session) return null;

    const now = Date.now();
    db.prepare(`
      UPDATE auth_sessions
      SET last_seen_at = CURRENT_TIMESTAMP, idle_expires_at = CASE WHEN elevated_until IS NOT NULL THEN idle_expires_at ELSE ? END
      WHERE id = ? AND revoked_at IS NULL
    `).run(toSqliteDate(Math.min(now + IDLE_TIMEOUT_MS, Date.parse(`${session.absolute_expires_at}Z`))), session.id);

    return {
      sessionId: session.id,
      userId: session.user_id,
      id: session.user_id,
      deviceId: session.device_id,
      platform: session.platform,
      provider: session.provider,
      role: session.role,
      username: session.username,
      email: session.email,
      fullName: session.full_name
      ,elevated: !!session.elevated_until && Date.parse(`${session.elevated_until}Z`) > now
    };
  };

  const revoke = (sessionId, reason = 'logout') => {
    if (!sessionId) return;
    db.prepare(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(reason, sessionId);
  };

  const revokeUser = (userId, reason = 'global_logout') => {
    db.prepare(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(reason, userId);
  };

  const revokeDevice = (deviceId, userId, reason = 'device_revoked') => {
    if (!deviceId || !userId) return;
    db.prepare(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
      WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL
    `).run(reason, userId, deviceId);
  };

  const revokeOtherSessions = (userId, currentSessionId, reason = 'other_sessions_revoked') => {
    if (!userId) return;
    db.prepare(`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ?
      WHERE user_id = ? AND id != ? AND revoked_at IS NULL
    `).run(reason, userId, currentSessionId || '');
  };

  const setCookie = (req, res, secret) => {
    res.cookie(SESSION_COOKIE, secret, {
      httpOnly: true,
      secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
      sameSite: 'Lax',
      maxAge: ABSOLUTE_TIMEOUT_MS,
      path: '/'
    });
  };

  const clearCookie = (res) => res.clearCookie(SESSION_COOKIE, { path: '/' });

  return { create, resolve, revoke, revokeUser, revokeDevice, revokeOtherSessions, setCookie, clearCookie, cookieName: SESSION_COOKIE };
}

module.exports = createSessionService;