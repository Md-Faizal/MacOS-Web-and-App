/**
 * WallpaperComponent - Pixel-Perfect Apple macOS Sonoma / Sequoia Wallpaper Settings
 * 
 * Accurately replicates the native macOS Settings Wallpaper interface:
 * - Navigation Header: "<" ">" Pill & "Wallpaper" title
 * - Top Active Wallpaper Hero Box:
 *   - Left: Rounded widescreen live preview
 *   - Title & "Show on all Spaces"
 *   - Right: Native macOS Appearance Popup Menu (Automatic, [Name] Sunset/Light, [Name] Night/Dark)
 *   - Action Pills: "Screen Saver..." and "Add Photo..."
 * - Categorized Horizontal Carousels with "Show All (N)" toggles:
 *   - Landscape (Golden Gate, Tahoe, Sequoia Sunrise, Sonoma Horizon)
 *   - Cityscape (Dubai Skyline, Los Angeles Overpass, London Evening, New York Night)
 *   - Underwater (Alaskan Jellies Light, California Dolphin Pod, California Kelp Forest, Tahiti Coast)
 *   - Earth (Middle East, North Africa, Caribbean, Antarctica's Southern Lights)
 *   - Shuffle Aerials (Shuffle All, Shuffle Landscape, Shuffle Cityscape, Shuffle Underwater)
 *   - Your Photos / Custom Wallpapers (with "+ Add Photo..." card, dual-file Light/Dark badges, and Public/Private sharing toggle)
 * - Authentic macOS cards: 16:10 rounded thumbnails, blue selection outline, bottom-left play icon "▶", bottom-right cloud download icon "↓"
 * - Dual-layer hardware-accelerated 60fps crossfading
 */

export class WallpaperComponent {
  constructor(container, settings = {}, saveSettingsCallback = () => {}) {
    this.container = container;
    this.settings = settings;
    this.saveSettings = saveSettingsCallback;

    this.installedWallpapers = [];
    this.marketplaceWallpapers = [];
    this.currentWallpaper = null;
    this.currentVariant = localStorage.getItem('macos_wallpaper_variant') || 'auto';
    this.isDropdownOpen = false;
    this.expandedSections = new Set();
    this.installingIds = new Set();
  }

  async render() {
    this.container.innerHTML = `
      <div class="wp-apple-settings-view">
        ${this._renderStyles()}

        <!-- macOS Settings Header -->
        <div class="wp-macos-header">
          <h1 class="wp-header-title">Wallpaper</h1>
        </div>

        <!-- Top Active Wallpaper Hero Box -->
        <div class="wp-hero-container" id="wpHeroBox">
          <div class="wp-hero-left">
            <div class="wp-hero-thumb-wrap" id="wpHeroThumbWrap">
              <div class="wp-hero-media" id="wpHeroMedia"></div>
            </div>
          </div>

          <div class="wp-hero-right">
            <div class="wp-hero-meta-row">
              <div class="wp-hero-meta-col">
                <h2 class="wp-hero-name" id="wpHeroName">Golden Gate</h2>
                <span class="wp-hero-spaces" id="wpHeroSpaces">Show on all Spaces</span>
              </div>

              <!-- Native macOS Appearance Pop-up Button -->
              <div class="wp-popup-anchor">
                <button class="wp-popup-btn" id="wpAppearanceDropdownBtn">
                  <span id="wpDropdownSelectedLabel">Automatic</span>
                  <span class="wp-popup-chevrons">⇅</span>
                </button>
                <div class="wp-popup-menu hidden" id="wpAppearanceMenu">
                  <!-- Populated dynamically based on active wallpaper -->
                </div>
              </div>
            </div>

            <!-- Action Buttons Row -->
            <div class="wp-hero-actions-row">
              <button class="wp-pill-btn" id="wpScreenSaverBtn">Screen Saver...</button>
              <button class="wp-pill-btn" id="wpAddPhotoBtn">Add Photo...</button>
            </div>

            <!-- Dynamic Controls (Playback Speed) -->
            <div class="wp-hero-controls-row" id="wpHeroControls" style="display: none; margin-top: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 11px; font-weight: 500; color: var(--settings-text-secondary);">Playback Speed</span>
                <input type="range" class="wallpaper-slider" id="wpSpeedSlider" min="0.25" max="3.0" step="0.25" value="1.0" style="flex: 1; accent-color: var(--settings-primary);">
                <span id="wpSpeedValue" style="font-size: 11px; font-weight: 600; color: var(--settings-text); width: 30px;">1.0x</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Dynamic Category Sections -->
        <div class="wp-categories-container" id="wpCategoriesList">
          <div class="wp-loading-spinner"></div>
        </div>

        <!-- Add Photo Sheet Modal Container -->
        <div id="wpModalPortal"></div>
      </div>
    `;

    this._setupEventListeners();
    await this.loadAllWallpapers();
    await this._syncCurrentWallpaper();
  }

  async loadAllWallpapers() {
    try {
      const [instRes, mktRes] = await Promise.all([
        fetch('/api/wallpapers?force=true').then(r => r.json()),
        fetch('/api/wallpapers/marketplace').then(r => r.json())
      ]);

      if (instRes.success) this.installedWallpapers = instRes.wallpapers || [];
      if (mktRes.success) this.marketplaceWallpapers = mktRes.wallpapers || [];

      this._renderAllCategories();
    } catch (err) {
      console.error('[WallpaperComponent] Failed to load wallpapers:', err);
    }
  }

  async _syncCurrentWallpaper() {
    if (window.wallpaperEngine) {
      this.currentWallpaper = window.wallpaperEngine.getSelected();
    }

    // Default to Golden Gate or first installed if nothing saved
    if (!this.currentWallpaper && this.installedWallpapers.length) {
      this.currentWallpaper = this.installedWallpapers.find(w => w.id === 'golden-gate') || this.installedWallpapers[0];
    }

    this._updateHeroBox();
  }

