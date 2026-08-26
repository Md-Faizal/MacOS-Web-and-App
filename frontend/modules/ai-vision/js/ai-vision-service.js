/**
 * AI Vision Service
 * Provides a global API for other apps to request camera scans and AI detection.
 * Uses a full-screen overlay modal as requested by the user.
 */
class AIVisionService {
  constructor() {
    this.stream = null;
    this.autoCommitThreshold = parseInt(localStorage.getItem('ai_vision_autocommit_threshold') || '90', 10);
    this.autoCommitEnabled = localStorage.getItem('ai_vision_autocommit_enabled') === 'true';
    this.currentResolve = null;
    this.currentReject = null;
  }

  /**
   * Request a scan from the AI Vision service.
   * @param {Object} options - mode, contextHint, etc.
   * @returns {Promise<Object>} - The matched data
   */
  requestScan(options = {}) {
    return new Promise((resolve, reject) => {
      this.mode = options.mode || 'pos';
      this.currentResolve = resolve;
      this.currentReject = reject;
      
      this.initModal();
    });
  }

  initModal() {
    this.removeExisting();
    this.injectStylesIfNeeded();
    this.createModalDOM();
    this.bindEvents();
    this.startCamera();
  }

  injectStylesIfNeeded() {
    if (!document.getElementById('aiVisionStylesGlobal')) {
      const link = document.createElement('link');
      link.id = 'aiVisionStylesGlobal';
      link.rel = 'stylesheet';
      link.href = '/modules/ai-vision/css/ai-vision.css';
      document.head.appendChild(link);
    }
  }

  removeExisting() {
    const existing = document.getElementById('visionAssistModalOverlay');
    if (existing) existing.remove();
  }

  createModalDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'visionAssistModalOverlay';
    // Using a full screen overlay modal as requested by user
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.9); backdrop-filter: blur(8px);
      z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
    `;

    overlay.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; max-width: 600px; max-height: 850px; background: #000; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
        
        <!-- Header Controls -->
        <div style="position: absolute; top: 0; left: 0; right: 0; padding: 16px 24px; z-index: 15; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 11px; color: #fff; cursor: pointer; display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 4px;">
              <input type="checkbox" id="aiVisionAutoCommitCheck" ${this.autoCommitEnabled ? 'checked' : ''} style="cursor: pointer;" />
              <span>Auto-Apply (>90%)</span>
            </label>
          </div>
          <button id="closeVisionModalBtn" style="background: rgba(0,0,0,0.5); border: none; color: #fff; font-size: 16px; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">✕</button>
        </div>

        <!-- Scanner Container -->
        <div class="ai-scanner-container" id="visionScannerContainer" style="flex: 1;">
          <video id="visionCameraFeed" class="ai-camera-feed" autoplay playsinline muted></video>
          <canvas id="visionSnapshotCanvas" style="display: none;"></canvas>
          
          <!-- Focus Ring -->
          <div class="ai-focus-ring" id="visionFocusRing"></div>

          <!-- Scanning matrix animation (Hidden until scan triggers) -->
          <div class="ai-scan-matrix-overlay" id="visionScanMatrixOverlay"></div>
          
          <!-- Sweeping laser line -->
          <div class="ai-scanner-sweeper" id="visionScannerSweeper"></div>

          <!-- Floating Controls -->
          <div class="ai-scanner-controls" style="top: 80px;">
            <button class="ai-float-btn" id="visionBtnFlashlight" title="Toggle Flashlight">🔦</button>
            <button class="ai-float-btn" id="visionBtnZoom" title="Toggle Zoom">🔍</button>
          </div>

          <!-- Scan Trigger Button -->
          <div class="ai-scan-trigger-wrapper">
            <button class="ai-scan-trigger" id="captureVisionScanBtn" title="Tap to Scan">
              <div class="ai-scan-trigger-inner"></div>
            </button>
          </div>

          <!-- Result Overlay -->
          <div class="ai-result-overlay" id="visionResultOverlay" style="background: rgba(30,30,30,0.95); backdrop-filter: blur(10px);">
            <div class="ai-result-close" id="visionResultCloseBtn">✕</div>
            <div class="ai-result-header" style="color: #fff;">
              <span id="visionResultIcon">✨</span> AI Analysis
            </div>
            <div id="visionAnalysisState" style="color: #fff; font-size: 14px; line-height: 1.5; padding-bottom: 30px;">
              <!-- Results rendered here -->
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
  }

  bindEvents() {
    const closeBtn = document.getElementById('closeVisionModalBtn');
    const overlay = document.getElementById('visionAssistModalOverlay');
    const captureBtn = document.getElementById('captureVisionScanBtn');
    const autoCommitCheck = document.getElementById('aiVisionAutoCommitCheck');
    const video = document.getElementById('visionCameraFeed');
    const focusRing = document.getElementById('visionFocusRing');
    const btnFlashlight = document.getElementById('visionBtnFlashlight');
    const btnZoom = document.getElementById('visionBtnZoom');
    const resultCloseBtn = document.getElementById('visionResultCloseBtn');

    closeBtn?.addEventListener('click', () => {
      this.close();
      if (this.currentReject) this.currentReject(new Error('User cancelled scan'));
    });
    
    autoCommitCheck?.addEventListener('change', (e) => {
      this.autoCommitEnabled = e.target.checked;
      localStorage.setItem('ai_vision_autocommit_enabled', this.autoCommitEnabled);
    });

    overlay?.addEventListener('click', (e) => {
      if (e.target.id === 'visionAssistModalOverlay') {
        this.close();
        if (this.currentReject) this.currentReject(new Error('User cancelled scan'));
      }
    });

    // Click to focus
    if (video && focusRing) {
      video.addEventListener('click', (e) => {
        if (this.isScanning) return;
        const rect = video.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        focusRing.style.left = `${x}px`;
        focusRing.style.top = `${y}px`;
        focusRing.classList.remove('fade-out');
        focusRing.classList.add('active');
        
        setTimeout(() => {
          focusRing.classList.remove('active');
          focusRing.classList.add('fade-out');
        }, 800);
      });
    }

    // Flashlight Toggle
    if (btnFlashlight) {
      btnFlashlight.addEventListener('click', async () => {
        if (!this.track) return;
        try {
          const capabilities = this.track.getCapabilities();
          if (capabilities.torch) {
            this.torchOn = !this.torchOn;
            await this.track.applyConstraints({
              advanced: [{ torch: this.torchOn }]
            });
            btnFlashlight.classList.toggle('active', this.torchOn);
          }
        } catch (err) {}
      });
    }

    // Zoom Toggle
    let zoomLevel = 1;
    if (btnZoom) {
      btnZoom.addEventListener('click', async () => {
        if (!this.track) return;
        try {
          const capabilities = this.track.getCapabilities();
          if (capabilities.zoom) {
            zoomLevel = zoomLevel >= capabilities.zoom.max ? capabilities.zoom.min : zoomLevel + 1;
            await this.track.applyConstraints({
              advanced: [{ zoom: zoomLevel }]
            });
            btnZoom.classList.toggle('active', zoomLevel > capabilities.zoom.min);
          } else {
            zoomLevel = zoomLevel > 1 ? 1 : 1.5;
            if (video) video.style.transform = `scale(${zoomLevel})`;
            btnZoom.classList.toggle('active', zoomLevel > 1);
          }
        } catch (err) {
          zoomLevel = zoomLevel > 1 ? 1 : 1.5;
          if (video) video.style.transform = `scale(${zoomLevel})`;
          btnZoom.classList.toggle('active', zoomLevel > 1);
        }
      });
    }

    captureBtn?.addEventListener('click', () => {
      if (this.isScanning) return;
      this.captureAndAnalyze();
    });

    resultCloseBtn?.addEventListener('click', () => {
      const resultOverlay = document.getElementById('visionResultOverlay');
      if (resultOverlay) resultOverlay.classList.remove('active');
      if (video) video.classList.remove('blur');
    });
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const videoEl = document.getElementById('visionCameraFeed');
      if (videoEl) {
        videoEl.srcObject = this.stream;
      }
      if (this.stream.getVideoTracks().length > 0) {
        this.track = this.stream.getVideoTracks()[0];
      }
    } catch (err) {
      console.error('[Vision Camera Error]:', err);
      // Let it stay black screen with controls gracefully
    }
  }

  async captureAndAnalyze() {
    this.isScanning = true;
    const video = document.getElementById('visionCameraFeed');
    const canvas = document.getElementById('visionSnapshotCanvas');
    const stateEl = document.getElementById('visionAnalysisState');
    const matrixOverlay = document.getElementById('visionScanMatrixOverlay');
    const sweeper = document.getElementById('visionScannerSweeper');
    const resultOverlay = document.getElementById('visionResultOverlay');

    if (!video || !canvas || !stateEl) {
      this.isScanning = false;
      return;
    }

    // Trigger animations
    video.classList.add('blur');
    matrixOverlay.classList.add('active');
    sweeper.classList.add('active');
    matrixOverlay.innerHTML = '';

    const lines = [
      "INITIALIZING VISION NEURAL NET...",
      "CAPTURING HIGH-RES FRAME...",
      "EXTRACTING TEXT (OCR)...",
      "SENDING TO GEMINI 2.5 FLASH..."
    ];

    for (let i = 0; i < lines.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const el = document.createElement('div');
      el.className = 'ai-scan-line';
      el.textContent = `> ${lines[i]}`;
      matrixOverlay.appendChild(el);
    }

    const width = 800;
    const scale = Math.min(1, width / (video.videoWidth || 800));
    const finalWidth = (video.videoWidth || 800) * scale;
    const finalHeight = (video.videoHeight || 600) * scale;

    canvas.width = finalWidth;
    canvas.height = finalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, finalWidth, finalHeight);

    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    try {
      const response = await fetch('/api/ai/vision/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          mode: this.mode
        })
      });

      const resData = await response.json();
      
      // Add success lines
      const el1 = document.createElement('div'); el1.className = 'ai-scan-line'; el1.textContent = `> CROSS-REFERENCING KNOWLEDGE BASE...`; matrixOverlay.appendChild(el1);
      await new Promise(resolve => setTimeout(resolve, 300));
      const el2 = document.createElement('div'); el2.className = 'ai-scan-line'; el2.textContent = `> PROCESSING COMPLETE.`; matrixOverlay.appendChild(el2);
      await new Promise(resolve => setTimeout(resolve, 400));
      
      matrixOverlay.classList.remove('active');
      sweeper.classList.remove('active');

      if (resData.success && resData.data) {
        this.renderResult(resData.data, base64Image);
        resultOverlay.classList.add('active');
      } else {
        throw new Error(resData.error || 'Failed to identify product');
      }
    } catch (err) {
      console.error('[Vision Scan Error]:', err);
      matrixOverlay.classList.remove('active');
      sweeper.classList.remove('active');
      
      stateEl.innerHTML = `
        <div style="padding: 20px; color: #ff6b6b; font-size: 13px; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 8px;">
          ❌ Vision Recognition Error: ${err.message}
        </div>
      `;
      resultOverlay.classList.add('active');
    }
    
    this.isScanning = false;
  }

  renderResult(data, base64Image) {
    const stateEl = document.getElementById('visionAnalysisState');
    if (!stateEl) return;

    const { 
      match_found, product_name, variant_name, confidence_score = 0, 
      raw_detected_batch, smart_matched_batch, 
      raw_detected_expiry, smart_matched_expiry, 
      raw_detected_mrp, smart_matched_mrp, 
      reasoning 
    } = data;

    const final_batch = smart_matched_batch || data.extracted_batch || raw_detected_batch || '';
    const final_expiry = smart_matched_expiry || data.extracted_expiry || raw_detected_expiry || '';
    const final_mrp = smart_matched_mrp || data.extracted_mrp || raw_detected_mrp || '';

    const confidenceColor = confidence_score >= 85 ? '#059669' : confidence_score >= 60 ? '#d97706' : '#dc2626';

    if (this.autoCommitEnabled && confidence_score >= this.autoCommitThreshold && match_found) {
      this.handleApply({
        ...data,
        extracted_batch: final_batch,
        extracted_expiry: final_expiry,
        extracted_mrp: final_mrp,
        product_name: product_name
      });
      return;
    }

    stateEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; background: #222; padding: 8px 12px; border-radius: 4px; border: 1px solid #333;">
          <span style="font-size: 11px; font-weight: 700; color: ${match_found ? '#4ade80' : '#f87171'};">
            ${match_found ? '✓ PRODUCT MATCH CONFIRMED' : '❓ LOW CONFIDENCE / UNKNOWN'}
          </span>
          <span style="font-size: 11px; font-weight: 800; color: ${confidenceColor}; background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 2px;">
            ${confidence_score}% MATCH
          </span>
        </div>

        <div>
          <div style="font-size: 10px; color: #888; text-transform: uppercase;">Product Name (Click to Manual Search)</div>
          <input type="text" id="manualProductName" list="productsList" value="${product_name || ''}" 
                 style="width: 100%; background: #1a1a1a; color: #fff; border: 1px dashed #555; padding: 6px; border-radius: 3px; font-size: 14px; font-weight: 700; margin-top: 4px;" 
                 placeholder="Search products manually..."/>
          ${variant_name ? `<div style="font-size: 11px; color: #38bdf8; margin-top: 4px;">Variant: ${variant_name}</div>` : ''}
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; background: #222; padding: 10px; border-radius: 4px;">
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;">
            <div>
              <div style="font-size: 9px; color: #888;">RAW BATCH</div>
              <div style="font-size: 11px; color: #aaa; font-family: monospace;">${raw_detected_batch || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 9px; color: #4ade80;">SMART BATCH</div>
              <input type="text" id="manualBatch" value="${final_batch}" style="width: 100%; background: #111; color: #facc15; border: 1px solid #444; padding: 4px; font-size: 11px; font-family: monospace;" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;">
            <div>
              <div style="font-size: 9px; color: #888;">RAW EXPIRY</div>
              <div style="font-size: 11px; color: #aaa; font-family: monospace;">${raw_detected_expiry || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 9px; color: #4ade80;">SMART EXPIRY</div>
              <input type="text" id="manualExpiry" value="${final_expiry}" style="width: 100%; background: #111; color: #facc15; border: 1px solid #444; padding: 4px; font-size: 11px; font-family: monospace;" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <div style="font-size: 9px; color: #888;">RAW MRP</div>
              <div style="font-size: 11px; color: #aaa; font-family: monospace;">${raw_detected_mrp || 'N/A'}</div>
            </div>
            <div>
              <div style="font-size: 9px; color: #4ade80;">SMART MRP</div>
              <input type="text" id="manualMRP" value="${final_mrp}" style="width: 100%; background: #111; color: #4ade80; border: 1px solid #444; padding: 4px; font-size: 11px; font-family: monospace;" />
            </div>
          </div>

        </div>

        ${reasoning ? `<div style="font-size: 10px; color: #aaa; font-style: italic; background: #1a1a1a; padding: 6px; border-radius: 3px;">"${reasoning}"</div>` : ''}

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          <button id="applyVisionResultBtn" style="padding: 10px; background: #059669; color: #fff; border: none; border-radius: 4px; font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>✓</span> APPLY TO ORDER / STAGE
          </button>
        </div>

      </div>
    `;

    document.getElementById('applyVisionResultBtn')?.addEventListener('click', () => {
      const overrideData = {
        ...data,
        product_name: document.getElementById('manualProductName')?.value || product_name,
        extracted_batch: document.getElementById('manualBatch')?.value || final_batch,
        extracted_expiry: document.getElementById('manualExpiry')?.value || final_expiry,
        extracted_mrp: document.getElementById('manualMRP')?.value || final_mrp,
      };
      if (overrideData.product_name !== product_name) {
        overrideData.product_id = null;
      }
      this.handleApply(overrideData);
    });
  }

  handleApply(data) {
    if (this.currentResolve) {
      this.currentResolve(data);
    }
    this.close();
    if (typeof window.showNotification === 'function') {
      window.showNotification(`⚡ Applied: ${data.product_name}`, 'success');
    }
  }

  close() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.removeExisting();
  }
}

// Instantiate globally
window.AIVisionService = new AIVisionService();
