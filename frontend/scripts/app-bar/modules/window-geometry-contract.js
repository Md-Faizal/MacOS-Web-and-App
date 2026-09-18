/**
 * WindowGeometryContract & WindowGeometryManager
 * Authoritative single source of truth for macOS window geometry, state machine,
 * work area calculation, Dock target anchoring, and z-index layering.
 */

export class WindowGeometryManager {
  constructor() {
    this.windows = new Map();
    this.baseZIndex = 900000;
    this.currentZIndex = 900000;
    this.snapOverlay = null;

    // Viewport resize tracking
    window.addEventListener('resize', () => {
      this.handleViewportResize();
    });
  }

  /**
   * Register or update an AppWindow instance
   */
  registerWindow(appId, instance, element) {
    if (!appId || !element) return null;

    const existing = this.windows.get(appId);
    const rect = element.getBoundingClientRect();

    const record = existing || {
      appId,
      instance,
      element,
      state: instance.windowState || 'normal',
      spaceId: element.dataset.spaceId || 'desktop-1',
      normalRect: {
        left: rect.left || 100,
        top: rect.top || 80,
        width: rect.width || 600,
        height: rect.height || 500
      },
      restoreRect: null,
      preMinimizeRect: null,
      zIndex: parseInt(window.getComputedStyle(element).zIndex, 10) || this.baseZIndex,
      isFocused: false
    };

    record.instance = instance;
    record.element = element;
    this.windows.set(appId, record);

    return record;
  }

  /**
   * Unregister an AppWindow
   */
  unregisterWindow(appId) {
    this.windows.delete(appId);
  }

  /**
   * Get record for a window
   */
  getWindow(appId) {
    return this.windows.get(appId) || null;
  }

  /**
   * Get all managed windows
   */
  getAllWindows(includeMinimized = false, spaceId = null) {
    return Array.from(this.windows.values()).filter(record => {
      if (record.state === 'closed') return false;
      if (!includeMinimized && record.state === 'minimized') return false;
      if (spaceId && record.spaceId !== spaceId) return false;
      return true;
    });
  }

  /**
   * Capture current live geometry in pixels
   */
  captureGeometry(appId) {
    const record = this.windows.get(appId);
    if (!record || !record.element) return null;
    const rect = record.element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  /**
   * Update the normal (unmaximized/untiled) desktop geometry
   */
  updateNormalGeometry(appId, rect) {
    const record = this.windows.get(appId);
    if (!record) return;
    record.normalRect = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  /**
   * Calculate exact macOS desktop work area
   * Respects top status bar, bottom dock (visible vs autohidden), and screen padding.
   */
  getWorkAreaRect(margin = 8) {
    const topBar = document.querySelector('.top-bar')?.getBoundingClientRect();
    const dock = document.querySelector('.dock-container');
    const isDockHidden = dock?.classList.contains('dock-hidden') || false;
    const dockRect = dock && !isDockHidden ? dock.getBoundingClientRect() : null;

    const top = Math.max(margin, (topBar ? topBar.bottom : 0) + margin);
    const bottom = dockRect && dockRect.top > top 
      ? Math.max(top + 200, dockRect.top - margin)
      : window.innerHeight - margin;

    const left = margin;
    const width = Math.max(320, window.innerWidth - (margin * 2));
    const height = Math.max(240, bottom - top);

    return { left, top, width, height };
  }

  /**
   * Get bounding box of Dock item for this app to anchor minimize/restore animations
   */
  getDockIconRect(appId) {
    let icon = document.getElementById(`app-${appId}`);
    if (!icon) {
      icon = document.getElementById(`app-${appId}-recent`);
    }
    if (!icon) {
      // Look for data-app attribute or similar
      icon = document.querySelector(`.dock-item[data-app="${appId}"]`);
    }

    if (icon) {
      const rect = icon.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2
        };
      }
    }

    // Fallback: center-bottom of screen or dock container
    const dock = document.querySelector('.dock-container') || document.querySelector('.dock');
    if (dock) {
      const rect = dock.getBoundingClientRect();
      return {
        left: rect.left + rect.width / 2 - 24,
        top: rect.top,
        width: 48,
        height: 48,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      };
    }

    return {
      left: window.innerWidth / 2 - 24,
      top: window.innerHeight - 56,
      width: 48,
      height: 48,
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight - 32
    };
  }

