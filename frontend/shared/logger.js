/**
 * macOS Web & App Ecosystem - Enterprise Telemetry & Logging Engine
 * Industrial Standard (Stripe / Linear / Datadog RUM Grade)
 * 
 * Capabilities:
 * 1. Zero Console Spam in Production (100% clean visual console)
 * 2. In-Memory Flight Recorder (Circular Ring Buffer of 250 Breadcrumbs)
 * 3. Crash Context Coupling (Attaches breadcrumbs on errors)
 * 4. Subsystem Scoping (e.g., 'Desktop:Grid', 'Billing:Calculator', 'Auth')
 * 5. Instant DevTools Diagnostics: MacOS.enableDebug(), MacOS.dumpLogs(), MacOS.exportDiagnostics()
 */

(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.MacOSLogger && window.MacOSLogger.__initialized) {
    return;
  }

  // Preserve pristine native console primitives
  const _native = {
    log: console.log.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  const RING_BUFFER_MAX = 250;
  const ringBuffer = [];
  let bufferIndex = 0;

  // Configuration State
  const state = {
    debugEnabled: false,
    activeScopes: new Set(['*']), // '*' means all scopes active when debugEnabled
    sessionStartTime: Date.now()
  };

  // Inspect activation triggers (URL params, localStorage, global flags)
  function evaluateDebugState() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true' || urlParams.get('macos_debug') === 'true') {
        return true;
      }
      if (localStorage.getItem('macos_debug') === 'true') {
        return true;
      }
      if (window.__MACOS_DEBUG__ === true) {
        return true;
      }
    } catch (_) {
      // Storage access blocked or restricted
    }
    return false;
  }

  state.debugEnabled = evaluateDebugState();

  // Helper to stringify arguments safely without circular reference errors
  function safeSerialize(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
    try {
      return JSON.stringify(arg, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (value instanceof HTMLElement) return `<${value.tagName.toLowerCase()} id="${value.id}" class="${value.className}">`;
          if (value instanceof Node) return '[DOM Node]';
        }
        return value;
      });
    } catch (_) {
      return String(arg);
    }
  }

  // Push entry into rolling circular ring buffer
  function recordBreadcrumb(level, scope, args) {
    const entry = {
      id: ++bufferIndex,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - state.sessionStartTime,
      level,
      scope: scope || 'System',
      message: args.map(safeSerialize).join(' '),
      rawArgs: args
    };

    if (ringBuffer.length >= RING_BUFFER_MAX) {
      ringBuffer.shift();
    }
    ringBuffer.push(entry);
    return entry;
  }

  // Scope check helper
  function isScopeActive(scope) {
    if (!state.debugEnabled) return false;
    if (state.activeScopes.has('*')) return true;
    if (!scope) return false;
    return state.activeScopes.has(scope) || Array.from(state.activeScopes).some(s => scope.startsWith(s));
  }

  // Styled visual console printer (only active when debug is enabled)
  function printStyledLog(level, scope, args) {
    const time = new Date().toLocaleTimeString();
    const badgeColor = level === 'ERROR' ? '#ff4d4f' :
                       level === 'WARN'  ? '#faad14' :
                       level === 'INFO'  ? '#1890ff' : '#52c41a';

    const prefix = `%c[MacOS:${scope || 'Core'}]%c ${time}`;
    const prefixStyle = `background: ${badgeColor}; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 3px; font-size: 10px;`;
    const timeStyle = `color: #888; font-size: 10px;`;

    if (level === 'ERROR') {
      _native.error(prefix, prefixStyle, timeStyle, ...args);
    } else if (level === 'WARN') {
      _native.warn(prefix, prefixStyle, timeStyle, ...args);
    } else if (level === 'INFO') {
      _native.info(prefix, prefixStyle, timeStyle, ...args);
    } else {
      _native.log(prefix, prefixStyle, timeStyle, ...args);
    }
  }

  // Scoped Logger Class
  class ScopedLogger {
    constructor(scopeName) {
      this.scopeName = scopeName || 'App';
    }

    isDebugEnabled() {
      return isScopeActive(this.scopeName);
    }

    debug(...args) {
      recordBreadcrumb('DEBUG', this.scopeName, args);
      if (this.isDebugEnabled()) {
        printStyledLog('DEBUG', this.scopeName, args);
      }
    }

    info(...args) {
      recordBreadcrumb('INFO', this.scopeName, args);
      if (this.isDebugEnabled()) {
        printStyledLog('INFO', this.scopeName, args);
      }
    }

    warn(...args) {
      recordBreadcrumb('WARN', this.scopeName, args);
      // Warnings always reach native console
      printStyledLog('WARN', this.scopeName, args);
    }

    error(...args) {
      recordBreadcrumb('ERROR', this.scopeName, args);
      // Errors always reach native console
      printStyledLog('ERROR', this.scopeName, args);
    }
  }

  // Intercept standard console functions cleanly
  console.log = function (...args) {
    recordBreadcrumb('DEBUG', 'System', args);
    if (state.debugEnabled) {
      _native.log(...args);
    }
  };

  console.info = function (...args) {
    recordBreadcrumb('INFO', 'System', args);
    if (state.debugEnabled) {
      _native.info(...args);
    }
  };

  console.debug = function (...args) {
    recordBreadcrumb('DEBUG', 'System', args);
    if (state.debugEnabled) {
      _native.debug(...args);
    }
  };

  console.warn = function (...args) {
    recordBreadcrumb('WARN', 'System', args);
    _native.warn(...args);
  };

  console.error = function (...args) {
    recordBreadcrumb('ERROR', 'System', args);
    _native.error(...args);
  };

  // Global uncaught error listener to pair crashes with recent flight recorder breadcrumbs
  window.addEventListener('error', (event) => {
    recordBreadcrumb('ERROR', 'UncaughtException', [event.message, event.filename, event.lineno, event.colno]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    recordBreadcrumb('ERROR', 'UnhandledRejection', [event.reason]);
  });

  // Enterprise Telemetry API & Developer Diagnostics
  const MacOSLogger = {
    __initialized: true,
    _native,
    createScope: (scope) => new ScopedLogger(scope),
    isDebugEnabled: (scope) => isScopeActive(scope),
    getBreadcrumbs: () => [...ringBuffer],

    enableDebug: function (scopes) {
      state.debugEnabled = true;
      try {
        localStorage.setItem('macos_debug', 'true');
      } catch (_) {}

      if (Array.isArray(scopes) && scopes.length > 0) {
        state.activeScopes = new Set(scopes);
      } else if (typeof scopes === 'string') {
        state.activeScopes = new Set([scopes]);
      } else {
        state.activeScopes = new Set(['*']);
      }

      _native.log(
        '%c🍏 MacOS Enterprise Telemetry%c Debug Mode ENABLED. Active Scopes: ' + Array.from(state.activeScopes).join(', '),
        'background: #007aff; color: #fff; font-weight: bold; padding: 3px 8px; border-radius: 4px;',
        'color: #007aff; font-weight: bold; margin-left: 6px;'
      );
    },

    disableDebug: function () {
      state.debugEnabled = false;
      state.activeScopes = new Set(['*']);
      try {
        localStorage.removeItem('macos_debug');
      } catch (_) {}

      _native.log(
        '%c🍏 MacOS Enterprise Telemetry%c Debug Mode DISABLED. Console gated to production quiet.',
        'background: #333; color: #fff; font-weight: bold; padding: 3px 8px; border-radius: 4px;',
        'color: #888; margin-left: 6px;'
      );
    },

    dumpLogs: function (filterScope) {
      _native.log(
        '%c📋 MacOS Flight Recorder Breadcrumbs (' + ringBuffer.length + ' entries)%c',
        'background: #108ee9; color: #fff; font-weight: bold; padding: 3px 8px; border-radius: 4px;',
        ''
      );
      const filtered = filterScope
        ? ringBuffer.filter(b => b.scope.toLowerCase().includes(filterScope.toLowerCase()))
        : ringBuffer;

      if (console.table) {
        console.table(filtered.map(e => ({
          ID: e.id,
          Time: e.timestamp.split('T')[1].replace('Z', ''),
          Level: e.level,
          Scope: e.scope,
          Message: e.message.length > 90 ? e.message.substring(0, 90) + '...' : e.message
        })));
      } else {
        filtered.forEach(e => _native.log(`[${e.timestamp}] [${e.level}] [${e.scope}] ${e.message}`));
      }
    },

    exportDiagnostics: function () {
      const payload = {
        metadata: {
          timestamp: new Date().toISOString(),
          uptimeMs: Date.now() - state.sessionStartTime,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          devicePixelRatio: window.devicePixelRatio,
          online: navigator.onLine,
          sessionActive: sessionStorage.getItem('macos_session_active') === 'true',
          userRole: sessionStorage.getItem('macos_user_role') || 'unknown'
        },
        memory: window.performance && window.performance.memory ? {
          totalJSHeapSize: (window.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2) + ' MB',
          usedJSHeapSize: (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) + ' MB'
        } : 'N/A',
        recentBreadcrumbs: ringBuffer.slice(-100)
      };

      _native.log('📊 Diagnostic Bundle Created:', payload);
      return payload;
    }
  };

  // Expose on window
  window.MacOSLogger = MacOSLogger;
  window.MacOS = window.MacOS || {};
  window.MacOS.enableDebug = MacOSLogger.enableDebug;
  window.MacOS.disableDebug = MacOSLogger.disableDebug;
  window.MacOS.dumpLogs = MacOSLogger.dumpLogs;
  window.MacOS.exportDiagnostics = MacOSLogger.exportDiagnostics;
  window.MacOS.logger = MacOSLogger;

  // Subtle announcement only when debug is active
  if (state.debugEnabled) {
    _native.log(
      '%c🍏 MacOS Enterprise Telemetry Active (Debug Mode)%c Run MacOS.disableDebug() to silence.',
      'background: #007aff; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;',
      'color: #888; font-size: 11px; margin-left: 5px;'
    );
  }
})();
