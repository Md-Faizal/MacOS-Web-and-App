// ========================================
// DESKTOP WIDGETS INTERFACE
// ========================================
import { WidgetFactory } from './widget-factory.js';

export class DesktopWidgetsPanel {
  constructor() {
    this.panel = null;
    this.dock = null;
    this.isOpen = false;
    
    // Widget categories with icons
    this.categories = [
      { name: 'All Widgets', icon: '⊞' },
      { name: 'Batteries', icon: '🔋' },
      { name: 'Calendar', icon: '📅' },
      { name: 'Clock', icon: '⏰' },
      { name: 'Contacts', icon: '👥' },
      { name: 'Find My', icon: '📍' },
      { name: 'Home', icon: '🏠' },
      { name: 'Journal', icon: '📖' },
      { name: 'News', icon: '📰' },
      { name: 'Notes', icon: '📝' },
      { name: 'Reminders', icon: '✓' },
      { name: 'Weather', icon: '⛅' }
    ];
    
    // Functional widgets for each category
    this.widgets = {
      'All Widgets': [
        { name: 'Moon Clock', type: 'clock', category: 'Clock' },
        { name: 'Digital Clock', type: 'welcomeclock', category: 'Clock' },
        { name: 'Calendar', type: 'calendar', category: 'Calendar' },
        { name: 'Weather', type: 'weather', category: 'Weather' },
        { name: 'Battery', type: 'battery', category: 'Batteries' },
        { name: 'Notes', type: 'notes', category: 'Notes' },
        { name: 'Reminders', type: 'reminders', category: 'Reminders' }
      ],
      'Calendar': [
        { name: 'Calendar', type: 'calendar', category: 'Calendar' }
      ],
      'Clock': [
        { name: 'Moon Clock', type: 'clock', category: 'Clock' },
        { name: 'Digital Clock', type: 'welcomeclock', category: 'Clock' }
      ],
      'Batteries': [
        { name: 'Battery', type: 'battery', category: 'Batteries' }
      ],
      'Weather': [
        { name: 'Weather', type: 'weather', category: 'Weather' }
      ],
      'Notes': [
        { name: 'Notes', type: 'notes', category: 'Notes' }
      ],
      'Reminders': [
        { name: 'Reminders', type: 'reminders', category: 'Reminders' }
      ]
    };
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;

    // Add Escape key listener
    this._handleEsc = (e) => {
      if (e.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this._handleEsc);

    // Ensure widgets CSS is loaded
    if (!document.getElementById('widgetsStyles')) {
      const link = document.createElement('link');
      link.id = 'widgetsStyles';
      link.rel = 'stylesheet';
      link.href = '/modules/widgets/css/widgets.css';
      document.head.appendChild(link);
    }

    // Hide the dock
    this.dock = document.querySelector('.dock-container') || document.querySelector('[class*="dock"]');
    if (this.dock) {
      this.dock.style.display = 'none';
    }

    // Create the widget panel
    this.panel = document.createElement('div');
    this.panel.id = 'desktopWidgetsPanel';
    this.panel.className = 'desktop-widgets-panel';
    
    // Create the header
    const header = document.createElement('div');
    header.className = 'widgets-header';
    
    const title = document.createElement('div');
    title.className = 'widgets-title';
    title.textContent = 'Drag widgets anywhere on the desktop.';
    header.appendChild(title);
    
    const doneBtn = document.createElement('button');
    doneBtn.className = 'widgets-done-btn';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => this.close());
    header.appendChild(doneBtn);

    // Create the main content area
    const content = document.createElement('div');
    content.className = 'widgets-content';

    // Create the sidebar with categories
    const sidebar = document.createElement('div');
    sidebar.className = 'widgets-sidebar';

    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'widgets-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.className = 'widgets-search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search Widgets';
    searchContainer.appendChild(searchInput);
    sidebar.appendChild(searchContainer);

    // Create separator
    const separator = document.createElement('div');
    separator.className = 'widgets-separator';
    sidebar.appendChild(separator);

    // Create categories container
    const categoriesContainer = document.createElement('div');
    categoriesContainer.className = 'widgets-categories-container';

    this.categories.forEach((category, index) => {
      const categoryBtn = document.createElement('div');
      categoryBtn.className = 'widgets-category';
      if (index === 0) categoryBtn.classList.add('active');
      
      const iconSpan = document.createElement('span');
      iconSpan.className = 'category-icon';
      iconSpan.textContent = category.icon;
      categoryBtn.appendChild(iconSpan);
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'category-name';
      nameSpan.textContent = category.name;
      categoryBtn.appendChild(nameSpan);
      
      categoryBtn.addEventListener('click', (e) => this.selectCategory(category.name, e.currentTarget));
      categoriesContainer.appendChild(categoryBtn);
    });

    sidebar.appendChild(categoriesContainer);

    content.appendChild(sidebar);

    // Create the widgets grid
    const gridContainer = document.createElement('div');
    gridContainer.className = 'widgets-grid-container';

    const categoryLabel = document.createElement('div');
    categoryLabel.className = 'widgets-category-label';
    categoryLabel.textContent = 'Widget categories';
    gridContainer.appendChild(categoryLabel);

    const grid = document.createElement('div');
    grid.className = 'widgets-grid';
    grid.id = 'widgetsGrid';

    // Display default widgets
    this.displayWidgets('All Widgets', grid);

    gridContainer.appendChild(grid);
    content.appendChild(gridContainer);

    this.panel.appendChild(content);
    
    // Append header at bottom
    this.panel.appendChild(header);

    // Add to body
    document.body.appendChild(this.panel);
  }

