/**
 * Worker Audit Overlay & Context Popover Module
 * Provides right-click and long-press audit trail popovers for Admin users across core apps.
 */

export class WorkerAuditOverlay {
  static instance = null;

  constructor() {
    this.popoverEl = null;
    this.currentAnchor = null;
    this.activeItemData = null;
    this.touchTimer = null;
    this.touchPos = { x: 0, y: 0 };
    this.init();
  }

  static init() {
    if (!WorkerAuditOverlay.instance) {
      WorkerAuditOverlay.instance = new WorkerAuditOverlay();
    }
    return WorkerAuditOverlay.instance;
  }

  isAdmin() {
    const role = (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role') || 'owner').toLowerCase();
    return role !== 'worker';
  }

  isWorkerBadgesEnabled() {
    try {
      const pref = localStorage.getItem('macos_show_worker_badges');
      return pref !== 'false';
    } catch (_) {
      return true;
    }
  }

  init() {
    this.createPopoverElement();
    this.bindGlobalListeners();
  }

  createPopoverElement() {
    if (this.popoverEl) return;
    this.popoverEl = document.createElement('div');
    this.popoverEl.className = 'worker-audit-overlay-popover';
    this.popoverEl.style.display = 'none';
    document.body.appendChild(this.popoverEl);
  }

  bindGlobalListeners() {
    // Contextmenu event on document (delegated)
    document.addEventListener('contextmenu', (e) => {
      if (!this.isAdmin() || !this.isWorkerBadgesEnabled()) return;

      const target = e.target.closest('[data-worker-audit]') || e.target.closest('.macos-worker-badge');
      if (target) {
        const auditEl = target.hasAttribute('data-worker-audit')
          ? target
          : target.closest('[data-worker-audit]');

        if (auditEl) {
          e.preventDefault();
          e.stopPropagation();
          this.showPopover(auditEl, e.clientX, e.clientY);
          return;
        }
      }
      this.hidePopover();
    }, true);

    // Dismiss on click outside or scroll
    document.addEventListener('click', (e) => {
      if (this.popoverEl && !this.popoverEl.contains(e.target)) {
        this.hidePopover();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hidePopover();
      }
    });

    window.addEventListener('resize', () => this.hidePopover());

    // Touch support (long press)
    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest('[data-worker-audit]') || e.target.closest('.macos-worker-badge');
      if (!target || !this.isAdmin() || !this.isWorkerBadgesEnabled()) return;

      const auditEl = target.hasAttribute('data-worker-audit')
        ? target
        : target.closest('[data-worker-audit]');
      if (!auditEl) return;

      const touch = e.touches[0];
      this.touchPos = { x: touch.clientX, y: touch.clientY };

      clearTimeout(this.touchTimer);
      this.touchTimer = setTimeout(() => {
        this.showPopover(auditEl, this.touchPos.x, this.touchPos.y);
      }, 550);
    }, { passive: true });

