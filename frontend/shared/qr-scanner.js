let zxingLoadPromise;
let activeScannerClose = null;

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

const scannerStyles = `
  .qr-scanner-window {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483644;
    width: min(340px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #101214;
    color: #fff;
    border: 2px solid #667085;
    border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, .5);
    font: 13px/1.4 system-ui, sans-serif;
    transition: width .2s ease, border-color .15s ease, box-shadow .15s ease;
  }
  .qr-scanner-window.qr-scanner-expanded {
    width: min(540px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
  }
  .qr-scanner-window.qr-scan-success {
    border-color: #31d17c;
    box-shadow: 0 0 0 3px rgba(49, 209, 124, .28), 0 16px 48px rgba(0, 0, 0, .5);
  }
  .qr-scanner-window.qr-scan-failure {
    border-color: #ff4d5e;
    box-shadow: 0 0 0 3px rgba(255, 77, 94, .3), 0 16px 48px rgba(0, 0, 0, .5);
  }
  .qr-scanner-header {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    background: #1c2024;
    border-bottom: 1px solid #353b41;
    touch-action: none;
    cursor: grab;
    user-select: none;
  }
  .qr-scanner-header:active { cursor: grabbing; }
  .qr-scanner-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 800;
  }
  .qr-scanner-window button {
    min-width: 36px;
    min-height: 36px;
    border: 1px solid #59616a;
    border-radius: 9px;
    background: #292f35;
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }
  .qr-scanner-window button:hover { background: #394149; }
  .qr-scanner-close { font-size: 20px !important; }
  .qr-scanner-video-wrap {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
    background: #050606;
    aspect-ratio: 16 / 9;
  }
  .qr-scanner-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .qr-scanner-frame {
    position: absolute;
    inset: 16% 22%;
    border: 2px solid rgba(74, 222, 128, .95);
    border-radius: 14px;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, .13);
    pointer-events: none;
  }
  .qr-scanner-status {
    margin: 0;
    padding: 8px 12px;
    min-height: 36px;
    color: #d2d7dc;
    font-size: 12px;
  }
  .qr-scanner-retry {
    display: none;
    margin: 0 12px 10px;
    padding: 8px 12px;
    background: #ffea00 !important;
    color: #111 !important;
    border-color: #ffea00 !important;
  }
  .qr-scanner-history {
    display: none;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    border-top: 1px solid #353b41;
  }
  .qr-scanner-expanded .qr-scanner-history { display: block; }
  .qr-scanner-history-heading {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0;
    padding: 10px 12px;
    background: #171a1d;
    color: #bdc5cc;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .qr-scan-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid #282d32;
  }
  .qr-scan-entry-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 650;
  }
  .qr-scan-undone { color: #aab2ba; text-decoration: line-through; }
  .qr-scan-undo {
    min-width: auto !important;
    min-height: 32px !important;
    padding: 4px 9px;
    color: #111 !important;
    background: #ffea00 !important;
    border-color: #ffea00 !important;
  }
  .qr-scan-toast {
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    left: 50%;
    z-index: 2147483645;
    width: min(430px, calc(100vw - 24px));
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border: 2px solid #31d17c;
    border-radius: 12px;
    background: #101a14;
    color: #fff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .4);
    transform: translate(-50%, calc(-100% - 18px));
    opacity: 0;
    transition: transform .2s ease, opacity .2s ease;
  }
  .qr-scan-toast-visible { transform: translate(-50%, 0); opacity: 1; }
  .qr-scan-toast-failure {
    border-color: #ff4d5e;
    background: #241114;
  }
  .qr-scan-toast-message { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 700; }
  .qr-scan-toast-undo {
    min-height: 34px;
    padding: 4px 10px;
    border: 1px solid #ffea00;
    border-radius: 8px;
    background: #ffea00;
    color: #111;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  @media (max-width: 520px) {
    .qr-scanner-window {
      right: 10px;
      bottom: max(10px, env(safe-area-inset-bottom));
      width: min(300px, calc(100vw - 20px));
    }
    .qr-scanner-window.qr-scanner-expanded {
      width: calc(100vw - 20px);
    }
  }
  .qr-scanner-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483642;
    background: rgba(7, 11, 15, .42);
    backdrop-filter: blur(18px) saturate(125%);
    -webkit-backdrop-filter: blur(18px) saturate(125%);
  }
  .qr-scanner-window {
    right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
    width: min(228px, calc(100vw - 28px));
    height: min(390px, calc(100dvh - 28px));
    max-height: none;
    display: block;
    padding: 5px;
    border: 1px solid rgba(255, 255, 255, .32);
    border-radius: 28px;
    background: rgba(255, 255, 255, .12);
    box-shadow: 0 20px 58px rgba(0, 0, 0, .42), inset 0 1px 0 rgba(255, 255, 255, .35);
    backdrop-filter: blur(30px) saturate(150%);
    -webkit-backdrop-filter: blur(30px) saturate(150%);
    transition: width .25s ease, height .25s ease, border-radius .25s ease, border-color .15s ease, box-shadow .15s ease;
  }
  .qr-scanner-window.qr-scanner-expanded {
    inset: 0;
    width: 100vw;
    height: 100dvh;
    max-width: none;
    max-height: none;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    border-radius: 0;
    background: #050607;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .qr-scanner-window.qr-scan-success {
    border-color: rgba(49, 209, 124, .92);
    box-shadow: 0 0 0 3px rgba(49, 209, 124, .32), 0 20px 58px rgba(0, 0, 0, .42);
  }
  .qr-scanner-window.qr-scan-failure {
    border-color: rgba(255, 77, 94, .95);
    box-shadow: 0 0 0 3px rgba(255, 77, 94, .34), 0 20px 58px rgba(0, 0, 0, .42);
  }
  .qr-scanner-header,
  .qr-scanner-status,
  .qr-scanner-retry {
    display: none !important;
  }
  .qr-scanner-video-wrap {
    position: absolute;
    inset: 5px;
    overflow: hidden;
    border-radius: 23px;
    background: #050607;
    aspect-ratio: auto;
    touch-action: none;
    cursor: grab;
  }
  .qr-scanner-expanded .qr-scanner-video-wrap {
    inset: 0;
    border-radius: 0;
  }
  .qr-scanner-video-wrap:active { cursor: grabbing; }
  .qr-scanner-controls {
    position: absolute;
    top: max(12px, env(safe-area-inset-top));
    right: max(12px, env(safe-area-inset-right));
    z-index: 2;
    display: flex;
    gap: 10px;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-5px);
    transition: opacity .18s ease, transform .18s ease;
  }
  .qr-scanner-focused .qr-scanner-controls {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .qr-scanner-controls button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, .48);
    border-radius: 50%;
    background: rgba(20, 24, 28, .46);
    color: #fff;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
  }
  .qr-scanner-message {
    position: absolute;
    inset: 50% 16px auto;
    z-index: 1;
    margin: 0;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, .25);
    border-radius: 14px;
    background: rgba(10, 12, 15, .62);
    color: #fff;
    font: 13px/1.45 system-ui, sans-serif;
    text-align: center;
    transform: translateY(-50%);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .qr-scanner-message[hidden] { display: none; }
  .qr-scanner-history {
    position: absolute;
    inset: auto 0 0;
    z-index: 1;
    display: none;
    flex-direction: column;
    max-height: min(36dvh, 320px);
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, .25);
    background: rgba(9, 13, 17, .58);
    color: #fff;
    backdrop-filter: blur(22px) saturate(135%);
    -webkit-backdrop-filter: blur(22px) saturate(135%);
  }
  .qr-scanner-expanded .qr-scanner-history { display: flex; }
  .qr-scanner-history-heading {
    margin: 0;
    padding: 10px 14px;
    color: rgba(255, 255, 255, .72);
    font: 700 11px/1.3 system-ui, sans-serif;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .qr-scan-entries {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .qr-scan-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 14px;
    border-top: 1px solid rgba(255, 255, 255, .1);
    font: 13px/1.35 system-ui, sans-serif;
  }
  .qr-scan-entry-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .qr-scan-undone { color: rgba(255, 255, 255, .48); text-decoration: line-through; }
  .qr-scan-undo {
    width: auto !important;
    min-width: 0 !important;
    min-height: 32px !important;
    padding: 4px 10px !important;
    border-radius: 9px !important;
    background: rgba(255, 255, 255, .17) !important;
    border-color: rgba(255, 255, 255, .3) !important;
    color: #fff !important;
    font: 700 12px/1 system-ui, sans-serif !important;
  }
  .qr-scan-undone-label {
    color: rgba(255, 255, 255, .58);
    font: 11px/1 system-ui, sans-serif;
  }
  .qr-scanner-window {
    width: min(224px, calc(100vw - 28px));
    height: min(224px, calc(100vw - 28px), calc(100dvh - 28px));
    min-width: 180px;
    min-height: 180px;
    max-width: min(320px, calc(100vw - 20px));
    max-height: min(320px, calc(100dvh - 20px));
    aspect-ratio: 1;
    resize: none;
  }
  .qr-scanner-window.qr-scanner-expanded {
    width: 100vw;
    height: 100dvh;
    min-width: 0;
    min-height: 0;
    max-width: none;
    max-height: none;
    aspect-ratio: auto;
  }
  .qr-scanner-video-wrap {
    inset: 0;
    border-radius: 27px;
  }
  .qr-scanner-expanded .qr-scanner-video-wrap { border-radius: 0; }
  .qr-code-tracking {
    position: absolute;
    z-index: 1;
    display: none;
    align-items: flex-start;
    justify-content: flex-end;
    border: 2px solid #35e487;
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 0 18px rgba(53, 228, 135, .72);
    pointer-events: none;
    transition: left .08s linear, top .08s linear, width .08s linear, height .08s linear, border-color .12s ease, box-shadow .12s ease;
  }
  .qr-code-tracking-visible { display: flex; }
  .qr-code-tracking-failure {
    border-color: #ff4d5e;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 0 18px rgba(255, 77, 94, .7);
  }
  .qr-code-tracking-label {
    max-width: min(200px, 70vw);
    overflow: hidden;
    padding: 3px 6px;
    border-radius: 0 0 0 6px;
    background: rgba(8, 12, 14, .82);
    color: #fff;
    font: 600 10px/1.25 ui-monospace, SFMono-Regular, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qr-scanner-resize {
    position: absolute;
    right: 5px;
    bottom: 5px;
    z-index: 3;
    width: 24px;
    height: 24px;
    border: 1px solid rgba(255, 255, 255, .4);
    border-radius: 7px;
    background: rgba(8, 12, 14, .55);
    cursor: nwse-resize;
    touch-action: none;
    visibility: hidden;
    opacity: 0;
    transition: opacity .18s ease, visibility .18s ease;
  }
  .qr-scanner-focused .qr-scanner-resize {
    visibility: visible;
    opacity: 1;
  }
  .qr-scanner-window .qr-scanner-resize {
    min-width: 0;
    min-height: 0;
    padding: 0;
  }
  .qr-scanner-resize::before,
  .qr-scanner-resize::after {
    position: absolute;
    right: 5px;
    bottom: 5px;
    content: '';
    border-right: 2px solid rgba(255, 255, 255, .86);
    border-bottom: 2px solid rgba(255, 255, 255, .86);
  }
  .qr-scanner-resize::before { width: 8px; height: 8px; }
  .qr-scanner-resize::after { right: 9px; bottom: 9px; width: 4px; height: 4px; }
  .qr-scanner-expanded .qr-scanner-resize { display: none; }
  @media (max-width: 520px) {
    .qr-scanner-window {
      width: min(204px, calc(100vw - 28px));
      height: min(204px, calc(100vw - 28px), calc(100dvh - 28px));
    }
  }
`;

