// ========================================
// DESKTOP CONTEXT MENU - Right-click menu
// ========================================

export class DesktopContextMenu {
  constructor(desktopArea) {
    this.desktopArea = desktopArea;
    this.menuElement = null;
    this.isOpen = false;
    this.contextMenuActions = new ContextMenuActions();
    this.touchTimer = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.menuX = 0;
    this.menuY = 0;
    this.menuWidth = 0;
    this.menuHeight = 0;
    this.backgroundCheckInterval = null;
    this.init();
  }

  init() {
    // Create context menu HTML with liquid glass design (macOS style)
    const menuHTML = `
      <div class="desktop-context-menu">
        <div class="context-menu-content">
          <div class="context-menu-item" data-action="newFolder">
            <span class="context-menu-icon">📁</span>
            <span class="context-menu-label">New Folder</span>
          </div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item" data-action="getInfo">
            <span class="context-menu-icon">ℹ</span>
            <span class="context-menu-label">Get Info</span>
          </div>
          <div class="context-menu-item" data-action="changeWallpaper">
            <span class="context-menu-icon">🖼</span>
            <span class="context-menu-label">Change Wallpaper...</span>
          </div>
          <div class="context-menu-item" data-action="editWidgets">
            <span class="context-menu-icon">◊</span>
            <span class="context-menu-label">Edit Widgets...</span>
          </div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item" data-action="useStacks">
            <span class="context-menu-icon">📚</span>
            <span class="context-menu-label">Use Stacks</span>
          </div>
          <div class="context-menu-item" data-action="sortBy" data-has-submenu="true">
            <span class="context-menu-icon">↕</span>
            <span class="context-menu-label">Sort By</span>
            <span class="context-menu-arrow">›</span>
          </div>
          <div class="context-menu-item" data-action="showViewOptions">
            <span class="context-menu-icon">⚙</span>
            <span class="context-menu-label">Show View Options</span>
          </div>
        </div>
      </div>
    `;

    // Create menu element
    this.menuElement = document.createElement('div');
    this.menuElement.innerHTML = menuHTML;
    this.menuElement.style.display = 'none';
    this.menuElement.style.zIndex = 1000001;
    this.menuElement.classList.add('light-text'); // Default to light text for dark backgrounds
    document.body.appendChild(this.menuElement);

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Right-click on desktop area
    this.desktopArea.addEventListener('contextmenu', (e) => {
      // Don't show context menu on icons
      if (e.target.closest('.desktop-shortcut') || e.target.closest('.shortcut') || e.target.closest('.context-menu-item')) {
        return;
      }
      e.preventDefault();
      this.show(e.clientX, e.clientY);
    });

    // Long press on desktop area (touchscreen support)
    this.desktopArea.addEventListener('touchstart', (e) => {
      // Only trigger on desktop area, not on icons
      if (e.target.closest('.desktop-shortcut') || e.target.closest('.shortcut') || e.target.closest('.context-menu-item')) {
        return;
      }

      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;

      this.touchTimer = setTimeout(() => {
        e.preventDefault();
        this.show(this.touchStartX, this.touchStartY);
        this.touchTimer = null;
      }, 500); // 500ms long press
    });

    // Cancel long press if user moves finger (drag detection)
    this.desktopArea.addEventListener('touchmove', (e) => {
      const moveX = e.touches[0].clientX - this.touchStartX;
      const moveY = e.touches[0].clientY - this.touchStartY;
      const moveDistance = Math.sqrt(moveX * moveX + moveY * moveY);

      // If moved more than 10px, cancel long press
      if (moveDistance > 10) {
        if (this.touchTimer) {
          clearTimeout(this.touchTimer);
          this.touchTimer = null;
        }
      }
    });

    // Cancel long press on touch end
    this.desktopArea.addEventListener('touchend', (e) => {
      if (this.touchTimer) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.desktop-context-menu')) {
        this.close();
      }
    });

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // Menu item click handlers
    const menuItems = this.menuElement.querySelectorAll('.context-menu-item:not(.context-menu-divider)');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const hasSubmenu = item.dataset.hasSubmenu === 'true';
        