  _updateHeroBox() {
    if (!this.currentWallpaper) return;

    const nameEl = this.container.querySelector('#wpHeroName');
    const mediaEl = this.container.querySelector('#wpHeroMedia');
    const labelEl = this.container.querySelector('#wpDropdownSelectedLabel');
    const menuEl = this.container.querySelector('#wpAppearanceMenu');

    if (nameEl) nameEl.textContent = this.currentWallpaper.name;

    const isVideo = this.currentWallpaper.type === 'video' ||
                    (this.currentWallpaper.path && this.currentWallpaper.path.match(/\.(mp4|webm|mov)$/i));

    const activeSrc = this._resolveCurrentSrc(this.currentWallpaper, this.currentVariant);

    if (mediaEl) {
      if (isVideo) {
        mediaEl.innerHTML = `<video src="${activeSrc}" autoplay muted loop playsinline class="wp-hero-img"></video>`;
        setTimeout(() => {
          const v = mediaEl.querySelector('video');
          const slider = this.container.querySelector('#wpSpeedSlider');
          if (v && slider) v.playbackRate = parseFloat(slider.value);
        }, 50);
      } else {
        mediaEl.innerHTML = `<div class="wp-hero-img" style="background-image: url('${activeSrc}');"></div>`;
      }
    }

    const controlsRow = this.container.querySelector('#wpHeroControls');
    if (controlsRow) {
      controlsRow.style.display = isVideo ? 'block' : 'none';
    }

    // Determine variant label
    let variantDisplay = 'Automatic';
    if (this.currentVariant === 'light') {
      variantDisplay = this.currentWallpaper.lightName || `${this.currentWallpaper.name} Sunset`;
    } else if (this.currentVariant === 'dark') {
      variantDisplay = this.currentWallpaper.darkName || `${this.currentWallpaper.name} Night`;
    }
    if (labelEl) labelEl.textContent = variantDisplay;

    // Populate the macOS Appearance popup menu
    if (menuEl) {
      const lightTitle = this.currentWallpaper.lightName || `${this.currentWallpaper.name} Sunset`;
      const darkTitle = this.currentWallpaper.darkName || `${this.currentWallpaper.name} Night`;
      const hasDark = Boolean(this.currentWallpaper.hasDarkVariant || this.currentWallpaper.variantPath);

      menuEl.innerHTML = `
        <div class="wp-menu-item ${this.currentVariant === 'auto' ? 'active' : ''}" data-variant="auto">
          <span class="wp-menu-check">${this.currentVariant === 'auto' ? '✓' : ''}</span>
          <span class="wp-menu-label">Automatic</span>
        </div>
        <div class="wp-menu-item ${this.currentVariant === 'light' ? 'active' : ''}" data-variant="light">
          <span class="wp-menu-check">${this.currentVariant === 'light' ? '✓' : ''}</span>
          <span class="wp-menu-label">${lightTitle}</span>
        </div>
        ${hasDark ? `
          <div class="wp-menu-item ${this.currentVariant === 'dark' ? 'active' : ''}" data-variant="dark">
            <span class="wp-menu-check">${this.currentVariant === 'dark' ? '✓' : ''}</span>
            <span class="wp-menu-label">${darkTitle}</span>
          </div>
        ` : ''}
        ${isVideo ? `
          <div class="wp-menu-divider"></div>
          <div class="wp-menu-item" data-action="toggle-loop">
            <span class="wp-menu-check">✓</span>
            <span class="wp-menu-label">Loop Video</span>
          </div>
        ` : ''}
      `;
    }
  }

  _resolveCurrentSrc(wp, variant) {
    if (!wp) return '';
    let target = variant;
    if (target === 'auto') {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                     window.matchMedia('(prefers-color-scheme: dark)').matches;
      target = isDark ? 'dark' : 'light';
    }
    if (target === 'dark' && wp.variantPath) {
      return wp.variantPath;
    }
    return wp.path || wp.thumbnail;
  }

