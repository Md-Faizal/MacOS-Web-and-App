import {
  WindowGeometryManager,
  windowGeometryManager,
  WindowResizer,
  windowResizer
} from './window-geometry-contract.js';

/**
 * AppWindow - A standardized macOS-style window component
 * Base class for building different applications with consistent UI/UX
 * Features: Drag, resize, minimize, maximize, close functionality
 */

class AppWindow {
  constructor(config = {}) {
    // Configuration
    this.appId = config.appId || 'app';
    this.appName = config.appName || 'App';
    this.containerId = config.containerId || 'appContainer';
    this.callbacks = config.callbacks || {};
    // Preset System: 'compact' | 'standard' | 'medium' | 'large'
    const preset = config.preset || null;
    let presetDefaults = {};

    if (preset === 'compact') {
      presetDefaults = {
        width: 310,
        height: 450,
        minWidth: 310,
        minHeight: 450,
        maxWidth: 310,
        maxHeight: 450,
        resizable: false,
        fixedSize: true
      };
    } else if (preset === 'standard') {
      const vw = window.innerWidth;
      const initialW = vw < 768 ? AppWindow.calculateMobileSizing().width : (vw < 1024 ? '550px' : '600px');
      const initialH = vw < 768 ? AppWindow.calculateMobileSizing().height : '500px';
      presetDefaults = {
        width: initialW,
        height: initialH,
        minWidth: 300,
        minHeight: 200
      };
    } else if (preset === 'medium') {
      presetDefaults = {
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 300
      };
    } else if (preset === 'large') {
      presetDefaults = {
        width: 1100,
        height: 650,
        minWidth: 600,
        minHeight: 400
      };
    }

    this.initialWidth = config.width || presetDefaults.width || 600;
    this.initialHeight = config.height || presetDefaults.height || 500;
    this.initialTop = config.top || null; // Optional: for custom positioning
    this.initialLeft = config.left || null; // Optional: for custom positioning
    
    // Size constraints
    this.maxWidth = config.maxWidth ?? presetDefaults.maxWidth ?? null;
    this.maxHeight = config.maxHeight ?? presetDefaults.maxHeight ?? null;
    this.minWidth = config.minWidth ?? presetDefaults.minWidth ?? 300;
    this.minHeight = config.minHeight ?? presetDefaults.minHeight ?? 200;
    this.resizable = config.resizable ?? (presetDefaults.resizable !== undefined ? presetDefaults.resizable : true);
    this.fixedSize = config.fixedSize ?? (presetDefaults.fixedSize !== undefined ? presetDefaults.fixedSize : false);
    
    // Default open maximized behavior:
    // Any resizable window opens maximized by default unless explicitly configured otherwise
    this.startMaximized = config.startMaximized ?? (!this.fixedSize && this.resizable);
    this.isManuallyResized = false; // Tracks if user has manually dragged or resized this window

    // Window state
    this.windowState = this.startMaximized ? 'maximized' : 'normal';
    this.originalPosition = { top: 0, left: 0, width: 0, height: 0 };
    this.isAnimating = false; // Prevent rapid consecutive calls
    this.appBarIcon = null;
    
    // Initialize
    this.init();
  }

