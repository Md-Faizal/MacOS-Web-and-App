/**
 * MissionControl - macOS Golden Gate (Sonoma/Sequoia) 1:1 Implementation
 * Fully coordinated with WindowGeometryManager, Spaces Bar, and Desktop Layout.
 */

import { windowGeometryManager } from '../../app-bar/modules/window-geometry-contract.js';

export class MissionControl {
  constructor() {
    this.isActive = false;
    this.STORAGE_KEY_SPACES = 'macos_spaces_config_v3';
    this.STORAGE_KEY_WINDOWS = 'macos_windows_spaces_v3';

    // Default spaces matching macOS Golden Gate layout
    this.spaces = [
      { id: 'desktop-1', name: 'Desktop' },
      { id: 'desktop-2', name: 'Keynote' },
      { id: 'desktop-3', name: 'Freeform' }
    ];
    this.activeSpaceId = 'desktop-1';
    this.windowSpaceMapping = {};
    this.entrySnapshots = new Map();
    this.abortController = null;

    this.init();
  }

  init() {
    this.loadState();
    this.buildUI();
    this.setupEventListeners();
    requestAnimationFrame(() => this.applyActiveSpace());
  }

  loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY_SPACES) || 'null');
      if (Array.isArray(stored?.spaces) && stored.spaces.length) {
        this.spaces = stored.spaces.map((s, i) => ({
          id: String(s.id || `desktop-${i + 1}`),
          name: s.name || (i === 0 ? 'Desktop' : (i === 1 ? 'Keynote' : (i === 2 ? 'Freeform' : `Desktop ${i + 1}`)))
        }));
        this.activeSpaceId = String(stored.activeSpaceId || this.spaces[0].id);
      }
      const windows = JSON.parse(localStorage.getItem(this.STORAGE_KEY_WINDOWS) || '{}');
      this.windowSpaceMapping = Object.fromEntries(Object.entries(windows).map(([id, space]) => [id, String(space)]));
    } catch {
      this.windowSpaceMapping = {};
    }
  }

  saveState() {
    localStorage.setItem(this.STORAGE_KEY_SPACES, JSON.stringify({ spaces: this.spaces, activeSpaceId: this.activeSpaceId }));
    localStorage.setItem(this.STORAGE_KEY_WINDOWS, JSON.stringify(this.windowSpaceMapping));
  }

  buildUI() {
    this.root = document.createElement('section');
    this.root.className = 'mission-control-root';
    this.root.setAttribute('aria-label', 'Mission Control');
    this.root.setAttribute('aria-hidden', 'true');

    this.root.innerHTML = `
      <div class="mission-control-backdrop"></div>
      <div class="mission-control-spaces-bar">
        <div class="mission-control-spaces-list" role="tablist" aria-label="Desktop Spaces"></div>
        <button type="button" class="add-space-btn" aria-label="Add Desktop Space" title="Add Space">
          <span>+</span>
        </button>
      </div>
      <div class="mission-control-badge-container"></div>
    `;

    this.spacesList = this.root.querySelector('.mission-control-spaces-list');
    this.addBtn = this.root.querySelector('.add-space-btn');
    this.badgeContainer = this.root.querySelector('.mission-control-badge-container');

    document.body.append(this.root);

    this.root.querySelector('.mission-control-backdrop').addEventListener('click', () => this.toggle(false));
    this.addBtn.addEventListener('click', () => this.addSpace());
  }

  getWindowId(win) {
    return win.dataset.missionControlId || win.dataset.appId || win.id;
  }

  getWindows() {
    return [...document.querySelectorAll('.app-window')].filter((win) => {
      const id = this.getWindowId(win);
      if (!id) return false;
      const state = win.dataset.windowState || win.__appInstance?.windowState;
      return state !== 'closed';
    });
  }

  ensureSpace(win) {
    const id = this.getWindowId(win);
    const proposed = String(this.windowSpaceMapping[id] || this.activeSpaceId);
    this.windowSpaceMapping[id] = this.spaces.some((s) => s.id === proposed) ? proposed : this.activeSpaceId;
    win.dataset.spaceId = this.windowSpaceMapping[id];
    return win.dataset.spaceId;
  }

  applyActiveSpace() {
    this.getWindows().forEach((win) => {
      const spaceId = this.ensureSpace(win);
      const isHidden = spaceId !== this.activeSpaceId;
      win.dataset.hiddenSpace = String(isHidden);
      if (!this.isActive) {
        if (isHidden) {
          win.style.display = 'none';
        } else if (win.dataset.windowState !== 'minimized') {
          win.style.display = 'flex';
        }
      }
    });
    this.saveState();
  }

  createPreview(space) {
    const button = document.createElement('button');
    button.type = 'button';
    const isActive = space.id === this.activeSpaceId;
    button.className = `space-thumbnail${isActive ? ' is-active' : ''}`;
    button.dataset.spaceId = space.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('aria-label', space.name);

    const preview = document.createElement('div');
    preview.className = 'space-preview';

    // Desktop wallpaper background in miniature
    const wallpaper = document.querySelector('.wallpaper-layer[style*="opacity: 1"]') || document.querySelector('.wallpaper-layer');
    if (wallpaper?.style.backgroundImage) {
      preview.style.backgroundImage = wallpaper.style.backgroundImage;
    } else {
      preview.style.backgroundImage = 'url(/Wallpapers/macOS-Sonoma-Golden-Gate.jpg), linear-gradient(135deg, #f97316 0%, #ec4899 50%, #3b82f6 100%)';
    }

    // Mini window silhouettes with headers
    const spaceWindows = this.getWindows().filter((win) => {
      return this.ensureSpace(win) === space.id && win.dataset.windowState !== 'minimized' && win.style.display !== 'none';
    }).slice(0, 5);

    spaceWindows.forEach((win, index) => {
      const rect = win.getBoundingClientRect();
      const tile = document.createElement('div');
      tile.className = 'space-preview-window';
      
      // Exact relative coordinates for 1:1 layout representation
      const leftPct = (rect.left / window.innerWidth) * 100;
      const topPct = (rect.top / window.innerHeight) * 100;
      const widthPct = (rect.width / window.innerWidth) * 100;
      const heightPct = (rect.height / window.innerHeight) * 100;

      tile.style.left = `${leftPct}%`;
      tile.style.top = `${topPct}%`;
      tile.style.width = `${widthPct}%`;
      tile.style.height = `${heightPct}%`;
      tile.style.zIndex = index + 1;

      // Miniature window header with dots
      const header = document.createElement('div');
      header.className = 'space-preview-header';
      tile.appendChild(header);

      preview.append(tile);
    });

    const label = document.createElement('span');
    label.className = 'space-name';
    label.textContent = space.name;

    button.append(preview, label);
    button.addEventListener('click', () => this.switchSpace(space.id));

    if (this.spaces.length > 1) {
      const close = document.createElement('span');
      close.className = 'close-space';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close space');
      button.append(close);
      close.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeSpace(space.id);
      });
    }

    return button;
  }

  renderSpacesBar() {
    this.spacesList.replaceChildren(...this.spaces.map((space) => this.createPreview(space)));
  }

  addSpace() {
    const newIndex = this.spaces.length + 1;
    this.spaces.push({
      id: `desktop-${Date.now()}`,
      name: `Desktop ${newIndex}`
    });
    this.saveState();
    this.renderSpacesBar();
  }

  removeSpace(spaceId) {
    if (this.spaces.length <= 1) return;
    const fallback = this.spaces.find((s) => s.id !== spaceId).id;
    this.spaces = this.spaces.filter((s) => s.id !== spaceId);

    Object.keys(this.windowSpaceMapping).forEach((id) => {
      if (this.windowSpaceMapping[id] === spaceId) {
        this.windowSpaceMapping[id] = fallback;
      }
    });

    if (this.activeSpaceId === spaceId) {
      this.activeSpaceId = fallback;
    }

    this.applyActiveSpace();
    this.renderSpacesBar();
    this.layoutWindows();
  }

  switchSpace(spaceId) {
    if (!this.spaces.some((s) => s.id === spaceId)) return;
    this.activeSpaceId = spaceId;
    this.applyActiveSpace();
    this.renderSpacesBar();
    if (this.isActive) {
      this.captureWindows();
      this.layoutWindows();
    }
  }

  moveWindowToSpace(id, spaceId) {
    if (!this.spaces.some((s) => s.id === spaceId)) return;
    this.windowSpaceMapping[id] = spaceId;
    this.applyActiveSpace();
    this.renderSpacesBar();
    this.layoutWindows();
  }

  setupEventListeners() {
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey && event.key === 'ArrowUp') || event.key === 'F3') {
        event.preventDefault();
        this.toggle();
      }
      if (event.key === 'Escape' && this.isActive) {
        event.preventDefault();
        this.toggle(false);
      }
      if (this.isActive && (event.key === 'ArrowLeft' || (event.ctrlKey && event.key === 'ArrowLeft'))) {
        const curIdx = this.spaces.findIndex(s => s.id === this.activeSpaceId);
        if (curIdx > 0) this.switchSpace(this.spaces[curIdx - 1].id);
      }
      if (this.isActive && (event.key === 'ArrowRight' || (event.ctrlKey && event.key === 'ArrowRight'))) {
        const curIdx = this.spaces.findIndex(s => s.id === this.activeSpaceId);
        if (curIdx < this.spaces.length - 1) this.switchSpace(this.spaces[curIdx + 1].id);
      }
    });

    window.addEventListener('app-window-opened', () => {
      this.applyActiveSpace();
      if (this.isActive) {
        this.captureWindows();
        this.layoutWindows();
      }
    });

    window.addEventListener('app-window-state-changed', () => {
      this.applyActiveSpace();
      if (this.isActive) {
        this.captureWindows();
        this.layoutWindows();
      }
    });

    window.addEventListener('resize', () => {
      if (this.isActive) {
        this.layoutWindows();
      }
    });
  }

  toggle(force) {
    const next = force ?? !this.isActive;
    if (next === this.isActive) return;
    this.isActive = next;

    document.body.classList.toggle('mission-control-active', next);
    this.root.setAttribute('aria-hidden', String(!next));
    window.dispatchEvent(new CustomEvent('mission-control-toggled', { detail: { isActive: next } }));

    if (next) {
      this.applyActiveSpace();
      this.renderSpacesBar();
      this.captureWindows();
      requestAnimationFrame(() => this.layoutWindows());
    } else {
      this.hideBadge();
      this.restoreWindows();
    }
  }

  captureWindows() {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.entrySnapshots.clear();

    const signal = this.abortController.signal;

    this.getWindows().forEach((win) => {
      const isMinimized = (win.dataset.windowState || win.__appInstance?.windowState) === 'minimized';
      if (win.dataset.hiddenSpace === 'true' || isMinimized || win.style.display === 'none') {
        return;
      }

      const rect = win.getBoundingClientRect();
      this.entrySnapshots.set(win, {
        left: win.style.left,
        top: win.style.top,
        transform: win.style.transform,
        transition: win.style.transition,
        zIndex: win.style.zIndex,
        rect
      });

      win.classList.add('mission-control-card');
      win.style.left = `${rect.left}px`;
      win.style.top = `${rect.top}px`;
      win.style.transform = 'none';
      win.style.zIndex = '2147483002';

      win.addEventListener('pointerdown', (event) => this.interactWithCard(event, win), { capture: true, signal });
      win.addEventListener('mouseenter', () => this.showBadge(win), { signal });
      win.addEventListener('mouseleave', () => this.hideBadge(), { signal });
    });
  }

  /**
   * macOS Golden Gate Organic Center-Packed Window Layout Algorithm
   * Eliminates quadrant voids by grouping windows into balanced, centered rows with uniform spacing.
   */
  layoutWindows() {
    if (!this.isActive) return;
    const windows = [...this.entrySnapshots.keys()].filter((win) => win.dataset.hiddenSpace !== 'true');
    if (!windows.length) return;

    const topLimit = 142; // Below the Spaces bar
    const bottomLimit = window.innerHeight - 84; // Above the Dock
    const availableWidth = window.innerWidth - 64;
    const availableHeight = bottomLimit - topLimit;
    const count = windows.length;

    // 1. Group windows into balanced rows
    let rowSizes = [];
    const maxRows = Math.max(1, Math.ceil(Math.sqrt(count * 0.7)));
    const maxCols = Math.ceil(count / maxRows);
    
    let remaining = count;
    while (remaining > 0) {
      const toAdd = Math.min(maxCols, remaining);
      rowSizes.push(toAdd);
      remaining -= toAdd;
    }

    // Partition windows array into rows
    const rows = [];
    let curIndex = 0;
    rowSizes.forEach(size => {
      rows.push(windows.slice(curIndex, curIndex + size));
      curIndex += size;
    });

    // 2. Compute optimal uniform scale
    const gapX = 28;
    const gapY = 24;

    // Find the scale that fits both horizontally and vertically
    let bestScale = 0.85;
    for (let s = 0.90; s >= 0.15; s -= 0.02) {
      let fits = true;
      let totalStackHeight = 0;

      for (const row of rows) {
        let rowWidth = 0;
        let maxRowHeight = 0;
        row.forEach(win => {
          const snap = this.entrySnapshots.get(win);
          rowWidth += snap.rect.width * s;
          maxRowHeight = Math.max(maxRowHeight, snap.rect.height * s);
        });
        rowWidth += (row.length - 1) * gapX;
        if (rowWidth > availableWidth) {
          fits = false;
          break;
        }
        totalStackHeight += maxRowHeight;
      }
      totalStackHeight += (rows.length - 1) * gapY;

      if (fits && totalStackHeight <= availableHeight) {
        bestScale = s;
        break;
      }
      bestScale = s;
    }

    // 3. Compute total height and vertical centering
    const rowHeights = rows.map(row => {
      return Math.max(...row.map(w => this.entrySnapshots.get(w).rect.height * bestScale));
    });
    const totalContentHeight = rowHeights.reduce((a, b) => a + b, 0) + (rows.length - 1) * gapY;
    let currentY = topLimit + Math.max(10, (availableHeight - totalContentHeight) / 2);

    // 4. Position each window in its row, centered horizontally
    rows.forEach((row, rIdx) => {
      const rowHeight = rowHeights[rIdx];
      const scaledWidths = row.map(w => this.entrySnapshots.get(w).rect.width * bestScale);
      const totalRowWidth = scaledWidths.reduce((a, b) => a + b, 0) + (row.length - 1) * gapX;
      let currentX = Math.max(32, (window.innerWidth - totalRowWidth) / 2);

      row.forEach((win, cIdx) => {
        const snap = this.entrySnapshots.get(win);
        const scaledW = scaledWidths[cIdx];
        const scaledH = snap.rect.height * bestScale;

        // Vertically center inside the row
        const winY = currentY + (rowHeight - scaledH) / 2;
        const targetCenterX = currentX + scaledW / 2;
        const targetCenterY = winY + scaledH / 2;

        const origCenterX = snap.rect.left + snap.rect.width / 2;
        const origCenterY = snap.rect.top + snap.rect.height / 2;

        const deltaX = Math.round(targetCenterX - origCenterX);
        const deltaY = Math.round(targetCenterY - origCenterY);

        win.style.setProperty('--mc-x', `${deltaX}px`);
        win.style.setProperty('--mc-y', `${deltaY}px`);
        win.style.setProperty('--mc-scale', bestScale.toFixed(3));

        currentX += scaledW + gapX;
      });

      currentY += rowHeight + gapY;
    });
  }

  showBadge(win) {
    if (!this.isActive) return;
    const appId = this.getWindowId(win);
    const titleEl = win.querySelector('.app-title');
    const appName = titleEl?.textContent || appId;

    let badge = this.badgeContainer.querySelector('.mission-control-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'mission-control-badge';
      this.badgeContainer.appendChild(badge);
    }

    badge.innerHTML = `<span class="badge-title">${appName}</span>`;

    // Position badge directly above the scaled window card
    const rect = win.getBoundingClientRect();
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${Math.max(138, rect.top - 34)}px`;
    badge.style.opacity = '1';
    badge.style.transform = 'translate(-50%, 0) scale(1)';
  }

  hideBadge() {
    const badge = this.badgeContainer.querySelector('.mission-control-badge');
    if (badge) {
      badge.style.opacity = '0';
      badge.style.transform = 'translate(-50%, 4px) scale(0.95)';
    }
  }

  interactWithCard(event, win) {
    if (!this.isActive || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const origin = { x: event.clientX, y: event.clientY, moved: false };
    const signal = this.abortController.signal;

    const move = (e) => {
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) {
        origin.moved = true;
        win.classList.add('is-moving');
        this.root.classList.add('is-dragging');
        this.hideBadge();

        const spaceTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.space-thumbnail');
        this.spacesList.querySelectorAll('.space-thumbnail').forEach(th => {
          th.classList.toggle('drop-target', th === spaceTarget);
        });

        const addTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.add-space-btn');
        this.addBtn.classList.toggle('drop-target', Boolean(addTarget));
      }
    };

    const up = (e) => {
      this.spacesList.querySelectorAll('.space-thumbnail').forEach(th => th.classList.remove('drop-target'));
      this.addBtn.classList.remove('drop-target');

      if (origin.moved) {
        const space = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-space-id]');
        const addTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.add-space-btn');

        if (space) {
          this.moveWindowToSpace(this.getWindowId(win), space.dataset.spaceId);
        } else if (addTarget) {
          // Drag to + creates a new space and drops the window into it!
          const newId = `desktop-${Date.now()}`;
          this.spaces.push({ id: newId, name: `Desktop ${this.spaces.length + 1}` });
          this.windowSpaceMapping[this.getWindowId(win)] = newId;
          this.saveState();
          this.renderSpacesBar();
          this.layoutWindows();
        }
      } else {
        const appId = this.getWindowId(win);
        const geomMgr = window.windowGeometryManager || windowGeometryManager;
        
        // Toggle false first (which calls restoreWindows), THEN bring to front
        this.toggle(false);
        
        if (geomMgr) {
          geomMgr.bringToFront(appId);
        } else {
          win.__appInstance?.bringToFront?.();
        }
      }

      win.classList.remove('is-moving');
      this.root.classList.remove('is-dragging');
    };

    document.addEventListener('pointermove', move, { capture: true, signal });
    document.addEventListener('pointerup', up, { capture: true, once: true, signal });
  }

  restoreWindows() {
    this.abortController?.abort();
    this.entrySnapshots.forEach((snapshot, win) => {
      win.classList.remove('mission-control-card', 'is-moving');
      win.style.left = snapshot.left;
      win.style.top = snapshot.top;
      win.style.transform = snapshot.transform;
      win.style.transition = snapshot.transition;
      win.style.zIndex = snapshot.zIndex;
      win.style.removeProperty('--mc-x');
      win.style.removeProperty('--mc-y');
      win.style.removeProperty('--mc-scale');
    });
    this.entrySnapshots.clear();
    this.applyActiveSpace();
  }
}

// Global instance
window.missionControl = window.missionControl || new MissionControl();
