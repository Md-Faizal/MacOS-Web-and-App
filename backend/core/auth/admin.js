const crypto = require('crypto');

const MODULES = [
  'billing', 'products', 'contacts', 'analytics', 'notes', 'calendar', 'cloud',
  'calculator', 'ai-vision', 'settings'
];
const DEFAULT_WORKER_APPS = ['billing', 'products', 'contacts', 'analytics'];
const ACTIONS = ['can_view', 'can_create', 'can_edit', 'can_delete'];

module.exports = function(db) {
  const ownerOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }
    next();
  };

  const listUsers = (req, res) => {
    try {
      const users = db.prepare(`
        SELECT id, username, full_name, email, google_email, google_picture,
               role, status, invite_code, invite_qr_base64, approved_at,
               deletion_requested_at, deletion_reason, deleted_at, deleted_by, created_at
        FROM users
        WHERE role = 'worker'
        ORDER BY 
          CASE status 
            WHEN 'pending_deletion' THEN 0
            WHEN 'pending' THEN 1 
            WHEN 'active' THEN 2 
            ELSE 3 
          END, 
          created_at DESC
      `).all();
      res.json({ users });
    } catch (e) {
      console.warn('Fallback listUsers query due to schema mismatch:', e.message);
      try {
        const users = db.prepare(`
          SELECT id, username, full_name, email, google_email, google_picture,
                 role, status, invite_code, invite_qr_base64, approved_at, created_at
          FROM users
          WHERE role = 'worker'
          ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
        `).all();
        res.json({ users });
      } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Failed to retrieve workers list' });
      }
    }
  };

  const getNotifications = (req, res) => {
    const notifications = db.prepare(`
      SELECT id, type, title, body, data, read, created_at
      FROM owner_notifications
      ORDER BY created_at DESC
      LIMIT 50
    `).all().map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : null
    }));
    res.json({ notifications });
  };

  const approveUser = (req, res) => {
    const user = db.prepare("SELECT id, role, status FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });

    let allowedApps = Array.isArray(req.body.allowedApps) ? req.body.allowedApps : null;
    let permissions = req.body.permissions || {};
    
    if (allowedApps) {
      permissions = {};
      MODULES.forEach(mod => {
        const isAllowed = allowedApps.includes(mod) ? 1 : 0;
        permissions[mod] = { can_view: isAllowed, can_create: isAllowed, can_edit: isAllowed, can_delete: isAllowed };
      });
    } else if (Object.keys(permissions).length === 0) {
      // Default to 4 core apps if nothing specified
      permissions = {};
      MODULES.forEach(mod => {
        const isAllowed = DEFAULT_WORKER_APPS.includes(mod) ? 1 : 0;
        permissions[mod] = { can_view: isAllowed, can_create: isAllowed, can_edit: isAllowed, can_delete: isAllowed };
      });
    }

    const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
    const updateUser = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
            deleted_at = NULL, deleted_by = NULL, deletion_requested_at = NULL, deletion_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.userId, user.id);

      // Record join lifecycle event
      try {
        const historyId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO worker_lifecycle_history (id, user_id, email, full_name, role, status, joined_at, approved_by, approved_at)
          SELECT ?, id, email, full_name, role, 'active', created_at, ?, CURRENT_TIMESTAMP
          FROM users WHERE id = ?
        `).run(historyId, req.user.userId, user.id);
      } catch (e) {}

      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id);
      const permissionInsert = db.prepare(`
        INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const moduleName of MODULES) {
        const modulePermissions = permissions[moduleName] || {};
        const values = ACTIONS.map(action => Number(modulePermissions[action]) === 1 ? 1 : 0);
        permissionInsert.run(user.id, moduleName, ...values);
      }

      db.prepare('DELETE FROM user_contact_access WHERE user_id = ?').run(user.id);
      const contactInsert = db.prepare('INSERT OR IGNORE INTO user_contact_access (user_id, contact_id) VALUES (?, ?)');
      for (const contactId of contactIds) {
        if (Number.isInteger(Number(contactId))) contactInsert.run(user.id, Number(contactId));
      }

      db.prepare(`
        INSERT INTO activity_log (user_id, platform, module, action, resource_type, resource_id, metadata)
        VALUES (?, 'web', 'admin', 'approve', 'user', ?, ?)
      `).run(req.user.userId, user.id, JSON.stringify({ contactCount: contactIds.length }));
    });

    updateUser();
    res.json({ success: true, status: 'active', userId: user.id });
  };

  const approveDeletion = (req, res) => {
    const user = db.prepare("SELECT id, username, email, full_name, role, status, deletion_reason FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });

    db.transaction(() => {
      // 1. Purge credentials and personal data (GDPR / Privacy compliant)
      db.prepare(`
        UPDATE users SET 
          password_hash = NULL,
          google_id = NULL,
          google_email = NULL,
          google_name = NULL,
          google_picture = NULL,
          status = 'deleted',
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?,
          token_version = token_version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.userId, user.id);

      db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM user_profile WHERE id = ?').run(user.id);
      db.prepare('DELETE FROM clock_settings WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM weather_settings WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM user_contact_access WHERE user_id = ?').run(user.id);

      // 2. Revoke all active sessions
      db.prepare("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'account_deleted_by_owner' WHERE user_id = ? AND revoked_at IS NULL").run(user.id);
      db.prepare("UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").run(user.id);

      // 3. Record lifecycle audit entry
      try {
        const historyId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO worker_lifecycle_history (id, user_id, email, full_name, role, status, deletion_reason, deleted_at, deleted_by)
          VALUES (?, ?, ?, ?, 'worker', 'deleted', ?, CURRENT_TIMESTAMP, ?)
        `).run(historyId, user.id, user.email, user.full_name || user.username, user.deletion_reason || 'Owner approved deletion request', req.user.userId);
      } catch (e) {}

      // 4. Log in activity_log
      db.prepare(`
        INSERT INTO activity_log (user_id, platform, module, action, resource_type, resource_id, metadata)
        VALUES (?, 'web', 'admin', 'approve_deletion', 'user', ?, ?)
      `).run(req.user.userId, user.id, JSON.stringify({ email: user.email, reason: user.deletion_reason }));
    })();

    res.json({ success: true, message: 'Worker account deleted and archived successfully', status: 'deleted' });
  };

  const rejectDeletion = (req, res) => {
    const user = db.prepare("SELECT id, role, status FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });

    db.transaction(() => {
      db.prepare(`
        UPDATE users SET 
          status = 'active',
          deletion_requested_at = NULL,
          deletion_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id);

      db.prepare(`
        INSERT INTO activity_log (user_id, platform, module, action, resource_type, resource_id)
        VALUES (?, 'web', 'admin', 'reject_deletion', 'user', ?)
      `).run(req.user.userId, user.id);
    })();

    res.json({ success: true, message: 'Deletion request rejected; worker remains active', status: 'active' });
  };

  const getWorkerLifecycleHistory = (req, res) => {
    const { userId } = req.params;
    try {
      const history = db.prepare(`
        SELECT * FROM worker_lifecycle_history
        WHERE user_id = ? OR email IN (SELECT email FROM users WHERE id = ?)
        ORDER BY created_at DESC
      `).all(userId, userId);
      res.json({ history });
    } catch (e) {
      res.json({ history: [] });
    }
  };

  const setStatus = (req, res) => {
    const status = req.body.status;
    if (!['active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = db.prepare(`
      UPDATE users SET status = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND role = 'worker'
    `).run(status, req.params.userId);
    if (!result.changes) return res.status(404).json({ error: 'Worker not found' });
    res.json({ success: true, status });
  };

  const getPermissions = (req, res) => {
    const user = db.prepare("SELECT id, role FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });
    const permissions = db.prepare('SELECT module, can_view, can_create, can_edit, can_delete FROM user_permissions WHERE user_id = ?').all(user.id);
    const allowedApps = permissions.length > 0
      ? permissions.filter(p => p.can_view === 1).map(p => p.module)
      : DEFAULT_WORKER_APPS;
    const contactIds = db.prepare('SELECT contact_id FROM user_contact_access WHERE user_id = ?').all(user.id).map(row => row.contact_id);
    res.json({ permissions, allowedApps, contactIds });
  };

  const updateUserPermissions = (req, res) => {
    const user = db.prepare("SELECT id, role, status FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });

    let allowedApps = Array.isArray(req.body.allowedApps) ? req.body.allowedApps : null;
    let permissions = req.body.permissions || {};

    if (allowedApps) {
      permissions = {};
      MODULES.forEach(mod => {
        const isAllowed = allowedApps.includes(mod) ? 1 : 0;
        permissions[mod] = { can_view: isAllowed, can_create: isAllowed, can_edit: isAllowed, can_delete: isAllowed };
      });
    }

    const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
    
    db.transaction(() => {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id);
      const permissionInsert = db.prepare(`
        INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const moduleName of MODULES) {
        const modulePermissions = permissions[moduleName] || {};
        const values = ACTIONS.map(action => Number(modulePermissions[action]) === 1 ? 1 : 0);
        permissionInsert.run(user.id, moduleName, ...values);
      }

      db.prepare('DELETE FROM user_contact_access WHERE user_id = ?').run(user.id);
      const contactInsert = db.prepare('INSERT OR IGNORE INTO user_contact_access (user_id, contact_id) VALUES (?, ?)');
      for (const contactId of contactIds) {
        if (Number.isInteger(Number(contactId))) contactInsert.run(user.id, Number(contactId));
      }

      db.prepare(`
        INSERT INTO activity_log (user_id, platform, module, action, resource_type, resource_id, metadata)
        VALUES (?, 'web', 'admin', 'update_permissions', 'user', ?, ?)
      `).run(req.user.userId, user.id, JSON.stringify({ contactCount: contactIds.length }));
      
      // Bump token version to force worker to re-authenticate and fetch new permissions
      db.prepare('UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    })();

    res.json({ success: true, message: 'Permissions updated successfully' });
  };

  const deleteUser = (req, res) => {
    return approveDeletion(req, res);
  };

  const getAuditLogs = (req, res) => {
    const { userId } = req.params;
    let query = `
      SELECT id, user_id, platform, module, action, resource_type, resource_id, resource_name, metadata, ip_address, created_at
      FROM activity_log
    `;
    let params = [];
    
    if (userId && userId !== 'all') {
      query += ` WHERE user_id = ? `;
      params.push(userId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 100`;
    
    const logs = db.prepare(query).all(...params).map(log => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null
    }));
    
    res.json({ logs });
  };

  return { 
    ownerOnly, 
    listUsers, 
    getNotifications, 
    approveUser, 
    approveDeletion,
    rejectDeletion,
    getWorkerLifecycleHistory,
    setStatus, 
    getPermissions,
    updateUserPermissions,
    deleteUser,
    getAuditLogs
  };
};
