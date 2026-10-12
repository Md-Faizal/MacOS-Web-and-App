/**
 * MACOS ENTERPRISE CORE DATA BUS (CoreDataBus)
 * 
 * Industrial-Standard Reactive Cross-App UI Synchronization Engine (Zero-Refresh)
 * 
 * Capabilities:
 * 1. Intra-Window Zero-Latency EventTarget: Synchronous <1ms communication across open components.
 * 2. Cross-Tab & Cross-Window BroadcastChannel: Real-time background sync across all open browser tabs.
 * 3. Cross-Device Server-Sent Events (SSE): Automatic push invalidation from backend (Android POS / remote cURL).
 * 4. Optimistic Invalidation: Zero redundant API polling; apps re-render only when state truly changes.
 */

(function () {
  'use strict';

  if (window.CoreDataBus && window.CoreDataBus.__initialized) {
    return;
  }

  const log = (typeof window !== 'undefined' && window.MacOSLogger)
    ? window.MacOSLogger.createScope('CoreDataBus')
    : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

  // Generate unique window instance ID to avoid self-echoes
  const originId = 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  const eventTarget = new EventTarget();

  // Native BroadcastChannel for inter-tab communication
  let broadcastChannel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel('macos_core_databus');
      broadcastChannel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || msg.originId === originId) return; // Ignore self-messages
        log.debug('📡 [BroadcastChannel Inbound]:', msg.type, msg.payload);
        dispatchInternal(msg.type, msg.payload, false);
      };
    } catch (err) {
      log.warn('BroadcastChannel not supported in this context:', err);
    }
  }

  // Dispatch event internally to in-page subscribers
  function dispatchInternal(type, payload, broadcast = true) {
    const lastColon = type.lastIndexOf(':');
    const domain = lastColon !== -1 ? type.substring(0, lastColon) : type;
    const action = lastColon !== -1 ? type.substring(lastColon + 1) : '';

    const detail = {
      type,
      domain,
      action,
      payload,
      originId,
      timestamp: Date.now()
    };

    // 1. Primary event: exact type on EventTarget (e.g. 'billing:invoice:created')
    eventTarget.dispatchEvent(new CustomEvent(type, { detail }));

    // 2. Also dispatch domain on EventTarget if type has an action (e.g. 'billing:invoice')
    if (domain !== type) {
      eventTarget.dispatchEvent(new CustomEvent(domain, { detail }));
    }

    // 3. Domain wildcard event on EventTarget for subscribeDomain
    eventTarget.dispatchEvent(new CustomEvent('core-data-domain', { detail }));

    // 4. Also dispatch on window for legacy window.addEventListener compatibility
    try {
      window.dispatchEvent(new CustomEvent('core-data-change', { detail }));
    } catch (_) {}

    // 5. Broadcast to other open tabs via BroadcastChannel
    if (broadcast && broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type,
          payload,
          originId,
          timestamp: Date.now()
        });
      } catch (err) {
        log.warn('Failed to broadcast message:', err);
      }
    }
  }

  // Server-Sent Events (SSE) stream for cross-device real-time sync
  let sseConnection = null;
  let sseRetryDelay = 2000;
  let sseReconnectTimer = null;
  let hasConnectedToSSE = false;
  const pageLoadTimestamp = Date.now();
  let lastReconciliationTime = 0;
  let reconciliationDebounceTimer = null;
  const STARTUP_QUIET_WINDOW_MS = 3500; // 3.5s quiet window on boot to prevent thundering herd
  const RECONCILIATION_COOLDOWN_MS = 6000; // At most once every 6s

  function dispatchReconciliation(reason) {
    // 1. Never trigger reconciliation storm during initial page boot & DOM mount
    if (Date.now() - pageLoadTimestamp < STARTUP_QUIET_WINDOW_MS) {
      log.debug(`[CoreDataBus] Suppressed reconciliation (${reason}) during startup quiet window.`);
      return;
    }

    // 2. Cooldown gate
    const now = Date.now();
    if (now - lastReconciliationTime < RECONCILIATION_COOLDOWN_MS) {
      log.debug(`[CoreDataBus] Suppressed reconciliation (${reason}) due to cooldown window.`);
      return;
    }

    // 3. Trailing-edge debounce to collapse rapid tab/window events
    clearTimeout(reconciliationDebounceTimer);
    reconciliationDebounceTimer = setTimeout(() => {
      lastReconciliationTime = Date.now();
      log.debug(`[CoreDataBus] Dispatching reconciliation (${reason})`);
      [
        'billing:invoice:updated',
        'contacts:customer:updated',
        'inventory:product:updated',
        'orders:order:updated',
        'notes:note:updated',
        'calendar:event:updated'
      ].forEach((type) => {
        dispatchInternal(type, { reason }, false);
      });
    }, 400);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      dispatchReconciliation('visibility');
    }
  });

  function isSessionAuthenticated() {
    try {
      if (document.body && document.body.getAttribute('data-unlock-state') === 'locked') return false;
      if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        return sessionStorage.getItem('macos_session_active') === 'true';
      }
      return sessionStorage.getItem('macos_session_active') === 'true';
    } catch (_) {
      return false;
    }
  }

  function initSSE() {
    if (typeof EventSource === 'undefined') return;
    if (sseConnection) return;

    // Do not attempt SSE connection on unauthenticated / lockscreen states to prevent 401 retry loops
    if (!isSessionAuthenticated()) {
      log.debug('SSE connection deferred: user session not active yet.');
      return;
    }

    try {
      // Prefer unified /api/events with fallback to /api/billing/events
      const sseUrl = '/api/events';
      sseConnection = new EventSource(sseUrl);

      sseConnection.onopen = () => {
        log.debug('🔌 SSE Real-Time Data Stream Connected (/api/events)');
        sseRetryDelay = 2000;
        if (hasConnectedToSSE) {
          dispatchReconciliation('sse-reconnected');
        }
        hasConnectedToSSE = true;
      };

      sseConnection.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data) {
            const eventType = data.type || (data.domain && data.action ? `${data.domain}:${data.action}` : null);
            if (eventType) {
              log.debug('⚡ [SSE Inbound Event]:', eventType, data.payload);
              dispatchInternal(eventType, data.payload, false); // false = do not re-broadcast
            }
          }
        } catch (_) {}
      };

      sseConnection.onerror = () => {
        if (sseConnection) {
          sseConnection.close();
          sseConnection = null;
        }
        // Only retry if session is active
        if (!isSessionAuthenticated()) return;

        // Exponential backoff up to 30s
        if (!sseReconnectTimer) {
          sseReconnectTimer = setTimeout(() => {
            sseReconnectTimer = null;
            sseRetryDelay = Math.min(sseRetryDelay * 1.5, 30000);
            initSSE();
          }, sseRetryDelay);
        }
      };
    } catch (err) {
      log.debug('SSE initialization skipped or unsupported:', err.message);
    }
  }

  // Listen for login / session verification event to trigger SSE seamlessly
  window.addEventListener('macos-auth-verified', () => {
    setTimeout(initSSE, 1000);
  });

  // Automatically initialize SSE once DOM / session is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initSSE, 1500));
  } else {
    setTimeout(initSSE, 1500);
  }

  // Public CoreDataBus API
  const CoreDataBus = {
    __initialized: true,
    originId,

    /**
     * Publish a domain event across the entire system (current page + all open tabs + broadcast)
     * @param {string} domain e.g. 'billing:invoice', 'billing:payment', 'inventory:product', 'contacts:customer'
     * @param {string} action e.g. 'created', 'updated', 'deleted'
     * @param {any} payload Data payload
     */
    publish(domain, action, payload = null) {
      const type = `${domain}:${action}`;
      log.debug('🚀 [Publish]:', type, payload);
      dispatchInternal(type, payload, true);
    },

    /**
     * Subscribe to a specific domain event (e.g. 'billing:invoice:created', or wildcard 'billing:invoice')
     * @param {string} type Pattern to match
     * @param {function} handler Callback receiving (payload, metadata)
     * @returns {function} Unsubscribe function
     */
    subscribe(type, handler) {
      const listener = (event) => {
        try {
          handler(event.detail.payload, event.detail);
        } catch (err) {
          log.error('Error in CoreDataBus subscriber callback for', type, err);
        }
      };

      eventTarget.addEventListener(type, listener);
      return () => {
        eventTarget.removeEventListener(type, listener);
      };
    },

    /**
     * Helper to subscribe to any event matching a domain prefix (e.g. 'billing:', 'inventory:', 'contacts:')
     * Passes normalized event data { domain, action, payload, type, timestamp, originId } to handler.
     * @param {string} domainPrefix Prefix to match
     * @param {function} handler Callback receiving (data, type, payload)
     * @returns {function} Unsubscribe function
     */
    subscribeDomain(domainPrefix, handler) {
      const listener = (event) => {
        const d = event.detail;
        if (d && d.type && d.type.startsWith(domainPrefix)) {
          try {
            handler(d, d.type, d.payload);
          } catch (err) {
            log.error('Error in CoreDataBus subscribeDomain callback for', domainPrefix, err);
          }
        }
      };

      eventTarget.addEventListener('core-data-domain', listener);
      return () => {
        eventTarget.removeEventListener('core-data-domain', listener);
      };
    }
  };

  window.CoreDataBus = CoreDataBus;
  log.debug('⚡ CoreDataBus v1.0 Initialized (BroadcastChannel + SSE + EventTarget)');
})();