  selectCategory(category, clickedElement) {
    // Update active category
    document.querySelectorAll('.widgets-category').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Find the actual category button (could be a child element that was clicked)
    let categoryBtn = clickedElement;
    if (!categoryBtn.classList.contains('widgets-category')) {
      categoryBtn = clickedElement.closest('.widgets-category');
    }
    
    if (categoryBtn) {
      categoryBtn.classList.add('active');
    }

    // Update grid
    const grid = document.getElementById('widgetsGrid');
    grid.innerHTML = '';
    this.displayWidgets(category, grid);
  }

  hideOpenApps() {
    // Find and hide all open app windows (excluding top bar and widget selector)
    const appElements = document.querySelectorAll('[class*="window"], [class*="modal"], [class*="app"], .app-window, .window-container');
    const openApps = [];
    
    appElements.forEach(app => {
      // Skip top bar, desktop-widgets-panel, and hidden elements
      if (app.offsetParent !== null && 
          app !== this.panel && 
          !app.classList.contains('desktop-widgets-panel') &&
          !app.classList.contains('app-bar') &&
          !app.classList.contains('top-bar') &&
          !app.classList.contains('status-bar')) {
        openApps.push({
          element: app,
          opacity: app.style.opacity,
          pointerEvents: app.style.pointerEvents,
          transition: app.style.transition
        });
        // Softly blur and block pointer events on open apps so desktop is accessible
        app.style.transition = 'all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
        app.style.opacity = '0.3';
        app.style.pointerEvents = 'none';
      }
    });
    
    // Gracefully fade away the widget selector panel and show dock
    if (this.panel) {
      this.panel.classList.add('receding');
      
      openApps.unshift({
        element: this.panel,
        isPanel: true,
        transition: this.panel.style.transition
      });
      
      this.panel.style.transition = 'all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
      
      if (this.dock) {
        openApps.unshift({
          element: this.dock,
          opacity: this.dock.style.opacity || '0',
          display: this.dock.style.display || 'none',
          transition: this.dock.style.transition
        });
        this.dock.style.transition = 'opacity 0.4s ease';
        this.dock.style.display = '';
        // Force reflow
        void this.dock.offsetWidth;
        this.dock.style.opacity = '1';
      }
    }
    
    return openApps;
  }

