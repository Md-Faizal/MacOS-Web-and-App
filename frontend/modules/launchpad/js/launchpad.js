// Launchpad App Class
console.log('[LaunchpadApp] ===== MODULE START =====');
console.log('[LaunchpadApp] AppWindow available?', typeof AppWindow);
console.log('[LaunchpadApp] document available?', typeof document);

try {
  console.log('[LaunchpadApp] Module loading...');

  class LaunchpadApp {
    constructor(containerId, options = {}) {
      this.containerId = containerId;
      this.options = options;
      this.windowState = 'closed';
      this.init();
    }

  getResponsiveSize() {
    const width = window.innerWidth;
    if (width < 768) {
      return { width: '95vw', height: '85vh', left: 'calc(50% - 47.5vw)', top: 'calc(50% - 42.5vh)' };
    } else if (width < 1024) {
      return { width: '550px', height: '500px', left: 'calc(50% - 275px)', top: 'calc(50% - 250px)' };
    } else {
      return { width: '600px', height: '500px', left: 'calc(50% - 300px)', top: 'calc(50% - 250px)' };
    }
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const width = window.innerWidth;
    let sizes;
    
    if (width < 768) {
      sizes = AppWindow.calculateMobileSizing();
    } else if (width < 1024) {
      sizes = { width: '550px', height: '500px' };
    } else {
      sizes = { width: '600px', height: '500px' };
    }

    // Create app window using AppWindow framework
    this.appWindow = new AppWindow({
      appName: 'Applications',
      icon: '≡',
      width: sizes.width,
      height: sizes.height,
      minWidth: '500px',
      minHeight: '400px',
      resizable: true,
      containerId: this.containerId,
      appId: 'launchpad',
      callbacks: {
        onClose: () => this.handleClose(),
        onMinimize: () => this.handleMinimize(),
        onMaximize: () => this.handleMaximize()
      }
    });

    this.createLaunchpadContent();
    this.windowState = 'open';
    
    // Store reference for global access
    window.currentLaunchpadApp = this;
    
    if (this.options.onOpen) {
      this.options.onOpen();
    }
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container?.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'launchpad-header-search';
    searchInput.id = 'launchpadSearch';
    searchInput.placeholder = 'Search Apps';
    
    // Add search input to the spacer area (right corner)
    const spacer = titleBar.querySelector('.title-spacer');
    if (spacer) {
      spacer.appendChild(searchInput);
    }
    
    // Store search input reference
    this.searchInput = searchInput;
  }

  createLaunchpadContent() {
    const content = this.appWindow.getContentArea();
    
    // Get apps from dock
    const availableApps = window.availableAppsForLaunchpad || [];
    
    // Organize apps by category
    const categoryOrder = ['productivity', 'utilities', 'system'];
    const appsByCategory = {
      productivity: [],
      utilities: [],
      system: []
    };
    
    // Sort apps into categories
    availableApps.forEach(app => {
      const category = app.category || 'utilities';
      if (!appsByCategory[category]) {
        appsByCategory[category] = [];
      }
      appsByCategory[category].push(app);
    });
    
    const launchpadHTML = `
      <div class="launchpad-content-wrapper">
        ${categoryOrder.map(category => {
          const apps = appsByCategory[category] || [];
          if (apps.length === 0) return '';
          
          const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
          return `
            <!-- ${categoryName} Section -->
            <div class="launchpad-section">
              <div class="section-header">
                <span class="section-title">${categoryName}</span>
              </div>
              <div class="apps-grid ${category}-grid">
                ${apps.map(app => `
                  <div class="app-item draggable-app" data-app-id="${app.id}" draggable="true">
                    <div class="app-icon" style="background: linear-gradient(135deg, ${app.color} 0%, ${this.adjustColor(app.color, -20)} 100%);">
                      ${this.renderAppIcon(app)}
                    </div>
                    <span class="app-name">${app.name}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    content.innerHTML = launchpadHTML;
    
    // Render canvas-based icons (e.g., calendar)
    requestAnimationFrame(() => {
      const canvasElements = content.querySelectorAll('canvas[id^="launchpad-icon-canvas-"]');
      canvasElements.forEach(canvas => {
        if (typeof generateUltimateMacIcon === 'function') {
          generateUltimateMacIcon(canvas.id);
        }
      });
    });
    
    // Setup header BEFORE event listeners so searchInput exists
    this.setupHeaderControls();
    
    this.setupEventListeners();
  }

  adjustColor(color, percent) {
    // Simple color adjustment for gradients
    return color;
  }

  filterAppsBySearch(query) {
    const appItems = document.querySelectorAll('.app-item');
    const sections = document.querySelectorAll('.launchpad-section');
    
    appItems.forEach(item => {
      const appName = item.querySelector('.app-name')?.textContent.toLowerCase() || '';
      const matches = appName.includes(query);
      item.style.display = matches || query === '' ? 'flex' : 'none';
    });

    // Hide empty sections
    sections.forEach(section => {
      const visibleItems = section.querySelectorAll('.app-item:not([style*="display: none"])').length;
      section.style.display = visibleItems > 0 ? 'block' : 'none';
    });
  }

  renderAppIcon(app) {
    // Check if this app uses a canvas-based icon
    if (app.useCanvasIcon) {
      const canvasId = `launchpad-icon-canvas-${app.id}-${Date.now()}`;
      return `<canvas id="${canvasId}" width="96" height="96" style="width: 100%; height: 100%; display: block; pointer-events: none; touch-action: none;"></canvas>`;
    }
    
    // Check if icon is a file path (starts with '/', './', '../', or 'http')
    if (app.icon && typeof app.icon === 'string' && (app.icon.startsWith('/') || app.icon.startsWith('../') || app.icon.startsWith('./') || app.icon.startsWith('http'))) {
      // Render as image
      return `<img src="${app.icon}" alt="${app.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
      // Render as emoji/text
      return `<span class="app-icon-text">${app.icon || '📱'}</span>`;
    }
  }

  setupEventListeners() {
    // Setup search functionality
    this.searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.filterAppsBySearch(query);
    });

    const appItems = document.querySelectorAll('.app-item');
    const availableApps = window.availableAppsForLaunchpad || [];
    
    console.log('Launchpad: Setting up event listeners for', appItems.length, 'items');
    
    appItems.forEach((item, index) => {
      item.addEventListener('click', (e) => this.handleAppClick(e));
      
      // Prevent context menu on long-press (mobile/tablet)
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
      
      // Drag and drop for draggable apps
      if (item.classList.contains('draggable-app')) {
        const appId = item.getAttribute('data-app-id');
        console.log(`Launchpad: Attaching drag listeners to item ${index}:`, appId);
        item.addEventListener('dragstart', (e) => this.handleDragStart(e));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));
        // Touch support: allow touch-drag from launchpad to desktop
        let lpTouch = { timer: null, active: false, ghost: null };
        item.addEventListener('touchstart', (e) => {
          if (!e.touches || e.touches.length !== 1) return;
          const t = e.touches[0];
          lpTouch.timer = setTimeout(() => {
            lpTouch.active = true;
            item.style.opacity = '0.5';
            const ghost = item.cloneNode(true);
            ghost.style.position = 'fixed';
            ghost.style.left = (t.clientX - 40) + 'px';
            ghost.style.top = (t.clientY - 50) + 'px';
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.85';
            document.body.appendChild(ghost);
            lpTouch.ghost = ghost;
          }, 180);
        }, {passive: true});

        item.addEventListener('touchmove', (e) => {
          if (!lpTouch.active) return;
          e.preventDefault();
          const t = e.touches[0];
          if (lpTouch.ghost) {
            lpTouch.ghost.style.left = (t.clientX - 40) + 'px';
            lpTouch.ghost.style.top = (t.clientY - 50) + 'px';
          }
        }, {passive: false});

        item.addEventListener('touchend', (e) => {
          clearTimeout(lpTouch.timer);
          if (!lpTouch.active) return;
          lpTouch.active = false;
          item.style.opacity = '';
          const last = e.changedTouches && e.changedTouches[0];
          if (lpTouch.ghost) {
            const desktop = document.getElementById('desktopArea');
            if (desktop) {
              const rect = desktop.getBoundingClientRect();
              if (last.clientX >= rect.left && last.clientX <= rect.right && last.clientY >= rect.top && last.clientY <= rect.bottom) {
                const appId = item.getAttribute('data-app-id');
                const appObj = window.availableAppsForLaunchpad?.find(a => a.id === appId);
                if (window.desktopManager && appObj) {
                  const dragPayload = { source: 'launchpad', appId: appId, appName: appObj.name };
                  const syntheticEvent = { clientX: last.clientX, clientY: last.clientY };
                  try { window.desktopManager.processDroppedApp(dragPayload, syntheticEvent); } catch (err) { console.error('desktopManager.processDroppedApp error', err); }
                }
              }
            }
            lpTouch.ghost.remove();
            lpTouch.ghost = null;
          }
        });
      }
    });
  }

  handleDragStart(event) {
    const appId = event.currentTarget.getAttribute('data-app-id');
    const app = window.availableAppsForLaunchpad?.find(a => a.id === appId);
    
    if (!app) {
      console.warn('Launchpad: App not found for ID:', appId);
      return;
    }
    
    console.log('✓ Launchpad drag start:', app.name);
    
    // Set drag data with app info
    event.dataTransfer.effectAllowed = 'copyMove';
    const dragPayload = JSON.stringify({
      source: 'launchpad',
      appId: appId,
      appName: app.name
    });
    event.dataTransfer.setData('text/plain', dragPayload);
    console.log('✓ Launchpad setting drag data:', dragPayload);
    console.log('✓ effectAllowed:', event.dataTransfer.effectAllowed);
    
    // Create a custom drag image
    const dragImage = document.createElement('div');
    dragImage.style.cssText = `
      position: absolute;
      top: -9999px;
      width: 80px;
      height: 100px;
      background: linear-gradient(135deg, ${app.color} 0%, rgba(0,0,0,0.1) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      opacity: 0.8;
    `;
    
    // Handle canvas-based icons (e.g., calendar)
    if (app.useCanvasIcon && typeof generateUltimateMacIcon === 'function') {
      const dragCanvas = document.createElement('canvas');
      dragCanvas.id = `drag-canvas-${app.id}-${Date.now()}`;
      dragCanvas.width = 80;
      dragCanvas.height = 80;
      dragImage.appendChild(dragCanvas);
      // Generate the calendar icon synchronously for drag image
      setTimeout(() => {
        generateUltimateMacIcon(dragCanvas.id, 80);
      }, 0);
    }
    // Handle image icons
    else if (app.icon && (app.icon.startsWith('/') || app.icon.startsWith('../') || app.icon.startsWith('./') || app.icon.startsWith('http'))) {
      const img = document.createElement('img');
      img.src = app.icon;
      img.alt = app.name;
      img.style.cssText = 'width: 80%; height: 80%; object-fit: contain;';
      dragImage.appendChild(img);
    } 
    // Handle emoji icons
    else {
      dragImage.textContent = app.icon;
    }
    
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 40, 50);
    setTimeout(() => dragImage.remove(), 0);
    
    event.currentTarget.style.opacity = '0.5';
  }

  handleDragEnd(event) {
    event.currentTarget.style.opacity = '1';
  }

  handleAppClick(event) {
    try {
      const appItem = event.currentTarget;
      if (!appItem) {
        console.error('App item not found in click event');
        return;
      }

      const appId = appItem.getAttribute('data-app-id');
      if (!appId || typeof appId !== 'string') {
        console.error('Invalid appId:', appId);
        return;
      }

      const app = window.availableAppsForLaunchpad?.find(a => a.id === appId);
      if (!app) {
        console.warn(`App not found in availableAppsForLaunchpad:`, appId);
        return;
      }

      // Validate app action exists
      if (typeof app.action !== 'function') {
        console.error(`App ${appId} missing action method`);
        return;
      }

      console.log(`Launching app: ${app.name}`);
      
      // Add ripple effect (gracefully handle if not available)
      if (typeof this.createRipple === 'function') {
        this.createRipple(event, appItem);
      }
      
      // Check if we're in selection mode (for tiling)
      const selectionContext = window.launchpadSelectionContext;
      if (selectionContext?.enabled && typeof selectionContext.callback === 'function') {
        // Validate selection context has required properties
        if (!selectionContext.mode || !selectionContext.target) {
          console.warn('Selection context missing required properties:', selectionContext);
          // Fall back to normal launch
          app.action();
          return;
        }

        // Launch the app
        try {
          app.action();
        } catch (launchError) {
          console.error(`Error launching app ${appId}:`, launchError);
          return;
        }
        
        // Give the app a moment to open, then trigger the callback
        const callbackTimeout = setTimeout(() => {
          try {
            // Verify callback still exists and is valid
            if (window.launchpadSelectionContext?.callback && 
                typeof window.launchpadSelectionContext.callback === 'function') {
              window.launchpadSelectionContext.callback(appId);
            } else {
              console.warn('Selection context callback lost or invalid');
            }
            
            // Close the Launchpad after selection
            if (this.appWindow && typeof this.appWindow.minimize === 'function') {
              this.appWindow.minimize();
            } else {
              console.warn('Launchpad appWindow not available or missing minimize method');
            }
          } catch (callbackError) {
            console.error('Error in selection callback:', callbackError);
          } finally {
            // Reset selection context (defensive cleanup)
            try {
              window.launchpadSelectionContext = null;
              // Reset Launchpad z-index back to normal
              const launchpadWindow = document.querySelector('[data-app-id="launchpad"]');
              if (launchpadWindow) {
                launchpadWindow.style.zIndex = '';
              }
            } catch (e) {
              console.warn('Could not reset selection context:', e);
            }
          }
        }, 600);

        // Store timeout ID for potential cleanup
        this._selectionCallbackTimeout = callbackTimeout;
      } else {
        // Normal launch (not in selection mode)
        try {
          app.action();
        } catch (launchError) {
          console.error(`Error launching app ${appId}:`, launchError);
        }
      }
    } catch (error) {
      console.error('Unexpected error in handleAppClick:', error);
    }
  }

  launchApp(action, name) {
    // Find and launch the real app
    const appMap = {
      'notes': () => this.findAndLaunchApp('notes', 'NotesApp'),
      'calendar': () => this.findAndLaunchApp('calendar', 'CalendarApp'),
      'clock': () => this.findAndLaunchApp('clock', 'Clock'),
      'weather': () => this.findAndLaunchApp('weather', 'WeatherApp'),
      'contacts': () => this.findAndLaunchApp('contacts', 'ContactsApp'),
      'calculator': () => this.findAndLaunchApp('calculator', 'Calculator'),
      'settings': () => this.findAndLaunchApp('settings', 'SettingsApp'),
      'products': () => this.launchProductManager(),
      'search': () => console.log('Search feature coming soon'),
      'about': () => console.log('About info'),
      'help': () => console.log('Help system'),
      'feedback': () => console.log('Feedback form')
    };

    if (appMap[action]) {
      appMap[action]();
    }
  }

  launchProductManager() {
    const productWindow = new AppWindow({
      title: 'Product List Manager',
      icon: '📦',
      width: '1200px',
      height: '700px',
      left: 'calc(50% - 600px)',
      top: 'calc(50% - 350px)',
      minWidth: '900px',
      minHeight: '500px',
      resizable: true,
      appId: 'product-manager',
      onClose: () => {
        console.log('Product Manager closed');
      }
    });

    // Load the product list component
    fetch('../Components/product-list.html')
      .then(response => response.text())
      .then(html => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Extract the content from the template
        const contentDiv = tempDiv.querySelector('.product-manager');
        if (contentDiv) {
          const contentArea = productWindow.getContentArea();
          contentArea.innerHTML = contentDiv.innerHTML;
          
          // Load the scripts
          const script = document.createElement('script');
          script.src = '../Scripts/product-list.js';
          contentArea.appendChild(script);
        }
      })
      .catch(error => console.error('Error loading Product Manager:', error));
  }

  findAndLaunchApp(appId, className) {
    // Trigger the app action from the main app bar
    const availableApps = window.availableAppsForLaunchpad || [];
    const app = availableApps.find(a => a.id === appId);
    
    if (app && app.action) {
      app.action();
    } else {
      // Fallback: log which app was requested
      console.log(`Attempting to launch: ${appId}`);
    }
  }

  createRipple(event, element) {
    const ripple = document.createElement('span');
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'rgba(255, 255, 255, 0.6)';
    ripple.style.pointerEvents = 'none';
    ripple.style.animation = 'rippleAnimation 0.6s ease-out';

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  }

  handleShowMore(event) {
    const link = event.target;
    console.log(`${link.textContent} clicked`);
    link.style.opacity = '0.7';
    setTimeout(() => {
      link.style.opacity = '1';
    }, 200);
  }

  handleClose() {
    this.windowState = 'closed';
    // Clear global reference
    window.currentLaunchpadApp = null;
    // Notify parent that app has closed
    if (this.options.onClose) {
      this.options.onClose();
    }
  }

  handleMinimize() {
    this.windowState = 'minimized';
    if (this.options.onMinimize) {
      this.options.onMinimize();
    }
  }

  handleMaximize() {
    this.windowState = 'maximized';
    if (this.options.onMaximize) {
      this.options.onMaximize();
    }
  }

  restore() {
    if (this.appWindow) {
      this.appWindow.restore();
      this.windowState = 'open';
    }
  }
}

// Store global reference
window.currentLaunchpadApp = null;
console.log('[LaunchpadApp] Creating style element...');

// Add ripple animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes rippleAnimation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
console.log('[LaunchpadApp] Style appended to head');

// Ensure global availability
try {
  window.LaunchpadApp = LaunchpadApp;
  console.log('[LaunchpadApp] ===== MODULE LOAD SUCCESS =====');
  console.log('[LaunchpadApp] Exported to window.LaunchpadApp');
} catch (e) {
  console.error('[LaunchpadApp] FAILED TO EXPORT:', e);
}

} catch (moduleError) {
  console.error('[LaunchpadApp] ===== MODULE LOAD FAILED =====');
  console.error('[LaunchpadApp] Error:', moduleError);
  console.error('[LaunchpadApp] Stack:', moduleError.stack);
}
