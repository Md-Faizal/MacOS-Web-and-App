/**
 * MacOS Cursor Engine  v3.1  —  ful1e5/apple_cursor Edition
 * ─────────────────────────────────────────────────────────────────
 *
 * FIX 1 – Green → White:
 *   The ful1e5 source SVGs use placeholder colors:
 *     #00FF00 = cursor body fill  → replaced with #FFFFFF (white)
 *     #0000FF = cursor outline    → replaced with #000000 (black)
 *   We fetch each SVG, rewrite those colors, and create a Blob URL.
 *   Result: authentic white macOS cursors at runtime, no extra files.
 *
 * FIX 2 – Cursor always visible:
 *   Removed the 3-second auto-hide. macOS only hides the cursor in
 *   specific fullscreen media apps — not in general desktop use.
 *   Cursor now only hides when the mouse physically leaves the browser
 *   window or the window loses focus.
 *
 * FIX 3 – Authentic macOS click behaviour:
 *   Left-click (button 0):
 *     • Very subtle cursor squeeze (0.92×) with slight bounce (1.03×)
 *     • Soft click-ring ripple (matches macOS click feedback)
 *   Right-click (button 2):
 *     • No cursor animation (macOS shows a context menu, no cursor effect)
 *   Middle-click (button 1):
 *     • No cursor animation
 *
 * All other effects (shake-to-find, hover spring, LERP dot, wait
 * animation, state detection) remain from v3.0.
 * ─────────────────────────────────────────────────────────────────
 */

