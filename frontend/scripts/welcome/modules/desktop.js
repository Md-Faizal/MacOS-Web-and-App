import { WidgetFactory } from '../../../modules/widgets/js/widget-factory.js';

// Desktop Shortcuts Management
export class DesktopManager {
  constructor() {
    this.shortcuts = [];
    this.STORAGE_KEY = 'desktopShortcuts';
    this.desktopArea = null;
    this.dropIndicator = null;
    
    // Grid settings for desktop icon alignment (smaller grid = more capacity)
    this.GRID_WIDTH = 90;    // Reduced from 120px for more columns
    this.GRID_HEIGHT = 100;  // Reduced from 140px for more rows
    
    // Benchmark resolution for cross-device consistency
    // Initialized to 0, will adopt the current viewport on first run or load from server
    this.benchmarkCols = 0; 
    this.benchmarkRows = 0;

    this.init();
  }

  async init() {
    // Create desktop area if it doesn't exist
    this.desktopArea = document.getElementById('desktopArea');
    if (!this.desktopArea) {
      this.createDesktopArea();
    }

    // Initialize desktop context menu (right-click menu)
    this.contextMenu = new window.DesktopContextMenu(this.desktopArea);

    const __DESKTOP_DEBUG__ =
      (typeof localStorage !== 'undefined' && localStorage.getItem('debug:desktop') === '1') ||
      (typeof window !== 'undefined' && window.__DEBUG_DESKTOP__ === true);

    // Add global dragover handler to allow drops FIRST
    document.addEventListener('dragover', (e) => {
      if (__DESKTOP_DEBUG__) console.log('Global dragover handler fired');
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }, false);

    // Add global dragstart handler for debugging
    document.addEventListener('dragstart', (e) => {
      if (!__DESKTOP_DEBUG__) return;
      console.log('⭐ GLOBAL DRAGSTART:', {
        target: e.target.tagName,
        id: e.target.id,
        class: e.target.className,
        dataTransferTypes: Array.from(e.dataTransfer.types),
        effectAllowed: e.dataTransfer.effectAllowed
      });
    }, true); // capture phase to catch all dragstarts

    // Load shortcuts from server/localStorage
    await this.loadShortcuts();
    this.setupDropZone();

    // Listen for resize to re-center the grid
    window.addEventListener('resize', () => {
      this.repositionAllShortcuts();
    });
    
    // Global listener to dismiss delete buttons when clicking elsewhere
    document.addEventListener('click', (e) => {
      // Check if clicking on any desktop shortcut
      const clickedShortcut = e.target.closest('.desktop-shortcut');
      if (!clickedShortcut) {
        // Clicked outside all shortcuts - dismiss all visible delete buttons
        document.querySelectorAll('.shortcut-delete-btn.visible').forEach(btn => {
          btn.style.opacity = '0';
          btn.classList.remove('visible');
          const shortcutEl = btn.closest('.desktop-shortcut');
          if (shortcutEl) {
            shortcutEl.style.transform = 'scale(1)';
            shortcutEl.style.backgroundColor = 'transparent';
          }
        });
      }
    }, true); // capture phase to ensure this runs before other handlers

    // Honoring user preference for grid visibility (default OFF)
    const showGridPref = localStorage.getItem('desktop_show_grid') === 'true';
    if (showGridPref) {
      this.toggleGrid(true);
    }
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
      display: flex;
      justify-content: flex-start; 
      align-items: flex-start;
      backdrop-filter: none;
      pointer-events: auto;
    `;
    
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'desktop-grid-container';
    this.gridContainer.style.cssText = `
      position: relative;
      flex-shrink: 0;
      margin: auto; /* DUAL-AXIS CENTERING when smaller than parent */
    `;
    
    desktop.appendChild(this.gridContainer);
    document.body.insertBefore(desktop, document.querySelector('.dock-container'));
    this.desktopArea = desktop;
    
    // Listen for resize to update benchmark if needed
    window.addEventListener('resize', () => {
      this.repositionAllShortcuts();
    });

    console.log('Desktop area and grid container created');
  }



  setupDropZone() {
    if (!this.desktopArea) {
      console.warn('Desktop area not found');
      return;
    }

    // Create the drop indicator for visual feedback
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'desktop-drop-indicator';
    this.dropIndicator.style.cssText = `
      position: absolute;
      width: 80px;
      height: 90px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.15);
      border: 2px solid rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(4px);
      pointer-events: none;
      opacity: 0;
      transition: all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
      z-index: 10;
    `;
    this.gridContainer.appendChild(this.dropIndicator);

    console.log('Setting up drop zone on desktop area');

    this.desktopArea.addEventListener('dragenter', (e) => {
      console.log('Dragenter on desktop');
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
      this.dropIndicator.style.opacity = '1';
    }, false);

    this.desktopArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
      
      // Get position relative to gridContainer
      const rect = this.gridContainer.getBoundingClientRect();
      const pixelX = e.clientX - rect.left;
      const pixelY = e.clientY - rect.top;
      
      this.updateDropIndicatorViaPixel(pixelX, pixelY, window.activeDragSpanX || 1, window.activeDragSpanY || 1);
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
        this.hideDropIndicator();
      }
    }, false);

    this.desktopArea.addEventListener('drop', (e) => {
      console.log('DROP EVENT FIRED on desktop area!');
      console.log('e.dataTransfer:', e.dataTransfer);
      console.log('e.dataTransfer.types:', Array.from(e.dataTransfer.types));
      e.preventDefault();
      e.stopPropagation();
      this.hideDropIndicator();
      this.handleDesktopDrop(e);
      return false;
    }, false);

    // Handle dragend globally to clear desktop highlight if drag ends without drop
    document.addEventListener('dragend', (e) => {
      console.log('Global dragend: clearing desktop highlight');
      window.activeDragSpanX = 1;
      window.activeDragSpanY = 1;
      this.hideDropIndicator();
    }, true);
  }

  updateDropIndicatorViaPixel(pixelX, pixelY, spanX = 1, spanY = 1) {
    if (this.dropIndicator) {
      this.dropIndicator.style.opacity = '1';
      const gridPos = this.snapToGrid(pixelX, pixelY);
      
      const width = spanX === 1 ? 80 : (spanX * this.GRID_WIDTH - 10);
      const height = spanY === 1 ? 90 : (spanY * this.GRID_HEIGHT - 10);
      
      this.dropIndicator.style.width = width + 'px';
      this.dropIndicator.style.height = height + 'px';
      this.dropIndicator.style.left = (gridPos.x) + 'px';
      this.dropIndicator.style.top = (gridPos.y) + 'px';
    }
  }

  /**
   * Calculate offsets for centering the grid locally
   */
  getGridOffsets() {
    // Current active grid size
    const viewportCols = Math.floor(((this.desktopArea ? this.desktopArea.clientWidth : window.innerWidth) - 40) / this.GRID_WIDTH);
    const viewportRows = Math.floor(((this.desktopArea ? this.desktopArea.clientHeight : window.innerHeight - 134) - 40) / this.GRID_HEIGHT);

    // Dynamic grid size based on benchmark, viewport, and icons
    let maxIconCol = 0;
    let maxIconRow = 0;
    this.shortcuts.forEach(s => {
      maxIconCol = Math.max(maxIconCol, s.gridX + (s.spanX || 1));
      maxIconRow = Math.max(maxIconRow, s.gridY + (s.spanY || 1));
    });

    // If benchmark is not set yet, adopt the current viewport
    if (this.benchmarkCols === 0) this.benchmarkCols = viewportCols;
    if (this.benchmarkRows === 0) this.benchmarkRows = viewportRows;

    const currentCols = Math.max(viewportCols, this.benchmarkCols, maxIconCol);
    const currentRows = Math.max(viewportRows, this.benchmarkRows, maxIconRow);

    // Diagnostic Logging
    if (window.__DEBUG_DESKTOP__ || true) {
      console.log('📐 Grid Size Calculation:', {
        viewport: `${viewportCols}x${viewportRows}`,
        benchmark: `${this.benchmarkCols}x${this.benchmarkRows}`,
        icons: `${maxIconCol}x${maxIconRow}`,
        result: `${currentCols}x${currentRows}`
      });
    }

    // Update benchmark if current viewport is larger (only if not currently loading state)
    if (!this.isLoadingShortcuts) {
      if (viewportCols > this.benchmarkCols) this.benchmarkCols = viewportCols;
      if (viewportRows > this.benchmarkRows) this.benchmarkRows = viewportRows;
    }

    // Calculate total grid pixel dimensions
    const totalWidth = currentCols * this.GRID_WIDTH;
    const totalHeight = currentRows * this.GRID_HEIGHT;

    // Update container size to match the grid (plus padding)
    // We use a fixed 20px padding (40px total) around the grid inside the container
    if (this.gridContainer) {
      this.gridContainer.style.width = (totalWidth + 40) + 'px';
      this.gridContainer.style.height = (totalHeight + 40) + 'px';
    }

    // FIXED OFFSETS: Centering is handled by CSS (margin: auto) on the gridContainer itself.
    // The internal grid always starts at 20, 20 relative to the container.
    const offsetX = 20;
    const offsetY = 20;

    return { offsetX, offsetY, gridCols: currentCols, gridRows: currentRows };
  }

  /**
   * Manually reset the benchmark to the current viewport size
   */
  resetBenchmark() {
    const viewportCols = Math.floor((window.innerWidth - 40) / this.GRID_WIDTH);
    const viewportRows = Math.floor((this.desktopArea ? this.desktopArea.offsetHeight : window.innerHeight - 134 - 40) / this.GRID_HEIGHT);
    
    this.benchmarkCols = viewportCols;
    this.benchmarkRows = viewportRows;
    
    console.log('👷 Grid Calibrated to:', this.benchmarkCols, 'x', this.benchmarkRows);
    this.repositionAllShortcuts();
    this.saveShortcuts();
    this.scrollToCenter('smooth');
    
    return { cols: this.benchmarkCols, rows: this.benchmarkRows };
  }

  /**
   * Automatically scroll the desktop to the center of the grid
   */
  scrollToCenter(behavior = 'auto') {
    if (!this.desktopArea || !this.gridContainer) return;

    // Use setImmediate/setTimeout to ensure dimensions are updated
    setTimeout(() => {
      const desktopWidth = this.desktopArea.clientWidth;
      const desktopHeight = this.desktopArea.clientHeight;
      const gridWidth = this.gridContainer.scrollWidth;
      const gridHeight = this.gridContainer.scrollHeight;

      const scrollLeft = Math.max(0, (gridWidth - desktopWidth) / 2);

      this.desktopArea.scrollTo({
        left: scrollLeft,
        top: 0,
        behavior: behavior
      });
      
      console.log(`🧭 Desktop Centered (Horizontal Only): ScrollLeft=${Math.round(scrollLeft)}`);
    }, 50);
  }

  hideDropIndicator() {
    if (this.dropIndicator) {
      this.dropIndicator.style.opacity = '0';
    }
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
        // Get drop position relative to gridContainer
        const rect = this.gridContainer.getBoundingClientRect();
        const pixelX = e.clientX - rect.left;
        const pixelY = e.clientY - rect.top;
        
        // Snap to grid
        const gridPos = this.snapToGrid(pixelX, pixelY);
        
        // Check if grid cell is already occupied by another shortcut
        // Determine spanning for the moved shortcut
        const spanX = shortcut.spanX || 1;
        const spanY = shortcut.spanY || 1;
        
        let occupied = null;
        for (let i = 0; i < spanX; i++) {
          for (let j = 0; j < spanY; j++) {
            const checkX = gridPos.gridX + i;
            const checkY = gridPos.gridY + j;
            const found = this.shortcuts.find(s => {
              if (s.id === shortcut.id) return false;
              const sSpanX = s.spanX || 1;
              const sSpanY = s.spanY || 1;
              return (checkX >= s.gridX && checkX < s.gridX + sSpanX &&
                      checkY >= s.gridY && checkY < s.gridY + sSpanY);
            });
            if (found) { occupied = found; break; }
          }
          if (occupied) break;
        }
        
        if (occupied) {
          console.log('⚠️ Grid cell occupied! Swapping with:', occupied.name);
          // Only swap if both are 1x1, otherwise cancel
          const occSpanX = occupied.spanX || 1;
          const occSpanY = occupied.spanY || 1;
          
          if (spanX === 1 && spanY === 1 && occSpanX === 1 && occSpanY === 1) {
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
            console.log('⚠️ Differently sized items cannot be swapped! Move canceled.');
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
          // Get drop position relative to gridContainer
          const rect = this.gridContainer.getBoundingClientRect();
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
    }
    // Handle widget drops from widget selector
    else if (dragData && dragData.source === 'widget-selector') {
      const widgetName = dragData.widgetName;
      console.log('Creating widget:', widgetName);
      
      // Generate unique ID for widget instance
      const widgetId = 'widget-' + widgetName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      
      // Get drop position relative to gridContainer
      const rect = this.gridContainer.getBoundingClientRect();
      const pixelX = e.clientX - rect.left;
      const pixelY = e.clientY - rect.top;
      
      // Snap to grid
      const gridPos = this.snapToGrid(pixelX, pixelY);
      
      let spanX = 2; // Industry standard widgets 2x2
      let spanY = 2;

      if (dragData.widgetType === 'welcomeclock') {
        spanX = 4;
        spanY = 2;
      }
      
      // Check if ANY cell in the 2x2 footprint is already occupied
      let isOccupied = false;
      for (let i = 0; i < spanX; i++) {
        for (let j = 0; j < spanY; j++) {
           const checkX = gridPos.gridX + i;
           const checkY = gridPos.gridY + j;
           const occupied = this.shortcuts.find(s => {
             const sSpanX = s.spanX || 1;
             const sSpanY = s.spanY || 1;
             return (checkX >= s.gridX && checkX < s.gridX + sSpanX &&
                     checkY >= s.gridY && checkY < s.gridY + sSpanY);
           });
           if (occupied) {
             isOccupied = true;
           }
        }
      }
      
      if (isOccupied) {
        console.log('⚠️ Grid cell already occupied! Cannot place widget', widgetName);
        return;
      }
      
      // Create widget shortcut
      const widget = {
        id: widgetId,
        name: widgetName,
        widgetType: dragData.widgetType, // Use the type from factory
        isWidget: true,
        spanX: spanX,
        spanY: spanY,
        timestamp: Date.now(),
        gridX: gridPos.gridX,
        gridY: gridPos.gridY,
        x: gridPos.x,
        y: gridPos.y
      };
      
      this.shortcuts.push(widget);
      this.saveShortcuts();
      this.renderShortcut(widget);
      
      console.log('✓ Added widget:', widgetName);
      console.log('✓ Placed at: Row', gridPos.gridY + 1, 'Column', gridPos.gridX + 1);
    }
    else {
      console.warn('✗ Invalid drag data source:', dragData?.source);
    }
  }

  canResizeShortcut(appId, newSpanX, newSpanY) {
    const shortcut = this.shortcuts.find(s => s.id === appId);
    if (!shortcut) return false;

    // Fixed bounds are no longer relevant in a benchmark grid, 
    // but we can enforce a sane upper limit if needed.
    const maxCols = 100;
    const maxRows = 100;

    // Check bounds
    if (shortcut.gridX + newSpanX > maxCols || shortcut.gridY + newSpanY > maxRows) {
      return false; // Exceeds screen bounds
    }

    // Check overlaps
    for (let i = 0; i < newSpanX; i++) {
      for (let j = 0; j < newSpanY; j++) {
        const checkX = shortcut.gridX + i;
        const checkY = shortcut.gridY + j;

        const occupied = this.shortcuts.find(s => {
          if (s.id === shortcut.id) return false; // Ignore self
          const sSpanX = s.spanX || 1;
          const sSpanY = s.spanY || 1;
          return (checkX >= s.gridX && checkX < s.gridX + sSpanX &&
                  checkY >= s.gridY && checkY < s.gridY + sSpanY);
        });

        if (occupied) return false; // Collision detected
      }
    }

    return true; // Space is available
  }

  resizeShortcut(appId, newSpanX, newSpanY) {
    const shortcut = this.shortcuts.find(s => s.id === appId);
    if (!shortcut) return false;

    if (!this.canResizeShortcut(appId, newSpanX, newSpanY)) {
      console.warn(`Cannot resize ${shortcut.name}: Not enough space.`);
      return false;
    }

    // Update dimensions
    shortcut.spanX = newSpanX;
    shortcut.spanY = newSpanY;
    this.saveShortcuts();

    // Update visuals
    const shortcutEl = document.getElementById(`shortcut-${shortcut.id}`);
    if (shortcutEl) {
      const shortcutWidth = newSpanX === 1 ? 80 : (newSpanX * this.GRID_WIDTH - 10);
      const shortcutHeight = newSpanY === 1 ? 90 : (newSpanY * this.GRID_HEIGHT - 10);
      
      shortcutEl.style.width = shortcutWidth + 'px';
      if (!shortcut.isWidget) {
        shortcutEl.style.height = shortcutHeight + 'px';
      }
      
      // Notify widget content of resize
      const iconContainer = shortcutEl.querySelector('.shortcut-icon-container');
      if (iconContainer) {
        iconContainer.style.width = '100%';
        iconContainer.style.height = '100%';
      }
      
      // Dispatch event to local window so the widget itself can react (e.g., render differently)
      shortcutEl.dispatchEvent(new CustomEvent('widget-resized', {
        bubbles: true,
        detail: { spanX: newSpanX, spanY: newSpanY }
      }));
    }

    console.log(`✓ Resized ${shortcut.name} to ${newSpanX}x${newSpanY}`);
    return true;
  }

  addShortcut(app, gridX = 0, gridY = 0) {
    const { offsetX, offsetY } = this.getGridOffsets();
    
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
      x: gridX * this.GRID_WIDTH + offsetX,
      y: gridY * this.GRID_HEIGHT + offsetY
    };

    this.shortcuts.push(shortcut);
    this.saveShortcuts();
    this.renderShortcut(shortcut);
  }

  snapToGrid(pixelX, pixelY) {
    const { offsetX, offsetY, gridCols, gridRows } = this.getGridOffsets();
    
    // Convert pixel coordinates to grid coordinates using dynamic offsets
    const gridX = Math.floor((pixelX - offsetX) / this.GRID_WIDTH);
    const gridY = Math.floor((pixelY - offsetY) / this.GRID_HEIGHT);

    const maxGridX = Math.max(0, gridCols - 1);
    const maxGridY = Math.max(0, gridRows - 1);

    // Ensure within bounds
    const boundedGridX = Math.max(0, Math.min(gridX, maxGridX));
    const boundedGridY = Math.max(0, Math.min(gridY, maxGridY));

    return {
      gridX: boundedGridX,
      gridY: boundedGridY,
      x: boundedGridX * this.GRID_WIDTH + offsetX + 5,
      y: boundedGridY * this.GRID_HEIGHT + offsetY + 5
    };
  }

  renderShortcut(shortcut) {
    const spanX = shortcut.spanX || 1;
    const spanY = shortcut.spanY || 1;
    const shortcutWidth = spanX === 1 ? 80 : (spanX * this.GRID_WIDTH - 10);
    const shortcutHeight = spanY === 1 ? 90 : (spanY * this.GRID_HEIGHT - 10);

    const { offsetX, offsetY } = this.getGridOffsets();
    const x = shortcut.gridX * this.GRID_WIDTH + offsetX + 5;
    const y = shortcut.gridY * this.GRID_HEIGHT + offsetY + 5;

    const shortcutEl = document.createElement('div');
    shortcutEl.className = 'desktop-shortcut draggable-shortcut' + (shortcut.isWidget ? ' desktop-widget-item' : '');
    shortcutEl.id = `shortcut-${shortcut.id}`;
    shortcutEl.draggable = true;
    shortcutEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: ${shortcut.isWidget ? '0' : '8px'};
      cursor: grab;
      border-radius: ${shortcut.isWidget ? '28px' : '8px'};
      user-select: none;
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${shortcutWidth}px;
      height: ${shortcutHeight}px;
      min-height: ${shortcut.isWidget ? 'min-content' : 'auto'};
      transition: left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), top 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.2s ease, background-color 0.2s ease;
      ${shortcut.isWidget ? '' : `background-color: transparent;`}
    `;