  /**
   * Bring window to front
   */
  bringToFront(appId) {
    const record = this.windows.get(appId);
    if (!record || !record.element) return;

    this.currentZIndex += 2;
    record.zIndex = this.currentZIndex;
    record.element.style.zIndex = record.zIndex;

    // Update focus state across all records
    this.windows.forEach((rec, id) => {
      rec.isFocused = (id === appId);
      if (rec.element) {
        rec.element.classList.toggle('is-focused', rec.isFocused);
        rec.element.classList.toggle('window-blurred', !rec.isFocused);
      }
    });

    window.dispatchEvent(new CustomEvent('app-window-focused', { detail: { appId } }));
  }

  /**
   * Set window state and synchronize across system
   */
  setState(appId, state) {
    const record = this.windows.get(appId);
    if (!record) return;

    record.state = state;
    if (record.element) {
      record.element.dataset.windowState = state;
      record.element.classList.toggle('maximized', state === 'maximized');
      record.element.classList.toggle('minimized', state === 'minimized');
    }

    // Update app-bar and dock
    if (typeof window.setAppState === 'function') {
      window.setAppState(appId, state === 'normal' || state === 'maximized' ? 'open' : state);
    }

    window.dispatchEvent(new CustomEvent('app-window-state-changed', {
      detail: { appId, state }
    }));
  }

  /**
   * Show snap preview zone overlay on hover
   */
  showSnapPreview(rect) {
    if (!this.snapOverlay) {
      this.snapOverlay = document.createElement('div');
      this.snapOverlay.className = 'macos-snap-preview-overlay';
      this.snapOverlay.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 899990;
        background: rgba(59, 130, 246, 0.16);
        border: 1.5px solid rgba(96, 165, 250, 0.65);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-radius: 12px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.35);
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0;
        transform: scale(0.98);
      `;
      document.body.appendChild(this.snapOverlay);
    }

    this.snapOverlay.style.left = `${rect.left}px`;
    this.snapOverlay.style.top = `${rect.top}px`;
    this.snapOverlay.style.width = `${rect.width}px`;
    this.snapOverlay.style.height = `${rect.height}px`;
    this.snapOverlay.style.opacity = '1';
    this.snapOverlay.style.transform = 'scale(1)';
  }

  /**
   * Hide snap preview zone overlay
   */
  hideSnapPreview() {
    if (this.snapOverlay) {
      this.snapOverlay.style.opacity = '0';
      this.snapOverlay.style.transform = 'scale(0.98)';
      setTimeout(() => {
        if (this.snapOverlay && this.snapOverlay.style.opacity === '0') {
          this.snapOverlay.remove();
          this.snapOverlay = null;
        }
      }, 240);
    }
  }

  /**
   * Handle global viewport resize to clamp normal and maximized windows
   */
  handleViewportResize() {
    const workArea = this.getWorkAreaRect();
    this.windows.forEach((record) => {
      if (record.state === 'maximized' && record.instance?.applyFrame) {
        record.instance.applyFrame({
          left: `${workArea.left}px`,
          top: `${workArea.top}px`,
          width: `${workArea.width}px`,
          height: `${workArea.height}px`,
          transform: 'none'
        }, { animate: false });
      } else if (record.state === 'normal' && record.instance?.constrainWindowToViewport) {
        record.instance.constrainWindowToViewport();
      }
    });
  }
}

// Global singleton instance
window.windowGeometryManager = window.windowGeometryManager || new WindowGeometryManager();
export const windowGeometryManager = window.windowGeometryManager;
