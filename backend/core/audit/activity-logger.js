/**
 * Universal Activity Logger
 * Tracks creation, modification, and deletion across Billing, Contacts, Orders, Payments, and Products.
 * Records actor identity (Admin or Worker ID), platform, timestamps, and contextual metadata.
 */

module.exports = function createActivityLogger(db) {
  if (!db) {
    throw new Error('Database instance required for ActivityLogger');
  }

  // Prepare insert statement once for optimal performance
  let insertStmt;
  try {
    insertStmt = db.prepare(`
      INSERT INTO activity_log (
        user_id, platform, module, action, resource_type, resource_id, resource_name, metadata, ip_address, user_agent, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
    `);
  } catch (err) {
    console.warn('[ActivityLogger] Error preparing insert statement:', err.message);
  }

  /**
   * Log an activity event
   * @param {Object} req - Express request object containing user session context
   * @param {Object} options - Activity details
   * @param {string} options.module - Module name ('billing', 'contacts', 'orders', 'products', 'payments')
   * @param {string} options.action - Action performed ('create', 'update', 'delete', 'stage_change', etc.)
   * @param {string} options.resourceType - Type of resource ('invoice', 'payment', 'credit_note', 'order', 'contact', 'product', 'batch')
   * @param {string|number} [options.resourceId] - Primary key or unique identifier
   * @param {string} [options.resourceName] - Human-readable label (e.g. invoice number, customer name, product name)
   * @param {Object|string} [options.metadata] - Additional contextual payload
   */
  function logActivity(req, {
    module = 'general',
    action,
    resourceType,
    resourceId = null,
    resourceName = null,
    metadata = null
  }) {
    try {
      if (!action || !resourceType) return;
      if (!insertStmt) {
        insertStmt = db.prepare(`
          INSERT INTO activity_log (
            user_id, platform, module, action, resource_type, resource_id, resource_name, metadata, ip_address, user_agent, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
          )
        `);
      }

      const user = req?.user || {};
      const userId = user.id || user.userId || (user.role === 'owner' ? 'admin' : (user.role || 'system'));
      const headerPlatform = (req?.headers?.['x-client-platform'] || req?.headers?.['x-app-type'] || '').toLowerCase();
      let platform = 'web';
      if (headerPlatform === 'pwa' || user.platform === 'pwa') {
        platform = 'pwa';
      } else if (headerPlatform === 'android' || headerPlatform === 'native_android' || user.platform === 'android' || req?.headers?.['user-agent']?.includes('okhttp')) {
        platform = 'android';
      } else if (user.platform) {
        platform = user.platform;
      }
      const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
      const userAgent = req?.headers?.['user-agent'] || null;

      let metaStr = null;
      if (metadata !== null && metadata !== undefined) {
        metaStr = typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata);
      }

      insertStmt.run(
        String(userId),
        String(platform),
        String(module),
        String(action),
        String(resourceType),
        resourceId ? String(resourceId) : null,
        resourceName ? String(resourceName) : null,
        metaStr,
        ipAddress ? String(ipAddress) : null,
        userAgent ? String(userAgent) : null
      );
    } catch (err) {
      console.warn('[ActivityLogger] Failed to record activity:', err.message);
    }
  }

  return { logActivity };
};
