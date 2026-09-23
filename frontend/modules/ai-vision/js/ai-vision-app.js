const AI_VISION_HTML_TEMPLATE = `
<div class="ai-vision-app">
  
  <!-- Static Desktop Sidebar -->
  <nav class="ai-vision-sidebar" id="aiVisionSidebar">
    <div class="sidebar-header">
      <div class="sidebar-icon">📷</div>
      <h3>AI Vision Manager</h3>
    </div>
    <div class="ai-vision-tab active" data-tab="scan">
      <span class="tab-icon">🔍</span> 
      <span class="tab-label">Camera Scan</span>
    </div>
    <div class="ai-vision-tab" data-tab="profiles">
      <span class="tab-icon">📚</span> 
      <span class="tab-label">Knowledge Base</span>
    </div>
    <div class="ai-vision-tab" data-tab="teach">
      <span class="tab-icon">🎓</span> 
      <span class="tab-label">Teach AI</span>
    </div>
  </nav>

  <!-- Main Content Area -->
  <div class="ai-vision-content">
    
    <!-- Camera View (Scan Pane) -->
    <div class="ai-vision-pane active" id="pane-scan">
      <div class="ai-scanner-container" id="aiScannerContainer">
        
        <!-- Video Feed -->
        <video id="aiCameraFeed" class="ai-camera-feed" autoplay playsinline muted></video>

        <!-- Siri/Gemini Glow Overlay -->
        <div class="ai-glow-border" id="aiGlowBorder"></div>

        <!-- Top Bar with Gradient -->
        <div class="ai-top-bar">
          <div class="ai-top-bar-text" id="aiScanCounter">SCANS: 0</div>
        </div>

        <!-- Scanning matrix animation -->
        <div class="ai-scan-matrix-overlay" id="aiScanMatrixOverlay"></div>
        
        <!-- Sweeping laser line -->
        <div class="ai-scanner-sweeper" id="aiScannerSweeper"></div>

        <!-- Result Overlay -->
        <div class="ai-result-overlay" id="aiResultOverlay">
          <div class="ai-result-close" id="aiResultCloseBtn">✕</div>
          <div class="ai-result-header">
            <i class="fas fa-check-circle"></i> Scan Complete
          </div>
          <div id="aiScanResultsContent" class="ai-scan-results-content">
            <!-- Results rendered here -->
          </div>
        </div>

        <!-- Right Side Controls (Capsule + Shutter) -->
        <div class="ai-right-controls">
          <!-- Capsule Controls -->
          <div class="ai-capsule-controls">
            <button class="ai-capsule-btn" id="aiBtnZoom" title="Toggle Zoom">
              <span class="zoom-text">1x</span>
            </button>
            <button class="ai-capsule-btn" id="aiBtnGallery" title="Upload from Gallery">
              <span>🖼️</span>
            </button>
            <button class="ai-capsule-btn" id="aiBtnFlashlight" title="Toggle Flashlight">
              <span>🔦</span>
            </button>
            <input type="file" id="aiGalleryInput" accept="image/*" style="display:none;">
          </div>

          <!-- Squircle Shutter Button -->
          <div class="ai-scan-trigger-wrapper">
            <button class="ai-scan-trigger" id="aiScanTriggerBtn" title="Tap to Scan">
              <span class="ai-scan-trigger-text">SCAN</span>
            </button>
          </div>
        </div>

        <!-- Bottom Sheet for Recent Scans -->
        <div class="ai-bottom-sheet" id="aiBottomSheet">
          <div class="ai-bottom-sheet-handle-wrap" id="aiBottomSheetHandle">
            <div class="ai-bottom-sheet-handle"></div>
          </div>
          <div class="ai-bottom-sheet-content">
            <h3 class="ai-sheet-title" style="display: none;">Recent Scans</h3>
            <div class="ai-sheet-empty" id="aiRecentScansEmpty">No recent scans.</div>
            <div id="aiRecentScansList" class="ai-recent-scans-list">
              <!-- Dynamically added recent scans -->
            </div>
          </div>
        </div>

      </div>
    </div> <!-- End Scan Pane -->

    <!-- Profiles Pane -->
    <div class="ai-vision-pane" id="pane-profiles">
      <div class="ai-pane-header">
        <h2>Knowledge Base</h2>
        <p>These are the packaging designs and labels the AI has learned.</p>
      </div>
      <div class="ai-padded-content">
        <div class="ai-profiles-grid" id="aiProfilesGrid">
          <!-- Profiles rendered here dynamically -->
        </div>
      </div>
    </div>

    <!-- Teach Pane -->
    <div class="ai-vision-pane" id="pane-teach">
      <div class="ai-pane-header">
        <h2>Teach New Label</h2>
        <p>Upload or capture an image to train the AI model.</p>
      </div>
      <div class="ai-padded-content">
        <div class="ai-teach-container">
          <div class="ai-form-group">
            <label>Product Name (Search)</label>
            <input type="text" id="aiTeachProduct" list="aiTeachProductsList" placeholder="Search product catalogue..." autocomplete="off">
            <datalist id="aiTeachProductsList"></datalist>
          </div>

          <div class="ai-form-group">
            <label>Upload Image (or use Camera)</label>
            <input type="file" id="aiTeachImageInput" accept="image/*" capture="environment">
          </div>

          <div class="ai-preview-box" id="aiTeachPreviewBox">
            <span class="placeholder-text">Image Preview</span>
          </div>

          <div class="ai-form-group">
            <label>Custom Label Notes (Optional)</label>
            <input type="text" id="aiTeachNotes" placeholder="e.g. New 2026 Packaging Design">
          </div>

          <button class="ai-btn-primary" id="aiTeachSubmitBtn">SAVE TO KNOWLEDGE BASE</button>
          <div id="aiTeachStatus" class="ai-teach-status"></div>
        </div>
      </div>
    </div>

  </div>
</div>
`;

