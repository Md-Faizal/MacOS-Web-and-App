// @ts-nocheck
/**
 * Shared Customer Ledger & Bill Link Tracking Modal
 * Displays real-time read receipts, view counts, dwell time, device info, and engagement logs.
 */

(function() {
  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDwellTime(seconds) {
    const sec = parseInt(seconds, 10) || 0;
    if (sec <= 0) return '—';
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  }

  function formatEventName(type) {
    switch(type) {
      case 'VIEW': return '👁️ Opened Statement';
      case 'COPY_IFSC': return '📋 Copied IFSC Code';
      case 'COPY_ACCOUNT': return '🏦 Copied Account Number';
      case 'DOWNLOAD_CSV': return '📥 Downloaded CSV Statement';
      case 'PRINT': return '⎙ Printed Statement';
      case 'TAB_SWITCH': return '📑 Switched Tab';
      case 'HEARTBEAT': return '⏱️ Active Reading';
      default: return type || 'Activity';
    }
  }

  window.openLedgerTrackingModal = async function(identifier, customerName = 'Customer') {
    // Remove any existing tracking modal
    const existing = document.getElementById('ledgerTrackingModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ledgerTrackingModalOverlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #ffffff;
      color: #000000;
      width: min(780px, 95vw);
      max-height: 88vh;
      border: 2px solid #000000;
      box-shadow: 6px 6px 0px rgba(0,0,0,1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: trackingModalPop 0.15s ease-out;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #000000;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 0.5px;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 15px;">📡</span>
        <span>LINK TRACKING & TELEMETRY — ${customerName.toUpperCase()}</span>
      </div>
      <button id="closeTrackingModalBtn" style="
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        font-weight: 700;
      ">✕</button>
    `;

    // Body content area
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    `;
    content.innerHTML = `
      <div style="text-align: center; padding: 40px 0;">
        <div style="font-size: 24px; animation: spin 1s infinite linear;">⚙️</div>
        <div style="margin-top: 10px; font-size: 12px; font-weight: bold;">FETCHING TELEMETRY METRICS...</div>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    const closeModal = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    header.querySelector('#closeTrackingModalBtn').onclick = closeModal;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };

    // Fetch tracking data
    try {
      const apiUrl = `/api/contacts/${encodeURIComponent(identifier)}/tracking`;
      let res = await fetch(apiUrl, { credentials: 'same-origin' });
      if (!res.ok) {
        // Fallback to billing ledger route
        res = await fetch(`/api/billing/ledger/${encodeURIComponent(identifier)}/tracking`, { credentials: 'same-origin' });
      }
      
      if (!res.ok) throw new Error('Could not retrieve tracking details');
      const data = await res.json();
      const summary = data.summary || {};
      const logs = data.logs || [];
      const customer = data.customer || {};

      // Render summary UI
      let statusBadge = '';
      if (summary.status === 'ENGAGED') {
        statusBadge = '<span style="background: #8b5cf6; color: white; padding: 4px 8px; font-size: 11px; font-weight: bold; border-radius: 2px;">🟣 ENGAGED & ACTIVE</span>';
      } else if (summary.status === 'SEEN') {
        statusBadge = '<span style="background: #10b981; color: white; padding: 4px 8px; font-size: 11px; font-weight: bold; border-radius: 2px;">🟢 SEEN (READ RECEIPT CONFIRMED)</span>';
      } else {
        statusBadge = '<span style="background: #6b7280; color: white; padding: 4px 8px; font-size: 11px; font-weight: bold; border-radius: 2px;">⚪ UNOPENED / PENDING</span>';
      }

      const shareLink = customer.shareUrl || (customer.ledgerToken ? `${window.location.origin}/ledger/${customer.ledgerToken}` : '');

      content.innerHTML = `
        <!-- Status & Share Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="margin-bottom: 4px;">${statusBadge}</div>
            <div style="font-size: 11px; color: #4b5563;">
              ${summary.totalViews > 0 
                ? `First opened: <strong>${formatRelativeTime(summary.firstOpenedAt)}</strong> • Latest activity: <strong>${formatRelativeTime(summary.lastOpenedAt)}</strong>` 
                : 'Customer has not visited this ledger statement link yet.'}
            </div>
          </div>
          ${shareLink ? `
            <div style="display: flex; gap: 6px;">
              <button id="modalCopyLinkBtn" style="padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; background: #ffffff; border: 1px solid #000000; box-shadow: 2px 2px 0 #000;">📋 Copy Link</button>
              <button id="modalWaShareBtn" style="padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; background: #25D366; color: #ffffff; border: 1px solid #000000; box-shadow: 2px 2px 0 #000;">💬 WhatsApp</button>
            </div>
          ` : ''}
        </div>

        <!-- 4 Metric Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="border: 1px solid #000000; padding: 10px; box-shadow: 2px 2px 0 #000000; background: #fafafa;">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Total Opens</div>
            <div style="font-size: 20px; font-weight: 900; margin-top: 4px;">${summary.totalViews || 0}</div>
            <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">Unique Views</div>
          </div>
          <div style="border: 1px solid #000000; padding: 10px; box-shadow: 2px 2px 0 #000000; background: #fafafa;">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Active Reading Time</div>
            <div style="font-size: 20px; font-weight: 900; margin-top: 4px;">${formatDwellTime(summary.totalDwellSeconds)}</div>
            <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">Foreground Dwell</div>
          </div>
          <div style="border: 1px solid #000000; padding: 10px; box-shadow: 2px 2px 0 #000000; background: #fafafa;">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Max Scroll Depth</div>
            <div style="font-size: 20px; font-weight: 900; margin-top: 4px;">${summary.maxScrollDepth || 0}%</div>
            <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">Page Inspected</div>
          </div>
          <div style="border: 1px solid #000000; padding: 10px; box-shadow: 2px 2px 0 #000000; background: #fafafa;">
            <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Engagement Actions</div>
            <div style="font-size: 20px; font-weight: 900; margin-top: 4px;">${summary.actionsCount || 0}</div>
            <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">${summary.lastAction ? formatEventName(summary.lastAction) : 'No button clicks'}</div>
          </div>
        </div>

        <!-- Devices & Location Badges -->
        <div style="margin-bottom: 16px; font-size: 11px;">
          <div style="margin-bottom: 6px;">
            <strong>Detected Devices:</strong> 
            ${summary.uniqueDevices?.length 
              ? summary.uniqueDevices.map(d => `<span style="display: inline-block; background: #e5e7eb; padding: 2px 6px; border-radius: 2px; margin: 2px 4px 2px 0; border: 1px solid #d1d5db; font-size: 10px;">${d}</span>`).join('') 
              : '<span style="color: #6b7280;">None recorded</span>'}
          </div>
          <div>
            <strong>Locations / Networks:</strong> 
            ${summary.locations?.length 
              ? summary.locations.map(loc => `<span style="display: inline-block; background: #e5e7eb; padding: 2px 6px; border-radius: 2px; margin: 2px 4px 2px 0; border: 1px solid #d1d5db; font-size: 10px;">📍 ${loc}</span>`).join('') 
              : '<span style="color: #6b7280;">None recorded</span>'}
          </div>
        </div>

        <!-- Activity Log Timeline -->
        <div>
          <div style="font-size: 12px; font-weight: 800; border-bottom: 2px solid #000000; padding-bottom: 4px; margin-bottom: 8px;">ACTIVITY & AUDIT TIMELINE (${logs.length})</div>
          ${logs.length === 0 ? `
            <div style="text-align: center; padding: 24px 0; color: #6b7280; font-size: 11px; border: 1px dashed #d1d5db;">
              No visits or actions recorded yet for this link.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #000000; background: #f3f4f6; font-weight: bold;">
                  <th style="padding: 6px;">TIME</th>
                  <th style="padding: 6px;">EVENT</th>
                  <th style="padding: 6px;">DEVICE & OS</th>
                  <th style="padding: 6px;">LOCATION / IP</th>
                  <th style="padding: 6px; text-align: right;">DWELL / SCROLL</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 6px; white-space: nowrap; color: #4b5563;">${formatRelativeTime(l.createdAt)}</td>
                    <td style="padding: 6px; font-weight: 700;">${formatEventName(l.eventType)}</td>
                    <td style="padding: 6px;">${l.deviceType} (${l.os || 'OS'} • ${l.browser || 'Browser'})</td>
                    <td style="padding: 6px; color: #4b5563;">${l.location !== 'Unknown Location' ? l.location : (l.ipAddress || '—')}</td>
                    <td style="padding: 6px; text-align: right;">
                      ${l.dwellSeconds > 0 ? `${formatDwellTime(l.dwellSeconds)}` : '—'}
                      ${l.scrollDepth > 0 ? ` • ${l.scrollDepth}%` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      `;

      // Copy & WhatsApp bindings in modal
      const copyBtn = content.querySelector('#modalCopyLinkBtn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(shareLink).then(() => {
            copyBtn.textContent = '✓ COPIED!';
            setTimeout(() => copyBtn.textContent = '📋 Copy Link', 2000);
          });
        };
      }
      const waBtn = content.querySelector('#modalWaShareBtn');
      if (waBtn) {
        waBtn.onclick = () => {
          const msg = encodeURIComponent(`Hello ${customerName}! You can view your bills, payments, and ledger balance here: ${shareLink}`);
          window.open(`https://wa.me/?text=${msg}`, '_blank');
        };
      }

    } catch (err) {
      content.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #ef4444;">
          <div style="font-size: 20px; font-weight: bold; margin-bottom: 6px;">⚠️ Unable to Load Telemetry</div>
          <div style="font-size: 11px;">${err.message || 'Error communicating with tracking API.'}</div>
        </div>
      `;
    }
  };
})();

