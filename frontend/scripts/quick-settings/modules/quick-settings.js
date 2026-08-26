// ========================================
// STANDARDIZED QUICK SETTINGS COMPONENT
// ======================================== 

class QuickSettings {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      iconPath: options.iconPath || '/assets/Images/Quick Settings.png',
      label: options.label || 'Settings',
      onClick: options.onClick || this.defaultAction.bind(this),
      type: options.type || 'topbar', // 'topbar' or 'appbar'
      ...options
    };
    
    this.isOpen = false;
    this.settingsPanel = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('Quick Settings: Container not found');
      return;
    }
    
    if (this.options.type === 'topbar') {
      this.createTopBarItem();
    } else {
      this.createAppBarItem();
    }
    this.setupEventListeners();
  }

  createTopBarItem() {
    // Create the top bar icon item
    const item = document.createElement('button');
    item.className = 'quick-settings-topbar-item';
    item.id = 'quickSettingsItem';
    item.type = 'button';
    item.title = this.options.label;
    
    const icon = document.createElement('img');
    icon.src = this.options.iconPath;
    icon.alt = this.options.label;
    icon.className = 'quick-settings-topbar-icon';
    
    item.appendChild(icon);
    this.container.appendChild(item);
  }

  createAppBarItem() {
    // Create the app bar item (bottom bar version)
    const item = document.createElement('a');
    item.className = 'app-bar-item quick-settings-item';
    item.id = 'quickSettingsItem';
    item.href = '#';
    
    // Create icon container with image
    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-bar-icon quick-settings-icon';
    
    const icon = document.createElement('img');
    icon.src = this.options.iconPath;
    icon.alt = this.options.label;
    icon.className = 'quick-settings-img';
    
    iconContainer.appendChild(icon);
    
    // Create label
    const label = document.createElement('div');
    label.className = 'app-bar-label';
    label.textContent = this.options.label;
    
    // Append to item
    item.appendChild(iconContainer);
    item.appendChild(label);
    
    // Append to container
    this.container.appendChild(item);
  }

  setupEventListeners() {
    const item = document.getElementById('quickSettingsItem');
    
    if (item) {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.options.onClick();
      });
      
      // Add active state feedback
      item.addEventListener('mousedown', () => {
        item.classList.add('active');
      });
      
      item.addEventListener('mouseup', () => {
        item.classList.remove('active');
      });

      // Add hover listeners for tooltip positioning (for appbar version)
      if (this.options.type === 'appbar') {
        item.addEventListener('mouseenter', (e) => {
          const label = item.querySelector('.app-bar-label');
          const rect = item.getBoundingClientRect();
          label.style.display = 'block !important';
          label.style.position = 'fixed';
          label.style.left = (rect.left + rect.width / 2) + 'px';
          label.style.top = (rect.top - 70) + 'px';
          label.style.transform = 'translateX(-50%)';
          label.style.zIndex = '99999';
        });

        item.addEventListener('mouseleave', (e) => {
          const label = item.querySelector('.app-bar-label');
          label.style.display = 'none';
        });
      }
    }
  }

  defaultAction() {
    // Default action: toggle settings panel
    this.toggleSettingsPanel();
  }

  toggleSettingsPanel() {
    this.isOpen ? this.closePanel() : this.openPanel();
  }

  openPanel() {
    if (this.isOpen) return;
    
    this.isOpen = true;
    const item = document.getElementById('quickSettingsItem');
    if (item) {
      item.classList.add('active');
    }
    
    // Create and show settings panel
    this.createSettingsPanel();
  }

  closePanel() {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    const item = document.getElementById('quickSettingsItem');
    if (item) {
      item.classList.remove('active');
    }
    
    this.destroy();
  }

  createSettingsPanel() {
    // Create settings panel HTML with modern MacOS Control Center layout
    const panelHTML = `
      <div class="quick-settings-panel">
        <div class="qs-grid">
          <!-- Wi-Fi Card -->
          <div class="qs-card qs-card-large" id="wifiToggle">
            <div class="qs-item">
              <div class="qs-icon-circle" id="wifiIcon">
                <svg viewBox="0 0 24 24" class="qs-svg-icon"><path fill="currentColor" d="M12 21l-8.2-10.3c3.3-3.3 8.1-4.3 12.3-3l1.8-1.8c-5.7-2.1-12.4-.6-16.7 3.7-.4.5-.4 1.2 0 1.7l10.8 13.5c.5.6 1.5.6 2 0l10.8-13.5c.4-.5.4-1.2 0-1.7-1.1-1.1-2.4-2.1-3.8-2.8l-1.4 1.4c1.1.5 2.1 1.2 3 2.1l-8.7 10.7z"/></svg>
              </div>
              <div class="qs-label-container">
                <span class="qs-label">Wi-Fi</span>
                <span class="qs-sublabel" id="wifiStatusText">Home</span>
              </div>
            </div>
          </div>

          <!-- Media Player Card -->
          <div class="qs-card qs-card-tall">
            <div class="qs-media">
              <div class="qs-media-art">
                <svg viewBox="0 0 24 24" class="qs-media-placeholder"><path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
              </div>
              <div class="qs-media-info">
                <div class="qs-media-title">Besties</div>
                <div class="qs-media-artist">Black Country, New...</div>
              </div>
              <div class="qs-media-controls">
                <button class="qs-media-btn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button class="qs-media-btn"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></button>
                <button class="qs-media-btn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/></svg></button>
              </div>
            </div>
          </div>

          <!-- BT and AirDrop Row -->
          <div class="qs-item" style="gap: 12px;">
            <div class="qs-card qs-card-large" style="flex: 1;" id="btToggle">
               <div class="qs-icon-circle" id="btIcon">
                <svg viewBox="0 0 24 24" class="qs-svg-icon"><path fill="currentColor" d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.34L13 18.17v-3.76l1.88 1.88z"/></svg>
              </div>
            </div>
            <div class="qs-card qs-card-large" style="flex: 1;">
               <div class="qs-icon-circle inactive">
                <svg viewBox="0 0 24 24" class="qs-svg-icon"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>
              </div>
            </div>
          </div>

          <!-- Focus Pill -->
          <div class="qs-card qs-row-full qs-focus-pill" style="border-radius: 20px; height: 44px; flex-direction: row; justify-content: flex-start; gap: 12px; align-items: center;">
            <div class="qs-icon-circle inactive" style="width: 28px; height: 28px;">
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 3c.13 0 .26 0 .39.01C10.15 4.37 8.5 7.42 8.5 10.5c0 5.52 4.48 10 10 10 .96 0 1.89-.14 2.76-.4-.87 2.37-3.15 4-5.76 4-3.59 0-6.5-2.91-6.5-6.5s2.91-6.5 6.5-6.5c1.03 0 2 .24 2.87.66-.46-.38-.97-.7-1.52-.95C17.7 4.14 15 3.1 12 3z"/></svg>
            </div>
            <span class="qs-label">Focus</span>
          </div>

          <!-- Display Slider -->
          <div class="qs-card qs-row-full qs-slider-card">
            <div class="qs-slider-container">
              <div class="qs-slider-header">Display</div>
              <div class="qs-slider-wrapper">
                <span class="qs-slider-icon"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.92h-2v3h2v-3zm6.78 1.41l-1.41-1.41-1.79 1.8 1.41 1.41 1.79-1.8zM10.5 4v3h2V4h-2zm10.5 6.5h3v2h-3v-2zm-2.84 7.26l1.8 1.79 1.41-1.41-1.79-1.79-1.42 1.41zM20 10.5v2c-2.49 0-4.5-2.01-4.5-4.5S17.51 3.5 20 3.5v2c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5z"/></svg></span>
                <input type="range" class="qs-range" id="brightnessSlider" value="80" min="0" max="100">
                <span class="qs-slider-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h3v-2H2v2zm17 0h3v-2h-3v2zM11 2v3h2V2h-2zm0 17v3h2v-3h-2zM5.22 3.81L3.81 5.22l2.12 2.12 1.41-1.41-2.12-2.12zm14.97 14.97l-1.41 1.41 2.12 2.12 1.41-1.41-2.12-2.12zM18.78 3.81l-2.12 2.12 1.41 1.41 2.12-2.12-1.41-1.41zM5.22 20.19l1.41-1.41-2.12-2.12-1.41 1.41 2.12 2.12z"/></svg></span>
              </div>
            </div>
          </div>

          <!-- Sound Slider -->
          <div class="qs-card qs-row-full qs-slider-card">
            <div class="qs-slider-container">
              <div class="qs-slider-header">Sound</div>
              <div class="qs-slider-wrapper">
                <span class="qs-slider-icon"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M7 9v6h4l5 5V4l-5 5H7z"/></svg></span>
                <input type="range" class="qs-range" id="soundSlider" value="65" min="0" max="100">
                <span class="qs-slider-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 9v6h4l5 5V4l-5 5H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></span>
              </div>
            </div>
          </div>

          <!-- Utility Icons -->
          <div class="qs-row-full qs-utility-row">
            <button class="qs-utility-btn" id="darkModeBtn" title="Dark Mode"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16V5c3.86 0 7 3.14 7 7s-3.14 7-7 7z"/></svg></button>
            <button class="qs-utility-btn" id="calcBtn" title="Calculator"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2z"/></svg></button>
            <button class="qs-utility-btn" id="clockBtn" title="Timer"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg></button>
            <button class="qs-utility-btn" id="fullscreenBtn" title="Fullscreen"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>
          </div>
        </div>

        <button class="qs-bottom-btn" id="editControlsBtn">Edit Controls</button>
      </div>
    `;
    
    this.settingsPanel = document.createElement('div');
    this.settingsPanel.innerHTML = panelHTML;
    document.body.appendChild(this.settingsPanel);
    
    this.setupPanelEvents();
  }

  setupPanelEvents() {
    const container = this.settingsPanel;
    if (!container) return;

    // Media Controls
    const mediaTitle = container.querySelector('.qs-media-title');
    const mediaArtist = container.querySelector('.qs-media-artist');
    const mediaArt = container.querySelector('.qs-media-art');
    const mediaBtns = container.querySelectorAll('.qs-media-btn');
    const prevBtn = mediaBtns[0];
    const playPauseBtn = mediaBtns[1];
    const nextBtn = mediaBtns[2];

    if (window.mediaManager) {
      // Reactive UI updates
      this.mediaSubscription = window.mediaManager.subscribe((state) => {
        if (mediaTitle) mediaTitle.textContent = state.track.title;
        if (mediaArtist) mediaArtist.textContent = state.track.artist;
        if (mediaArt) mediaArt.style.background = state.track.albumArt;
        
        // Update Play/Pause icon
        if (playPauseBtn) {
          playPauseBtn.innerHTML = state.isPlaying ? 
            `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` : 
            `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
        }
      });

      if (playPauseBtn) playPauseBtn.onclick = () => window.mediaManager.togglePlay();
      if (prevBtn) prevBtn.onclick = () => window.mediaManager.previous();
      if (nextBtn) nextBtn.onclick = () => window.mediaManager.next();
    }

    // Wi-Fi Toggle & Network Status Sync
    const wifiToggle = container.querySelector('#wifiToggle');
    const wifiIcon = container.querySelector('#wifiIcon');
    const wifiStatusText = container.querySelector('#wifiStatusText');

    this.onlineHandler = () => {
      const isOnline = navigator.onLine;
      if (wifiIcon) wifiIcon.classList.toggle('inactive', !isOnline);
      if (wifiStatusText) {
        if (isOnline) {
          const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          wifiStatusText.textContent = conn && conn.type === 'cellular' ? 'Cellular' : 'Home';
        } else {
          wifiStatusText.textContent = 'Off';
        }
      }
    };
    this.offlineHandler = this.onlineHandler;

    // Initial sync
    this.onlineHandler();

    // Listen to OS network changes
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);

    if (wifiToggle) {
      wifiToggle.addEventListener('click', () => {
        // App-level simulated toggle since OS Wi-Fi cannot be changed
        const currentlyInactive = wifiIcon.classList.contains('inactive');
        wifiIcon.classList.toggle('inactive', !currentlyInactive);
        wifiStatusText.textContent = !currentlyInactive ? 'Off' : 'Home';
      });
    }

    // Bluetooth Toggle (Native OS Integration)
    const btToggle = container.querySelector('#btToggle');
    const btIcon = container.querySelector('#btIcon');
    if (btToggle) {
      btToggle.addEventListener('click', async () => {
        if (!navigator.bluetooth) {
          if (btIcon) btIcon.classList.toggle('inactive');
          return;
        }
        try {
          // Triggers native OS Bluetooth picker
          const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
          if (btIcon) btIcon.classList.remove('inactive');
        } catch (error) {
          // Cancelled or no device selected
          if (btIcon) btIcon.classList.add('inactive');
        }
      });
    }

    // Sliders
    const brightnessSlider = container.querySelector('#brightnessSlider');
    const soundSlider = container.querySelector('#soundSlider');

    if (brightnessSlider) {
      brightnessSlider.addEventListener('input', (e) => {
        // Mock brightness update
        document.body.style.filter = `brightness(${(e.target.value / 100) * 0.4 + 0.8})`;
      });
    }

    if (soundSlider) {
      // Sync initial volume
      if (window.mediaManager) {
        soundSlider.value = window.mediaManager.state.volume;
      }

      soundSlider.addEventListener('input', (e) => {
        // Update MediaManager volume
        if (window.mediaManager) {
          window.mediaManager.setVolume(e.target.value);
        }
      });
    }

    // Fullscreen Toggle
    const fullscreenBtn = container.querySelector('#fullscreenBtn');
    if (fullscreenBtn) {
      if (document.fullscreenElement) fullscreenBtn.classList.add('active');
      
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
            console.error(err);
          });
        } else {
          document.exitFullscreen();
        }
      });

      const onFsChange = () => {
        fullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', onFsChange);
      
      // Store reference for removal
      this.fsChangeHandler = onFsChange;
    }

    // Dark Mode (Mock)
    const darkModeBtn = container.querySelector('#darkModeBtn');
    if (darkModeBtn) {
      darkModeBtn.addEventListener('click', () => {
        darkModeBtn.classList.toggle('active');
        document.body.classList.toggle('dark-theme');
      });
    }

    // Outside Click Listener
    this.outsideClickListener = (e) => {
      const item = document.getElementById('quickSettingsItem');
      if (this.isOpen && 
          this.settingsPanel &&
          !this.settingsPanel.contains(e.target) && 
          !(item && item.contains(e.target))) {
        this.closePanel();
      }
    };
    // Delay slightly to avoid catching the initial click that opened the panel
    setTimeout(() => document.addEventListener('click', this.outsideClickListener), 10);
  }

  destroy() {
    // Cleanup media subscription
    if (this.mediaSubscription) {
      this.mediaSubscription();
      this.mediaSubscription = null;
    }

    // Cleanup fullscreen handler
    if (this.fsChangeHandler) {
      document.removeEventListener('fullscreenchange', this.fsChangeHandler);
      this.fsChangeHandler = null;
    }

    // Cleanup outside click listener
    if (this.outsideClickListener) {
      document.removeEventListener('click', this.outsideClickListener);
      this.outsideClickListener = null;
    }

    // Cleanup network listeners
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
      this.onlineHandler = null;
      this.offlineHandler = null;
    }

    // Remove panel from DOM
    if (this.settingsPanel) {
      this.settingsPanel.remove();
      this.settingsPanel = null;
    }
  }
}
// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.QuickSettings = QuickSettings;
}