  init() {
    this.createWindow();
    this.setupElements();
    
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const resizer = window.windowResizer || windowResizer;
    const workArea = resizer?.getWorkAreaRect() || geomMgr?.getWorkAreaRect() || this.getWorkAreaFrame();

    // Default restore frame if the user un-maximizes later
    const initialW = typeof this.initialWidth === 'number' ? this.initialWidth : parseInt(this.initialWidth, 10) || 700;
    const initialH = typeof this.initialHeight === 'number' ? this.initialHeight : parseInt(this.initialHeight, 10) || 520;
    const restoreW = Math.min(initialW, Math.max(300, window.innerWidth - 40));
    const restoreH = Math.min(initialH, Math.max(220, window.innerHeight - 80));
    const restoreLeft = Math.max(8, Math.round((window.innerWidth - restoreW) / 2));
    const restoreTop = Math.max(typeof workArea.top === 'number' ? workArea.top : 36, Math.round((window.innerHeight - restoreH) / 2));

    this.restoreFrame = {
      left: `${restoreLeft}px`,
      top: `${restoreTop}px`,
      width: `${restoreW}px`,
      height: `${restoreH}px`,
      transform: 'none'
    };

    if (this.startMaximized && !this.fixedSize) {
      this.windowState = 'maximized';
      const leftStr = typeof workArea.left === 'number' ? `${workArea.left}px` : workArea.left;
      const topStr = typeof workArea.top === 'number' ? `${workArea.top}px` : workArea.top;
      const widthStr = typeof workArea.width === 'number' ? `${workArea.width}px` : workArea.width;
      const heightStr = typeof workArea.height === 'number' ? `${workArea.height}px` : workArea.height;

      this.window.style.left = leftStr;
      this.window.style.top = topStr;
      this.window.style.width = widthStr;
      this.window.style.height = heightStr;
      this.window.style.transform = 'none';
      this.window.classList.add('maximized');
      this.window.dataset.windowState = 'maximized';
    } else {
      this.windowState = 'normal';
      this.window.style.width = typeof this.initialWidth === 'string' ? this.initialWidth : this.initialWidth + 'px';
      this.window.style.height = typeof this.initialHeight === 'string' ? this.initialHeight : this.initialHeight + 'px';
      
      // Apply positioning if provided (for mobile dynamic sizing)
      if (this.initialTop) {
        this.window.style.top = typeof this.initialTop === 'string' ? this.initialTop : this.initialTop + 'px';
      }
      if (this.initialLeft) {
        this.window.style.left = typeof this.initialLeft === 'string' ? this.initialLeft : this.initialLeft + 'px';
      }
    }
    
    this.setupEventListeners();
    this.injectStyles();
    this.findAppBarIcon();
    this.updateAppBarIconState();
    this.applyOpeningAnimation();
    
    // Register with WindowResizer and WindowGeometryManager
    if (resizer) {
      resizer.register(this);
    }
    if (geomMgr) {
      geomMgr.registerWindow(this.appId, this, this.window);
      geomMgr.setState(this.appId, this.windowState);
    }

    // Track this app as recently opened
    if (window.recentAppTracker) {
      window.recentAppTracker.trackAppOpen(this.appName, this.appId);
    }
    
    // Store reference globally for app bar access
    window[`${this.appId}Instance`] = this;

    // Ensure newly opened windows appear on top
    try {
      this.bringToFront();
    } catch (e) {
      // Fail silently if bringToFront isn't available yet
    }

    // Listen for viewport resize and fullscreen events to auto-adapt window
    this._handleViewportResizeBound = () => this.handleViewportResize();
    window.addEventListener('resize', this._handleViewportResizeBound);
    document.addEventListener('fullscreenchange', this._handleViewportResizeBound);
    document.addEventListener('webkitfullscreenchange', this._handleViewportResizeBound);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', this._handleViewportResizeBound);
    }
  }

  /**
   * Calculate dynamic mobile app sizing based on viewport height
   * @returns {object} { width, height } - Viewport units for mobile layout
   */
  static calculateMobileSizing() {
    // Use simple viewport units without positioning
    // Let AppWindow handle the positioning logic
    return {
      width: '95vw',
      height: '70vh'
    };
  }

  applyOpeningAnimation() {
    if (!this.window) return;
    this.window.style.display = 'flex';
    this.window.style.pointerEvents = 'none';
    this.window.style.transformOrigin = 'center center';

    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const dockTarget = geomMgr?.getDockIconRect(this.appId) || {
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight - 32
    };

    const curRect = this.window.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;
    const curCenterY = curRect.top + curRect.height / 2;

    const dx = Math.round(dockTarget.centerX - curCenterX);
    const dy = Math.round(dockTarget.centerY - curCenterY);

    // Gradual, smooth animated scale up to full window dimensions on desktop
    const anim = this.window.animate([
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.05)`,
        opacity: 0,
        filter: 'blur(2px)'
      },
      {
        transform: 'translate3d(0px, 0px, 0) scale(1)',
        opacity: 1,
        filter: 'blur(0px)'
      }
    ], {
      duration: 440,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards'
    });

    anim.onfinish = () => {
      if (this.window) {
        this.window.style.transform = 'none';
        this.window.style.opacity = '1';
        this.window.style.filter = 'none';
        this.window.style.pointerEvents = 'auto';
        anim.cancel();
      }
    };
  }

  createWindow() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const windowHTML = `
      <div class="app-window" data-app-id="${this.appId}">
        <!-- Title Bar with Traffic Lights -->
        <div class="app-title-bar">
          <div class="app-traffic-lights">
            <button class="traffic-light close" title="Close" data-action="close"><span>✕</span></button>
            <button class="traffic-light minimize" title="Minimize" data-action="minimize"><span>−</span></button>
            <button class="traffic-light maximize" title="Maximize" data-action="maximize"><span>+</span></button>
          </div>
          <h1 class="app-title">${this.appName}</h1>
          <div class="title-spacer"></div>
        </div>

        <!-- App Content Container -->
        <div class="app-content" id="${this.appId}-content"></div>

        <!-- Resize Handle -->
        <div class="resize-handle"></div>
      </div>
    `;

    container.innerHTML = windowHTML;
  }

  setupElements() {
    const container = document.getElementById(this.containerId);
    this.window = container.querySelector('.app-window');
    this.titleBar = container.querySelector('.app-title-bar');
    this.closeBtn = container.querySelector('.traffic-light.close');
    this.minimizeBtn = container.querySelector('.traffic-light.minimize');
    this.maximizeBtn = container.querySelector('.traffic-light.maximize');
    this.contentArea = container.querySelector('.app-content');
    this.resizeHandle = container.querySelector('.resize-handle');
    
    // Hide resize handle for non-resizable / fixed-size windows
    if (this.resizeHandle && (!this.resizable || this.fixedSize)) {
      this.resizeHandle.style.display = 'none';
    }

    // Store reference to this instance on the window element for easy access
    if (this.window) {
      this.window.__appInstance = this;
      this.window.dataset.windowState = this.windowState;
    }
  }

  setupEventListeners() {
    // Traffic light buttons
    this.closeBtn?.addEventListener('click', () => this.close());
    this.minimizeBtn?.addEventListener('click', () => this.minimize());
    
    // Maximize button with tiling menu on hover (2 second delay)
    let tilingMenuTimer = null;
    this.maximizeBtn?.addEventListener('mouseenter', () => {
      tilingMenuTimer = setTimeout(() => this.showTilingMenu(), 2000);
    });
    this.maximizeBtn?.addEventListener('mouseleave', () => {
      // Cancel the timer if mouse leaves before 3 seconds
      if (tilingMenuTimer) {
        clearTimeout(tilingMenuTimer);
        tilingMenuTimer = null;
      }
      // Don't close menu if it's already shown
      if (this.tilingMenu) {
        // Menu will close when mouse leaves the menu itself
      }
    });
    this.maximizeBtn?.addEventListener('click', () => this.toggleMaximize());

    // macOS Title Bar Double Click to toggle maximize/restore
    this.titleBar?.addEventListener('dblclick', (e) => {
      if (e.target.closest('.app-traffic-lights') || e.target.closest('.traffic-light')) return;
      if (!this.resizable || this.fixedSize) return;
      this.toggleMaximize();
    });

    // Drag window
    this.titleBar?.addEventListener('mousedown', (e) => {
      this.hideTilingMenu();  // Close menu before dragging
      this.startDrag(e);
    });

    // Touch drag support
    this.titleBar?.addEventListener('touchstart', (e) => {
      this.hideTilingMenu();  // Close menu before dragging
      this.startDrag(e);
    });

    // Bring to front on any window click - capture phase to ensure it fires
    this.window?.addEventListener('mousedown', (e) => {
      this.bringToFront();
    }, true);
    this.window?.addEventListener('touchstart', (e) => {
      this.bringToFront();
    }, true);

    // Resize window
    this.resizeHandle?.addEventListener('mousedown', (e) => {
      this.hideTilingMenu();  // Close menu before resizing
      this.startResize(e);
    });

    // Touch resize support
    this.resizeHandle?.addEventListener('touchstart', (e) => {
      this.hideTilingMenu();  // Close menu before resizing
      this.startResize(e);
    });
  }

  findAllAppBarIcons() {
    const icons = [];
    const mainIcon = document.getElementById(`app-${this.appId}`);
    const recentIcon = document.getElementById(`app-${this.appId}-recent`);
    if (mainIcon) icons.push(mainIcon);
    if (recentIcon) icons.push(recentIcon);
    return icons;
  }

  findAppBarIcon() {
    const icons = this.findAllAppBarIcons();
    this.appBarIcon = icons.length > 0 ? icons[0] : null;
  }

  injectStyles() {
    if (document.getElementById('app-window-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'app-window-styles';
    styles.textContent = `
      :root {
        --app-primary: #2563eb;
        --app-success: #22c55e;
        --app-warning: #eab308;
        --app-danger: #ef4444;
      }

      .app-window {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        height: 500px;
        background: #ffffff;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 0, 0, 0.3);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.6);
        display: flex;
        flex-direction: column;
        /* Keep app windows below the dock which uses a very large z-index */
        z-index: 900000;
        font-family: 'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        user-select: none;
        overflow: hidden;
      }

      .app-window.maximized {
        border-radius: 12px;
        max-width: none !important;
        max-height: none !important;
      }

      /* Dark theme for Calculator app */
      .app-window[data-app-id="calculator"] {
        background: #333;
      }

      .app-window[data-app-id="calculator"] .app-content {
        background: #36363a;
      }

      /* Transparent background for Launchpad app */
      .app-window[data-app-id="launchpad"] {
        background: rgba(255, 255, 255, 0.12);
      }

      .app-window[data-app-id="launchpad"] .app-content {
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        overflow-y: auto;
      }

      .app-window[data-app-id="launchpad"] .app-title-bar {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        justify-content: space-between;
      }

      .app-window[data-app-id="launchpad"] .app-title {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        flex: 0;
      }

      .app-window[data-app-id="launchpad"] .title-spacer {
        position: static;
      }

      
      /* Traffic Light hover effect across all 3 glyphs */
      .app-traffic-lights:hover .traffic-light span {
        color: rgba(0, 0, 0, 0.75) !important;
      }
      .app-window[data-app-id="calculator"] .app-traffic-lights:hover .traffic-light span {
        color: rgba(0, 0, 0, 0.85) !important;
      }

      /* 8-Directional Resizers */
      .window-resizers {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1000;
      }
      .window-resizers .resizer {
        position: absolute;
        pointer-events: auto;
      }
      .window-resizers .resizer-top {
        top: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize;
      }
      .window-resizers .resizer-bottom {
        bottom: -4px; left: 12px; right: 12px; height: 8px; cursor: ns-resize;
      }
      .window-resizers .resizer-left {
        left: -4px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize;
      }
      .window-resizers .resizer-right {
        right: -4px; top: 12px; bottom: 12px; width: 8px; cursor: ew-resize;
      }
      .window-resizers .resizer-top-left {
        top: -4px; left: -4px; width: 14px; height: 14px; cursor: nwse-resize; z-index: 2;
      }
      .window-resizers .resizer-top-right {
        top: -4px; right: -4px; width: 14px; height: 14px; cursor: nesw-resize; z-index: 2;
      }
      .window-resizers .resizer-bottom-left {
        bottom: -4px; left: -4px; width: 14px; height: 14px; cursor: nesw-resize; z-index: 2;
      }
      .window-resizers .resizer-bottom-right {
        bottom: -4px; right: -4px; width: 14px; height: 14px; cursor: nwse-resize; z-index: 2;
      }

      /* macOS Sequoia Tiling Palette */
      .macos-tiling-palette {
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.65);
        border-radius: 12px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08);
        min-width: 155px;
        z-index: 999995;
        animation: paletteFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes paletteFadeIn {
        from { opacity: 0; transform: translateY(-4px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .tiling-palette-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        background: transparent;
        border: none;
        border-radius: 6px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        color: #1f2937;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
        text-align: left;
        width: 100%;
      }
      .tiling-palette-btn:hover {
        background: #007aff;
        color: #ffffff;
      }
      .tiling-palette-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .app-window.resizing {
        user-select: none;
      }

      .app-window * {
        user-select: text;
      }

      /* ===== TITLE BAR ===== */
      .app-title-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 44px;
        padding: 0 12px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.7) 100%);
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        cursor: grab;
        user-select: none;
        border-radius: 12px 12px 0 0;
      }

      /* Dark title bar for Calculator */
      .app-window[data-app-id="calculator"] .app-title-bar {
        background: linear-gradient(180deg, rgba(60, 60, 63, 0.95) 0%, rgba(54, 54, 58, 0.95) 100%);
        border-bottom: 1px solid rgba(0, 0, 0, 0.3);
      }
      }

      .app-title-bar:active {
        cursor: grabbing;
      }

      .app-traffic-lights {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-right: 8px;
      }

      .traffic-light {
        width: 13px;
        height: 13px;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0;
        font-weight: bold;
        padding: 0;
        margin: 0;
        background-clip: border-box;
      }

      .traffic-light span {
        display: block;
        font-size: 9px;
        line-height: 1;
        color: rgba(0, 0, 0, 0);
        font-weight: bold;
        text-align: center;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease;
      }

      .traffic-light:hover span {
        color: rgba(0, 0, 0, 0.9);
      }

      .traffic-light.close {
        background: linear-gradient(135deg, #ed6158 0%, #ed6158 100%);
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.2), 0 1px 0 rgba(255, 255, 255, 0.5);
      }

      /* Dark shadow for Calculator close button */
      .app-window[data-app-id="calculator"] .traffic-light.close {
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.2);
      }

      .traffic-light.minimize {
        background: linear-gradient(135deg, #fcc02e 0%, #fcc02e 100%);
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.2), 0 1px 0 rgba(255, 255, 255, 0.5);
      }

      /* Dark shadow for Calculator minimize button */
      .app-window[data-app-id="calculator"] .traffic-light.minimize {
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.2);
      }

      .traffic-light.maximize {
        background: linear-gradient(135deg, #5fc038 0%, #5fc038 100%);
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.2), 0 1px 0 rgba(255, 255, 255, 0.5);
      }

      /* Dark shadow for Calculator maximize button */
      .app-window[data-app-id="calculator"] .traffic-light.maximize {
        box-shadow: inset -1px -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.2);
      }

      .app-title {
        flex: 1;
        text-align: center;
        font-size: 13px;
        font-weight: 600;
        color: #333;
        letter-spacing: 0.3px;
        margin: 0;
      }

      /* Light text for Calculator title */
      .app-window[data-app-id="calculator"] .app-title {
        color: #f5f5f7;
      }

      .title-spacer {
        width: 70px;
      }

      /* ===== STANDARDIZED MACOS SIDEBAR BUTTON & HEADER CONTROLS ===== */
      .app-title-bar [class*="-left-controls"],
      .manufacturing-left-controls,
      .contacts-left-controls,
      .billing-left-controls,
      .notes-left-controls,
      .product-left-controls,
      .settings-left-controls,
      .calendar-left-controls,
      .cloud-left-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-left: 8px;
      }

      .app-title-bar [class*="-header-btn"],
      .manufacturing-header-btn,
      .contacts-header-btn,
      .billing-header-btn,
      .notes-header-btn,
      .product-header-btn,
      .settings-header-btn,
      .calendar-header-btn,
      .cloud-header-btn {
        width: 28px;
        height: 28px;
        border-radius: 50% !important;
        border: 1px solid rgba(0, 0, 0, 0.08);
        background: rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        cursor: pointer;
        color: #333333;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 1px 3px rgba(0, 0, 0, 0.06);
        padding: 0;
      }

      .app-title-bar [class*="-header-btn"]:hover {
        background: rgba(255, 255, 255, 0.85);
        transform: scale(1.06);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 2px 6px rgba(0, 0, 0, 0.12);
      }

      .app-title-bar [class*="-header-btn"]:active {
        transform: scale(0.94);
        background: rgba(0, 0, 0, 0.06);
      }

      .app-title-bar [class*="-header-btn"].sidebar-collapsed {
        background: rgba(0, 0, 0, 0.08);
        color: #059669;
      }

      .app-title-bar [class*="-header-btn"] svg {
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .app-title-bar [class*="-header-btn"].sidebar-collapsed svg {
        transform: scale(0.9);
        opacity: 0.8;
      }

      /* ===== CONTENT AREA ===== */
      .app-content {
        flex: 1;
        display: flex;
        overflow: hidden;
        background: #ffffff;
      }

      /* Calendar-specific exception: don't force flex layout for calendar content */
      .app-window[data-app-id="calendar"] .app-content {
        display: block;
      }

      /* ===== RESIZE HANDLE ===== */
      .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
        background: linear-gradient(135deg, transparent 50%, rgba(37, 99, 235, 0.3) 50%);
        border-radius: 0 0 12px 0;
        z-index: 1000;
      }

      /* ===== ANIMATIONS ===== */
      @keyframes windowAppear {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.6);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes windowAppearMaximized {
        from {
          opacity: 0;
          transform: scale(0.6);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* macOS Genie Effect - Opening Animation */
      @keyframes genieOpen {
        0% {
          opacity: 0;
          transform: translate(-50%, 100%) scale(0.1);
          clip-path: inset(0% 0% 100% 0%);
        }
        50% {
          opacity: 0.8;
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          clip-path: inset(0% 0% 0% 0%);
        }
      }

      /* macOS Genie Effect - Closing Animation */
      @keyframes genieClose {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          clip-path: inset(0% 0% 0% 0%);
        }
        50% {
          opacity: 0.8;
        }
        100% {
          opacity: 0;
          transform: translate(-50%, 100%) scale(0.1);
          clip-path: inset(0% 0% 100% 0%);
        }
      }

      /* macOS Minimize to Dock Animation */
      @keyframes minimizeToDock {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(0.05);
        }
      }

      /* macOS Restore from Dock Animation - only fade and scale, position stays fixed */
      @keyframes restoreFromDock {
        0% {
          opacity: 0;
          transform: scale(0.8);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* Animations are now handled via CSS keyframes */

      /* ===== SCROLLBAR STYLING ===== */
      .app-content::-webkit-scrollbar {
        width: 8px;
      }

      .app-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .app-content::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      }

      .app-content::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.3);
      }

      /* Hide scrollbar while resizing */
      .app-window.resizing .app-content {
        overflow: hidden !important;
      }

      /* ===== RESPONSIVE ===== */
      @media (max-width: 768px) {
        .app-window {
          width: 90vw;
          height: 90vh;
          max-width: 500px;
        }
      }

      @media (max-width: 480px) {
        .app-window {
          width: 95vw;
          height: 95vh;
          max-width: none;
          border-radius: 8px;
        }
      }

      /* ===== TILING MENU ===== */
      .tiling-menu {
        position: fixed;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 12px;
        padding: 6px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(2, 1fr);
        gap: 4px;
        z-index: 10001;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.8);
        width: 220px;
      }

      .tiling-option {
        width: 48px;
        height: 48px;
        border: 2px solid rgba(37, 99, 235, 0.3);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: all 0.2s ease;
        position: relative;
      }

      .tiling-option:hover {
        background: rgba(37, 99, 235, 0.15);
        border-color: rgba(37, 99, 235, 0.8);
        transform: scale(1.05);
      }

      .tiling-option-tooltip {
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 9px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .tiling-option:hover .tiling-option-tooltip {
        opacity: 1;
      }
    `;

    document.head.appendChild(styles);
  }
  startDrag(e) {
    if (this.windowState === 'minimized') return;
    this.bringToFront();
    
    const rect = this.window.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    const startX = clientX;
    const startY = clientY;
    const startLeft = rect.left;
    const startTop = rect.top;

    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const workArea = geomMgr?.getWorkAreaRect() || { top: 32, left: 0, width: window.innerWidth, height: window.innerHeight };
    
    let activeSnapZone = null;
    let isDragging = false;
    let shield = null;

    const moveFn = (moveEvent) => {
      const moveClientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const moveClientY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
      
      const dx = moveClientX - startX;
      const dy = moveClientY - startY;
      
      if (!isDragging && Math.hypot(dx, dy) > 5) {
        isDragging = true;
        this.isManuallyResized = true;
        const resizer = window.windowResizer || windowResizer;
        resizer?.notifyManualDragStart(this);

        this.window.classList.add('is-dragging');
        
        shield = document.createElement('div');
        shield.className = 'window-interaction-shield';
        shield.style.cssText = 'position:fixed;inset:0;z-index:999999;cursor:grabbing;user-select:none;';
        document.body.appendChild(shield);

        if (this.windowState === 'maximized') {
          this.windowState = 'normal';
          this.updateAppBarIconState();
          if (geomMgr) geomMgr.setState(this.appId, 'normal');
        }
      }
      
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      
      const minLeft = -rect.width + 40;
      const minTop = Math.max(0, workArea.top);
      const maxLeft = window.innerWidth - 40;
      const maxTop = window.innerHeight - 40;
      
      newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
      newTop = Math.max(minTop, Math.min(newTop, maxTop));
      
      this.window.style.left = newLeft + 'px';
      this.window.style.top = newTop + 'px';
      this.window.style.transform = 'none';

      if (geomMgr && this.resizable && !this.fixedSize && isDragging) {
        let newSnapZone = null;
        const triggerZone = 20;
        
        if (moveClientY <= minTop + 5) {
          newSnapZone = { type: 'fullscreen', rect: workArea };
        } else if (moveClientX <= triggerZone) {
          newSnapZone = { type: 'left', rect: { left: workArea.left, top: workArea.top, width: workArea.width / 2, height: workArea.height } };
        } else if (moveClientX >= window.innerWidth - triggerZone) {
          newSnapZone = { type: 'right', rect: { left: workArea.left + workArea.width / 2, top: workArea.top, width: workArea.width / 2, height: workArea.height } };
        }
        
        if (newSnapZone) {
          if (!activeSnapZone || activeSnapZone.type !== newSnapZone.type) {
            activeSnapZone = newSnapZone;
            geomMgr.showSnapPreview(activeSnapZone.rect);
          }
        } else if (activeSnapZone) {
          activeSnapZone = null;
          geomMgr.hideSnapPreview();
        }
      }
    };

    const upFn = () => {
      document.removeEventListener('mousemove', moveFn);
      document.removeEventListener('mouseup', upFn);
      document.removeEventListener('touchmove', moveFn);
      document.removeEventListener('touchend', upFn);
      this.window.classList.remove('is-dragging');
      if (shield) shield.remove();
      
      if (geomMgr && activeSnapZone && this.resizable && !this.fixedSize) {
        geomMgr.hideSnapPreview();
        if (typeof this.captureFrame === 'function') {
           this.restoreFrame = this.captureFrame();
        }
        
        if (activeSnapZone.type === 'fullscreen') {
          this.windowState = 'maximized';
          this.isManuallyResized = false;
          const resizer = window.windowResizer || windowResizer;
          resizer?.notifyMaximize(this);
          if (geomMgr) geomMgr.setState(this.appId, 'maximized');
          this.updateAppBarIconState();
        } else {
          this.isManuallyResized = true;
        }
        
        if (typeof this.applyFrame === 'function') {
          this.applyFrame({
            left: `${activeSnapZone.rect.left}px`,
            top: `${activeSnapZone.rect.top}px`,
            width: `${activeSnapZone.rect.width}px`,
            height: `${activeSnapZone.rect.height}px`,
            transform: 'none'
          }, { animate: true });
        } else {
          this.window.style.left = `${activeSnapZone.rect.left}px`;
          this.window.style.top = `${activeSnapZone.rect.top}px`;
          this.window.style.width = `${activeSnapZone.rect.width}px`;
          this.window.style.height = `${activeSnapZone.rect.height}px`;
        }
      } else {
        const finalRect = this.window.getBoundingClientRect();
        if (geomMgr && this.windowState === 'normal') {
          geomMgr.updateNormalGeometry(this.appId, finalRect);
        }
        this.constrainWindowToViewport();
      }
    };

    document.addEventListener('mousemove', moveFn);
    document.addEventListener('mouseup', upFn);
    document.addEventListener('touchmove', moveFn, { passive: false });
    document.addEventListener('touchend', upFn);
  }

  startResize(e, direction = 'se') {
    if (this.windowState === 'minimized') return;
    this.bringToFront();

    const rect = this.window.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    const startX = clientX;
    const startY = clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const startLeft = rect.left;
    const startTop = rect.top;

    this.isManuallyResized = true;
    const resizer = window.windowResizer || windowResizer;
    resizer?.notifyManualResizeStart(this);

    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const workArea = geomMgr?.getWorkAreaRect() || { top: 32, left: 0, width: window.innerWidth, height: window.innerHeight };

    this.window.classList.add('resizing');
    const shield = document.createElement('div');
    shield.className = 'window-interaction-shield';
    shield.style.cssText = `position:fixed;inset:0;z-index:999999;cursor:${this.getCursorForDirection(direction)};user-select:none;`;
    document.body.appendChild(shield);

    const moveFn = (moveEvent) => {
      const moveClientX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const moveClientY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);
      const dx = moveClientX - startX;
      const dy = moveClientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      if (direction.includes('e')) {
        newWidth = Math.max(this.minWidth, startWidth + dx);
        if (this.maxWidth !== null) newWidth = Math.min(newWidth, this.maxWidth);
        newWidth = Math.min(newWidth, window.innerWidth - startLeft - 4);
      }

      if (direction.includes('s')) {
        newHeight = Math.max(this.minHeight, startHeight + dy);
        if (this.maxHeight !== null) newHeight = Math.min(newHeight, this.maxHeight);
        newHeight = Math.min(newHeight, window.innerHeight - startTop - 4);
      }

      if (direction.includes('w')) {
        let proposedWidth = startWidth - dx;
        proposedWidth = Math.max(this.minWidth, proposedWidth);
        if (this.maxWidth !== null) proposedWidth = Math.min(proposedWidth, this.maxWidth);
        const actualChange = startWidth - proposedWidth;
        newLeft = startLeft + actualChange;
        newWidth = proposedWidth;
      }

      if (direction.includes('n')) {
        let proposedHeight = startHeight - dy;
        proposedHeight = Math.max(this.minHeight, proposedHeight);
        if (this.maxHeight !== null) proposedHeight = Math.min(proposedHeight, this.maxHeight);
        const actualChange = startHeight - proposedHeight;
        newTop = Math.max(workArea.top, startTop + actualChange);
        newHeight = proposedHeight;
      }

      this.window.style.width = newWidth + 'px';
      this.window.style.height = newHeight + 'px';
      this.window.style.left = newLeft + 'px';
      this.window.style.top = newTop + 'px';
      this.window.style.transform = 'none';
    };

    const upFn = () => {
      document.removeEventListener('mousemove', moveFn);
      document.removeEventListener('mouseup', upFn);
      document.removeEventListener('touchmove', moveFn);
      document.removeEventListener('touchend', upFn);
      shield.remove();
      this.window.classList.remove('resizing');

      const finalRect = this.window.getBoundingClientRect();
      if (geomMgr && this.windowState === 'normal') {
        geomMgr.updateNormalGeometry(this.appId, finalRect);
      }
      this.constrainWindowToViewport();
    };

    document.addEventListener('mousemove', moveFn);
    document.addEventListener('mouseup', upFn);
    document.addEventListener('touchmove', moveFn, { passive: false });
    document.addEventListener('touchend', upFn);
  }

  getCursorForDirection(direction) {
    switch (direction) {
      case 'n': case 's': return 'ns-resize';
      case 'e': case 'w': return 'ew-resize';
      case 'nw': case 'se': return 'nwse-resize';
      case 'ne': case 'sw': return 'nesw-resize';
      default: return 'se-resize';
    }
  }

  toggleVerticalZoom() {
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const work = geomMgr?.getWorkAreaRect() || { top: 32, height: window.innerHeight - 32 };
    const rect = this.window.getBoundingClientRect();

    if (Math.abs(rect.height - work.height) < 10) {
      if (this.restoreFrame) {
        if (typeof this.applyFrame === 'function') {
          this.applyFrame(this.restoreFrame, { animate: true });
        }
      }
    } else {
      if (typeof this.captureFrame === 'function') {
        this.restoreFrame = this.captureFrame();
      }
      if (typeof this.applyFrame === 'function') {
        this.applyFrame({
          left: `${rect.left}px`,
          top: `${work.top}px`,
          width: `${rect.width}px`,
          height: `${work.height}px`,
          transform: 'none'
        }, { animate: true });
      }
    }
  }

  toggleZoom() {
    this.toggleMaximize();
  }


  /**
   * Handle viewport and screen size changes (fullscreen enter/exit, responsive testing, window resize)
   * Auto-resizes maximized or un-resized windows to fill available work area without bottom gaps
   * Preserves manual user adjustments until un-maximized or re-maximized
   */
  handleViewportResize(workArea = null) {
    if (!this.window || this.windowState === 'closed' || this.windowState === 'minimized') return;

    if (this.fixedSize) {
      this.constrainWindowToViewport();
      return;
    }

    const resizer = window.windowResizer || windowResizer;
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const wa = workArea || resizer?.getWorkAreaRect() || geomMgr?.getWorkAreaRect() || this.getWorkAreaFrame();

    const leftStr = typeof wa.left === 'number' ? `${wa.left}px` : wa.left;
    const topStr = typeof wa.top === 'number' ? `${wa.top}px` : wa.top;
    const widthStr = typeof wa.width === 'number' ? `${wa.width}px` : wa.width;
    const heightStr = typeof wa.height === 'number' ? `${wa.height}px` : wa.height;

    // RULE 2:
    // If window is currently maximized OR has not been manually resized by the user:
    // Auto-adapt to fill the work area (e.g. non-fullscreen to fullscreen, or responsive testing viewport resize)
    if (this.windowState === 'maximized' || !this.isManuallyResized) {
      this.windowState = 'maximized';
      this.window.dataset.windowState = 'maximized';
      this.window.classList.add('maximized');

      this.applyFrame({
        left: leftStr,
        top: topStr,
        width: widthStr,
        height: heightStr,
        transform: 'none'
      }, { animate: false });

      if (geomMgr) geomMgr.setState(this.appId, 'maximized');
      this.updateAppBarIconState();
    } else if (typeof this.windowState === 'string' && this.windowState.startsWith('tiled-')) {
      switch (this.windowState) {
        case 'tiled-left': this.tileLeft?.(); break;
        case 'tiled-right': this.tileRight?.(); break;
        case 'tiled-top': this.tileTop?.(); break;
        case 'tiled-bottom': this.tileBottom?.(); break;
        case 'tiled-top-left': this.tileTopLeft?.(); break;
        case 'tiled-top-right': this.tileTopRight?.(); break;
        case 'tiled-bottom-left': this.tileBottomLeft?.(); break;
        case 'tiled-bottom-right': this.tileBottomRight?.(); break;
        default: this.constrainWindowToViewport();
      }
    } else {
      // User manually resized / moved window: keep custom size & position within viewport
      this.constrainWindowToViewport();
    }
  }

  constrainWindowToViewport() {
    /**
     * Checks and adjusts position and size to prevent window from going outside viewport
     */
    const rect = this.window.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Get current position and size
    let left = rect.left;
    let top = rect.top;
    let width = rect.width;
    let height = rect.height;

    // Define all 4 corners: [x, y]
    const corners = [
      { x: left, y: top, name: 'top-left' },           // Top-left corner
      { x: left + width, y: top, name: 'top-right' },  // Top-right corner
      { x: left, y: top + height, name: 'bottom-left' }, // Bottom-left corner
      { x: left + width, y: top + height, name: 'bottom-right' } // Bottom-right corner
    ];

    // Check if any corner is outside viewport
    let needsAdjustment = false;
    corners.forEach(corner => {
      if (corner.x < 0 || corner.x > vw || corner.y < 0 || corner.y > vh) {
        needsAdjustment = true;
      }
    });

    if (!needsAdjustment) return; // Window is within bounds

    // Adjust position if corners exceed viewport boundaries
    if (left < 0) {
      left = 0; // Push right if exceeding left edge
    }
    if (left + width > vw) {
      left = Math.max(0, vw - width); // Push left if exceeding right edge
    }

    if (top < 0) {
      top = 0; // Push down if exceeding top edge
    }
    if (top + height > vh) {
      top = Math.max(0, vh - height); // Push up if exceeding bottom edge
    }

    // Adjust size if window is larger than viewport
    if (width > vw) {
      width = Math.min(width, Math.max(260, vw - 16));
    }
    if (height > vh) {
      height = Math.min(height, Math.max(180, vh - 20));
    }

    // Apply adjustments to window
    this.window.style.left = left + 'px';
    this.window.style.top = top + 'px';
    this.window.style.width = width + 'px';
    this.window.style.height = height + 'px';
    this.window.style.transform = 'none'; // Remove any centering transform
  }

  bringToFront() {
    if (!this.window) return;

    if (!window.__appZIndexCounter) {
      window.__appZIndexCounter = 900000;
    }

    window.__appZIndexCounter += 1;
    this.window.style.zIndex = window.__appZIndexCounter;
  }

    captureFrame() {
    if (!this.window) return { left: '100px', top: '80px', width: '600px', height: '500px', transform: 'none' };
    const rect = this.window.getBoundingClientRect();
    return {
      left: Math.round(rect.left) + 'px',
      top: Math.round(rect.top) + 'px',
      width: Math.round(rect.width) + 'px',
      height: Math.round(rect.height) + 'px',
      transform: 'none'
    };
  }

  applyFrame(frame, { animate = true } = {}) {
    if (!frame || !this.window) return;
    const previous = this.window.style.transition;
    if (animate) {
      this.window.style.transition = 'left 400ms cubic-bezier(0.16, 1, 0.3, 1), top 400ms cubic-bezier(0.16, 1, 0.3, 1), width 400ms cubic-bezier(0.16, 1, 0.3, 1), height 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
    }
    this.window.style.transform = frame.transform || 'none';
    this.window.style.left = frame.left;
    this.window.style.top = frame.top;
    this.window.style.width = frame.width;
    this.window.style.height = frame.height;
    if (animate) {
      setTimeout(() => {
        if (this.window) this.window.style.transition = previous;
      }, 420);
    }
  }

  getWorkAreaFrame() {
    const resizer = window.windowResizer || windowResizer;
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const rect = resizer?.getWorkAreaRect() || geomMgr?.getWorkAreaRect();
    if (rect) {
      return {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    const topBar = document.querySelector('.top-bar')?.getBoundingClientRect();
    const dock = document.querySelector('.dock-container');
    const isDockHidden = dock?.classList.contains('dock-hidden') || false;
    const dockRect = dock && !isDockHidden ? dock.getBoundingClientRect() : null;
    const margin = window.innerWidth < 480 ? 4 : 8;
    const top = Math.max(margin, (topBar ? Math.round(topBar.bottom) : 0) + margin);
    let bottom = window.innerHeight - margin;
    if (dockRect && dockRect.top > top + 100) {
      bottom = Math.round(dockRect.top - margin);
    }
    return {
      left: margin + 'px',
      top: top + 'px',
      width: Math.max(260, window.innerWidth - margin * 2) + 'px',
      height: Math.max(180, bottom - top) + 'px',
      transform: 'none'
    };
  }

  showTilingMenu() {
    this.hideTilingMenu();

    const menu = document.createElement('div');
    menu.className = 'tiling-menu macos-tiling-palette';
    menu.id = `tiling-menu-${this.appId}`;

    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const work = geomMgr?.getWorkAreaRect() || this.getWorkAreaFrame();
    const halfW = Math.floor((work.width - 8) / 2);
    const halfH = Math.floor((work.height - 8) / 2);

    const tilingOptions = [
      {
        id: 'tile-left',
        title: 'Left Half',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="12" y1="4" x2="12" y2="20"/><rect x="3" y="4" width="9" height="16" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>',
        zone: { left: work.left, top: work.top, width: halfW, height: work.height },
        action: () => this.tileLeft()
      },
      {
        id: 'tile-right',
        title: 'Right Half',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="12" y1="4" x2="12" y2="20"/><rect x="12" y="4" width="9" height="16" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>',
        zone: { left: work.left + halfW + 8, top: work.top, width: halfW, height: work.height },
        action: () => this.tileRight()
      },
      {
        id: 'tile-top',
        title: 'Top Half',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="12" x2="21" y2="12"/><rect x="3" y="4" width="18" height="8" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>',
        zone: { left: work.left, top: work.top, width: work.width, height: halfH },
        action: () => this.tileTop()
      },
      {
        id: 'tile-bottom',
        title: 'Bottom Half',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="12" x2="21" y2="12"/><rect x="3" y="12" width="18" height="8" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>',
        zone: { left: work.left, top: work.top + halfH + 8, width: work.width, height: halfH },
        action: () => this.tileBottom()
      },
      {
        id: 'tile-fill',
        title: 'Fill Screen',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3" fill="currentColor" fill-opacity="0.25"/></svg>',
        zone: work,
        action: () => this.toggleMaximize()
      }
    ];

    tilingOptions.forEach(opt => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tiling-palette-btn';
      item.innerHTML = `
        <span class="tiling-palette-icon">${opt.icon}</span>
        <span class="tiling-palette-label">${opt.title}</span>
      `;

      item.addEventListener('mouseenter', () => {
        if (geomMgr) geomMgr.showSnapPreview(opt.zone);
      });
      item.addEventListener('mouseleave', () => {
        if (geomMgr) geomMgr.hideSnapPreview();
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (geomMgr) geomMgr.hideSnapPreview();
        this.hideTilingMenu();
        opt.action();
      });

      menu.appendChild(item);
    });

    const rect = this.maximizeBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${Math.max(10, rect.left - 24)}px`;
    menu.style.zIndex = '999995';

    document.body.appendChild(menu);
    this.tilingMenu = menu;

    menu.addEventListener('mouseleave', () => {
      if (geomMgr) geomMgr.hideSnapPreview();
      setTimeout(() => this.hideTilingMenu(), 200);
    });
  }

  hideTilingMenu() {
    if (this.tilingMenu) {
      this.tilingMenu.remove();
      this.tilingMenu = null;
    }
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    if (geomMgr) geomMgr.hideSnapPreview();
  }

  tileLeft() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 80;
    const margin = 10;
    
    // Store original position
    if (this.windowState !== 'tiled-left' && this.windowState !== 'maximized') {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = (vh - topBarHeight - dockHeight - margin * 2) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-left';
    this.constrainWindowToViewport();
    this.updateAppBarIconState();
  }

  tileRight() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 80;
    const margin = 10;
    
    if (this.windowState !== 'tiled-right' && this.windowState !== 'maximized') {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = (vw / 2 + margin / 2) + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = (vh - topBarHeight - dockHeight - margin * 2) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-right';
    this.constrainWindowToViewport();
    this.updateAppBarIconState();
  }

  tileTop() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 80;
    const margin = 10;
    
    if (this.windowState !== 'tiled-top' && this.windowState !== 'maximized') {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw - margin * 2) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin * 1.5) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-top';
    this.constrainWindowToViewport();
    this.updateAppBarIconState();
  }

  tileBottom() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 80;
    const margin = 10;
    
    if (this.windowState !== 'tiled-bottom' && this.windowState !== 'maximized') {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = ((vh - topBarHeight - dockHeight) / 2 + topBarHeight + margin / 2) + 'px';
    this.window.style.width = (vw - margin * 2) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-bottom';
    this.constrainWindowToViewport();
    this.updateAppBarIconState();
  }

  tileFullscreen() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    
    let isDockHidden = false;
    const getScopedStorageKey = (baseKey) => {
      const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
      const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
      return `${baseKey}__user_${safeUserId}`;
    };
    try {
      const saved = JSON.parse(localStorage.getItem(getScopedStorageKey('settingsAppData')) || '{}');
      isDockHidden = saved['dock-auto-hide'] === true;
    } catch (e) {}
    
    const dockHeight = isDockHidden ? 0 : 80;
    const margin = 10;
    
    if (this.windowState !== 'maximized') {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw - margin * 2) + 'px';
    this.window.style.height = (vh - topBarHeight - dockHeight - margin) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'maximized';
    this.constrainWindowToViewport();
    this.updateAppBarIconState();
  }

  tileTopLeft() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    
    if (!this.windowState.includes('top-left')) {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin * 1.5) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-top-left';
    this.constrainWindowToViewport();
  }

  tileTopRight() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    
    if (!this.windowState.includes('top-right')) {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = (vw / 2 + margin / 2) + 'px';
    this.window.style.top = topBarHeight + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin * 1.5) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-top-right';
    this.constrainWindowToViewport();
  }

  tileBottomLeft() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    const topMargin = margin - 6;
    
    if (!this.windowState.includes('bottom-left')) {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = margin + 'px';
    this.window.style.top = ((vh - topBarHeight - dockHeight) / 2 + topBarHeight + topMargin / 2) + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin * 1.5) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-bottom-left';
    this.constrainWindowToViewport();
  }

  tileBottomRight() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    const topMargin = margin - 6;
    
    if (!this.windowState.includes('bottom-right')) {
      const rect = this.window.getBoundingClientRect();
      this.originalPosition = {
        top: rect.top + 'px',
        left: rect.left + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        transform: 'none'
      };
    }
    
    this.window.style.left = (vw / 2 + margin / 2) + 'px';
    this.window.style.top = ((vh - topBarHeight - dockHeight) / 2 + topBarHeight + topMargin / 2) + 'px';
    this.window.style.width = (vw / 2 - margin * 1.5) + 'px';
    this.window.style.height = ((vh - topBarHeight - dockHeight) / 2 - margin * 1.5) + 'px';
    this.window.style.transform = 'none';
    this.windowState = 'tiled-bottom-right';
    this.constrainWindowToViewport();
  }

  tileLeftRight() {
    // Smart: detect current position and toggle
    const rect = this.window.getBoundingClientRect();
    const vw = window.innerWidth;
    const windowCenterX = rect.left + rect.width / 2;
    
    if (windowCenterX < vw / 2) {
      this.tileRight();
    } else {
      this.tileLeft();
    }
  }

  tileLeftDual() {
    // Smart: detect side and show snap layout
    const rect = this.window.getBoundingClientRect();
    const vw = window.innerWidth;
    const windowCenterX = rect.left + rect.width / 2;
    
    if (windowCenterX < vw / 2) {
      this.tileRight();
    } else {
      this.tileLeft();
    }
    
    // Show dual app selector for top/bottom on the opposite side
    this.showDualAppSelector();
  }

  showDualAppSelector() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    
    // Get open apps (excluding current)
    const openApps = this.getOpenAppsExcept(this.appId);
    
    // Create container
    const container = document.createElement('div');
    container.id = `dual-selector-${this.appId}`;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9998;
      pointer-events: auto;
    `;

    // Blurred background
    const bgBlur = document.createElement('div');
    bgBlur.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(8px);
      z-index: -1;
    `;
    container.appendChild(bgBlur);

    // Determine which side current window is on
    const rect = this.window.getBoundingClientRect();
    const windowCenterX = rect.left + rect.width / 2;
    const isOnLeft = windowCenterX < vw / 2;
    
    const sideDualZones = [
      { 
        name: 'Top', 
        x: isOnLeft ? vw / 2 + margin / 2 : margin, 
        y: topBarHeight, 
        w: vw / 2 - margin * 1.5, 
        h: (vh - topBarHeight - dockHeight) / 2 - margin * 1.5,
        pos: 'top'
      },
      { 
        name: 'Bottom', 
        x: isOnLeft ? vw / 2 + margin / 2 : margin, 
        y: (vh - topBarHeight - dockHeight) / 2 + topBarHeight + margin / 2, 
        w: vw / 2 - margin * 1.5, 
        h: (vh - topBarHeight - dockHeight) / 2 - margin,
        pos: 'bottom'
      }
    ];

    sideDualZones.forEach(zone => {
      const zoneDiv = document.createElement('div');
      zoneDiv.style.cssText = `
        position: fixed;
        top: ${zone.y}px;
        left: ${zone.x}px;
        width: ${zone.w}px;
        height: ${zone.h}px;
        background: rgba(100, 180, 255, 0.1);
        border: 2px dashed rgba(100, 180, 255, 0.4);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 9999;
        gap: 10px;
        padding: 10px;
        overflow-y: auto;
      `;

      // Title
      const title = document.createElement('div');
      title.style.cssText = `
        color: rgba(0, 0, 0, 0.7);
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
      `;
      title.textContent = zone.name;
      zoneDiv.appendChild(title);

      // Open apps
      if (openApps.length > 0) {
        const appList = document.createElement('div');
        appList.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 90%;
          max-height: 60px;
          overflow-y: auto;
        `;

        openApps.forEach(app => {
          const appBtn = document.createElement('div');
          appBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(100, 150, 255, 0.3);
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            color: #333;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          appBtn.textContent = app.name;

          appBtn.addEventListener('mouseenter', () => {
            appBtn.style.background = 'rgba(100, 180, 255, 0.3)';
            appBtn.style.borderColor = 'rgba(100, 180, 255, 0.6)';
          });

          appBtn.addEventListener('mouseleave', () => {
            appBtn.style.background = 'rgba(255, 255, 255, 0.9)';
            appBtn.style.borderColor = 'rgba(100, 150, 255, 0.3)';
          });

          appBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tileAppInDualZone(app, zone.pos);
            this.closeDualSelector();
          });

          appList.appendChild(appBtn);
        });

        zoneDiv.appendChild(appList);
      }

      // Or divider
      const divider = document.createElement('div');
      divider.style.cssText = `
        color: rgba(0, 0, 0, 0.3);
        font-size: 10px;
        pointer-events: none;
      `;
      divider.textContent = openApps.length > 0 ? 'or' : '';
      zoneDiv.appendChild(divider);

      // Launch button
      const launchBtn = document.createElement('div');
      launchBtn.style.cssText = `
        background: rgba(100, 180, 255, 0.9);
        border: 1px solid rgba(100, 150, 255, 0.6);
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 11px;
        color: white;
        cursor: pointer;
        transition: all 0.15s ease;
        font-weight: 500;
      `;
      launchBtn.textContent = '+ Launch App';

      launchBtn.addEventListener('mouseenter', () => {
        launchBtn.style.background = 'rgba(100, 180, 255, 1)';
      });

      launchBtn.addEventListener('mouseleave', () => {
        launchBtn.style.background = 'rgba(100, 180, 255, 0.9)';
      });

      launchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showAppLauncherForDualZone(zone.pos);
      });

      zoneDiv.appendChild(launchBtn);

      // Hover
      zoneDiv.addEventListener('mouseenter', () => {
        zoneDiv.style.background = 'rgba(100, 180, 255, 0.15)';
        zoneDiv.style.borderColor = 'rgba(100, 180, 255, 0.6)';
      });

      zoneDiv.addEventListener('mouseleave', () => {
        zoneDiv.style.background = 'rgba(100, 180, 255, 0.1)';
        zoneDiv.style.borderColor = 'rgba(100, 180, 255, 0.4)';
      });

      container.appendChild(zoneDiv);
    });

    document.body.appendChild(container);
    this.dualSelectorContainer = container;

    // Close on escape
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeDualSelector();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  tileAppInDualZone(app, zone) {
    try {
      // Validate inputs
      if (!app || !app.id || typeof app.id !== 'string') {
        console.error('Invalid app object:', app);
        return;
      }

      const validZones = ['top', 'bottom'];
      if (!validZones.includes(zone)) {
        console.error('Invalid zone:', zone);
        return;
      }

      const appElement = document.querySelector(`[data-app-id="${app.id}"]`);
      if (!appElement) {
        console.warn(`App element not found for id: ${app.id}`);
        return;
      }

      const appWindow = appElement.closest('.app-window');
      if (!appWindow) {
        console.warn(`App window container not found for id: ${app.id}`);
        return;
      }

      if (!appWindow.__appInstance) {
        console.warn(`App instance not found on window element for id: ${app.id}`);
        return;
      }

      const instance = appWindow.__appInstance;
      
      // Get source window position with error handling
      let isOnLeft = false;
      try {
        const rect = this.window.getBoundingClientRect();
        const vw = window.innerWidth;
        const windowCenterX = rect.left + rect.width / 2;
        isOnLeft = windowCenterX < vw / 2;
      } catch (posError) {
        console.warn('Could not determine source window position, defaulting to left:', posError);
        isOnLeft = true;
      }
      
      // Tile with method validation
      try {
        if (zone === 'top') {
          if (isOnLeft && typeof instance.tileTopRight === 'function') {
            instance.tileTopRight();
          } else if (!isOnLeft && typeof instance.tileTopLeft === 'function') {
            instance.tileTopLeft();
          } else {
            console.warn('Required tiling method not available for top zone');
            return;
          }
        } else if (zone === 'bottom') {
          if (isOnLeft && typeof instance.tileBottomRight === 'function') {
            instance.tileBottomRight();
          } else if (!isOnLeft && typeof instance.tileBottomLeft === 'function') {
            instance.tileBottomLeft();
          } else {
            console.warn('Required tiling method not available for bottom zone');
            return;
          }
        }
      } catch (tilingError) {
        console.error(`Error tiling app to ${zone} zone:`, tilingError);
        return;
      }
      
      // Bring window to front with error handling
      if (typeof instance.bringToFront === 'function') {
        instance.bringToFront();
      } else {
        console.warn('bringToFront method not available on app instance');
      }
    } catch (error) {
      console.error('Unexpected error in tileAppInDualZone:', error);
    }
  }

  showAppLauncherForDualZone(zone) {
    // Use Launchpad for app selection
    this.openLaunchpadForAppSelection(zone, 'dual');
  }

  closeDualSelector() {
    if (this.dualSelectorContainer) {
      this.dualSelectorContainer.remove();
      this.dualSelectorContainer = null;
    }
  }

  tileQuadrant() {
    // Smart: cycle through quadrants based on current position
    const rect = this.window.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    
    const windowCenterX = rect.left + rect.width / 2;
    const windowCenterY = rect.top + rect.height / 2;
    const midX = vw / 2;
    const midY = (vh - topBarHeight - dockHeight) / 2 + topBarHeight;
    
    // Determine current quadrant and cycle
    if (windowCenterX < midX && windowCenterY < midY) {
      this.tileTopRight();
    } else if (windowCenterX >= midX && windowCenterY < midY) {
      this.tileBottomRight();
    } else if (windowCenterX >= midX && windowCenterY >= midY) {
      this.tileBottomLeft();
    } else {
      this.tileTopLeft();
    }
    
    // Show smart quadrant layout with app selector
    this.showQuadrantAppSelector();
  }

  showQuadrantAppSelector() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    const margin = 10;
    const quadW = vw / 2 - margin * 1.5;
    const quadH = (vh - topBarHeight - dockHeight) / 2 - margin;
    
    // Get open apps (excluding current window)
    const openApps = this.getOpenAppsExcept(this.appId);
    
    // Create container
    const container = document.createElement('div');
    container.id = `quadrant-selector-${this.appId}`;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9998;
      pointer-events: auto;
    `;

    // Blurred background
    const bgBlur = document.createElement('div');
    bgBlur.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(8px);
      z-index: -1;
    `;
    container.appendChild(bgBlur);

    // Define quadrant positions
    const quadrants = [
      { name: 'Top-Left', x: margin, y: topBarHeight, w: quadW, h: quadH, pos: 'top-left' },
      { name: 'Top-Right', x: vw / 2 + margin / 2, y: topBarHeight, w: quadW, h: quadH, pos: 'top-right' },
      { name: 'Bottom-Left', x: margin, y: (vh - topBarHeight - dockHeight) / 2 + topBarHeight + margin / 2, w: quadW, h: quadH, pos: 'bottom-left' },
      { name: 'Bottom-Right', x: vw / 2 + margin / 2, y: (vh - topBarHeight - dockHeight) / 2 + topBarHeight + margin / 2, w: quadW, h: quadH, pos: 'bottom-right' }
    ];

    quadrants.forEach((quad) => {
      if (quad.pos === this.getTilePosition()) return; // Skip current window quadrant

      const quadDiv = document.createElement('div');
      quadDiv.style.cssText = `
        position: fixed;
        top: ${quad.y}px;
        left: ${quad.x}px;
        width: ${quad.w}px;
        height: ${quad.h}px;
        background: rgba(100, 180, 255, 0.1);
        border: 2px dashed rgba(100, 180, 255, 0.4);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 9999;
        gap: 10px;
        padding: 10px;
        overflow-y: auto;
      `;

      // Title
      const title = document.createElement('div');
      title.style.cssText = `
        color: rgba(0, 0, 0, 0.7);
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
      `;
      title.textContent = quad.name;
      quadDiv.appendChild(title);

      // Apps or launch button
      if (openApps.length > 0) {
        const appList = document.createElement('div');
        appList.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 90%;
          max-height: 80px;
          overflow-y: auto;
        `;

        openApps.forEach(app => {
          const appBtn = document.createElement('div');
          appBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(100, 150, 255, 0.3);
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            color: #333;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          appBtn.textContent = app.name;

          appBtn.addEventListener('mouseenter', () => {
            appBtn.style.background = 'rgba(100, 180, 255, 0.3)';
            appBtn.style.borderColor = 'rgba(100, 180, 255, 0.6)';
          });

          appBtn.addEventListener('mouseleave', () => {
            appBtn.style.background = 'rgba(255, 255, 255, 0.9)';
            appBtn.style.borderColor = 'rgba(100, 150, 255, 0.3)';
          });

          appBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tileAppInQuadrant(app, quad.pos);
            this.closeQuadrantSelector();
          });

          appList.appendChild(appBtn);
        });

        quadDiv.appendChild(appList);
      }

      // Or divider
      const divider = document.createElement('div');
      divider.style.cssText = `
        color: rgba(0, 0, 0, 0.3);
        font-size: 10px;
        pointer-events: none;
      `;
      divider.textContent = openApps.length > 0 ? 'or' : '';
      quadDiv.appendChild(divider);

      // Launch new app
      const launchBtn = document.createElement('div');
      launchBtn.style.cssText = `
        background: rgba(100, 180, 255, 0.9);
        border: 1px solid rgba(100, 150, 255, 0.6);
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 11px;
        color: white;
        cursor: pointer;
        transition: all 0.15s ease;
        font-weight: 500;
      `;
      launchBtn.textContent = '+ Launch App';

      launchBtn.addEventListener('mouseenter', () => {
        launchBtn.style.background = 'rgba(100, 180, 255, 1)';
      });

      launchBtn.addEventListener('mouseleave', () => {
        launchBtn.style.background = 'rgba(100, 180, 255, 0.9)';
      });

      launchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showAppLauncherForQuadrant(quad.pos);
      });

      quadDiv.appendChild(launchBtn);

      // Hover effect
      quadDiv.addEventListener('mouseenter', () => {
        quadDiv.style.background = 'rgba(100, 180, 255, 0.15)';
        quadDiv.style.borderColor = 'rgba(100, 180, 255, 0.6)';
      });

      quadDiv.addEventListener('mouseleave', () => {
        quadDiv.style.background = 'rgba(100, 180, 255, 0.1)';
        quadDiv.style.borderColor = 'rgba(100, 180, 255, 0.4)';
      });

      container.appendChild(quadDiv);
    });

    document.body.appendChild(container);
    this.quadrantSelectorContainer = container;

    // Close on escape
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeQuadrantSelector();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  getOpenAppsExcept(excludeAppId) {
    const openWindows = Array.from(document.querySelectorAll('.app-window'))
      .filter(w => w.getAttribute('data-app-id') !== excludeAppId);
    
    const apps = [];
    openWindows.forEach(w => {
      const appId = w.getAttribute('data-app-id');
      const title = w.querySelector('.app-title')?.textContent || appId;
      apps.push({ id: appId, name: title });
    });
    return apps;
  }

  getTilePosition() {
    const rect = this.window.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBarHeight = 44;
    const dockHeight = 120;
    
    const windowCenterX = rect.left + rect.width / 2;
    const windowCenterY = rect.top + rect.height / 2;
    const midX = vw / 2;
    const midY = (vh - topBarHeight - dockHeight) / 2 + topBarHeight;
    
    if (windowCenterX < midX && windowCenterY < midY) return 'top-left';
    if (windowCenterX >= midX && windowCenterY < midY) return 'top-right';
    if (windowCenterX >= midX && windowCenterY >= midY) return 'bottom-right';
    return 'bottom-left';
  }

  tileAppInQuadrant(app, quadrant) {
    try {
      // Validate inputs
      if (!app || !app.id || typeof app.id !== 'string') {
        console.error('Invalid app object:', app);
        return;
      }

      const appElement = document.querySelector(`[data-app-id="${app.id}"]`);
      if (!appElement) {
        console.warn(`App element not found for id: ${app.id}`);
        return;
      }

      const appWindow = appElement.closest('.app-window');
      if (!appWindow) {
        console.warn(`App window container not found for id: ${app.id}`);
        return;
      }

      if (!appWindow.__appInstance) {
        console.warn(`App instance not found on window element for id: ${app.id}`);
        return;
      }

      const instance = appWindow.__appInstance;

      // Validate quadrant parameter
      const validQuadrants = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      if (!validQuadrants.includes(quadrant)) {
        console.error('Invalid quadrant:', quadrant);
        return;
      }
      
      // Tile the app in the specified quadrant with method validation
      try {
        if (quadrant === 'top-left' && typeof instance.tileTopLeft === 'function') {
          instance.tileTopLeft();
        } else if (quadrant === 'top-right' && typeof instance.tileTopRight === 'function') {
          instance.tileTopRight();
        } else if (quadrant === 'bottom-left' && typeof instance.tileBottomLeft === 'function') {
          instance.tileBottomLeft();
        } else if (quadrant === 'bottom-right' && typeof instance.tileBottomRight === 'function') {
          instance.tileBottomRight();
        } else {
          console.warn(`Tiling method not available for quadrant: ${quadrant}`);
          return;
        }
      } catch (tilingError) {
        console.error(`Error tiling app to quadrant ${quadrant}:`, tilingError);
        return;
      }
      
      // Bring window to front with error handling
      if (typeof instance.bringToFront === 'function') {
        instance.bringToFront();
      } else {
        console.warn('bringToFront method not available on app instance');
      }
    } catch (error) {
      console.error('Unexpected error in tileAppInQuadrant:', error);
    }
  }

  showAppLauncherForQuadrant(quadrant) {
    // Use Launchpad for app selection
    this.openLaunchpadForAppSelection(quadrant, 'quadrant');
  }

  openLaunchpadForAppSelection(target, mode) {
    // Validate inputs
    if (!target || !mode) {
      console.error('Invalid selection parameters:', { target, mode });
      return;
    }
    
    if (!['quadrant', 'dual'].includes(mode)) {
      console.error('Invalid mode:', mode);
      return;
    }

    const self = this;
    const sourceWindowId = this.appId;
    
    // Set up selection context for Launchpad to use
    window.launchpadSelectionContext = {
      enabled: true,
      mode: mode,  // 'quadrant' or 'dual'
      target: target,  // which quadrant/zone
      sourceWindowId: sourceWindowId,
      callback: function(appId) {
        try {
          // Validate appId
          if (!appId || typeof appId !== 'string') {
            console.error('Invalid appId received:', appId);
            return;
          }

          // Find the newly opened app window
          const appElement = document.querySelector(`[data-app-id="${appId}"]`);
          if (!appElement) {
            console.warn(`App window not found for id: ${appId}`);
            return;
          }

          const appWindow = appElement.__appInstance;
          if (!appWindow) {
            console.warn(`App instance not found for id: ${appId}`);
            return;
          }

          // Validate that tiling methods exist before calling
          const requiredMethods = mode === 'quadrant' ? 
            ['tileTopLeft', 'tileTopRight', 'tileBottomLeft', 'tileBottomRight'] :
            ['tileTopLeft', 'tileTopRight', 'tileBottomLeft', 'tileBottomRight'];

          const missingMethods = requiredMethods.filter(m => typeof appWindow[m] !== 'function');
          if (missingMethods.length > 0) {
            console.error(`Missing tiling methods on app:`, missingMethods);
            return;
          }

          try {
            if (mode === 'quadrant') {
              // Tile the app in the specified quadrant
              switch(target) {
                case 'top-left':
                  appWindow.tileTopLeft();
                  break;
                case 'top-right':
                  appWindow.tileTopRight();
                  break;
                case 'bottom-left':
                  appWindow.tileBottomLeft();
                  break;
                case 'bottom-right':
                  appWindow.tileBottomRight();
                  break;
                default:
                  console.warn('Unknown quadrant target:', target);
              }
            } else if (mode === 'dual') {
              // Tile the app in the specified dual zone
              const sourceWindow = document.querySelector(`[data-app-id="${sourceWindowId}"]`);
              if (!sourceWindow) {
                console.warn(`Source window not found for id: ${sourceWindowId}`);
                return;
              }

              const sourceRect = sourceWindow.getBoundingClientRect();
              const vw = window.innerWidth;
              const windowCenterX = sourceRect.left + sourceRect.width / 2;
              const isOnLeft = windowCenterX < vw / 2;
              
              if (target === 'top') {
                isOnLeft ? appWindow.tileTopRight() : appWindow.tileTopLeft();
              } else if (target === 'bottom') {
                isOnLeft ? appWindow.tileBottomRight() : appWindow.tileBottomLeft();
              } else {
                console.warn('Unknown dual zone target:', target);
              }
            }
          } catch (tilingError) {
            console.error('Error during app tiling:', tilingError);
          }

          // Close the selectors (gracefully, with checks)
          if (typeof self.closeQuadrantSelector === 'function') {
            self.closeQuadrantSelector();
          }
          if (typeof self.closeDualSelector === 'function') {
            self.closeDualSelector();
          }
        } catch (error) {
          console.error('Unexpected error in selection callback:', error);
        }
      }
    };
    
    // Find and focus the Launchpad app
    const launchpadWindow = document.querySelector('[data-app-id="launchpad"]');
    try {
      if (launchpadWindow && launchpadWindow.__appInstance) {
        const launchpadAppWindow = launchpadWindow.__appInstance;
        
        // Verify methods exist before calling
        if (typeof launchpadAppWindow.restore === 'function') {
          launchpadAppWindow.restore();
        }
        if (typeof launchpadAppWindow.bringToFront === 'function') {
          launchpadAppWindow.bringToFront();
        } else {
          console.warn('Launchpad window missing bringToFront method');
        }
        
        // Force Launchpad to a very high z-index for selection mode
        // Use 950000 to be above all regular apps (capped at 899999) but below dock (1000000)
        launchpadWindow.style.zIndex = '950000';
      } else {
        // Launchpad not open, launch it
        const launchpadApp = window.availableAppsForLaunchpad?.find(a => a.id === 'launchpad');
        if (launchpadApp && typeof launchpadApp.action === 'function') {
          launchpadApp.action();
          
          // Wait for Launchpad to open, then bring to front and set z-index
          setTimeout(() => {
            const launchpadWindow = document.querySelector('[data-app-id="launchpad"]');
            if (launchpadWindow && launchpadWindow.__appInstance) {
              const launchpadAppWindow = launchpadWindow.__appInstance;
              if (typeof launchpadAppWindow.bringToFront === 'function') {
                launchpadAppWindow.bringToFront();
              }
              // Force very high z-index for selection mode
              launchpadWindow.style.zIndex = '950000';
            } else {
              console.warn('Launchpad failed to open within timeout period');
            }
          }, 500);
        } else {
          console.error('Launchpad app not found or missing action method');
        }
      }
    } catch (error) {
      console.error('Error while opening/focusing Launchpad:', error);
    }
  }

  closeQuadrantSelector() {
    if (this.quadrantSelectorContainer) {
      this.quadrantSelectorContainer.remove();
      this.quadrantSelectorContainer = null;
    }
  }
  createSnapLayoutOverlay(type, startX, startY, width, height) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    // Create container for snap layout zones
    const container = document.createElement('div');
    container.id = `snap-layout-${this.appId}`;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9998;
      pointer-events: auto;
    `;

    // Create blurred background
    const bgBlur = document.createElement('div');
    bgBlur.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(5px);
      z-index: -1;
    `;
    container.appendChild(bgBlur);

    // Create selectable zones based on type
    const zones = [];
    if (type === 'right') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: vh, 
        label: 'Select App for Right' 
      });
    } else if (type === 'rightDual') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: vh / 2, 
        label: 'Select App for Top-Right' 
      });
      zones.push({ 
        x: vw / 2, y: vh / 2, 
        w: vw / 2, h: vh / 2, 
        label: 'Select App for Bottom-Right' 
      });
    } else if (type === 'quadrant') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: vh / 2, 
        label: 'Top-Right' 
      });
      zones.push({ 
        x: 0, y: vh / 2, 
        w: vw / 2, h: vh / 2, 
        label: 'Bottom-Left' 
      });
      zones.push({ 
        x: vw / 2, y: vh / 2, 
        w: vw / 2, h: vh / 2, 
        label: 'Bottom-Right' 
      });
    }

    // Create zone overlays
    zones.forEach((zone, index) => {
      const zoneDiv = document.createElement('div');
      zoneDiv.style.cssText = `
        position: fixed;
        top: ${zone.y}px;
        left: ${zone.x}px;
        width: ${zone.w}px;
        height: ${zone.h}px;
        background: rgba(100, 150, 255, 0.15);
        border: 2px dashed rgba(100, 150, 255, 0.5);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 9999;
      `;
      
      const label = document.createElement('div');
      label.style.cssText = `
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        pointer-events: none;
      `;
      label.textContent = zone.label;
      zoneDiv.appendChild(label);

      // Highlight on hover
      zoneDiv.addEventListener('mouseenter', () => {
        zoneDiv.style.background = 'rgba(100, 150, 255, 0.25)';
        zoneDiv.style.borderColor = 'rgba(100, 150, 255, 0.8)';
      });

      zoneDiv.addEventListener('mouseleave', () => {
        zoneDiv.style.background = 'rgba(100, 150, 255, 0.15)';
        zoneDiv.style.borderColor = 'rgba(100, 150, 255, 0.5)';
      });

      // Click to show app selector
      zoneDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showAppSelectorForZone(zone, index, type);
      });

      container.appendChild(zoneDiv);
    });

    document.body.appendChild(container);
    this.snapLayoutContainer = container;

    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeSnapLayout();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  createSnapLayoutOverlay(type, startX, startY, width, height) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dockContainer = document.querySelector('.dock-container');
    const dockHeight = dockContainer ? dockContainer.offsetHeight : 90;
    const availableHeight = vh - dockHeight;
    
    // Create container for snap layout zones
    const container = document.createElement('div');
    container.id = `snap-layout-${this.appId}`;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9998;
      pointer-events: auto;
    `;

    // Create blurred background
    const bgBlur = document.createElement('div');
    bgBlur.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(5px);
      z-index: -1;
    `;
    container.appendChild(bgBlur);

    // Create selectable zones based on type
    const zones = [];
    if (type === 'right') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: availableHeight, 
        label: 'Select App for Right' 
      });
    } else if (type === 'rightDual') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: availableHeight / 2, 
        label: 'Select App for Top-Right' 
      });
      zones.push({ 
        x: vw / 2, y: availableHeight / 2, 
        w: vw / 2, h: availableHeight / 2, 
        label: 'Select App for Bottom-Right' 
      });
    } else if (type === 'quadrant') {
      zones.push({ 
        x: vw / 2, y: 0, 
        w: vw / 2, h: availableHeight / 2, 
        label: 'Top-Right' 
      });
      zones.push({ 
        x: 0, y: availableHeight / 2, 
        w: vw / 2, h: availableHeight / 2, 
        label: 'Bottom-Left' 
      });
      zones.push({ 
        x: vw / 2, y: availableHeight / 2, 
        w: vw / 2, h: availableHeight / 2, 
        label: 'Bottom-Right' 
      });
    }

    // Create zone overlays
    zones.forEach((zone, index) => {
      const zoneDiv = document.createElement('div');
      zoneDiv.style.cssText = `
        position: fixed;
        top: ${zone.y}px;
        left: ${zone.x}px;
        width: ${zone.w}px;
        height: ${zone.h}px;
        background: rgba(100, 150, 255, 0.15);
        border: 2px dashed rgba(100, 150, 255, 0.5);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 9999;
      `;
      
      const label = document.createElement('div');
      label.style.cssText = `
        color: rgba(0, 0, 0, 0.6);
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        pointer-events: none;
      `;
      label.textContent = zone.label;
      zoneDiv.appendChild(label);

      // Highlight on hover
      zoneDiv.addEventListener('mouseenter', () => {
        zoneDiv.style.background = 'rgba(100, 150, 255, 0.25)';
        zoneDiv.style.borderColor = 'rgba(100, 150, 255, 0.8)';
      });

      zoneDiv.addEventListener('mouseleave', () => {
        zoneDiv.style.background = 'rgba(100, 150, 255, 0.15)';
        zoneDiv.style.borderColor = 'rgba(100, 150, 255, 0.5)';
      });

      // Click to show launchpad for app selection
      zoneDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showLaunchpadForZone(zone, index, type);
      });

      container.appendChild(zoneDiv);
    });

    document.body.appendChild(container);
    this.snapLayoutContainer = container;

    // Close on escape key
    const closeHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeSnapLayout();
        document.removeEventListener('keydown', closeHandler);
      }
    };
    document.addEventListener('keydown', closeHandler);
  }

  showLaunchpadForZone(zone, zoneIndex, layoutType) {
    // Find and click the launchpad button to open it
    const launchpadButton = document.querySelector('[data-app-id="launchpad"]')?.closest('.dock-icon') || 
                            Array.from(document.querySelectorAll('.dock-icon')).find(el => 
                              el.textContent.includes('≡') || el.querySelector('[alt*="Launchpad"]')
                            );
    
    if (launchpadButton) {
      // Click launchpad to open it
      launchpadButton.click();
      
      // Wait a moment for launchpad to open
      setTimeout(() => {
        const appItems = document.querySelectorAll('[data-app-name]');
        
        if (appItems.length === 0) {
          console.warn('No app items found in launchpad with data-app-name');
          return;
        }

        // Listen for app selection from launchpad
        const selectHandler = (e) => {
          const appItem = e.target.closest('[data-app-name]');
          if (!appItem) return;

          const appName = appItem.dataset.appName;
          if (appName) {
            console.debug(`Selected ${appName} for zone ${zoneIndex + 1}`);
            
            // Close launchpad first
            const launchpadWindow = document.querySelector('[data-app-id="launchpad"]');
            if (launchpadWindow) {
              const closeBtn = launchpadWindow.querySelector('.traffic-light.close');
              if (closeBtn) closeBtn.click();
            }
            
            // Wait for launchpad to close, then tile the app
            setTimeout(() => {
              this.tileAppToZone(zone, appName);
              this.closeSnapLayout();
            }, 200);
          }

          // Clean up listener
          appItems.forEach(item => item.removeEventListener('click', selectHandler));
        };

        appItems.forEach(item => {
          item.addEventListener('click', selectHandler);
        });
      }, 300);
    }
  }

  tileAppToZone(zone, appNameOrId) {
    // Find the app window with the given name/id
    const appWindows = document.querySelectorAll('.app-window');
    let targetApp = null;

    appWindows.forEach(appWindow => {
      const title = appWindow.querySelector('.app-title');
      const appId = appWindow.dataset.appId;
      
      if (title && (title.textContent.includes(appNameOrId) || appNameOrId.includes(title.textContent))) {
        targetApp = appWindow;
      } else if (appId && (appId === appNameOrId || appNameOrId.includes(appId))) {
        targetApp = appWindow;
      }
    });

    if (targetApp) {
      // Position window to fill the zone
      targetApp.style.left = zone.x + 'px';
      targetApp.style.top = zone.y + 'px';
      targetApp.style.width = zone.w + 'px';
      targetApp.style.height = zone.h + 'px';
      
      // Remove min-width and min-height to allow smaller windows
      targetApp.style.minWidth = '0';
      targetApp.style.minHeight = '0';

      // Bring to front
      const allWindows = document.querySelectorAll('.app-window');
      const maxZ = Math.max(...Array.from(allWindows).map(w => parseInt(window.getComputedStyle(w).zIndex) || 0));
      targetApp.style.zIndex = (maxZ + 1).toString();

      console.debug(`Tiled ${appNameOrId} to zone at (${zone.x}, ${zone.y})`);
    } else {
      console.debug(`App ${appNameOrId} not found`);
    }
  }

  closeSnapLayout() {
    if (this.snapLayoutContainer) {
      this.snapLayoutContainer.remove();
      this.snapLayoutContainer = null;
    }
    
    // Reset dock
    const dockContainer = document.querySelector('.dock-container');
    if (dockContainer) {
      dockContainer.style.zIndex = '';
      dockContainer.style.pointerEvents = '';
      dockContainer.style.background = '';
      dockContainer.style.border = '';
      dockContainer.style.borderRadius = '';
    }
  }

  minimize() {
    if (this.isAnimating) return;
    if (this.windowState === 'minimized') {
      this.restore();
      return;
    }

    this.isAnimating = true;
    this.minimizedFromState = this.windowState;
    this.minimizedFrame = this.captureFrame();

    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const dockTarget = geomMgr?.getDockIconRect(this.appId) || {
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight - 32
    };

    const curRect = this.window.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;
    const curCenterY = curRect.top + curRect.height / 2;

    const dx = Math.round(dockTarget.centerX - curCenterX);
    const dy = Math.round(dockTarget.centerY - curCenterY);

    this.window.style.pointerEvents = 'none';
    this.window.style.transformOrigin = 'center center';

    const anim = this.window.animate([
      {
        transform: 'translate3d(0px, 0px, 0) scale(1)',
        opacity: 1,
        filter: 'blur(0px)'
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.05)`,
        opacity: 0,
        filter: 'blur(1.5px)'
      }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
      fill: 'forwards'
    });

    this.windowState = 'minimized';
    if (geomMgr) {
      geomMgr.setState(this.appId, 'minimized');
    }
    this.updateAppBarIconState();
    this.callbacks.onMinimize?.();

    anim.onfinish = () => {
      if (this.window && this.windowState === 'minimized') {
        this.window.style.display = 'none';
        this.window.style.transform = 'none';
        this.window.style.filter = 'none';
        anim.cancel();
      }
      this.isAnimating = false;
    };
  }

  restore() {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const targetState = this.minimizedFromState === 'minimized' ? 'normal' : this.minimizedFromState;
    this.windowState = targetState;

    const resizer = window.windowResizer || windowResizer;
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    const dockTarget = geomMgr?.getDockIconRect(this.appId) || {
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight - 32
    };

    let restoreFrame = this.minimizedFrame || this.restoreFrame || this.captureFrame();
    if (targetState === 'maximized') {
      const wa = resizer?.getWorkAreaRect() || geomMgr?.getWorkAreaRect() || this.getWorkAreaFrame();
      restoreFrame = {
        left: typeof wa.left === 'number' ? `${wa.left}px` : wa.left,
        top: typeof wa.top === 'number' ? `${wa.top}px` : wa.top,
        width: typeof wa.width === 'number' ? `${wa.width}px` : wa.width,
        height: typeof wa.height === 'number' ? `${wa.height}px` : wa.height,
        transform: 'none'
      };
    }

    this.applyFrame(restoreFrame, { animate: false });
    this.window.style.display = 'flex';
    this.window.style.pointerEvents = 'none';
    this.window.style.transformOrigin = 'center center';

    const curRect = this.window.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;
    const curCenterY = curRect.top + curRect.height / 2;
    const dx = Math.round(dockTarget.centerX - curCenterX);
    const dy = Math.round(dockTarget.centerY - curCenterY);

    if (geomMgr) {
      geomMgr.setState(this.appId, targetState);
      geomMgr.bringToFront(this.appId);
    }
    this.updateAppBarIconState();
    this.callbacks.onOpen?.();

    // Symmetrical, gradual, fluid scale up from dock icon to desktop
    const anim = this.window.animate([
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.05)`,
        opacity: 0,
        filter: 'blur(2px)'
      },
      {
        transform: 'translate3d(0px, 0px, 0) scale(1)',
        opacity: 1,
        filter: 'blur(0px)'
      }
    ], {
      duration: 440,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards'
    });

    anim.onfinish = () => {
      if (this.window) {
        this.window.style.transform = 'none';
        this.window.style.opacity = '1';
        this.window.style.filter = 'none';
        this.window.style.pointerEvents = 'auto';
        anim.cancel();
      }
      this.isAnimating = false;
    };
  }

  toggleMaximize() {
    const resizer = window.windowResizer || windowResizer;
    const geomMgr = window.windowGeometryManager || windowGeometryManager;
    if (this.windowState === 'maximized') {
      this.windowState = 'normal';
      this.isManuallyResized = true;
      resizer?.notifyRestore(this);
      const frameToRestore = this.restoreFrame || this.captureFrame();
      this.applyFrame(frameToRestore, { animate: true });
      if (geomMgr) geomMgr.setState(this.appId, 'normal');
      this.updateAppBarIconState();
    } else {
      this.restoreFrame = this.captureFrame();
      this.windowState = 'maximized';
      this.isManuallyResized = false;
      resizer?.notifyMaximize(this);
      const workArea = resizer?.getWorkAreaRect() || geomMgr?.getWorkAreaRect() || this.getWorkAreaFrame();
      const leftStr = typeof workArea.left === 'number' ? `${workArea.left}px` : workArea.left;
      const topStr = typeof workArea.top === 'number' ? `${workArea.top}px` : workArea.top;
      const widthStr = typeof workArea.width === 'number' ? `${workArea.width}px` : workArea.width;
      const heightStr = typeof workArea.height === 'number' ? `${workArea.height}px` : workArea.height;
      this.applyFrame({
        left: leftStr,
        top: topStr,
        width: widthStr,
        height: heightStr,
        transform: 'none'
      }, { animate: true });
      if (geomMgr) geomMgr.setState(this.appId, 'maximized');
      this.updateAppBarIconState();
    }
  }

  close() {
    const container = document.getElementById(this.containerId);
    if (container) {
      this.windowState = 'closed';

      if (this._handleViewportResizeBound) {
        window.removeEventListener('resize', this._handleViewportResizeBound);
        document.removeEventListener('fullscreenchange', this._handleViewportResizeBound);
        document.removeEventListener('webkitfullscreenchange', this._handleViewportResizeBound);
        if (window.screen?.orientation) {
          window.screen.orientation.removeEventListener('change', this._handleViewportResizeBound);
        }
      }

      const resizer = window.windowResizer || windowResizer;
      if (resizer) {
        resizer.unregister(this);
      }

      const geomMgr = window.windowGeometryManager || windowGeometryManager;
      if (geomMgr) {
        geomMgr.setState(this.appId, 'closed');
        geomMgr.unregisterWindow(this.appId);
      }
      
      if (typeof this.stopCamera === 'function') {
        try { this.stopCamera(); } catch(e) {}
      }

      const camelAppId = this.appId.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase());
      if (window[`current${camelAppId}App`] === this) delete window[`current${camelAppId}App`];
      if (window[`current${this.constructor.name}`] === this) delete window[`current${this.constructor.name}`];
      if (window[`${this.appId}Instance`] === this) delete window[`${this.appId}Instance`];
      if (this.appId === 'products' || this.appId === 'product-list') {
        if (window.currentProductApp === this) delete window.currentProductApp;
        if (window.currentProductListApp === this) delete window.currentProductListApp;
        if (window.currentProductsApp === this) delete window.currentProductsApp;
        if (window.productsInstance === this) delete window.productsInstance;
      }
      if (window.currentAIVisionApp === this) delete window.currentAIVisionApp;
      if (window.currentAiVisionApp === this) delete window.currentAiVisionApp;
      if (window.currentCalculatorApp === this) delete window.currentCalculatorApp;
      if (window.currentNotesApp === this) delete window.currentNotesApp;

      this.updateAppBarIconState();
      this.callbacks.onClose?.();
      
      if (this.window) {
        this.window.style.animation = 'minimizeToDock 0.35s ease-in forwards';
      }
      
      setTimeout(() => {
        if (container) {
          container.innerHTML = '';
        }
      }, 360);
    }
  }

  updateAppBarIconState() {
    if (this.window) {
      this.window.classList.toggle('maximized', this.windowState === 'maximized');
      this.window.dataset.windowState = this.windowState;
    }
    const icons = this.findAllAppBarIcons();
    icons.forEach(icon => {
      if (this.windowState === 'minimized') {
        icon.classList.add('active', 'minimized');
      } else if (this.windowState === 'normal' || this.windowState === 'maximized') {
        icon.classList.add('active');
        icon.classList.remove('minimized');
      } else if (this.windowState === 'closed') {
        icon.classList.remove('active', 'minimized');
      }
    });
  }

  // Methods for subclasses to override or use
  setWindowDimensions(width, height) {
    this.initialWidth = width;
    this.initialHeight = height;
    this.window.style.width = width + 'px';
    this.window.style.height = height + 'px';
  }

  getContentArea() {
    return this.contentArea;
  }

  setContent(html) {
    if (this.contentArea) {
      this.contentArea.innerHTML = html;
    }
  }

  setTitle(title) {
    const titleElement = this.window.querySelector('.app-title');
    if (titleElement) titleElement.textContent = title;
  }

  /**
   * Universal App Launcher
   * Standardizes instantiating, restoring, bringing-to-front, and lifecycle tracking for any app.
   */
  static launchApp(appId, AppClass, containerId, options = {}) {
    if (typeof AppClass === 'undefined') {
      console.error(`App launch error: ${appId} class is not defined.`);
      alert(`${appId} is not ready. Please refresh the page.`);
      return null;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container #${containerId} not found for app ${appId}`);
      return null;
    }

    const stateSetter = options.setAppState || window.setAppState || (() => {});
    const recentKey = options.recentAppKey || 'recentAppUsed';
    const className = AppClass.name || '';
    const camelAppId = appId.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase());

    const getExistingInstance = () => {
      let inst = (className && window[`current${className}`]) ||
             window[`current${camelAppId}App`] ||
             window[`current${appId.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toUpperCase())}App`] ||
             window[`${appId}Instance`];
      if (!inst && (appId === 'products' || appId === 'product-list')) {
        inst = window.currentProductApp || window.currentProductListApp || window.currentProductsApp || window.productsInstance;
      }
      if (!inst && (appId === 'ai-vision' || appId === 'aivision')) {
        inst = window.currentAIVisionApp || window.currentAiVisionApp;
      }
      return inst;
    };

    let instance = getExistingInstance();
    const hasLiveWindow = container.querySelector('.app-window') !== null;

    // If an instance exists but is marked closed, or if container has stale HTML without a live window, wipe cleanly
    if (!hasLiveWindow || (instance && instance.windowState === 'closed')) {
      container.innerHTML = '';
      instance = null;
    }

    if (container.innerHTML === '' || !instance) {
      container.innerHTML = '';
      try {
        const callbacks = {
          onOpen: () => stateSetter(appId, 'open'),
          onMinimize: () => stateSetter(appId, 'minimized'),
          onClose: () => stateSetter(appId, 'closed'),
          ...options.callbacks
        };

        const newInstance = new AppClass(containerId, callbacks, options.params);
        if (className) window[`current${className}`] = newInstance;
        window[`current${camelAppId}App`] = newInstance;
        window[`${appId}Instance`] = newInstance;
        if (appId === 'products' || appId === 'product-list') {
          window.currentProductApp = newInstance;
          window.currentProductListApp = newInstance;
          window.currentProductsApp = newInstance;
          window.productsInstance = newInstance;
        }
        stateSetter(appId, 'open');
        if (recentKey) localStorage.setItem(recentKey, appId);
        return newInstance;
      } catch (e) {
        console.error(`Failed to instantiate ${appId}:`, e);
        return null;
      }
    } else {
      if (instance && instance.windowState !== 'closed') {
        if (instance.windowState === 'minimized') {
          instance.restore();
        } else {
          stateSetter(appId, 'open');
          instance.bringToFront();
          if (options.params && typeof instance.handleDeepLink === 'function') {
            instance.handleDeepLink(options.params);
          }
        }
      } else {
        container.innerHTML = '';
        return AppWindow.launchApp(appId, AppClass, containerId, options);
      }
      if (recentKey) localStorage.setItem(recentKey, appId);
      return instance;
    }
  }
}

// Expose all consolidated window engine components globally
if (typeof window !== 'undefined') {
  window.WindowGeometryManager = WindowGeometryManager;
  window.windowGeometryManager = windowGeometryManager;
  window.WindowResizer = WindowResizer;
  window.windowResizer = windowResizer;
  window.AppWindow = AppWindow;
}

export {
  WindowGeometryManager,
  windowGeometryManager,
  WindowResizer,
  windowResizer,
  AppWindow
};
export default AppWindow;
