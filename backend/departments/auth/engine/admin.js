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
               deletion_requested_at, deletion_reason, deleted_at, deleted_by, created_at,
               (SELECT d.client_type FROM user_devices d WHERE d.user_id = users.id ORDER BY d.last_seen DESC LIMIT 1) as last_client_type,
               (SELECT d.device_type FROM user_devices d WHERE d.user_id = users.id ORDER BY d.last_seen DESC LIMIT 1) as last_device_type,
               (SELECT a.platform FROM activity_log a WHERE a.user_id = users.id ORDER BY a.created_at DESC LIMIT 1) as last_platform
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
    const user = db.prepare("SELECT id, username, email, full_name, role, status, created_at, approved_at, approved_by, deletion_requested_at, deletion_reason FROM users WHERE id = ? AND role = 'worker'").get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Worker not found' });

    // Determine the exact deletion type/reason
    let finalReason = '';
    let actionType = 'delete_worker';
    
    if (user.status === 'pending') {
      actionType = 'deny_request';
      finalReason = req.body?.reason || 'Access request denied by owner';
    } else if (user.status === 'pending_deletion' || user.deletion_requested_at) {
      actionType = 'approve_deletion';
      finalReason = user.deletion_reason 
        ? `Worker requested deletion: "${user.deletion_reason}" (Approved by owner)`
        : 'Worker requested account deletion (Approved by owner)';
    } else {
      actionType = 'delete_worker';
      finalReason = req.body?.reason || 'Worker account deleted by owner';
    }

    db.transaction(() => {
      // 1. Purge credentials and personal data (GDPR / Privacy compliant)
      db.prepare(`
        UPDATE users SET 
          username = NULL,
          password_hash = NULL,
          security_question = NULL,
          security_answer_hash = NULL,
          security_answer = NULL,
          google_id = NULL,
          google_email = NULL,
          google_name = NULL,
          google_picture = NULL,
          status = 'deleted',
          deletion_reason = ?,
          deleted_at = CURRENT_TIMESTAMP,
          deleted_by = ?,
          token_version = token_version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalReason, req.user.userId, user.id);

      db.prepare('DELETE FROM user_identities WHERE user_id = ?').run(user.id);
      try { db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(user.id); } catch (e) {}
      db.prepare('DELETE FROM user_profile WHERE id = ?').run(user.id);
      db.prepare('DELETE FROM user_devices WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM oauth_states WHERE user_id = ?').run(user.id);
      db.prepare("DELETE FROM webauthn_challenges WHERE challenge_key LIKE ?").run(`${user.id}:%`);
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
          INSERT INTO worker_lifecycle_history (id, user_id, email, full_name, role, status, joined_at, approved_at, approved_by, deletion_reason, deleted_at, deleted_by)
          VALUES (?, ?, ?, ?, 'worker', 'deleted', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `).run(
          historyId,
          user.id,
          user.email,
          user.full_name || user.username || user.email,
          user.created_at,
          user.approved_at,
          user.approved_by,
          finalReason,
          req.user.userId
        );
      } catch (e) {
        console.error('Failed to insert lifecycle history:', e);
      }

      // 4. Log in activity_log
      db.prepare(`
        INSERT INTO activity_log (user_id, platform, module, action, resource_type, resource_id, metadata)
        VALUES (?, 'web', 'admin', ?, 'user', ?, ?)
      `).run(req.user.userId, actionType, user.id, JSON.stringify({ email: user.email, reason: finalReason }));
    })();

    res.json({ success: true, message: 'Worker account deleted and archived successfully', status: 'deleted', reason: finalReason });
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
      const user = db.prepare("SELECT id, username, email, full_name, role, status, created_at, approved_at, approved_by, deletion_requested_at, deletion_reason, deleted_at, deleted_by FROM users WHERE id = ?").get(userId);

      const history = db.prepare(`
        SELECT * FROM worker_lifecycle_history
        WHERE user_id = ? OR (email IS NOT NULL AND email = ?)
        ORDER BY created_at DESC
      `).all(userId, user?.email || '');

      const auditLogs = db.prepare(`
        SELECT id, user_id, platform, module, action, metadata, ip_address, created_at
        FROM activity_log
        WHERE user_id = ? OR resource_id = ?
        ORDER BY created_at DESC LIMIT 50
      `).all(userId, userId);

      res.json({
        user: user || null,
        history,
        auditLogs
      });
    } catch (e) {
      console.error('getWorkerLifecycleHistory error:', e);
      res.json({ user: null, history: [], auditLogs: [] });
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
      
      // Touch updated_at timestamp without invalidating worker session
      db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    })();

    res.json({ success: true, message: 'Permissions updated successfully' });
  };

  const deleteUser = (req, res) => {
    return approveDeletion(req, res);
  };

  const getAuditLogs = (req, res) => {
    const { userId } = req.params;
    let query = `
      SELECT a.id, a.user_id, a.platform, a.module, a.action, a.resource_type, a.resource_id, a.resource_name, a.metadata, a.ip_address, a.created_at,
             u.full_name, u.google_name, u.username, u.email, u.role as user_role
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.id
    `;
    let params = [];
    
    if (userId && userId !== 'all') {
      query += ` WHERE a.user_id = ? `;
      params.push(userId);
    }
    
    query += ` ORDER BY a.created_at DESC LIMIT 150`;
    
    const logs = db.prepare(query).all(...params).map(log => {
      let displayName = 'System';
      if (log.user_id === 'admin' || log.user_role === 'owner') {
        displayName = log.full_name || log.username || 'Admin';
      } else if (log.full_name) {
        displayName = log.full_name;
      } else if (log.google_name) {
        displayName = log.google_name;
      } else if (log.username && log.username !== log.user_id) {
        displayName = log.username;
      } else if (log.email) {
        displayName = log.email;
      } else if (log.username) {
        displayName = log.username;
      } else if (log.user_id) {
        displayName = log.user_id;
      }

      return {
        ...log,
        display_name: displayName,
        username: displayName,
        metadata: log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : null
      };
    });

    res.json({ logs });
  };

  const getAccountsGraph = (req, res) => {
    try {
      // Query all users (both owner and workers)
      const allUsers = db.prepare(`
        SELECT u.id, u.username, u.full_name, u.email, u.google_id, u.google_email, u.google_name, u.google_picture,
               u.role, u.status, u.invite_code, u.created_at, u.last_login,
               (SELECT d.client_type FROM user_devices d WHERE d.user_id = u.id ORDER BY d.last_seen DESC LIMIT 1) as last_client_type,
               (SELECT d.device_type FROM user_devices d WHERE d.user_id = u.id ORDER BY d.last_seen DESC LIMIT 1) as last_device_type,
               (SELECT a.platform FROM activity_log a WHERE a.user_id = u.id ORDER BY a.created_at DESC LIMIT 1) as last_platform
        FROM users u
        ORDER BY 
          CASE u.role 
            WHEN 'owner' THEN 0 
            ELSE 1 
          END,
          CASE u.status
            WHEN 'active' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'pending_deletion' THEN 2
            WHEN 'suspended' THEN 3
            ELSE 4
          END,
          u.created_at ASC
      `).all();

      // Query all identities
      let identities = [];
      try {
        identities = db.prepare(`
          SELECT id, user_id, provider, provider_user_id, provider_email, is_verified, created_at
          FROM user_identities
        `).all();
      } catch (_) {}

      // Query all user_permissions
      let permissions = [];
      try {
        permissions = db.prepare(`
          SELECT user_id, module, can_view, can_create, can_edit, can_delete
          FROM user_permissions
        `).all();
      } catch (_) {}

      // Query contact access counts
      let contactAccess = [];
      try {
        contactAccess = db.prepare(`
          SELECT user_id, count(contact_id) as shared_contact_count
          FROM user_contact_access
          GROUP BY user_id
        `).all();
      } catch (_) {}

      // Also fetch auth_credentials if present (for legacy admin check)
      let legacyCredentials = [];
      try {
        legacyCredentials = db.prepare(`
          SELECT id, user_role, updated_at FROM auth_credentials
        `).all();
      } catch (_) {}

      // Detect unlinked / orphan credentials
      let orphanIdentities = [];
      try {
        orphanIdentities = db.prepare(`
          SELECT id, user_id, provider, provider_user_id, provider_email, created_at
          FROM user_identities
          WHERE user_id NOT IN (SELECT id FROM users)
        `).all();
      } catch (_) {}

      let orphanLegacyCredentials = [];
      try {
        orphanLegacyCredentials = db.prepare(`
          SELECT id, user_role, updated_at
          FROM auth_credentials
          WHERE id NOT IN (SELECT id FROM users) AND id NOT IN (SELECT username FROM users)
        `).all();
      } catch (_) {}

      let unresolvedConflicts = [];
      try {
        unresolvedConflicts = db.prepare(`
          SELECT id, provider, identity_key, provider_email, user_id, status, details, detected_at
          FROM auth_identity_conflicts
          WHERE status = 'unresolved'
        `).all();
      } catch (_) {}

      res.json({
        users: allUsers,
        identities,
        permissions,
        contactAccess,
        legacyCredentials,
        unlinkedCredentials: {
          orphanIdentities,
          orphanLegacyCredentials,
          unresolvedConflicts,
          totalUnlinked: orphanIdentities.length + orphanLegacyCredentials.length + unresolvedConflicts.length
        },
        modules: MODULES,
        defaultWorkerApps: DEFAULT_WORKER_APPS
      });
    } catch (err) {
      console.error('getAccountsGraph error:', err);
      res.status(500).json({ error: 'Failed to retrieve accounts graph data' });
    }
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
    getAuditLogs,
    getAccountsGraph
  };
};
