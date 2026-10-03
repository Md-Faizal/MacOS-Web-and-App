/**
 * MacOS Cursor Engine  v4.0  —  Industrial Standard Edition
 * ─────────────────────────────────────────────────────────────────
 * Fully offline, zero-latency, resilient macOS cursor engine.
 * 
 * 1. 100% Offline & Synchronous:
 *    Uses embedded pre-compiled SVG assets with authentic macOS geometry,
 *    white fill, and black outlines. Zero network calls, zero CDN latency,
 *    and completely immune to DevTools "Disable cache" or offline mode.
 * 
 * 2. Real-Time Zero-Latency Positioning:
 *    Cursor position is updated synchronously on pointer/mouse events.
 *    Decoupled from requestAnimationFrame so the cursor NEVER freezes
 *    or disappears when Chrome DevTools throttles or pauses RAF.
 * 
 * 3. Bulletproof Physics Math:
 *    Strictly sanitized velocity calculations protect against NaN
 *    propagation from breakpoint pauses, DevTools switches, or timestamp jumps.
 * 
 * 4. Robust Edge & Context Visibility:
 *    Auto-wakes and stays visible on focus, pointerenter, mousedown,
 *    right-click contextmenu, and viewport re-entry. Only hides when
 *    the mouse physically exits window viewport boundaries.
 * 
 * 5. Transparent Pointer Pass-Through:
 *    Guaranteed pointer-events: none across all elements and states,
 *    ensuring 100% click, right-click, and drag pass-through.
 * ─────────────────────────────────────────────────────────────────
 */

