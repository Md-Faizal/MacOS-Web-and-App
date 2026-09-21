// Desktop Shortcuts Management
const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

class DesktopManager {
  constructor() {
    this.shortcuts = [];
    this.getScopedStorageKey = getScopedStorageKey;
    this.STORAGE_KEY = this.getScopedStorageKey('desktopShortcuts');
    this.GRID_STORAGE_KEY = this.getScopedStorageKey('desktop_show_grid');
    this.desktopArea = null;
    
    // Grid settings for desktop icon alignment (smaller grid = more capacity)
    this.GRID_WIDTH = 90;    // Reduced from 120px for more columns
    this.GRID_HEIGHT = 100;  // Reduced from 140px for more rows
    
    this.init();
  }

  init() {
    // Create desktop area if it doesn't exist
    this.desktopArea = document.getElementById('desktopArea');
    if (!this.desktopArea) {
      this.createDesktopArea();
    }

    // Add global dragover handler to allow drops FIRST
    document.addEventListener('dragover', (e) => {
      console.log('Global dragover handler fired');
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }, false);

    // Add global dragstart handler for debugging
    document.addEventListener('dragstart', (e) => {
      console.log('⭐ GLOBAL DRAGSTART:', {
        target: e.target.tagName,
        id: e.target.id,
        class: e.target.className,
        dataTransferTypes: Array.from(e.dataTransfer.types),
        effectAllowed: e.dataTransfer.effectAllowed
      });
    }, true); // capture phase to catch all dragstarts

    // Load shortcuts from localStorage
    this.loadShortcuts();
    this.setupDropZone();
  }

  createDesktopArea() {
    const desktop = document.createElement('div');
    desktop.id = 'desktopArea';
    desktop.className = 'desktop-area';
    desktop.style.cssText = `
      position: fixed;
      top: 44px;
      left: 0;
      right: 0;
      bottom: 90px;
      z-index: 4;
      display: block;
      padding: 20px;
      overflow: auto;
      backdrop-filter: none;
      pointer-events: auto;
    `;
    document.body.insertBefore(desktop, document.querySelector('.dock-container'));
    this.desktopArea = desktop;
    console.log('Desktop area created:', this.desktopArea);
  }

  setupDropZone() {
    if (!this.desktopArea) {
      console.warn('Desktop area not found');
      return;
    }

    console.log('Setting up drop zone on desktop area');

    this.desktopArea.addEventListener('dragenter', (e) => {
      console.log('Dragenter on desktop');
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      this.desktopArea.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      this.desktopArea.style.borderRadius = '8px';
    }, false);

    this.desktopArea.addEventListener('dragover', (e) => {
      console.log('Dragover on desktop');
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      this.desktopArea.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      return false;
    }, false);

    this.desktopArea.addEventListener('dragleave', (e) => {
      console.log('Dragleave on desktop');
      // Only reset if leaving the desktop area entirely
      const rect = this.desktopArea.getBoundingClientRect();
      const isStillInside = e.clientX >= rect.left && 
                           e.clientX <= rect.right &&
                           e.clientY >= rect.top &&
                           e.clientY <= rect.bottom;
      
      if (!isStillInside) {
        this.desktopArea.style.backgroundColor = 'transparent';
      }
    }, false);

    this.desktopArea.addEventListener('drop', (e) => {
      console.log('DROP EVENT FIRED on desktop area!');
      console.log('e.dataTransfer:', e.dataTransfer);
      console.log('e.dataTransfer.types:', Array.from(e.dataTransfer.types));
      e.preventDefault();
      e.stopPropagation();
      this.desktopArea.style.backgroundColor = 'transparent';
      this.handleDesktopDrop(e);
      return false;
    }, false);
  }

  handleDesktopDrop(e) {
    console.log('Drop detected on desktop area at:', e.clientX, e.clientY);
    console.log('dataTransfer.types:', Array.from(e.dataTransfer.types));
    
    let dragData = null;
    
    // Try getData first with all types
    const dataTypes = ['text/plain', 'text/html', 'application/json'];
    for (let dataType of dataTypes) {
      try {
        const rawData = e.dataTransfer.getData(dataType);
        console.log(`getData('${dataType}'):`, rawData, 'length:', rawData?.length);
        if (rawData && rawData.trim().length > 0) {
          try {
            dragData = JSON.parse(rawData);
            console.log('✓ Successfully parsed from', dataType, ':', dragData);
            break;
          } catch (parseError) {
            console.log('✗ Failed to parse', dataType);
          }
        }
      } catch (error) {
        console.log(`✗ Error calling getData('${dataType}'):`, error);
      }
    }
    
    if (!dragData && e.dataTransfer.items) {
      console.log('Trying items API with', e.dataTransfer.items.length, 'items');
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        console.log(`Item ${i}:`, {type: item.type, kind: item.kind});
        
        if (item.kind === 'string' && (item.type === 'text/plain' || item.type === 'text/html')) {
          item.getAsString((str) => {
            console.log('Item getAsString returned:', str);
            try {
              const parsed = JSON.parse(str);
              this.processDroppedApp(parsed, e);
            } catch (err) {
              console.log('Could not parse item string');
            }
          });
          return;
        }
      }
    }
    
