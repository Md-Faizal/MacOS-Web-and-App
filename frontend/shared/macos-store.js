/**
 * MacOSReactiveStore — Lightweight Reactive Singleton Store
 * 
 * Capabilities:
 * 1. Observable State Tree: Proxied state object with automatic subscriber notification.
 * 2. Optimistic Updates: Immediate local UI state patching before server roundtrips.
 * 3. Server Reconciliation: Deterministic state reconciliation and rollback support.
 * 4. Zero Dependencies: Pure ES6 Proxy and Map/Set pattern.
 */
(function (global) {
  'use strict';

  if (global.MacOSStore && global.MacOSStore.__initialized) {
    return;
  }

  class MacOSReactiveStore {
    constructor() {
      this.__initialized = true;
      this._raw = {
        products: [],
        invoices: [],
        contacts: [],
        payments: [],
        categories: [],
        orders: []
      };
      this._subscribers = new Map(); // key -> Set<handler>
      this._version = 0; // Monotonic mutation counter

      // Proxy intercepts every property write
      this.state = new Proxy(this._raw, {
        set: (target, key, value) => {
          const old = target[key];
          target[key] = value;
          this._version++;
          this._notify(key, value, old);
          return true;
        },
        get: (target, key) => {
          return target[key];
        }
      });
    }

    /**
     * Subscribe to state changes for a specific key (e.g. 'products', 'contacts').
     * @param {string} key
     * @param {function} handler Callback receiving (newValue, oldValue, key)
     * @returns {function} Unsubscribe function
     */
    subscribe(key, handler) {
      if (!this._subscribers.has(key)) {
        this._subscribers.set(key, new Set());
      }
      this._subscribers.get(key).add(handler);
      return () => {
        this._subscribers.get(key)?.delete(handler);
      };
    }

    /**
     * Optimistic patch: apply updater function to current collection state immediately.
     * @param {string} key
     * @param {function} patchFn Function receiving current value and returning updated value
     */
    patch(key, patchFn) {
      const current = this._raw[key];
      const next = typeof patchFn === 'function' ? patchFn(current) : patchFn;
      this.state[key] = next;
    }

    /**
     * Reconcile: replace key state with server authoritative data.
     * @param {string} key
     * @param {any} serverData
     */
    reconcile(key, serverData) {
      this.state[key] = serverData;
    }

    /**
     * Get current snapshot of a key without mutation.
     * @param {string} key
     */
    get(key) {
      return this._raw[key];
    }

    _notify(key, newVal, oldVal) {
      const handlers = this._subscribers.get(key);
      if (!handlers || handlers.size === 0) return;
      handlers.forEach((handler) => {
        try {
          handler(newVal, oldVal, key);
        } catch (err) {
          console.error(`[MacOSStore] Subscriber error for "${String(key)}":`, err);
        }
      });
    }
  }

  global.MacOSStore = new MacOSReactiveStore();
})(typeof window !== 'undefined' ? window : globalThis);
