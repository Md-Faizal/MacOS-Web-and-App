import AppWindow from '../../../scripts/app-bar/modules/app-window.js';
import { notifications } from '../../../scripts/shared/notifications.js';

class CloudApp extends AppWindow {
  constructor(callbacks = {}) {
    const width = window.innerWidth;
    let config = { 
      appId: 'cloud', 
      appName: 'Cloud', 
      containerId: 'cloudAppContainer',
      callbacks: callbacks
    };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }

    super(config);

    this.files = [];
    this.filteredFiles = [];
    this.currentSpace = 'all';
    this.currentCategory = 'all';
    this.searchQuery = '';
    this.previousFileIds = new Set();
    this.isUploading = false;
    this.stats = null;
    
    // Advanced Viewer State
    this.viewerState = {
      active: false,
      currentIndex: -1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      isDragging: false,
      startX: 0,
      startY: 0,
      slideshowInterval: null,
      type: 'image', // 'image' or 'video'
      pendingPlay: false,
      // Touch Support State
      touches: [],
      initialDistance: 0,
      initialScale: 1,
      lastMidpoint: null
    };



    window.currentCloudApp = this;
    
    this.render();
    this.setupHeaderControls();
    this.fetchFiles();
    this.fetchStats();
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (sidebar toggle)
    const leftControls = document.createElement('div');
    leftControls.className = 'cloud-left-controls';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cloud-header-btn';
    toggleBtn.id = 'cloudSidebarToggle';
    toggleBtn.title = 'Show/Hide Sidebar';
    toggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(toggleBtn);
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    
    // Create right controls group
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'cloud-header-controls';
    
    // Action buttons (Delete, Add)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'cloud-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="cloud-header-btn delete-btn" id="cloudHeaderDeleteBtn" title="Delete Selected" disabled>🗑️</button>
      <button class="cloud-header-btn" id="cloudHeaderAddBtn" title="Upload File">+</button>
    `;
    
    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'cloud-header-search';
    searchInput.id = 'cloudHeaderSearch';
    searchInput.placeholder = 'Search files...';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);
    
    // Replace spacer with right controls
    if (spacer) {
      spacer.parentNode.replaceChild(rightControls, spacer);
    } else {
      titleBar.appendChild(rightControls);
    }
    
    // Event Listeners
    toggleBtn.addEventListener('click', () => this.toggleSidebar());
    
    const deleteBtn = document.getElementById('cloudHeaderDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteSelectedFiles());
    }
    
    const addBtn = document.getElementById('cloudHeaderAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const fileInput = this.contentArea.querySelector('#cloud-file-input');
        if (fileInput) fileInput.click();
      });
    }
    
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      // Sync with content area search if it exists
      const contentSearch = this.contentArea.querySelector('#cloud-search-input');
      if (contentSearch) contentSearch.value = e.target.value;
      this.filterFiles();
    });
  }

  toggleSidebar() {
    const sidebar = this.contentArea.querySelector('.cloud-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('hidden');
    }
  }

  async deleteSelectedFiles() {
    const checkedBoxes = this.contentArea.querySelectorAll('.cloud-col-check input:checked');
    const idsToDelete = Array.from(checkedBoxes).map(cb => {
      const row = cb.closest('.cloud-file-row');
      return row ? row.getAttribute('data-id') : null;
    }).filter(id => id);

    if (idsToDelete.length === 0) {
      notifications.show('Selection Empty', 'Please select files to delete.', { type: 'warning' });
      return;
    }

    if (confirm(`Are you sure you want to delete ${idsToDelete.length} selected file(s)?`)) {
      const toastId = notifications.show('Deleting Files', `Removing ${idsToDelete.length} files...`, { type: 'delete', duration: 0 });
      let successCount = 0;
      for (const id of idsToDelete) {
        const success = await this.deleteFile(id, true); // silent=true
        if (success) successCount++;
      }
      notifications.hide(toastId);
      notifications.show('Delete Complete', `Successfully removed ${successCount} files.`, { type: 'success', system: true });
    }
  }

  render() {
    this.contentArea.innerHTML = `
      <div class="cloud-app" id="cloud-main-container">
        <!-- Sidebar -->
        <aside class="cloud-sidebar">
          <div class="cloud-logo">
            <div class="cloud-logo-box">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 7L12 2L3 7V17L12 22L21 17V7Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 7L12 12L21 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 22V12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <span>StackDrive</span>
          </div>
          
          <div class="cloud-nav-sections">
            <div class="cloud-nav-section">
              <div class="cloud-section-label">Overview</div>
              <div class="cloud-nav-item active" data-space="all">
                <span class="cloud-nav-icon">⬚</span> Overview Storage
              </div>
            </div>

            <div class="cloud-nav-section">
              <div class="cloud-section-label">File Manager</div>
              <div class="cloud-nav-item" data-space="personal">
                <span class="cloud-nav-icon">☁</span> My Storage
              </div>
              <div class="cloud-nav-item" data-category="recents">
                <span class="cloud-nav-icon">🕒</span> Recents
              </div>
              <div class="cloud-nav-item" data-category="favorites">
                <span class="cloud-nav-icon">⭐</span> Favorites
              </div>
              <div class="cloud-nav-item" data-category="trash">
                <span class="cloud-nav-icon">🗑</span> Trash
              </div>
            </div>

            <div class="cloud-nav-section">
              <div class="cloud-section-label">Shared File</div>
              <div class="cloud-nav-item" data-space="shared-folder">
                <span class="cloud-nav-icon">📁</span> Shared Folder
              </div>
              <div class="cloud-nav-item" data-space="shared-file">
                <span class="cloud-nav-icon">📄</span> Shared File
              </div>
            </div>

            <div class="cloud-nav-section">
              <div class="cloud-section-label">Team Storage</div>
              <div class="cloud-nav-item team-item" data-space="civic-team">
                <span class="cloud-team-dot cloud-color-pink"></span> Civic Team
              </div>
              <div class="cloud-nav-item team-item" data-space="dev-team">
                <span class="cloud-team-dot cloud-color-blue"></span> Developer Team
              </div>
            </div>
          </div>

          <button class="cloud-btn-outline-action" id="add-team-btn">+ Add team storage</button>

          <div class="cloud-sidebar-footer">
            <div class="storage-info">
              <div class="cloud-storage-meta">
                <span class="cloud-meta-label" id="storage-used-txt">Storage</span>
                <span class="cloud-meta-value" id="storage-pct">0%</span>
              </div>
              <div class="cloud-storage-progress">
                <div class="sd-progress-bar" id="storage-fill-bar" style="width: 0%;"></div>
              </div>
            </div>
          </div>
        </aside>

        <!-- Main Workspace -->
        <main class="cloud-main">
          <header class="cloud-header">
            <div class="cloud-header-left">
              <h1 class="cloud-page-title">File Manager</h1>
              <div class="cloud-search-box">
                <span class="cloud-search-icon">🔍</span>
                <input type="text" placeholder="Search here" id="cloud-search-input">
                <span class="cloud-search-shortcut">⌘ + K</span>
                <span class="cloud-filter-icon">⚙️</span>
              </div>
            </div>
            
            <div class="cloud-header-right">
              <button class="cloud-header-icon-btn"><span>ⓘ</span></button>
              <button class="cloud-header-icon-btn"><span>🔔</span><span class="cloud-notify-badge"></span></button>
              <button class="cloud-header-icon-btn"><span>⚙️</span></button>
              <div class="cloud-user-avatar">
                <img src="https://ui-avatars.com/api/?name=Admin&background=random" alt="User">
              </div>
            </div>
          </header>

          <div class="cloud-content-scroll">
            <div class="cloud-content-toolbar">
              <h2 class="cloud-sub-title">Overview Storage</h2>
              <div class="cloud-toolbar-actions">
                <button class="cloud-btn-secondary"><span>⇅</span> Sort</button>
                <button class="cloud-btn-secondary"><span>⬚</span> View</button>
                <button class="cloud-btn-primary" id="upload-trigger"><span>+</span> Create</button>
                <input type="file" id="cloud-file-input" style="display: none;" multiple>
              </div>
            </div>