    document.addEventListener('touchmove', () => {
      clearTimeout(this.touchTimer);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      clearTimeout(this.touchTimer);
    }, { passive: true });
  }

  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dateStr;
    }
  }

  showPopover(targetEl, x, y) {
    const rawData = targetEl.getAttribute('data-worker-audit');
    if (!rawData) return;

    let auditData;
    try {
      auditData = JSON.parse(rawData);
    } catch (e) {
      console.warn('Failed to parse worker audit data:', e);
      return;
    }

    this.currentAnchor = targetEl;
    this.activeItemData = auditData;

    const itemName = auditData.name || auditData.title || auditData.reference || 'Item Audit Info';
    const itemType = auditData.type || 'Record';

    const creatorName = auditData.created_by_name || 'Admin';
    const creatorRole = (auditData.created_by_role || 'owner').toLowerCase();
    const isWorkerCreator = creatorRole === 'worker';

    const editorName = auditData.last_edited_by_name;
    const editorRole = (auditData.last_edited_by_role || '').toLowerCase();
    const isWorkerEditor = editorRole === 'worker';

    const createdAtFormatted = this.formatDate(auditData.created_at || auditData.date);
    const updatedAtFormatted = this.formatDate(auditData.updated_at || auditData.last_activity);

    const creatorPlatform = auditData.created_by_platform || auditData.created_platform || auditData.platform || auditData.client_type;
    const editorPlatform = auditData.last_edited_by_platform || auditData.edited_platform;

    const formatPlatformBadge = (plat) => {
      const p = String(plat || '').trim().toLowerCase();
      if (p === 'android' || p === 'native_android') {
        return `<span class="macos-platform-badge android" title="Android Native App">🤖 Android</span>`;
      }
      if (p === 'pwa') {
        return `<span class="macos-platform-badge pwa" title="PWA Mobile App">📱 PWA</span>`;
      }
      if (p === 'web') {
        return `<span class="macos-platform-badge web" title="Web Browser">💻 Web</span>`;
      }
      return '';
    };

    const creatorPlatformBadge = formatPlatformBadge(creatorPlatform);
    const editorPlatformBadge = formatPlatformBadge(editorPlatform);

    const isWorkerBadge = isWorkerEditor || isWorkerCreator;
    const badgeText = isWorkerEditor ? 'Worker Modified' : (isWorkerCreator ? 'Worker Created' : 'Admin Created');
    const badgeClass = isWorkerBadge ? 'worker-created' : 'admin-created';

    this.popoverEl.innerHTML = `
      <div class="worker-audit-popover-header">
        <div class="worker-audit-popover-title">
          <span>🔍</span> ${itemType} Audit
        </div>
        <span class="worker-audit-popover-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="worker-audit-popover-item-name" title="${this.escapeHtml(itemName)}">
        ${this.escapeHtml(itemName)}
      </div>

      <div class="worker-audit-info-row">
        <div class="worker-audit-info-icon">${isWorkerCreator ? '👷' : '👑'}</div>
        <div class="worker-audit-info-content">
          <div class="worker-audit-info-label">Created By</div>
          <div class="worker-audit-info-value">
            ${this.escapeHtml(creatorName)} (${creatorRole})
            ${creatorPlatformBadge ? ` ${creatorPlatformBadge}` : ''}
          </div>
          <div class="worker-audit-info-time">${createdAtFormatted}</div>
        </div>
      </div>

      ${editorName ? `
        <div class="worker-audit-info-row">
          <div class="worker-audit-info-icon">${isWorkerEditor ? '✏️' : '📝'}</div>
          <div class="worker-audit-info-content">
            <div class="worker-audit-info-label">Last Modified By</div>
            <div class="worker-audit-info-value">
              ${this.escapeHtml(editorName)} ${editorRole ? `(${editorRole})` : ''}
              ${editorPlatformBadge ? ` ${editorPlatformBadge}` : ''}
            </div>
            ${updatedAtFormatted !== 'N/A' ? `<div class="worker-audit-info-time">${updatedAtFormatted}</div>` : ''}
          </div>
        </div>
      ` : ''}

      <div class="worker-audit-popover-footer">
        <span>Admin Audit Inspector</span>
        <span>ID: ${auditData.id || 'N/A'}</span>
      </div>
    `;

    this.popoverEl.style.display = 'block';

    // Position popover within viewport bounds
    const popoverRect = this.popoverEl.getBoundingClientRect();
    const margin = 12;
    let posX = x + 10;
    let posY = y + 10;

    if (posX + popoverRect.width > window.innerWidth - margin) {
      posX = window.innerWidth - popoverRect.width - margin;
    }
    if (posX < margin) {
      posX = margin;
    }

    if (posY + popoverRect.height > window.innerHeight - margin) {
      posY = y - popoverRect.height - 10;
    }
    if (posY < margin) {
      posY = margin;
    }

    this.popoverEl.style.left = `${posX}px`;
    this.popoverEl.style.top = `${posY}px`;
  }

  hidePopover() {
    if (this.popoverEl) {
      this.popoverEl.style.display = 'none';
      this.currentAnchor = null;
      this.activeItemData = null;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Attach globally
if (typeof window !== 'undefined') {
  window.WorkerAuditOverlay = WorkerAuditOverlay;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => WorkerAuditOverlay.init());
  } else {
    WorkerAuditOverlay.init();
  }
}