function ensureScannerStyles() {
  if (document.getElementById('qr-scanner-styles')) return;
  const style = document.createElement('style');
  style.id = 'qr-scanner-styles';
  style.textContent = scannerStyles;
  document.head.appendChild(style);
}

function playScanTone(success) {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;

  try {
    const context = new AudioContextType();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = success ? 880 : 220;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (success ? 0.15 : 0.24));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (success ? 0.16 : 0.25));
    oscillator.onended = () => context.close();
  } catch (error) {
    console.warn('[QR Scanner] Unable to play scan tone:', error);
  }
}

export function openQrScanner({ onScan, title = 'Scan product QR' }) {
  if (typeof onScan !== 'function') {
    throw new TypeError('QR scanner requires an onScan callback.');
  }

  ensureScannerStyles();
  activeScannerClose?.();
  document.getElementById('qr-scan-toast')?.remove();

  const popup = document.createElement('section');
  popup.id = 'qr-scanner-window';
  popup.className = 'qr-scanner-window';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'false');
  popup.setAttribute('aria-label', title);
  popup.innerHTML = `
    <div class="qr-scanner-video-wrap">
      <video class="qr-scanner-video" data-qr-video autoplay playsinline muted></video>
      <div class="qr-code-tracking" data-qr-tracking aria-hidden="true">
        <span class="qr-code-tracking-label" data-qr-tracking-label></span>
      </div>
      <p class="qr-scanner-message" data-qr-message role="status" aria-live="polite" hidden></p>
    </div>
    <section class="qr-scanner-history" aria-label="Scanned items">
      <h2 class="qr-scanner-history-heading">Scanned items</h2>
      <div class="qr-scan-entries" data-qr-entries></div>
    </section>
    <div class="qr-scanner-controls">
      <button type="button" data-qr-expand aria-label="Expand scanner" title="Expand">⤢</button>
      <button type="button" data-qr-close aria-label="Close QR scanner" title="Close">×</button>
    </div>
    <button class="qr-scanner-resize" type="button" data-qr-resize aria-label="Resize camera preview"></button>
  `;
  document.body.appendChild(popup);

  const video = popup.querySelector('[data-qr-video]');
  const videoWrap = popup.querySelector('.qr-scanner-video-wrap');
  const message = popup.querySelector('[data-qr-message]');
  const historyContainer = popup.querySelector('[data-qr-entries]');
  const trackingBox = popup.querySelector('[data-qr-tracking]');
  const trackingLabel = popup.querySelector('[data-qr-tracking-label]');
  const resizeHandle = popup.querySelector('[data-qr-resize]');
  videoWrap.tabIndex = 0;
  videoWrap.setAttribute('role', 'button');
  videoWrap.setAttribute('aria-label', 'Camera preview. Activate to show scanner controls.');
  const expandButton = popup.querySelector('[data-qr-expand]');
  const backdrop = document.createElement('div');
  backdrop.className = 'qr-scanner-backdrop';
  const entries = [];
  let controls = null;
  let stream = null;
  let closed = false;
  let processing = false;
  let lastValue = null;
  let lastSeenAt = 0;
  let toastTimeout = null;
  let expanded = false;
  let suppressClick = false;
  let previousBodyOverflow = '';
  let trackingTimeout = null;
  const repositionAfterResize = () => {
    if (closed || expanded) return;
    const bounds = popup.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - bounds.width);
    const maxTop = Math.max(0, window.innerHeight - bounds.height);
    if (bounds.left > maxLeft) popup.style.left = `${maxLeft}px`;
    if (bounds.top > maxTop) popup.style.top = `${maxTop}px`;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(toastTimeout);
    clearTimeout(trackingTimeout);
    window.removeEventListener('resize', repositionAfterResize);
    controls?.stop();
    stream?.getTracks().forEach(track => track.stop());
    document.removeEventListener('keydown', onKeyDown);
    if (expanded) document.body.style.overflow = previousBodyOverflow;
    backdrop.remove();
    document.getElementById('qr-scan-toast')?.remove();
    popup.remove();
    if (activeScannerClose === close) activeScannerClose = null;
  };
  activeScannerClose = close;

  const onKeyDown = event => {
    if (event.key === 'Escape') close();
  };

  const showToast = (message, success, undoEntry = null) => {
    let toast = document.getElementById('qr-scan-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'qr-scan-toast';
      toast.className = 'qr-scan-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = '<span class="qr-scan-toast-message" data-qr-toast-message></span><button type="button" class="qr-scan-toast-undo" data-qr-toast-undo style="display:none">Undo</button>';
      document.body.appendChild(toast);
      toast.querySelector('[data-qr-toast-undo]').addEventListener('click', async () => {
        const current = toast._undoEntry;
        if (current) await undoEntry(current);
      });
    }

    toast.classList.toggle('qr-scan-toast-failure', !success);
    toast.querySelector('[data-qr-toast-message]').textContent = message;
    const undoButton = toast.querySelector('[data-qr-toast-undo]');
    undoButton.style.display = undoEntry && !undoEntry.undone ? 'inline-block' : 'none';
    toast._undoEntry = undoEntry && !undoEntry.undone ? undoEntry : null;
    toast.classList.add('qr-scan-toast-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('qr-scan-toast-visible'), 5000);
  };

  const renderHistory = () => {
    historyContainer.replaceChildren();
    entries.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'qr-scan-entry';
      const label = document.createElement('span');
      label.className = `qr-scan-entry-name${entry.undone ? ' qr-scan-undone' : ''}`;
      label.textContent = entry.label;
      row.appendChild(label);

      if (entry.undone) {
        const undoneLabel = document.createElement('span');
        undoneLabel.className = 'qr-scan-undone-label';
        undoneLabel.textContent = 'Undone';
        row.appendChild(undoneLabel);
      } else {
        const undoButton = document.createElement('button');
        undoButton.type = 'button';
        undoButton.className = 'qr-scan-undo';
        undoButton.textContent = 'Undo';
        undoButton.addEventListener('click', () => undoEntry(entry));
        row.appendChild(undoButton);
      }
      historyContainer.appendChild(row);
    });
    historyContainer.scrollTop = historyContainer.scrollHeight;
  };

  const undoEntry = async entry => {
    if (!entry?.undo || entry.undone) return;
    try {
      const undone = await entry.undo();
      if (undone === false) throw new Error('This scanned item is no longer available to undo.');
      entry.undone = true;
      renderHistory();
      showToast(`Undid ${entry.label}`, true);
      popup.classList.remove('qr-scan-success', 'qr-scan-failure');
      playScanTone(true);
    } catch (error) {
      console.error('[QR Scanner] Undo failed:', error);
      showFeedback(error?.message || 'Unable to undo this scan.', false);
    }
  };

  function showFeedback(message, success, undoEntry = null) {
    popup.classList.remove('qr-scan-success', 'qr-scan-failure');
    void popup.offsetWidth;
    popup.classList.add(success ? 'qr-scan-success' : 'qr-scan-failure');
    playScanTone(success);
    showToast(message, success, undoEntry);
  }

  const updateTrackingBox = (result, value, success = null) => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const bounds = videoWrap.getBoundingClientRect();
    if (!videoWidth || !videoHeight || !bounds.width || !bounds.height) return;

    const points = result?.getResultPoints?.()
      ?.map(point => ({
        x: typeof point.getX === 'function' ? point.getX() : point.x,
        y: typeof point.getY === 'function' ? point.getY() : point.y
      }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)) || [];

    let left;
    let top;
    let width;
    let height;
    if (points.length > 0) {
      const scale = Math.max(bounds.width / videoWidth, bounds.height / videoHeight);
      const offsetX = (bounds.width - videoWidth * scale) / 2;
      const offsetY = (bounds.height - videoHeight * scale) / 2;
      const xs = points.map(point => point.x * scale + offsetX);
      const ys = points.map(point => point.y * scale + offsetY);
      const padding = Math.max(8, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.12);
      left = Math.max(0, Math.min(...xs) - padding);
      top = Math.max(0, Math.min(...ys) - padding);
      width = Math.min(bounds.width - left, Math.max(36, Math.max(...xs) - Math.min(...xs) + padding * 2));
      height = Math.min(bounds.height - top, Math.max(36, Math.max(...ys) - Math.min(...ys) + padding * 2));
    } else {
      width = bounds.width * 0.48;
      height = bounds.height * 0.48;
      left = (bounds.width - width) / 2;
      top = (bounds.height - height) / 2;
    }

    trackingBox.style.left = `${left}px`;
    trackingBox.style.top = `${top}px`;
    trackingBox.style.width = `${width}px`;
    trackingBox.style.height = `${height}px`;
    trackingLabel.textContent = value;
    trackingLabel.title = value;
    trackingBox.classList.toggle('qr-code-tracking-failure', success === false);
    trackingBox.classList.add('qr-code-tracking-visible');
    clearTimeout(trackingTimeout);
    trackingTimeout = setTimeout(() => trackingBox.classList.remove('qr-code-tracking-visible'), 2500);
  };

  const onKeyDownBound = onKeyDown;
  popup.querySelector('[data-qr-close]').addEventListener('click', close);
  expandButton.addEventListener('click', () => {
    if (!expanded) {
      const bounds = popup.getBoundingClientRect();
      popup.dataset.restoreLeft = `${bounds.left}px`;
      popup.dataset.restoreTop = `${bounds.top}px`;
      popup.dataset.restoreRight = 'auto';
      popup.dataset.restoreBottom = 'auto';
      popup.style.left = '';
      popup.style.top = '';
      popup.style.right = '';
      popup.style.bottom = '';
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(backdrop);
      expanded = true;
      popup.classList.add('qr-scanner-expanded');
      popup.setAttribute('aria-modal', 'true');
      expandButton.textContent = '⤡';
      expandButton.setAttribute('aria-label', 'Minimize scanner');
      expandButton.title = 'Minimize';
    } else {
      expanded = false;
      popup.classList.remove('qr-scanner-expanded');
      popup.setAttribute('aria-modal', 'false');
      document.body.style.overflow = previousBodyOverflow;
      backdrop.remove();
      popup.style.left = popup.dataset.restoreLeft;
      popup.style.top = popup.dataset.restoreTop;
      popup.style.right = popup.dataset.restoreRight;
      popup.style.bottom = popup.dataset.restoreBottom;
      expandButton.textContent = '⤢';
      expandButton.setAttribute('aria-label', 'Expand scanner');
      expandButton.title = 'Expand';
    }
  });
  popup.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    if (event.target.closest('.qr-scanner-history')) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!message.hidden) {
      if (event.target === message) startCamera();
      else popup.classList.add('qr-scanner-focused');
      return;
    }
    popup.classList.toggle('qr-scanner-focused');
  });
  videoWrap.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!message.hidden) startCamera();
    else popup.classList.toggle('qr-scanner-focused');
  });
  document.addEventListener('keydown', onKeyDownBound);

  videoWrap.addEventListener('pointerdown', event => {
    if (expanded || event.button > 0) return;
    const bounds = popup.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    let dragged = false;
    videoWrap.setPointerCapture(event.pointerId);
    popup.style.left = `${bounds.left}px`;
    popup.style.top = `${bounds.top}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';

    const move = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      if (Math.abs(moveEvent.clientX - event.clientX) > 6 || Math.abs(moveEvent.clientY - event.clientY) > 6) {
        dragged = true;
      }
      const maxLeft = Math.max(0, window.innerWidth - popup.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - popup.offsetHeight);
      popup.style.left = `${Math.max(0, Math.min(maxLeft, moveEvent.clientX - offsetX))}px`;
      popup.style.top = `${Math.max(0, Math.min(maxTop, moveEvent.clientY - offsetY))}px`;
    };
    const stop = stopEvent => {
      if (stopEvent.pointerId !== event.pointerId) return;
      videoWrap.removeEventListener('pointermove', move);
      videoWrap.removeEventListener('pointerup', stop);
      videoWrap.removeEventListener('pointercancel', stop);
      if (dragged) suppressClick = true;
    };
    videoWrap.addEventListener('pointermove', move);
    videoWrap.addEventListener('pointerup', stop);
    videoWrap.addEventListener('pointercancel', stop);
  });

  resizeHandle.addEventListener('pointerdown', event => {
    if (expanded) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = popup.getBoundingClientRect().width;
    resizeHandle.setPointerCapture(event.pointerId);

    const resize = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const maxSize = Math.max(180, Math.min(320, window.innerWidth - 20, window.innerHeight - 20));
      const nextSize = Math.max(180, Math.min(maxSize, startSize + Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY)));
      popup.style.width = `${nextSize}px`;
      popup.style.height = `${nextSize}px`;
    };
    const stopResize = stopEvent => {
      if (stopEvent.pointerId !== event.pointerId) return;
      resizeHandle.removeEventListener('pointermove', resize);
      resizeHandle.removeEventListener('pointerup', stopResize);
      resizeHandle.removeEventListener('pointercancel', stopResize);
    };
    resizeHandle.addEventListener('pointermove', resize);
    resizeHandle.addEventListener('pointerup', stopResize);
    resizeHandle.addEventListener('pointercancel', stopResize);
  });

  window.addEventListener('resize', repositionAfterResize);

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

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      message.textContent = 'Camera requires HTTPS or localhost. Open this app over a secure connection.';
    } else if (!cameraAllowedByPolicy) {
      message.textContent = 'This page is blocked from using the camera by the server Permissions-Policy.';
    } else if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      message.textContent = 'Camera permission is blocked. Allow camera access for this site, then tap here to retry.';
    } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      message.textContent = 'No camera was found. Connect or enable a camera, then tap here to retry.';
    } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
      message.textContent = 'The camera is busy or unavailable. Close other camera apps, then tap here to retry.';
    } else {
      message.textContent = error?.message || 'Unable to start the camera. Check browser camera permission, then tap here to retry.';
    }
    message.hidden = false;
  }

  async function startCamera() {
    message.hidden = true;
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
        stream = null;
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
          updateTrackingBox(result, value);
          lastSeenAt = Date.now();
          if (value === lastValue) return;
          lastValue = value;
          processing = true;
          try {
            const response = await onScan(value);
            const success = response?.success !== false;
            const message = typeof response === 'string' ? response : response?.message;
            updateTrackingBox(result, response?.label || value, success);

            if (success) {
              const entry = response?.undo ? {
                label: response.label || message || 'Scanned product',
                undo: response.undo,
                undone: false
              } : null;
              if (entry) {
                entries.push(entry);
                renderHistory();
              }
              showFeedback(message || 'Item scanned.', true, entry);
            } else {
              lastValue = null;
              showFeedback(message || 'QR could not be matched to a product.', false);
            }

            if (response?.close) close();
          } catch (error) {
            console.error('[QR Scanner] Scan handling failed:', error);
            lastValue = null;
            updateTrackingBox(result, value, false);
            showFeedback(error?.message || 'Could not add the scanned item.', false);
          } finally {
            processing = false;
          }
        }
      );
      if (closed) controls.stop();
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      showCameraError(error);
    }
  }

  startCamera();
  return close;
}
