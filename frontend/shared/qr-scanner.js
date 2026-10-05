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
    </section>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector('[data-qr-video]');
  const status = overlay.querySelector('[data-qr-status]');
  const closeButton = overlay.querySelector('[data-qr-close]');
  let controls = null;
  let closed = false;
  let processing = false;
  let lastValue = null;
  let lastSeenAt = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    controls?.stop();
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') close();
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);

  const start = async () => {
    try {
      const { BrowserMultiFormatReader } = await loadZXingBrowser();
      if (closed) return;
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
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
      console.error('[QR Scanner] Camera startup failed:', error);
      if (!closed) {
        status.textContent = error?.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access and try again.'
          : (error?.message || 'Unable to start the camera. Check camera permission and HTTPS access.');
      }
    }
  };

  start();

  return close;
}
