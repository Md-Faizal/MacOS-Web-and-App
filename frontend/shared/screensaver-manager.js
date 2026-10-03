const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Screensaver') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };
/**
 * macOS Sonoma / Sequoia Screensaver Engine
 * 
 * Behavior:
 * - Detects user inactivity across the OS (mouse movement, clicks, key presses, scrolling, touches).
 * - After a configurable timeout (default 5 minutes, can be configured in Wallpaper Settings),
 *   all UI chrome (Dock, Top Bar, Apps, Widgets) smoothly fades away.
 * - The desktop wallpaper continues playing uninterrupted at full resolution.
 * - As soon as ANY user input is received, the OS instantly wakes up and restores all UI elements seamlessly.
 * - Supports instant Preview mode from Settings ("Screen Saver...").
 */

class ScreensaverManager {
  constructor() {
    this.STORAGE_KEY = 'macos_screensaver_timeout_minutes';
    this.DEFAULT_TIMEOUT_MINUTES = 5; // 5 minutes default
    
    this.idleTimer = null;
    this.isActive = false;
    this.isPreviewMode = false;
    this.timeoutMinutes = this.getTimeoutMinutes();
    
    // Throttling mousemove wake checks and jitter protection
    this.lastInputTime = Date.now();
    this.activatedTime = 0;
    this.initialMousePos = null;
    this.WAKE_GRACE_PERIOD_MS = 650; // Grace period during which subtle hand tremor/mouse jitter won't dismiss preview
    this.MOUSE_JITTER_THRESHOLD_PX = 25; // Minimum px movement required after entering preview

    this._onUserInput = this._onUserInput.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    this.init();
  }

  init() {
    this._attachInputListeners();
    this.resetTimer();

    // Listen for settings change events
    window.addEventListener('macos-screensaver-timeout-changed', (e) => {
      if (e.detail && typeof e.detail.minutes !== 'undefined') {
        this.setTimeoutMinutes(e.detail.minutes);
      }
    });

    log.debug(` 💤 Initialized (Timeout: ${this.timeoutMinutes === 0 ? 'Never' : this.timeoutMinutes + ' min'})`);
  }

  getTimeoutMinutes() {
    const val = localStorage.getItem(this.STORAGE_KEY);
    if (val === null) return this.DEFAULT_TIMEOUT_MINUTES;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? this.DEFAULT_TIMEOUT_MINUTES : parsed;
  }

  setTimeoutMinutes(minutes) {
    this.timeoutMinutes = parseInt(minutes, 10);
    localStorage.setItem(this.STORAGE_KEY, this.timeoutMinutes.toString());
    this.resetTimer();
  }

  _attachInputListeners() {
    const events = ['mousedown', 'keydown', 'wheel', 'touchstart', 'pointerdown'];
    events.forEach(evt => {
      window.addEventListener(evt, this._onUserInput, { passive: true, capture: true });
    });

    // Mousemove with throttling and jitter protection
    window.addEventListener('mousemove', this._onMouseMove, { passive: true, capture: true });
  }

  _onMouseMove(e) {
    const now = Date.now();

    if (this.isActive) {
      // If user recently triggered preview, prevent natural hand release/click jitter from cancelling it
      const elapsedSinceActivation = now - this.activatedTime;
      if (elapsedSinceActivation < this.WAKE_GRACE_PERIOD_MS) {
        return;
      }

      // Check distance from where the mouse was when activated
      if (this.initialMousePos) {
        const dx = e.clientX - this.initialMousePos.x;
        const dy = e.clientY - this.initialMousePos.y;
        const distance = Math.hypot(dx, dy);

        // If movement is just small accidental tremor, ignore it
        if (distance < this.MOUSE_JITTER_THRESHOLD_PX) {
          return;
        }
      }

      // Intentional mouse move - wake up immediately
      this.wakeUp();
      return;
    }

    if (now - this.lastInputTime > 1000) {
      this.lastInputTime = now;
      this.resetTimer();
    }
  }

  _onUserInput(e) {
    const now = Date.now();
    if (this.isActive) {
      // Ignore click/touch releases immediately after activation
      if (now - this.activatedTime < 350 && (e.type === 'mousedown' || e.type === 'pointerdown' || e.type === 'touchstart')) {
        return;
      }
      this.wakeUp();
    } else {
      this.lastInputTime = now;
      this.resetTimer();
    }
  }

  resetTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // If timeout is set to 0 ("Never"), do not set timer
    if (this.timeoutMinutes <= 0) return;

    const ms = this.timeoutMinutes * 60 * 1000;
    this.idleTimer = setTimeout(() => {
      this.activate();
    }, ms);
  }

  /**
   * Activates the screensaver (hiding all UI chrome)
   */
  activate(isPreview = false) {
    if (this.isActive) return;

    this.isActive = true;
    this.isPreviewMode = isPreview;
    this.activatedTime = Date.now();

    document.body.classList.add('screensaver-active');

    window.dispatchEvent(new CustomEvent('macos-screensaver-activated', {
      detail: { isPreview }
    }));

    log.debug(' 🌌 Screensaver started: Desktop chrome hidden, wallpaper playing');
  }

  /**
   * Wakes up immediately and restores all UI elements
   */
  wakeUp() {
    if (!this.isActive) return;

    this.isActive = false;
    this.isPreviewMode = false;
    this.initialMousePos = null;

    document.body.classList.remove('screensaver-active');

    window.dispatchEvent(new CustomEvent('macos-screensaver-deactivated'));

    this.resetTimer();
    log.debug(' ☀️ Screensaver dismissed: Welcome back');
  }

  /**
   * Manually trigger preview mode immediately with natural hand release immunity
   */
  preview(e = null) {
    if (e && typeof e.clientX === 'number') {
      this.initialMousePos = { x: e.clientX, y: e.clientY };
    } else {
      // Capture from current cursor coordinates if available
      const cursor = document.getElementById('macos-cursor');
      if (cursor && cursor.style.transform) {
        const match = cursor.style.transform.match(/translate3d\(([^p]+)px,\s*([^p]+)px/);
        if (match) {
          this.initialMousePos = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
        }
      }
    }

    // Small settle delay before activation so click event and cursor release settle down cleanly
    setTimeout(() => {
      this.activate(true);
    }, 120);
  }
}

// Global Singleton
window.screensaverManager = new ScreensaverManager();

export default window.screensaverManager;