        if (!hasSubmenu) {
          this.handleMenuAction(action);
          this.close();
        }
      });
    });
  }

  show(x, y) {
    if (this.menuElement) {
      // First position menu invisibly to get accurate dimensions
      this.menuElement.style.position = 'fixed';
      this.menuElement.style.visibility = 'hidden';
      this.menuElement.style.display = 'block';
      this.menuElement.style.left = '0px';
      this.menuElement.style.top = '0px';

      // Get actual menu dimensions
      const menuRect = this.menuElement.getBoundingClientRect();
      const menuWidth = menuRect.width || 250;
      const menuHeight = menuRect.height || 300;

      // Get dock element and its position
      const dockContainer = document.querySelector('.dock-container');
      const dockHeight = dockContainer ? dockContainer.offsetHeight : 100;
      const dockTop = dockContainer ? dockContainer.getBoundingClientRect().top : window.innerHeight;

      // Get app bar/header
      const appBar = document.querySelector('.app-bar') || document.querySelector('[class*="app-bar"]');
      const appBarHeight = appBar ? appBar.offsetHeight : 0;

      // Constants for spacing
      const MENU_PADDING = 8;
      const MIN_SPACING_FROM_DOCK = 10;

      // Calculate available space
      const spaceAbove = y - appBarHeight - MENU_PADDING;
      const spaceBelow = window.innerHeight - y - dockHeight - MIN_SPACING_FROM_DOCK;

      let adjustedX = x;
      let adjustedY = y;

      // Horizontal positioning
      if (x + menuWidth + MENU_PADDING > window.innerWidth) {
        // Not enough space on right, position from right edge
        adjustedX = window.innerWidth - menuWidth - MENU_PADDING;
      } else {
        adjustedX = x;
      }

      // Vertical positioning - prioritize showing below, flip above if needed
      if (spaceBelow >= menuHeight) {
        // Enough space below - position below cursor
        adjustedY = y;
      } else if (spaceAbove >= menuHeight) {
        // Not enough space below but space above - position above cursor
        adjustedY = y - menuHeight - MENU_PADDING;
      } else {
        // Limited space both sides - position to avoid dock
        adjustedY = window.innerHeight - dockHeight - menuHeight - MIN_SPACING_FROM_DOCK;
      }

      // Ensure menu doesn't go off top
      if (adjustedY < appBarHeight + MENU_PADDING) {
        adjustedY = appBarHeight + MENU_PADDING;
      }

      // Apply position while still invisible
      this.menuElement.style.left = adjustedX + 'px';
      this.menuElement.style.top = adjustedY + 'px';
      this.menuElement.style.zIndex = 1000001;

      // Make menu transparent to pointer events for accurate background detection
      this.menuElement.style.pointerEvents = 'none';

      // Detect background color brightness BEFORE making menu visible
      this.detectBackgroundBrightness(adjustedX + menuWidth / 2, adjustedY + menuHeight / 2);

      // Now make menu visible
      this.menuElement.style.visibility = 'visible';
      
      // Restore pointer events
      this.menuElement.style.pointerEvents = 'auto';
      
      // Store menu position and dimensions for continuous background detection
      this.menuX = adjustedX;
      this.menuY = adjustedY;
      this.menuWidth = menuWidth;
      this.menuHeight = menuHeight;
      
      this.isOpen = true;
      
      // Start continuous background detection while menu is open
      this.startBackgroundDetection();
    }
  }

  startBackgroundDetection() {
    // Clear any existing interval
    if (this.backgroundCheckInterval) {
      clearInterval(this.backgroundCheckInterval);
    }
    
    // Check background every 100ms while menu is open for dynamic updates
    this.backgroundCheckInterval = setInterval(() => {
      if (this.isOpen) {
        const originalPointerEvents = this.menuElement.style.pointerEvents;
        this.menuElement.style.pointerEvents = 'none';
        
        this.detectBackgroundBrightness(this.menuX + this.menuWidth / 2, this.menuY + this.menuHeight / 2);
        
        this.menuElement.style.pointerEvents = originalPointerEvents;
      }
    }, 100);
  }

  stopBackgroundDetection() {
    if (this.backgroundCheckInterval) {
      clearInterval(this.backgroundCheckInterval);
      this.backgroundCheckInterval = null;
    }
  }

  detectBackgroundBrightness(x, y) {
    try {
      let element = document.elementFromPoint(x, y);
      let bgColor = null;
      let attempts = 0;
      const maxAttempts = 15;

      // Walk up the DOM tree to find a non-transparent background
      while (element && attempts < maxAttempts) {
        const style = window.getComputedStyle(element);
        bgColor = style.backgroundColor;

        // Check if background is not transparent
        if (bgColor && 
            bgColor !== 'rgba(0, 0, 0, 0)' && 
            bgColor !== 'transparent') {
          
          const isLight = this.isColorLight(bgColor);
          
          if (isLight) {
            this.menuElement.classList.remove('light-text');
            this.menuElement.classList.add('dark-text');
            
            // Force apply dark text styles via JavaScript
            this.applyDarkTextStyles();
          } else {
            this.menuElement.classList.remove('dark-text');
            this.menuElement.classList.add('light-text');
            
            // Force apply light text styles via JavaScript
            this.applyLightTextStyles();
          }
          return;
        }

        element = element.parentElement;
        attempts++;
      }

      // Default to light text if no background found
      this.menuElement.classList.remove('dark-text');
      this.menuElement.classList.add('light-text');
      this.applyLightTextStyles();
    } catch (e) {
      // Fallback to light text if detection fails
      this.menuElement.classList.remove('dark-text');
      this.menuElement.classList.add('light-text');
      this.applyLightTextStyles();
    }
  }

  applyDarkTextStyles() {
    // Set dark background tint with better contrast
    this.menuElement.style.background = 'rgba(0, 0, 0, 0.35)';
    this.menuElement.style.backdropFilter = 'blur(12px)';
    this.menuElement.style.webkitBackdropFilter = 'blur(40px)';
    
    // Set inline styles for dark text mode
    const items = this.menuElement.querySelectorAll('.context-menu-item');
    items.forEach(item => {
      item.style.color = '#000000';
      item.style.textShadow = '0 0.5px 1px rgba(255, 255, 255, 0.5)';
      const icon = item.querySelector('.context-menu-icon');
      if (icon) {
        icon.style.color = '#000000';
        icon.style.filter = 'grayscale(1) brightness(0.7) contrast(1.1)';
      }
    });

    // Set divider colors
    const dividers = this.menuElement.querySelectorAll('.context-menu-divider');
    dividers.forEach(div => {
      div.style.background = 'rgba(0, 0, 0, 0.2)';
    });
  }

  applyLightTextStyles() {
    // Set light tint background for dark backgrounds
    this.menuElement.style.background = 'rgba(255, 255, 255, 0.25)';
    this.menuElement.style.backdropFilter = 'blur(12px)';
    this.menuElement.style.webkitBackdropFilter = 'blur(40px)';
    
    // Set inline styles for light text mode
    const items = this.menuElement.querySelectorAll('.context-menu-item');
    items.forEach(item => {
      item.style.color = '#ffffff';
      item.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
      const icon = item.querySelector('.context-menu-icon');
      if (icon) {
        icon.style.color = '#ffffff';
        icon.style.filter = 'grayscale(1) brightness(1.3) contrast(1.1)';
      }
    });

    // Set divider colors
    const dividers = this.menuElement.querySelectorAll('.context-menu-divider');
    dividers.forEach(div => {
      div.style.background = 'rgba(255, 255, 255, 0.2)';
    });
  }

  isColorLight(color) {
    // Parse color string (rgb, rgba, hex, or named color)
    let r = 255, g = 255, b = 255;

    // Handle named colors
    const namedColors = {
      'white': 'rgb(255, 255, 255)',
      'black': 'rgb(0, 0, 0)',
      'red': 'rgb(255, 0, 0)',
      'green': 'rgb(0, 128, 0)',
      'blue': 'rgb(0, 0, 255)',
      'gray': 'rgb(128, 128, 128)',
      'grey': 'rgb(128, 128, 128)'
    };

    let normalizedColor = color.toLowerCase().trim();
    if (namedColors[normalizedColor]) {
      normalizedColor = namedColors[normalizedColor];
    }

    // Handle rgba/rgb
    if (normalizedColor.startsWith('rgb')) {
      const match = normalizedColor.match(/(\d+)/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    }
    // Handle hex colors
    else if (normalizedColor.startsWith('#')) {
      const hex = normalizedColor.replace('#', '');
      if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
    }

    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // If luminance > 0.5, it's a light color
    const isLight = luminance > 0.5;
    return isLight;
  }

  close() {
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
      this.isOpen = false;
      this.stopBackgroundDetection();
    }
  }

  handleMenuAction(action) {
    switch (action) {
      case 'newFolder':
        this.contextMenuActions.handleNewFolder();
        break;
      case 'getInfo':
        this.contextMenuActions.handleGetInfo();
        break;
      case 'changeWallpaper':
        this.contextMenuActions.handleChangeWallpaper();
        break;
      case 'editWidgets':
        this.contextMenuActions.handleEditWidgets();
        break;
      case 'useStacks':
        this.contextMenuActions.handleUseStacks();
        break;
      case 'sortBy':
        this.contextMenuActions.handleSortBy();
        break;
      case 'showViewOptions':
        this.contextMenuActions.handleShowViewOptions();
        break;
      default:
        break;
    }
  }
}

// Backwards-compat: allow non-module pages to access it
if (typeof window !== 'undefined') {
  window.DesktopContextMenu = DesktopContextMenu;
}