(function MacOSCursorEngine() {
  'use strict';

  /* ── Touch-only devices: skip ── */
  if (window.matchMedia('(hover: none)').matches) return;
  /* ── No double-init ── */
  if (document.getElementById('macos-cursor')) return;

  /* ══════════════════════════════════════════════════════════
     COLOR REWRITING
     Fetch each SVG from jsDelivr, replace placeholder colors,
     and hand back a Blob object URL that browsers can use in <img>.

     ful1e5/apple_cursor color conventions:
       #00FF00  →  white  (cursor body/fill)
       #0000FF  →  black  (cursor shadow outline)
   ══════════════════════════════════════════════════════════ */
  const CDN = 'https://cdn.jsdelivr.net/gh/ful1e5/apple_cursor@main/svg/';

  /* Color replacement map — case-insensitive */
  const COLOR_REPLACEMENTS = [
    [/#00FF00/gi, '#FFFFFF'],   // green body → white
    [/#0000FF/gi, '#000000'],   // blue outline → black
    [/fill="#0f0"/gi, 'fill="#fff"'],
    [/fill="#00f"/gi, 'fill="#000"'],
  ];

  /* Cache resolved blob URLs to avoid re-fetching */
  const blobCache = {};

  /**
   * Fetch an SVG, rewrite placeholder colors, return a Blob URL.
   * Falls back to the original CDN URL on any network error.
   */
  async function resolveCursorUrl(cdnUrl) {
    if (blobCache[cdnUrl]) return blobCache[cdnUrl];

    try {
      const res = await fetch(cdnUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let svg = await res.text();

      /* Apply all color replacements */
      for (const [pattern, replacement] of COLOR_REPLACEMENTS) {
        svg = svg.replace(pattern, replacement);
      }

      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      blobCache[cdnUrl] = url;
      return url;
    } catch (e) {
      console.warn('[MacOSCursor] Failed to rewrite SVG colors for', cdnUrl, e.message);
      blobCache[cdnUrl] = cdnUrl; // fallback: use raw CDN URL
      return cdnUrl;
    }
  }

  /* ══════════════════════════════════════════════════════════
     CURSOR STATE REGISTRY
   ══════════════════════════════════════════════════════════ */
  const STATES = {
    arrow: {
      src: CDN + 'left_ptr.svg',
      w: 32, h: 32,
      ox: 10, oy: 6,    // hotspot: tip of arrow
      base: 1,
      dot: false,
    },
    pointer: {
      src: CDN + 'hand2.svg',
      w: 32, h: 32,
      ox: 10, oy: 4,    // hotspot: fingertip
      base: 1.15,       // hover spring enlargement
      dot: true,
    },
    text: {
      src: CDN + 'xterm.svg',
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    grab: {
      src: CDN + 'hand1.svg',
      w: 32, h: 32,
      ox: 14, oy: 8,
      base: 1,
      dot: false,
    },
    grabbing: {
      src: CDN + 'hand1.svg',
      w: 30, h: 30,
      ox: 13, oy: 10,
      base: 1,
      dot: false,
      brightness: 0.82,   // slightly darker when gripping
    },
    move: {
      src: CDN + 'move.svg',
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    notAllowed: {
      src: CDN + 'crossed_circle.svg',
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    crosshair: {
      src: CDN + 'crosshair.svg',
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
    },
    resizeNS: {
      src: CDN + 'sb_v_double_arrow.svg',
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeEW: {
      src: CDN + 'sb_h_double_arrow.svg',
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeNESW: {
      src: CDN + 'bottom_left_corner.svg',
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    resizeNWSE: {
      src: CDN + 'bottom_right_corner.svg',
      w: 28, h: 28,
      ox: 14, oy: 14,
      base: 1,
      dot: false,
    },
    wait: {
      src: CDN + 'wait/wait-01.svg',
      w: 32, h: 32,
      ox: 16, oy: 16,
      base: 1,
      dot: false,
      animated: true,
    },
  };

  /* ══════════════════════════════════════════════════════════
     PRELOAD  (resolve + cache all blob URLs in background)
   ══════════════════════════════════════════════════════════ */
  Object.values(STATES).forEach(s => {
    if (!s.animated) resolveCursorUrl(s.src);  // fire-and-forget
  });

  /* ══════════════════════════════════════════════════════════
     DOM CONSTRUCTION
   ══════════════════════════════════════════════════════════ */
  const cursorEl = document.createElement('div');
  cursorEl.id = 'macos-cursor';

  const cursorImg = document.createElement('img');
  cursorImg.alt = '';
  cursorImg.draggable = false;
  cursorEl.appendChild(cursorImg);

  const dotEl = document.createElement('div');
  dotEl.id = 'macos-cursor-dot';

  const ringEl = document.createElement('div');
  ringEl.id = 'macos-cursor-ring';

  document.body.appendChild(cursorEl);
  document.body.appendChild(dotEl);
  document.body.appendChild(ringEl);

  /* ══════════════════════════════════════════════════════════
     STATE
   ══════════════════════════════════════════════════════════ */
  let mouseX = -300, mouseY = -300;
  let dotX   = -300, dotY   = -300;
  let rafId  = null;
  let isHidden = false;
  let currentStateName = 'arrow';

  /* Wait animation */
  let waitFrame = 1;
  let waitTimer = null;
  const WAIT_FRAMES = 40;
  const WAIT_FPS    = 24;

  /* ── Velocity / Shake-to-Find ── */
  let prevX = 0, prevY = 0, prevT = 0;
  let velocity      = 0;    // px/ms EMA
  let velocityScale = 1;    // current rendered scale
  let isShaking     = false;

  const VEL_LERP          = 0.28;
  const VEL_THRESHOLD     = 0.55;  // px/ms to start growing
  const VEL_MAX           = 3.2;   // px/ms for max scale
  const VEL_SCALE_MAX     = 2.4;   // peak cursor scale
  const VEL_DECAY         = 0.87;  // per-frame decay
  const SHAKE_GLOW_THRESH = 1.5;   // velocity for glow

  /* ══════════════════════════════════════════════════════════
     APPLY CURSOR STATE
   ══════════════════════════════════════════════════════════ */
  async function applyCursorState(name, force = false) {
    const meta = STATES[name] || STATES.arrow;
    if (name === currentStateName && !force) return;
    currentStateName = name;

    /* Stop wait animation */
    clearInterval(waitTimer);
    cursorEl.classList.remove('state-wait');

    /* Resolve the (possibly color-corrected) image URL */
    const url = await resolveCursorUrl(meta.src);
    if (cursorImg.src !== url) cursorImg.src = url;

    /* Size */
    cursorEl.style.width  = meta.w + 'px';
    cursorEl.style.height = meta.h + 'px';

    /* Brightness tweak for grabbing */
    cursorImg.style.filter = meta.brightness
      ? `brightness(${meta.brightness})`
      : '';

    /* Animated wait — cycle frames */
    if (meta.animated) {
      cursorEl.classList.add('state-wait');
      waitFrame = 1;
      waitTimer = setInterval(async () => {
        waitFrame = (waitFrame % WAIT_FRAMES) + 1;
        const pad = String(waitFrame).padStart(2, '0');
        const frameUrl = await resolveCursorUrl(CDN + `wait/wait-${pad}.svg`);
        cursorImg.src = frameUrl;
      }, 1000 / WAIT_FPS);
    }

    /* Trail dot */
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
    const comp = window.getComputedStyle(el).cursor;

    if (el.draggable || el.closest('[draggable="true"]')) return 'grab';

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
    if (!el) return false;
    const tag = el.tagName;
    if (['A','BUTTON','SELECT','SUMMARY','LABEL','DETAILS'].includes(tag)) return true;
    if (tag === 'INPUT' && !['range','checkbox','radio'].includes(el.type)) return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.onclick) return true;
    return false;
  }

  /* ══════════════════════════════════════════════════════════
     VELOCITY → SCALE  (Shake-to-Find)
   ══════════════════════════════════════════════════════════ */
  function targetScale() {
    const base = (STATES[currentStateName] || STATES.arrow).base || 1;
    if (velocity <= VEL_THRESHOLD) return base;
    const t = Math.min((velocity - VEL_THRESHOLD) / (VEL_MAX - VEL_THRESHOLD), 1);
    return base + Math.sqrt(t) * (VEL_SCALE_MAX - base);
  }

  /* ══════════════════════════════════════════════════════════
     RAF LOOP
   ══════════════════════════════════════════════════════════ */
  function tick() {
    const meta = STATES[currentStateName] || STATES.arrow;

    /* Velocity decay */
    velocity *= VEL_DECAY;

    /* Spring toward target scale */
    velocityScale += (targetScale() - velocityScale) * 0.1;

    /* Shake glow */
    const shouldShake = velocity > SHAKE_GLOW_THRESH;
    if (shouldShake !== isShaking) {
      isShaking = shouldShake;
      cursorEl.classList.toggle('shaking', isShaking);
    }

    /* Position cursor (hotspot-corrected) */
    const tx = mouseX - meta.ox;
    const ty = mouseY - meta.oy;
    const vs = velocityScale.toFixed(4);
    const transformStr = `translate(${tx}px, ${ty}px) scale(${vs})`;
    cursorEl.style.transform = transformStr;
    /* Expose as CSS var so the click animation can use it */
    cursorEl.style.setProperty('--cursor-pos', `translate(${tx}px, ${ty}px)`);
    cursorEl.style.setProperty('--vs', vs);

    /* LERP dot trail */
    dotX += (mouseX - dotX) * 0.15;
    dotY += (mouseY - dotY) * 0.15;
    dotEl.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;

    rafId = requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════
     SHOW / HIDE
     Only triggered by mouse leaving window or window blur.
     NOT on a timer — macOS never auto-hides in desktop mode.
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
     EVENTS
   ══════════════════════════════════════════════════════════ */

  /* MOUSEMOVE — track position + velocity */
  document.addEventListener('mousemove', (e) => {
    const now = e.timeStamp || performance.now();
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    const dt = now - prevT;

    if (dt > 0) {
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;
      velocity += (speed - velocity) * VEL_LERP;
    }

    prevX = e.clientX; prevY = e.clientY; prevT = now;
    mouseX = e.clientX; mouseY = e.clientY;

    showCursor();

    const under = document.elementFromPoint(e.clientX, e.clientY);
    applyCursorState(detectState(under));
  }, { passive: true });

  /* MOUSEDOWN — LEFT click only gets animation (button === 0)
     RIGHT click (button === 2): macOS opens context menu, no cursor fx
     MIDDLE click (button === 1): no cursor fx */
  document.addEventListener('mousedown', (e) => {
    /* Only animate on left-click (button 0) */
    if (e.button === 0) {
      /* Squeeze animation */
      cursorEl.classList.remove('clicking');
      void cursorEl.offsetWidth;   // restart animation
      cursorEl.classList.add('clicking');

      /* Subtle click ring at cursor hotspot position */
      const meta = STATES[currentStateName] || STATES.arrow;
      ringEl.style.left = e.clientX + 'px';
      ringEl.style.top  = e.clientY + 'px';
      ringEl.classList.remove('burst');
      void ringEl.offsetWidth;
      ringEl.classList.add('burst');
    }

    /* Grab → grabbing on any button */
    if (currentStateName === 'grab') applyCursorState('grabbing', true);
  }, { passive: true });

  document.addEventListener('mouseup', (e) => {
    cursorEl.classList.remove('clicking');
    /* Restore grab only if it was a drag */
    if (currentStateName === 'grabbing') applyCursorState('grab', true);
  }, { passive: true });

  /* DRAG states */
  document.addEventListener('dragstart', () => applyCursorState('grabbing', true), { passive: true });
  document.addEventListener('dragend',   () => applyCursorState('arrow',    true), { passive: true });

  /* WINDOW LEAVE / ENTER — hide/show cursor */
  document.addEventListener('mouseleave', () => hideCursor(), { passive: true });
  document.addEventListener('mouseenter', () => showCursor(), { passive: true });

  /* FOCUS / BLUR */
  window.addEventListener('blur',  () => hideCursor(),  { passive: true });
  window.addEventListener('focus', () => showCursor(),  { passive: true });

  /* ══════════════════════════════════════════════════════════
     INIT
   ══════════════════════════════════════════════════════════ */
  applyCursorState('arrow', true);
  rafId = requestAnimationFrame(tick);

  /* ══════════════════════════════════════════════════════════
     CLEANUP
   ══════════════════════════════════════════════════════════ */
  window.addEventListener('unload', () => {
    cancelAnimationFrame(rafId);
    clearInterval(waitTimer);
    /* Revoke blob URLs to free memory */
    Object.values(blobCache).forEach(url => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
  });

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
   ══════════════════════════════════════════════════════════ */
  window.MacOSCursor = {
    setState:    (name) => applyCursorState(name, true),
    restore:     ()     => applyCursorState('arrow', true),
    hide:        ()     => hideCursor(),
    show:        ()     => showCursor(),
    getVelocity: ()     => velocity,
  };

  console.log('🖱️  MacOS Cursor v3.1 ready (ful1e5/apple_cursor + color fix)');
})();
