const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Dock') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

// Dock Initialization and Management
function initializeDock() {
  window.initializeDock = initializeDock;
  const dockContainer = document.getElementById('dockContainer');
  
  // Check if dockContainer exists
  if (!dockContainer) {
    log.error('Dock container not found in the DOM');
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
      id: 'mission-control',
      name: 'Mission Control',
      icon: '/assets/Images/Mission_Control_macOS_Golden_Gate.png',
      alt: 'Mission Control',
      color: '#3b82f6',
      category: 'system',
      action: () => {
        if (window.missionControl) {
          window.missionControl.toggle();
        }
      }
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
      id: 'manufacturing',
      name: 'Manufacturing',
      icon: '/assets/Images/Manufacturing.png',
      alt: 'Manufacturing',
      color: '#059669',
      category: 'productivity',
      action: (params) => AppWindow.launchApp('manufacturing', window.ManufacturingApp, 'manufacturingAppContainer', { setAppState, recentAppKey: RECENT_APP_KEY, params })
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
      let parsed = null;
      try {
        parsed = storedAllowed ? JSON.parse(storedAllowed) : null;
      } catch (_) {}

      if (Array.isArray(window.currentUserPermissions?.allowedApps) && window.currentUserPermissions.allowedApps.length > 0) {
        allowedAppsList = window.currentUserPermissions.allowedApps;
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        allowedAppsList = parsed;
      } else {
        allowedAppsList = ['billing', 'products', 'contacts', 'analytics', 'manufacturing'];
      }
    }
  } catch (e) {
    log.warn('Error reading worker permissions in dock:', e);
  }

  const availableApps = allowedAppsList 
    ? apps.filter(a => allowedAppsList.includes(a.id) || a.id === 'launchpad' || a.id === 'settings' || a.id === 'mission-control')
    : apps;
  window.availableAppsForLaunchpad = availableApps;
  
  if (typeof initializeDesktop === 'function') {
    initializeDesktop();
  }

  const currentUserId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || (sessionStorage.getItem('macos_user_role') === 'worker' ? 'worker' : 'owner');
  const STORAGE_KEY = `appBarOrder_${currentUserId}`;
  const RECENT_APP_KEY = `recentAppUsed_${currentUserId}`;

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

  // Kyant AndroidLiquidGlass InteractiveHighlight & Dynamic Refraction Angle Tracker
  // Authentic macOS Dock Magnification Engine
  let isDockHovered = false;
  let dockRafId = null;

  // Check if magnification is enabled (default: true)
  function getScopedStorageKey(baseKey) {
    const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
    return `${baseKey}__user_${safeUserId}`;
  }

  function isMagnificationEnabled() {
    // Touch screens don't have true hover states — avoid wave distortion during taps/swipes
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      return false;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(getScopedStorageKey('settingsAppData')) || '{}');
      return saved['dock-magnification'] === true;
    } catch (e) {
      return false;
    }
  }

  function resetDockMagnification() {
    dockContainer.classList.remove('dock-magnifying');
    const icons = dockContainer.querySelectorAll('.dock-icon');
    icons.forEach(icon => {
      icon.style.transform = '';
      icon.style.filter = '';
      icon.style.zIndex = '';
      const item = icon.closest('.dock-item');
      if (item) item.style.zIndex = '';
      const slot = icon.closest('.dock-slot');
      if (slot) slot.style.zIndex = '';
    });
    hideDockTooltip();
  }

  // dockContainer IS the .dock pill (#dockContainer).
  // Its parent .dock-container is the outer fixed wrapper.
  const dockWrapper = dockContainer.parentElement; // .dock-container

  // ===== MACOS FLOATING DOCK TOOLTIP =====
  // Appended directly to document.body so it is never trapped by backdrop-filter or transform containing blocks
  let dockTooltip = document.getElementById('macos-dock-tooltip');
  if (!dockTooltip) {
    dockTooltip = document.createElement('div');
    dockTooltip.id = 'macos-dock-tooltip';
    document.body.appendChild(dockTooltip);
  }

  let activeTooltipItem = null;
  let touchTooltipTimer = null;

  function updateTooltipPosition(icon) {
    if (!dockTooltip || !icon) return;
    const rect = icon.getBoundingClientRect();
    // rect includes current CSS transforms (magnification scale and lift translateY)
    dockTooltip.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    dockTooltip.style.top  = `${Math.round(rect.top - 12)}px`;
  }

  function showDockTooltip(item) {
    if (!item || !dockTooltip) return;
    if (dockWrapper && dockWrapper.classList.contains('dock-hidden')) return;

    const labelEl = item.querySelector('.dock-label');
    const appName = item.getAttribute('data-app-name') || (labelEl ? labelEl.textContent.trim() : '');
    if (!appName) return;

    const icon = item.querySelector('.dock-icon');
    if (!icon) return;

    dockTooltip.textContent = appName;
    activeTooltipItem = item;
    updateTooltipPosition(icon);
    dockTooltip.classList.add('visible');

    // On touch devices, automatically hide the tooltip after a short duration so it does not linger
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
      clearTimeout(touchTooltipTimer);
      touchTooltipTimer = setTimeout(hideDockTooltip, 1500);
    }
  }

  function hideDockTooltip() {
    if (!dockTooltip) return;
    dockTooltip.classList.remove('visible');
    activeTooltipItem = null;
    clearTimeout(touchTooltipTimer);
  }

  function applyDockMagnification(pointerX) {
    dockContainer.classList.add('dock-magnifying');
    const items = dockContainer.querySelectorAll('.dock-slot:not(:empty) .dock-icon');
    const MAX_SCALE = 1.62; // Bold macOS pop-out magnification
    const MAX_LIFT = -24;   // Clear 24px pop-out above dock
    const INFLUENCE_RADIUS = 145; // Smooth Gaussian wave spread

    let closestIcon = null;
    let minDistance = Infinity;

    items.forEach(icon => {
      const rect = icon.getBoundingClientRect();
      const iconCenterX = rect.left + rect.width / 2;
      const dist = Math.abs(pointerX - iconCenterX);

      const dockItem = icon.closest('.dock-item');
      const dockSlot = icon.closest('.dock-slot');

      if (dist < minDistance) {
        minDistance = dist;
        closestIcon = icon;
      }

      if (dist < INFLUENCE_RADIUS) {
        // Cosine bell curve for smooth Apple-like falloff
        const normDist = dist / INFLUENCE_RADIUS;
        const factor = 0.5 * (1 + Math.cos(normDist * Math.PI)); // 1.0 at center, 0.0 at edge
        const scale = 1 + (MAX_SCALE - 1) * factor;
        const lift = MAX_LIFT * factor;

        // Z-Index elevation: Closest icon receives up to z-index 150 to pop above neighboring icons & dock
        const zIndexVal = Math.round(10 + factor * 140);
        icon.style.zIndex = zIndexVal;
        if (dockItem) dockItem.style.zIndex = zIndexVal;
        if (dockSlot) dockSlot.style.zIndex = zIndexVal;

        icon.style.transform = `scale(${scale.toFixed(3)}) translateY(${lift.toFixed(1)}px)`;
        icon.style.filter = `drop-shadow(0 ${(12 * factor).toFixed(1)}px ${(18 * factor).toFixed(1)}px rgba(0, 0, 0, ${(0.42 * factor).toFixed(2)}))`;
      } else {
        icon.style.transform = 'scale(1) translateY(0)';
        icon.style.filter = '';
        icon.style.zIndex = '';
        if (dockItem) dockItem.style.zIndex = '';
        if (dockSlot) dockSlot.style.zIndex = '';
      }
    });

    // Update floating tooltip above the peaked/hovered icon
    if (closestIcon && minDistance < 55) {
      const closestItem = closestIcon.closest('.dock-item');
      if (closestItem) {
        if (activeTooltipItem !== closestItem) {
          showDockTooltip(closestItem);
        } else {
          updateTooltipPosition(closestIcon);
        }
      }
    } else {
      hideDockTooltip();
    }
  }

  // ===== MAGNIFICATION / HOVER =====
  let leaveDebounceTimer = null;

  dockContainer.addEventListener('pointerenter', () => {
    const dockWrapper = dockContainer.parentElement;
    if (dockWrapper && dockWrapper.classList.contains('dock-hidden')) return;

    clearTimeout(leaveDebounceTimer);
    isDockHovered = true;
    isMouseInDockZone = true;
    if (dockHideTimer) {
      clearTimeout(dockHideTimer);
      dockHideTimer = null;
    }
    dockWrapper.style.setProperty('--lg-mouse-active', '1');
  });

  dockContainer.addEventListener('pointerleave', (e) => {
    // If mouse left through the bottom into screen edge margin, it is still within the dock zone
    if (e.clientY >= window.innerHeight - 10) {
      isMouseInDockZone = true;
      return;
    }
    leaveDebounceTimer = setTimeout(() => {
      isDockHovered = false;
      const dockWrapper = dockContainer.parentElement;
      dockWrapper.style.setProperty('--lg-mouse-active', '0');
      if (dockRafId) cancelAnimationFrame(dockRafId);
      resetDockMagnification();
      hideDockTooltip();
    }, 50);
  });

  dockContainer.addEventListener('pointermove', (e) => {
    // On touch devices or touch pointers, let native scrolling and touch gestures handle interaction
    if (e.pointerType === 'touch') return;

    clearTimeout(leaveDebounceTimer);
    isDockHovered = true;
    isMouseInDockZone = true;
    if (dockHideTimer) {
      clearTimeout(dockHideTimer);
      dockHideTimer = null;
    }

    const rect = dockContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dockWrapper = dockContainer.parentElement;
    dockWrapper.style.setProperty('--lg-mouse-x', `${x}px`);
    dockWrapper.style.setProperty('--lg-mouse-y', `${y}px`);
    dockWrapper.style.setProperty('--lg-mouse-active', '1');

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rad = Math.atan2(y - centerY, x - centerX);
    const deg = (rad * 180 / Math.PI + 90);
    dockWrapper.style.setProperty('--lg-refract-angle', `${deg.toFixed(1)}deg`);

    if (isMagnificationEnabled()) {
      if (dockRafId) cancelAnimationFrame(dockRafId);
      dockRafId = requestAnimationFrame(() => {
        applyDockMagnification(e.clientX);
      });
    } else {
      // Magnification disabled — add dock-magnifying on dockContainer itself
      dockContainer.classList.add('dock-magnifying');
      const item = e.target.closest('.dock-item');
      if (item) {
        showDockTooltip(item);
      } else {
        hideDockTooltip();
      }
    }
  });

  // Pointer enter/leave on dock items when magnification is off
  dockContainer.addEventListener('pointerover', (e) => {
    if (!isMagnificationEnabled()) {
      const item = e.target.closest('.dock-item');
      if (item) showDockTooltip(item);
    }
  });

  dockContainer.addEventListener('pointerout', (e) => {
    if (!isMagnificationEnabled()) {
      if (!e.relatedTarget || !e.relatedTarget.closest('.dock-item')) {
        hideDockTooltip();
      }
    }
  });

  // ===== MACOS DOCK AUTO-HIDE ENGINE =====
  let edgeRevealTimer = null;
  let dockHideTimer = null;
  let isMouseInDockZone = false;
  let isMouseDown = false;
  let isMissionControlActive = false;

  function isAutoHideEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(getScopedStorageKey('settingsAppData')) || '{}');
      return saved['dock-auto-hide'] === true;
    } catch (e) { return false; }
  }

  let dockRevealAnimationTimer = null;

  function revealDock() {
    if (!dockWrapper) return;
    dockWrapper.classList.remove('dock-hidden');
    dockWrapper.classList.remove('dock-hiding');
    dockWrapper.classList.add('dock-revealing');
    clearTimeout(dockRevealAnimationTimer);
    dockRevealAnimationTimer = setTimeout(() => {
      dockWrapper.classList.remove('dock-revealing');
      dockWrapper.style.transform = '';
    }, 420);
    if (edgeRevealTimer) {
      clearTimeout(edgeRevealTimer);
      edgeRevealTimer = null;
    }
  }

  function hideDock() {
    if (!dockWrapper || !isAutoHideEnabled()) return;
    // macOS Constraint: In Mission Control, dock must remain visible even if auto-hide is turned on
    if (isMissionControlActive || document.body.classList.contains('mission-control-active')) return;
    // macOS Constraint: Never hide while cursor is in the dock zone or dragging an item
    if (isMouseInDockZone) return;
    if (dockContainer.querySelector('.dragging') || isMouseDown) return;

    dockWrapper.classList.remove('dock-revealing');
    dockWrapper.classList.remove('dock-hiding');
    dockWrapper.classList.add('dock-hiding');
    dockWrapper.classList.add('dock-hidden');
    dockWrapper.style.transform = 'translate3d(-50%, 0, 0)';
    requestAnimationFrame(() => {
      dockWrapper.style.transform = 'translate3d(-50%, calc(100% + 120px), 0)';
    });
    hideDockTooltip();
    resetDockMagnification();
    if (dockHideTimer) {
      clearTimeout(dockHideTimer);
      dockHideTimer = null;
    }
  }

  function applyAutoHide() {
    if (!dockWrapper) return;
    if (isAutoHideEnabled()) {
      if (!isMouseInDockZone && !isDockHovered) {
        hideDock();
      }
    } else {
      revealDock();
    }
  }

  // Robust check to determine if the pointer is resting on or adjacent to an app window
  function isPointerOverOrAdjacentToAppWindow(clientX, clientY, target) {
    // 1. Direct hit-test on event target
    if (target && target.closest && target.closest('.app-window')) {
      return true;
    }

    // 2. Upward vertical probe to span the 10px viewport margin
    // Maximized/tiled app windows have margin: 10px, stopping at window.innerHeight - 10px.
    // When the pointer hits the bottom edge (innerHeight - 4px), probing 25px above
    // directly samples into the app window body.
    const probeY = Math.max(0, clientY - 25);
    const elementsAbove = document.elementsFromPoint ? document.elementsFromPoint(clientX, probeY) : [document.elementFromPoint(clientX, probeY)];
    for (const el of elementsAbove) {
      if (el && el.closest && el.closest('.app-window')) {
        return true;
      }
    }

    // 3. Inspect visible app windows in the DOM
    const visibleWindows = document.querySelectorAll('.app-window');
    for (const win of visibleWindows) {
      // Skip minimized or hidden windows
      if (win.style.display === 'none' || win.offsetParent === null) continue;

      const appInstance = win.__appInstance;
      const isMaximized = (appInstance && appInstance.windowState === 'maximized') ||
                          win.classList.contains('maximized') ||
                          win.dataset.windowState === 'maximized';
      const isBottomTiled = appInstance && (
        appInstance.windowState === 'tiled-bottom' ||
        appInstance.windowState === 'tiled-bottom-left' ||
        appInstance.windowState === 'tiled-bottom-right'
      );

      // If any window is currently being resized or dragged, bypass auto-reveal
      if (win.classList.contains('resizing') || (appInstance && (appInstance.isDragging || appInstance.isResizing))) {
        return true;
      }

      // If an app is maximized, it occupies the full viewport; auto-reveal is completely bypassed
      if (isMaximized) {
        return true;
      }

      // For windows extending near the bottom, check if clientX is within horizontal boundaries
      const rect = win.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        // If window extends into bottom zone (within 80px of screen bottom)
        if (isBottomTiled || rect.bottom >= window.innerHeight - 80) {
          return true;
        }
      }
    }

    return false;
  }

  // Window-level mouse tracking for authentic macOS dock reveal and hide behavior
  window.addEventListener('mousemove', (e) => {
    if (!dockWrapper) return;

    const autoHide = isAutoHideEnabled();
    const isHidden = dockWrapper.classList.contains('dock-hidden');

    // 1. If auto-hide is disabled, keep dock visible
    if (!autoHide) {
      if (isHidden) revealDock();
      return;
    }

    // 2. If dock is currently hidden:
    if (isHidden) {
      const overAppWindow = isPointerOverOrAdjacentToAppWindow(e.clientX, e.clientY, e.target);

      // If pointer is resting on or adjacent to an app window (such as a maximized or full-screen app),
      // completely bypass auto-reveal so dock never mistakenly springs up while working
      if (overAppWindow) {
        if (edgeRevealTimer) {
          clearTimeout(edgeRevealTimer);
          edgeRevealTimer = null;
        }
        return;
      }

      // macOS constraint: User pushes cursor firmly against the bottom screen edge (on open desktop)
      if (e.clientY >= window.innerHeight - 4) {
        if (!edgeRevealTimer) {
          // macOS hesitation threshold (~200ms) prevents accidental reveals
          edgeRevealTimer = setTimeout(revealDock, 200);
        }
      } else {
        if (edgeRevealTimer) {
          clearTimeout(edgeRevealTimer);
          edgeRevealTimer = null;
        }
      }
      return;
    }

    // 3. If dock is currently visible:
    const dockRect = dockContainer.getBoundingClientRect();
    // Dock interactive zone spans:
    // - from 24px above the dock (covers lifted/scaled magnified icons)
    // - down to the very bottom of the screen (no bottom-edge gap flicker!)
    // - with 40px horizontal margin
    const inZone = (
      e.clientY >= dockRect.top - 24 &&
      e.clientY <= window.innerHeight &&
      e.clientX >= dockRect.left - 40 &&
      e.clientX <= dockRect.right + 40
    );

    if (inZone) {
      isMouseInDockZone = true;
      if (dockHideTimer) {
        clearTimeout(dockHideTimer);
        dockHideTimer = null;
      }
    } else {
      isMouseInDockZone = false;
      // macOS constraint: Grace period delay (~500ms) before sliding down
      if (!dockHideTimer) {
        dockHideTimer = setTimeout(hideDock, 500);
      }
    }
  });

  setTimeout(applyAutoHide, 300);

  // React in real-time when dock settings change from the Settings app or server sync
  window.addEventListener('dock-settings-changed', (e) => {
    const { detail } = e;
    if ('dock-auto-hide' in detail) {
      applyAutoHide();
    }
    if ('dock-magnification' in detail && !detail['dock-magnification']) {
      resetDockMagnification();
    }
    if (detail.appBarOrder && Array.isArray(detail.appBarOrder)) {
      appOrder = [...detail.appBarOrder];
      renderApps();
    }
  });

  // macOS Behavior: If dock is hidden, it must appear in Mission Control
  window.addEventListener('mission-control-toggled', (e) => {
    isMissionControlActive = !!(e.detail && e.detail.isActive);
    if (isMissionControlActive) {
      revealDock();
    } else {
      applyAutoHide();
    }
  });

  function syncAppOrderToServer(order) {
    try {
      fetch('/api/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appBarOrder: order })
      }).catch(() => {});
    } catch (e) {}
  }

  // ===== TOUCH GESTURES FOR MOBILE / TABLET DOCK =====
  let touchEdgeStartY = 0;
  let touchEdgeStartX = 0;

  window.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchEdgeStartY = touch.clientY;
    touchEdgeStartX = touch.clientX;

    // Reveal dock on touch near bottom edge (within 35px) when auto-hidden, unless over an app window
    if (isAutoHideEnabled() && dockWrapper && dockWrapper.classList.contains('dock-hidden')) {
      const overAppWindow = isPointerOverOrAdjacentToAppWindow(touchEdgeStartX, touchEdgeStartY, e.target);
      if (!overAppWindow && touchEdgeStartY >= window.innerHeight - 35) {
        revealDock();
      }
    }

    // When dock is visible and auto-hide is enabled: tap outside dock hides it
    if (isAutoHideEnabled() && dockWrapper && !dockWrapper.classList.contains('dock-hidden')) {
      if (!e.target.closest('#dockContainer')) {
        setTimeout(() => {
          if (!isMouseInDockZone && !dockContainer.querySelector('.dragging')) {
            hideDock();
          }
        }, 350);
      }
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchEdgeStartY;

    // Swiping up from the bottom edge reveals dock, unless over an app window
    if (isAutoHideEnabled() && dockWrapper && dockWrapper.classList.contains('dock-hidden')) {
      const overAppWindow = isPointerOverOrAdjacentToAppWindow(touch.clientX, touch.clientY, e.target);
      if (!overAppWindow && touchEdgeStartY >= window.innerHeight - 45 && deltaY < -12) {
        revealDock();
      }
    }
  }, { passive: true });

  // Handle device orientation changes (mobile / tablet rotation)
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateEmptySlotVisibility();
      if (dockRafId) cancelAnimationFrame(dockRafId);
      resetDockMagnification();
      hideDockTooltip();
    }, 200);
  });

  // Mouse drag (for desktop)
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

  // Wheel listener to support horizontal scrolling smoothly
  dockContainer.addEventListener('wheel', (e) => {
    if (dockContainer.scrollWidth > dockContainer.clientWidth) {
      // Horizontal scroll support for vertical mouse wheels or trackpad swipes
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta !== 0) {
        dockContainer.scrollLeft += delta;
      }
    }
  }, { passive: true });

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
        log.error(`App with ID ${appId} not found`);
      }
    }
  };

  // 1. Determine app order from localStorage
  let appOrder = JSON.parse(localStorage.getItem(STORAGE_KEY));
  
  // 2. Sync logic: Ensure all current apps (except settings) are reflected in appOrder
  const validAppIds = new Set(availableApps.filter(a => a.id !== 'settings').map(a => a.id));
  
  if (!appOrder || !Array.isArray(appOrder) || appOrder.length === 0) {
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

    if (appOrder.length === 0) {
      appOrder = availableApps.filter(a => a.id !== 'settings').map(a => a.id);
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
        
        // Save to localStorage and sync to server
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appOrder));
        syncAppOrderToServer(appOrder);

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
      if (openApps.has('settings')) {
        settingsApp.classList.add('active');
        if (minimizedApps.has('settings')) {
          settingsApp.classList.add('minimized');
        }
      }
      settingsApp.setAttribute('data-app-name', settingsAppObj.name);
      settingsApp.href = '#';
      settingsApp.draggable = false; // Settings icon is non-draggable
      settingsApp.innerHTML = `
        <div class="dock-icon">
          <img src="${settingsAppObj.icon}" alt="${settingsAppObj.alt}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); pointer-events: none;">
        </div>
        <div class="dock-indicator"></div>
        <div class="dock-label">${settingsAppObj.name}</div>
      `;
      settingsApp.addEventListener('click', (e) => {
        e.preventDefault();
        hideDockTooltip();
        settingsAppObj.action();
      });
      // Prevent drag start on settings icon
      settingsApp.addEventListener('dragstart', (e) => e.preventDefault());
      settingsSlot.appendChild(settingsApp);
    }

    // Add Recent app to slot 9 (only for unpinned apps)
    const recentSlot = document.getElementById('dock-slot-recent');
    let recentAppId = localStorage.getItem(RECENT_APP_KEY);
    // Don't show Settings in the recent slot
    if (recentAppId === 'settings') {
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
      // Exclude special slots (settings, recent) from the empty-slot hide/show logic
      const emptySlots = Array.from(document.querySelectorAll('.dock-slot:empty')).filter(slot =>
        slot.id !== 'dock-slot-settings' && slot.id !== 'dock-slot-recent'
      );
      
      if (hasScroll) {
        // If scrolling is needed, hide empty slots
        emptySlots.forEach(slot => slot.classList.add('hidden'));
        dockWrapper.classList.add('dock-scrolling');
      } else {
        // If there's space, show empty slots
        emptySlots.forEach(slot => slot.classList.remove('hidden'));
        dockWrapper.classList.remove('dock-scrolling');
      }
    }, 0);
  }

  function createAppElement(app) {
    const appElement = document.createElement('a');
    appElement.className = 'dock-item';
    appElement.setAttribute('data-app-name', app.name);
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
      hideDockTooltip();
      
      // Authentic macOS dock launch bounce effect
      appElement.classList.add('bouncing');
      setTimeout(() => {
        appElement.classList.remove('bouncing');
      }, 1300);

      // Unified WindowGeometryManager coordination: restore if minimized or bring to front
      const geomMgr = window.windowGeometryManager;
      const record = geomMgr?.getWindow(app.id);
      const appInstance = record?.instance ||
        window[`current${app.id.charAt(0).toUpperCase() + app.id.slice(1)}App`] ||
        window[`${app.id}Instance`];

      if (appInstance && appInstance.windowState !== 'closed') {
        const target = appInstance.appWindow || appInstance;
        if (target.windowState === 'minimized') {
          target.restore();
        } else {
          target.bringToFront();
        }
        return;
      }
      
      // Otherwise, launch the app normally
      app.action();
    });
    return appElement;
  }

  // Setup drag and drop listeners
  function setupAppDragListeners(appElement, isRecent) {
    if (window.MacOSLogger && window.MacOSLogger.isDebugEnabled('AppBar')) {
      log.debug('Attaching drag listeners to:', appElement.id);
    }
    
    appElement.addEventListener('dragstart', (e) => {
      log.debug('↓ Dragstart fired on:', appElement.id, 'target:', e.target);
      const appId = appElement.id.replace('app-', '').replace('-recent', '');
      const app = availableApps.find(a => a.id === appId);
      
      if (!app) {
        log.warn('App not found for id:', appId);
        return;
      }
      
      log.debug('Dock drag start:', app.name);
      
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
      log.debug('✓ Dock setting drag data:', dragPayload);
      log.debug('✓ effectAllowed:', e.dataTransfer.effectAllowed);
      
      appElement.classList.add('dragging');
      appElement.parentElement.classList.add('dragging');
    });

    appElement.addEventListener('dragend', (e) => {
      log.debug('↑ Dragend fired on:', appElement.id);
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
            syncAppOrderToServer(appOrder);
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
                try { window.desktopManager.processDroppedApp(dragPayload, syntheticEvent); } catch (err) { log.error('desktopManager.processDroppedApp error', err); }
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

  // Initial render (label listeners are attached inside renderApps)
  renderApps();
}

// Listen for session verification to dynamically re-filter for workers
window.addEventListener('macos-auth-verified', () => {
  log.debug('[Dock] Auth verified, re-initializing dock permissions');
  initializeDock();
});

// Initialize the dock when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDock);
} else {
  // DOM is already loaded (e.g., if this script is deferred or loaded late)
  initializeDock();
}
