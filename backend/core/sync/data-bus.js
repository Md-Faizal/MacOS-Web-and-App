/**
 * CORE DATA BUS - Enterprise Real-Time Sync & State Fingerprint Engine
 *
 * Combines:
 * 1. Server-Sent Events (SSE) real-time streaming to connected web apps & mobile clients.
 * 2. Pure Rust WebAssembly State Fingerprinting (FNV-1a 64-bit collection ETags).
 * 3. HTTP 304 Not-Modified ETag validation for zero-payload cache reconciliation.
 */

const SuiteCoreBridge = require('../../../frontend/shared/suite_core_bridge');

class CoreDataBusBackend {
  constructor() {
    this.clients = new Set();
    this.heartbeatInterval = null;
    this._startHeartbeat();
  }

  _startHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      const pingPayload = `: ping ${Date.now()}\n\n`;
      for (const client of this.clients) {
        try {
          client.res.write(pingPayload);
        } catch (_) {
          this.clients.delete(client);
        }
      }
    }, 25000);
    this.heartbeatInterval.unref?.();
  }

  /**
   * Handle incoming SSE connection request
   */
  handleSSEConnection(req, res, db = null) {
    if (!req.user || !(req.user.id || req.user.userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on Nginx/proxies
    res.flushHeaders?.();

    const client = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      res,
      req,
      db,
      user: {
        id: req.user.id || req.user.userId,
        role: req.user.role
      },
      connectedAt: Date.now()
    };

    this.clients.add(client);

    // Send initial handshake event
    const welcome = {
      type: 'connected',
      client_id: client.id,
      timestamp: Date.now()
    };
    res.write(`event: init\ndata: ${JSON.stringify(welcome)}\n\n`);

    req.on('close', () => {
      this.clients.delete(client);
    });

    res.on('error', () => {
      this.clients.delete(client);
    });
  }

  /**
   * Broadcast an event to all connected SSE clients
   * @param {string} domain e.g. 'billing:invoice', 'inventory:product', 'contacts:customer'
   * @param {string} action e.g. 'created', 'updated', 'deleted'
   * @param {object} payload
   */
  broadcast(domain, action, payload = {}) {
    if (this.clients.size === 0) return;

    const type = `${domain}:${action}`;
    const eventPayload = {
      type,
      domain,
      action,
      payload,
      timestamp: Date.now()
    };

    for (const client of this.clients) {
      if (!this._clientCanReadDomain(client, domain)) continue;

      try {
        const scopedEvent = {
          ...eventPayload,
          payload: client.user.role === 'owner' ? payload : {}
        };
        const sseMessage = `event: ${domain}\ndata: ${JSON.stringify(scopedEvent)}\n\n` +
                           `data: ${JSON.stringify(scopedEvent)}\n\n`;
        client.res.write(sseMessage);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  _clientCanReadDomain(client, domain) {
    if (client.user?.role === 'owner') return true;

    const moduleByDomain = {
      billing: 'billing',
      contacts: 'contacts',
      inventory: 'products',
      products: 'products',
      orders: 'orders',
      notes: 'notes',
      calendar: 'calendar'
    };
    const moduleName = moduleByDomain[String(domain).split(':')[0]];
    if (!moduleName || !client.db || !client.user?.id) return false;

    try {
      const permission = client.db.prepare(`
        SELECT can_view FROM user_permissions WHERE user_id = ? AND module = ?
      `).get(client.user.id, moduleName);
      return Number(permission?.can_view) === 1;
    } catch (_) {
      return false;
    }
  }

  /**
   * Query database statistics and calculate canonical Rust FNV-1a fingerprint & ETag
   */
  getDomainFingerprint(domain = 'billing', db) {
    if (!db) {
      return SuiteCoreBridge.computeFingerprint({ domain, count: 0, max_id: 0, max_updated_at: 0 });
    }

    try {
      let stats = { count: 0, max_id: 0, max_updated_at: 0 };
      const d = domain.toLowerCase();

      if (d.startsWith('billing') || d === 'invoices') {
        const row = db.prepare(`
          SELECT 
            COUNT(*) as count, 
            COALESCE(MAX(id), 0) as max_id,
            COALESCE(MAX(unixepoch(updated_at)), 0) as max_updated_at
          FROM invoices
        `).get();
        if (row) stats = row;
      } else if (d.startsWith('inventory') || d === 'products') {
        const row = db.prepare(`
          SELECT 
            COUNT(*) as count, 
            COALESCE(MAX(id), 0) as max_id,
            COALESCE(MAX(unixepoch(updated_at)), 0) as max_updated_at
          FROM products
        `).get();
        if (row) stats = row;
      } else if (d.startsWith('contacts') || d === 'customers') {
        const row = db.prepare(`
          SELECT 
            COUNT(*) as count, 
            COALESCE(MAX(id), 0) as max_id,
            COALESCE(MAX(unixepoch(updated_at)), 0) as max_updated_at
          FROM contacts
        `).get();
        if (row) stats = row;
      } else if (d.startsWith('notes')) {
        const row = db.prepare(`
          SELECT 
            COUNT(*) as count, 
            COALESCE(MAX(id), 0) as max_id,
            COALESCE(MAX(unixepoch(updated_at)), 0) as max_updated_at
          FROM notes
        `).get();
        if (row) stats = row;
      }

      const count = Number.isFinite(Number(stats.count)) ? Number(stats.count) : 0;
      const max_id = Number.isFinite(Number(stats.max_id)) ? Number(stats.max_id) : 0;
      const max_updated_at = Number.isFinite(Number(stats.max_updated_at)) ? Number(stats.max_updated_at) : 0;

      // Delegate pure mathematical hashing to compiled Rust WASM
      return SuiteCoreBridge.computeFingerprint({
        domain,
        count,
        max_id,
        max_updated_at
      });
    } catch (err) {
      return SuiteCoreBridge.computeFingerprint({
        domain,
        count: 0,
        max_id: 0,
        max_updated_at: 0
      });
    }
  }

  /**
   * Express HTTP handler for state fingerprint endpoint
   * Responds with 304 Not Modified if client's If-None-Match matches the Rust ETag
   */
  handleFingerprintRequest(req, res, db) {
    const domain = (req.query.domain || 'billing').toString();
    const fingerprint = this.getDomainFingerprint(domain, db);

    res.setHeader('ETag', fingerprint.etag);
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === fingerprint.etag) {
      return res.status(304).end();
    }

    return res.json({
      success: true,
      fingerprint
    });
  }
}

const instance = new CoreDataBusBackend();
module.exports = instance;