  _renderAllCategories() {
    const listContainer = this.container.querySelector('#wpCategoriesList');
    if (!listContainer) return;

    // Combine installed and marketplace/community wallpapers
    const allItems = [...this.installedWallpapers];
    (this.marketplaceWallpapers || []).forEach(m => {
      if (!allItems.some(i => i.id === m.id)) {
        allItems.push(m);
      }
    });

    // Native macOS Category Definitions (Dynamic & Comprehensive)
    const categoryDefs = [
      {
        id: 'dynamic-desktop',
        title: 'Dynamic Desktop',
        filter: w => w.type === 'video' || (w.path && w.path.match(/\.(mp4|webm|mov)$/i))
      },
      {
        id: 'light-dark-desktop',
        title: 'Light & Dark Desktop',
        filter: w => (w.hasDarkVariant || w.variantPath) && w.type !== 'video' && !(w.path && w.path.match(/\.(mp4|webm|mov)$/i))
      },
      {
        id: 'landscape',
        title: 'Landscape & Nature',
        filter: w => ['landscape', 'nature', 'earth'].includes((w.category || '').toLowerCase()) && w.type !== 'video' && !w.isCustom
      },
      {
        id: 'cityscape',
        title: 'Cityscape & Urban',
        filter: w => ['cityscape', 'urban'].includes((w.category || '').toLowerCase()) && w.type !== 'video' && !w.isCustom
      },
      {
        id: 'abstract',
        title: 'Abstract & Graphic',
        filter: w => ['abstract', 'official', 'minimalist'].includes((w.category || '').toLowerCase()) && w.type !== 'video' && !w.isCustom
      },
      {
        id: 'community',
        title: 'Community Wallpapers',
        filter: w => (w.isCommunityUpload || w.isShared || (w.category || '').toLowerCase() === 'community') && !w.isCustom
      },
      {
        id: 'your-photos',
        title: 'Your Photos',
        filter: w => w.source === 'custom' || w.isCustom,
        isCustomSection: true
      }
    ];

    // Filter out categories that have no items (except Your Photos which always shows Add Photo card)
    const activeCategories = categoryDefs.filter(cat => {
      if (cat.isCustomSection) return true;
      return allItems.some(cat.filter);
    });

    listContainer.innerHTML = activeCategories.map(cat => {
      const items = cat.isCustomSection 
        ? this.installedWallpapers.filter(cat.filter)
        : allItems.filter(cat.filter);

      const isExpanded = this.expandedSections.has(cat.id);
      const maxRowItems = 4;
      const actualCount = cat.isCustomSection ? items.length + 1 : items.length;
      const canExpand = actualCount > maxRowItems;
      const totalCount = items.length;

      let displayItems = items;
      if (!isExpanded && canExpand) {
        displayItems = cat.isCustomSection ? items.slice(0, maxRowItems - 1) : items.slice(0, maxRowItems);
      }

      return `
        <div class="wp-category-block" data-category="${cat.id}">
          <div class="wp-category-header">
            <div class="wp-category-title-wrap">
              <h3 class="wp-category-title">${cat.title}</h3>
              <span class="wp-category-badge">${totalCount}</span>
            </div>
            ${canExpand ? `
              <button class="wp-show-all-btn" data-toggle-cat="${cat.id}">
                ${isExpanded ? 'Show Less' : `Show All (${totalCount})`}
              </button>
            ` : ''}
          </div>

          <div class="wp-cards-track ${isExpanded ? 'expanded' : ''}" id="track-${cat.id}">
            ${cat.isCustomSection ? `
              <!-- Add Photo Card (First item in Your Photos) -->
              <div class="wp-card wp-add-photo-card" id="wpAddCardInGrid">
                <div class="wp-card-thumb-wrap wp-add-thumb">
                  <span class="wp-add-plus">＋</span>
                </div>
                <div class="wp-card-name">Add Photo...</div>
              </div>
            ` : ''}

            ${displayItems.map(w => this._renderAppleCard(w, cat.id)).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Re-bind Add Photo card inside grid
    const addCardInGrid = listContainer.querySelector('#wpAddCardInGrid');
    if (addCardInGrid) addCardInGrid.onclick = () => this.openAddPhotoModal();
  }

  _renderAppleCard(w, catId) {
    const isSelected = this.currentWallpaper && this.currentWallpaper.id === w.id;
    const isVideo = w.type === 'video' || (w.path && w.path.match(/\.(mp4|webm|mov)$/i));
    const isLocal = this.installedWallpapers.some(i => i.id === w.id);
    const isShared = Boolean(w.isShared);
    const hasDual = Boolean(w.hasDarkVariant || w.variantPath);

    return `
      <div class="wp-card ${isSelected ? 'selected' : ''}" data-id="${w.id}" data-category="${catId}">
        <div class="wp-card-thumb-wrap">
          <img src="${w.thumbnail || w.path}" alt="${w.name}" class="wp-card-img" loading="lazy" />

          <!-- Bottom Left Icon (Video) -->
          ${isVideo ? `
            <div class="wp-card-icon-pill left" title="Dynamic Video">
              <span class="wp-icon-play">▶</span>
            </div>
          ` : ''}

          <!-- Bottom Right Icon (Cloud Download / Dual / Shared) -->
          ${!isLocal ? `
            <div class="wp-card-icon-pill right" title="Click to Install Wallpaper">
              <span class="wp-icon-dl">↓</span>
            </div>
          ` : hasDual ? `
            <div class="wp-card-icon-pill right" title="Day & Night Modes Available">
              <span class="wp-icon-dual">◐</span>
            </div>
          ` : ''}

          <!-- Custom Card Hover Overlay -->
          ${w.isCustom ? `
            <div class="wp-card-overlay">
              <button class="wp-overlay-share-btn ${isShared ? 'shared' : 'private'}" data-action="toggle-share" data-id="${w.id}" title="${isShared ? 'Shared publicly in Community. Click to make Private.' : 'Private to you. Click to Share publicly in Community.'}">
                ${isShared ? '🌐 Shared' : '🔒 Private'}
              </button>
              <button class="wp-overlay-edit-btn" data-action="manage" data-id="${w.id}" title="Wallpaper Details & Management">✏️</button>
              <button class="wp-overlay-del-btn" data-action="delete" data-id="${w.id}" title="Delete Wallpaper">🗑</button>
            </div>
          ` : ''}
        </div>
        <div class="wp-card-name" title="${w.name}">${w.name}</div>
      </div>
    `;
  }

  _setupEventListeners() {
    // 1. Appearance Pop-up Dropdown Toggle
    const dropdownBtn = this.container.querySelector('#wpAppearanceDropdownBtn');
    const menuEl = this.container.querySelector('#wpAppearanceMenu');

    if (dropdownBtn && menuEl) {
      dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isDropdownOpen = !this.isDropdownOpen;
        menuEl.classList.toggle('hidden', !this.isDropdownOpen);
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target) || !dropdownBtn.contains(e.target)) {
          this.isDropdownOpen = false;
          menuEl.classList.add('hidden');
        }
      });

      // Menu Item Selection
      menuEl.addEventListener('click', (e) => {
        const item = e.target.closest('.wp-menu-item');
        if (!item) return;

        const variant = item.dataset.variant;
        if (variant) {
          this.currentVariant = variant;
          localStorage.setItem('macos_wallpaper_variant', variant);
          this.isDropdownOpen = false;
          menuEl.classList.add('hidden');

          if (this.currentWallpaper && window.wallpaperEngine) {
            window.wallpaperEngine.setWallpaper(this.currentWallpaper, { variant: this.currentVariant });
          }
          this._updateHeroBox();
        }
      });
    }

    // 2. Action Buttons: Add Photo...
    const addPhotoBtn = this.container.querySelector('#wpAddPhotoBtn');
    if (addPhotoBtn) addPhotoBtn.onclick = () => this.openAddPhotoModal();

    // 2b. Playback Speed Slider
    const speedSlider = this.container.querySelector('#wpSpeedSlider');
    const speedValue = this.container.querySelector('#wpSpeedValue');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value).toFixed(1) + 'x';
        if (speedValue) speedValue.textContent = val;
        
        // Update hero video
        const mediaVideo = this.container.querySelector('#wpHeroMedia video');
        if (mediaVideo) mediaVideo.playbackRate = parseFloat(e.target.value);

        // Update main desktop wallpaper
        if (window.wallpaperEngine && window.wallpaperEngine.activeVideo) {
          window.wallpaperEngine.activeVideo.playbackRate = parseFloat(e.target.value);
        }
      });
    }

    // 3. Category "Show All" Toggles
    this.container.addEventListener('click', (e) => {
      const showAllBtn = e.target.closest('[data-toggle-cat]');
      if (showAllBtn) {
        const catId = showAllBtn.dataset.toggleCat;
        if (this.expandedSections.has(catId)) {
          this.expandedSections.delete(catId);
        } else {
          this.expandedSections.add(catId);
        }
        this._renderAllCategories();
        return;
      }

      // Manage Custom Wallpaper
      const editBtn = e.target.closest('[data-action="manage"]');
      if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.id;
        const target = this.installedWallpapers.find(w => w.id === id);
        if (target) this.openManageWallpaperModal(target);
        return;
      }

      // Share Toggle
      const shareBtn = e.target.closest('[data-action="toggle-share"]');
      if (shareBtn) {
        e.stopPropagation();
        const id = shareBtn.dataset.id;
        this.toggleSharing(id);
        return;
      }

      // Delete Custom Wallpaper
      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.id;
        this.deleteCustomWallpaper(id);
        return;
      }

      // Card Selection
      const card = e.target.closest('.wp-card');
      if (card && !card.classList.contains('wp-add-photo-card')) {
        const id = card.dataset.id;
        const target = this.installedWallpapers.find(w => w.id === id) ||
                       (this.marketplaceWallpapers || []).find(w => w.id === id);
        if (target) this.selectWallpaper(target);
        return;
      }
    });
  }

  async selectWallpaper(wallpaper) {
    if (!wallpaper) return;
    this.currentWallpaper = wallpaper;

    // Apply with butter-smooth 60fps dual-layer crossfade
    if (window.wallpaperEngine) {
      await window.wallpaperEngine.setWallpaper(wallpaper, {
        variant: this.currentVariant
      });
    }

    this._updateHeroBox();
    this._renderAllCategories();
  }

  async toggleSharing(id) {
    const wp = this.installedWallpapers.find(w => w.id === id);
    if (!wp) return;

    const newShared = !wp.isShared;
    try {
      const res = await fetch(`/api/wallpapers/${id}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isShared: newShared })
      });
      const data = await res.json();
      if (data.success) {
        wp.isShared = newShared;
        this._renderAllCategories();
      }
    } catch (e) {
      console.error('[WallpaperComponent] Share toggle failed:', e);
    }
  }

  async deleteCustomWallpaper(id) {
    if (!confirm('Remove this custom wallpaper?')) return;
    try {
      const res = await fetch(`/api/wallpapers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.installedWallpapers = this.installedWallpapers.filter(w => w.id !== id);
        if (this.currentWallpaper && this.currentWallpaper.id === id) {
          const fallback = this.installedWallpapers[0];
          if (fallback) await this.selectWallpaper(fallback);
        }
        this._renderAllCategories();
      }
    } catch (e) {
      console.error('[WallpaperComponent] Delete error:', e);
    }
  }

  /**
   * macOS Native Sheet Modal for Managing / Editing Wallpaper Details
   */
  openManageWallpaperModal(w) {
    const portal = this.container.querySelector('#wpModalPortal');
    if (!portal) return;

    portal.innerHTML = `
      <div class="wp-modal-backdrop" id="wpManageBackdrop">
        <div class="wp-sheet-dialog">
          <div class="wp-sheet-header">
            <div>
              <h3 class="wp-sheet-title">Wallpaper Management</h3>
              <p class="wp-sheet-subtitle">Edit title, category, and community sharing preferences</p>
            </div>
            <button class="wp-sheet-close" id="wpManageCloseBtn">✕</button>
          </div>

          <div class="wp-sheet-body">
            <div class="wp-manage-preview-row">
              <img src="${w.thumbnail || w.path}" class="wp-manage-thumb" alt="${w.name}" />
              <div class="wp-manage-meta">
                <div class="wp-manage-meta-item"><strong>Format:</strong> ${w.type === 'video' ? 'Dynamic 60fps Video' : 'Static Image'}</div>
                <div class="wp-manage-meta-item"><strong>Day/Night:</strong> ${w.hasDarkVariant ? '☀️ Light & 🌙 Dark modes' : 'Single mode'}</div>
                <div class="wp-manage-meta-item"><strong>Current Visibility:</strong> ${w.isShared ? '🌐 Shared in Community' : '🔒 Private to You'}</div>
              </div>
            </div>

            <div class="wp-sheet-field">
              <label class="wp-sheet-label">Title</label>
              <input type="text" id="wpManageName" class="wp-macos-input" value="${w.name}" required />
            </div>

            <div class="wp-sheet-field">
              <label class="wp-sheet-label">Category</label>
              <select id="wpManageCategory" class="wp-macos-select">
                <option value="Landscape" ${w.category === 'Landscape' ? 'selected' : ''}>Landscape</option>
                <option value="Cityscape" ${w.category === 'Cityscape' ? 'selected' : ''}>Cityscape</option>
                <option value="Dynamic" ${w.category === 'Dynamic' ? 'selected' : ''}>Dynamic</option>
                <option value="Abstract" ${w.category === 'Abstract' ? 'selected' : ''}>Abstract</option>
                <option value="Minimalist" ${w.category === 'Minimalist' ? 'selected' : ''}>Minimalist</option>
                <option value="Your Photos" ${w.category === 'Your Photos' || w.category === 'custom' ? 'selected' : ''}>Your Photos</option>
                <option value="Community" ${w.category === 'Community' ? 'selected' : ''}>Community</option>
              </select>
            </div>

            <div class="wp-sheet-field wp-checkbox-row">
              <input type="checkbox" id="wpManageShared" ${w.isShared ? 'checked' : ''} />
              <label for="wpManageShared" class="wp-checkbox-label">
                <strong>Share with Community</strong>
                <span>Makes this wallpaper discoverable for everyone in the Community section</span>
              </label>
            </div>

            <div class="wp-sheet-actions">
              <button type="button" class="wp-btn-danger" id="wpManageDeleteBtn">Delete</button>
              <div style="flex: 1;"></div>
              <button type="button" class="wp-pill-btn" id="wpManageCancelBtn">Cancel</button>
              <button type="button" class="wp-pill-btn wp-btn-blue" id="wpManageSaveBtn">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const close = () => { portal.innerHTML = ''; };
    const backdrop = portal.querySelector('#wpManageBackdrop');
    const closeBtn = portal.querySelector('#wpManageCloseBtn');
    const cancelBtn = portal.querySelector('#wpManageCancelBtn');
    const saveBtn = portal.querySelector('#wpManageSaveBtn');
    const deleteBtn = portal.querySelector('#wpManageDeleteBtn');

    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    deleteBtn.onclick = async () => {
      close();
      await this.deleteCustomWallpaper(w.id);
    };

    saveBtn.onclick = async () => {
      const nameInput = portal.querySelector('#wpManageName');
      const categorySelect = portal.querySelector('#wpManageCategory');
      const sharedCheck = portal.querySelector('#wpManageShared');

      const newName = (nameInput.value || '').trim() || w.name;
      const newCategory = categorySelect.value;
      const newShared = sharedCheck.checked;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await fetch(`/api/wallpapers/${w.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName,
            category: newCategory,
            isShared: newShared
          })
        });

        const data = await res.json();
        if (data.success) {
          w.name = newName;
          w.category = newCategory;
          w.isShared = newShared;
          if (this.currentWallpaper && this.currentWallpaper.id === w.id) {
            this.currentWallpaper.name = newName;
            this.currentWallpaper.category = newCategory;
            this.currentWallpaper.isShared = newShared;
            this._updateHeroBox();
          }
          this._renderAllCategories();
          close();
        } else {
          alert('Update failed: ' + (data.error || 'Unknown error'));
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      } catch (err) {
        alert('Update error: ' + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    };
  }

  /**
   * macOS Native Sheet Modal for Custom Wallpapers (Light + Dark + Public/Private)
   */
  openAddPhotoModal() {
    const portal = this.container.querySelector('#wpModalPortal');
    if (!portal) return;

    portal.innerHTML = `
      <div class="wp-modal-backdrop" id="wpModalBackdrop">
        <div class="wp-sheet-dialog">
          <div class="wp-sheet-header">
            <div>
              <h3 class="wp-sheet-title">Add Wallpaper</h3>
              <p class="wp-sheet-subtitle">Upload high-resolution static or dynamic desktop backgrounds</p>
            </div>
            <button class="wp-sheet-close" id="wpSheetCloseBtn">✕</button>
          </div>

          <form id="wpAddPhotoForm" class="wp-sheet-body">
            <div class="wp-sheet-field">
              <label class="wp-sheet-label">Wallpaper Name</label>
              <input type="text" id="wpInputTitle" class="wp-macos-input" placeholder="e.g. Pacific Coast Sunset" required />
            </div>

            <div class="wp-sheet-row">
              <div class="wp-sheet-field wp-flex-1">
                <label class="wp-sheet-label">Category</label>
                <select id="wpInputCategory" class="wp-macos-select">
                  <option value="Landscape">Landscape</option>
                  <option value="Cityscape">Cityscape</option>
                  <option value="Underwater">Underwater</option>
                  <option value="Earth">Earth</option>
                  <option value="Abstract">Abstract</option>
                </select>
              </div>
              <div class="wp-sheet-field wp-flex-1">
                <label class="wp-sheet-label">Media Type</label>
                <select id="wpInputType" class="wp-macos-select">
                  <option value="auto">Auto-Detect</option>
                  <option value="static">Static Image (JPG, PNG, WebP)</option>
                  <option value="video">Dynamic Looping Video (MP4, WebM)</option>
                </select>
              </div>
            </div>

            <!-- Dual File Uploads: Light & Dark Counterparts -->
            <div class="wp-dual-drop-row">
              <div class="wp-drop-box" id="wpDropLight">
                <span class="wp-drop-badge light">☀️ Light Mode (Primary)</span>
                <input type="file" id="wpFileLight" class="wp-file-none" accept="image/*,video/mp4,video/webm" required />
                <div class="wp-drop-idle" id="wpDropLightIdle">
                  <div class="wp-drop-icon">📁</div>
                  <div class="wp-drop-text">Choose Light File</div>
                  <div class="wp-drop-hint">Drag & drop or browse</div>
                </div>
                <div class="wp-drop-preview" id="wpDropLightPrev" style="display:none;"></div>
              </div>

              <div class="wp-drop-box" id="wpDropDark">
                <span class="wp-drop-badge dark">🌙 Dark Mode (Optional)</span>
                <input type="file" id="wpFileDark" class="wp-file-none" accept="image/*,video/mp4,video/webm" />
                <div class="wp-drop-idle" id="wpDropDarkIdle">
                  <div class="wp-drop-icon">🌙</div>
                  <div class="wp-drop-text">Choose Dark Counterpart</div>
                  <div class="wp-drop-hint">Auto-switches at night</div>
                </div>
                <div class="wp-drop-preview" id="wpDropDarkPrev" style="display:none;"></div>
              </div>
            </div>

            <!-- Community Sharing Toggle Switch -->
            <div class="wp-share-card">
              <div class="wp-share-card-text">
                <div class="wp-share-title">🌐 Share with Community Marketplace</div>
                <div class="wp-share-desc">Allow other users to discover, download, and enjoy this wallpaper in the Community section.</div>
              </div>
              <label class="wp-macos-switch">
                <input type="checkbox" id="wpInputShare" checked />
                <span class="wp-switch-knob"></span>
              </label>
            </div>

            <!-- Progress Indicator -->
            <div class="wp-progress-wrap" id="wpUploadProgress" style="display:none;">
              <div class="wp-progress-bar"><div class="wp-progress-inner" id="wpProgressInner"></div></div>
              <div class="wp-progress-status" id="wpProgressStatus">Processing & generating 4K WebP thumbnails...</div>
            </div>

            <div class="wp-sheet-footer">
              <button type="button" class="wp-pill-btn" id="wpCancelSheetBtn">Cancel</button>
              <button type="submit" class="wp-pill-btn wp-btn-blue" id="wpSubmitSheetBtn">Add Wallpaper</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._bindSheetEvents();
  }

  _bindSheetEvents() {
    const portal = this.container.querySelector('#wpModalPortal');
    const backdrop = portal.querySelector('#wpModalBackdrop');
    const closeBtn = portal.querySelector('#wpSheetCloseBtn');
    const cancelBtn = portal.querySelector('#wpCancelSheetBtn');
    const form = portal.querySelector('#wpAddPhotoForm');

    const close = () => { portal.innerHTML = ''; };
    closeBtn.onclick = close;
    cancelBtn.onclick = close;
    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

    this._setupDropBox('wpDropLight', 'wpFileLight', 'wpDropLightIdle', 'wpDropLightPrev');
    this._setupDropBox('wpDropDark', 'wpFileDark', 'wpDropDarkIdle', 'wpDropDarkPrev');

    form.onsubmit = async (e) => {
      e.preventDefault();

      const titleInput = form.querySelector('#wpInputTitle');
      const catSelect = form.querySelector('#wpInputCategory');
      const typeSelect = form.querySelector('#wpInputType');
      const lightInput = form.querySelector('#wpFileLight');
      const darkInput = form.querySelector('#wpFileDark');
      const shareInput = form.querySelector('#wpInputShare');
      const progressWrap = form.querySelector('#wpUploadProgress');
      const progressInner = form.querySelector('#wpProgressInner');
      const submitBtn = form.querySelector('#wpSubmitSheetBtn');

      if (!lightInput.files || !lightInput.files[0]) {
        alert('Please choose at least a Light / Primary wallpaper file');
        return;
      }

      const formData = new FormData();
      formData.append('lightFile', lightInput.files[0]);
      if (darkInput.files && darkInput.files[0]) {
        formData.append('darkFile', darkInput.files[0]);
      }
      formData.append('title', titleInput.value.trim());
      formData.append('category', catSelect.value);
      formData.append('type', typeSelect.value);
      formData.append('isShared', shareInput.checked ? 'true' : 'false');
      formData.append('author', 'You');

      try {
        submitBtn.disabled = true;
        progressWrap.style.display = 'block';
        progressInner.style.width = '50%';

        const res = await fetch('/api/wallpapers/upload', {
          method: 'POST',
          body: formData
        });

        progressInner.style.width = '100%';
        const data = await res.json();

        if (data.success && data.wallpaper) {
          setTimeout(async () => {
            close();
            await this.loadAllWallpapers();
            await this.selectWallpaper(data.wallpaper);
          }, 350);
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
        submitBtn.disabled = false;
        progressWrap.style.display = 'none';
      }
    };
  }

  _setupDropBox(boxId, inputId, idleId, prevId) {
    const portal = this.container.querySelector('#wpModalPortal');
    const box = portal.querySelector(`#${boxId}`);
    const input = portal.querySelector(`#${inputId}`);
    const idle = portal.querySelector(`#${idleId}`);
    const prev = portal.querySelector(`#${prevId}`);

    box.onclick = () => input.click();
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('hover'); };
    box.ondragleave = () => box.classList.remove('hover');
    box.ondrop = (e) => {
      e.preventDefault();
      box.classList.remove('hover');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        this._previewFile(input.files[0], idle, prev);
      }
    };

    input.onchange = () => {
      if (input.files && input.files[0]) {
        this._previewFile(input.files[0], idle, prev);
      }
    };
  }

  _previewFile(file, idleEl, prevEl) {
    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov)$/i);
    const url = URL.createObjectURL(file);
    idleEl.style.display = 'none';
    prevEl.style.display = 'block';

    if (isVideo) {
      prevEl.innerHTML = `
        <video src="${url}" class="wp-drop-thumb" muted autoplay loop></video>
        <div class="wp-drop-name">${file.name}</div>
      `;
    } else {
      prevEl.innerHTML = `
        <img src="${url}" class="wp-drop-thumb" />
        <div class="wp-drop-name">${file.name}</div>
      `;
    }
  }

  _renderStyles() {
    return `
      <style>
        .wp-apple-settings-view {
          padding: 16px 24px 64px;
          color: var(--settings-text);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif;
          user-select: none;
          max-width: 100%;
          box-sizing: border-box;
          margin: 0 auto;
        }

        /* Top Header */
        .wp-macos-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }

        .wp-header-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.3px;
        }

        /* Top Hero Box */
        .wp-hero-container {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 20px 24px;
          background: var(--settings-card-bg);
          border: 1px solid var(--settings-border);
          border-radius: 12px;
          margin-bottom: 28px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .wp-hero-left {
          flex-shrink: 0;
        }

        .wp-hero-thumb-wrap {
          width: 190px;
          height: 115px;
          border-radius: 8px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
          position: relative;
        }

        .wp-hero-media, .wp-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background-size: cover;
          background-position: center;
        }

        .wp-hero-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .wp-hero-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .wp-hero-meta-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .wp-hero-name {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
          letter-spacing: -0.2px;
        }

        .wp-hero-spaces {
          font-size: 12px;
          color: var(--settings-text-secondary);
        }

        /* Pop-up Button & Menu */
        .wp-popup-anchor {
          position: relative;
        }

        .wp-popup-btn {
          border: 1px solid var(--settings-border);
          background: var(--settings-input-bg);
          color: var(--settings-text);
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.15s ease;
        }
        .wp-popup-btn:hover { background: var(--settings-hover-bg); }
        .wp-popup-chevrons { font-size: 11px; opacity: 0.6; }

        .wp-popup-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 6px;
          min-width: 180px;
          background: var(--settings-window-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid var(--settings-border);
          border-radius: 8px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
          padding: 4px;
          z-index: 1000;
          animation: wpFadeIn 0.15s ease;
        }
        .wp-popup-menu.hidden { display: none; }

        @keyframes wpFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .wp-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          font-size: 12px;
          border-radius: 5px;
          cursor: pointer;
          color: var(--settings-text);
          transition: background 0.1s ease;
        }
        .wp-menu-item:hover { background: var(--settings-hover-bg); }
        .wp-menu-item.active {
          background: var(--settings-primary);
          color: #ffffff;
        }

        .wp-menu-check {
          width: 14px;
          font-size: 12px;
          font-weight: 700;
          display: inline-block;
        }

        .wp-menu-label { flex: 1; }

        .wp-menu-divider {
          height: 1px;
          background: var(--settings-border);
          margin: 4px 0;
        }

        /* Action Buttons Row */
        .wp-hero-actions-row {
          display: flex;
          gap: 10px;
        }

        .wp-pill-btn {
          border: 1px solid var(--settings-border);
          background: var(--settings-input-bg);
          color: var(--settings-text);
          padding: 5px 14px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .wp-pill-btn:hover { background: var(--settings-hover-bg); }
        .wp-btn-blue { background: var(--settings-primary); border-color: var(--settings-primary); color: #fff; }
        .wp-btn-blue:hover { opacity: 0.9; }

        /* Category Sections */
        .wp-category-block {
          margin-bottom: 24px;
        }

        .wp-category-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .wp-category-title {
          font-size: 14px;
          font-weight: 600;
          margin: 0;
          color: var(--settings-text);
        }

        .wp-show-all-btn {
          border: none;
          background: transparent;
          color: var(--settings-text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .wp-show-all-btn:hover { color: var(--settings-text); text-decoration: underline; }

        /* Cards Track (Dynamic Grid layout to avoid scrollbar) */
        .wp-cards-track {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .wp-cards-track.expanded {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }

        /* Wallpaper Card */
        .wp-card {
          width: 100%;
          cursor: pointer;
          position: relative;
          transition: transform 0.15s ease;
        }
        .wp-card:hover { transform: translateY(-2px); }

        .wp-card-thumb-wrap {
          width: 100%;
          aspect-ratio: 16 / 10;
          border-radius: 8px;
          overflow: hidden;
          background: #1a1a20;
          position: relative;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
          border: 2px solid transparent;
          box-sizing: border-box;
        }

        .wp-card.selected .wp-card-thumb-wrap {
          border-color: #007aff;
          box-shadow: 0 0 0 1px #007aff, 0 4px 14px rgba(0, 122, 255, 0.4);
        }

        .wp-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .wp-card-name {
          font-size: 11px;
          font-weight: 500;
          text-align: center;
          margin-top: 6px;
          color: var(--settings-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Pill Icons inside thumbnail */
        .wp-card-icon-pill {
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 10px;
          bottom: 6px;
        }
        .wp-card-icon-pill.left { left: 6px; }
        .wp-card-icon-pill.right { right: 6px; }

        .wp-icon-play { font-size: 8px; margin-left: 1px; color: #64b5f6; }
        .wp-icon-dl { font-size: 11px; font-weight: 700; color: #fff; }
        .wp-icon-dual { font-size: 11px; color: #ffb74d; }
        .wp-icon-shuffle { font-size: 9px; }

        /* Add Photo Card (inside Your Photos grid) */
        .wp-add-thumb {
          border: 1.5px dashed var(--settings-border);
          background: var(--settings-input-bg);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .wp-add-plus { font-size: 26px; color: var(--settings-text-secondary); font-weight: 300; }
        .wp-add-photo-card:hover .wp-add-thumb {
          border-color: var(--settings-primary);
          background: rgba(0, 122, 255, 0.08);
        }
        .wp-add-photo-card:hover .wp-add-plus { color: var(--settings-primary); }

        /* Custom Card Hover Overlay */
        .wp-card-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .wp-card:hover .wp-card-overlay { opacity: 1; }

        .wp-overlay-share-btn {
          border: none;
          padding: 3px 8px;
          font-size: 10px;
          font-weight: 600;
          border-radius: 4px;
          cursor: pointer;
        }
        .wp-overlay-share-btn.shared { background: #34c759; color: #fff; }
        .wp-overlay-share-btn.private { background: rgba(255, 255, 255, 0.25); color: #fff; }

        .wp-overlay-del-btn {
          border: none;
          background: rgba(255, 59, 48, 0.85);
          color: #fff;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
        }

        /* Modal Sheet */
        .wp-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .wp-sheet-dialog {
          width: 100%;
          max-width: 560px;
          background: rgba(38, 38, 46, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }

        .wp-sheet-header {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .wp-sheet-title { margin: 0; font-size: 16px; font-weight: 700; }
        .wp-sheet-subtitle { margin: 3px 0 0; font-size: 12px; color: rgba(255, 255, 255, 0.55); }
        .wp-sheet-close {
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          cursor: pointer;
        }

        .wp-sheet-body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .wp-sheet-field { display: flex; flex-direction: column; gap: 5px; }
        .wp-sheet-row { display: flex; gap: 12px; }
        .wp-flex-1 { flex: 1; }
        .wp-sheet-label { font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.85); }

        .wp-macos-input, .wp-macos-select {
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #fff;
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 12px;
          outline: none;
        }
        .wp-macos-input:focus, .wp-macos-select:focus { border-color: #007aff; }

        /* Dual Dropzones */
        .wp-dual-drop-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .wp-drop-box {
          border: 1.5px dashed rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          padding: 16px 10px;
          text-align: center;
          cursor: pointer;
          background: rgba(0, 0, 0, 0.2);
          position: relative;
          min-height: 110px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .wp-drop-box:hover, .wp-drop-box.hover {
          border-color: #007aff;
          background: rgba(0, 122, 255, 0.08);
        }

        .wp-drop-badge {
          position: absolute;
          top: 6px;
          left: 6px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 5px;
          border-radius: 3px;
        }
        .wp-drop-badge.light { background: rgba(255, 255, 255, 0.15); color: #fff; }
        .wp-drop-badge.dark { background: rgba(0, 0, 0, 0.4); color: #ffb74d; border: 1px solid rgba(255, 183, 77, 0.3); }

        .wp-drop-icon { font-size: 22px; margin-bottom: 4px; }
        .wp-drop-text { font-size: 11px; font-weight: 600; }
        .wp-drop-hint { font-size: 9px; color: rgba(255, 255, 255, 0.45); }
        .wp-file-none { display: none; }

        .wp-drop-thumb { width: 100%; max-height: 80px; object-fit: cover; border-radius: 4px; margin-bottom: 4px; }
        .wp-drop-name { font-size: 9px; color: rgba(255, 255, 255, 0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px; }

        /* Share Switch Card */
        .wp-share-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
        }
        .wp-share-title { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
        .wp-share-desc { font-size: 10px; color: rgba(255, 255, 255, 0.5); line-height: 1.3; max-width: 380px; }

        .wp-macos-switch {
          position: relative;
          display: inline-block;
          width: 38px;
          height: 22px;
          flex-shrink: 0;
        }
        .wp-macos-switch input { opacity: 0; width: 0; height: 0; }
        .wp-switch-knob {
          position: absolute;
          inset: 0;
          cursor: pointer;
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 22px;
          transition: 0.2s ease;
        }
        .wp-switch-knob:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: 0.2s ease;
        }
        .wp-macos-switch input:checked + .wp-switch-knob { background-color: #34c759; }
        .wp-macos-switch input:checked + .wp-switch-knob:before { transform: translateX(16px); }

        .wp-progress-wrap { margin-top: 4px; }
        .wp-progress-bar { height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden; }
        .wp-progress-inner { height: 100%; width: 0%; background: #007aff; transition: width 0.2s ease; }
        .wp-progress-status { font-size: 10px; color: rgba(255, 255, 255, 0.5); margin-top: 4px; }

        .wp-sheet-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .wp-overlay-edit-btn {
          border: none;
          background: rgba(255, 255, 255, 0.25);
          color: #fff;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }
        .wp-overlay-edit-btn:hover { background: rgba(255, 255, 255, 0.45); }

        .wp-manage-preview-row {
          display: flex;
          gap: 16px;
          align-items: center;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.25);
          border-radius: 8px;
          margin-bottom: 6px;
        }

        .wp-manage-thumb {
          width: 96px;
          height: 60px;
          object-fit: cover;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          flex-shrink: 0;
        }

        .wp-manage-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
        }

        .wp-manage-meta-item strong {
          color: rgba(255, 255, 255, 0.9);
        }

        .wp-sheet-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .wp-btn-danger {
          background: rgba(255, 59, 48, 0.15);
          color: #ff453a;
          border: 1px solid rgba(255, 59, 48, 0.35);
          border-radius: 6px;
          padding: 6px 14px;
          font-size: 12px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .wp-btn-danger:hover {
          background: #ff3b30;
          color: #ffffff;
        }

        .wp-category-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .wp-category-badge {
          font-size: 11px;
          padding: 1px 7px;
          border-radius: 10px;
          background: var(--settings-hover-bg, rgba(255, 255, 255, 0.1));
          color: var(--settings-text-secondary, #8e8e93);
          font-weight: 600;
        }

        /* Light Mode High-Fidelity Refinements */
        :root[data-theme="light"] .wp-sheet-dialog,
        [data-theme="light"] .wp-sheet-dialog {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.12);
          color: #1d1d1f;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
        }

        :root[data-theme="light"] .wp-sheet-header,
        [data-theme="light"] .wp-sheet-header {
          border-bottom-color: rgba(0, 0, 0, 0.08);
        }

        :root[data-theme="light"] .wp-sheet-subtitle,
        [data-theme="light"] .wp-sheet-subtitle {
          color: rgba(0, 0, 0, 0.55);
        }

        :root[data-theme="light"] .wp-sheet-close,
        [data-theme="light"] .wp-sheet-close {
          background: rgba(0, 0, 0, 0.06);
          color: rgba(0, 0, 0, 0.6);
        }

        :root[data-theme="light"] .wp-sheet-label,
        [data-theme="light"] .wp-sheet-label {
          color: #1d1d1f;
        }

        :root[data-theme="light"] .wp-macos-input,
        :root[data-theme="light"] .wp-macos-select,
        [data-theme="light"] .wp-macos-input,
        [data-theme="light"] .wp-macos-select {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.15);
          color: #1d1d1f;
        }

        :root[data-theme="light"] .wp-manage-preview-row,
        [data-theme="light"] .wp-manage-preview-row {
          background: #f5f5f7;
        }

        :root[data-theme="light"] .wp-manage-meta-item strong,
        [data-theme="light"] .wp-manage-meta-item strong {
          color: #1d1d1f;
        }

        :root[data-theme="light"] .wp-drop-box,
        [data-theme="light"] .wp-drop-box {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.15);
        }

        :root[data-theme="light"] .wp-share-card,
        [data-theme="light"] .wp-share-card {
          background: #f5f5f7;
          border-color: rgba(0, 0, 0, 0.1);
        }

        :root[data-theme="light"] .wp-share-desc,
        [data-theme="light"] .wp-share-desc {
          color: rgba(0, 0, 0, 0.6);
        }

        :root[data-theme="light"] .wp-sheet-actions,
        [data-theme="light"] .wp-sheet-actions {
          border-top-color: rgba(0, 0, 0, 0.08);
        }

        :root[data-theme="light"] .wp-sheet-footer,
        [data-theme="light"] .wp-sheet-footer {
          border-top-color: rgba(0, 0, 0, 0.08);
        }

        .wp-loading-spinner {
          width: 22px;
          height: 22px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #007aff;
          border-radius: 50%;
          animation: wpSpin 0.8s linear infinite;
          margin: 30px auto;
        }
        @keyframes wpSpin { to { transform: rotate(360deg); } }
      </style>
    `;
  }
}