            <section class="cloud-overview-cards" id="overview-cards-container">
              <!-- Category cards will be injected here -->
              <div class="cloud-category-card" data-category="image">
                <div class="cloud-card-icon cloud-color-red">🖼️</div>
                <div class="cloud-card-details">
                  <div class="cloud-card-name">Image</div>
                  <div class="cloud-card-count" id="count-image">0 items</div>
                  <div class="cloud-card-progress"><div class="cloud-fill cloud-color-red" id="fill-image"></div></div>
                  <div class="cloud-card-usage" id="usage-image">0 GB of 100 GB</div>
                </div>
              </div>
              <div class="cloud-category-card" data-category="video">
                <div class="cloud-card-icon cloud-color-blue">🎬</div>
                <div class="cloud-card-details">
                  <div class="cloud-card-name">Video</div>
                  <div class="cloud-card-count" id="count-video">0 items</div>
                  <div class="cloud-card-progress"><div class="cloud-fill cloud-color-blue" id="fill-video"></div></div>
                  <div class="cloud-card-usage" id="usage-video">0 GB of 100 GB</div>
                </div>
              </div>
              <div class="cloud-category-card" data-category="document">
                <div class="cloud-card-icon cloud-color-green">📄</div>
                <div class="cloud-card-details">
                  <div class="cloud-card-name">Document</div>
                  <div class="cloud-card-count" id="count-document">0 items</div>
                  <div class="cloud-card-progress"><div class="cloud-fill cloud-color-green" id="fill-document"></div></div>
                  <div class="cloud-card-usage" id="usage-document">0 GB of 100 GB</div>
                </div>
              </div>
              <div class="cloud-category-card" data-category="others">
                <div class="cloud-card-icon cloud-color-yellow">📦</div>
                <div class="cloud-card-details">
                  <div class="cloud-card-name">Others</div>
                  <div class="cloud-card-count" id="count-others">0 items</div>
                  <div class="cloud-card-progress"><div class="cloud-fill cloud-color-yellow" id="fill-others"></div></div>
                  <div class="cloud-card-usage" id="usage-others">0 GB of 100 GB</div>
                </div>
              </div>
            </section>

            <section class="cloud-suggested-section">
              <div class="cloud-section-title">Suggested</div>
              <div class="cloud-suggested-grid" id="suggested-grid">
                <!-- Suggested files will be injected here -->
              </div>
            </section>

            <section class="cloud-recent-section">
              <div class="cloud-section-title">Recent files</div>
              <table class="cloud-files-table">
                <thead>
                  <tr>
                    <th class="cloud-col-check"><input type="checkbox" class="cloud-macos-checkbox" id="cloudSelectAllFiles"></th>
                    <th class="cloud-col-name">Name <span>⇅</span></th>
                    <th class="cloud-col-size">Size <span>⇅</span></th>
                    <th class="cloud-col-shared">Shared</th>
                    <th class="cloud-col-modified">Last modified <span>⇅</span></th>
                  </tr>
                </thead>
                <tbody id="recent-files-list">
                  <!-- File rows will be injected here -->
                </tbody>
              </table>
            </section>
          </div>
        </main>

        <!-- Drag Overlay -->
        <div class="cloud-drag-overlay" id="drag-overlay">
          <div class="cloud-drag-content">
            <div class="cloud-drag-icon">📥</div>
            <h2>Drop to upload</h2>
            <p>Your files will be added to <span id="current-space-name">Personal Storage</span></p>
          </div>
        </div>

        <!-- Advanced Media Viewer Modal -->
        <div class="cloud-preview-modal" id="preview-modal">
          <div class="cloud-preview-header">
            <div class="cloud-preview-info">
              <span class="cloud-preview-filename" id="preview-filename">File Name</span>
              <span class="cloud-preview-meta" id="preview-meta">1024 x 768 • 1.2 MB</span>
            </div>
            <div class="cloud-preview-header-actions">
              <button class="cloud-preview-btn-top" id="preview-download-btn" title="Download">📥</button>
              <button class="cloud-preview-btn-top" id="preview-close" title="Close (Esc)">✕</button>
            </div>
          </div>
          
          <div class="cloud-preview-main" id="preview-main">
            <div class="cloud-preview-media-wrapper" id="preview-media-wrapper">
              <div class="cloud-preview-image-container" id="preview-image-container">
                <img src="" class="cloud-preview-img-advanced" id="preview-img">
              </div>
              <div class="cloud-preview-video-container" id="preview-video-container" style="display: none;">
                <video id="preview-video" class="cloud-preview-video-element" crossorigin="anonymous" preload="metadata"></video>
                <div class="cloud-video-overlay-play" id="video-overlay-play">▶</div>
              </div>
            </div>
          </div>
          
          <!-- Video Scrub Bar (only for videos) -->
          <div class="cloud-video-controls-bar" id="video-controls-bar" style="display: none;">
            <button class="cloud-video-ctrl-btn" id="video-play-pause">▶</button>
            <div class="cloud-video-progress-container">
              <span class="cloud-video-time" id="video-current-time">0:00</span>
              <div class="cloud-video-scrub-bar" id="video-scrub-bar">
                <div class="cloud-video-progress-fill" id="video-progress-fill"></div>
                <div class="cloud-video-scrub-handle" id="video-scrub-handle"></div>
              </div>
              <span class="cloud-video-time" id="video-duration">0:00</span>
            </div>
            <div class="cloud-video-volume-container">
              <button class="cloud-video-ctrl-btn" id="video-mute">🔊</button>
              <input type="range" class="cloud-video-volume-slider" id="video-volume" min="0" max="1" step="0.1" value="1">
            </div>
            <button class="cloud-video-ctrl-btn" id="video-speed">1x</button>
            <button class="cloud-video-ctrl-btn" id="video-fullscreen">⛶</button>
          </div>