(function MacOSCursorEngine() {
  'use strict';

  /* ── Touch-only devices: skip ── */
  if (window.matchMedia('(hover: none)').matches) return;
  /* ── No double-init ── */
  if (document.getElementById('macos-cursor')) return;

  /* ══════════════════════════════════════════════════════════
     CURSOR STATE REGISTRY
   ══════════════════════════════════════════════════════════ */
  const STATES = {
    arrow: {
      w: 32, h: 32,
      ox: 10, oy: 6,    // hotspot: tip of arrow
      base: 1,
      dot: false,
    },
    pointer: {
      w: 32, h: 32,
      ox: 10, oy: 4,    // hotspot: fingertip
      base: 1.15,       // subtle hover enlargement
      dot: true,
    },
    text: {
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    grab: {
      w: 32, h: 32,
      ox: 14, oy: 8,
      base: 1,
      dot: false,
    },
    grabbing: {
      w: 30, h: 30,
      ox: 13, oy: 10,
      base: 1,
      dot: false,
      brightness: 0.82,
    },
    move: {
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    notAllowed: {
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    crosshair: {
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    resizeNS: {
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeEW: {
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeNESW: {
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeNWSE: {
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    wait: {
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
      animated: true,
    },
  };

  /**
   * Resolves the cursor asset synchronously from the embedded asset bundle.
   */
  function getCursorAsset(name) {
    if (window.MACOS_CURSOR_ASSETS && window.MACOS_CURSOR_ASSETS[name]) {
      return window.MACOS_CURSOR_ASSETS[name];
    }
    if (window.MACOS_CURSOR_ASSETS && window.MACOS_CURSOR_ASSETS.arrow) {
      return window.MACOS_CURSOR_ASSETS.arrow;
    }
    // Fallback minimal white arrow SVG if bundle hasn't evaluated yet
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="%23fff" stroke="%23000" stroke-width="1.5" d="M3 2v20l5.5-5.5 4.5 10 3.5-1.5-4.5-10h7z"/></svg>';
  }

  /* ══════════════════════════════════════════════════════════
     DOM CONSTRUCTION & RECOVERY
   ══════════════════════════════════════════════════════════ */
  const cursorEl = document.createElement('div');
  cursorEl.id = 'macos-cursor';
  cursorEl.style.pointerEvents = 'none';

  const cursorImg = document.createElement('img');
  cursorImg.alt = '';
  cursorImg.draggable = false;
  cursorImg.style.pointerEvents = 'none';
  cursorEl.appendChild(cursorImg);

  const dotEl = document.createElement('div');
  dotEl.id = 'macos-cursor-dot';
  dotEl.style.pointerEvents = 'none';

  const ringEl = document.createElement('div');
  ringEl.id = 'macos-cursor-ring';
  ringEl.style.pointerEvents = 'none';

  function ensureMounted() {
    const parent = document.body || document.documentElement;
    if (!parent) return;
    if (!cursorEl.parentElement) parent.appendChild(cursorEl);
    if (!dotEl.parentElement) parent.appendChild(dotEl);
    if (!ringEl.parentElement) parent.appendChild(ringEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureMounted);
  } else {
    ensureMounted();
  }

  /* ══════════════════════════════════════════════════════════
     STATE
   ══════════════════════════════════════════════════════════ */
  let mouseX = -500, mouseY = -500;
  let dotX   = -500, dotY   = -500;
  let rafId  = null;
  let isHidden = false;
  let currentStateName = 'arrow';

  /* ── Velocity / Shake-to-Find ── */
  let prevX = 0, prevY = 0, prevT = 0;
  let velocity      = 0;    // px/ms EMA
  let velocityScale = 1;    // current rendered scale
  let isShaking     = false;

  const VEL_LERP          = 0.35;
  const VEL_THRESHOLD     = 0.45;  // px/ms to start growing
  const VEL_MAX           = 2.4;   // px/ms for max scale
  const VEL_SCALE_MAX     = 2.5;   // peak cursor scale (authentic macOS)
  const VEL_DECAY         = 0.92;  // per-frame decay (holds enlargement during shake)
  const SHAKE_GLOW_THRESH = 1.3;   // velocity for glow

  /* ══════════════════════════════════════════════════════════
     VIEWPORT BOUNDARY HELPER
   ══════════════════════════════════════════════════════════ */
  function isInsideViewport(x, y) {
    return Number.isFinite(x) && Number.isFinite(y) &&
           x >= 0 && x <= window.innerWidth &&
           y >= 0 && y <= window.innerHeight;
  }

  /* ══════════════════════════════════════════════════════════
     SHOW / HIDE
   ══════════════════════════════════════════════════════════ */
  function showCursor() {
    if (!isHidden) return;
    isHidden = false;
    cursorEl.classList.remove('hidden');
    dotEl.classList.remove('hidden');
  }

  function hideCursor() {
    if (isHidden) return;
    isHidden = true;
    cursorEl.classList.add('hidden');
    dotEl.classList.add('hidden');
  }

  /* ══════════════════════════════════════════════════════════
     APPLY CURSOR STATE (SYNCHRONOUS)
   ══════════════════════════════════════════════════════════ */
  function applyCursorState(name, force = false) {
    const meta = STATES[name] || STATES.arrow;
    if (name === currentStateName && !force) return;
    currentStateName = name;

    const dataUri = getCursorAsset(name);
    if (cursorImg.src !== dataUri) {
      cursorImg.src = dataUri;
    }

    cursorEl.style.width  = meta.w + 'px';
    cursorEl.style.height = meta.h + 'px';

    cursorImg.style.filter = meta.brightness
      ? `brightness(${meta.brightness})`
      : '';

    if (name === 'wait') {
      cursorEl.classList.add('state-wait');
    } else {
      cursorEl.classList.remove('state-wait');
    }

    if (meta.dot) {
      dotEl.classList.add('dot-hover');
    } else {
      dotEl.classList.remove('dot-hover');
    }
  }

  /* ══════════════════════════════════════════════════════════
     STATE DETECTION
   ══════════════════════════════════════════════════════════ */
  function detectState(el) {
    if (!el) return 'arrow';
    let comp = '';
    try {
      comp = window.getComputedStyle(el).cursor;
    } catch (_) {
      return 'arrow';
    }

    if (el.draggable || (el.closest && el.closest('[draggable="true"]'))) return 'grab';

    switch (comp) {
      case 'pointer':        return 'pointer';
      case 'text':
      case 'vertical-text': return 'text';
      case 'grab':           return 'grab';
      case 'grabbing':       return 'grabbing';
      case 'move':
      case 'all-scroll':     return 'move';
      case 'not-allowed':
      case 'no-drop':        return 'notAllowed';
      case 'crosshair':      return 'crosshair';
      case 'ns-resize':
      case 'n-resize':
      case 's-resize':
      case 'row-resize':     return 'resizeNS';
      case 'ew-resize':
      case 'e-resize':
      case 'w-resize':
      case 'col-resize':     return 'resizeEW';
      case 'ne-resize':
      case 'sw-resize':
      case 'nesw-resize':    return 'resizeNESW';
      case 'nw-resize':
      case 'se-resize':
      case 'nwse-resize':    return 'resizeNWSE';
      case 'wait':
      case 'progress':       return 'wait';
      default:
        if (isInteractive(el)) return 'pointer';
        return 'arrow';
    }
  }

  function isInteractive(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (['A','BUTTON','SELECT','SUMMARY','LABEL','DETAILS'].includes(tag)) return true;
    if (tag === 'INPUT' && !['range','checkbox','radio'].includes(el.type)) return true;
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    if (el.onclick) return true;
    return false;
  }

  /* ══════════════════════════════════════════════════════════
     VELOCITY → SCALE (Shake-to-Find)
   ══════════════════════════════════════════════════════════ */
  function targetScale() {
    const base = (STATES[currentStateName] || STATES.arrow).base || 1;
    if (!Number.isFinite(velocity) || velocity <= VEL_THRESHOLD) return base;
    const clampedVelocity = Math.min(Math.max(velocity, 0), VEL_MAX);
    const t = Math.min((clampedVelocity - VEL_THRESHOLD) / (VEL_MAX - VEL_THRESHOLD), 1);
    const result = base + Math.sqrt(t) * (VEL_SCALE_MAX - base);
    return Number.isFinite(result) ? result : base;
  }

  /* ══════════════════════════════════════════════════════════
     SYNCHRONOUS POINTER TRANSFORM UPDATE
     Guarantees real-time positioning with zero latency.
   ══════════════════════════════════════════════════════════ */
  function updateCursorPosition(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const meta = STATES[currentStateName] || STATES.arrow;
    const tx = Math.round(x - meta.ox);
    const ty = Math.round(y - meta.oy);
    const vs = Number.isFinite(velocityScale) ? velocityScale.toFixed(4) : '1.0000';

    cursorEl.style.transform = `translate(${tx}px, ${ty}px) scale(${vs})`;
    cursorEl.style.setProperty('--cursor-pos', `translate(${tx}px, ${ty}px)`);
    cursorEl.style.setProperty('--vs', vs);
  }

  /* ══════════════════════════════════════════════════════════
     RAF LOOP (PHYSICS & LERP TRAILS ONLY)
   ══════════════════════════════════════════════════════════ */
  function tick() {
    /* Velocity decay with strict NaN protection */
    if (Number.isFinite(velocity)) {
      velocity *= VEL_DECAY;
      if (velocity < 0.001) velocity = 0;
    } else {
      velocity = 0;
    }

    /* Spring toward target scale */
    const target = targetScale();
    if (Number.isFinite(target)) {
      velocityScale += (target - velocityScale) * 0.18;
    }
    if (!Number.isFinite(velocityScale) || velocityScale < 1) {
      velocityScale = 1;
    } else if (velocityScale > VEL_SCALE_MAX) {
      velocityScale = VEL_SCALE_MAX;
    }

    /* Shake glow */
    const shouldShake = velocity > SHAKE_GLOW_THRESH;
    if (shouldShake !== isShaking) {
      isShaking = shouldShake;
      cursorEl.classList.toggle('shaking', isShaking);
    }

    /* Keep scale refreshed */
    if (Number.isFinite(mouseX) && Number.isFinite(mouseY) && mouseX > -200) {
      updateCursorPosition(mouseX, mouseY);
    }

    /* LERP dot trail */
    if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
      dotX += (mouseX - dotX) * 0.18;
      dotY += (mouseY - dotY) * 0.18;
      if (Number.isFinite(dotX) && Number.isFinite(dotY)) {
        dotEl.style.transform = `translate(${Math.round(dotX)}px, ${Math.round(dotY)}px) translate(-50%, -50%)`;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════
     EVENTS: ROBUST MOVEMENT & WAKEUP
   ══════════════════════════════════════════════════════════ */
  function handlePointerMove(e) {
    ensureMounted();

    const clientX = e.clientX;
    const clientY = e.clientY;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

    const now = (e.timeStamp && Number.isFinite(e.timeStamp)) ? e.timeStamp : performance.now();
    if (prevT > 0) {
      const dt = now - prevT;
      // Skip duplicate/synthetic 0ms events without resetting velocity
      if (dt <= 0) return;

      const dx = clientX - prevX;
      const dy = clientY - prevY;

      // Only compute velocity on continuous frames (skip debugger pauses/jumps > 350ms)
      if (dt < 350 && Number.isFinite(dx) && Number.isFinite(dy)) {
        const speed = Math.sqrt(dx * dx + dy * dy) / dt;
        if (Number.isFinite(speed)) {
          velocity += (speed - velocity) * VEL_LERP;
        }
      } else {
        velocity = 0;
      }
    }

    prevX = clientX;
    prevY = clientY;
    prevT = now;
    mouseX = clientX;
    mouseY = clientY;

    if (isInsideViewport(clientX, clientY)) {
      showCursor();
    }

    // Instant zero-latency position update
    updateCursorPosition(clientX, clientY);

    // Synchronous state detection
    const under = document.elementFromPoint(clientX, clientY);
    applyCursorState(detectState(under));
  }

  // Single robust event binding (avoid duplicate events resetting dt/velocity)
  if (window.PointerEvent) {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
  } else {
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
  }

  /* MOUSEDOWN — LEFT click animate (button 0), RIGHT click contextmenu transparent */
  window.addEventListener('mousedown', (e) => {
    ensureMounted();
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      showCursor();
      updateCursorPosition(e.clientX, e.clientY);
    }

    /* Animate on left-click (button 0) only */
    if (e.button === 0) {
      cursorEl.classList.remove('clicking');
      void cursorEl.offsetWidth; // restart animation
      cursorEl.classList.add('clicking');

      ringEl.style.left = e.clientX + 'px';
      ringEl.style.top  = e.clientY + 'px';
      ringEl.classList.remove('burst');
      void ringEl.offsetWidth;
      ringEl.classList.add('burst');
    }

    /* Grab → grabbing */
    if (currentStateName === 'grab') applyCursorState('grabbing', true);
  }, { passive: true });

  window.addEventListener('mouseup', (e) => {
    cursorEl.classList.remove('clicking');
    if (currentStateName === 'grabbing') applyCursorState('grab', true);
    if (isInsideViewport(e.clientX, e.clientY)) showCursor();
  }, { passive: true });

  /* CONTEXT MENU & RIGHT-CLICK WAKEUP */
  window.addEventListener('contextmenu', (e) => {
    if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      showCursor();
      updateCursorPosition(e.clientX, e.clientY);
    }
  }, { passive: true });

  /* DRAG events */
  window.addEventListener('dragstart', () => applyCursorState('grabbing', true), { passive: true });
  window.addEventListener('dragend',   () => applyCursorState('arrow',    true), { passive: true });

  /* WINDOW LEAVE / ENTER & FOCUS WAKEUP */
  document.addEventListener('mouseleave', (e) => {
    // Only hide if the pointer physically crossed outside window viewport
    const outside = !e.relatedTarget && (
      !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY) ||
      e.clientX <= 0 || e.clientX >= window.innerWidth ||
      e.clientY <= 0 || e.clientY >= window.innerHeight
    );
    if (outside) {
      hideCursor();
    }
  }, { passive: true });

  document.addEventListener('mouseenter', () => {
    ensureMounted();
    showCursor();
  }, { passive: true });

  window.addEventListener('focus', () => {
    ensureMounted();
    showCursor();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      ensureMounted();
      showCursor();
    }
  }, { passive: true });

  /* ══════════════════════════════════════════════════════════
     INIT
   ══════════════════════════════════════════════════════════ */
  ensureMounted();
  applyCursorState('arrow', true);
  rafId = requestAnimationFrame(tick);

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
   ══════════════════════════════════════════════════════════ */
  window.MacOSCursor = {
    setState:    (name) => applyCursorState(name, true),
    restore:     ()     => applyCursorState('arrow', true),
    hide:        ()     => hideCursor(),
    show:        ()     => showCursor(),
    getVelocity: ()     => velocity,
    version:     '4.0-industrial'
  };

  console.debug('🖱️ MacOS Cursor v4.0 ready (Synchronous, Offline, Industrial-Standard)');
})();
