const crypto = require('crypto');

function hashIp(ip) {
  return ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
}

function requestIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

function createAuditService(db) {
  const record = ({ req, eventType, outcome, userId = null, sessionId = null, deviceId = null, platform = null, provider = null, details = null }) => {
    try {
      const ip = requestIp(req);
      db.prepare(`
        INSERT INTO auth_audit_events (
          id, request_id, event_type, outcome, user_id, session_id, device_id,
          platform, provider, ip_address, ip_hash, user_agent, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        req?.requestId || null,
        eventType,
        outcome,
        userId,
        sessionId,
        deviceId,
        platform,
        provider,
        ip,
        hashIp(ip),
        req?.get?.('user-agent') || null,
        details ? JSON.stringify(details) : null
      );
    } catch (error) {
      console.warn('Auth audit event failed:', error.message);
    }
  };

  const purgeExpired = () => {
    db.transaction(() => {
      db.prepare("DELETE FROM oauth_states WHERE expires_at < strftime('%s', 'now') * 1000").run();
      db.prepare("DELETE FROM webauthn_challenges WHERE expires_at < strftime('%s', 'now') * 1000").run();
      db.prepare("DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now', '-90 days')").run();
      db.prepare("DELETE FROM auth_refresh_tokens WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now', '-90 days')").run();
      db.prepare("DELETE FROM auth_audit_events WHERE created_at < datetime('now', '-365 days')").run();
    })();
  };

  return { record, hashIp, purgeExpired };
}

module.exports = createAuditService;