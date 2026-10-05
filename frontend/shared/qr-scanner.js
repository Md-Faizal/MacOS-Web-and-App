let zxingLoadPromise;

function loadZXingBrowser() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader) {
    return Promise.resolve(window.ZXingBrowser);
  }
  if (zxingLoadPromise) return zxingLoadPromise;

  zxingLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/shared/vendor/zxing-browser.min.js';
    script.onload = () => {
      if (window.ZXingBrowser?.BrowserMultiFormatReader) {
        resolve(window.ZXingBrowser);
      } else {
        zxingLoadPromise = null;
        script.remove();
        reject(new Error('The QR decoder bundle loaded but did not expose its reader.'));
      }
    };
    script.onerror = () => {
      zxingLoadPromise = null;
      script.remove();
      reject(new Error('Unable to load the local QR decoder bundle.'));
    };
    document.head.appendChild(script);
  });

  return zxingLoadPromise;
}

export function openQrScanner({ onScan, title = 'Scan product QR' }) {
  if (typeof onScan !== 'function') {
    throw new TypeError('QR scanner requires an onScan callback.');
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483644;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif;';
  overlay.innerHTML = `
    <section role="dialog" aria-modal="true" aria-label="${title}" style="position:relative;width:min(560px,100%);background:#fff;color:#111;border:3px solid #000;border-radius:12px;box-shadow:8px 8px 0 #000;padding:20px;">
      <button type="button" aria-label="Close scanner" data-qr-close style="position:absolute;right:12px;top:10px;width:36px;height:36px;border:2px solid #000;background:#ffea00;font-size:22px;font-weight:800;cursor:pointer;">×</button>
      <h2 style="margin:0 44px 8px 0;font-size:18px;font-weight:900;">${title}</h2>
      <p style="margin:0 0 14px;color:#555;font-size:13px;">Point the rear camera at a product or batch QR label. Each scan adds one item; move the label out of frame and scan again to increase quantity.</p>
      <div style="position:relative;overflow:hidden;background:#111;border:2px solid #000;border-radius:8px;min-height:220px;">
        <video data-qr-video autoplay playsinline muted style="display:block;width:100%;max-height:60vh;object-fit:cover;"></video>
        <div style="pointer-events:none;position:absolute;inset:18% 14%;border:2px solid #ffea00;box-shadow:0 0 0 999px rgba(0,0,0,.16);"></div>
      </div>
      <p data-qr-status role="status" aria-live="polite" style="min-height:20px;margin:12px 0 0;font-size:13px;font-weight:700;">Starting camera…</p>
      <button type="button" data-qr-retry style="display:none;margin-top:8px;padding:9px 12px;border:2px solid #000;background:#ffea00;font-weight:800;cursor:pointer;">Retry camera access</button>
    </section>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector('[data-qr-video]');
  const status = overlay.querySelector('[data-qr-status]');
  const closeButton = overlay.querySelector('[data-qr-close]');
  const retryButton = overlay.querySelector('[data-qr-retry]');
  let controls = null;
  let stream = null;
  let closed = false;
  let processing = false;
  let lastValue = null;
  let lastSeenAt = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    controls?.stop();
    stream?.getTracks().forEach(track => track.stop());
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  retryButton.addEventListener('click', () => startCamera());
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  function showCameraError(error) {
    console.error('[QR Scanner] Camera startup failed:', error);
    if (closed) return;
    const policy = document.permissionsPolicy || document.featurePolicy;
    let cameraAllowedByPolicy = true;
    try {
      if (policy?.allowsFeature) cameraAllowedByPolicy = policy.allowsFeature('camera');
    } catch (policyError) {
      console.warn('[QR Scanner] Unable to inspect camera Permissions-Policy:', policyError);
    }

    retryButton.style.display = 'none';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Camera requires HTTPS or localhost. Open this app over a secure connection.';
    } else if (!cameraAllowedByPolicy) {
      status.textContent = 'This page is blocked from using the camera by the server Permissions-Policy.';
    } else if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      status.textContent = 'Camera permission is blocked. Allow camera access for this site in browser site settings, then retry.';
      retryButton.style.display = 'inline-block';
    } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      status.textContent = 'No camera was found. Connect or enable a camera, then retry.';
      retryButton.style.display = 'inline-block';
    } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
      status.textContent = 'The camera is busy or unavailable. Close other camera apps and retry.';
      retryButton.style.display = 'inline-block';
    } else {
      status.textContent = error?.message || 'Unable to start the camera. Check browser camera permission and retry.';
      retryButton.style.display = 'inline-block';
    }
  }

  async function startCamera() {
    retryButton.style.display = 'none';
    status.textContent = 'Requesting camera permission…';
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException('Camera access requires HTTPS or localhost.', 'SecurityError');
      }

      controls?.stop();
      stream?.getTracks().forEach(track => track.stop());
      controls = null;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } }
      });
      if (closed) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        return;
      }

      const { BrowserMultiFormatReader } = await loadZXingBrowser();
      if (closed) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromStream(
        stream,
        video,
        async result => {
          if (closed || processing) return;
          if (!result) {
            if (lastValue && Date.now() - lastSeenAt > 1000) lastValue = null;
            return;
          }

          const value = result.getText().trim();
          if (!value) return;
          lastSeenAt = Date.now();
          if (value === lastValue) return;
          lastValue = value;
          processing = true;
          status.textContent = 'QR found. Adding item…';
          try {
            const response = await onScan(value);
            const message = typeof response === 'string' ? response : response?.message;
            if (!closed) status.textContent = message || 'Item scanned. Point at the next label.';
            if (response?.close) close();
          } catch (error) {
            console.error('[QR Scanner] Scan handling failed:', error);
            if (!closed) status.textContent = error?.message || 'Could not add the scanned item.';
          } finally {
            processing = false;
          }
        }
      );
      if (closed) controls.stop();
      else status.textContent = 'Camera ready. Align a product or batch QR inside the frame.';
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      showCameraError(error);
    }
  }

  startCamera();
  return close;
}
