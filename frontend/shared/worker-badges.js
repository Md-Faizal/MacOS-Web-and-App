import { WorkerAuditOverlay } from '/shared/worker-audit-overlay.js';

/**
 * Shared Worker Badges Utility for Admin Views
 */

export function isWorkerBadgesEnabled() {
  try {
    const pref = localStorage.getItem('macos_show_worker_badges');
    return pref !== 'false'; // Default enabled (true)
  } catch (_) {
    return true;
  }
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getPlatformInfo(platform) {
  const p = String(platform || '').trim().toLowerCase();
  if (p === 'android' || p === 'native_android') {
    return { icon: '🤖', label: 'Android App', code: 'android' };
  }
  if (p === 'pwa') {
    return { icon: '📱', label: 'PWA', code: 'pwa' };
  }
  if (p === 'web') {
    return { icon: '💻', label: 'Web', code: 'web' };
  }
  return null;
}

/**
 * Generates HTML for worker audit badges (Admin view only)
 * @param {Object} item - Record containing created_by_role, created_by_name, last_edited_by_role, last_edited_by_name, platform, etc.
 * @param {Object} options - { compact: boolean, showIconOnly: boolean }
 * @returns {string} HTML markup for the badge or empty string
 */
export function renderWorkerBadge(item, options = {}) {
  if (!item || !isWorkerBadgesEnabled()) return '';

  const createdRole = String(item.created_by_role || '').trim().toLowerCase();
  const editedRole = String(item.last_edited_by_role || '').trim().toLowerCase();

  const isCreatedByWorker = createdRole === 'worker';
  const isEditedByWorker = editedRole === 'worker';

  if (!isCreatedByWorker && !isEditedByWorker) return '';

  const creatorName = item.created_by_name || 'Worker';
  const editorName = item.last_edited_by_name || 'Worker';
  const creatorPlatform = getPlatformInfo(item.created_by_platform || item.created_client_type || item.platform);
  const editorPlatform = getPlatformInfo(item.last_edited_by_platform || item.edited_client_type || item.platform);

  if (isCreatedByWorker) {
    const platformSuffix = creatorPlatform ? ` (${creatorPlatform.label})` : '';
    const platformIndicator = creatorPlatform && !options.showIconOnly 
      ? ` <span class="macos-platform-indicator" title="${creatorPlatform.label}">${creatorPlatform.icon}</span>` 
      : '';
    const label = options.showIconOnly 
      ? (creatorPlatform ? creatorPlatform.icon : '👷') 
      : (options.compact ? `👷 ${escapeHtml(creatorName)}${platformIndicator}` : `👷 Worker: ${escapeHtml(creatorName)}${platformIndicator}`);
    return `<span class="macos-worker-badge worker-created" title="Created by Worker: ${escapeHtml(creatorName)}${platformSuffix}" data-worker-badge="created">${label}</span>`;
  }

  if (isEditedByWorker) {
    const platformSuffix = editorPlatform ? ` (${editorPlatform.label})` : '';
    const platformIndicator = editorPlatform && !options.showIconOnly 
      ? ` <span class="macos-platform-indicator" title="${editorPlatform.label}">${editorPlatform.icon}</span>` 
      : '';
    const label = options.showIconOnly 
      ? (editorPlatform ? editorPlatform.icon : '✏️') 
      : (options.compact ? `✏️ ${escapeHtml(editorName)}${platformIndicator}` : `✏️ Worker: ${escapeHtml(editorName)}${platformIndicator}`);
    return `<span class="macos-worker-badge worker-edited" title="Edited by Worker: ${escapeHtml(editorName)}${platformSuffix}" data-worker-badge="edited">${label}</span>`;
  }

  return '';
}

// Global helper attachment for non-module script contexts
if (typeof window !== 'undefined') {
  window.isWorkerBadgesEnabled = isWorkerBadgesEnabled;
  window.renderWorkerBadge = renderWorkerBadge;
  window.escapeWorkerBadgeHtml = escapeHtml;
  try {
    if (typeof WorkerAuditOverlay !== 'undefined') {
      WorkerAuditOverlay.init();
    }
  } catch (_) {}
}
