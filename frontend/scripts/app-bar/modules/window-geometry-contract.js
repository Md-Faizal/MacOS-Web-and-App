/**
 * WindowGeometryContract & WindowGeometryManager
 * 
 * Authoritative single source of truth for:
 * 1. Desktop work area calculations (accounting for top bar and floating dock)
 * 2. Viewport & screen size change tracking (fullscreen enter/exit, window resize, responsive testing)
 * 3. Auto-adaptation for maximized / un-resized windows (eliminates empty space at bottom)
 * 4. Tracking manual resize/drag interactions (auto-resizing until user manually resizes)
 * 5. Window state machine, snap overlay preview, z-index layering, and dock anchor coordinates
 */

export class WindowGeometryManager {
  constructor() {
    this.windows = new Map();
    this.baseZIndex = 900000;
    this.currentZIndex = 900000;
    this.snapOverlay = null;
    this.rafId = null;
    this.debounceTimer = null;

    this.initListeners();
  }

  /**
   * Initialize screen change and resize listeners
   */
  initListeners() {
    if (typeof window === 'undefined') return;

    const handleScreenChange = () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(() => {
        this.handleViewportResize();
      });

      // Staged checks for fullscreen transitions and layout settle
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.handleViewportResize();
      }, 60);

      setTimeout(() => {
        this.handleViewportResize();
      }, 180);

      setTimeout(() => {
        this.handleViewportResize();
      }, 350);
    };

    window.addEventListener('resize', handleScreenChange);
    document.addEventListener('fullscreenchange', handleScreenChange);
    document.addEventListener('webkitfullscreenchange', handleScreenChange);
    document.addEventListener('mozfullscreenchange', handleScreenChange);
    document.addEventListener('MSFullscreenChange', handleScreenChange);

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleScreenChange);
    }
  }

  /**
   * Register or update an AppWindow instance
   */
  registerWindow(appId, instance, element) {
    if (!appId || !element) return null;

    const existing = this.windows.get(appId);
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 100, top: 80, width: 600, height: 500 };

    const record = existing || {
      appId,
      instance,
      element,
      state: instance.windowState || 'normal',
      spaceId: element.dataset?.spaceId || 'desktop-1',
      normalRect: {
        left: rect.left || 100,
        top: rect.top || 80,
        width: rect.width || 600,
        height: rect.height || 500
      },
      restoreRect: null,
      preMinimizeRect: null,
      zIndex: (typeof window !== 'undefined' ? parseInt(window.getComputedStyle(element).zIndex, 10) : 900000) || this.baseZIndex,
      isFocused: false
    };

    record.instance = instance;
    record.element = element;
    record.state = instance.windowState || record.state;
    this.windows.set(appId, record);

    return record;
  }

  /**
   * Convenience registration method for AppWindow instance
   */
  register(instance) {
    if (!instance) return null;
    return this.registerWindow(instance.appId, instance, instance.window || instance.element);
  }

  /**
   * Convenience unregister method
   */
  unregister(instanceOrAppId) {
    const appId = typeof instanceOrAppId === 'string' ? instanceOrAppId : instanceOrAppId?.appId;
    if (appId) this.unregisterWindow(appId);
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
    if (!record || !record.element || !record.element.getBoundingClientRect) return null;
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
   * Respects top bar, bottom dock (visible vs autohidden), and screen padding.
   * Eliminates empty bottom space when entering/exiting fullscreen.
   */
  getWorkAreaRect(margin = 8) {
    if (typeof window === 'undefined') return { left: 8, top: 36, width: 1200, height: 750, bottom: 786, margin: 8 };

    const isMobile = window.innerWidth < 480;
    const actualMargin = isMobile ? 4 : margin;

    const topBar = document.querySelector('.top-bar')?.getBoundingClientRect();
    const dock = document.querySelector('.dock-container');
    const isDockHidden = dock?.classList.contains('dock-hidden') || false;
    const dockRect = dock && !isDockHidden ? dock.getBoundingClientRect() : null;

    const top = Math.max(actualMargin, (topBar ? Math.round(topBar.bottom) : 0) + actualMargin);
    let bottom = window.innerHeight - actualMargin;
    if (dockRect && dockRect.top > top + 100) {
      bottom = Math.round(dockRect.top - actualMargin);
    }

    const left = actualMargin;
    const width = Math.max(260, window.innerWidth - (actualMargin * 2));
    const height = Math.max(180, bottom - top);

    return { left, top, width, height, bottom, margin: actualMargin };
  }

  /**
   * Get bounding box of Dock item for this app to anchor minimize/restore animations
   */
  getDockIconRect(appId) {
    if (typeof window === 'undefined') return { left: 0, top: 0, width: 48, height: 48, centerX: 24, centerY: 24 };

    let icon = document.getElementById(`app-${appId}`);
    if (!icon) icon = document.getElementById(`app-${appId}-recent`);
    if (!icon) icon = document.querySelector(`.dock-item[data-app="${appId}"]`);

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

    this.windows.forEach((rec, id) => {
      rec.isFocused = (id === appId);
      if (rec.element) {
        rec.element.classList.toggle('is-focused', rec.isFocused);
        rec.element.classList.toggle('window-blurred', !rec.isFocused);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-window-focused', { detail: { appId } }));
    }
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

    if (typeof window !== 'undefined' && typeof window.setAppState === 'function') {
      window.setAppState(appId, state === 'normal' || state === 'maximized' ? 'open' : state);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-window-state-changed', {
        detail: { appId, state }
      }));
    }
  }

  /**
   * Show snap preview zone overlay on hover
   */
  showSnapPreview(rect) {
    if (typeof document === 'undefined') return;
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
   * Handle global viewport and screen size changes
   * Auto-resizes maximized / un-resized windows to fill available space
   */
  handleViewportResize() {
    const workArea = this.getWorkAreaRect();
    this.windows.forEach((record) => {
      if (!record.instance || !record.element) return;
      if (typeof record.instance.handleViewportResize === 'function') {
        record.instance.handleViewportResize(workArea);
      } else if (record.state === 'maximized' && record.instance?.applyFrame) {
        record.instance.applyFrame({
          left: `${workArea.left}px`,
          top: `${workArea.top}px`,
          width: `${workArea.width}px`,
          height: `${workArea.height}px`,
          transform: 'none'
        }, { animate: false });
      } else if (record.instance?.constrainWindowToViewport) {
        record.instance.constrainWindowToViewport();
      }
    });
  }

  /**
   * Track manual resizing start
   */
  notifyManualResizeStart(appInstance) {
    if (!appInstance) return;
    appInstance.isManuallyResized = true;

    if (appInstance.windowState === 'maximized') {
      appInstance.windowState = 'normal';
      if (appInstance.window) {
        appInstance.window.dataset.windowState = 'normal';
        appInstance.window.classList.remove('maximized');
      }
      appInstance.updateAppBarIconState?.();
      this.setState(appInstance.appId, 'normal');
    }
  }

  /**
   * Track manual dragging start
   */
  notifyManualDragStart(appInstance) {
    if (!appInstance) return;
    appInstance.isManuallyResized = true;

    if (appInstance.windowState === 'maximized') {
      appInstance.windowState = 'normal';
      if (appInstance.window) {
        appInstance.window.dataset.windowState = 'normal';
        appInstance.window.classList.remove('maximized');
      }
      appInstance.updateAppBarIconState?.();
      this.setState(appInstance.appId, 'normal');
    }
  }

  /**
   * Handle explicit maximize action
   */
  notifyMaximize(appInstance) {
    if (!appInstance) return;
    appInstance.isManuallyResized = false;
    appInstance.windowState = 'maximized';
  }

  /**
   * Handle restore to normal window
   */
  notifyRestore(appInstance) {
    if (!appInstance) return;
    appInstance.isManuallyResized = true;
    appInstance.windowState = 'normal';
  }
}

// Global singleton instance
export const windowGeometryManager = (typeof window !== 'undefined' && window.windowGeometryManager)
  ? window.windowGeometryManager
  : new WindowGeometryManager();

// Standard aliases for backwards compatibility
export const WindowResizer = WindowGeometryManager;
export const windowResizer = windowGeometryManager;

if (typeof window !== 'undefined') {
  window.WindowGeometryManager = WindowGeometryManager;
  window.windowGeometryManager = windowGeometryManager;
  window.WindowResizer = WindowResizer;
  window.windowResizer = windowResizer;
}

export default windowGeometryManager;
