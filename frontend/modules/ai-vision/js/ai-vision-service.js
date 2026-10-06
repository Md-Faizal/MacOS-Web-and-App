/**
 * AI Vision Service
 * Provides a global API for other apps to request camera scans and AI detection.
 * Uses a draggable camera preview with automatic catalog matching.
 */
class AIVisionService {
  constructor() {
    this.stream = null;
    this.autoCommitThreshold = parseInt(localStorage.getItem('ai_vision_autocommit_threshold') || '90', 10);
    this.autoCommitEnabled = localStorage.getItem('ai_vision_autocommit_enabled') === 'true';
    this.currentResolve = null;
    this.currentReject = null;
    this.autoScanActive = false;
    this.autoScanTimer = null;
    this.scanStatusTimer = null;
    this.scanAbortController = null;
    this.isScanning = false;
    this.expanded = false;
    this.previousBodyOverflow = '';
  }

  /**
   * Request a scan from the AI Vision service.
   * @param {Object} options - mode, contextHint, etc.
   * @returns {Promise<Object>} - The matched data
   */
  requestScan(options = {}) {
    return new Promise((resolve, reject) => {
      if (document.getElementById('visionAssistModalOverlay')) {
        const previousReject = this.currentReject;
        this.close();
        previousReject?.(new Error('Scan replaced by a newer request'));
      }
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
    overlay.className = 'ai-camera-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'false');
    overlay.setAttribute('aria-label', 'AI product label scanner');

    overlay.innerHTML = `
      <div class="ai-camera-window" id="visionScannerContainer">
          <video id="visionCameraFeed" class="ai-camera-feed" autoplay playsinline muted aria-label="Camera preview"></video>
          <canvas id="visionSnapshotCanvas" style="display: none;"></canvas>
          <div class="ai-camera-status" id="visionCameraStatus" role="status" aria-live="polite" hidden></div>
          <div class="ai-scan-matrix-overlay" id="visionScanMatrixOverlay"></div>
          <div class="ai-scanner-sweeper" id="visionScannerSweeper"></div>
          <div class="ai-camera-controls">
            <button type="button" id="expandVisionModalBtn" aria-label="Expand camera" title="Expand">⤢</button>
            <button type="button" id="closeVisionModalBtn" aria-label="Close camera" title="Close">×</button>
          </div>
          <div class="ai-result-overlay" id="visionResultOverlay" style="background: rgba(30,30,30,0.95); backdrop-filter: blur(10px);">
            <div class="ai-result-close" id="visionResultCloseBtn">✕</div>
            <div class="ai-result-header" style="color: #fff;">
              <span id="visionResultIcon">✨</span> AI Analysis
            </div>
            <div id="visionAnalysisState" style="color: #fff; font-size: 14px; line-height: 1.5; padding-bottom: 30px;">
            </div>
          </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  bindEvents() {
    const closeBtn = document.getElementById('closeVisionModalBtn');
    const overlay = document.getElementById('visionAssistModalOverlay');
    const video = document.getElementById('visionCameraFeed');
    const cameraWindow = document.getElementById('visionScannerContainer');
    const expandBtn = document.getElementById('expandVisionModalBtn');
    const status = document.getElementById('visionCameraStatus');
    const resultCloseBtn = document.getElementById('visionResultCloseBtn');

    closeBtn?.addEventListener('click', () => {
      const reject = this.currentReject;
      this.currentReject = null;
      this.currentResolve = null;
      this.close();
      reject?.(new Error('User cancelled scan'));
    });

    expandBtn?.addEventListener('click', () => {
      this.setExpanded(!this.expanded);
    });

    const cancelScan = () => {
      const reject = this.currentReject;
      this.currentReject = null;
      this.currentResolve = null;
      this.close();
      reject?.(new Error('User cancelled scan'));
    };
    overlay?.addEventListener('click', event => {
      if (this.expanded && event.target === overlay) cancelScan();
    });
    overlay?.addEventListener('keydown', event => {
      if (event.key === 'Escape') cancelScan();
    });

    if (video && cameraWindow) {
      video.addEventListener('click', () => {
        if (video.dataset.dragged) {
          delete video.dataset.dragged;
          return;
        }
        if (this.isScanning) return;
        if (status && !status.hidden && status.dataset.retry === 'true') {
          cameraWindow.classList.add('focused');
          this.startCamera();
          return;
        }
        cameraWindow.classList.toggle('focused');
      });
      video.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        cameraWindow.classList.toggle('focused');
      });

      let dragOrigin = null;
      let dragged = false;
      video.addEventListener('pointerdown', event => {
        if (this.expanded || event.button > 0) return;
        const bounds = cameraWindow.getBoundingClientRect();
        dragOrigin = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: event.clientX - bounds.left,
          offsetY: event.clientY - bounds.top
        };
        dragged = false;
        video.setPointerCapture(event.pointerId);
        cameraWindow.style.left = `${bounds.left}px`;
        cameraWindow.style.top = `${bounds.top}px`;
        cameraWindow.style.right = 'auto';
        cameraWindow.style.bottom = 'auto';
      });
      video.addEventListener('pointermove', event => {
        if (!dragOrigin || event.pointerId !== dragOrigin.pointerId) return;
        if (Math.abs(event.clientX - dragOrigin.startX) > 6 || Math.abs(event.clientY - dragOrigin.startY) > 6) dragged = true;
        if (!dragged) return;
        const maxLeft = Math.max(0, window.innerWidth - cameraWindow.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - cameraWindow.offsetHeight);
        cameraWindow.style.left = `${Math.max(0, Math.min(maxLeft, event.clientX - dragOrigin.offsetX))}px`;
        cameraWindow.style.top = `${Math.max(0, Math.min(maxTop, event.clientY - dragOrigin.offsetY))}px`;
      });
      const stopDragging = event => {
        if (!dragOrigin || event.pointerId !== dragOrigin.pointerId) return;
        dragOrigin = null;
        if (dragged) {
          video.dataset.dragged = 'true';
          setTimeout(() => delete video.dataset.dragged, 0);
        }
      };
      video.addEventListener('pointerup', stopDragging);
      video.addEventListener('pointercancel', stopDragging);
    }

    resultCloseBtn?.addEventListener('click', () => {
      const resultOverlay = document.getElementById('visionResultOverlay');
      if (resultOverlay) resultOverlay.classList.remove('active');
      if (video) video.classList.remove('blur');
      this.autoScanActive = true;
      this.scheduleAutoScan(3000);
    });
  }

  setExpanded(expanded) {
    const overlay = document.getElementById('visionAssistModalOverlay');
    const cameraWindow = document.getElementById('visionScannerContainer');
    const expandBtn = document.getElementById('expandVisionModalBtn');
    if (!overlay || !cameraWindow || !expandBtn || this.expanded === expanded) return;

    this.expanded = expanded;
    if (expanded) {
      const bounds = cameraWindow.getBoundingClientRect();
      cameraWindow.dataset.restoreLeft = `${bounds.left}px`;
      cameraWindow.dataset.restoreTop = `${bounds.top}px`;
      cameraWindow.style.left = '';
      cameraWindow.style.top = '';
      cameraWindow.style.right = '';
      cameraWindow.style.bottom = '';
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.classList.add('expanded');
      cameraWindow.classList.add('expanded');
      overlay.setAttribute('aria-modal', 'true');
      expandBtn.textContent = '⤡';
      expandBtn.setAttribute('aria-label', 'Minimize camera');
      expandBtn.title = 'Minimize';
    } else {
      overlay.classList.remove('expanded');
      cameraWindow.classList.remove('expanded');
      overlay.setAttribute('aria-modal', 'false');
      document.body.style.overflow = this.previousBodyOverflow;
      cameraWindow.style.left = cameraWindow.dataset.restoreLeft;
      cameraWindow.style.top = cameraWindow.dataset.restoreTop;
      cameraWindow.style.right = 'auto';
      cameraWindow.style.bottom = 'auto';
      expandBtn.textContent = '⤢';
      expandBtn.setAttribute('aria-label', 'Expand camera');
      expandBtn.title = 'Expand';
    }
  }

  scheduleAutoScan(delay = 3000) {
    clearTimeout(this.autoScanTimer);
    if (!this.autoScanActive || this.isScanning) return;
    this.autoScanTimer = setTimeout(() => {
      this.autoScanTimer = null;
      this.captureAndAnalyze();
    }, delay);
  }

  showCameraStatus(text, { retry = false, error = false, duration = 1800 } = {}) {
    const status = document.getElementById('visionCameraStatus');
    const cameraWindow = document.getElementById('visionScannerContainer');
    if (!status || !cameraWindow) return;
    clearTimeout(this.scanStatusTimer);
    status.textContent = text;
    status.dataset.retry = String(retry);
    status.hidden = false;
    cameraWindow.classList.toggle('scan-error', error);
    if (!retry && duration > 0) {
      this.scanStatusTimer = setTimeout(() => {
        status.hidden = true;
        cameraWindow.classList.remove('scan-error');
      }, duration);
    }
  }

  async startCamera() {
    const status = document.getElementById('visionCameraStatus');
    this.autoScanActive = false;
    clearTimeout(this.autoScanTimer);
    if (status) status.hidden = true;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('Camera access requires HTTPS or localhost.', 'SecurityError');
      }
      this.stream?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (!document.getElementById('visionAssistModalOverlay')) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const video = document.getElementById('visionCameraFeed');
      if (!video) throw new Error('The camera preview is unavailable.');
      video.srcObject = stream;
      this.track = stream.getVideoTracks()[0] || null;
      await new Promise((resolve, reject) => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          resolve();
          return;
        }
        const onLoaded = () => {
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener('loadeddata', onLoaded);
          reject(new Error('The camera preview could not be started.'));
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
      });
      if (!this.stream || !document.getElementById('visionAssistModalOverlay')) {
        stream.getTracks().forEach(track => track.stop());
        this.stream = null;
        return;
      }
      this.autoScanActive = true;
      this.showCameraStatus('Camera ready. Hold a product label in view.', { duration: 2200 });
      this.scheduleAutoScan(600);
    } catch (error) {
      console.error('[Vision Camera Error]:', error);
      this.stream?.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.track = null;
      const retry = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
      const message = !window.isSecureContext
        ? 'Camera access requires HTTPS or localhost.'
        : error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
          ? 'Camera access is blocked. Allow camera access for this site, then tap here to retry.'
        : error?.name === 'NotFoundError'
          ? 'No camera was found. Connect a camera, then tap here to retry.'
          : error?.message || 'Unable to start the camera. Tap here to retry.';
      this.showCameraStatus(message, { retry, error: true, duration: 0 });
    }
  }

  async captureAndAnalyze() {
    if (this.isScanning || !this.autoScanActive) return;
    this.isScanning = true;
    const video = document.getElementById('visionCameraFeed');
    const canvas = document.getElementById('visionSnapshotCanvas');
    const stateEl = document.getElementById('visionAnalysisState');
    const matrixOverlay = document.getElementById('visionScanMatrixOverlay');
    const sweeper = document.getElementById('visionScannerSweeper');
    const resultOverlay = document.getElementById('visionResultOverlay');

    if (!video || !canvas || !stateEl || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.isScanning = false;
      this.scheduleAutoScan();
      return;
    }

    video.classList.add('blur');
    matrixOverlay.classList.add('active');
    sweeper.classList.add('active');
    matrixOverlay.innerHTML = '';
    const lines = [
      'CAPTURING PRODUCT LABEL…',
      'READING PRODUCT DETAILS…',
      'CHECKING CATALOG MATCH…'
    ];
    let matched = false;
    try {
      for (const line of lines) {
        await new Promise(resolve => setTimeout(resolve, 180));
        if (!this.autoScanActive || !video.isConnected) return;
        const el = document.createElement('div');
        el.className = 'ai-scan-line';
        el.textContent = line;
        matrixOverlay.appendChild(el);
      }

      const width = 800;
      const scale = Math.min(1, width / (video.videoWidth || 800));
      const finalWidth = (video.videoWidth || 800) * scale;
      const finalHeight = (video.videoHeight || 600) * scale;
      if (!this.autoScanActive || !video.isConnected) return;
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture the camera frame.');
      context.drawImage(video, 0, 0, finalWidth, finalHeight);
      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      this.scanAbortController = new AbortController();
      const response = await fetch('/api/ai/vision/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mode: this.mode }),
        signal: this.scanAbortController.signal
      });
      this.scanAbortController = null;
      if (!response.ok) throw new Error(`Vision request failed (${response.status}).`);
      const resData = await response.json();
      if (!resData.success || !resData.data) throw new Error(resData.error || 'Failed to identify product.');

      matched = Boolean(resData.data.match_found);
      matrixOverlay.classList.remove('active');
      sweeper.classList.remove('active');
      if (matched) {
        this.autoScanActive = false;
        document.getElementById('visionScannerContainer')?.classList.add('focused');
        this.setExpanded(true);
        this.renderResult(resData.data, base64Image);
        resultOverlay.classList.add('active');
      } else {
        this.showCameraStatus('No catalog match yet. Keeping the label in view…', { duration: 2200 });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('[Vision Scan Error]:', error);
      matrixOverlay.classList.remove('active');
      sweeper.classList.remove('active');
      if (error?.name !== 'AbortError') {
        this.showCameraStatus('Could not read that frame. Retrying…', { error: true, duration: 2200 });
      }
    } finally {
      this.scanAbortController = null;
      video.classList.remove('blur');
      this.isScanning = false;
      if (!matched && this.autoScanActive) this.scheduleAutoScan(3000);
    }
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
    const resolve = this.currentResolve;
    this.currentResolve = null;
    this.currentReject = null;
    this.close();
    resolve?.(data);
    if (typeof window.showNotification === 'function') {
      window.showNotification(`⚡ Applied: ${data.product_name}`, 'success');
    }
  }

  close() {
    const wasExpanded = this.expanded;
    this.autoScanActive = false;
    this.expanded = false;
    clearTimeout(this.autoScanTimer);
    clearTimeout(this.scanStatusTimer);
    this.scanAbortController?.abort();
    this.scanAbortController = null;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.track = null;
    if (wasExpanded) document.body.style.overflow = this.previousBodyOverflow;
    this.previousBodyOverflow = '';
    this.removeExisting();
  }
}

// Instantiate globally
window.AIVisionService = new AIVisionService();