          <div class="cloud-preview-toolbar">
            <div class="cloud-toolbar-group">
              <button class="cloud-toolbar-btn" id="preview-prev" title="Previous (Left Arrow)">◀</button>
              <button class="cloud-toolbar-btn cloud-play-btn" id="preview-play" title="Slideshow (Space)">▶</button>
              <button class="cloud-toolbar-btn" id="preview-next" title="Next (Right Arrow)">▶</button>
            </div>
            <div class="cloud-toolbar-divider cloud-media-toolbar-divider"></div>
            <div class="cloud-toolbar-group cloud-image-only-tools">
              <button class="cloud-toolbar-btn" id="preview-zoom-out" title="Zoom Out">➖</button>
              <button class="cloud-toolbar-btn" id="preview-reset" title="Reset Zoom">1:1</button>
              <button class="cloud-toolbar-btn" id="preview-zoom-in" title="Zoom In">➕</button>
            </div>
            <div class="cloud-toolbar-divider cloud-image-only-tools"></div>
            <div class="cloud-toolbar-group cloud-image-only-tools">
              <button class="cloud-toolbar-btn" id="preview-rotate" title="Rotate">↻</button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.setupAppEventListeners();
  }

  setupAppEventListeners() {
    const root = this.contentArea;
    const uploadTrigger = root.querySelector('#upload-trigger');
    const fileInput = root.querySelector('#cloud-file-input');
    const searchInput = root.querySelector('#cloud-search-input');
    const navItems = root.querySelectorAll('.cloud-nav-item');
    const categoryCards = root.querySelectorAll('.cloud-category-card');
    const container = root.querySelector('#cloud-main-container');
    const previewModal = root.querySelector('#preview-modal');

    uploadTrigger.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    
    // Search logic
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterFiles();
    });

    // Sidebar navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        const space = item.getAttribute('data-space');
        const category = item.getAttribute('data-category');
        
        if (space) {
          this.currentSpace = space;
          this.currentCategory = 'all';
          root.querySelector('#current-space-name').textContent = item.textContent.trim();
        } else if (category) {
          this.currentCategory = category;
        }
        
        // Auto-close sidebar on mobile
        if (window.innerWidth <= 1024) {
          const sidebar = this.contentArea.querySelector('.cloud-sidebar');
          if (sidebar && !sidebar.classList.contains('hidden')) {
            this.toggleSidebar();
          }
        }

        this.fetchFiles();
      });
    });

    // Category card clicks
    categoryCards.forEach(card => {
      card.addEventListener('click', () => {
        this.currentCategory = card.getAttribute('data-category');
        this.filterFiles();
        // Scroll to files table
        root.querySelector('.cloud-recent-section').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Drag and Drop
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('drag-active');
    });

    container.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null || !container.contains(e.relatedTarget)) {
        container.classList.remove('drag-active');
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('drag-active');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.uploadMultipleFiles(files);
      }
    });

    // Preview Close
    root.querySelector('#preview-close').addEventListener('click', () => {
      this.closePreview();
    });

    // Advanced Viewer Toolbar
    root.querySelector('#preview-prev').addEventListener('click', () => this.navigateGallery(-1));
    root.querySelector('#preview-next').addEventListener('click', () => this.navigateGallery(1));
    root.querySelector('#preview-zoom-in').addEventListener('click', () => this.handleManualZoom(1.2));
    root.querySelector('#preview-zoom-out').addEventListener('click', () => this.handleManualZoom(0.8));
    root.querySelector('#preview-reset').addEventListener('click', () => this.resetViewer());
    root.querySelector('#preview-rotate').addEventListener('click', () => this.rotateViewer());
    root.querySelector('#preview-play').addEventListener('click', (e) => this.toggleSlideshow(e.currentTarget));
    root.querySelector('#preview-download-btn').addEventListener('click', () => {
      const mediaFiles = this.getPreviewableFiles();
      const file = mediaFiles[this.viewerState.currentIndex];
      if (file) window.open(`/api/cloud/download/${file.id}`, '_blank');
    });

    // Video Control Listeners
    const video = root.querySelector('#preview-video');
    const playPauseBtn = root.querySelector('#video-play-pause');
    const scrubBar = root.querySelector('#video-scrub-bar');
    const volumeSlider = root.querySelector('#video-volume');
    const speedBtn = root.querySelector('#video-speed');
    const fullscreenBtn = root.querySelector('#video-fullscreen');
    const muteBtn = root.querySelector('#video-mute');
    const overlayPlay = root.querySelector('#video-overlay-play');

    const toggleVideoPlay = async () => {
      try {
        if (!video.src) return;

        if (video.readyState < 2) { // HAVE_CURRENT_DATA or lower
          console.log('Video not ready, queuing play...');
          this.viewerState.pendingPlay = true;
          overlayPlay.classList.add('buffering');
          return;
        }

        if (video.paused) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            await playPromise;
            this.viewerState.pendingPlay = false;
            playPauseBtn.textContent = '⏸';
            overlayPlay.style.opacity = '0';
            overlayPlay.classList.remove('buffering');
          }
        } else {
          video.pause();
          this.viewerState.pendingPlay = false;
          playPauseBtn.textContent = '▶';
          overlayPlay.style.opacity = '1';
        }
      } catch (err) {
        console.error('Playback error:', err);
      }
    };



    playPauseBtn.addEventListener('click', toggleVideoPlay);
    overlayPlay.addEventListener('click', toggleVideoPlay);
    video.addEventListener('click', toggleVideoPlay);

    video.addEventListener('timeupdate', () => {
      const pct = (video.currentTime / video.duration) * 100;
      root.querySelector('#video-progress-fill').style.width = `${pct}%`;
      root.querySelector('#video-scrub-handle').style.left = `${pct}%`;
      root.querySelector('#video-current-time').textContent = this.formatTime(video.currentTime);
    });

    video.addEventListener('loadedmetadata', () => {
      root.querySelector('#video-duration').textContent = this.formatTime(video.duration);
    });

    scrubBar.addEventListener('click', (e) => {
      const rect = scrubBar.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      video.currentTime = pos * video.duration;
    });

    volumeSlider.addEventListener('input', (e) => {
      video.volume = e.target.value;
      muteBtn.textContent = video.volume === 0 ? '🔇' : '🔊';
    });

    muteBtn.addEventListener('click', () => {
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? '🔇' : '🔊';
    });

    speedBtn.addEventListener('click', () => {
      const speeds = [1, 1.5, 2, 0.5];
      let current = speeds.indexOf(video.playbackRate);
      let next = (current + 1) % speeds.length;
      video.playbackRate = speeds[next];
      speedBtn.textContent = speeds[next] + 'x';
    });

    fullscreenBtn.addEventListener('click', () => {
      if (video.requestFullscreen) video.requestFullscreen();
      else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    });

    // Loading/Sync Events
    video.addEventListener('waiting', () => {
      overlayPlay.classList.add('buffering');
    });

    video.addEventListener('playing', () => {
      overlayPlay.classList.remove('buffering');
    });

    video.addEventListener('canplay', () => {
      if (this.viewerState.pendingPlay) {
        toggleVideoPlay();
      }
    });

    video.addEventListener('error', (e) => {
      if (!this.viewerState.active || this.viewerState.type !== 'video') return;

      console.error('Video error:', video.error);
      this.viewerState.pendingPlay = false;
      overlayPlay.classList.remove('buffering');

      
      // Provide user-facing feedback for demuxer errors (only if viewer is active and type is video)
      if (video.error && video.error.code === 4) { 
         alert('Unable to play video. This may be due to an unsupported codec or a network interruption. Please try refreshing or check the file format.');
      }

    });




    // Zoom and Pan Listeners
    const viewerMain = root.querySelector('#preview-main');
    viewerMain.addEventListener('wheel', (e) => this.handleWheelZoom(e), { passive: false });
    viewerMain.addEventListener('mousedown', (e) => this.startViewerDrag(e));
    window.addEventListener('mousemove', (e) => this.doViewerDrag(e));
    window.addEventListener('mouseup', () => this.stopViewerDrag());

    // Touch Listeners
    viewerMain.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    viewerMain.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    viewerMain.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    viewerMain.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));

    // Selection checkboxes
    root.addEventListener('change', (e) => {
      if (e.target.classList.contains('cloud-macos-checkbox')) {
        if (e.target.id === 'cloudSelectAllFiles') {
          const allChecks = root.querySelectorAll('#recent-files-list .cloud-macos-checkbox');
          allChecks.forEach(c => c.checked = e.target.checked);
        }
        this.updateSelectionState();
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.viewerState.active) return;
      if (e.key === 'ArrowRight') this.navigateGallery(1);
      if (e.key === 'ArrowLeft') this.navigateGallery(-1);
      if (e.key === 'Escape') this.closePreview();
      if (e.key === ' ') {
        e.preventDefault();
        this.toggleSlideshow(root.querySelector('#preview-play'));
      }
    });
  }

  async fetchFiles() {
    try {
      const spaceParam = this.currentSpace !== 'all' ? `space=${this.currentSpace}&` : '';
      const url = `/api/cloud?${spaceParam}t=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch files');
      this.files = await response.json();
      this.filterFiles();
      if (!this.stats) {
        this.fetchStats();
      } else {
        this.updateStorageOverview();
        this.updateStorageInfo();
      }
    } catch (error) {
      console.error('Cloud fetch error:', error);
    }
  }

  async fetchStats() {
    try {
      const response = await fetch(`/api/cloud/stats?t=${Date.now()}`);
      if (response.ok) {
        this.stats = await response.json();
        this.updateStorageOverview();
        this.updateStorageInfo();
      }
    } catch (error) {
      console.error('Stats fetch error:', error);
    }
  }

  filterFiles() {
    this.filteredFiles = this.files.filter(file => {
      const matchesSearch = file.original_name.toLowerCase().includes(this.searchQuery);
      let matchesCategory = true;
      
      if (this.currentCategory !== 'all') {
        const mime = file.mime_type.toLowerCase();
        if (this.currentCategory === 'image') matchesCategory = mime.includes('image');
        else if (this.currentCategory === 'video') matchesCategory = mime.includes('video');
        else if (this.currentCategory === 'document') matchesCategory = mime.includes('pdf') || mime.includes('word') || mime.includes('text') || mime.includes('excel') || mime.includes('sheet');
        else if (this.currentCategory === 'others') matchesCategory = !mime.includes('image') && !mime.includes('video') && !mime.includes('pdf') && !mime.includes('word') && !mime.includes('text');
      }
      
      return matchesSearch && matchesCategory;
    });

    this.updateFileList();
  }

  updateFileList() {
    const suggestedGrid = this.contentArea.querySelector('#suggested-grid');
    const recentFilesList = this.contentArea.querySelector('#recent-files-list');
    
    // Update Suggested (last 4 uploaded files)
    const suggestedFiles = [...this.files].sort((a,b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)).slice(0, 4);
    
    if (suggestedFiles.length === 0) {
      suggestedGrid.innerHTML = '<div class="cloud-empty">No suggestions yet</div>';
    } else {
      suggestedGrid.innerHTML = suggestedFiles.map(file => {
        const isNew = !this.previousFileIds.has(file.id);
        const badge = this.getFileTypeBadge(file.mime_type);
        return `
          <div class="cloud-suggested-item ${isNew ? 'cloud-new-item' : ''}" data-id="${file.id}">
            <div class="cloud-thumb-preview">
              ${file.mime_type.includes('image') || (file.mime_type.includes('video')) ? 
                `<img src="/api/cloud/thumbnail/${file.id}" class="cloud-suggested-thumb" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="preview-icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:48px;">${this.getFileIcon(file.mime_type)}</div>` : 
                `<span class="preview-icon">${this.getFileIcon(file.mime_type)}</span>`}
              <div class="cloud-suggested-overlay">
                <button class="cloud-overlay-action preview" title="Quick Look">👁️</button>
                <button class="cloud-overlay-action download" title="Download">📥</button>
              </div>
            </div>
            <div class="cloud-file-info-mini">
              <div class="cloud-mini-meta">
                <span class="cloud-file-badge ${badge.color}">${badge.label}</span>
                <span class="cloud-file-size-mini">${this.formatBytes(file.size)}</span>
              </div>
              <div class="cloud-mini-name-row">
                <div class="cloud-mini-name" title="${file.original_name}">${file.original_name}</div>
                <div class="cloud-mini-more">⋮</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Update Recent Files Table
    if (this.filteredFiles.length === 0) {
      recentFilesList.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="cloud-empty-state-container">
              <div class="cloud-empty-icon">📁</div>
              <h3>No files found</h3>
              <p>Try searching for something else or upload a new file.</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      recentFilesList.innerHTML = this.filteredFiles.map(file => {
        const isNew = !this.previousFileIds.has(file.id);
        const canPreview = file.mime_type.includes('image') || file.mime_type.includes('video');
        const badge = this.getFileTypeBadge(file.mime_type);
        return `
          <tr class="cloud-file-row ${isNew ? 'cloud-new-item' : ''}" data-id="${file.id}">
            <td class="cloud-col-check"><input type="checkbox" class="cloud-macos-checkbox"></td>
            <td class="cloud-col-name">
              <div class="cloud-file-row-name">
                <span class="cloud-file-icon-small">
                  ${canPreview ? 
                    `<img src="/api/cloud/thumbnail/${file.id}" class="cloud-mini-thumb" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                     <span class="mini-icon-fallback" style="display:none;">${this.getFileIcon(file.mime_type)}</span>` : 
                    this.getFileIcon(file.mime_type)}
                </span>
                <div class="cloud-file-details">
                  <span class="cloud-name-text" title="${file.original_name}">${file.original_name}</span>
                  <span class="cloud-sub-text">${badge.label} • ${this.formatBytes(file.size)}</span>
                </div>
              </div>
            </td>

            <td class="cloud-col-size">${this.formatBytes(file.size)}</td>
            <td class="cloud-col-shared">
              <div class="cloud-shared-indicator ${file.space === 'personal' ? 'me' : 'team'}">
                ${file.space === 'personal' ? '<span>👤</span> Me' : '<span>👥</span> Team'}
              </div>
            </td>
            <td class="cloud-col-modified">${this.getRelativeTimeString(file.uploaded_at)}</td>
          </tr>
        `;
      }).join('');
    }

    // Refresh previous IDs for next render
    this.previousFileIds = new Set(this.files.map(f => f.id));

    // Add click listeners
    this.contentArea.querySelectorAll('.cloud-file-row, .cloud-suggested-item').forEach(el => {
      const id = el.getAttribute('data-id');
      const file = this.files.find(f => f.id == id);

      el.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox' || e.target.closest('.cloud-mini-more') || e.target.closest('.cloud-overlay-action')) return;
        this.handleFileInteraction(id, e);
      });

      // Quick Actions in Suggested
      const previewBtn = el.querySelector('.cloud-overlay-action.preview');
      if (previewBtn) {
        previewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleFileInteraction(id, { type: 'click' }); // Trigger preview
        });
      }

      const downloadBtn = el.querySelector('.cloud-overlay-action.download');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(`/api/cloud/download/${file.id}`, '_blank');
        });
      }

      // More button click
      const moreBtn = el.querySelector('.cloud-mini-more');
      if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showMenu(e, file, 'more');
        });
      }

      // Individual row context menu
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showMenu(e, file, 'context');
      });
    });

    this.updateSelectionState();
  }

  updateSelectionState() {
    const checkedBoxes = this.contentArea.querySelectorAll('#recent-files-list .cloud-macos-checkbox:checked');
    const count = checkedBoxes.length;

    const deleteBtn = document.getElementById('cloudHeaderDeleteBtn');
    
    if (deleteBtn) deleteBtn.disabled = count === 0;

    // Update master checkbox
    const masterCheck = this.contentArea.querySelector('#cloudSelectAllFiles');
    const allRows = this.contentArea.querySelectorAll('#recent-files-list .cloud-macos-checkbox');
    if (masterCheck && allRows.length > 0) {
      masterCheck.checked = count === allRows.length;
      masterCheck.indeterminate = count > 0 && count < allRows.length;
    }
  }


  showMenu(e, file, type) {
    // Remove existing menu if any
    const existingMenu = document.querySelector('.cloud-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cloud-context-menu';
    
    // Check for multiple selection
    const checkedBoxes = this.contentArea.querySelectorAll('#recent-files-list .cloud-macos-checkbox:checked');
    const checkedCount = checkedBoxes.length;

    if (checkedCount >= 2) {
      menu.innerHTML = `
        <div class="cloud-menu-item" data-action="download-batch"><span class="cloud-menu-icon">📥</span> Download Selected Items (${checkedCount})</div>
        <div class="cloud-menu-item" data-action="share-batch"><span class="cloud-menu-icon">🔗</span> Share Selected Items (${checkedCount})</div>
        <div class="cloud-menu-divider"></div>
        <div class="cloud-menu-item" data-action="properties"><span class="cloud-menu-icon">ℹ️</span> Properties</div>
        <div class="cloud-menu-divider"></div>
        <div class="cloud-menu-item delete" data-action="delete-batch"><span class="cloud-menu-icon">🗑️</span> Delete Selected Items (${checkedCount})</div>
      `;
    } else {
      menu.innerHTML = `
        <div class="cloud-menu-item" data-action="rename"><span class="cloud-menu-icon">✏️</span> Rename</div>
        <div class="cloud-menu-item" data-action="download"><span class="cloud-menu-icon">📥</span> Download</div>
        <div class="cloud-menu-item" data-action="share"><span class="cloud-menu-icon">🔗</span> Share</div>
        <div class="cloud-menu-divider"></div>
        <div class="cloud-menu-item" data-action="properties"><span class="cloud-menu-icon">ℹ️</span> Properties</div>
        <div class="cloud-menu-divider"></div>
        <div class="cloud-menu-item delete" data-action="delete"><span class="cloud-menu-icon">🗑️</span> Delete</div>
      `;
    }

    document.body.appendChild(menu);

    // Position the menu
    const menuWidth = 180;
    const menuHeight = 220; // Estimated
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');

    // Click outside to close
    const closeMenu = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    document.addEventListener('mousedown', closeMenu);

    // Menu item actions
    menu.querySelectorAll('.cloud-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.getAttribute('data-action');
        this.handleMenuAction(action, file);
        menu.remove();
      });
    });
  }

  async handleMenuAction(action, file) {
    switch (action) {
      case 'rename':
        this.showRenameModal(file);
        break;
      case 'download':
        window.location.href = `/api/cloud/download/${file.id}`;
        break;
      case 'download-batch':
        this.downloadSelectedFiles();
        break;
      case 'share':
        this.handleShare(file);
        break;
      case 'share-batch':
        this.handleBatchShare();
        break;
      case 'properties':
        this.showPropertiesModal(file);
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete ${file.original_name}?`)) {
          this.deleteFile(file.id);
        }
        break;
      case 'delete-batch':
        this.deleteSelectedFiles(); // Existing function for batch delete
        break;
    }
  }

  async deleteFile(id, silent = false) {
    try {
      // Animate out before deleting
      const el = this.contentArea.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.classList.add('cloud-removing');
        await new Promise(r => setTimeout(r, 400));
      }

      const response = await fetch(`/api/cloud/${id}`, { method: 'DELETE' });
      if (response.ok) {
        if (!silent) {
          notifications.show('File Deleted', 'The file has been moved to trash.', { type: 'success' });
        }
        this.fetchFiles();
        this.fetchStats();
        return true;
      } else {
        if (!silent) notifications.show('Delete Failed', 'Could not delete the file.', { type: 'error' });
        return false;
      }
    } catch (error) {
      console.error('Delete error:', error);
      if (!silent) notifications.show('Error', 'An unexpected error occurred during deletion.', { type: 'error' });
      return false;
    }
  }

  showRenameModal(file) {
    const lastDotIndex = file.original_name.lastIndexOf('.');
    const name = lastDotIndex !== -1 ? file.original_name.slice(0, lastDotIndex) : file.original_name;
    const ext = lastDotIndex !== -1 ? file.original_name.slice(lastDotIndex) : '';

    const newFileNameNoExt = prompt('Enter new file name:', name);
    if (newFileNameNoExt && newFileNameNoExt !== name) {
      const fullNewName = newFileNameNoExt + ext;
      this.renameFile(file.id, fullNewName);
    }
  }

  async renameFile(id, newName) {
    try {
      const response = await fetch(`/api/cloud/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, newName })
      });

      if (response.ok) {
        notifications.show('File Renamed', `Successfully renamed to ${newName}`, { type: 'success' });
        await this.fetchFiles();
      } else {
        const text = await response.text();
        console.error('Rename failed server response:', text);
        try {
          const error = JSON.parse(text);
          notifications.show('Rename Failed', error.error || 'Failed to rename file', { type: 'error' });
        } catch(e) {
          notifications.show('Rename Error', 'Failed to rename file (Server Error)', { type: 'error' });
        }
      }
    } catch (error) {
      console.error('Rename fetch error:', error);
      notifications.show('Network Error', 'Could not connect to server for rename.', { type: 'error' });
    }
  }

  handleShare(file) {
    this.showShareModal(file);
  }

  handleBatchShare() {
    const checkedBoxes = this.contentArea.querySelectorAll('#recent-files-list .cloud-macos-checkbox:checked');
    const selectedFiles = Array.from(checkedBoxes).map(cb => {
      const id = cb.closest('.cloud-file-row').getAttribute('data-id');
      return this.files.find(f => f.id == id);
    }).filter(f => f);

    if (selectedFiles.length === 0) return;
    if (selectedFiles.length === 1) {
      this.showShareModal(selectedFiles[0]);
    } else {
      this.showShareModal(selectedFiles, true); // true for batch
    }
  }

  async downloadSelectedFiles() {
    const checkedBoxes = this.contentArea.querySelectorAll('#recent-files-list .cloud-macos-checkbox:checked');
    if (checkedBoxes.length === 0) return;

    notifications.show('Batch Download', `Starting download for ${checkedBoxes.length} files...`, { type: 'info' });

    for (let i = 0; i < checkedBoxes.length; i++) {
      const checkbox = checkedBoxes[i];
      const row = checkbox.closest('tr');
      const id = row.getAttribute('data-id');
      
      // Create a hidden link and click it
      const a = document.createElement('a');
      a.href = `/api/cloud/download/${id}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Slight delay to avoid browser block on multiple downloads
      await new Promise(resolve => setTimeout(resolve, 800));
      document.body.removeChild(a);
    }
  }

  showShareModal(target, isBatch = false) {
    const modal = document.createElement('div');
    modal.className = 'cloud-modal-overlay active';
    
    const title = isBatch ? 'Share Collection' : 'Share Options';
    const subtitle = isBatch 
      ? `Configure sharing for <strong>${target.length} selected files</strong>` 
      : `Configure sharing for <strong>${target.original_name}</strong>`;

    modal.innerHTML = `
      <div class="cloud-modal">
        <div class="cloud-modal-header">
          <h3>${title}</h3>
          <span class="cloud-modal-close">×</span>
        </div>
        <div class="cloud-modal-content">
          <p>${subtitle}</p>
          
          <div class="cloud-share-security-options">
            <h4>Security (Optional)</h4>
            
            <div class="cloud-security-field">
              <label>Password Protection</label>
              <input type="text" id="share-password" placeholder="Enter password or leave blank">
            </div>
            
            <div class="cloud-security-field">
              <label>Link Validity</label>
              <select id="share-expiry">
                <option value="">No Expiration (Infinite)</option>
                <option value="1">1 Hour</option>
                <option value="24">24 Hours (1 Day)</option>
                <option value="168">7 Days (1 Week)</option>
                <option value="720">30 Days (1 month)</option>
              </select>
            </div>

            <div class="cloud-security-field">
              <label>Download Limit</label>
              <input type="number" id="share-limit" placeholder="Max downloads (e.g. 5) or leave for infinite" min="1">
            </div>
          </div>

          <div class="cloud-share-actions">
            <button class="cloud-btn-share-main" id="create-share-link">Create Secure Link</button>
          </div>

          <div id="share-result-container" style="display: none;">
            <div class="cloud-share-link-copy">
              <input type="text" id="final-share-url" readonly>
              <button class="cloud-copy-btn">Copy</button>
            </div>
            <p style="font-size: 11px; color: var(--sd-text-secondary); margin-top: 10px;">Link ready! You can now share it with anyone.</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.cloud-modal-close').onclick = () => modal.remove();
    
    const createBtn = modal.querySelector('#create-share-link');
    createBtn.onclick = async () => {
      const password = modal.querySelector('#share-password').value;
      const expiryHours = modal.querySelector('#share-expiry').value;
      const downloadLimit = modal.querySelector('#share-limit').value;
      
      createBtn.textContent = 'Generating...';
      createBtn.disabled = true;

      try {
        const endpoint = isBatch ? '/api/cloud/batch-share' : `/api/cloud/${target.id}/share`;
        const body = isBatch 
          ? { fileIds: target.map(f => f.id), password, expiryHours, downloadLimit }
          : { password, expiryHours, downloadLimit };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const data = await response.json();
          // Adjusted to handle local vs production URLs
          const shareUrl = `${window.location.host === 'localhost:5173' ? 'http://localhost:3002' : window.location.origin}${data.shareUrl}`;
          
          modal.querySelector('.cloud-share-actions').style.display = 'none';
          modal.querySelector('.cloud-share-security-options').style.opacity = '0.5';
          modal.querySelector('.cloud-share-security-options').style.pointerEvents = 'none';
          
          const resultContainer = modal.querySelector('#share-result-container');
          resultContainer.style.display = 'block';
          modal.querySelector('#final-share-url').value = shareUrl;
        } else {
          alert('Failed to generate link');
          createBtn.textContent = 'Create Secure Link';
          createBtn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        alert('Error generating link');
      }
    };

    modal.querySelector('.cloud-copy-btn').onclick = () => {
      const input = modal.querySelector('#final-share-url');
      input.select();
      document.execCommand('copy');
      modal.querySelector('.cloud-copy-btn').textContent = 'Copied!';
      setTimeout(() => modal.querySelector('.cloud-copy-btn').textContent = 'Copy', 2000);
    };
  }

  showPropertiesModal(file) {
    const modal = document.createElement('div');
    modal.className = 'cloud-modal-overlay active';
    
    // Create the shell once
    modal.innerHTML = `
      <div class="cloud-modal">
        <div class="cloud-modal-header">
          <h3>File Properties</h3>
          <span class="cloud-modal-close">×</span>
        </div>
        <div class="cloud-modal-content properties" id="prop-scroll-container">
          <div class="cloud-prop-featured-thumb" id="prop-thumb" style="flex-shrink: 0;"></div>
          <div class="cloud-prop-item"><span>Name:</span> <strong id="prop-name"></strong></div>
          <div class="cloud-prop-item"><span>Size:</span> <strong id="prop-size"></strong></div>
          <div class="cloud-prop-item"><span>Type:</span> <strong id="prop-type"></strong></div>
          <div class="cloud-prop-item"><span>Space:</span> <strong id="prop-space"></strong></div>
          <div class="cloud-prop-item"><span>Uploaded:</span> <strong id="prop-uploaded"></strong></div>
          <div class="cloud-prop-item"><span>Path:</span> <code id="prop-path"></code></div>
          <div id="prop-sharing-section"></div>
        </div>
      </div>
    `;

    const thumbContainer = modal.querySelector('#prop-thumb');
    const sharingSection = modal.querySelector('#prop-sharing-section');
    let refreshInterval = null;

    // Initial thumbnail render (doesn't need to refresh)
    const mime = (file.mime_type || '').toLowerCase();
    if (mime.includes('image') || mime.includes('video')) {
      thumbContainer.innerHTML = `
        <img src="/api/cloud/thumbnail/${file.id}" style="width: 100%; height: 100%; object-fit: contain; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="prop-icon-fallback" style="display:none; width:100%; height:180px; align-items:center; justify-content:center; font-size:80px;">${this.getFileIcon(file.mime_type)}</div>
      `;
    } else {
      thumbContainer.innerHTML = `<div class="cloud-prop-icon-large">${this.getFileIcon(file.mime_type)}</div>`;
    }


    const updateUI = (f) => {
      try {
        const isExpired = f.share_expires_at && new Date(f.share_expires_at) < new Date();
        
        // Update static fields safely
        const setField = (id, val) => {
          const el = modal.querySelector(id);
          if (el) el.textContent = val;
        };

        setField('#prop-name', f.original_name || 'Unknown');
        setField('#prop-size', this.formatBytes(f.size || 0));
        setField('#prop-type', f.mime_type || 'Unknown');
        setField('#prop-space', f.space || 'Unknown');
        setField('#prop-uploaded', f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : 'N/A');
        
        const pathEl = modal.querySelector('#prop-path');
        if (pathEl) pathEl.textContent = `/${f.path || ''}`;

        // Update Sharing Section
        let sharingHtml = '';

        if (f.share_token && !isExpired) {
          const shareUrl = `${window.location.host === 'localhost:5173' ? 'http://localhost:3002' : window.location.origin}/api/cloud/share/${f.share_token}`;
          sharingHtml += `
            <div style="margin: 15px 0; height: 1px; background: rgba(255,255,255,0.1);"></div>
            <div class="prop-group-title" style="font-size: 11px; text-transform: uppercase; color: var(--sd-orange); margin-bottom: 10px; font-weight: 700;">Sharing Information</div>
            <div class="cloud-prop-item"><span>Share ID:</span> <strong>${f.share_token}</strong></div>
            <div class="cloud-prop-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
              <span>Share URL:</span> 
              <code style="word-break: break-all; width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">${shareUrl}</code>
            </div>
            <div class="cloud-prop-item"><span>Downloads:</span> <strong>${f.share_download_count || 0}${f.share_download_limit ? ' / ' + f.share_download_limit : ' (Unlimited)'}</strong></div>
            ${f.share_expires_at ? `
              <div class="cloud-prop-item"><span>Expires At:</span> <strong>${new Date(f.share_expires_at).toLocaleString()}</strong></div>
              <div class="cloud-prop-item"><span>Time Left:</span> <strong style="color: #34c759;">${this.getTimeRemaining(f.share_expires_at)}</strong></div>
            ` : ''}
            <button class="cloud-revoke-btn" id="btn-revoke-share">
              <span>🚫</span> Disable Share Link
            </button>
          `;
        } else if (f.share_token) {
          sharingHtml += `
            <div style="margin: 15px 0; height: 1px; background: rgba(255,255,255,0.1);"></div>
            <div class="prop-group-title" style="font-size: 11px; text-transform: uppercase; color: #ff3b30; margin-bottom: 10px; font-weight: 700;">Link Expired</div>
            <div class="cloud-prop-item"><span>Status:</span> <strong style="color: #ff3b30;">Expired</strong></div>
            <div class="cloud-prop-item"><span>Final Downloads:</span> <strong>${f.share_download_count || 0}</strong></div>
          `;
        }

        // Add Batch Shares (Collections)
        if (f.batch_shares && f.batch_shares.length > 0) {
          f.batch_shares.forEach((batch, idx) => {
            const batchUrl = `${window.location.host === 'localhost:5173' ? 'http://localhost:3002' : window.location.origin}/api/cloud/share/batch/${batch.token}`;
            const fileListHtml = (batch.files_info || []).map(fi => {
              const isCurrent = fi.id == f.id;
              return `<li style="${isCurrent ? 'color: var(--sd-orange); font-weight: 600;' : ''}">${fi.original_name}</li>`;
            }).join('');

            sharingHtml += `
              <div style="margin: 15px 0; height: 1px; background: rgba(255,255,255,0.1);"></div>
              <div class="prop-group-title" style="font-size: 11px; text-transform: uppercase; color: #0071e3; margin-bottom: 10px; font-weight: 700;">Shared Collection #${idx + 1}</div>
              <div class="cloud-prop-item"><span>Collection ID:</span> <strong>${batch.token}</strong></div>
              <div class="cloud-prop-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                <span>Collection URL:</span> 
                <code style="word-break: break-all; width: 100%; text-align: left; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">${batchUrl}</code>
              </div>
              <div class="cloud-prop-item" style="flex-direction: column; align-items: flex-start; gap: 4px; margin: 10px 0;">
                <span>Files in Collection:</span>
                <ul style="margin: 5px 0 0 15px; padding: 0; font-size: 12px; color: #86868b; text-align: left; width: 100%;">
                  ${fileListHtml}
                </ul>
              </div>
              <div class="cloud-prop-item"><span>Collection Downloads:</span> <strong>${batch.download_count || 0}${batch.download_limit ? ' / ' + batch.download_limit : ' (Unlimited)'}</strong></div>
              ${batch.expires_at ? `
                <div class="cloud-prop-item"><span>Expires At:</span> <strong>${new Date(batch.expires_at).toLocaleString()}</strong></div>
                <div class="cloud-prop-item"><span>Time Left:</span> <strong style="color: #34c759;">${this.getTimeRemaining(batch.expires_at)}</strong></div>
              ` : ''}
              <button class="cloud-revoke-btn secondary" data-batch-token="${batch.token}">
                <span>🚫</span> Deactivate Collection
              </button>
            `;
          });
        }

        sharingSection.innerHTML = sharingHtml;

        // Attach listeners for single share revocation
        const revokeBtn = sharingSection.querySelector('#btn-revoke-share');
        if (revokeBtn) {
          revokeBtn.onclick = async () => {
            if (confirm('Are you sure you want to deactivate this share link?')) {
              await fetch(`/api/cloud/${f.id}/revoke`, { method: 'POST' });
              const latest = await (await fetch(`/api/cloud/${f.id}`)).json();
              updateUI(latest);
              this.fetchFiles();
            }
          };
        }

        // Attach listeners for batch share revocation
        sharingSection.querySelectorAll('.cloud-revoke-btn.secondary').forEach(btn => {
          btn.onclick = async () => {
            const token = btn.getAttribute('data-batch-token');
            if (confirm('Are you sure you want to deactivate this entire collection sharing link? This will affect all files in this collection.')) {
              await fetch(`/api/cloud/share/batch/${token}/revoke`, { method: 'POST' });
              const latest = await (await fetch(`/api/cloud/${f.id}`)).json();
              updateUI(latest);
              this.fetchFiles();
            }
          };
        });
      } catch (err) {
        console.error('Update UI Logic Error:', err);
      }
    };

    // Close button
    modal.querySelector('.cloud-modal-close').onclick = () => {
      clearInterval(refreshInterval);
      modal.remove();
    };

    updateUI(file);
    document.body.appendChild(modal);

    // Initial fetch to sync
    fetch(`/api/cloud/${file.id}`).then(r => r.json()).then(latest => updateUI(latest));

    // Polling interval
    refreshInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/cloud/${file.id}`);
        if (response.ok) {
          const latest = await response.json();
          updateUI(latest);
        }
      } catch (err) {
        console.warn('Real-time properties update failed', err);
      }
    }, 3000);
  }

  updateStorageOverview() {
    if (!this.stats) return;

    const categories = this.stats.categories;
    const limit = this.stats.total;

    Object.keys(categories).forEach(cat => {
      const data = categories[cat];
      const countEl = this.contentArea.querySelector(`#count-${cat}`);
      const fillEl = this.contentArea.querySelector(`#fill-${cat}`);
      const usageEl = this.contentArea.querySelector(`#usage-${cat}`);

      if (countEl) countEl.textContent = `${data.count} items`;
      if (usageEl) usageEl.textContent = `${this.formatBytes(data.size)} of ${this.formatBytes(limit)}`;
      if (fillEl) {
        const pct = Math.min(100, Math.max(2, (data.size / limit) * 100));
        fillEl.style.width = `${pct}%`;
      }
    });
  }

  handleFileInteraction(id, event) {
    const file = this.files.find(f => f.id == id);
    if (!file) return;

    const previewableFiles = this.getPreviewableFiles();
    const index = previewableFiles.findIndex(f => f.id == id);

    if (index !== -1) {
      this.showPreview(index);
    } else {
      this.showFileActions(file);
    }
  }

  getPreviewableFiles() {
    return this.filteredFiles.filter(f => f.mime_type.includes('image') || f.mime_type.includes('video'));
  }

  showPreview(index) {
    const mediaFiles = this.getPreviewableFiles();
    if (index < 0 || index >= mediaFiles.length) return;

    const file = mediaFiles[index];
    const modal = this.contentArea.querySelector('#preview-modal');
    const imgCont = this.contentArea.querySelector('#preview-image-container');
    const videoCont = this.contentArea.querySelector('#preview-video-container');
    const img = this.contentArea.querySelector('#preview-img');
    const video = this.contentArea.querySelector('#preview-video');
    const filename = this.contentArea.querySelector('#preview-filename');
    const meta = this.contentArea.querySelector('#preview-meta');
    const videoBar = this.contentArea.querySelector('#video-controls-bar');
    const imageTools = this.contentArea.querySelectorAll('.cloud-image-only-tools');

    this.viewerState.active = true;
    this.viewerState.currentIndex = index;
    this.viewerState.type = file.mime_type.includes('video') ? 'video' : 'image';
    
    filename.textContent = file.original_name;
    meta.textContent = `${this.formatBytes(file.size)} • ${file.mime_type}`;

    // Update visibility and tools immediately based on type
    if (this.viewerState.type === 'video') {
      imgCont.style.display = 'none';
      videoCont.style.display = 'flex';
      videoBar.style.display = 'flex';
      imageTools.forEach(el => el.style.display = 'none');
      
      // Reset video
      this.viewerState.pendingPlay = false;
      video.pause();
      
      const t = Date.now();
      video.src = `/api/cloud/download/${file.id}?t=${t}`;
      video.load();

      this.contentArea.querySelector('#video-play-pause').textContent = '▶';
      this.contentArea.querySelector('#video-overlay-play').style.opacity = '1';
      this.contentArea.querySelector('#video-overlay-play').classList.remove('buffering');
    } else {
      imgCont.style.display = 'flex';
      videoCont.style.display = 'none';
      videoBar.style.display = 'none';
      imageTools.forEach(el => el.style.display = 'flex');
      
      // Stop and clear video quietly if we're switching to an image
      video.pause();
      video.src = '';
      this.viewerState.pendingPlay = false;
      
      const t = Date.now();
      img.src = `/api/cloud/download/${file.id}?t=${t}`;
    }

    modal.classList.add('active');
    this.resetViewer();
  }


  closePreview() {
    this.viewerState.active = false;
    this.contentArea.querySelector('#preview-modal').classList.remove('active');
    
    // Stop video
    const video = this.contentArea.querySelector('#preview-video');
    video.pause();
    video.src = '';

    if (this.viewerState.slideshowInterval) {
      clearInterval(this.viewerState.slideshowInterval);
      this.viewerState.slideshowInterval = null;
      this.contentArea.querySelector('#preview-play').textContent = '▶';
    }
  }

  navigateGallery(dir) {
    const mediaFiles = this.getPreviewableFiles();
    let newIndex = this.viewerState.currentIndex + dir;
    
    if (newIndex < 0) newIndex = mediaFiles.length - 1;
    if (newIndex >= mediaFiles.length) newIndex = 0;

    this.showPreview(newIndex);
  }


  /* Viewer Logic */
  resetViewer() {
    this.viewerState.scale = 1;
    this.viewerState.x = 0;
    this.viewerState.y = 0;
    this.viewerState.rotation = 0;
    this.updateViewerTransform();
  }

  updateViewerTransform() {
    const container = this.contentArea.querySelector('#preview-image-container');
    container.style.transform = `translate(${this.viewerState.x}px, ${this.viewerState.y}px) scale(${this.viewerState.scale})`;
    const img = this.contentArea.querySelector('#preview-img');
    img.style.transform = `rotate(${this.viewerState.rotation}deg)`;
  }

  rotateViewer() {
    this.viewerState.rotation = (this.viewerState.rotation + 90) % 360;
    this.updateViewerTransform();
  }

  handleManualZoom(factor) {
    const newScale = this.viewerState.scale * factor;
    this.viewerState.scale = Math.min(Math.max(newScale, 0.1), 10);
    this.updateViewerTransform();
  }

  handleWheelZoom(e) {
    if (!this.viewerState.active) return;
    e.preventDefault();

    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    
    const newScale = this.viewerState.scale * factor;
    if (newScale < 0.1 || newScale > 10) return;

    // Zoom at cursor logic
    const rect = this.contentArea.querySelector('#preview-main').getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    this.viewerState.x -= mouseX * (factor - 1);
    this.viewerState.y -= mouseY * (factor - 1);
    this.viewerState.scale = newScale;

    this.updateViewerTransform();
  }

  startViewerDrag(e) {
    if (!this.viewerState.active) return;
    this.viewerState.isDragging = true;
    this.viewerState.startX = e.clientX - this.viewerState.x;
    this.viewerState.startY = e.clientY - this.viewerState.y;
  }

  doViewerDrag(e) {
    if (!this.viewerState.isDragging) return;
    this.viewerState.x = e.clientX - this.viewerState.startX;
    this.viewerState.y = e.clientY - this.viewerState.startY;
    this.updateViewerTransform();
  }

  stopViewerDrag() {
    this.viewerState.isDragging = false;
  }

  handleTouchStart(e) {
    if (!this.viewerState.active) return;
    
    const touches = e.touches;
    this.viewerState.touches = Array.from(touches);

    if (touches.length === 1) {
      // Single finger pan
      this.viewerState.isDragging = true;
      this.viewerState.startX = touches[0].clientX - this.viewerState.x;
      this.viewerState.startY = touches[0].clientY - this.viewerState.y;
    } else if (touches.length === 2) {
      // Two finger pinch
      this.viewerState.isDragging = false; // Disable single-finger drag
      this.viewerState.initialDistance = this.getDistance(touches[0], touches[1]);
      this.viewerState.initialScale = this.viewerState.scale;
      this.viewerState.lastMidpoint = this.getMidpoint(touches[0], touches[1]);
    }
  }

  handleTouchMove(e) {
    if (!this.viewerState.active) return;
    e.preventDefault(); // Prevent scrolling

    const touches = e.touches;

    if (touches.length === 1 && this.viewerState.isDragging) {
      // Panning
      this.viewerState.x = touches[0].clientX - this.viewerState.startX;
      this.viewerState.y = touches[0].clientY - this.viewerState.startY;
      this.updateViewerTransform();
    } else if (touches.length === 2) {
      // Pinch to zoom
      const currentDistance = this.getDistance(touches[0], touches[1]);
      const currentMidpoint = this.getMidpoint(touches[0], touches[1]);
      
      const factor = currentDistance / this.viewerState.initialDistance;
      let newScale = this.viewerState.initialScale * factor;
      
      // Limit scale
      newScale = Math.min(Math.max(newScale, 0.1), 10);
      
      // Zoom at midpoint logic
      const rect = this.contentArea.querySelector('#preview-main').getBoundingClientRect();
      const midX = currentMidpoint.x - rect.left - rect.width / 2;
      const midY = currentMidpoint.y - rect.top - rect.height / 2;

      // Handle scale change
      const scaleRatio = newScale / this.viewerState.scale;
      this.viewerState.x -= midX * (scaleRatio - 1);
      this.viewerState.y -= midY * (scaleRatio - 1);
      
      // Handle midpoint movement (panning)
      if (this.viewerState.lastMidpoint) {
        this.viewerState.x += (currentMidpoint.x - this.viewerState.lastMidpoint.x);
        this.viewerState.y += (currentMidpoint.y - this.viewerState.lastMidpoint.y);
      }

      this.viewerState.scale = newScale;
      this.viewerState.lastMidpoint = currentMidpoint;
      this.updateViewerTransform();
    }
  }

  handleTouchEnd(e) {
    this.viewerState.isDragging = false;
    this.viewerState.touches = Array.from(e.touches);
    this.viewerState.lastMidpoint = null;

    if (e.touches.length === 1) {
      // Reset drag for the remaining finger
      this.viewerState.isDragging = true;
      this.viewerState.startX = e.touches[0].clientX - this.viewerState.x;
      this.viewerState.startY = e.touches[0].clientY - this.viewerState.y;
    }
  }

  getDistance(t1, t2) {
    return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
  }

  getMidpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  toggleSlideshow(btn) {
    if (this.viewerState.slideshowInterval) {
      clearInterval(this.viewerState.slideshowInterval);
      this.viewerState.slideshowInterval = null;
      btn.textContent = '▶';
    } else {
      btn.textContent = '⏸';
      this.viewerState.slideshowInterval = setInterval(() => {
        this.navigateGallery(1);
      }, 3000);
    }
  }

  getFileIcon(mime) {
    if (!mime) return '📄';
    const m = mime.toLowerCase();
    if (m.includes('image')) return '🖼️';
    if (m.includes('pdf')) return '📕';
    if (m.includes('video')) return '🎬';
    if (m.includes('audio')) return '🎶';
    if (m.includes('zip') || m.includes('compressed')) return '📦';
    if (m.includes('text') || m.includes('word')) return '📝';
    if (m.includes('excel') || m.includes('sheet')) return '📊';
    return '📄';
  }

  formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  handleFileUpload(event) {
    const files = event.target.files;
    if (files.length > 0) {
      this.uploadMultipleFiles(files);
    }
    event.target.value = '';
  }

  async uploadMultipleFiles(files) {
    for (const file of files) {
      await this.uploadFile(file);
    }
  }

  uploadFile(file) {
    return new Promise((resolve) => {
      if (this.isUploading) return resolve();
      this.isUploading = true;

      const toastId = notifications.show('Uploading File', file.name, { 
        type: 'upload', 
        progress: 0, 
        duration: 0 
      });

      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('space', this.currentSpace === 'all' ? 'personal' : this.currentSpace);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          notifications.update(toastId, { 
            message: `${file.name} (${percent}%)`, 
            progress: percent 
          });
        }
      });

      xhr.addEventListener('load', () => {
        this.isUploading = false;
        if (xhr.status === 201 || xhr.status === 200) {
          notifications.update(toastId, { 
            title: 'Upload Complete',
            message: `${file.name} uploaded successfully.`,
            type: 'success',
            progress: 100
          });
          setTimeout(() => notifications.hide(toastId), 3000);
          
          this.fetchFiles();
          this.fetchStats();
          resolve(true);
        } else {
          notifications.update(toastId, { 
            title: 'Upload Failed',
            message: `Could not upload ${file.name}`,
            type: 'error',
            progress: null
          });
          setTimeout(() => notifications.hide(toastId), 5000);
          resolve(false);
        }
      });

      xhr.addEventListener('error', () => {
        this.isUploading = false;
        notifications.update(toastId, { 
          title: 'Network Error',
          message: `Upload interupted for ${file.name}`,
          type: 'error',
          progress: null
        });
        setTimeout(() => notifications.hide(toastId), 5000);
        resolve(false);
      });

      xhr.open('POST', '/api/cloud/upload');
      xhr.send(formData);
    });
  }

  showFileActions(file) {
    const action = confirm(`File: ${file.original_name}\n\n[OK] to Download\n[Cancel] to Delete`);
    if (action) {
      window.open(`/api/cloud/download/${file.id}`, '_blank');
    } else {
      if (confirm('Move to trash? This cannot be undone.')) {
        this.deleteFile(file.id);
      }
    }
  }


  updateStorageInfo() {
    if (!this.stats) return;
    
    const pct = Math.min(100, Math.max(1, (this.stats.used / this.stats.total) * 100)).toFixed(1);
    
    const pctText = this.contentArea.querySelector('#storage-pct');
    const usedText = this.contentArea.querySelector('#storage-used-txt');
    const fillBar = this.contentArea.querySelector('#storage-fill-bar');
    
    if (pctText) pctText.textContent = `${pct}%`;
    if (usedText) usedText.textContent = `${this.formatBytes(this.stats.used)} of ${this.formatBytes(this.stats.total)}`;
    if (fillBar) fillBar.style.width = `${pct}%`;
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  getTimeRemaining(expiresAt) {

    if (!expiresAt) return 'Unlimited';
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 24) return `${Math.floor(hours/24)} days`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  getRelativeTimeString(date) {
    const now = new Date();
    const then = new Date(date);
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return then.toLocaleDateString();
  }

  getFileTypeBadge(mime) {
    if (!mime) return { label: 'FILE', color: 'gray' };
    const m = mime.toLowerCase();
    if (m.includes('image')) return { label: 'IMAGE', color: 'cloud-color-red' };
    if (m.includes('pdf')) return { label: 'PDF', color: 'cloud-color-red' };
    if (m.includes('video')) return { label: 'VIDEO', color: 'cloud-color-blue' };
    if (m.includes('audio')) return { label: 'AUDIO', color: 'cloud-color-pink' };
    if (m.includes('zip') || m.includes('compressed')) return { label: 'ZIP', color: 'cloud-color-yellow' };
    if (m.includes('text') || m.includes('word')) return { label: 'DOC', color: 'cloud-color-green' };
    if (m.includes('excel') || m.includes('sheet')) return { label: 'SHEET', color: 'cloud-color-green' };
    return { label: 'FILE', color: 'cloud-color-gray' };
  }
}

window.CloudApp = CloudApp;
export default CloudApp;
