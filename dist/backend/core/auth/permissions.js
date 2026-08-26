/**
 * RBAC & DATA ACCESS PERMISSION MIDDLEWARE
 *
 * Provides module-level (billing, contacts, analytics, etc.) and
 * contact-level access control for workers while granting full bypass to owner.
 */

module.exports = function(db) {
  /**
   * Check if user has specific module permission (can_view, can_create, can_edit, can_delete)
   * @param {string} moduleName - Module name ('billing', 'contacts', 'analytics', 'cloud', 'products', 'orders', 'notes', 'calendar')
   * @param {string} action - 'can_view' | 'can_create' | 'can_edit' | 'can_delete'
   */
  const requirePermission = (moduleName, action) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }

      // Owner has unrestricted access to all modules and actions
      if (req.user.role === 'owner') {
        return next();
      }

      // Normalize action name
      let col = action;
      if (!col.startsWith('can_')) {
        col = `can_${action}`;
      }

      try {
        const perm = db.prepare(`
          SELECT can_view, can_create, can_edit, can_delete 
          FROM user_permissions 
          WHERE user_id = ? AND module = ?
        `).get(req.user.id, moduleName);

        if (perm && perm[col] === 1) {
          return next();
        }

        return res.status(403).json({
          error: `Forbidden: You do not have permission to ${action.replace('can_', '')} in ${moduleName}`
        });
      } catch (err) {
        console.error(`Permission check error (${moduleName}:${action}):`, err.message);
        return res.status(500).json({ error: 'Internal permission check error' });
      }
    };
  };

  /**
   * Check if worker is permitted to access a specific contact / customer
   * @param {string} paramName - Name of parameter containing contact ID (in params, body, or query)
   */
  const requireContactAccess = (paramName = 'id') => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }

      // Owner has access to all contacts
      if (req.user.role === 'owner') {
        return next();
      }

      const contactId = req.params[paramName] || req.body[paramName] || req.query[paramName] || req.body.customer_id || req.query.customer_id;

      if (!contactId) {
        return next();
      }

      try {
        const access = db.prepare(`
          SELECT id FROM user_contact_access 
          WHERE user_id = ? AND contact_id = ?
        `).get(req.user.id, contactId);

        if (access) {
          return next();
        }

        return res.status(403).json({
          error: 'Forbidden: Access to this customer/party is restricted for your account'
        });
      } catch (err) {
        console.error('Contact access check error:', err.message);
        return res.status(500).json({ error: 'Internal contact access check error' });
      }
    };
  };

  /**
   * Fetch complete permissions snapshot for a user
   * @param {string} userId
   * @param {string} role
   */
  const getUserPermissionsSnapshot = (userId, role) => {
    if (role === 'owner') {
      const allModules = ['billing', 'contacts', 'analytics', 'cloud', 'products', 'orders', 'notes', 'calendar', 'admin', 'ai-vision', 'settings'];
      const modules = {};
      allModules.forEach(m => {
        modules[m] = { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1 };
      });
      return {
        role: 'owner',
        isOwner: true,
        modules,
        allowedAllContacts: true,
        allowedContactIds: null
      };
    }

    try {
      const rows = db.prepare('SELECT module, can_view, can_create, can_edit, can_delete FROM user_permissions WHERE user_id = ?').all(userId);
      const modules = {};
      rows.forEach(r => {
        modules[r.module] = {
          can_view: r.can_view,
          can_create: r.can_create,
          can_edit: r.can_edit,
          can_delete: r.can_delete
        };
      });

      const contactRows = db.prepare('SELECT contact_id FROM user_contact_access WHERE user_id = ?').all(userId);
      const allowedContactIds = contactRows.map(c => c.contact_id);

      return {
        role: 'worker',
        isOwner: false,
        modules,
        allowedAllContacts: false,
        allowedContactIds
      };
    } catch (err) {
      console.error('Failed to get user permissions snapshot:', err.message);
      return { role: 'worker', isOwner: false, modules: {}, allowedAllContacts: false, allowedContactIds: [] };
    }
  };

  /**
   * Helper function to get SQL filter clause for contacts
   * @param {string} userId
   * @param {string} role
   * @param {string} contactIdCol - Column to filter on (e.g. 'c.id', 'customer_id')
   */
  const getContactsFilterSql = (userId, role, contactIdCol = 'c.id') => {
    if (role === 'owner') {
      return '1=1';
    }
    const safeUserId = String(userId).replace(/'/g, "''");
    return `${contactIdCol} IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}')`;
  };

  return {
    requirePermission,
    requireContactAccess,
    getUserPermissionsSnapshot,
    getContactsFilterSql
  };
};
