// Dock Initialization and Management
function initializeDock() {
  window.initializeDock = initializeDock;
  const dockContainer = document.getElementById('dockContainer');
  
  // Check if dockContainer exists
  if (!dockContainer) {
    console.error('Dock container not found in the DOM');
    return;
  }

  // Define available apps first to calculate required slots
  const apps = [
    {
      id: 'ai-vision',
      name: 'AI Camera',
      icon: '/assets/Images/Siri_app.png',
      alt: 'AI Camera',
      color: '#000000',
      category: 'utilities',
      action: (params) => AppWindow.launchApp('ai-vision', window.AIVisionApp, 'aiVisionAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'launchpad',
      name: 'Launchpad',
      icon: '/assets/Images/Launchpad.png',
      alt: 'Launchpad',
      color: '#3b82f6',
      category: 'system',
      action: (params) => AppWindow.launchApp('launchpad', window.LaunchpadApp, 'launchpadAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'notes',
      name: 'Notes',
      icon: '/assets/Images/Notes.png',
      alt: 'Notes',
      color: '#ffd700',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('notes', window.NotesApp, 'notesAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'calculator',
      name: 'Calculator',
      icon: '/assets/Images/Calculator.png',
      alt: 'Calculator',
      color: '#e0e7ff',
      category: 'utilities',
      action: (params) => AppWindow.launchApp('calculator', window.Calculator, 'calculatorAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'calendar',
      name: 'Calendar',
      icon: '📅',
      useCanvasIcon: true,
      alt: 'Calendar',
      color: '#ffffff',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('calendar', window.CalendarApp, 'calendarAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'analytics',
      name: 'Analytics',
      icon: '/assets/Images/Analytics.png',
      alt: 'Analytics',
      color: '#8b5cf6',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('analytics', window.AnalyticsApp, 'analyticsAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'contacts',
      name: 'Contacts',
      icon: '/assets/Images/Contact.png',
      alt: 'Contacts',
      color: '#a78bfa',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('contacts', window.ContactsApp, 'contactsAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'products',
      name: 'Product List',
      icon: '/assets/Images/List.png',
      alt: 'Product List',
      color: '#00d4ff',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('products', window.ProductListApp, 'productAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'billing',
      name: 'Billing',
      icon: '/assets/Images/Billing.png?v=2',
      alt: 'Billing',
      color: '#3b82f6',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('billing', window.BillingApp, 'billingAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'cloud',
      name: 'Cloud',
      icon: '/assets/Images/Cloud.png',
      alt: 'Cloud',
      color: '#3b82f6',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: '/assets/Images/Settings.png',
      alt: 'Settings',
      color: '#94a3b8',
      category: 'utilities',
      action: (params) => AppWindow.launchApp('settings', window.SettingsApp, 'settingsAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
    }
  ];

  let allowedAppsList = null;
  try {
    const role = window.currentUserData?.role || sessionStorage.getItem('macos_user_role');
    if (role === 'worker') {
      const storedAllowed = sessionStorage.getItem('macos_allowed_apps');
      allowedAppsList = window.currentUserPermissions?.allowedApps || (storedAllowed ? JSON.parse(storedAllowed) : ['billing', 'products', 'contacts', 'analytics']);
    }
  } catch (e) {
    console.warn('Error reading worker permissions in dock:', e);
  }

  const availableApps = allowedAppsList 
    ? apps.filter(a => allowedAppsList.includes(a.id) || a.id === 'launchpad' || a.id === 'settings')
    : apps;
  window.availableAppsForLaunchpad = availableApps;
  
  if (typeof initializeDesktop === 'function') {
    initializeDesktop();
  }

  const STORAGE_KEY = 'appBarOrder';
  const RECENT_APP_KEY = 'recentAppUsed';

  // Swipe detection variables
  let touchStartX = 0;
  let touchEndX = 0;
  const SWIPE_THRESHOLD = 50; // Minimum distance for swipe

  // Swipe handler
  function handleSwipe() {
    const diff = touchEndX - touchStartX;
    const isLeftSwipe = diff < -SWIPE_THRESHOLD;
    const isRightSwipe = diff > SWIPE_THRESHOLD;

    if (isLeftSwipe) {
      // Scroll right on left swipe
      dockContainer.scrollLeft += 120;
    } else if (isRightSwipe) {
      // Scroll left on right swipe
      dockContainer.scrollLeft -= 120;
    }
  }

  // Touch events
  dockContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, false);

  dockContainer.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, false);

  // Mouse drag (for desktop)
  let isMouseDown = false;
  let mouseStartX = 0;
  let scrollLeft = 0;

  dockContainer.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    mouseStartX = e.pageX - dockContainer.offsetLeft;
    scrollLeft = dockContainer.scrollLeft;
    // Only set grabbing cursor if over a non-empty slot
    if (e.target.closest('.dock-slot:not(:empty)')) {
      dockContainer.style.cursor = 'grabbing';
    }
  });

  dockContainer.addEventListener('mouseleave', () => {
    isMouseDown = false;
    dockContainer.style.cursor = 'auto';
  });

  dockContainer.addEventListener('mouseup', () => {
    isMouseDown = false;
    dockContainer.style.cursor = 'auto';
  });

  dockContainer.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    e.preventDefault();
    const x = e.pageX - dockContainer.offsetLeft;
    const walk = (x - mouseStartX) * 1; // Sensitivity
    dockContainer.scrollLeft = scrollLeft - walk;
  });

  // Monitor container resize and update empty slot visibility
  const resizeObserver = new ResizeObserver(() => {
    updateEmptySlotVisibility();
  });
  resizeObserver.observe(dockContainer);

  // Also monitor window resize
  window.addEventListener('resize', () => {
    updateEmptySlotVisibility();
  });

  // Track currently open apps
  const openApps = new Set();
  const minimizedApps = new Set();

  // Function to update app state
  function setAppState(appId, state) {
    // state: 'open', 'minimized', 'closed'
    if (state === 'open') {
      openApps.add(appId);
      minimizedApps.delete(appId);
    } else if (state === 'minimized') {
      openApps.add(appId);
      minimizedApps.add(appId);
    } else if (state === 'closed') {
      openApps.delete(appId);
      minimizedApps.delete(appId);
    }
    renderApps();
  }

  // Expose launchApp globally
  window.appBar = {
    launchApp: (appId, params) => {
      const app = apps.find(a => a.id === appId);
      if (app) {
        app.action(params);
      } else {
        console.error(`App with ID ${appId} not found`);
      }
    }
  };

  // 1. Determine app order from localStorage
  let appOrder = JSON.parse(localStorage.getItem(STORAGE_KEY));
  
  // 2. Sync logic: Ensure all current apps (except settings) are reflected in appOrder
  const validAppIds = new Set(availableApps.filter(a => a.id !== 'settings').map(a => a.id));
  
  if (!appOrder || !Array.isArray(appOrder)) {
    // Initial order: All available apps (except settings)
    appOrder = availableApps.filter(a => a.id !== 'settings').map(a => a.id);
  } else {
    // Filter out apps that no longer exist or are settings
    appOrder = appOrder.filter(id => validAppIds.has(id));
    
    // Add new apps that aren't in the order yet
    for (const appId of validAppIds) {
      if (!appOrder.includes(appId)) {
        appOrder.push(appId);
      }
    }
  }
  
  // Save synced order
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appOrder));

  // 3. Set dynamic slot constants based on finalized appOrder
  const CURRENT_APP_COUNT = appOrder.length;
  const APP_SLOTS = CURRENT_APP_COUNT; 
  const SETTINGS_SLOT = APP_SLOTS;
  const RECENT_SLOT = APP_SLOTS + 1;
  const TOTAL_SLOTS = APP_SLOTS + 2;

  // Create app slots dynamically based on appOrder length
  dockContainer.innerHTML = '';
  for (let i = 0; i < APP_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'dock-slot';
    slot.id = `dock-slot-${i}`;
    slot.draggable = true;
    slot.setAttribute('data-slot-index', i);
    dockContainer.appendChild(slot);
  }

  // Add divider
  const divider = document.createElement('div');
  divider.className = 'dock-slot-divider';
  dockContainer.appendChild(divider);

  // Create special slots
  const settingsSlot = document.createElement('div');
  settingsSlot.className = 'dock-slot';
  settingsSlot.id = 'dock-slot-settings';
  settingsSlot.setAttribute('data-slot-index', 'settings');
  dockContainer.appendChild(settingsSlot);

  const recentSlot = document.createElement('div');
  recentSlot.className = 'dock-slot';
  recentSlot.id = 'dock-slot-recent';
  recentSlot.setAttribute('data-slot-index', 'recent');
  dockContainer.appendChild(recentSlot);

  // Setup slot drop listeners
  function setupSlotDropListeners() {
    document.querySelectorAll('.dock-slot').forEach(slot => {
      // Get slotIndex inside the listener to ensure it's fresh
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      }, false);

      slot.addEventListener('dragleave', (e) => {
        if (e.target === slot) {
          slot.classList.remove('drag-over');
        }
      }, false);

      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const slotIndex = slot.getAttribute('data-slot-index');
        
        // Handle drops from both dock and launchpad
        let dragData;
        try {
          dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
          dragData = null;
        }
        
        // Handle launchpad/desktop drag (has source: 'launchpad' or 'desktop')
        if (dragData && (dragData.source === 'launchpad' || dragData.source === 'desktop')) {
          const appId = dragData.appId;
          
          // Only allow dropping within app slots (0-7)
          if (typeof slotIndex === 'string' && (slotIndex === 'settings' || slotIndex === 'recent')) {
            slot.classList.remove('drag-over');
            return;
          }
          
          const targetSlotIndex = parseInt(slotIndex);
          
          if (isNaN(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= APP_SLOTS) {
            slot.classList.remove('drag-over');
            return;
          }
          
          if (!appId) {
            slot.classList.remove('drag-over');
            return;
          }
          
          // Add app to dock
          const currentIndex = appOrder.indexOf(appId);
          const targetApp = appOrder[targetSlotIndex];
          
          if (currentIndex !== -1) {
            // App already in dock, swap it
            appOrder[currentIndex] = targetApp;
            appOrder[targetSlotIndex] = appId;
          } else {
            // App not in dock, add it
            if (targetApp) {
              appOrder[currentIndex === -1 ? appOrder.indexOf(null) : currentIndex] = targetApp;
            }
            appOrder[targetSlotIndex] = appId;
          }
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify(appOrder));
          renderApps();
          slot.classList.remove('drag-over');
          return;
        }
        
        // Handle dock-to-dock drag (original logic)
        const appId = e.dataTransfer.getData('appId').replace('app-', '').replace('-recent', '');
        const isRecent = e.dataTransfer.getData('isRecent') === 'true';
        
        // Only allow dropping within app slots (0-7)
        if (typeof slotIndex === 'string' && (slotIndex === 'settings' || slotIndex === 'recent')) {
          slot.classList.remove('drag-over');
          return;
        }

        const targetSlotIndex = parseInt(slotIndex);
        
        // Validate target slot index is a valid number
        if (isNaN(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= APP_SLOTS) {
          slot.classList.remove('drag-over');
          return;
        }
        
        // Validate appId is not empty
        if (!appId) {
          slot.classList.remove('drag-over');
          return;
        }
        
        // Find current position of app in appOrder array FIRST
        const currentIndex = appOrder.indexOf(appId);
        
        // Check for duplicates (ignore recent app slot and the current position)
        if (!isRecent) {
          const isDuplicate = appOrder.some((existingAppId, index) => {
            return existingAppId === appId && index !== targetSlotIndex && index !== currentIndex && index < APP_SLOTS;
          });
          
          if (isDuplicate) {
            // Prevent duplicate placement
            slot.classList.remove('drag-over');
            return;
          }
        }
        
        // SWAP functionality: if target slot has an app, swap them
        const targetApp = appOrder[targetSlotIndex];
        const isSwapping = targetApp !== null && targetApp !== undefined;
        
        if (currentIndex !== -1) {
          appOrder[currentIndex] = targetApp; // Move target app to source slot
        }
        
        appOrder[targetSlotIndex] = appId; // Move dragged app to target slot
        
        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appOrder));

        // Re-render apps
        renderApps();

        // Trigger swap animation if apps swapped
        if (isSwapping) {
          setTimeout(() => {
            const draggedElement = document.getElementById(`app-${appId}`);
            const targetElement = document.getElementById(`app-${targetApp}`);
            
            if (draggedElement) {
              draggedElement.classList.add('swapping');
              setTimeout(() => draggedElement.classList.remove('swapping'), 450);
            }

            if (targetElement) {
              targetElement.classList.add('swapping');
              setTimeout(() => targetElement.classList.remove('swapping'), 450);
            }
          }, 50);
        }

        slot.classList.remove('drag-over');
      }, false);
    });
  }

  // Setup slot listeners after creating slots
  setupSlotDropListeners();

  // Populate slots with apps
  function renderApps() {
    // Clear all slots
        document.querySelectorAll('.dock-slot').forEach(slot => {
      slot.innerHTML = '';
    });

    // Place apps in correct positions based on appOrder array
    for (let i = 0; i < APP_SLOTS; i++) {
      const appId = appOrder[i];
      if (appId) {
        const app = availableApps.find(a => a.id === appId);
        if (app) {
          const slot = document.getElementById(`dock-slot-${i}`);
          const appElement = createAppElement(app);
          appElement.draggable = true;
          appElement.id = `app-${app.id}`;
          slot.appendChild(appElement);
          setupAppDragListeners(appElement, false);
        }
      }
    }

    // Add Settings app to slot 8
    const settingsSlot = document.getElementById('dock-slot-settings');
    const settingsAppObj = availableApps.find(a => a.id === 'settings');
    if (settingsAppObj) {
      const settingsApp = document.createElement('a');
      settingsApp.className = 'dock-item';
      settingsApp.href = '#';
      settingsApp.draggable = false; // Settings icon is non-draggable
      settingsApp.innerHTML = `
        <div class="dock-icon">
          <img src="${settingsAppObj.icon}" alt="${settingsAppObj.alt}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); pointer-events: none;">
        </div>
        <div class="dock-label">${settingsAppObj.name}</div>
      `;
      settingsApp.addEventListener('click', (e) => {
        e.preventDefault();
        settingsAppObj.action();
      });
      // Prevent drag start on settings icon
      settingsApp.addEventListener('dragstart', (e) => e.preventDefault());
      settingsSlot.appendChild(settingsApp);
    }

    // Add Recent app to slot 9 (only for unpinned apps)
    const recentSlot = document.getElementById('dock-slot-recent');
    let recentAppId = localStorage.getItem(RECENT_APP_KEY);
    // Don't show Settings or apps already pinned in appOrder in the recent slot
    if (recentAppId === 'settings' || appOrder.includes(recentAppId)) {
      recentAppId = null;
    }
    if (recentAppId) {
      const recentApp = availableApps.find(a => a.id === recentAppId);
      if (recentApp) {
        const appElement = createAppElement(recentApp);
        appElement.id = `app-${recentApp.id}-recent`;
        appElement.draggable = true;
        recentSlot.appendChild(appElement);
        setupAppDragListeners(appElement, true);
      }
    }

    // Manage empty slots visibility based on available space
    updateEmptySlotVisibility();
  }

  // Function to show/hide empty slots based on available screen space
  function updateEmptySlotVisibility() {
    setTimeout(() => {
      const hasScroll = dockContainer.scrollWidth > dockContainer.clientWidth;
      const emptySlots = Array.from(document.querySelectorAll('.dock-slot:empty'));
      
      if (hasScroll) {
        // If scrolling is needed, hide empty slots
        emptySlots.forEach(slot => slot.classList.add('hidden'));
      } else {
        // If there's space, show empty slots
        emptySlots.forEach(slot => slot.classList.remove('hidden'));
      }
    }, 0);
  }

  function createAppElement(app) {
    const appElement = document.createElement('a');
    appElement.className = 'dock-item';
    if (openApps.has(app.id)) {
      appElement.classList.add('active');
      if (minimizedApps.has(app.id)) {
        appElement.classList.add('minimized');
      }
    }
    appElement.href = '#';
    
    // Create icon content - check if it's a canvas-based icon
    let iconContent = '';
    if (app.useCanvasIcon) {
      const canvasId = `icon-canvas-${app.id}-${Date.now()}`;
      iconContent = `
        <div class="dock-icon">
          <canvas id="${canvasId}" width="128" height="128" style="width: 100%; height: 100%; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); pointer-events: none;"></canvas>
        </div>
      `;
    } else {
      iconContent = `
        <div class="dock-icon">
          <img src="${app.icon}" alt="${app.alt}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));">
        </div>
      `;
    }
    
    appElement.innerHTML = `
      ${iconContent}
      <div class="dock-indicator"></div>
      <div class="dock-label">${app.name}</div>
    `;
    
    // If it's a canvas icon, render it after element is added to DOM
    if (app.useCanvasIcon) {
      const canvasId = appElement.querySelector('canvas').id;
      // Use requestAnimationFrame to ensure element is in DOM
      requestAnimationFrame(() => {
        generateUltimateMacIcon(canvasId, 128); // Lower resolution for dock (softer appearance)
        // Update the calendar icon every minute to reflect current date
        setInterval(() => {
          generateUltimateMacIcon(canvasId, 128);
        }, 60000);
      });
    }
    
    appElement.addEventListener('click', (e) => {
      e.preventDefault();
      
      // If app is already open, bring it to front instead of creating new instance
      if (openApps.has(app.id)) {
        const appInstance = window[`current${app.id.charAt(0).toUpperCase() + app.id.slice(1)}App`];
        if (appInstance && appInstance.appWindow) {
          if (appInstance.windowState === 'minimized') {
            appInstance.restore();
          } else {
            appInstance.appWindow.bringToFront();
          }
          return;
        }
      }
      
      // Otherwise, launch the app normally
      app.action();
    });
    return appElement;
  }

  // Setup drag and drop listeners
  function setupAppDragListeners(appElement, isRecent) {
    console.log('Attaching drag listeners to:', appElement.id);
    
    appElement.addEventListener('dragstart', (e) => {
      console.log('↓ Dragstart fired on:', appElement.id, 'target:', e.target);
      const appId = appElement.id.replace('app-', '').replace('-recent', '');
      const app = availableApps.find(a => a.id === appId);
      
      if (!app) {
        console.warn('App not found for id:', appId);
        return;
      }
      
      console.log('Dock drag start:', app.name);
      
      e.dataTransfer.effectAllowed = 'copyMove';
      // Support both old format (for dock) and new format (for desktop/launchpad)
      e.dataTransfer.setData('appId', appElement.id);
      e.dataTransfer.setData('isRecent', isRecent);
      const dragPayload = JSON.stringify({
        source: 'dock',
        appId: appId,
        appName: app.name
      });
      e.dataTransfer.setData('text/plain', dragPayload);
      console.log('✓ Dock setting drag data:', dragPayload);
      console.log('✓ effectAllowed:', e.dataTransfer.effectAllowed);
      
      appElement.classList.add('dragging');
      appElement.parentElement.classList.add('dragging');
    });

    appElement.addEventListener('dragend', (e) => {
      console.log('↑ Dragend fired on:', appElement.id);
      appElement.classList.remove('dragging');
      if (appElement.parentElement) {
        appElement.parentElement.classList.remove('dragging', 'drag-over');
        appElement.parentElement.style.opacity = '';
      }
      document.querySelectorAll('.dock-slot').forEach(slot => {
        slot.classList.remove('drag-over', 'dragging');
        slot.style.opacity = '';
      });
      
      // Trigger drop animation
      appElement.classList.add('dropping');
      setTimeout(() => {
        appElement.classList.remove('dropping');
      }, 400);
    });

    // Touch support: allow dragging app icons from dock to desktop (or reposition within dock)
    let touchDrag = {
      active: false,
      timer: null,
      ghost: null
    };

    appElement.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      // Long-press to begin drag; set a start position so small scrolls cancel the long-press
      const MOVE_CANCEL_THRESHOLD = 10; // px
      touchDrag.startX = touch.clientX;
      touchDrag.startY = touch.clientY;
      touchDrag.timer = setTimeout(() => {
        touchDrag.active = true;
        appElement.classList.add('dragging');
        // Create a ghost element to follow the finger
        const ghost = appElement.cloneNode(true);
        ghost.style.position = 'fixed';
        ghost.style.left = (touch.clientX - 40) + 'px';
        ghost.style.top = (touch.clientY - 50) + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.85';
        ghost.id = `ghost-${appElement.id}`;
        document.body.appendChild(ghost);
        touchDrag.ghost = ghost;
        // Prepare slot highlight state
        touchDrag.highlightedSlot = null;
      }, 600); // require a longer press to start drag

      // If the user moves significantly before the timer fires, cancel the pending drag
      const cancelIfMove = (moveEvent) => {
        if (!touchDrag.timer) return;
        const mv = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
        const dx = Math.abs(mv.clientX - touchDrag.startX);
        const dy = Math.abs(mv.clientY - touchDrag.startY);
        if (dx > MOVE_CANCEL_THRESHOLD || dy > MOVE_CANCEL_THRESHOLD) {
          clearTimeout(touchDrag.timer);
          touchDrag.timer = null;
        }
      };

      const onTouchMoveCancel = (ev) => cancelIfMove(ev);
      const onTouchEndCancel = () => { 
        if (touchDrag.timer) { 
          clearTimeout(touchDrag.timer); 
          touchDrag.timer = null; 
          // Clean up dragging class if drag never fully started
          appElement.classList.remove('dragging');
          appElement.parentElement.classList.remove('dragging', 'drag-over');
          appElement.parentElement.style.opacity = '';
        } 
        document.removeEventListener('touchmove', onTouchMoveCancel); 
        document.removeEventListener('touchend', onTouchEndCancel); 
      };
      document.addEventListener('touchmove', onTouchMoveCancel, {passive: true});
      document.addEventListener('touchend', onTouchEndCancel, {passive: true});
    }, {passive: true});

    appElement.addEventListener('touchmove', (e) => {
      if (!touchDrag.active) return;
      e.preventDefault();
      const t = e.touches[0];
      if (touchDrag.ghost) {
        touchDrag.ghost.style.left = (t.clientX - 40) + 'px';
        touchDrag.ghost.style.top = (t.clientY - 50) + 'px';
      }
      // Highlight dock slot under finger (for swapping)
      const slots = document.querySelectorAll('.dock-slot');
      let foundSlot = null;
      for (let slot of slots) {
        const r = slot.getBoundingClientRect();
        if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) {
          foundSlot = slot;
          break;
        }
      }
      if (foundSlot) {
        if (touchDrag.highlightedSlot && touchDrag.highlightedSlot !== foundSlot) {
          touchDrag.highlightedSlot.classList.remove('drag-over');
        }
        foundSlot.classList.add('drag-over');
        touchDrag.highlightedSlot = foundSlot;
      } else if (touchDrag.highlightedSlot) {
        touchDrag.highlightedSlot.classList.remove('drag-over');
        touchDrag.highlightedSlot = null;
      }
    }, {passive: false});

    appElement.addEventListener('touchend', (e) => {
      clearTimeout(touchDrag.timer);
      touchDrag.active = false;
      // Clean up dragging state regardless of whether drag was active
      appElement.classList.remove('dragging');
      appElement.parentElement.classList.remove('dragging', 'drag-over');
      appElement.parentElement.style.opacity = '';
      document.querySelectorAll('.dock-slot').forEach(s => s.classList.remove('drag-over', 'dragging'));
      
      // Only process drop if drag ghost exists (drag was fully started)
      if (!touchDrag.ghost) return;
      
      const last = e.changedTouches && e.changedTouches[0];
      const appId = appElement.id.replace('app-','').replace('-recent','');
      // Check if dropped on a dock slot for swapping
      if (touchDrag.highlightedSlot) {
          // Swap into highlighted slot
          const slotIndex = parseInt(touchDrag.highlightedSlot.getAttribute('data-slot-index'));
          if (!isNaN(slotIndex) && slotIndex >= 0 && slotIndex < APP_SLOTS) {
            const currentIndex = appOrder.indexOf(appId);
            const targetApp = appOrder[slotIndex];
            if (currentIndex !== -1) {
              appOrder[currentIndex] = targetApp;
            }
            appOrder[slotIndex] = appId;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appOrder));
            renderApps();
            // swap animation
            if (targetApp) {
              setTimeout(() => {
                const draggedElement = document.getElementById(`app-${appId}`);
                const targetElement = document.getElementById(`app-${targetApp}`);
                  if (draggedElement) { draggedElement.classList.add('swapping'); setTimeout(() => draggedElement.classList.remove('swapping'), 450); }
                  if (targetElement) { targetElement.classList.add('swapping'); setTimeout(() => targetElement.classList.remove('swapping'), 450); }
              }, 50);
            }
          }
        } else {
          // Not dropped on zone or slot: if over desktop, create shortcut
          const desktop = document.getElementById('desktopArea');
          if (desktop) {
            const rect = desktop.getBoundingClientRect();
            if (last.clientX >= rect.left && last.clientX <= rect.right && last.clientY >= rect.top && last.clientY <= rect.bottom) {
              const appObj = availableApps.find(a => a.id === appId);
              if (window.desktopManager && appObj) {
                const dragPayload = { source: 'dock', appId: appId, appName: appObj.name };
                const syntheticEvent = { clientX: last.clientX, clientY: last.clientY };
                try { window.desktopManager.processDroppedApp(dragPayload, syntheticEvent); } catch (err) { console.error('desktopManager.processDroppedApp error', err); }
              }
            }
          }
        }

        // cleanup
        touchDrag.ghost.remove();
        touchDrag.ghost = null;
        document.querySelectorAll('.dock-slot').forEach(s => s.classList.remove('drag-over'));
        // Always re-render to ensure clean state (even if no valid drop)
        renderApps();
    });

    // Prevent context menu on long-press (mobile/tablet)
    appElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  // Initial render
  renderApps();
}

// Listen for session verification to dynamically re-filter for workers
window.addEventListener('macos-auth-verified', () => {
  console.log('[Dock] Auth verified, re-initializing dock permissions');
  initializeDock();
});

// Initialize the dock when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDock);
} else {
  // DOM is already loaded (e.g., if this script is deferred or loaded late)
  initializeDock();
}