  showOpenApps(openApps) {
    // Find the dock entry to handle it first for the "sequential" repair effect
    const dockEntry = openApps.find(app => app.element === this.dock);
    const otherEntries = openApps.filter(app => app.element !== this.dock);

    const restoreOthers = () => {
      otherEntries.forEach(app => {
        const originalTransition = app.transition;
        
        if (app.isPanel) {
          // Smooth glide back for the panel using the CSS class removal
          app.element.style.transition = 'all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
          app.element.classList.remove('receding');
          
          setTimeout(() => {
            if (app.element) app.element.style.transition = app.transition || '';
          }, 400);
        } else {
          // Restore dimmed apps
          app.element.style.opacity = app.opacity;
          app.element.style.pointerEvents = app.pointerEvents;
          
          setTimeout(() => {
            if (app.element) app.element.style.transition = originalTransition || '';
          }, 400);
        }
      });
    };

    if (dockEntry) {
      // Step 1: Fade out the dock first
      dockEntry.element.style.transition = 'opacity 0.3s ease';
      dockEntry.element.style.opacity = dockEntry.opacity || '0';
      
      // Step 2: Once dock is faded, restore the panel and apps
      setTimeout(() => {
        if (dockEntry.element) {
          dockEntry.element.style.display = dockEntry.display || 'none';
          dockEntry.element.style.transition = dockEntry.transition || '';
        }
        restoreOthers();
      }, 300);
    } else {
      restoreOthers();
    }
  }