    if (dragData) {
      this.processDroppedApp(dragData, e);
    } else {
      console.warn('No drag data found');
    }
  }

  processDroppedApp(dragData, e) {
    console.log('Processing dropped app:', dragData);
    
    // Check if this is a repositioning operation
    if (dragData && dragData.isRepositioning && dragData.source === 'desktop') {
      console.log('↻ REPOSITIONING shortcut:', dragData.appId);
      const shortcut = this.shortcuts.find(s => s.id === dragData.appId);
      if (shortcut) {
        // Get drop position relative to desktop area
        const rect = this.desktopArea.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;
        
        // Snap to grid
        const gridPos = this.snapToGrid(pixelX, pixelY);
        
        // Check if grid cell is already occupied by another shortcut
        const occupied = this.shortcuts.find(s => s.id !== shortcut.id && s.gridX === gridPos.gridX && s.gridY === gridPos.gridY);
        
        if (occupied) {
          console.log('⚠️ Grid cell occupied! Swapping with:', occupied.name);
          // Swap positions
          const tempGridX = shortcut.gridX;
          const tempGridY = shortcut.gridY;
          const tempX = shortcut.x;
          const tempY = shortcut.y;
          
          shortcut.gridX = gridPos.gridX;
          shortcut.gridY = gridPos.gridY;
          shortcut.x = gridPos.x;
          shortcut.y = gridPos.y;
          
          occupied.gridX = tempGridX;
          occupied.gridY = tempGridY;
          occupied.x = tempX;
          occupied.y = tempY;
          
          console.log('✓ Swapped:', shortcut.name, 'now at Row', gridPos.gridY + 1, 'Column', gridPos.gridX + 1);
          console.log('✓ Swapped:', occupied.name, 'now at Row', tempGridY + 1, 'Column', tempGridX + 1);
          
          this.saveShortcuts();
          
          // Update visual positions for both
          const el1 = document.getElementById(`shortcut-${shortcut.id}`);
          const el2 = document.getElementById(`shortcut-${occupied.id}`);
          if (el1) {
            el1.style.left = shortcut.x + 'px';
            el1.style.top = shortcut.y + 'px';
          }
          if (el2) {
            el2.style.left = occupied.x + 'px';
            el2.style.top = occupied.y + 'px';
          }
        } else {
          // Cell is empty, move normally
          shortcut.gridX = gridPos.gridX;
          shortcut.gridY = gridPos.gridY;
          shortcut.x = gridPos.x;
          shortcut.y = gridPos.y;
          console.log('✓ Repositioned to Row', gridPos.gridY + 1, 'Column', gridPos.gridX + 1);
          
          this.saveShortcuts();
          
          // Update the visual position
          const shortcutEl = document.getElementById(`shortcut-${shortcut.id}`);
          if (shortcutEl) {
            shortcutEl.style.left = shortcut.x + 'px';
            shortcutEl.style.top = shortcut.y + 'px';
          }
        }
      }
      return;
    }
    
    // Otherwise, create a new shortcut
    if (dragData && (dragData.source === 'launchpad' || dragData.source === 'dock')) {
      const appId = dragData.appId;
      console.log('Creating shortcut for app ID:', appId);
      
      const app = window.availableAppsForLaunchpad?.find(a => a.id === appId);
      console.log('Found app:', app?.name);
      
      if (app) {
        // Check if shortcut already exists
        if (!this.shortcuts.find(s => s.id === appId)) {
          // Get drop position relative to desktop area
          const rect = this.desktopArea.getBoundingClientRect();
          const pixelX = e.clientX - rect.left;
          const pixelY = e.clientY - rect.top;
          
          // Snap to grid
          const gridPos = this.snapToGrid(pixelX, pixelY);
          
          // Check if grid cell is already occupied
          const occupied = this.shortcuts.find(s => s.gridX === gridPos.gridX && s.gridY === gridPos.gridY);
          
          if (occupied) {
            console.log('⚠️ Grid cell already occupied! Cannot place', app.name);
            return;
          }
          
          console.log('✓ Adding shortcut for:', app.name);
          console.log('✓ Placed at: Row', gridPos.gridY + 1, 'Column', gridPos.gridX + 1);
          this.addShortcut(app, gridPos.gridX, gridPos.gridY);
        } else {
          console.log('ℹ Shortcut already exists for:', app.name);
        }
      } else {
        console.warn('✗ App not found for ID:', appId);
      }
    } else {
      console.warn('✗ Invalid drag data source:', dragData?.source);
    }
  }

  addShortcut(app, gridX = 0, gridY = 0) {
    // Allow user to specify grid position, defaults to 0,0 if not provided
    const shortcut = {
      id: app.id,
      name: app.name,
      icon: app.icon,
      color: app.color,
      action: app.id,
      useCanvasIcon: app.useCanvasIcon,
      timestamp: Date.now(),
      gridX: gridX,
      gridY: gridY,
      x: gridX * this.GRID_WIDTH + 20,
      y: gridY * this.GRID_HEIGHT + 20
    };

    this.shortcuts.push(shortcut);
    this.saveShortcuts();
    this.renderShortcut(shortcut);
  }

  snapToGrid(pixelX, pixelY) {
    // Convert pixel coordinates to grid coordinates
    const gridX = Math.round((pixelX - 20) / this.GRID_WIDTH);
    const gridY = Math.round((pixelY - 20) / this.GRID_HEIGHT);
    
    // Ensure within bounds
    const boundedGridX = Math.max(0, Math.min(gridX, 9));
    const boundedGridY = Math.max(0, Math.min(gridY, 9));
    
    return {
      gridX: boundedGridX,
      gridY: boundedGridY,
      x: boundedGridX * this.GRID_WIDTH + 20,
      y: boundedGridY * this.GRID_HEIGHT + 20
    };
  }

  renderShortcut(shortcut) {
    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'desktop-shortcut draggable-shortcut';
    shortcutEl.id = `shortcut-${shortcut.id}`;
    shortcutEl.draggable = true;
    shortcutEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px;
      cursor: move;
      border-radius: 8px;
      user-select: none;
      position: absolute;
      left: ${shortcut.x}px;
      top: ${shortcut.y}px;
      width: 80px;
      height: 90px;
    `;

    const iconContainer = document.createElement('div');
    iconContainer.className = 'shortcut-icon-container';
    iconContainer.style.cssText = `
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, ${shortcut.color} 0%, rgba(0,0,0,0.1) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transition: all 0.2s ease;
      flex-shrink: 0;
    `;

    // Handle canvas-based icons (e.g., calendar)
    if (shortcut.useCanvasIcon) {
      const canvas = document.createElement('canvas');
      canvas.id = `desktop-icon-canvas-${shortcut.id}-${Date.now()}`;
      // Set canvas width and height attributes to match drawing size
      canvas.width = 96;
      canvas.height = 96;
      // Use CSS to scale to container size and ensure proper touch event propagation
      canvas.style.cssText = 'width: 100%; height: 100%; display: block; pointer-events: none; -webkit-touch-callout: none; touch-action: none;';
      iconContainer.appendChild(canvas);
      // Generate the calendar icon asynchronously
      setTimeout(() => {
        if (typeof generateUltimateMacIcon === 'function') {
          generateUltimateMacIcon(canvas.id, 96);
        }
      }, 100);
    }
    // Handle image icons
    else if (shortcut.icon && (shortcut.icon.startsWith('/') || shortcut.icon.startsWith('../') || shortcut.icon.startsWith('./') || shortcut.icon.startsWith('http'))) {
      const img = document.createElement('img');
      img.src = shortcut.icon;
      img.alt = shortcut.name;
      img.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
      iconContainer.appendChild(img);
    } 
    // Handle emoji icons
    else {
      const emoji = document.createElement('span');
      emoji.textContent = shortcut.icon || '📱';
      emoji.style.cssText = 'font-size: 24px;';
      iconContainer.appendChild(emoji);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'shortcut-name';
    nameEl.textContent = shortcut.name;
    nameEl.style.cssText = `
      font-size: 10px;
      font-weight: 500;
      color: #ffffff;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      word-break: break-word;
      line-height: 1.1;
      max-width: 70px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'shortcut-delete-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 59, 48, 0.9);
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    shortcutEl.addEventListener('mouseenter', () => {
      shortcutEl.style.transform = 'scale(1.05)';
      shortcutEl.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      deleteBtn.style.opacity = '1';
    });

    shortcutEl.addEventListener('mouseleave', () => {
      shortcutEl.style.transform = 'scale(1)';
      shortcutEl.style.backgroundColor = 'transparent';
      deleteBtn.style.opacity = '0';
    });

    shortcutEl.addEventListener('click', (e) => {
      // Check if click was on the delete button or its parent
      if (!deleteBtn.contains(e.target)) {
        console.log('Launching app from shortcut:', shortcut.name);
        this.launchApp(shortcut);
      }
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Deleting shortcut:', shortcut.name);
      this.removeShortcut(shortcut.id);
    });

    // Drag handling - for moving shortcuts around the desktop
    shortcutEl.addEventListener('dragstart', (e) => {
      console.log('🔵 Shortcut dragstart:', shortcut.name);
      e.dataTransfer.effectAllowed = 'move';
      const dragPayload = JSON.stringify({
        source: 'desktop',
        appId: shortcut.id,
        appName: shortcut.name,
        isRepositioning: true
      });
      e.dataTransfer.setData('text/plain', dragPayload);
      console.log('✓ Drag data set:', dragPayload);

      const dragImage = document.createElement('div');
      dragImage.style.cssText = `
        position: absolute;
        top: -9999px;
        width: 80px;
        height: 100px;
        background: linear-gradient(135deg, ${shortcut.color} 0%, rgba(0,0,0,0.1) 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        opacity: 0.8;
      `;
      dragImage.textContent = shortcut.icon;
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 40, 50);
      setTimeout(() => dragImage.remove(), 0);

      shortcutEl.style.opacity = '0.5';
      shortcutEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    shortcutEl.addEventListener('dragend', () => {
      console.log('🔴 Shortcut dragend:', shortcut.name);
      shortcutEl.style.opacity = '1';
      shortcutEl.style.backgroundColor = 'transparent';
    });

    // Add dragover handler to shortcut to allow repositioning
    shortcutEl.addEventListener('dragover', (e) => {
      console.log('⚪ Shortcut dragover');
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      return false;
    }, false);

    // Add drop handler to shortcut to allow repositioning
    shortcutEl.addEventListener('drop', (e) => {
      console.log('✅ DROP on shortcut element');
      e.preventDefault();
      e.stopPropagation();
      this.handleDesktopDrop(e);
      return false;
    }, false);

    shortcutEl.appendChild(iconContainer);
    shortcutEl.appendChild(nameEl);
    shortcutEl.appendChild(deleteBtn);

    this.desktopArea.appendChild(shortcutEl);
  }

  launchApp(shortcut) {
    const app = window.availableAppsForLaunchpad?.find(a => a.id === shortcut.id);
    if (app) {
      app.action();
    }
  }

  removeShortcut(appId) {
    this.shortcuts = this.shortcuts.filter(s => s.id !== appId);
    this.saveShortcuts();
    
    const shortcutEl = document.getElementById(`shortcut-${appId}`);
    if (shortcutEl) {
      shortcutEl.style.opacity = '0';
      shortcutEl.style.transform = 'scale(0.8)';
      setTimeout(() => shortcutEl.remove(), 200);
    }
  }

  saveShortcuts() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.shortcuts));
  }

  loadShortcuts() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      this.shortcuts = saved ? JSON.parse(saved) : [];
      
      // Render all shortcuts
      this.shortcuts.forEach(shortcut => this.renderShortcut(shortcut));
    } catch (e) {
      console.error('Error loading desktop shortcuts:', e);
      this.shortcuts = [];
    }
  }
}

// Initialize desktop manager when available apps are ready
window.desktopManager = null;

function initializeDesktop() {
  console.log('Attempting to initialize desktop manager...');
  console.log('availableAppsForLaunchpad:', window.availableAppsForLaunchpad);
  console.log('desktopManager exists:', window.desktopManager);
  
  if (!window.desktopManager && window.availableAppsForLaunchpad) {
    console.log('Initializing DesktopManager');
    window.desktopManager = new DesktopManager();
    console.log('DesktopManager initialized:', window.desktopManager);
  }
}

// Try to initialize immediately
if (document.readyState === 'loading') {
  console.log('Document still loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initializeDesktop);
} else {
  console.log('Document already loaded, initializing');
  initializeDesktop();
}

// Also initialize after multiple delays to ensure dock is ready
setTimeout(() => {
  console.log('Attempting initialize after 100ms');
  initializeDesktop();
}, 100);

setTimeout(() => {
  console.log('Attempting initialize after 500ms');
  initializeDesktop();
}, 500);

setTimeout(() => {
  console.log('Attempting initialize after 1000ms');
  initializeDesktop();
}, 1000);