    const iconContainer = document.createElement('div');
    iconContainer.className = 'shortcut-icon-container';
    
    // Setup Icon/Widget Content
    const nameEl = document.createElement('div'); 

    if (shortcut.isWidget) {
      iconContainer.style.cssText = `
        width: 100%;
        height: 100%;
        border-radius: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        transition: all 0.2s ease;
        position: relative;
      `;
      const functionalWidget = WidgetFactory.create(shortcut.widgetType || 'placeholder', shortcut.id);
      iconContainer.appendChild(functionalWidget);
    } else {
      iconContainer.style.cssText = `
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, ${shortcut.color || '#007aff'} 0%, rgba(0,0,0,0.1) 100%);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transition: all 0.2s ease;
        flex-shrink: 0;
      `;

      // Prevent context menu on icon container
      iconContainer.addEventListener('contextmenu', (e) => e.preventDefault());

      if (shortcut.useCanvasIcon) {
        const canvas = document.createElement('canvas');
        canvas.id = `desktop-icon-canvas-${shortcut.id}-${Date.now()}`;
        canvas.width = 96;
        canvas.height = 96;
        canvas.style.cssText = 'width: 100%; height: 100%; display: block; pointer-events: none;';
        iconContainer.appendChild(canvas);
        setTimeout(() => {
          if (typeof generateUltimateMacIcon === 'function') {
            generateUltimateMacIcon(canvas.id, 96);
          }
        }, 100);
      } else if (shortcut.icon && (shortcut.icon.startsWith('/') || shortcut.icon.startsWith('http'))) {
        const img = document.createElement('img');
        img.src = shortcut.icon;
        img.alt = shortcut.name;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none;';
        iconContainer.appendChild(img);
      } else {
        const emoji = document.createElement('span');
        emoji.textContent = shortcut.icon || '📱';
        emoji.style.cssText = 'font-size: 24px; pointer-events: none;';
        iconContainer.appendChild(emoji);
      }

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
        pointer-events: none;
      `;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'shortcut-delete-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.style.cssText = `
      position: absolute;
      top: -10px;
      right: -10px;
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
      z-index: 10;
    `;

    // Events State
    let touchTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let isLongPressing = false;
    let isMobileDragging = false;

    shortcutEl.addEventListener('mouseenter', () => {
      shortcutEl.style.transform = 'scale(1.05)';
      if (!shortcut.isWidget) shortcutEl.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      deleteBtn.style.opacity = '1';
      deleteBtn.classList.add('visible');
    });

    shortcutEl.addEventListener('mouseleave', () => {
      shortcutEl.style.transform = 'scale(1)';
      if (!shortcut.isWidget) shortcutEl.style.backgroundColor = 'transparent';
      deleteBtn.style.opacity = '0';
      deleteBtn.classList.remove('visible');
    });

    shortcutEl.addEventListener('click', (e) => {
      if (deleteBtn.classList.contains('visible') && !deleteBtn.contains(e.target)) {
        deleteBtn.style.opacity = '0';
        deleteBtn.classList.remove('visible');
        if (!shortcut.isWidget) shortcutEl.style.backgroundColor = 'transparent';
        shortcutEl.style.transform = 'scale(1)';
        return;
      }
      if (!deleteBtn.contains(e.target) && !isLongPressing) {
        this.launchApp(shortcut);
      }
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeShortcut(shortcut.id);
    });

    shortcutEl.addEventListener('dragstart', (e) => {
      // Recalculate dimensions dynamically for resized widgets
      const currentSpanX = shortcut.spanX || 1;
      const currentSpanY = shortcut.spanY || 1;
      const currentWidth = currentSpanX === 1 ? 80 : (currentSpanX * this.GRID_WIDTH - 10);
      const currentHeight = currentSpanY === 1 ? 90 : (currentSpanY * this.GRID_HEIGHT - 10);

      window.activeDragSpanX = currentSpanX;
      window.activeDragSpanY = currentSpanY;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        source: 'desktop',
        appId: shortcut.id,
        appName: shortcut.name,
        isRepositioning: true
      }));

      const dragImage = iconContainer.cloneNode(true);
      dragImage.style.cssText += `
        position: absolute; top: -9999px;
        width: ${currentWidth}px; height: ${shortcut.isWidget ? 'auto' : currentHeight + 'px'};
        opacity: 0.95; transform: scale(1.05); filter: drop-shadow(0 10px 30px rgba(0,0,0,0.3));
        border-radius: ${shortcut.isWidget ? '28px' : '12px'};
      `;
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, currentWidth/2, currentHeight/2);
      setTimeout(() => dragImage.remove(), 0);
      shortcutEl.style.opacity = '0.5';
    });

    shortcutEl.addEventListener('dragend', () => {
      shortcutEl.style.opacity = '1';
      shortcutEl.style.backgroundColor = 'transparent';
    });

    shortcutEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isLongPressing = false;
      touchTimer = setTimeout(() => {
        isLongPressing = true;
        shortcutEl.style.transform = 'scale(1.05)';
        if (!shortcut.isWidget) shortcutEl.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        deleteBtn.style.opacity = '1';
        deleteBtn.classList.add('visible');
        touchTimer = null;
      }, 500);
    }, { passive: true });

    shortcutEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const moveX = e.touches[0].clientX - touchStartX;
        const moveY = e.touches[0].clientY - touchStartY;
        const dist = Math.sqrt(moveX * moveX + moveY * moveY);
        if (dist > 10) {
          if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
          if (!isLongPressing && !isMobileDragging) {
            isMobileDragging = true;
            shortcutEl.style.opacity = '0.6';
          }
        }
        if (isMobileDragging) {
          e.preventDefault();
          const t = e.touches[0];
          const rect = this.gridContainer.getBoundingClientRect();
          const pixelX = t.clientX - rect.left;
          const pixelY = t.clientY - rect.top;
          const gridPos = this.snapToGrid(pixelX, pixelY);
          shortcutEl.style.left = gridPos.x + 'px';
          shortcutEl.style.top = gridPos.y + 'px';
        }
      }
    }, { passive: false });

    shortcutEl.addEventListener('touchend', (e) => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      if (isMobileDragging) {
        const lastTouch = e.changedTouches[0];
        const rect = this.gridContainer.getBoundingClientRect();
        const pixelX = lastTouch.clientX - rect.left;
        const pixelY = lastTouch.clientY - rect.top;
        const gridPos = this.snapToGrid(pixelX, pixelY);
        shortcut.gridX = gridPos.gridX;
        shortcut.gridY = gridPos.gridY;
        shortcut.x = gridPos.x;
        shortcut.y = gridPos.y;
        shortcutEl.style.left = shortcut.x + 'px';
        shortcutEl.style.top = shortcut.y + 'px';
        shortcutEl.style.opacity = '1';
        this.saveShortcuts();
        isMobileDragging = false;
      } else if (!isLongPressing && !deleteBtn.contains(e.target)) {
        this.launchApp(shortcut);
      }
      isLongPressing = false;
    });

    shortcutEl.appendChild(iconContainer);
    if (!shortcut.isWidget) shortcutEl.appendChild(nameEl);
    shortcutEl.appendChild(deleteBtn);
    this.gridContainer.appendChild(shortcutEl);
    return shortcutEl;
  }

  launchApp(shortcut) {
    const app = window.availableAppsForLaunchpad?.find(a => a.id === shortcut.id);
    if (app) app.action();
  }

  removeShortcut(appId) {
    // Sync deletion to server for specific widget types (like Notes)
    const shortcut = this.shortcuts.find(s => s.id === appId);
    if (shortcut && shortcut.isWidget) {
      if (shortcut.widgetType === 'notes') {
        console.log(`🗑️ Deleting quick note data for: ${appId}`);
        fetch(`/api/quick-notes/${appId}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(data => {
            if (data.success) console.log(`✓ Note ${appId} deleted from server`);
          })
          .catch(err => console.error('✗ Failed to delete note from server:', err));
      } else if (shortcut.widgetType === 'reminders') {
        console.log(`🗑️ Deleting reminders data for: ${appId}`);
        fetch(`/api/reminders/${appId}`, { method: 'DELETE' })
          .then(res => res.json())
          .then(data => {
            if (data.success) console.log(`✓ Reminders ${appId} deleted from server`);
          })
          .catch(err => console.error('✗ Failed to delete reminders from server:', err));
      }
    }

    this.shortcuts = this.shortcuts.filter(s => s.id !== appId);
    this.saveShortcuts();
    const shortcutEl = document.getElementById(`shortcut-${appId}`);
    if (shortcutEl) {
      shortcutEl.style.opacity = '0';
      shortcutEl.style.transform = 'scale(0.8)';
      setTimeout(() => shortcutEl.remove(), 200);
    }
  }

  async loadShortcuts() {
    this.isLoadingShortcuts = true;
    try {
      console.log('📡 Fetching desktop state from server...');
      const response = await fetch('/api/desktop/state');
      const data = await response.json();

      if (data.success && data.state) {
        // Handle both new object-based format and old array-only format
        if (Array.isArray(data.state)) {
          this.shortcuts = data.state;
          console.log('✓ Desktop state loaded (old format):', this.shortcuts.length, 'items');
        } else if (typeof data.state === 'object') {
          this.shortcuts = data.state.state || [];
          
          if (data.state.metadata) {
            this.benchmarkCols = data.state.metadata.benchmarkCols || this.benchmarkCols;
            this.benchmarkRows = data.state.metadata.benchmarkRows || this.benchmarkRows;
          }
          console.log('✓ Desktop state loaded (new format):', this.shortcuts.length, 'items');
        }
        
        // Sync to localStorage as backup
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
          state: this.shortcuts,
          metadata: {
            benchmarkCols: this.benchmarkCols,
            benchmarkRows: this.benchmarkRows
          }
        }));
      } else {
        // Fallback to localStorage if no server state or error
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
          this.shortcuts = JSON.parse(saved);
          console.log('ℹ Desktop state loaded from localStorage (fallback):', this.shortcuts.length, 'items');
          // Try to sync to server if we just loaded from local
          this.saveShortcuts();
        } else {
          console.log('ℹ No desktop state found, starting fresh');
          this.shortcuts = [];
        }
      }
    } catch (error) {
      console.warn('✗ Failed to fetch desktop state from server, falling back to localStorage:', error);
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.shortcuts = JSON.parse(saved);
      }
    }

    this.renderShortcuts();
    this.scrollToCenter();
    this.isLoadingShortcuts = false;
  }

  renderShortcuts() {
    // Clear existing shortcuts from UI
    if (this.desktopArea) {
      const existingShortcuts = this.desktopArea.querySelectorAll('.desktop-shortcut');
      existingShortcuts.forEach(el => el.remove());
    }

    this.shortcuts.forEach(shortcut => {
      this.renderShortcut(shortcut);
    });
  }

  async saveShortcuts() {
    // Save to localStorage immediately for fast local persistence
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.shortcuts));
    
    // Debounce server sync to avoid spamming the API
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    
    this._saveTimeout = setTimeout(async () => {
      try {
        console.log('📡 Syncing desktop state to server...');
        const response = await fetch('/api/desktop/state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            state: this.shortcuts,
            metadata: {
              benchmarkCols: this.benchmarkCols,
              benchmarkRows: this.benchmarkRows
            }
          })
        });
        
        const data = await response.json();
        if (data.success) {
          console.log('✓ Desktop state synced to server successfully');
        } else {
          console.error('✗ Failed to sync desktop state to server:', data.error);
        }
      } catch (error) {
        console.error('✗ Error syncing desktop state to server:', error);
      }
    }, 1000); // 1-second debounce
  }

  /**
   * Physically reposition all shortcuts to match current grid offsets
   * Used on window resize.
   */
  repositionAllShortcuts() {
    const { offsetX, offsetY } = this.getGridOffsets();
    
    this.shortcuts.forEach(shortcut => {
      // Update the logical coordinates in the shortcut object
      shortcut.x = shortcut.gridX * this.GRID_WIDTH + offsetX + 5;
      shortcut.y = shortcut.gridY * this.GRID_HEIGHT + offsetY + 5;
      
      // Update physical position in DOM
      const shortcutEl = document.getElementById(`shortcut-${shortcut.id}`);
      if (shortcutEl) {
        shortcutEl.style.left = shortcut.x + 'px';
        shortcutEl.style.top = shortcut.y + 'px';
      }
    });
    
    // Note: We don't necessarily need to save to server here immediately 
    // because gridX/gridY didn't change, only physical mapping.
    
    // Refresh debug grid if visible
    if (this.gridOverlay && this.gridOverlay.style.display !== 'none') {
      this.drawGrid();
    }
  }

  /**
   * Toggle the visual grid overlay for debugging
   */
  toggleGrid(forceState = null) {
    if (!this.gridOverlay) {
      this.gridOverlay = document.createElement('div');
      this.gridOverlay.id = 'desktopGridOverlay';
      this.gridOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        display: none;
      `;
      this.gridContainer.appendChild(this.gridOverlay);
    }

    const isVisible = forceState !== null ? forceState : (this.gridOverlay.style.display === 'none');
    
    if (isVisible) {
      this.gridOverlay.style.display = 'block';
      this.drawGrid();
      console.log('👷 Grid Debug View: ENABLED');
    } else {
      this.gridOverlay.style.display = 'none';
      console.log('👷 Grid Debug View: DISABLED');
    }

    // Persist preference
    localStorage.setItem('desktop_show_grid', isVisible);
  }

  /**
   * Refresh the debug grid design
   */
  drawGrid() {
    if (!this.gridOverlay) return;
    
    const { offsetX, offsetY, gridCols, gridRows } = this.getGridOffsets();
    
    // Set fixed size for the overlay to match container
    this.gridOverlay.style.width = '100%';
    this.gridOverlay.style.height = '100%';
    
    // Use CSS repeating linear gradients for efficiency
    this.gridOverlay.style.background = `
      linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
    `;
    this.gridOverlay.style.backgroundSize = `${this.GRID_WIDTH}px ${this.GRID_HEIGHT}px`;
    this.gridOverlay.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    
    // Add a border to show the actual grid bounds
    const gridWidth = gridCols * this.GRID_WIDTH;
    const gridHeight = gridRows * this.GRID_HEIGHT;
    
    // Remove old bounds if any
    const oldBounds = this.gridOverlay.querySelector('.grid-bounds');
    if (oldBounds) oldBounds.remove();
    
    const bounds = document.createElement('div');
    bounds.className = 'grid-bounds';
    bounds.style.cssText = `
      position: absolute;
      left: ${offsetX}px;
      top: ${offsetY}px;
      width: ${gridWidth}px;
      height: ${gridHeight}px;
      border: 2px dashed rgba(0, 122, 255, 0.5);
      box-sizing: border-box;
    `;
    this.gridOverlay.appendChild(bounds);
  }
}

// Initialize desktop manager when available apps are ready
window.desktopManager = null;

function initializeDesktop() {
  if (!window.desktopManager && Array.isArray(window.availableAppsForLaunchpad) && window.availableAppsForLaunchpad.length > 0) {
    window.desktopManager = new DesktopManager();
  }
}

// Initialize quietly once prerequisites exist (avoids noisy retries/log spam)
function scheduleDesktopInit() {
  const maxAttempts = 40; // ~4s at 100ms
  let attempts = 0;

  const tick = () => {
    attempts += 1;
    initializeDesktop();
    if (window.desktopManager || attempts >= maxAttempts) return;
    setTimeout(tick, 100);
  };

  tick();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleDesktopInit, { once: true });
} else {
  scheduleDesktopInit();
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.DesktopManager = DesktopManager;
}
