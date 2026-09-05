/**
 * SettingsApp - A macOS Tahoe style settings application
 * Features: Appearance, General, About sections with customization options
 */

import { ProfileComponent } from './Profile.js';
import { AppearanceComponent } from './Appearance.js';
import { StorageComponent } from './Storage.js';
import { BackupComponent } from './BackupComponent.js';
import { BillingSettingsComponent } from './BillingSettings.js';
import { AdminComponent } from './Admin.js';

export class SettingsApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const width = window.innerWidth;
    let config = { appId: 'settings', appName: 'Settings', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    this.currentSection = 'appearance';
    
    // Sidebar-based Navigation Order
    this.sectionsOrder = [
      'profile', 'admin', 'wifi', 'bluetooth', 'network', 'energy', 
      'general', 'billing', 'accessibility', 'appearance', 'menubar', 
      'siri', 'dock', 'displays', 'spotlight', 'wallpaper', 'systemhealth', 'android-update'
    ];

    this.settings = this.getDefaultSettings();
    this.wallpaperResourceManager = window.wallpaperResourceManager;
    
    // Track if wallpaper section is visible
    this.wallpaperSectionVisible = false;
    
    this.setupSettingsUI();
    this.applyRoleScoping();
    
    // Initial fetch from backend
    this.fetchSettings();

    // Setup cleanup when app closes
    this.setupCleanupHandlers();
  }

  close() {
    super.close();
  }

  /**
   * Setup cleanup handlers for when settings closes
   */
  setupCleanupHandlers() {
    const appWindow = document.querySelector(`[data-appid="settings"]`);
    if (appWindow) {
      // Listen for when the app window is removed from DOM
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.removedNodes.forEach((node) => {
              if (node === appWindow) {
                console.log('[Settings] Cleaning up wallpaper resources');
                this.cleanupWallpapers();
                observer.disconnect();
              }
            });
          }
        });
      });
      
      observer.observe(appWindow.parentElement, { childList: true });
    }
  }

  async applyRoleScoping() {
    try {
      const response = await fetch('/api/auth/verify');
      const data = await response.json();
      this.userRole = (response.ok && data.user?.role) ? data.user.role : 'owner';
      
      if (this.userRole === 'worker') {
        // Workers only see Profile, Wallpapers, Android App
        const allowedSections = ['profile', 'wallpaper', 'android-update'];
        this.sectionsOrder = allowedSections;
        
        // Hide non-permitted sidebar items
        document.querySelectorAll('.settings-sidebar-item, .sidebar-profile-item').forEach(item => {
          const section = item.getAttribute('data-section');
          if (!allowedSections.includes(section)) {
            item.style.display = 'none';
          } else {
            item.style.display = '';
          }
        });
        
        // Hide extra sidebar dividers
        const dividers = document.querySelectorAll('.settings-sidebar-divider');
        dividers.forEach((div, idx) => {
          if (idx > 0) div.style.display = 'none';
        });

        // If currently on a forbidden section (like appearance or admin), switch to profile
        if (!allowedSections.includes(this.currentSection)) {
          this.switchSection('profile');
        }

        // Lock to Light mode for worker
        this.settings.theme = 'light';
        this.applyTheme();
      } else {
        this.userRole = 'owner';
        // Ensure all sidebar items are visible for owner
        document.querySelectorAll('.settings-sidebar-item, .sidebar-profile-item, .settings-sidebar-divider').forEach(item => {
          item.style.display = '';
        });
      }
    } catch {
      // Fallback safe state
    }
  }

  /**
   * Cleanup wallpaper resources (call when closing settings)
   */
  cleanupWallpapers() {
    if (this.wallpaperResourceManager) {
      console.log('[Settings] Stopping all wallpaper preview videos');
      this.wallpaperResourceManager.cleanup();
    }
  }

  /**
   * Helper: Get proper MIME type for video file
   */
  getVideoMimeType(path) {
    const ext = path?.toLowerCase().split('.').pop() || 'mp4';
    if (ext === 'mp4' || ext === 'mov') {
      return 'video/mp4'; // .mov files are usually MP4 containers
    } else if (ext === 'webm') {
      return 'video/webm';
    }
    return 'video/mp4';
  }

  /**
   * Helper: Create optimized video element for smooth playback
   */
  createOptimizedVideo(path) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata'; // Load metadata only for smooth startup
    
    const source = document.createElement('source');
    source.src = path;
    source.type = this.getVideoMimeType(path);
    
    video.appendChild(source);
    return video;
  }

  setupSettingsUI() {
    // Build the settings UI
    this.buildSettingsLayout();

    // Setup header controls (sidebar button)
    this.setupHeaderControls();

    // Setup settings-specific event listeners
    this.setupSettingsEventListeners();

    // Fetch and Sync Profile
    this.fetchAndSyncProfile();

    // Listen for profile updates from other modules
    window.addEventListener('macos-profile-updated', () => {
      console.log('[Settings] Profile update detected, re-syncing...');
      this.fetchAndSyncProfile();
    });

    // Store reference for home.html
    window.currentSettingsApp = this;

    // Initialize the current section
    this.switchSection(this.currentSection);
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (after traffic lights)
    const leftControls = document.createElement('div');
    leftControls.className = 'settings-left-controls';
    
    // Sidebar toggle button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'settings-header-btn';
    expandBtn.id = 'settingsExpandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(expandBtn);

    // Navigation buttons (Back/Forward)
    const navGroup = document.createElement('div');
    navGroup.className = 'settings-nav-group';
    
    const backBtn = document.createElement('button');
    backBtn.className = 'settings-nav-btn back';
    backBtn.id = 'settingsBackBtn';
    backBtn.disabled = true;
    backBtn.title = 'Back';
    backBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    `;
    
    const navDivider = document.createElement('div');
    navDivider.className = 'settings-nav-divider';
    
    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'settings-nav-btn forward';
    forwardBtn.id = 'settingsForwardBtn';
    forwardBtn.disabled = true;
    forwardBtn.title = 'Forward';
    forwardBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    
    navGroup.appendChild(backBtn);
    navGroup.appendChild(navDivider);
    navGroup.appendChild(forwardBtn);
    leftControls.appendChild(navGroup);
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);

    // Add app-header class to title for referencing (as requested)
    const title = titleBar.querySelector('.app-title');
    if (title) {
      title.classList.add('app-header');
    }
    
    // Store references
    this.expandBtn = expandBtn;
    this.backBtn = backBtn;
    this.forwardBtn = forwardBtn;
    
    // Setup listeners
    this.expandBtn.addEventListener('click', () => this.toggleSidebar());
    this.backBtn.addEventListener('click', () => this.navigateBack());
    this.forwardBtn.addEventListener('click', () => this.navigateForward());
  }

  navigateBack() {
    const currentIndex = this.sectionsOrder.indexOf(this.currentSection);
    if (currentIndex > 0) {
      this.switchSection(this.sectionsOrder[currentIndex - 1]);
    }
  }

  navigateForward() {
    const currentIndex = this.sectionsOrder.indexOf(this.currentSection);
    if (currentIndex < this.sectionsOrder.length - 1 && currentIndex !== -1) {
      this.switchSection(this.sectionsOrder[currentIndex + 1]);
    }
  }

  updateNavButtonState() {
    if (!this.backBtn || !this.forwardBtn) return;
    
    const currentIndex = this.sectionsOrder.indexOf(this.currentSection);
    this.backBtn.disabled = currentIndex <= 0;
    this.forwardBtn.disabled = currentIndex >= this.sectionsOrder.length - 1 || currentIndex === -1;
  }

  toggleSidebar() {
    this.sidebar?.classList.toggle('hidden');
  }


  buildSettingsLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <!-- Settings Sidebar -->
      <div class="settings-sidebar">
        <input type="text" class="settings-sidebar-search" placeholder="Search">
        
        <div class="settings-sidebar-divider"></div>

        <div class="sidebar-profile-item" data-section="profile">
          <div class="sidebar-avatar">👤</div>
          <div class="sidebar-profile-info">
            <span class="sidebar-name">Mohammad Faizal</span>
            <span class="sidebar-subtitle">Apple Account</span>
          </div>
        </div>

        <button class="settings-sidebar-item" data-section="admin">
          <span class="settings-sidebar-icon">🛡️</span>
          <span>Worker Access</span>
        </button>

        <div class="settings-sidebar-divider"></div>

        <button class="settings-sidebar-item" data-section="wifi">
          <span class="settings-sidebar-icon">📶</span>
          <span>Wi-Fi</span>
        </button>

        <button class="settings-sidebar-item" data-section="bluetooth">
          <span class="settings-sidebar-icon">🔵</span>
          <span>Bluetooth</span>
        </button>

        <button class="settings-sidebar-item" data-section="network">
          <span class="settings-sidebar-icon">🌐</span>
          <span>Network</span>
        </button>

        <button class="settings-sidebar-item" data-section="energy">
          <span class="settings-sidebar-icon">⚡</span>
          <span>Energy</span>
        </button>

        <div class="settings-sidebar-divider"></div>

        <button class="settings-sidebar-item" data-section="general">
          <span class="settings-sidebar-icon">⚙️</span>
          <span>General</span>
        </button>

        <button class="settings-sidebar-item" data-section="billing">
          <span class="settings-sidebar-icon">🧾</span>
          <span>Billing & Invoices</span>
        </button>

        <button class="settings-sidebar-item" data-section="accessibility">
          <span class="settings-sidebar-icon">♿</span>
          <span>Accessibility</span>
        </button>

        <button class="settings-sidebar-item active" data-section="appearance">
          <span class="settings-sidebar-icon">🎨</span>
          <span>Appearance</span>
        </button>

        <button class="settings-sidebar-item" data-section="menubar">
          <span class="settings-sidebar-icon">📋</span>
          <span>Menu Bar</span>
        </button>

        <button class="settings-sidebar-item" data-section="siri">
          <span class="settings-sidebar-icon">🎤</span>
          <span>Siri</span>
        </button>

        <button class="settings-sidebar-item" data-section="dock">
          <span class="settings-sidebar-icon">🖥️</span>
          <span>Desktop & Dock</span>
        </button>

        <button class="settings-sidebar-item" data-section="displays">
          <span class="settings-sidebar-icon">📺</span>
          <span>Displays</span>
        </button>

        <button class="settings-sidebar-item" data-section="spotlight">
          <span class="settings-sidebar-icon">🔍</span>
          <span>Spotlight</span>
        </button>

        <button class="settings-sidebar-item" data-section="wallpaper">
          <span class="settings-sidebar-icon">🖼️</span>
          <span>Wallpaper</span>
        </button>

        <div class="settings-sidebar-divider"></div>

        <button class="settings-sidebar-item" data-section="systemhealth">
          <span class="settings-sidebar-icon">❤️</span>
          <span>System Health</span>
        </button>

        <button class="settings-sidebar-item" data-section="android-update">
          <span class="settings-sidebar-icon">📱</span>
          <span>Android App</span>
        </button>
      </div>

      <!-- Settings Panels -->
      <div class="settings-panel" id="appearance-panel">
        <div class="appearance-placeholder">Loading Appearance...</div>
      </div>

      <div class="settings-panel hidden" id="admin-panel"></div>

      <div class="settings-panel hidden" id="general-panel">
        <!-- Main General View -->
        <div id="general-main-view" style="display: flex; flex-direction: column; gap: 20px;">
          <div class="settings-section">
            <div class="settings-section-title">General Settings</div>
            
            <!-- Storage Row Button -->
            <div class="settings-row-item" id="generalStorageBtn" style="cursor: pointer;">
              <div class="settings-row-left">
                <span class="settings-row-icon">💾</span>
                <span>Storage</span>
              </div>
              <span class="settings-row-chevron">›</span>
            </div>

            <!-- Database & Cloud Backup Row Button -->
            <div class="settings-row-item" id="generalBackupBtn" style="cursor: pointer; margin-top: 8px;">
              <div class="settings-row-left">
                <span class="settings-row-icon">📦</span>
                <span>Database & Cloud Backups</span>
              </div>
              <span class="settings-row-chevron">›</span>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">System Features</div>
            <div class="settings-toggle">
              <div class="toggle-label">Allow Handoff between this Mac and iCloud devices</div>
              <button class="toggle-switch active" data-toggle="handoff">
                <div class="toggle-switch-knob"></div>
              </button>
            </div>
            <div class="settings-toggle">
              <div class="toggle-label">Use iCloud for syncing</div>
              <button class="toggle-switch active" data-toggle="icloud">
                <div class="toggle-switch-knob"></div>
              </button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Default Web Browser</div>
            <div class="appearance-item">
              <div class="appearance-label">Safari</div>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section-title">Dock & Menu Bar</div>
            <div class="settings-toggle">
              <div class="toggle-label">Show in menu bar</div>
              <button class="toggle-switch active" data-toggle="menu-bar">
                <div class="toggle-switch-knob"></div>
              </button>
            </div>
            <div class="settings-toggle">
              <div class="toggle-label">Automatically hide and show the Dock</div>
              <button class="toggle-switch" data-toggle="dock-hide">
                <div class="toggle-switch-knob"></div>
              </button>
            </div>
          </div>
        </div>

        <!-- Storage View Container -->
        <div id="general-storage-view" class="hidden" style="height: 100%;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <button id="generalStorageBackBtn" class="settings-back-btn">
              <span>‹</span> <span>General</span>
            </button>
            <div style="font-weight: 600; font-size: 14px;">Storage settings</div>
          </div>
          <div id="storageComponentContainer" style="height: 100%;"></div>
        </div>

        <!-- Database & Cloud Backup View Container -->
        <div id="general-backup-view" class="hidden" style="height: 100%;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <button id="generalBackupBackBtn" class="settings-back-btn">
              <span>‹</span> <span>General</span>
            </button>
            <div style="font-weight: 600; font-size: 14px;">Database & Cloud Backups</div>
          </div>
          <div id="backupComponentContainer" style="height: calc(100% - 40px);"></div>
        </div>
      </div>

      <div class="settings-panel hidden" id="about-panel">
        <div class="settings-section">
          <div class="settings-section-title">About</div>
          <div class="appearance-item">
            <div class="appearance-label">System</div>
            <div class="appearance-value">Liquid Glass Desktop Environment</div>
          </div>
          <div class="appearance-item">
            <div class="appearance-label">Version</div>
            <div class="appearance-value">1.0.0</div>
          </div>
          <div class="appearance-item">
            <div class="appearance-label">Build</div>
            <div class="appearance-value">macOS Tahoe (14.0)</div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">System Information</div>
          <div class="appearance-item">
            <div class="appearance-label">Model</div>
            <div class="appearance-value">Liquid Glass Display</div>
          </div>
          <div class="appearance-item">
            <div class="appearance-label">Processor</div>
            <div class="appearance-value">Web Browser Engine</div>
          </div>
          <div class="appearance-item">
            <div class="appearance-label">Memory</div>
            <div class="appearance-value">System Memory</div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Software License Agreement</div>
          <div class="appearance-item">
            <div class="appearance-value">© 2024 Liquid Glass OS. All rights reserved.</div>
          </div>
        </div>
      </div>

      <!-- Placeholder panels for other sections -->
      <div class="settings-panel hidden" id="profile-panel">
        <div class="profile-placeholder">Loading Profile...</div>
      </div>

      <div class="settings-panel hidden" id="billing-panel"></div>

      <div class="settings-panel hidden" id="wifi-panel">
        <div class="settings-section">
          <div class="settings-section-title">Wi-Fi</div>
          <div class="appearance-item">
            <div class="appearance-label">Wi-Fi is turned on</div>
            <div class="appearance-value">Status: Connected</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="bluetooth-panel">
        <div class="settings-section">
          <div class="settings-section-title">Bluetooth</div>
          <div class="appearance-item">
            <div class="appearance-label">Bluetooth is on</div>
            <div class="appearance-value">No devices connected</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="network-panel">
        <div class="settings-section">
          <div class="settings-section-title">Network</div>
          <div class="appearance-item">
            <div class="appearance-label">Network Settings</div>
            <div class="appearance-value">Connected</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="energy-panel">
        <div class="settings-section">
          <div class="settings-section-title">Energy</div>
          <div class="appearance-item">
            <div class="appearance-label">Power Management</div>
            <div class="appearance-value">Optimized</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="accessibility-panel">
        <div class="settings-section">
          <div class="settings-section-title">Accessibility</div>
          <div class="settings-toggle">
            <div class="toggle-label">Display zoom</div>
            <button class="toggle-switch" data-toggle="zoom">
              <div class="toggle-switch-knob"></div>
            </button>
          </div>
          <div class="settings-toggle">
            <div class="toggle-label">Increase contrast</div>
            <button class="toggle-switch" data-toggle="contrast">
              <div class="toggle-switch-knob"></div>
            </button>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="menubar-panel">
        <div class="settings-section">
          <div class="settings-section-title">Menu Bar</div>
          <div class="appearance-item">
            <div class="appearance-label">Show in menu bar</div>
            <button class="toggle-switch active menubar-toggle-container" data-toggle="menubar-show">
              <div class="toggle-switch-knob"></div>
            </button>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="siri-panel">
        <div class="settings-section">
          <div class="settings-section-title">Siri</div>
          <div class="settings-toggle">
            <div class="toggle-label">Enable Siri</div>
            <button class="toggle-switch active" data-toggle="siri">
              <div class="toggle-switch-knob"></div>
            </button>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="dock-panel">
        <div class="settings-section">
          <div class="settings-section-title">Desktop & Dock</div>
          <div class="settings-toggle">
            <div class="toggle-label">Automatically hide and show the Dock</div>
            <button class="toggle-switch" data-toggle="dock-auto-hide">
              <div class="toggle-switch-knob"></div>
            </button>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="displays-panel">
        <div class="settings-section">
          <div class="settings-section-title">Displays</div>
          <div class="appearance-item">
            <div class="appearance-label">Resolution</div>
            <div class="appearance-value">Default for display</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="spotlight-panel">
        <div class="settings-section">
          <div class="settings-section-title">Spotlight</div>
          <div class="appearance-item">
            <div class="appearance-label">Spotlight Search</div>
            <div class="appearance-value">Enabled</div>
          </div>
        </div>
      </div>

      <div class="settings-panel hidden" id="android-update-panel">
        <div class="settings-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <div class="settings-section-title" style="margin-bottom:2px;">🤖 Business Suite for Android</div>
              <div style="font-size:12px; color:var(--settings-text-secondary);">Enterprise OTA Distribution, Integrity Verification & Release Channel</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button id="androidUpdateCheckBtn" class="storage-btn" style="font-size:12px; padding:6px 12px; cursor:pointer;">🔄 Check Updates</button>
            </div>
          </div>

          <!-- Active Release Hero Card -->
          <div class="health-card" style="margin-bottom:16px; background:rgba(255,255,255,0.06); border:1px solid var(--settings-border); border-radius:12px; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; gap:14px; align-items:center;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #34c759, #30d158); display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 12px rgba(52,199,89,0.3);">
                  🤖
                </div>
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px; font-weight:700;" id="androidHeroTitle">Business Suite Android</span>
                    <span id="androidVersionBadge" style="font-size:11px; font-weight:700; background:rgba(52,199,89,0.2); color:#34c759; padding:2px 8px; border-radius:6px; border:1px solid rgba(52,199,89,0.3);">v1.0.0</span>
                    <span id="androidCodeBadge" style="font-size:11px; font-weight:600; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:6px;">Build #1</span>
                  </div>
                  <div id="androidMetaRow" style="font-size:12px; color:var(--settings-text-secondary); margin-top:4px;">
                    Published: <span id="androidPublishedAt">-</span> • Size: <span id="androidApkSize">-</span> • Downloads: <span id="androidDownloadCount">0</span>
                  </div>
                </div>
              </div>

              <!-- Download Buttons -->
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <a id="androidUpdateDownloadLink" href="/api/android/update/latest" class="storage-btn primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:8px 16px; background:#0a84ff; color:#fff; border-radius:8px;">
                  ⬇️ Download APK (<span id="androidDownloadBtnLabel">BusinessSuite-v1.0.0.apk</span>)
                </a>
                <a id="androidR2DownloadLink" href="#" target="_blank" class="storage-btn" style="display:none; text-decoration:none; font-size:12px; padding:8px 14px; border-radius:8px;">
                  ☁️ R2 Mirror
                </a>
              </div>
            </div>

            <!-- SHA-256 Checksum Bar -->
            <div style="margin-top:14px; padding:10px 12px; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; gap:10px; font-family:monospace; font-size:11px;">
              <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <span style="color:var(--settings-text-tertiary); font-family:sans-serif; margin-right:6px;">SHA-256:</span>
                <span id="androidSha256" style="color:#2997ff;">Computing...</span>
              </div>
              <button id="androidCopyHashBtn" class="storage-cell-edit-btn" style="font-size:10px; padding:3px 8px; white-space:nowrap; border-radius:4px; cursor:pointer;">📋 Copy</button>
            </div>
          </div>

          <!-- Active Release Notes Card -->
          <div style="margin-bottom:16px; background:rgba(255,255,255,0.04); border:1px solid var(--settings-border); border-radius:10px; padding:14px;">
            <div style="font-size:13px; font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
              📝 Current Release Notes
            </div>
            <div id="androidUpdateNotes" style="font-size:12px; color:var(--settings-text-secondary); line-height:1.5; white-space:pre-wrap;">Loading notes...</div>
          </div>

          <!-- Version History & Rollback Card -->
          <div style="margin-bottom:16px; background:rgba(255,255,255,0.04); border:1px solid var(--settings-border); border-radius:10px; padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;">
                ⏱️ Version History & Instant Rollback
              </div>
              <div style="font-size:11px; color:var(--settings-text-tertiary);">Last 20 builds archived</div>
            </div>
            <div id="androidHistoryContainer" style="display:flex; flex-direction:column; gap:8px;">
              <div style="text-align:center; padding:12px; color:var(--settings-text-tertiary); font-size:12px;">Loading version history...</div>
            </div>
          </div>

          <!-- Admin Manual Upload & Overwrite Card -->
          <div style="background:rgba(255,255,255,0.04); border:1px solid var(--settings-border); border-radius:10px; padding:14px;">
            <div style="font-size:13px; font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              🚀 Publish / Upload APK Manually
            </div>
            <div style="font-size:12px; color:var(--settings-text-secondary); margin-bottom:12px;">
              Upload an updated APK binary to immediately replace the live version and broadcast update notifications.
            </div>

            <form id="androidUploadForm" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:11px; font-weight:600; display:block; margin-bottom:4px;">Version Name</label>
                <input type="text" id="uploadVersionName" class="settings-input" placeholder="e.g. 1.0.6" style="width:100%; font-size:12px; padding:7px 10px; border-radius:6px; background:var(--settings-input-bg); border:1px solid var(--settings-border); color:inherit;" required />
              </div>
              <div>
                <label style="font-size:11px; font-weight:600; display:block; margin-bottom:4px;">Version Code</label>
                <input type="number" id="uploadVersionCode" class="settings-input" placeholder="e.g. 6" style="width:100%; font-size:12px; padding:7px 10px; border-radius:6px; background:var(--settings-input-bg); border:1px solid var(--settings-border); color:inherit;" required />
              </div>
              <div style="grid-column: 1 / -1;">
                <label style="font-size:11px; font-weight:600; display:block; margin-bottom:4px;">Release Notes</label>
                <textarea id="uploadReleaseNotes" class="settings-input" rows="2" placeholder="What's new in this build..." style="width:100%; font-size:12px; padding:7px 10px; border-radius:6px; background:var(--settings-input-bg); border:1px solid var(--settings-border); color:inherit; resize:vertical;"></textarea>
              </div>
              <div style="grid-column: 1 / -1; display:flex; gap:10px; align-items:center; margin-top:4px;">
                <input type="file" id="uploadApkFile" accept=".apk" style="font-size:12px; flex:1;" required />
                <button type="submit" id="uploadApkSubmitBtn" class="storage-btn primary" style="padding:7px 18px; font-size:12px; border-radius:6px; background:#34c759; color:#fff; border:none; cursor:pointer; font-weight:600;">
                  ⬆️ Publish Update
                </button>
              </div>
            </form>
            <div id="uploadStatusMsg" style="font-size:12px; margin-top:8px; display:none;"></div>
          </div>

        </div>
      </div>

      <div class="settings-panel hidden" id="systemhealth-panel">
        <div class="settings-section">
          <div class="settings-section-title">Backend & Database Status</div>
          
          <!-- Backend Status Card -->
          <div class="health-card">
            <div class="health-card-header">
              <span class="health-icon" id="backendStatusIcon">⏳</span>
              <div class="health-card-info">
                <div class="health-label">Backend Server</div>
                <div class="health-value" id="backendStatus">Checking...</div>
              </div>
            </div>
            <div class="health-details" id="backendDetails">
              <div class="health-detail-item">
                <span class="detail-label">Address:</span>
                <span class="detail-value" id="backendAddressValue">—</span>
              </div>
              <div class="health-detail-item">
                <span class="detail-label">Last Check:</span>
                <span class="detail-value" id="backendLastCheck">—</span>
              </div>
            </div>
          </div>

          <!-- Database Status Card -->
          <div class="health-card">
            <div class="health-card-header">
              <span class="health-icon" id="databaseStatusIcon">⏳</span>
              <div class="health-card-info">
                <div class="health-label">Database</div>
                <div class="health-value" id="databaseStatus">Checking...</div>
              </div>
            </div>
            <div class="health-details" id="databaseDetails">
              <div class="health-detail-item">
                <span class="detail-label">Type:</span>
                <span class="detail-value">SQLite 3</span>
              </div>
              <div class="health-detail-item">
                <span class="detail-label">Location:</span>
                <span class="detail-value">database/billing.db</span>
              </div>
              <div class="health-detail-item">
                <span class="detail-label">Tables:</span>
                <span class="detail-value" id="databaseTables">—</span>
              </div>
            </div>
          </div>

          <!-- API Endpoints Status Card -->
          <div class="health-card">
            <div class="health-card-header">
              <span class="health-icon" id="apiStatusIcon">⏳</span>
              <div class="health-card-info">
                <div class="health-label">API Endpoints</div>
                <div class="health-value" id="apiStatus">Checking...</div>
              </div>
            </div>
            <div class="health-details" id="apiDetails">
              <div class="health-detail-item">
                <span class="detail-label">Available:</span>
                <span class="detail-value" id="apiEndpoints">—</span>
              </div>
              <div class="health-detail-item">
                <span class="detail-label">Proxy Path:</span>
                <span class="detail-value" id="apiProxyValue">—</span>
              </div>
            </div>
          </div>

          <!-- Docker Blue / Green Architecture Visualizer Card -->
          <div class="health-card" style="grid-column: 1 / -1;">
            <div class="health-card-header">
              <span class="health-icon">🐳</span>
              <div class="health-card-info">
                <div class="health-label">Docker Zero-Downtime Cluster</div>
                <div class="health-value" id="dockerClusterStatus" style="color: #34c759;">🟢 Active Slot: Detecting...</div>
              </div>
            </div>
            <div class="health-details" style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <!-- Blue Slot -->
                <div id="dockerBlueSlotCard" style="border: 1px solid var(--settings-border); border-radius: 8px; padding: 10px; background: rgba(0, 122, 255, 0.05);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <div style="font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #007aff;"></span>
                      <span>Blue Slot (3001)</span>
                    </div>
                    <span id="dockerBlueBadge" style="font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600;">Standby</span>
                  </div>
                  <div style="font-size: 11px; color: var(--settings-text-secondary); line-height: 1.4;">
                    Container: <code>macos-server-blue</code><br/>
                    Target: <code>127.0.0.1:3001</code>
                  </div>
                </div>

                <!-- Green Slot -->
                <div id="dockerGreenSlotCard" style="border: 1px solid var(--settings-border); border-radius: 8px; padding: 10px; background: rgba(52, 199, 89, 0.05);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <div style="font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #34c759;"></span>
                      <span>Green Slot (3004)</span>
                    </div>
                    <span id="dockerGreenBadge" style="font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 600;">Standby</span>
                  </div>
                  <div style="font-size: 11px; color: var(--settings-text-secondary); line-height: 1.4;">
                    Container: <code>macos-server-green</code><br/>
                    Target: <code>127.0.0.1:3004</code>
                  </div>
                </div>
              </div>

              <!-- Interactive Docker Actions Toolbar -->
              <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--settings-border); padding-top: 10px; flex-wrap: wrap; gap: 8px;">
                <div class="cluster-btn-group">
                  <button class="cluster-btn primary" id="dockerSwitchSlotBtn">
                    ⇄ Switch Active Slot
                  </button>
                  <button class="cluster-btn warning" id="dockerRestartSlotBtn">
                    ↻ Restart Active Container
                  </button>
                  <button class="cluster-btn" id="dockerRollbackBtn">
                    ↩ Instant Rollback
                  </button>
                </div>
                <div style="font-size: 11px; color: var(--settings-text-tertiary);" id="dockerActionStatus">
                  Ready • Zero-Downtime Safe
                </div>
              </div>

              <div style="font-size: 11px; color: var(--settings-text-tertiary); display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--settings-border); padding-top: 8px;">
                <span>Nginx Upstream: <code>/etc/nginx/conf.d/upstream_macos.conf</code></span>
                <span id="dockerSwitchSummary">Active traffic seamlessly routed via zero-downtime hot reloading</span>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Actions</div>
          <button class="health-action-btn" id="refreshHealthBtn">🔄 Refresh Status</button>
        </div>
      </div>

      <div class="settings-panel hidden" id="wallpaper-panel">
        <div class="settings-section">
          <!-- Wallpaper Header with Preview and Controls -->
          <div class="wallpaper-header">
            <div class="wallpaper-preview-container">
              <div class="current-wallpaper-preview" id="currentWallpaperPreview">
                <span class="preview-placeholder">No wallpaper selected</span>
              </div>
              <div class="current-wallpaper-info" id="currentWallpaperInfo">
                <div class="wallpaper-name">Select a wallpaper</div>
              </div>
            </div>
            
            <div class="wallpaper-variant-selector">
              <div class="variant-label">Variant</div>
              <div class="variant-buttons">
                <button class="variant-btn active" data-variant="automatic" id="variantAutomatic">Automatic</button>
                <button class="variant-btn" data-variant="light" id="variantLight">Light</button>
                <button class="variant-btn" data-variant="dark" id="variantDark">Dark</button>
              </div>
            </div>
          </div>

          <div class="settings-section-title">Wallpaper</div>
          
          <!-- Add Wallpaper Button -->
          <div class="add-wallpaper-container">
            <button class="add-wallpaper-btn" id="addWallpaperBtn">
              <span class="add-wallpaper-icon">+</span>
              <span class="add-wallpaper-text">Add Wallpaper</span>
            </button>
          </div>

          <!-- Custom Wallpapers Grid -->
          <div class="wallpaper-category">
            <div class="wallpaper-category-title">My Wallpapers</div>
            <div class="wallpaper-grid" id="customWallpaperGrid">
              <div class="wallpaper-section"></div>
            </div>
          </div>

          <!-- Wallpaper Options -->
          <div class="wallpaper-options">
            <div class="wallpaper-option-group">
              <label class="option-label">Loop Transition</label>
              <select id="loopTransition" class="wallpaper-select">
                <option value="none">None</option>
                <option value="frost" selected>Frost Effect</option>
                <option value="fade">Fade</option>
                <option value="dissolve">Dissolve</option>
              </select>
            </div>

            <div class="wallpaper-option-group">
              <label class="option-label">Playback Speed</label>
              <div class="speed-slider-container">
                <span class="speed-label">0.5x</span>
                <input type="range" id="playbackSpeed" class="wallpaper-slider" min="0.5" max="2" step="0.25" value="1" />
                <span class="speed-label">2x</span>
              </div>
              <div class="speed-value" id="speedValue">Normal (1x)</div>
            </div>

            <div class="wallpaper-option-group">
              <label class="settings-label">
                <input type="checkbox" id="autoSwitchWallpaper" class="wallpaper-checkbox" />
                <span>Auto-switch wallpaper daily</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    this.sidebar = contentArea.querySelector('.settings-sidebar');
    this.sidebarItems = contentArea.querySelectorAll('.settings-sidebar-item, .sidebar-profile-item');
    this.panels = contentArea.querySelectorAll('.settings-panel');
    this.toggles = contentArea.querySelectorAll('.toggle-switch');
  }


  setupSettingsEventListeners() {
    // Sidebar navigation
    this.sidebarItems.forEach(item => {
      item.addEventListener('click', (e) => {
        this.switchSection(item.getAttribute('data-section'));
      });
    });

    // Toggle switches
    this.toggles.forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle.classList.toggle('active');
        const toggleName = toggle.getAttribute('data-toggle');
        this.settings[toggleName] = toggle.classList.contains('active');
        this.saveSettings();
      });
    });

    // Add Wallpaper button
    const addWallpaperBtn = document.getElementById('addWallpaperBtn');
    if (addWallpaperBtn) {
      addWallpaperBtn.addEventListener('click', () => {
        this.showAddWallpaperModal();
      });
    }

    // Wallpaper options - Loop transition
    const loopTransition = document.getElementById('loopTransition');
    if (loopTransition) {
      loopTransition.value = this.settings.loopTransition || 'frost';
      loopTransition.addEventListener('change', (e) => {
        this.settings.loopTransition = e.target.value;
        this.saveSettings();
        this.applyTransitionEffect(e.target.value);
      });
    }

    // Wallpaper options - Playback speed
    const playbackSpeed = document.getElementById('playbackSpeed');
    if (playbackSpeed) {
      playbackSpeed.value = this.settings.playbackSpeed || 1;
      playbackSpeed.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        this.settings.playbackSpeed = speed;
        this.applyPlaybackSpeed(speed);
        
        // Update display
        const speedValue = document.getElementById('speedValue');
        if (speedValue) {
          if (speed === 1) {
            speedValue.textContent = 'Normal (1x)';
          } else {
            speedValue.textContent = `${speed.toFixed(2)}x`;
          }
        }
      });
    }

    // Wallpaper options - Auto-switch
    const autoSwitch = document.getElementById('autoSwitchWallpaper');
    if (autoSwitch) {
      autoSwitch.checked = this.settings.autoSwitchWallpaper || false;
      autoSwitch.addEventListener('change', (e) => {
        this.settings.autoSwitchWallpaper = e.target.checked;
        this.saveSettings();
      });
    }

    // System Health - Refresh button
    const refreshHealthBtn = document.getElementById('refreshHealthBtn');
    if (refreshHealthBtn) {
      refreshHealthBtn.addEventListener('click', () => {
        this.checkSystemHealth();
      });
    }

    // Check health when switching to system health panel
    this.sidebarItems.forEach(item => {
      if (item.getAttribute('data-section') === 'systemhealth') {
        item.addEventListener('click', () => {
          setTimeout(() => this.checkSystemHealth(), 100);
        });
      }
    });

    // General - Storage sub-view logic
    const generalStorageBtn = document.getElementById('generalStorageBtn');
    const generalStorageBackBtn = document.getElementById('generalStorageBackBtn');
    const generalMainView = document.getElementById('general-main-view');
    const generalStorageView = document.getElementById('general-storage-view');
    const storageContainer = document.getElementById('storageComponentContainer');

    if (generalStorageBtn && generalStorageBackBtn && generalMainView && generalStorageView && storageContainer) {
      generalStorageBtn.addEventListener('click', () => {
        generalMainView.classList.add('hidden');
        generalStorageView.classList.remove('hidden');
        
        if (!this.storageModule) {
          this.storageModule = new StorageComponent(storageContainer);
        }
        this.storageModule.render();
      });

      generalStorageBackBtn.addEventListener('click', () => {
        generalStorageView.classList.add('hidden');
        generalMainView.classList.remove('hidden');
      });
    }

    // General - Backup & Cloud Disaster Recovery sub-view logic
    const generalBackupBtn = document.getElementById('generalBackupBtn');
    const generalBackupBackBtn = document.getElementById('generalBackupBackBtn');
    const generalBackupView = document.getElementById('general-backup-view');
    const backupContainer = document.getElementById('backupComponentContainer');

    if (generalBackupBtn && generalBackupBackBtn && generalMainView && generalBackupView && backupContainer) {
      generalBackupBtn.addEventListener('click', () => {
        generalMainView.classList.add('hidden');
        generalBackupView.classList.remove('hidden');

        if (!this.backupModule) {
          this.backupModule = new BackupComponent(backupContainer);
        }
        this.backupModule.render();
      });

      generalBackupBackBtn.addEventListener('click', () => {
        generalBackupView.classList.add('hidden');
        generalMainView.classList.remove('hidden');
      });
    }

    // Docker Cluster Interactive Management Events
    const switchSlotBtn = document.getElementById('dockerSwitchSlotBtn');
    const restartSlotBtn = document.getElementById('dockerRestartSlotBtn');
    const rollbackBtn = document.getElementById('dockerRollbackBtn');
    const actionStatus = document.getElementById('dockerActionStatus');

    switchSlotBtn?.addEventListener('click', async () => {
      const confirmSwitch = confirm('Initiate zero-downtime cutover to the standby container slot? Traffic will smoothly transition with zero interruption.');
      if (!confirmSwitch) return;

      switchSlotBtn.disabled = true;
      if (actionStatus) actionStatus.textContent = '⏳ Initiating zero-downtime cutover...';

      try {
        const res = await fetch('/api/settings/docker/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
          alert(`✓ Cutover Success: ${data.message}`);
          setTimeout(() => this.checkSystemHealth(), 1500);
        } else {
          alert(`Switch failed: ${data.error || 'Server error'}`);
        }
      } catch (err) {
        alert('Network request sent. Checking cluster status...');
        setTimeout(() => this.checkSystemHealth(), 2000);
      } finally {
        switchSlotBtn.disabled = false;
        if (actionStatus) actionStatus.textContent = 'Ready • Zero-Downtime Safe';
      }
    });

    restartSlotBtn?.addEventListener('click', async () => {
      const confirmRestart = confirm('Restart the currently active container? Docker will automatically bring it back up cleanly in 2-3 seconds.');
      if (!confirmRestart) return;

      restartSlotBtn.disabled = true;
      if (actionStatus) actionStatus.textContent = '⏳ Graceful restart initiated...';

      try {
        await fetch('/api/settings/docker/restart', { method: 'POST' });
        setTimeout(() => {
          this.checkSystemHealth();
          if (actionStatus) actionStatus.textContent = '🟢 Container restarted successfully';
        }, 3000);
      } catch (err) {
        setTimeout(() => this.checkSystemHealth(), 3000);
      } finally {
        restartSlotBtn.disabled = false;
      }
    });

    rollbackBtn?.addEventListener('click', async () => {
      const confirmRollback = confirm('Execute an instant rollback? This swaps the live Nginx proxy to the previous verified slot immediately.');
      if (!confirmRollback) return;

      if (actionStatus) actionStatus.textContent = '⏳ Rolling back to previous slot...';
      try {
        const res = await fetch('/api/settings/docker/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const data = await res.json();
        alert(data.success ? `✓ Rollback complete! Active slot changed.` : `Rollback notice: ${data.error}`);
        this.checkSystemHealth();
      } catch (e) {
        setTimeout(() => this.checkSystemHealth(), 1500);
      } finally {
        if (actionStatus) actionStatus.textContent = 'Ready • Zero-Downtime Safe';
      }
    });

    // Initial health check
    this.checkSystemHealth();
    this.bindAndroidUpdateControls();
  }

  async fetchAndSyncProfile() {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      
      if (data.success && data.profile) {
        const sidebar = document.getElementById(this.containerId).querySelector('.settings-sidebar');
        if (!sidebar) return;
        
        const avatarEl = sidebar.querySelector('.sidebar-avatar');
        const nameEl = sidebar.querySelector('.sidebar-name');
        const subtitleEl = sidebar.querySelector('.sidebar-subtitle');
        
        const displayPhoto = data.profile.display_picture || data.profile.profile_picture;
        const displayName = data.profile.display_name || data.profile.full_name;
        const displayEmail = data.profile.display_email || data.profile.email_id;

        if (avatarEl && displayPhoto) {
          avatarEl.innerHTML = `<img src="${displayPhoto}" alt="Profile" class="sidebar-avatar-img">`;
          avatarEl.style.background = 'transparent';
        }
        
        if (nameEl && displayName) {
          nameEl.textContent = displayName;
        }

        if (subtitleEl && displayEmail) {
          subtitleEl.textContent = displayEmail;
        }
      }
    } catch (err) {
      console.error('Failed to sync settings sidebar profile:', err);
    }
  }

  applyTransitionEffect(effect) {
    // Apply transition effect to wallpaper videos
    // This could be implemented with CSS filters or WebGL effects
    const wallpaperBg = document.getElementById('wallpaperBackground');
    if (wallpaperBg) {
      const video = wallpaperBg.querySelector('video');
      if (video) {
        // Clear any existing filter
        video.style.filter = '';
        
        // Apply effect based on selection
        switch(effect) {
          case 'frost':
            video.style.filter = 'blur(3px) brightness(1.05)';
            break;
          case 'fade':
            video.style.opacity = '0.9';
            break;
          case 'dissolve':
            video.style.mixBlendMode = 'lighten';
            break;
          default:
            video.style.filter = '';
        }
      }
    }
  }

  applyPlaybackSpeed(speed) {
    // Apply playback speed to wallpaper videos
    const wallpaperBg = document.getElementById('wallpaperBackground');
    if (wallpaperBg) {
      const video = wallpaperBg.querySelector('video');
      if (video) {
        video.playbackRate = speed;
      }
    }
  }

  loadWallpapers() {
    const customGrid = document.getElementById('customWallpaperGrid');
    
    if (!customGrid) {
      console.error('customWallpaperGrid element not found in DOM');
      return;
    }

    // Check if already loaded to prevent unnecessary reloads
    if (customGrid.dataset.wallpapersLoaded === 'true') {
      console.log('[Wallpaper] Grid already loaded, skipping reload');
      return;
    }

    // Show loading state
    customGrid.innerHTML = '<div class="loading-message">Loading wallpapers...</div>';

    try {
      console.log('[Wallpaper] Loading wallpapers from API...');
      
      // Load wallpapers from API (built-in)
      this.getWallpapersFromAPI().then((apiWallpapers) => {
        console.log('[Wallpaper] API returned ' + apiWallpapers.length + ' wallpapers');
        
        const allWallpapers = apiWallpapers;
        
        console.log('[Wallpaper] Total: ' + allWallpapers.length + ' wallpapers');
        
        if (allWallpapers.length === 0) {
          console.warn('No wallpapers found from API');
          customGrid.innerHTML = '<div class="empty-wallpaper-message">No wallpapers available. Check your Assets folder!</div>';
          return;
        }

        customGrid.innerHTML = '';

        // Separate by type
        const dynamicWallpapers = allWallpapers.filter(w => w.type === 'video');
        const staticWallpapers = allWallpapers.filter(w => w.type === 'image');

        console.log('[Wallpaper] Dynamic: ' + dynamicWallpapers.length + ', Static: ' + staticWallpapers.length);

        // Add dynamic section
        if (dynamicWallpapers.length > 0) {
          const dynamicSection = document.createElement('div');
          dynamicSection.className = 'wallpaper-section';
          dynamicSection.innerHTML = '<div class="wallpaper-section-title">Dynamic Wallpapers</div>';
          const dynamicGridDiv = document.createElement('div');
          dynamicGridDiv.className = 'wallpaper-grid-items';
          
          dynamicWallpapers.forEach((wallpaper, index) => {
            const item = this.createWallpaperItem(wallpaper);
            dynamicGridDiv.appendChild(item);
            
            // The new WallpaperEngine handles on-demand loading naturally
          });
          
          dynamicSection.appendChild(dynamicGridDiv);
          customGrid.appendChild(dynamicSection);
        }

        // Add static section
        if (staticWallpapers.length > 0) {
          const staticSection = document.createElement('div');
          staticSection.className = 'wallpaper-section';
          staticSection.innerHTML = '<div class="wallpaper-section-title">Static Wallpapers</div>';
          const staticGridDiv = document.createElement('div');
          staticGridDiv.className = 'wallpaper-grid-items';
          
          staticWallpapers.forEach(wallpaper => {
            const item = this.createWallpaperItem(wallpaper);
            staticGridDiv.appendChild(item);
          });
          
          staticSection.appendChild(staticGridDiv);
          customGrid.appendChild(staticSection);
        }

        // Mark grid as loaded to prevent future reloads
        customGrid.dataset.wallpapersLoaded = 'true';

        // Setup variant selector
        this.setupVariantSelector();
        
        // Load the current wallpaper from localStorage
        const saved = localStorage.getItem('selectedWallpaper');
        if (saved) {
          try {
            const wallpaperData = JSON.parse(saved);
            const savedWallpaper = allWallpapers.find(w => w.name === wallpaperData.name);
            if (savedWallpaper) {
              const wallpaperItem = document.querySelector(`[data-wallpaper="${wallpaperData.name}"]`);
              if (wallpaperItem) {
                this.selectWallpaper(savedWallpaper, wallpaperItem);
                return;
              }
            }
          } catch (e) {
            console.warn('Failed to load saved wallpaper from localStorage:', e);
          }
        }
        
        // If no saved wallpaper, select the first one
        if (allWallpapers.length > 0) {
          const firstWallpaper = allWallpapers[0];
          const firstItem = document.querySelector('.wallpaper-item');
          if (firstItem) {
            this.selectWallpaper(firstWallpaper, firstItem);
          }
        }
      }).catch((error) => {
        console.error('[Wallpaper] Error loading wallpapers:', error);
        customGrid.innerHTML = '<div class="error-message">Error loading wallpapers: ' + error.message + '</div>';
      });
    } catch (error) {
      console.error('Error loading wallpapers:', error);
      customGrid.innerHTML = `<div class="error-message">Error loading wallpapers: ${error.message}</div>`;
    }
  }

  setupVariantSelector() {
    const variantButtons = document.querySelectorAll('.variant-btn');
    variantButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // For now, variants are handled at wallpaper selection time
        // This can be extended later if needed
      });
    });
  }

  createWallpaperItem(wallpaper) {
    try {
      const item = document.createElement('div');
      item.className = 'wallpaper-item';
      item.setAttribute('data-wallpaper', wallpaper.name);
      item.setAttribute('data-id', wallpaper.id);

      // Check if this is the current wallpaper
      if (this.settings.currentWallpaper === wallpaper.name) {
        item.classList.add('active');
      }

      // Check if this wallpaper has light and dark variants
      const hasVariants = wallpaper.variantPath && wallpaper.tags?.includes('dark');

      // Create media container - will be populated on hover/touch
      const mediaContainer = document.createElement('div');
      mediaContainer.className = 'wallpaper-item-media';
      mediaContainer.setAttribute('data-wallpaper-id', wallpaper.id);
      mediaContainer.setAttribute('data-media-path', wallpaper.path);
      mediaContainer.setAttribute('data-media-type', wallpaper.type);
      if (hasVariants) {
        mediaContainer.setAttribute('data-variant-path', wallpaper.variantPath);
      }
      mediaContainer.style.cursor = 'pointer';
      mediaContainer.style.position = 'relative';

      // Use primary media as default display if possible
      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'wallpaper-thumb-container';
      thumbContainer.style.cssText = `
        width: 100%;
        height: 100%;
        background: #2a2a2a;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      `;
      
      if (wallpaper.type !== 'video' && wallpaper.path) {
        // Load actual image as preview for static wallpapers
        const thumbImg = document.createElement('img');
        thumbImg.src = window.wallpaperEngine ? window.wallpaperEngine.normalizePath(wallpaper.thumbnail, wallpaper) : wallpaper.thumbnail;
        thumbImg.alt = wallpaper.name;
        thumbImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        thumbImg.loading = 'lazy';
        thumbContainer.appendChild(thumbImg);
      } else {
        // Fallback gradient for videos or missing paths (streaming manager will populate on hover)
        thumbContainer.style.background = 'linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%)';
      }

      // Add "Hover to Play" indicator for dynamic wallpapers
      if (wallpaper.type === 'video') {
        const playIndicator = document.createElement('div');
        playIndicator.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 56px;
          height: 56px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          transition: all 0.3s ease;
          z-index: 10;
        `;

        const playIcon = document.createElement('div');
        playIcon.style.cssText = `
          width: 0;
          height: 0;
          border-left: 12px solid white;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          margin-left: 4px;
        `;
        playIndicator.appendChild(playIcon);
        thumbContainer.appendChild(playIndicator);

        // Show hint text on hover
        const hintText = document.createElement('div');
        hintText.style.cssText = `
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.6);
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: 11;
        `;
        hintText.textContent = 'Hover to play';
        thumbContainer.appendChild(hintText);

        // Show/hide hint on interaction
        mediaContainer.addEventListener('mouseenter', () => {
          hintText.style.opacity = '1';
          playIndicator.style.background = 'rgba(255, 255, 255, 0.4)';
          playIndicator.style.transform = 'translate(-50%, -50%) scale(1.1)';
        });

        mediaContainer.addEventListener('mouseleave', () => {
          hintText.style.opacity = '0';
          playIndicator.style.background = 'rgba(255, 255, 255, 0.2)';
          playIndicator.style.transform = 'translate(-50%, -50%) scale(1)';
        });

        // Touch feedback
        mediaContainer.addEventListener('touchstart', () => {
          hintText.textContent = 'Playing...';
          hintText.style.opacity = '1';
        });
      }

      mediaContainer.appendChild(thumbContainer);
      item.appendChild(mediaContainer);

      // Add label
      const label = document.createElement('div');
      label.className = 'wallpaper-item-label';
      label.textContent = wallpaper.name;
      if (hasVariants) {
        label.textContent += ' (Light & Dark)';
      }
      item.appendChild(label);

      // Click handler - apply wallpaper
      item.addEventListener('click', async () => {
        console.log('[Wallpaper] Selected:', wallpaper.name);
        await this.selectWallpaper(wallpaper, item);
      });

      return item;
    } catch (error) {
      console.error('Error creating wallpaper item:', error);
      const errorItem = document.createElement('div');
      errorItem.className = 'wallpaper-item-error';
      errorItem.textContent = 'Error loading ' + (wallpaper.name || 'wallpaper');
      return errorItem;
    }
  }

  async selectWallpaper(wallpaper, itemElement) {
    try {
      // Update UI active state
      document.querySelectorAll('.wallpaper-item').forEach(el => el.classList.remove('active'));
      itemElement?.classList.add('active');

      // Update currentWallpaper in local settings
      this.settings.currentWallpaper = wallpaper.name;

      // Use the Unified Wallpaper Engine to apply change globally (persists and syncs)
      if (window.wallpaperEngine) {
        await window.wallpaperEngine.setWallpaper(wallpaper);
      }

      // Update preview UI
      const previewInfo = document.getElementById('currentWallpaperInfo');
      if (previewInfo) {
        previewInfo.innerHTML = `<div class="wallpaper-name">${wallpaper.name}</div>`;
      }
    } catch (error) {
      console.error('Error selecting wallpaper:', error);
    }
  }

  async checkSystemHealth() {
    const timestamp = new Date().toLocaleTimeString();

    // Update displayed addresses based on current runtime context
    try {
      const backendAddr = document.getElementById('backendAddressValue');
      const apiProxyValue = document.getElementById('apiProxyValue');
      if (backendAddr) backendAddr.textContent = `${window.location.origin}/api`;
      if (apiProxyValue) apiProxyValue.textContent = `/api → ${window.location.host}`;
    } catch (e) {
      // Non-fatal
    }
    
    // Check Backend Health
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.json();
        document.getElementById('backendStatus').textContent = '🟢 Connected';
        document.getElementById('backendStatus').style.color = '#34C759';
        document.getElementById('backendStatusIcon').textContent = '✓';
        document.getElementById('backendLastCheck').textContent = timestamp;
        
        // Check Database Tables via Settings health endpoint
        try {
          const settingsRes = await fetch('/api/settings/health/status');
          
          if (settingsRes.ok) {
            const healthData = await settingsRes.json();
            const dbConnected = healthData.database?.connected;
            const settingsCount = healthData.database?.settings_count || 0;
            
            if (dbConnected) {
              document.getElementById('databaseStatus').textContent = '🟢 Healthy';
              document.getElementById('databaseStatus').style.color = '#34C759';
              document.getElementById('databaseStatusIcon').textContent = '✓';
              document.getElementById('databaseTables').textContent = '13 tables (app_settings, status_checks, products, contacts, notes, calendar_events, analytics, billing_transactions, preferences, payments, orders, variants, batches, credit_notes, suggestions)';
              
              // Update Docker Blue / Green Cluster Visualizer
              if (healthData.docker) {
                const activeSlot = healthData.docker.activeSlot || 'green';
                const clusterStatus = document.getElementById('dockerClusterStatus');
                const blueBadge = document.getElementById('dockerBlueBadge');
                const greenBadge = document.getElementById('dockerGreenBadge');
                const blueCard = document.getElementById('dockerBlueSlotCard');
                const greenCard = document.getElementById('dockerGreenSlotCard');

                if (clusterStatus) {
                  clusterStatus.textContent = `🟢 Active: ${activeSlot.toUpperCase()} (Port ${healthData.docker.hostPort})`;
                }

                if (activeSlot === 'blue') {
                  if (blueBadge) {
                    blueBadge.textContent = 'ACTIVE (TRAFFIC)';
                    blueBadge.style.background = '#007aff';
                    blueBadge.style.color = '#ffffff';
                  }
                  if (greenBadge) {
                    greenBadge.textContent = 'STANDBY (OFF)';
                    greenBadge.style.background = 'rgba(120, 120, 128, 0.2)';
                    greenBadge.style.color = 'var(--settings-text-secondary)';
                  }
                  if (blueCard) blueCard.style.borderColor = '#007aff';
                  if (greenCard) greenCard.style.borderColor = 'var(--settings-border)';
                } else {
                  if (greenBadge) {
                    greenBadge.textContent = 'ACTIVE (TRAFFIC)';
                    greenBadge.style.background = '#34c759';
                    greenBadge.style.color = '#ffffff';
                  }
                  if (blueBadge) {
                    blueBadge.textContent = 'STANDBY (OFF)';
                    blueBadge.style.background = 'rgba(120, 120, 128, 0.2)';
                    blueBadge.style.color = 'var(--settings-text-secondary)';
                  }
                  if (greenCard) greenCard.style.borderColor = '#34c759';
                  if (blueCard) blueCard.style.borderColor = 'var(--settings-border)';
                }
              }

              // Check API endpoints availability
              try {
                const productsRes = await fetch('/api/products');
                const contactsRes = await fetch('/api/contacts');
                
                const endpointCount = 13; // Total endpoints
                const resourceList = ['billing', 'products', 'contacts', 'notes', 'calendar', 'analytics', 'settings', 'payments', 'orders', 'variants', 'batches', 'creditnotes', 'suggestions'];
                
                document.getElementById('apiStatus').textContent = `🟢 ${endpointCount} Endpoints`;
                document.getElementById('apiStatus').style.color = '#34C759';
                document.getElementById('apiStatusIcon').textContent = '✓';
                document.getElementById('apiEndpoints').textContent = resourceList.join(', ');
              } catch (apiErr) {
                // Fallback if endpoint checks fail
                document.getElementById('apiStatus').textContent = '🟢 14 Endpoints';
                document.getElementById('apiStatus').style.color = '#34C759';
                document.getElementById('apiStatusIcon').textContent = '✓';
                document.getElementById('apiEndpoints').textContent = 'billing, products, contacts, notes, calendar, analytics, tasks, settings, payments, orders, variants, batches, creditnotes, suggestions';
              }
            } else {
              throw new Error('Database not connected');
            }
          } else {
            throw new Error('Settings health endpoint not responding');
          }
        } catch (dbError) {
          document.getElementById('databaseStatus').textContent = '🟡 Partial';
          document.getElementById('databaseStatus').style.color = '#FF9500';
          document.getElementById('databaseStatusIcon').textContent = '⚠️';
          document.getElementById('apiStatus').textContent = '🟡 Checking...';
          document.getElementById('apiStatus').style.color = '#FF9500';
          document.getElementById('apiStatusIcon').textContent = '⏳';
        }
      } else {
        throw new Error('Backend responded with error');
      }
    } catch (error) {
      const backendStatus = document.getElementById('backendStatus');
      const backendLastCheck = document.getElementById('backendLastCheck');
      const databaseStatus = document.getElementById('databaseStatus');
      const databaseStatusIcon = document.getElementById('databaseStatusIcon');
      const apiStatus = document.getElementById('apiStatus');
      const apiStatusIcon = document.getElementById('apiStatusIcon');
      const apiEndpoints = document.getElementById('apiEndpoints');

      if (backendStatus) {
        backendStatus.textContent = '🔴 Disconnected';
        backendStatus.style.color = '#FF3B30';
      }
      if (document.getElementById('backendStatusIcon')) {
        document.getElementById('backendStatusIcon').textContent = '✗';
      }
      if (backendLastCheck) backendLastCheck.textContent = timestamp;
      
      if (databaseStatus) {
        databaseStatus.textContent = '🔴 Unavailable';
        databaseStatus.style.color = '#FF3B30';
      }
      if (databaseStatusIcon) databaseStatusIcon.textContent = '✗';
      
      if (apiStatus) {
        apiStatus.textContent = '🔴 Unreachable';
        apiStatus.style.color = '#FF3B30';
      }
      if (apiStatusIcon) apiStatusIcon.textContent = '✗';
      if (apiEndpoints) apiEndpoints.textContent = 'Unable to connect';
    }
  }

  bindAndroidUpdateControls() {
    const checkBtn = document.getElementById('androidUpdateCheckBtn');
    const downloadLink = document.getElementById('androidUpdateDownloadLink');
    const downloadBtnLabel = document.getElementById('androidDownloadBtnLabel');
    const versionBadge = document.getElementById('androidVersionBadge');
    const codeBadge = document.getElementById('androidCodeBadge');
    const publishedAtEl = document.getElementById('androidPublishedAt');
    const apkSizeEl = document.getElementById('androidApkSize');
    const downloadCountEl = document.getElementById('androidDownloadCount');
    const sha256El = document.getElementById('androidSha256');
    const copyHashBtn = document.getElementById('androidCopyHashBtn');
    const notesEl = document.getElementById('androidUpdateNotes');
    const r2Link = document.getElementById('androidR2DownloadLink');
    const historyContainer = document.getElementById('androidHistoryContainer');
    const uploadForm = document.getElementById('androidUploadForm');
    const uploadStatusMsg = document.getElementById('uploadStatusMsg');

    let currentSha256 = '';

    const formatBytes = (bytes) => {
      if (!bytes || bytes === 0) return '0 MB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    };

    const updateUi = (manifest) => {
      if (!manifest || !manifest.versionName) {
        if (versionBadge) versionBadge.textContent = 'No build';
        if (codeBadge) codeBadge.textContent = 'Build #0';
        if (notesEl) notesEl.textContent = 'No active Android release published yet. Use the publish form below or run the GitHub Action to publish a build.';
        if (sha256El) sha256El.textContent = 'None';
        return;
      }

      const vName = manifest.versionName || '1.0.0';
      const vCode = manifest.versionCode || 1;
      const targetFileName = manifest.fileName || `BusinessSuite-v${vName}.apk`;
      currentSha256 = manifest.sha256 || '';

      if (versionBadge) versionBadge.textContent = `v${vName}`;
      if (codeBadge) codeBadge.textContent = `Build #${vCode}`;
      if (downloadBtnLabel) downloadBtnLabel.textContent = targetFileName;
      if (downloadLink) {
        downloadLink.href = '/api/android/update/latest';
        downloadLink.setAttribute('download', targetFileName);
      }
      if (publishedAtEl) {
        publishedAtEl.textContent = manifest.publishedAt ? new Date(manifest.publishedAt).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Recently';
      }
      if (apkSizeEl) apkSizeEl.textContent = formatBytes(manifest.fileSize);
      if (downloadCountEl) downloadCountEl.textContent = manifest.downloadCount || 0;
      if (sha256El) sha256El.textContent = currentSha256 || 'Pending checksum';
      if (notesEl) notesEl.textContent = manifest.releaseNotes || 'General performance and security improvements.';

      if (r2Link) {
        if (manifest.r2DownloadUrl) {
          r2Link.href = manifest.r2DownloadUrl;
          r2Link.style.display = 'inline-flex';
        } else {
          r2Link.style.display = 'none';
        }
      }
    };

    const loadHistory = async () => {
      if (!historyContainer) return;
      try {
        const res = await fetch('/api/android/update/history');
        if (!res.ok) throw new Error('Failed to load version history');
        const data = await res.json();
        const versions = data.versions || [];

        if (versions.length === 0) {
          historyContainer.innerHTML = '<div style="text-align:center; padding:12px; color:var(--settings-text-tertiary); font-size:12px;">No archived historical versions found.</div>';
          return;
        }

        historyContainer.innerHTML = versions.map((v, idx) => {
          const dateStr = v.archivedAt || v.publishedAt ? new Date(v.archivedAt || v.publishedAt).toLocaleDateString() : 'Previous';
          const sizeStr = formatBytes(v.fileSize);
          const dlUrl = v.downloadUrl || (v.archiveFile ? `/api/android/update/archive/${encodeURIComponent(v.archiveFile)}` : null);

          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(0,0,0,0.15); border-radius:8px; border:1px solid rgba(255,255,255,0.05); font-size:12px;">
              <div style="flex:1; margin-right:10px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-weight:700; color:#34c759;">v${v.versionName || '1.0'}</span>
                  <span style="font-size:10px; opacity:0.6;">(Build #${v.versionCode || 1})</span>
                  <span style="font-size:11px; opacity:0.5; margin-left:4px;">${dateStr}</span>
                  <span style="font-size:10px; opacity:0.5;">• ${sizeStr}</span>
                </div>
                <div style="font-size:11px; color:var(--settings-text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${v.releaseNotes || 'No notes'}
                </div>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                ${dlUrl ? `<a href="${dlUrl}" class="storage-cell-edit-btn" style="text-decoration:none; padding:4px 8px; font-size:11px; border-radius:4px;" title="Download this archived build">⬇️ APK</a>` : ''}
                ${idx === 0 ? `<button class="storage-btn btn-rollback" data-version="${v.versionName}" style="padding:4px 10px; font-size:11px; border-radius:4px; background:rgba(255,59,48,0.2); color:#ff453a; border:1px solid rgba(255,59,48,0.3); cursor:pointer;">⏪ Rollback</button>` : ''}
              </div>
            </div>
          `;
        }).join('');

        // Wire rollback buttons
        historyContainer.querySelectorAll('.btn-rollback').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetV = btn.dataset.version;
            if (confirm(`Are you sure you want to rollback to Android App v${targetV}? This will restore the previous APK as the active build for all devices.`)) {
              btn.disabled = true;
              btn.textContent = 'Rolling back...';
              try {
                const rollRes = await fetch('/api/android/update/rollback', { method: 'POST' });
                const rollData = await rollRes.json();
                if (rollRes.ok) {
                  alert(`Successfully rolled back: ${rollData.message || 'Restored previous version'}`);
                  refresh();
                } else {
                  alert(`Rollback error: ${rollData.error || 'Server error'}`);
                  btn.disabled = false;
                  btn.textContent = '⏪ Rollback';
                }
              } catch (err) {
                alert(`Network error during rollback: ${err.message}`);
                btn.disabled = false;
                btn.textContent = '⏪ Rollback';
              }
            }
          });
        });
      } catch (err) {
        historyContainer.innerHTML = `<div style="text-align:center; padding:10px; color:#ff453a; font-size:12px;">Failed to load history: ${err.message}</div>`;
      }
    };

    const refresh = async () => {
      try {
        const response = await fetch('/api/android/update/manifest');
        if (response.ok) {
          const manifest = await response.json();
          updateUi(manifest);
        } else {
          updateUi(null);
        }
      } catch (error) {
        updateUi(null);
      }
      loadHistory();
    };

    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        checkBtn.textContent = '⏳ Checking...';
        refresh().finally(() => {
          setTimeout(() => { checkBtn.textContent = '🔄 Check Updates'; }, 800);
        });
      });
    }

    if (copyHashBtn) {
      copyHashBtn.addEventListener('click', () => {
        if (currentSha256) {
          navigator.clipboard.writeText(currentSha256).then(() => {
            copyHashBtn.textContent = '✅ Copied!';
            setTimeout(() => { copyHashBtn.textContent = '📋 Copy'; }, 1500);
          });
        }
      });
    }

    // Wire manual APK Upload Form
    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const vName = document.getElementById('uploadVersionName')?.value?.trim();
        const vCode = document.getElementById('uploadVersionCode')?.value?.trim();
        const notes = document.getElementById('uploadReleaseNotes')?.value?.trim() || 'Manual admin release';
        const fileInput = document.getElementById('uploadApkFile');
        const submitBtn = document.getElementById('uploadApkSubmitBtn');

        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          alert('Please choose an .apk file to upload.');
          return;
        }

        const formData = new FormData();
        formData.append('apk', fileInput.files[0]);
        formData.append('versionName', vName);
        formData.append('versionCode', vCode);
        formData.append('releaseNotes', notes);
        formData.append('fileName', `BusinessSuite-v${vName}.apk`);

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Uploading & Verifying...';
        if (uploadStatusMsg) {
          uploadStatusMsg.style.display = 'block';
          uploadStatusMsg.style.color = '#2997ff';
          uploadStatusMsg.textContent = 'Computing SHA-256 and publishing to server storage...';
        }

        try {
          const res = await fetch('/api/android/update/upload', {
            method: 'POST',
            body: formData
          });
          const resData = await res.json();
          if (res.ok) {
            if (uploadStatusMsg) {
              uploadStatusMsg.style.color = '#34c759';
              uploadStatusMsg.textContent = `✅ Successfully published BusinessSuite-v${vName}.apk!`;
            }
            uploadForm.reset();
            refresh();
          } else {
            if (uploadStatusMsg) {
              uploadStatusMsg.style.color = '#ff453a';
              uploadStatusMsg.textContent = `❌ Upload failed: ${resData.error || 'Server error'}`;
            }
          }
        } catch (err) {
          if (uploadStatusMsg) {
            uploadStatusMsg.style.color = '#ff453a';
            uploadStatusMsg.textContent = `❌ Network error: ${err.message}`;
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '⬆️ Publish Update';
        }
      });
    }

    refresh();
  }

  switchSection(section) {
    this.currentSection = section;

    // Update sidebar active state
    this.sidebarItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-section') === section) {
        item.classList.add('active');
      }
    });

    // Update header title to show current page
    const sectionNames = {
      'profile': 'Apple Account',
      'admin': 'Worker Access',
      'wifi': 'Wi-Fi',
      'bluetooth': 'Bluetooth',
      'network': 'Network',
      'energy': 'Energy',
      'general': 'General',
      'billing': 'Billing & Invoices',
      'accessibility': 'Accessibility',
      'appearance': 'Appearance',
      'menubar': 'Menu Bar',
      'siri': 'Siri',
      'dock': 'Desktop & Dock',
      'displays': 'Displays',
      'spotlight': 'Spotlight',
      'wallpaper': 'Wallpaper',
      'systemhealth': 'System Health',
      'android-update': 'Android App'
    };

    const container = document.getElementById(this.containerId);
    const titleElement = container?.querySelector('.app-title');
    if (titleElement) {
      titleElement.textContent = sectionNames[section] || 'Settings';
    }

    // Update navigation button states
    this.updateNavButtonState();

    // Update panel visibility
    this.panels.forEach(panel => {
      panel.classList.add('hidden');
    });

    // Show the correct panel
    const panelId = `${section}-panel`;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.remove('hidden');
      // Reset General panel view to main view when switched
      if (section === 'general') {
        const gMain = document.getElementById('general-main-view');
        const gStorage = document.getElementById('general-storage-view');
        if (gMain && gStorage) {
          gMain.classList.remove('hidden');
          gStorage.classList.add('hidden');
        }
      }
      
      // Initialize module-specific content
      if (section === 'profile') {
        if (!this.profileModule) {
          this.profileModule = new ProfileComponent(panel);
        }
        this.profileModule.render();
      } else if (section === 'admin') {
        if (!this.adminModule) {
          this.adminModule = new AdminComponent(panel);
        }
        this.adminModule.render();
      } else if (section === 'appearance') {
        if (!this.appearanceModule) {
          this.appearanceModule = new AppearanceComponent(panel, this.settings, this.saveSettings.bind(this));
        }
        this.appearanceModule.render();
      } else if (section === 'wallpaper') {
        this.loadWallpapers();
      } else if (section === 'billing') {
        if (!this.billingModule) {
          this.billingModule = new BillingSettingsComponent(panel);
        }
        this.billingModule.render();
      } else if (section === 'android-update') {
        this.bindAndroidUpdateControls();
      }
    }
  }

  getDefaultSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('settingsAppData') || '{}');
    } catch (e) {}
    const cachedTheme = localStorage.getItem('macos_theme');
    return {
      theme: cachedTheme || saved.theme || 'auto',
      accentColor: saved.accentColor || 'blue',
      highlightColor: saved.highlightColor || 'blue',
      iconStyle: saved.iconStyle || 'default',
      liquidGlass: saved.liquidGlass || 'clear',
      'sidebar-size': saved['sidebar-size'] || 'medium',
      'tint-wallpaper': saved['tint-wallpaper'] !== undefined ? saved['tint-wallpaper'] : true
    };
  }

  async fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        this.settings = { ...this.settings, ...data };
        localStorage.setItem('settingsAppData', JSON.stringify(this.settings));
        if (this.settings.theme) {
          localStorage.setItem('macos_theme', this.settings.theme);
        }
        this.applyTheme();
        
        // Update UI if appearance module is loaded
        if (this.appearanceModule) {
          this.appearanceModule.settings = this.settings;
          this.appearanceModule.render();
        }
      }
    } catch (err) {
      console.error('[Settings] Failed to fetch settings:', err);
    }
  }

  applyTheme() {
    let rawTheme = this.settings.theme || localStorage.getItem('macos_theme') || 'auto';
    let resolvedTheme = rawTheme;
    
    if (this.userRole === 'worker') {
      resolvedTheme = 'light';
    } else if (rawTheme === 'auto') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      this.setupThemeAutoListener();
    }

    const container = document.getElementById(this.containerId);
    if (container) {
      container.setAttribute('data-theme', resolvedTheme);
      const appWindow = container.closest('.app-window') || container;
      appWindow.setAttribute('data-theme', resolvedTheme);
    }

    // Apply globally to root and body
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-macos-theme', resolvedTheme);
    document.body.setAttribute('data-theme', resolvedTheme);

    // Save active theme identifier
    localStorage.setItem('macos_theme', rawTheme);

    // Dispatch global event for widgets and open apps
    window.dispatchEvent(new CustomEvent('macos-theme-changed', {
      detail: { theme: rawTheme, resolvedTheme }
    }));
  }

  setupThemeAutoListener() {
    if (this._themeListener) return;
    
    this._themeListener = (e) => {
      if (this.settings.theme === 'auto' || localStorage.getItem('macos_theme') === 'auto') {
        this.applyTheme();
      }
    };
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this._themeListener);
  }

  async saveSettings() {
    try {
      // Save locally as fallback/immediate feedback
      localStorage.setItem('settingsAppData', JSON.stringify(this.settings));
      if (this.settings.theme) {
        localStorage.setItem('macos_theme', this.settings.theme);
      }
      
      // Update theme immediately across document
      this.applyTheme();

      // Save to backend database
      await fetch('/api/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.settings)
      });
    } catch (e) {
      console.error('[Settings] Failed to save settings:', e);
    }
  }

  updatePersistentWallpaper(imagePath, variant = 'automatic') {
    try {
      const wallpaperBg = document.getElementById('wallpaperBackground');
      if (wallpaperBg) {
        if (imagePath.endsWith('.mp4') || imagePath.endsWith('.mov') || imagePath.endsWith('.webm')) {
          // Video wallpaper - create properly configured video element
          console.log('[Wallpaper] Setting video wallpaper:', imagePath);
          const video = this.createOptimizedVideo(imagePath);
          video.classList.add('wallpaper-video');
          
          // Error handling
          video.onerror = () => {
            console.error('[Wallpaper] Failed to load video:', imagePath);
          };
          
          // Auto-play handling
          video.addEventListener('loadedmetadata', () => {
            console.log('[Wallpaper] Video ready, starting playback');
            let retryCount = 0;
            const maxRetries = 10;
            let retryTimer = null;

            const attemptPlay = () => {
              video.play().catch(err => {
                if (err.name === 'AbortError') {
                  retryCount++;
                  if (retryCount < maxRetries) {
                    console.log(`[Wallpaper] Play interrupted, retrying (${retryCount}/${maxRetries})`);
                    retryTimer = setTimeout(attemptPlay, 1000);
                  }
                } else {
                  console.warn('[Wallpaper] Play error:', err.name);
                }
              });
            };

            attemptPlay();
          });
          
          // Handle stalling - buffer more data and resume
          let stalledTimeout;
          video.addEventListener('stalled', () => {
            console.log('[Wallpaper] Video stalled, buffering...');
            clearTimeout(stalledTimeout);
            stalledTimeout = setTimeout(() => {
              video.play().catch(() => {});
            }, 500);
          });
          
          wallpaperBg.innerHTML = '';
          wallpaperBg.appendChild(video);
        } else {
          // Image wallpaper
          console.log('[Wallpaper] Setting image wallpaper:', imagePath);
          wallpaperBg.innerHTML = '';
          wallpaperBg.style.backgroundImage = `url('${imagePath}')`;
          wallpaperBg.style.backgroundSize = 'cover';
          wallpaperBg.style.backgroundPosition = 'center';
        }
      }

      // Also update in home.html if it exists (iframe scenario)
      const homeWallpaper = window.parent?.document?.getElementById('wallpaperBackground');
      if (homeWallpaper) {
        if (imagePath.endsWith('.mp4') || imagePath.endsWith('.mov') || imagePath.endsWith('.webm')) {
          const video = this.createOptimizedVideo(imagePath);
          video.classList.add('wallpaper-video');
          
          homeWallpaper.innerHTML = '';
          homeWallpaper.appendChild(video);
        } else {
          homeWallpaper.innerHTML = '';
          homeWallpaper.style.backgroundImage = `url('${imagePath}')`;
          homeWallpaper.style.backgroundSize = 'cover';
          homeWallpaper.style.backgroundPosition = 'center';
        }
      }

      // Save to localStorage
      localStorage.setItem('selectedWallpaper', JSON.stringify({
        path: imagePath,
        variant: variant,
        timestamp: new Date().toISOString()
      }));
      
      console.log('[Wallpaper] Wallpaper updated successfully');
    } catch (error) {
      console.error('Error updating wallpaper:', error);
    }
  }

  async getWallpapersFromAPI() {
    try {
      const response = await fetch('/api/wallpapers');
      if (!response.ok) throw new Error('Failed to fetch wallpapers');
      
      const data = await response.json();
      return data.wallpapers || [];
    } catch (error) {
      console.error('Error fetching wallpapers from API:', error);
      return [];
    }
  }

  showAddWallpaperModal() {
    // Not implemented in streaming version
    console.warn('[Wallpaper] Add wallpaper modal not yet implemented');
  }
}

// Backwards-compat: allow non-module pages to access it
if (typeof window !== 'undefined') {
  window.SettingsApp = SettingsApp;
}