/**
 * AI Vision App - The macOS style windowed app for managing the AI Knowledge Base
 */
class AIVisionApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const userOnClose = callbacks.onClose;
    super({
      appId: 'ai-vision',
      appName: 'AI Vision Manager',
      containerId: containerId,
      preset: 'standard',
      icon: '/assets/Images/Siri_app.png',
      ...callbacks,
      onClose: () => {
        if (typeof this.stopCamera === 'function') this.stopCamera();
        if (userOnClose) userOnClose();
      }
    });

    this.profiles = [];
    this.products = []; // Cached catalog for teaching
    
    // Scanner state
    this.stream = null;
    this.track = null;
    this.torchOn = false;
    this.isScanning = false;
    this.zoomLevels = [1, 3, 5];
    this.currentZoomIndex = 0;
    
    window.currentAIVisionApp = this;
    window.currentAiVisionApp = this;
    this.initAIVisionContent();
  }

  initAIVisionContent() {
    this.setContent(AI_VISION_HTML_TEMPLATE);
    this.bindEvents();
    this.fetchProductsCatalog();
    this.loadProfiles();
    this.startCamera();
  }

  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Sidebar Toggle (Inject into app-title-bar)
    const sidebar = container.querySelector('#aiVisionSidebar');
    const titleBar = container.querySelector('.app-title-bar');
    
    if (titleBar && sidebar && !titleBar.querySelector('#aiSidebarExpandBtn')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'ai-header-btn';
      toggleBtn.id = 'aiSidebarExpandBtn';
      toggleBtn.title = 'Show/Hide Sidebar';
      toggleBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
          <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
          <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
          <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
        </svg>`;
      
      const trafficLights = titleBar.querySelector('.app-traffic-lights');
      if (trafficLights) {
        trafficLights.insertAdjacentElement('afterend', toggleBtn);
      } else {
        titleBar.prepend(toggleBtn);
      }
      
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
      
      // Auto-collapse on small screens
      if (window.innerWidth < 800) {
        sidebar.classList.add('collapsed');
      }
    }

    // Sidebar Navigation Tabs
    const tabs = container.querySelectorAll('.ai-vision-tab');
    const panes = container.querySelectorAll('.ai-vision-pane');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const targetPane = container.querySelector(`#pane-${tab.dataset.tab}`);
        if (targetPane) targetPane.classList.add('active');
        
        // Manage camera state
        if (tab.dataset.tab === 'scan') {
          this.startCamera();
        } else {
          this.stopCamera();
        }
      });
    });

    this.bindScannerEvents(container);
    this.bindTeachEvents(container);
    this.bindBottomSheetEvents(container);
  }

  bindBottomSheetEvents(container) {
    const sheet = container.querySelector('#aiBottomSheet');
    const handle = container.querySelector('#aiBottomSheetHandle');
    
    if (!sheet || !handle) return;

    // Click to toggle
    handle.addEventListener('click', () => {
      sheet.classList.toggle('expanded');
    });

    // Basic drag/touch to toggle logic
    let startY = 0;
    let isDragging = false;

    const handleStart = (e) => {
      startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      isDragging = true;
    };

    const handleMove = (e) => {
      if (!isDragging) return;
      const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY;
      
      // If dragging up significantly
      if (deltaY < -30 && !sheet.classList.contains('expanded')) {
        sheet.classList.add('expanded');
        isDragging = false;
      }
      // If dragging down significantly
      else if (deltaY > 30 && sheet.classList.contains('expanded')) {
        sheet.classList.remove('expanded');
        isDragging = false;
      }
    };

    const handleEnd = () => {
      isDragging = false;
    };

    handle.addEventListener('mousedown', handleStart);
    handle.addEventListener('touchstart', handleStart, {passive: true});
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, {passive: true});
    
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
  }

  bindScannerEvents(container) {
    const video = container.querySelector('#aiCameraFeed');
    const focusBox = container.querySelector('#aiFocusBox');
    const btnFlashlight = container.querySelector('#aiBtnFlashlight');
    const btnZoom = container.querySelector('#aiBtnZoom');
    const btnGallery = container.querySelector('#aiBtnGallery');
    const galleryInput = container.querySelector('#aiGalleryInput');
    const btnScan = container.querySelector('#aiScanTriggerBtn');
    
    const resultOverlay = container.querySelector('#aiResultOverlay');
    const resultCloseBtn = container.querySelector('#aiResultCloseBtn');
    const glowBorder = container.querySelector('#aiGlowBorder');

    // Wheel / Touch Pinch Dynamic Zoom
    if (video) {
      video.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.005;
        this.applyDynamicZoom(delta);
      }, { passive: false });

      let initialPinchDistance = null;
      video.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          initialPinchDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
        }
      }, { passive: true });

      video.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
          const currentDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
          const diff = (currentDistance - initialPinchDistance) / 100;
          if (Math.abs(diff) > 0.1) {
            this.applyDynamicZoom(diff > 0 ? 0.1 : -0.1);
            initialPinchDistance = currentDistance;
          }
        }
      }, { passive: true });

      video.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
          initialPinchDistance = null;
        }
      });
    }

    // Flashlight Toggle with Indicator
    if (btnFlashlight) {
      btnFlashlight.addEventListener('click', async () => {
        this.torchOn = !this.torchOn;
        btnFlashlight.classList.toggle('active', this.torchOn);

        if (this.track) {
          try {
            const capabilities = this.track.getCapabilities();
            if (capabilities.torch) {
              await this.track.applyConstraints({
                advanced: [{ torch: this.torchOn }]
              });
            }
          } catch (err) {
            console.warn('Torch constraint error:', err);
          }
        }
      });
    }

    // Zoom Toggle
    if (btnZoom) {
      btnZoom.addEventListener('click', async () => {
        this.currentZoomIndex = (this.currentZoomIndex + 1) % this.zoomLevels.length;
        const zoomValue = this.zoomLevels[this.currentZoomIndex];
        const zoomTextSpan = btnZoom.querySelector('.zoom-text');
        
        if (zoomTextSpan) {
          zoomTextSpan.innerText = `${zoomValue}x`;
        }
        
        btnZoom.classList.toggle('active', zoomValue > 1);

        if (!this.track) {
          if (video) video.style.transform = `scale(${zoomValue})`;
          return;
        }

        try {
          const capabilities = this.track.getCapabilities();
          if (capabilities.zoom) {
            const actualZoom = Math.min(Math.max(zoomValue, capabilities.zoom.min), capabilities.zoom.max);
            await this.track.applyConstraints({
              advanced: [{ zoom: actualZoom }]
            });
          } else {
            if (video) video.style.transform = `scale(${zoomValue})`;
          }
        } catch (err) {
          if (video) video.style.transform = `scale(${zoomValue})`;
        }
      });
    }

    // Gallery fallback
    if (btnGallery && galleryInput) {
      btnGallery.addEventListener('click', () => galleryInput.click());
      galleryInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          console.log('Gallery image selected:', e.target.files[0].name);
          this.triggerScanSequence(container, true);
        }
      });
    }

    // Scan Trigger
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        if (this.isScanning) return;
        
        // Trigger Siri/Gemini glow animation
        if (glowBorder) glowBorder.classList.add('active');
        
        this.triggerScanSequence(container, false).finally(() => {
           if (glowBorder) glowBorder.classList.remove('active');
        });
      });
    }

    if (resultCloseBtn) {
      resultCloseBtn.addEventListener('click', () => {
        resultOverlay.classList.remove('active');
        if (video) video.classList.remove('blur');
      });
    }
  }

  async applyDynamicZoom(delta) {
    const container = document.getElementById(this.containerId);
    const video = container ? container.querySelector('#aiCameraFeed') : document.querySelector('#aiCameraFeed');
    const btnZoom = container ? container.querySelector('#aiBtnZoom') : document.querySelector('#aiBtnZoom');
    
    this.currentZoomScale = Math.min(Math.max((this.currentZoomScale || 1) + delta, 1), 5);
    
    if (btnZoom) {
      const zoomTextSpan = btnZoom.querySelector('.zoom-text');
      if (zoomTextSpan) zoomTextSpan.innerText = `${this.currentZoomScale.toFixed(1)}x`;
      btnZoom.classList.toggle('active', this.currentZoomScale > 1);
    }

    if (!this.track) {
      if (video) video.style.transform = `scale(${this.currentZoomScale})`;
      return;
    }

    try {
      const capabilities = this.track.getCapabilities();
      if (capabilities.zoom) {
        const actualZoom = Math.min(Math.max(this.currentZoomScale, capabilities.zoom.min), capabilities.zoom.max);
        await this.track.applyConstraints({ advanced: [{ zoom: actualZoom }] });
      } else if (video) {
        video.style.transform = `scale(${this.currentZoomScale})`;
      }
    } catch (err) {
      if (video) video.style.transform = `scale(${this.currentZoomScale})`;
    }
  }

  async triggerScanSequence(container, isGallery) {
    this.isScanning = true;
    const video = container.querySelector('#aiCameraFeed');
    const matrixOverlay = container.querySelector('#aiScanMatrixOverlay');
    const sweeper = container.querySelector('#aiScannerSweeper');
    const resultOverlay = container.querySelector('#aiResultOverlay');
    const resultsContent = container.querySelector('#aiScanResultsContent');

    // Start Animations
    if (video) video.classList.add('blur');
    matrixOverlay.classList.add('active');
    sweeper.classList.add('active');
    matrixOverlay.innerHTML = ''; // clear

    // Generate Matrix Lines
    const lines = [
      "INITIALIZING VISION NEURAL NET...",
      "CAPTURING HIGH-RES FRAME...",
      "EXTRACTING TEXT (OCR) [■■■■■■■■■ ] 90%",
      "IDENTIFYING PRODUCT PACKAGING...",
      "CROSS-REFERENCING KNOWLEDGE BASE...",
      "MATCH CONFIDENCE: 98.5%",
      "SUCCESS."
    ];

    for (let i = 0; i < lines.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      const el = document.createElement('div');
      el.className = 'ai-scan-line';
      el.textContent = `> ${lines[i]}`;
      matrixOverlay.appendChild(el);
    }

    // Mock Backend processing delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Transition to result
    matrixOverlay.classList.remove('active');
    sweeper.classList.remove('active');
    
    // Test output
    resultsContent.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <strong style="color: #10b981; font-size: 16px;">Product Matched</strong><br>
        <span style="font-size: 24px; font-weight: bold; margin-top: 8px; display: block;">Organic Apple Juice 1L</span>
      </div>
      <div><strong>MRP:</strong> 150.00</div>
      <div><strong>Batch:</strong> B2910-X</div>
      <div><strong>Expiry:</strong> Dec 2026</div>
      <div style="margin-top: 24px; color: var(--ai-text-muted); font-size: 12px;">This is a test scan result within the App Manager. To use AI data extraction, use the global AIVisionService overlay in the Billing App.</div>
    `;

    resultOverlay.classList.add('active');
    this.isScanning = false;
    
    // Update counter
    this.scanCount = (this.scanCount || 0) + 1;
    const counter = container.querySelector('#aiScanCounter');
    if (counter) counter.innerText = `SCANS: ${this.scanCount}`;
    
    // Add to recent scans
    const recentList = container.querySelector('#aiRecentScansList');
    const emptyMsg = container.querySelector('#aiRecentScansEmpty');
    if (recentList) {
        if (emptyMsg) emptyMsg.style.display = 'none';
        const item = document.createElement('div');
        item.className = 'ai-recent-scan-item';
        // Random thumbnail for visual effect
        const thumbUrl = 'https://picsum.photos/100/100?random=' + Math.random();
        item.style.backgroundImage = `url('${thumbUrl}')`;
        item.innerHTML = `
            <img src="${thumbUrl}" alt="Scan Thumbnail">
            <div class="ai-recent-scan-details">
                <strong>${isGallery ? 'Gallery Image' : 'Live Scan'}</strong>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
        `;
        recentList.prepend(item);
    }
  }

  async startCamera() {
    if (this.windowState === 'closed') return;
    const video = document.getElementById('aiCameraFeed');
    if (!video) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      if (this.windowState === 'closed') {
        this.stopCamera();
        return;
      }
      video.srcObject = this.stream;
      this.track = this.stream.getVideoTracks()[0];
    } catch (err) {
      console.error('Camera access denied or unavailable', err);
      // Fallback styling for no camera
      video.style.background = '#111';
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.track = null;
    }
  }

  bindTeachEvents(container) {
    // Teach Image Preview
    const imageInput = container.querySelector('#aiTeachImageInput');
    const previewBox = container.querySelector('#aiTeachPreviewBox');
    let currentBase64 = null;

    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          currentBase64 = event.target.result;
          previewBox.innerHTML = `<img src="${currentBase64}" />`;
        };
        reader.readAsDataURL(file);
      });
    }

    // Submit Teaching
    const submitBtn = container.querySelector('#aiTeachSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const productInput = container.querySelector('#aiTeachProduct');
        const notesInput = container.querySelector('#aiTeachNotes');
        const statusDiv = container.querySelector('#aiTeachStatus');
        
        if (!productInput.value || !currentBase64) {
          statusDiv.style.color = 'var(--ai-delete-text)';
          statusDiv.innerText = 'Product name and image are required.';
          return;
        }

        // Find product ID from name
        const product = this.products.find(p => p.name.toLowerCase() === productInput.value.toLowerCase());
        if (!product) {
          statusDiv.style.color = 'var(--ai-delete-text)';
          statusDiv.innerText = 'Invalid product selected from catalog.';
          return;
        }

        submitBtn.innerHTML = 'SAVING...';
        submitBtn.disabled = true;

        try {
          const res = await fetch('/api/ai/vision/learn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.id,
              image: currentBase64,
              labelTitle: notesInput.value || 'New Label Version'
            })
          });
          const data = await res.json();
          if (data.success) {
            statusDiv.style.color = '#10b981';
            statusDiv.innerText = 'Successfully saved to Knowledge Base!';
            
            // Reset form
            productInput.value = '';
            notesInput.value = '';
            imageInput.value = '';
            currentBase64 = null;
            previewBox.innerHTML = '<span class="placeholder-text">Image Preview</span>';
            
            this.loadProfiles(); // Refresh grid
          } else {
            throw new Error(data.error);
          }
        } catch (err) {
          statusDiv.style.color = 'var(--ai-delete-text)';
          statusDiv.innerText = err.message || 'Failed to save.';
        } finally {
          submitBtn.innerHTML = 'SAVE TO KNOWLEDGE BASE';
          submitBtn.disabled = false;
        }
      });
    }
  }

  async fetchProductsCatalog() {
    try {
      const res = await fetch('/api/products?compact=true');
      const data = await res.json();
      if (data.success) {
        this.products = Array.isArray(data)
          ? data
          : (Array.isArray(data?.items)
            ? data.items
            : (Array.isArray(data?.data?.items)
              ? data.data.items
              : (Array.isArray(data?.data) ? data.data : [])));
        const datalist = document.getElementById('aiTeachProductsList');
        if (datalist) {
          datalist.innerHTML = this.products.map(p => `<option value="${p.name}"></option>`).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load products for teaching UI:', err);
    }
  }

  async loadProfiles() {
    const grid = document.getElementById('aiProfilesGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div style="padding: 20px; text-align: center; width: 100%; grid-column: 1 / -1;">Loading...</div>';

    try {
      const res = await fetch('/api/ai/vision/profiles');
      const data = await res.json();
      
      if (data.success) {
        this.profiles = data.data;
        this.renderProfiles();
      } else {
        grid.innerHTML = `<div style="color: var(--ai-delete-text); padding: 20px;">Failed to load profiles.</div>`;
      }
    } catch (err) {
      grid.innerHTML = `<div style="color: var(--ai-delete-text); padding: 20px;">Error connecting to backend.</div>`;
    }
  }

  renderProfiles() {
    const grid = document.getElementById('aiProfilesGrid');
    if (!grid) return;

    if (this.profiles.length === 0) {
      grid.innerHTML = `<div style="color: var(--ai-text-muted); padding: 20px; font-size: 13px; grid-column: 1 / -1; text-align: center;">No visual profiles taught yet. Go to Teach AI tab to add one.</div>`;
      return;
    }

    grid.innerHTML = this.profiles.map(p => {
      let meta = {};
      try { meta = JSON.parse(p.metadata || '{}'); } catch(e) {}
      
      const date = new Date(p.learned_at).toLocaleDateString();
      
      return `
        <div class="ai-profile-card">
          <img class="ai-profile-image" src="${p.image_base64}" alt="Learned Label">
          <div class="ai-profile-info">
            <div class="ai-profile-title">${p.product_name || 'Unknown Product'}</div>
            <div class="ai-profile-meta">
              ${meta.labelTitle || 'Visual Signature'}<br>
              Added: ${date}
            </div>
            <button class="ai-delete-btn" onclick="window.deleteVisionProfile(${p.id})">Remove</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach global delete handler just for the UI
    window.deleteVisionProfile = async (id) => {
      if (!confirm('Are you sure you want to delete this visual profile?')) return;
      try {
        const res = await fetch(`/api/ai/vision/profiles/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          this.loadProfiles();
        }
      } catch (err) {
        alert('Failed to delete profile.');
      }
    };
  }

}

// Ensure global availability
window.AIVisionApp = AIVisionApp;