  displayWidgets(category, grid) {
    const widgetsToShow = this.widgets[category] || this.widgets['All Widgets'];

    widgetsToShow.forEach(widget => {
      const widgetCard = document.createElement('div');
      widgetCard.className = 'widget-card';
      
      const previewContainer = document.createElement('div');
      previewContainer.className = 'widget-preview-area';
      // Use 200px height for breathing room (prevents clipping), overflow:visible, and -68px margin to pull name up
      previewContainer.style.cssText = 'width: 180px; height: 200px; margin-bottom: -68px; pointer-events: none; transform: scale(0.65); transform-origin: top center; overflow: visible; border-radius: 24px; padding-top: 10px;';
      
      // Use factory to create the actual live preview
      const functionalWidget = WidgetFactory.create(widget.type);
      
      // Special scaling for the huge Digital Clock in the preview modal
      if (widget.type === 'welcomeclock') {
        functionalWidget.style.transform = 'scale(0.45)';
        functionalWidget.style.transformOrigin = 'center';
        functionalWidget.style.marginTop = '-20px'; // Shift it up slightly 
      }
      
      previewContainer.appendChild(functionalWidget);
      
      const name = document.createElement('div');
      name.className = 'widget-name';
      name.textContent = widget.name;
      name.style.cssText = 'font-size: 13px; font-weight: 600; color: #333; position: relative; z-index: 2;';
      
      widgetCard.appendChild(previewContainer);
      widgetCard.appendChild(name);
      
      // Store reference to open apps during drag
      let hiddenApps = [];

      // Add robust custom pointer drag events instead of native HTML5 drag
      widgetCard.addEventListener('pointerdown', (e) => {
        // Only accept primary button or touch
        if (e.button !== 0 && e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;
        
        // Prevent default only if we decide it's a drag later to allow scrolling
        // e.preventDefault(); 
        
        const rect = widgetCard.getBoundingClientRect();
        let startX = e.clientX;
        let startY = e.clientY;
        let shiftX = e.clientX - rect.left;
        let shiftY = e.clientY - rect.top;
        
        let dragGhost = null;
        let isDragging = false;
        const dragThreshold = 10; // px
        
        const onPointerMove = (event) => {
          const dist = Math.hypot(event.clientX - startX, event.clientY - startY);
          
          if (!isDragging && dist > dragThreshold) {
            isDragging = true;
            
            // Start the actual drag
            if (navigator.vibrate) navigator.vibrate(10);
            
            // Create premium floating drag ghost
            dragGhost = widgetCard.cloneNode(true);
            dragGhost.style.cssText += `
              position: fixed;
              left: 0;
              top: 0;
              width: 180px;
              height: 200px;
              overflow: visible;
              z-index: 1000000;
              pointer-events: none;
              box-shadow: 0 30px 60px rgba(0,0,0,0.4);
              transform: translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.05);
              transition: transform 0.1s cubic-bezier(0.2, 0, 0.2, 1), opacity 0.2s;
              border-radius: 16px;
              opacity: 0.95;
              margin: 0;
              touch-action: none;
              will-change: transform;
            `;
            document.body.appendChild(dragGhost);
            
            // Recede open apps and modal
            hiddenApps = this.hideOpenApps();
            
            // Lock scrolling
            widgetCard.style.touchAction = 'none';
          }
          
          if (isDragging && dragGhost) {
            // Prevent scrolling now that we are dragging
            if (event.cancelable) event.preventDefault();
            
            // Use rAF for smoothness
            requestAnimationFrame(() => {
              if (!dragGhost) return;
              
              const currentX = event.clientX;
              const currentY = event.clientY;
              
              let finalX = currentX - shiftX;
              let finalY = currentY - shiftY;
              
              if (window.desktopManager) {
                const dsRect = window.desktopManager.gridContainer.getBoundingClientRect();
                const pixelX = currentX - dsRect.left;
                const pixelY = currentY - dsRect.top;
                
                // If over desktop, snap the GHOST itself for the "native" feel
                const isOverDesktop = currentX >= dsRect.left && currentX <= dsRect.right &&
                                     currentY >= dsRect.top && currentY <= dsRect.bottom;
                
                let spanX = 2;
                let spanY = 2;
                if (widget.type === 'welcomeclock') { spanX = 4; spanY = 2; }

                if (isOverDesktop) {
                  const gridPos = window.desktopManager.snapToGrid(pixelX, pixelY);
                  // Snap the ghost TO the grid pos (translated to global space)
                  finalX = gridPos.x + dsRect.left;
                  finalY = gridPos.y + dsRect.top;
                }
                
                window.desktopManager.updateDropIndicatorViaPixel(pixelX, pixelY, spanX, spanY);
              }
              
              dragGhost.style.transform = `translate3d(${finalX}px, ${finalY}px, 0) scale(1.05)`;
            });
          }
        };
        
        const onPointerUp = (event) => {
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          widgetCard.style.touchAction = '';
          
          if (!isDragging) return;
          
          let dropped = false;
          if (window.desktopManager) {
            window.desktopManager.hideDropIndicator();
            
            // Validate drop zone bounds
            const dsArea = window.desktopManager.desktopArea;
            if (dsArea) {
              const dsRect = dsArea.getBoundingClientRect();
              if (event.clientX >= dsRect.left && event.clientX <= dsRect.right &&
                  event.clientY >= dsRect.top && event.clientY <= dsRect.bottom) {
                
                const fakeDropEvent = { clientX: event.clientX, clientY: event.clientY };
                const dragData = {
                  widgetName: widget.name,
                  widgetType: widget.type,
                  source: 'widget-selector'
                };
                window.desktopManager.processDroppedApp(dragData, fakeDropEvent);
                dropped = true;
              }
            }
          }
          
          // Restore apps and modal
          if (hiddenApps.length > 0) {
            this.showOpenApps(hiddenApps);
          }

          if (dropped) {
             console.debug('✓ Widget successfully placed on desktop');
          }
          
          if (dragGhost) {
            dragGhost.style.transform = 'scale(0.8)';
            dragGhost.style.opacity = '0';
            setTimeout(() => dragGhost.remove(), 200);
          }
        };
        
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
      });

      grid.appendChild(widgetCard);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Remove Escape key listener
    if (this._handleEsc) {
      window.removeEventListener('keydown', this._handleEsc);
      this._handleEsc = null;
    }

    // Trigger close animation
    if (this.panel) {
      this.panel.classList.add('closing');
      
      // Remove after animation (0.8s animation)
      setTimeout(() => {
        if (this.panel && this.panel.parentNode) {
          this.panel.parentNode.removeChild(this.panel);
        }

        // Show dock again and ensure full opacity
        if (this.dock) {
          this.dock.style.display = '';
          this.dock.style.opacity = '1';
          this.dock.style.transition = '';
        }
      }, 800);
    }
  }
}
