/**
 * DocumentVaultExplorer - Corporate Document Vault
 * Features:
 * - Tied to system Light/Dark mode
 * - Collapsible Vault sidebar with bottom-aligned Sync button
 * - Floating Liquid Glass capsules per page (Top Nav bar, FAB, Filter pills, Dynamic Island)
 * - macOS File Manager Dashboard (Root = Folders only; Inside = Subfolders + Files)
 * - Grid View (with animated reference folder cards & liquid glass thumbnail file cards)
 * - macOS Finder List View (with columns: Name, Date Modified, Reference, Kind, Status)
 */

export class DocumentVaultExplorer {
  constructor(appInstance) {
    this.app = appInstance;
    this.container = null;
    this.directories = [];
    this.documents = [];
    this.currentNavPage = 'dashboard'; // 'dashboard', 'all', 'inward', 'outward', 'trails'
    this.selectedDirId = null;
    this.selectedDocIds = new Set();
    this.searchQuery = '';
    this.activeFilterChip = 'ALL';
    this.activeSort = 'recent'; // 'recent', 'name', 'inward', 'outward'
    this.breadcrumbPath = []; // [{ id, name }]
    this.viewMode = 'grid'; // 'grid' | 'list' | 'columns'
    this.expandedDirs = new Set([1, 9]); // Default expand HR and Dr. Jashobanta so users see the tree
    this.selectedColumnPath = [1, 9]; // Default column path
    this.selectedColumnFile = null;
    this.sidebarCollapsed = false;
    this.fabMenuOpen = false;

    // History navigation stack
    this.history = [];
    this.historyIdx = -1;

    this.ensureStylesheet();
  }

  ensureStylesheet() {
    if (typeof document !== 'undefined' && !document.getElementById('docVaultCss')) {
      const link = document.createElement('link');
      link.id = 'docVaultCss';
      link.rel = 'stylesheet';
      link.href = 'modules/compliance/css/document-vault.css';
      document.head.appendChild(link);
    }
  }

  formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getAuthHeaders() {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
      : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // Dynamic folder color
  getFolderColor(name = '') {
    const letter = (name[0] || 'A').toUpperCase();
    if (['A', 'B'].includes(letter)) return { hex: '#3b82f6', bg: 'linear-gradient(135deg, #1d4ed8, #60a5fa)', tint: 'rgba(59, 130, 246, 0.25)' };
    if (['C', 'D'].includes(letter)) return { hex: '#10b981', bg: 'linear-gradient(135deg, #047857, #34d399)', tint: 'rgba(16, 185, 129, 0.25)' };
    if (['E', 'F', 'G'].includes(letter)) return { hex: '#f59e0b', bg: 'linear-gradient(135deg, #b45309, #fbbf24)', tint: 'rgba(245, 158, 11, 0.25)' };
    if (['H', 'I', 'J', 'K'].includes(letter)) return { hex: '#8b5cf6', bg: 'linear-gradient(135deg, #6d28d9, #a78bfa)', tint: 'rgba(139, 92, 246, 0.25)' };
    if (['L', 'M', 'N', 'P'].includes(letter)) return { hex: '#ec4899', bg: 'linear-gradient(135deg, #be185d, #f472b6)', tint: 'rgba(236, 72, 153, 0.25)' };
    return { hex: '#06b6d4', bg: 'linear-gradient(135deg, #0e7490, #22d3ee)', tint: 'rgba(6, 182, 212, 0.25)' };
  }

  // Clean tags and summary
  generateTagsAndSummary(doc) {
    const text = `${doc.title || ''} ${doc.subject || ''} ${doc.sender_party || ''} ${doc.recipient_party || ''}`.toLowerCase();
    const tags = new Set();

    if (doc.direction === 'INWARD') tags.add('Inward');
    if (doc.direction === 'OUTWARD') tags.add('Outward');
    if (text.includes('ayush') || text.includes('drug')) tags.add('AYUSH');
    if (text.includes('inspection') || text.includes('audit')) tags.add('Inspection');
    if (text.includes('gmp') || text.includes('schedule t')) tags.add('GMP');
    if (text.includes('appointment') || text.includes('joining')) tags.add('HR');
    if (text.includes('license') || text.includes('statutory')) tags.add('Statutory');
    if (text.includes('tax') || text.includes('invoice') || text.includes('gst')) tags.add('Tax');
    if (text.includes('boiler') || text.includes('factory')) tags.add('Plant');
    if (tags.size === 0) tags.add('General');

    let customTags = [];
    if (doc.tags_json) {
      try { customTags = JSON.parse(doc.tags_json); } catch (_) {}
    }
    customTags.forEach(t => tags.add(t));

    const summary = doc.subject || (doc.title ? `${doc.title} (${doc.direction})` : 'Document record');

    return { tags: Array.from(tags), summary };
  }

  // Detect dark/light mode from macOS desktop state
  isDarkMode() {
    if (typeof document === 'undefined') return false;
    const body = document.body;
    const docEl = document.documentElement;

    // 1. Explicit light theme indicators from macOS desktop
    if (body?.classList.contains('light-theme') || 
        body?.getAttribute('data-theme') === 'light' || 
        docEl?.getAttribute('data-theme') === 'light' ||
        docEl?.getAttribute('data-macos-theme') === 'light') {
      return false;
    }

    // 2. Explicit dark theme indicators from macOS desktop
    if (body?.classList.contains('dark-theme') || 
        body?.getAttribute('data-theme') === 'dark' || 
        docEl?.getAttribute('data-theme') === 'dark' ||
        docEl?.getAttribute('data-macos-theme') === 'dark') {
      return true;
    }

    // 3. Fallback: Default to false (Light Theme)
    return false;
  }

  applyThemeClasses() {
    const root = this.container?.querySelector('.vault-root');
    if (!root) return;
    const dark = this.isDarkMode();
    root.classList.toggle('dark-mode', dark);
  }

  async render(targetEl) {
    this.container = targetEl;
    this.ensureStylesheet();

    this.container.innerHTML = `
      <div class="vault-root ${this.isDarkMode() ? 'dark-mode' : ''}">
        <!-- Floating Expand Pill (Visible when sidebar is collapsed) -->
        <button class="vault-sidebar-expand-pill" id="vaultSidebarExpandBtn" title="Show Sidebar" style="display: none;">
          <span>›</span>
        </button>

        <!-- Floating Circular '+' Action Button -->
        <div class="vault-fab-wrapper">
          <div class="vault-fab-menu" id="vaultFabMenu" style="display: none;">
            <button class="vault-fab-item" id="vaultFabNewDoc">
              <span>📝</span>
              <span>New Document</span>
            </button>
            <button class="vault-fab-item" id="vaultFabUpload">
              <span>📤</span>
              <span>Upload File</span>
            </button>
            <button class="vault-fab-item" id="vaultFabNewFolder">
              <span>📁</span>
              <span>New Folder</span>
            </button>
            <button class="vault-fab-item" id="vaultFabNewTrail">
              <span>🔗</span>
              <span>Link Trail</span>
            </button>
          </div>
          <button class="vault-fab-btn" id="vaultFabBtn" title="Actions">
            <span class="vault-fab-icon">＋</span>
          </button>
        </div>

        <!-- Floating Selection Capsule Bar (Appears when items checked) -->
        <div class="vault-floating-batch-bar" id="vaultBatchToolbar" style="display: none;">
          <span class="vault-batch-count" id="vaultBatchCount">0 Selected</span>
          <button class="vault-batch-btn" data-batch="MOVE">Move</button>
          <button class="vault-batch-btn" data-batch="SEAL">Seal</button>
          <button class="vault-batch-btn danger" data-batch="DELETE">Delete</button>
        </div>

        <!-- Master Split Layout: Sidebar + Viewport -->
        <div class="vault-layout">
          <!-- Collapsible Sidebar with Bottom Sync Button -->
          <aside class="vault-sidebar" id="vaultSidebar">
            <!-- Sidebar Header with Brand & Collapse Button -->
            <div class="vault-sidebar-brand">
              <div class="vault-brand-left">
                <div class="vault-brand-dot"></div>
                <span class="vault-brand-title">Vault</span>
              </div>
              <button class="vault-sidebar-collapse-btn" id="vaultSidebarCollapseBtn" title="Collapse Sidebar">‹</button>
            </div>

            <!-- Navigation Menu -->
            <nav class="vault-nav-menu">
              <button class="vault-nav-item active" data-page="dashboard">
                <span>🏠</span>
                <span>Recents</span>
              </button>
              <button class="vault-nav-item" data-page="all">
                <span>📂</span>
                <span>Folders</span>
                <span class="vault-nav-badge" id="vaultNavAllCount">0</span>
              </button>
              <button class="vault-nav-item" data-page="inward">
                <span>📥</span>
                <span>Inward</span>
                <span class="vault-nav-badge" id="vaultNavInwardCount">0</span>
              </button>
              <button class="vault-nav-item" data-page="outward">
                <span>📤</span>
                <span>Outward</span>
                <span class="vault-nav-badge" id="vaultNavOutwardCount">0</span>
              </button>
              <button class="vault-nav-item" data-page="trails">
                <span>🔗</span>
                <span>Trails</span>
                <span class="vault-nav-badge" id="vaultNavTrailsCount">0</span>
              </button>
            </nav>

            <!-- Quick Access Folder List -->
            <div class="vault-sidebar-section">
              <div class="vault-sidebar-header">
                <span>DIRECTORIES</span>
                <button class="vault-sidebar-add-btn" id="vaultSidebarAddFolderBtn" title="New Folder">＋</button>
              </div>
              <div class="vault-folder-list" id="vaultSidebarFolderList"></div>
            </div>

            <!-- Sidebar Bottom Footer: Sync / Refresh Button (Requirement 4) -->
            <div class="vault-sidebar-footer">
              <button class="vault-sidebar-refresh-btn" id="vaultSidebarRefreshBtn" title="Sync Vault">
                <span class="vault-refresh-icon">↻</span>
                <span class="vault-refresh-text">Sync Vault</span>
              </button>
            </div>
          </aside>

          <!-- Main Viewport -->
          <main class="vault-viewport" id="vaultMainViewport">
            <!-- Rendered dynamically -->
          </main>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.setupThemeObserver();
    await this.loadData();
    this.recordHistory('dashboard', null);
  }

  setupThemeObserver() {
    if (typeof MutationObserver !== 'undefined' && document.body) {
      this.themeObserver = new MutationObserver(() => this.applyThemeClasses());
      this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      if (document.documentElement) {
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-macos-theme'] });
      }
    }
    this.themeChangeHandler = () => this.applyThemeClasses();
    window.addEventListener('macos-theme-changed', this.themeChangeHandler);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.includes('macos_theme')) this.applyThemeClasses();
    });
  }

  attachEventListeners() {
    const fabBtn = this.container.querySelector('#vaultFabBtn');
    const fabMenu = this.container.querySelector('#vaultFabMenu');

    // FAB Toggle
    fabBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fabMenuOpen = !this.fabMenuOpen;
      fabMenu.style.display = this.fabMenuOpen ? 'flex' : 'none';
      fabBtn.classList.toggle('active', this.fabMenuOpen);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.vault-fab-wrapper')) {
        if (fabMenu) fabMenu.style.display = 'none';
        fabBtn?.classList.remove('active');
        this.fabMenuOpen = false;
      }
    });

    // FAB actions
    this.container.querySelector('#vaultFabNewDoc')?.addEventListener('click', () => {
      fabMenu.style.display = 'none';
      this.fabMenuOpen = false;
      this.openDocumentEditorModal();
    });

    this.container.querySelector('#vaultFabUpload')?.addEventListener('click', () => {
      fabMenu.style.display = 'none';
      this.fabMenuOpen = false;
      this.openUploadDocumentModal();
    });

    this.container.querySelector('#vaultFabNewFolder')?.addEventListener('click', () => {
      fabMenu.style.display = 'none';
      this.fabMenuOpen = false;
      this.openCreateFolderPrompt(this.selectedDirId);
    });

    this.container.querySelector('#vaultFabNewTrail')?.addEventListener('click', () => {
      fabMenu.style.display = 'none';
      this.fabMenuOpen = false;
      this.openNewPaperTrailModal();
    });

    // Sidebar Collapse / Expand (Requirement 2)
    const sidebar = this.container.querySelector('#vaultSidebar');
    const collapseBtn = this.container.querySelector('#vaultSidebarCollapseBtn');
    const expandPill = this.container.querySelector('#vaultSidebarExpandBtn');

    collapseBtn?.addEventListener('click', () => {
      this.sidebarCollapsed = true;
      sidebar.classList.add('collapsed');
      expandPill.style.display = 'flex';
    });

    expandPill?.addEventListener('click', () => {
      this.sidebarCollapsed = false;
      sidebar.classList.remove('collapsed');
      expandPill.style.display = 'none';
    });

    // Sidebar Refresh Button (Requirement 4)
    this.container.querySelector('#vaultSidebarRefreshBtn')?.addEventListener('click', async () => {
      await this.loadData();
      this.app?.showNotification('Vault synchronized.', 'success');
    });

    // Sidebar add folder button
    this.container.querySelector('#vaultSidebarAddFolderBtn')?.addEventListener('click', () => {
      this.openCreateFolderPrompt();
    });

    // Sidebar Nav items
    this.container.querySelectorAll('.vault-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.vault-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentNavPage = btn.dataset.page;
        this.selectedDirId = null;
        this.breadcrumbPath = [];
        this.recordHistory(this.currentNavPage, null);
        this.renderActivePage();
      });
    });

    // Batch toolbar
    this.container.querySelectorAll('[data-batch]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handleBatchAction(btn.dataset.batch);
      });
    });

    // Keyboard shortcuts
    this.keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = this.container.querySelector('.vault-nav-search-input, #vaultHeroSearchInput');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // Navigation history tracker
  recordHistory(page, dirId) {
    if (this.historyIdx >= 0 && this.historyIdx < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIdx + 1);
    }
    this.history.push({ page, dirId, breadcrumb: [...this.breadcrumbPath] });
    this.historyIdx = this.history.length - 1;
  }

  navigateBack() {
    if (this.historyIdx > 0) {
      this.historyIdx--;
      const step = this.history[this.historyIdx];
      this.currentNavPage = step.page;
      this.selectedDirId = step.dirId;
      this.breadcrumbPath = [...step.breadcrumb];
      this.syncSidebarActiveNav();
      this.renderActivePage();
    }
  }

  navigateForward() {
    if (this.historyIdx < this.history.length - 1) {
      this.historyIdx++;
      const step = this.history[this.historyIdx];
      this.currentNavPage = step.page;
      this.selectedDirId = step.dirId;
      this.breadcrumbPath = [...step.breadcrumb];
      this.syncSidebarActiveNav();
      this.renderActivePage();
    }
  }

  syncSidebarActiveNav() {
    this.container?.querySelectorAll('.vault-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === this.currentNavPage);
    });
  }

  async loadData() {
    try {
      const [dirsRes, docsRes] = await Promise.all([
        fetch('/api/compliance/vault/directories', { headers: this.getAuthHeaders(), credentials: 'same-origin' }),
        fetch('/api/compliance/vault/documents', { headers: this.getAuthHeaders(), credentials: 'same-origin' })
      ]);

      if (dirsRes.ok) {
        const dirsData = await dirsRes.json();
        this.directories = dirsData.directories || [];
      }

      if (docsRes.ok) {
        const docsData = await docsRes.json();
        this.documents = docsData.documents || [];
      }

      this.updateSidebar();
      this.renderActivePage();
    } catch (err) {
      console.warn('[Vault] Load error:', err.message);
    }
  }

  updateSidebar() {
    const allEl = this.container.querySelector('#vaultNavAllCount');
    const inwardEl = this.container.querySelector('#vaultNavInwardCount');
    const outwardEl = this.container.querySelector('#vaultNavOutwardCount');
    const trailsEl = this.container.querySelector('#vaultNavTrailsCount');

    if (allEl) allEl.textContent = this.documents.length;
    if (inwardEl) inwardEl.textContent = this.documents.filter(d => d.direction === 'INWARD').length;
    if (outwardEl) outwardEl.textContent = this.documents.filter(d => d.direction === 'OUTWARD').length;
    if (trailsEl) trailsEl.textContent = this.documents.filter(d => (d.trail_count || 0) > 0).length;

    const listEl = this.container.querySelector('#vaultSidebarFolderList');
    if (!listEl) return;

    // Show folders tree in sidebar
    const rootFolders = this.directories.filter(d => !d.parent_id);

    if (rootFolders.length === 0) {
      listEl.innerHTML = `<div style="padding: 6px 10px; color: #94a3b8; font-size: 11px;">No folders</div>`;
      return;
    }

    const renderFolderBranch = (folder, level = 0) => {
      const isSelected = this.selectedDirId === folder.id;
      const count = this.documents.filter(doc => Number(doc.dir_id) === Number(folder.id)).length;
      const color = this.getFolderColor(folder.name);
      const subfolders = this.directories.filter(d => Number(d.parent_id) === Number(folder.id));
      const hasSubfolders = subfolders.length > 0;
      const isExpanded = this.expandedDirs.has(folder.id);

      let branchHtml = `
        <div class="vault-sidebar-folder-item ${isSelected ? 'active' : ''}" data-dir-id="${folder.id}" style="padding-left: ${8 + level * 10}px;">
          ${hasSubfolders ? `
            <button class="vault-tree-chevron ${isExpanded ? 'expanded' : ''}" data-sidebar-toggle="${folder.id}">›</button>
          ` : `
            <span class="vault-folder-dot" style="background: ${color.hex};"></span>
          `}
          <span class="vault-sidebar-folder-name" title="${folder.name}">${folder.name}</span>
          <span class="vault-sidebar-folder-count">${count}</span>
          <button class="vault-sidebar-folder-opt" data-opt-dir="${folder.id}">⋯</button>
        </div>
      `;

      if (hasSubfolders && isExpanded) {
        branchHtml += `<div class="vault-sidebar-tree-branch">`;
        subfolders.sort((a, b) => a.name.localeCompare(b.name)).forEach(child => {
          branchHtml += renderFolderBranch(child, level + 1);
        });
        branchHtml += `</div>`;
      }
      return branchHtml;
    };

    let html = '';
    const sorted = [...rootFolders].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(d => {
      html += renderFolderBranch(d, 0);
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-sidebar-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dirId = Number(btn.dataset.sidebarToggle);
        if (this.expandedDirs.has(dirId)) {
          this.expandedDirs.delete(dirId);
        } else {
          this.expandedDirs.add(dirId);
        }
        this.updateSidebar();
      });
    });

    listEl.querySelectorAll('.vault-sidebar-folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.vault-sidebar-folder-opt') || e.target.closest('[data-sidebar-toggle]')) return;
        const dirId = Number(item.dataset.dirId);
        this.drillIntoDirectory(dirId);
      });
    });

    listEl.querySelectorAll('[data-opt-dir]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFolderOptionsModal(Number(btn.dataset.optDir));
      });
    });
  }

  renderActivePage() {
    const viewport = this.container.querySelector('#vaultMainViewport');
    if (!viewport) return;

    if (this.currentNavPage === 'dashboard') {
      this.renderDashboard(viewport);
    } else if (this.currentNavPage === 'trails') {
      this.renderTrailsPage(viewport);
    } else {
      this.renderDirectoryFileManager(viewport);
    }
  }

  // =========================================================================
  // 1. DASHBOARD: Recents Hub with Search, Sort, Filter, and Recent Items
  // =========================================================================
  renderDashboard(viewport) {
    let docs = [...this.documents];

    if (this.searchQuery) {
      docs = docs.filter(d =>
        (d.doc_ref_no || '').toLowerCase().includes(this.searchQuery) ||
        (d.title || '').toLowerCase().includes(this.searchQuery) ||
        (d.subject || '').toLowerCase().includes(this.searchQuery) ||
        (d.sender_party || '').toLowerCase().includes(this.searchQuery) ||
        (d.recipient_party || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (this.activeFilterChip === 'INWARD') {
      docs = docs.filter(d => d.direction === 'INWARD');
    } else if (this.activeFilterChip === 'OUTWARD') {
      docs = docs.filter(d => d.direction === 'OUTWARD');
    } else if (this.activeFilterChip === 'SEALED') {
      docs = docs.filter(d => d.status === 'SEALED_OFFICIAL');
    }

    if (this.activeSort === 'name') {
      docs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (this.activeSort === 'inward') {
      docs.sort((a, b) => (a.direction === 'INWARD' ? -1 : 1));
    } else if (this.activeSort === 'outward') {
      docs.sort((a, b) => (a.direction === 'OUTWARD' ? -1 : 1));
    }

    let rootDirs = this.directories.filter(d => !d.parent_id);
    if (this.searchQuery) {
      rootDirs = rootDirs.filter(d => d.name.toLowerCase().includes(this.searchQuery));
    }

    viewport.innerHTML = `
      <div style="position: relative; width: 100%; max-width: 1200px; margin: 0 auto;">
        <!-- Ambient Glowing Aura -->
        <div class="gemini-ambient-aura"></div>

        <!-- Central Clean Hero Title -->
        <div class="gemini-hero-block">
          <div class="gemini-hero-sparkle">✦</div>
          <h1 class="gemini-hero-title">Vault</h1>
        </div>

        <!-- Search Capsule with Built-in Sorting & Cmd+K -->
        <div class="gemini-search-capsule">
          <span class="gemini-search-icon">🔍</span>
          <input
            type="text"
            class="gemini-search-input"
            id="vaultHeroSearchInput"
            placeholder="Search files and folders... (⌘K)"
            value="${this.searchQuery}"
            autocomplete="off"
          >
          ${this.searchQuery ? `<button class="gemini-search-clear" id="vaultHeroClearBtn">✕</button>` : ''}

          <div class="gemini-search-divider"></div>

          <!-- Built-in Sort Selector -->
          <select class="gemini-search-select" id="vaultSortSelect">
            <option value="recent" ${this.activeSort === 'recent' ? 'selected' : ''}>Recent</option>
            <option value="name" ${this.activeSort === 'name' ? 'selected' : ''}>Name A–Z</option>
            <option value="inward" ${this.activeSort === 'inward' ? 'selected' : ''}>Inward</option>
            <option value="outward" ${this.activeSort === 'outward' ? 'selected' : ''}>Outward</option>
          </select>
        </div>

        <!-- Filter Chips (Liquid Glass Pills) -->
        <div class="gemini-filter-chips">
          <button class="gemini-chip ${this.activeFilterChip === 'ALL' ? 'active' : ''}" data-chip="ALL">All</button>
          <button class="gemini-chip ${this.activeFilterChip === 'FOLDERS' ? 'active' : ''}" data-chip="FOLDERS">Folders</button>
          <button class="gemini-chip ${this.activeFilterChip === 'INWARD' ? 'active' : ''}" data-chip="INWARD">Inward</button>
          <button class="gemini-chip ${this.activeFilterChip === 'OUTWARD' ? 'active' : ''}" data-chip="OUTWARD">Outward</button>
          <button class="gemini-chip ${this.activeFilterChip === 'SEALED' ? 'active' : ''}" data-chip="SEALED">Sealed</button>
        </div>

        <!-- Recents Mixed Section -->
        <div style="position: relative; z-index: 2;">
          <div class="vault-section-title">Recents</div>
          <div class="vault-grid">
            ${this.renderMixedGrid(rootDirs, docs)}
          </div>
        </div>
      </div>
    `;

    this.attachDashboardEvents(viewport);
  }

  renderMixedGrid(dirs, docs) {
    const showFolders = this.activeFilterChip === 'ALL' || this.activeFilterChip === 'FOLDERS';
    const showDocs = this.activeFilterChip !== 'FOLDERS';

    const recentDirs = showFolders ? dirs.slice(0, 4) : [];
    const recentDocs = showDocs ? docs.slice(0, 8) : [];

    if (recentDirs.length === 0 && recentDocs.length === 0) {
      return `
        <div class="gemini-empty-grid">
          <div style="font-size: 28px; margin-bottom: 6px;">📂</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">No matching records found</div>
        </div>
      `;
    }

    let itemsHtml = '';

    // Folder Cards matching reference image
    recentDirs.forEach(dir => {
      itemsHtml += this.buildFolderCardHtml(dir);
    });

    // File Cards with visual document thumbnail
    recentDocs.forEach(doc => {
      itemsHtml += this.buildFileCardHtml(doc);
    });

    return itemsHtml;
  }

  // Folder card with granular interactive floating switcher and subfolder previews
  buildFolderCardHtml(dir) {
    const color = this.getFolderColor(dir.name);
    
    // Helper to get all descendant directory IDs recursively
    const getDescendantDirIds = (dirId) => {
      let ids = [Number(dirId)];
      const children = (this.directories || []).filter(d => Number(d.parent_id) === Number(dirId));
      for (const ch of children) {
        ids = ids.concat(getDescendantDirIds(ch.id));
      }
      return ids;
    };

    const allDirIds = getDescendantDirIds(dir.id);
    const directChildDirs = (this.directories || []).filter(d => Number(d.parent_id) === Number(dir.id));
    const directFiles = (this.documents || []).filter(d => Number(d.dir_id) === Number(dir.id));
    const allNestedFiles = (this.documents || []).filter(d => allDirIds.includes(Number(d.dir_id)));

    // Gather preview items: subfolders first, then direct files, then nested files
    const previewItems = [];
    
    // Add direct subfolders
    directChildDirs.forEach(subDir => {
      if (previewItems.length < 3) {
        const subDescendantIds = getDescendantDirIds(subDir.id);
        const subFiles = (this.documents || []).filter(d => subDescendantIds.includes(Number(d.dir_id)));
        previewItems.push({
          kind: 'folder',
          data: subDir,
          subFileCount: subFiles.length,
          color: this.getFolderColor(subDir.name)
        });
      }
    });

    // Add direct files
    directFiles.forEach(file => {
      if (previewItems.length < 3) {
        previewItems.push({
          kind: 'file',
          data: file
        });
      }
    });

    // If still room, add nested files from subdirectories
    if (previewItems.length < 3) {
      allNestedFiles.forEach(file => {
        if (previewItems.length < 3 && !previewItems.some(item => item.kind === 'file' && item.data.id === file.id)) {
          previewItems.push({
            kind: 'file',
            data: file
          });
        }
      });
    }

    const count = allNestedFiles.length;
    const subFolderCount = directChildDirs.length;
    const letter = (dir.name[0] || 'A').toUpperCase();

    // Stacked preview sheets (up to 3 items) with granular hover switcher
    let stackHtml = '';
    if (previewItems.length === 0) {
      stackHtml = `<div class="folder-files-stack empty"></div>`;
    } else {
      stackHtml = `<div class="folder-files-stack has-files" data-cover-flow-trigger="${dir.id}" title="Click to browse in 3D Cover Flow">`;
      // Sheet 3 (furthest back)
      if (previewItems.length >= 3) {
        stackHtml += this.buildStackItemHtml(previewItems[2], 'sheet-3');
      }
      // Sheet 2 (middle)
      if (previewItems.length >= 2) {
        stackHtml += this.buildStackItemHtml(previewItems[1], 'sheet-2');
      }
      // Sheet 1 (front)
      stackHtml += this.buildStackItemHtml(previewItems[0], 'sheet-1');
      stackHtml += '</div>';
    }

    // Sub-folder count indicator
    let folderCountTag = '';
    if (subFolderCount > 0) {
      folderCountTag = `<span>${subFolderCount} ${subFolderCount === 1 ? 'subfolder' : 'subfolders'} • ${count} ${count === 1 ? 'file' : 'files'}</span>`;
    } else {
      folderCountTag = `<span>${count} ${count === 1 ? 'file' : 'files'}</span>`;
    }

    return `
      <div class="folder-card ${subFolderCount > 0 ? 'has-subfolders' : ''}" data-open-dir="${dir.id}" style="--folder-color: ${color.hex}; --folder-bg: ${color.bg}; --folder-tint: ${color.tint};">
        <!-- Back Flap with Tab & Letter -->
        <div class="folder-back-flap">
          <div class="folder-tab">
            <span class="folder-tab-letter">[${letter}]</span>
          </div>
        </div>

        <!-- Stacked Floating Sheets (Click to open 3D Cover Flow) -->
        ${stackHtml}

        <!-- Frosted Liquid Glass Front Pocket -->
        <div class="folder-glass-pocket">
          <div class="folder-pocket-header">
            <span class="folder-pocket-title" title="${dir.name}">${dir.name}</span>
            <span class="vault-kind-badge ${subFolderCount > 0 ? 'contains-subfolders' : dir.parent_id ? 'subfolder' : 'folder'}" style="margin-left: auto;">
              📁 ${subFolderCount > 0 ? 'Contains Sub-Folders' : dir.parent_id ? 'Sub-Folder' : 'Folder'}
            </span>
          </div>
          <div class="folder-pocket-footer">
            ${folderCountTag}
            <span class="folder-open-arrow" data-drill-arrow="${dir.id}" title="Open Folder">↗</span>
          </div>
        </div>
      </div>
    `;
  }

  // Build individual floating sheet item for the folder stack
  buildStackItemHtml(item, sheetClass) {
    if (item.kind === 'folder') {
      const subDir = item.data;
      const subColor = item.color || this.getFolderColor(subDir.name);
      return `
        <div class="folder-file-sheet ${sheetClass} folder-item" 
             data-item-kind="folder"
             data-item-id="${subDir.id}"
             style="--subfolder-color: ${subColor.hex};" 
             title="Contains Folder: ${subDir.name} (Click for Cover Flow)">
          <div class="folder-sheet-subfolder-inner" style="background: ${subColor.bg}; border-color: ${subColor.hex};">
            <div class="subfolder-sheet-tab" style="background: ${subColor.hex};">
              <span>📁 ${subDir.name.slice(0, 12)}</span>
            </div>
            <div class="subfolder-sheet-body">
              <div class="subfolder-sheet-icon">📁</div>
              <div class="subfolder-sheet-name">${subDir.name}</div>
              <div class="subfolder-sheet-count">${item.subFileCount} ${item.subFileCount === 1 ? 'file' : 'files'}</div>
            </div>
          </div>
          <div class="folder-sheet-badge folder">📁 FOLDER</div>
        </div>
      `;
    } else {
      const doc = item.data;
      return `
        <div class="folder-file-sheet ${sheetClass} has-thumb file-item" 
             data-item-kind="file"
             data-item-id="${doc.id}"
             title="${doc.title} (Click for Cover Flow)">
          <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
               alt="${doc.title}" 
               class="folder-sheet-thumb-img" 
               loading="lazy" 
               onerror="this.style.display='none';" />
          <div class="folder-sheet-badge">PDF</div>
        </div>
      `;
    }
  }

  // Upgraded Full-Bleed Document Thumbnail Card (Document thumbnail IS the card, with frosted blurs)
  buildFileCardHtml(doc) {
    const { tags } = this.generateTagsAndSummary(doc);
    const isChecked = this.selectedDocIds.has(doc.id);
    const directionIcon = doc.direction === 'INWARD' ? '📥' : doc.direction === 'OUTWARD' ? '📤' : '📄';
    const sizeStr = this.formatFileSize(doc.file_size);

    return `
      <div class="file-card ${isChecked ? 'selected' : ''}" data-file-id="${doc.id}">
        <!-- Full-bleed Document Thumbnail Image (The file thumbnail itself IS the card) -->
        <div class="file-card-thumb-bg">
          <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
               alt="${doc.title}" 
               class="file-card-full-img" 
               loading="lazy" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div class="file-card-img-fallback" style="display:none;">
            <span class="file-fallback-icon">📄</span>
            <span class="file-fallback-code">${doc.doc_ref_no || 'PDF'}</span>
          </div>
        </div>

        <!-- Center Quick Look Button (reveals on hover) -->
        <div class="file-card-quicklook-overlay" data-quick-pdf="${doc.id}">
          <span class="file-card-quicklook-btn">Quick Look ↗</span>
        </div>

        <!-- Faint & Beautiful Frosted Glass Blur Top Header -->
        <div class="file-card-blur-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" class="file-select-box" data-check-id="${doc.id}" ${isChecked ? 'checked' : ''}>
            <span class="file-ref-pill">${doc.doc_ref_no || 'REF'}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="vault-kind-badge pdf">📄 PDF</span>
            <span class="file-direction-tag ${doc.direction?.toLowerCase()}">${directionIcon} ${doc.direction || 'INTERNAL'}</span>
          </div>
        </div>

        <!-- Faint & Beautiful Frosted Glass Blur Bottom Footer -->
        <div class="file-card-blur-footer">
          <div class="file-card-title" title="${doc.title}">${doc.title}</div>
          <div class="file-card-footer-meta">
            <span class="file-meta-sub">${sizeStr !== '—' ? `${sizeStr} • ` : ''}${doc.issue_date || 'Oct 16, 2026'}</span>
            <button class="file-quick-preview-btn" data-quick-pdf="${doc.id}">Preview ↗</button>
          </div>
        </div>
      </div>
    `;
  }

  attachDashboardEvents(viewport) {
    const searchInput = viewport.querySelector('#vaultHeroSearchInput');
    const clearBtn = viewport.querySelector('#vaultHeroClearBtn');
    const sortSelect = viewport.querySelector('#vaultSortSelect');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderDashboard(viewport);
    });

    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.renderDashboard(viewport);
    });

    sortSelect?.addEventListener('change', (e) => {
      this.activeSort = e.target.value;
      this.renderDashboard(viewport);
    });

    viewport.querySelectorAll('.gemini-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeFilterChip = chip.dataset.chip;
        this.renderDashboard(viewport);
      });
    });

    // Folder click -> Arrow drills into folder; Floating sheets open 3D Cover Flow
    viewport.querySelectorAll('[data-open-dir]').forEach(card => {
      card.addEventListener('click', (e) => {
        const dirId = Number(card.dataset.openDir);

        // 1. Arrow clicked: open folder directly
        if (e.target.closest('.folder-open-arrow') || e.target.closest('[data-drill-arrow]')) {
          e.stopPropagation();
          this.drillIntoDirectory(dirId);
          return;
        }

        // 2. Floating files / subfolders stack, sheet, or upper area clicked: 3D Cover Flow
        const clickedSheet = e.target.closest('.folder-file-sheet');
        const clickedStack = e.target.closest('.folder-files-stack');
        const rect = card.getBoundingClientRect();
        const isUpperHalf = (e.clientY - rect.top) < (rect.height * 0.52);

        if (clickedSheet || clickedStack || isUpperHalf) {
          e.stopPropagation();
          const targetItemId = clickedSheet?.dataset.itemId ? Number(clickedSheet.dataset.itemId) : null;
          this.openCoverFlow(dirId, targetItemId);
          return;
        }

        // 3. Otherwise (clicking folder pocket body): drill into folder
        this.drillIntoDirectory(dirId);
      });
    });

    // File Preview
    viewport.querySelectorAll('[data-quick-pdf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPdfPreviewModal(Number(btn.dataset.quickPdf));
      });
    });

    viewport.querySelectorAll('.file-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.file-select-box') || e.target.closest('.file-add-tag-btn') || e.target.closest('.file-tag-pill') || e.target.closest('.file-quick-preview-btn')) return;
        this.openPdfPreviewModal(Number(card.dataset.fileId));
      });
    });

    // Tag filtering
    viewport.querySelectorAll('.file-tag-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.searchQuery = pill.dataset.tag.toLowerCase();
        this.renderDashboard(viewport);
      });
    });

    viewport.querySelectorAll('[data-add-tag]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptAddTag(Number(btn.dataset.addTag));
      });
    });
  }

  drillIntoDirectory(dirId) {
    const dirObj = this.directories.find(d => d.id === dirId);
    if (!dirObj) return;

    this.selectedDirId = dirId;

    // Build complete ancestral breadcrumb path
    const path = [];
    let cur = dirObj;
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name });
      if (cur.parent_id) {
        this.expandedDirs.add(cur.parent_id);
        cur = this.directories.find(d => d.id === cur.parent_id);
      } else {
        cur = null;
      }
    }
    this.breadcrumbPath = path;
    this.selectedColumnPath = path.map(p => p.id);
    this.selectedColumnFile = null;

    this.currentNavPage = 'all';
    this.recordHistory('all', dirId);
    this.updateSidebar();
    this.syncSidebarActiveNav();
    this.renderActivePage();
  }

  // =========================================================================
  // 2. DIRECTORY FILE MANAGER: macOS Finder Dashboard (Requirements 5, 7, 8)
  // - Root level: MULTIPLE FOLDERS ONLY
  // - Inside folders: BOTH SUB-FOLDERS AND FILES
  // - Grid view & macOS Finder List view & macOS Column View
  // =========================================================================
  renderDirectoryFileManager(viewport) {
    const isRoot = this.selectedDirId === null && this.currentNavPage === 'all';
    const canGoBack = this.historyIdx > 0;
    const canGoForward = this.historyIdx < this.history.length - 1;

    // 1. Folders in this view:
    // At root: folders with no parent_id
    // Inside a folder: folders with parent_id === selectedDirId
    let childFolders = [];
    if (this.currentNavPage === 'all') {
      if (isRoot) {
        childFolders = this.directories.filter(d => !d.parent_id);
      } else {
        childFolders = this.directories.filter(d => Number(d.parent_id) === Number(this.selectedDirId));
      }
    }

    // 2. Files in this view:
    let currentFiles = [];
    if (this.currentNavPage === 'inward') {
      currentFiles = this.documents.filter(d => d.direction === 'INWARD');
    } else if (this.currentNavPage === 'outward') {
      currentFiles = this.documents.filter(d => d.direction === 'OUTWARD');
    } else if (!isRoot) {
      currentFiles = this.documents.filter(doc => Number(doc.dir_id) === Number(this.selectedDirId));
    }

    // Apply Search
    if (this.searchQuery) {
      childFolders = childFolders.filter(d => d.name.toLowerCase().includes(this.searchQuery));
      currentFiles = currentFiles.filter(d =>
        (d.doc_ref_no || '').toLowerCase().includes(this.searchQuery) ||
        (d.title || '').toLowerCase().includes(this.searchQuery) ||
        (d.subject || '').toLowerCase().includes(this.searchQuery)
      );
    }

    // Apply Sorting
    if (this.activeSort === 'name') {
      childFolders.sort((a, b) => a.name.localeCompare(b.name));
      currentFiles.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (this.activeSort === 'recent') {
      currentFiles.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    viewport.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column;">
        <!-- Floating Dynamic Liquid Glass Top Navigation Capsule (macOS Finder Toolbar) -->
        <div class="vault-floating-nav-bar">
          <!-- History < > Navigation -->
          <div class="vault-nav-history-group">
            <button class="vault-history-btn" id="vaultHistBackBtn" ${!canGoBack ? 'disabled' : ''} title="Back">‹</button>
            <button class="vault-history-btn" id="vaultHistFwdBtn" ${!canGoForward ? 'disabled' : ''} title="Forward">›</button>
          </div>

          <!-- Breadcrumbs Path -->
          <div class="vault-nav-breadcrumbs">
            <button class="vault-bc-btn ${isRoot ? 'current' : ''}" id="vaultBcRootBtn">Vault</button>
            ${this.breadcrumbPath.map((b, idx) => `
              <span class="vault-bc-sep">›</span>
              <button class="vault-bc-btn ${idx === this.breadcrumbPath.length - 1 ? 'current' : ''}" data-bc-idx="${idx}">${b.name}</button>
            `).join('')}
          </div>

          <!-- View Mode Switcher: Grid vs macOS List vs macOS Column View -->
          <div class="vault-view-switcher">
            <button class="vault-view-btn ${this.viewMode === 'grid' ? 'active' : ''}" id="vaultViewGridBtn" title="Icon Grid View">⊞</button>
            <button class="vault-view-btn ${this.viewMode === 'list' ? 'active' : ''}" id="vaultViewListBtn" title="macOS List View">☰</button>
            <button class="vault-view-btn ${this.viewMode === 'columns' ? 'active' : ''}" id="vaultViewColumnsBtn" title="macOS Column View (Folder Hierarchy)">☷</button>
          </div>

          <!-- Search Input inside Capsule -->
          <div class="vault-nav-search">
            <span style="font-size: 13px; color: #94a3b8;">🔍</span>
            <input
              type="text"
              class="vault-nav-search-input"
              id="vaultNavSearchInput"
              placeholder="Filter..."
              value="${this.searchQuery}"
            >
            ${this.searchQuery ? `<button class="gemini-search-clear" id="vaultNavClearBtn" style="padding:0;">✕</button>` : ''}
          </div>

          <!-- Liquid Glass Action Pills -->
          <div class="vault-nav-actions">
            <button class="vault-pill-btn" id="vaultExplorerNewFolderBtn">＋ Folder</button>
            <button class="vault-pill-btn primary" id="vaultExplorerUploadBtn">＋ Upload</button>
          </div>
        </div>

        <!-- Canvas Body (Grid vs macOS Finder List vs macOS Columns) -->
        <div style="flex: 1; overflow-y: ${this.viewMode === 'columns' ? 'hidden' : 'auto'}; min-height: 0;">
          ${this.viewMode === 'grid' 
            ? this.renderExplorerGridView(childFolders, currentFiles, isRoot) 
            : this.viewMode === 'list' 
            ? this.renderExplorerListView(childFolders, currentFiles, isRoot) 
            : this.renderExplorerColumnsView()}
        </div>
      </div>
    `;

    this.attachExplorerEvents(viewport);
  }

  // Grid view: Folders (reference card) + Files (liquid glass with thumbnail)
  renderExplorerGridView(childFolders, currentFiles, isRoot) {
    if (childFolders.length === 0 && currentFiles.length === 0) {
      return `
        <div class="gemini-empty-grid">
          <div style="font-size: 32px; margin-bottom: 6px;">📂</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">
            ${isRoot ? 'No folders in Vault. Click "＋ Folder" to create one.' : 'This folder is empty.'}
          </div>
        </div>
      `;
    }

    let html = '';

    // 1. Folders Section
    if (childFolders.length > 0) {
      html += `
        <div class="vault-section-title">${isRoot ? 'Directories' : `Sub-Folders (${childFolders.length})`}</div>
        <div class="vault-grid" style="margin-bottom: 30px;">
          ${childFolders.map(d => this.buildFolderCardHtml(d)).join('')}
        </div>
      `;
    }

    // 2. Files Section (Inside folders only)
    if (!isRoot && currentFiles.length > 0) {
      html += `
        <div class="vault-section-title">Documents (${currentFiles.length})</div>
        <div class="vault-grid">
          ${currentFiles.map(doc => this.buildFileCardHtml(doc)).join('')}
        </div>
      `;
    }

    return html;
  }

  // macOS Finder List View (with recursive folder tree disclosure)
  renderExplorerListView(childFolders, currentFiles, isRoot) {
    if (childFolders.length === 0 && currentFiles.length === 0) {
      return `
        <div class="gemini-empty-grid">
          <div style="font-size: 32px; margin-bottom: 6px;">📄</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">Empty folder</div>
        </div>
      `;
    }

    const renderFolderRows = (folders, level = 0) => {
      let rows = '';
      folders.forEach(d => {
        const subDirs = this.directories.filter(child => Number(child.parent_id) === Number(d.id));
        const subFiles = this.documents.filter(doc => Number(doc.dir_id) === Number(d.id));
        const totalItems = subDirs.length + subFiles.length;
        const color = this.getFolderColor(d.name);
        const isExpanded = this.expandedDirs.has(d.id);
        const hasChildren = totalItems > 0;

        rows += `
          <tr class="vault-list-row folder-row" data-open-dir="${d.id}" style="cursor: pointer;">
            <td style="width: 28px; text-align: center;">
              ${hasChildren ? `
                <button class="vault-tree-chevron ${isExpanded ? 'expanded' : ''}" data-tree-toggle="${d.id}" title="Toggle folder">›</button>
              ` : ''}
            </td>
            <td>
              <div class="vault-list-name-cell" style="padding-left: ${level * 22}px;">
                <span class="vault-list-icon-thumb" style="background: ${color.tint}; color: ${color.hex}; font-size: 14px;">📁</span>
                <div>
                  <span class="vault-list-name-text">${d.name}</span>
                  ${d.parent_id ? `<span class="vault-kind-badge subfolder" style="margin-left: 6px;">Sub-Folder</span>` : ''}
                </div>
              </div>
            </td>
            <td class="vault-list-sub">${d.created_at ? d.created_at.split(' ')[0] : '—'}</td>
            <td class="vault-list-sub font-medium" style="color: #0284c7;">${totalItems} ${totalItems === 1 ? 'item' : 'items'}</td>
            <td class="vault-list-sub">
              <span class="vault-kind-badge ${d.parent_id ? 'subfolder' : 'folder'}">📁 ${d.parent_id ? 'Sub-Folder' : 'Folder'}</span>
            </td>
            <td>
              <button class="file-quick-preview-btn" data-drill-btn="${d.id}" style="padding: 2px 8px; font-size: 11px;">Open Folder ↗</button>
            </td>
          </tr>
        `;

        if (isExpanded) {
          if (subDirs.length > 0) {
            rows += renderFolderRows(subDirs, level + 1);
          }
          if (subFiles.length > 0) {
            rows += renderFileRows(subFiles, level + 1);
          }
        }
      });
      return rows;
    };

    const renderFileRows = (files, level = 0) => {
      let rows = '';
      files.forEach(doc => {
        const isChecked = this.selectedDocIds.has(doc.id);
        const sizeStr = this.formatFileSize(doc.file_size);
        rows += `
          <tr class="vault-list-row file-row ${isChecked ? 'selected' : ''}" data-file-id="${doc.id}">
            <td style="width: 28px; text-align: center;">
              <input type="checkbox" class="file-select-box" data-check-id="${doc.id}" ${isChecked ? 'checked' : ''}>
            </td>
            <td>
              <div class="vault-list-name-cell" style="padding-left: ${level * 22}px;">
                <div class="vault-list-doc-thumb-preview" data-quick-pdf="${doc.id}" title="Quick Look: ${doc.title}">
                  <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
                       class="vault-list-mini-thumb" 
                       loading="lazy" 
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" />
                  <span class="vault-list-icon-thumb" style="display:none; background: rgba(239, 68, 68, 0.12); color: #ef4444; font-size: 14px;">📄</span>
                </div>
                <div>
                  <div class="vault-list-name-text" title="${doc.title}">${doc.title}</div>
                  <div class="vault-list-sub" style="font-size: 11px; color: #64748b;">${doc.file_name || doc.subject || ''}</div>
                </div>
              </div>
            </td>
            <td class="vault-list-sub">${doc.issue_date || 'Oct 16, 2026'}</td>
            <td class="vault-list-sub font-mono" style="font-family: monospace; font-size: 11px;">
              ${doc.doc_ref_no || 'REF'} ${sizeStr !== '—' ? `• <span style="color:#0284c7;font-weight:600;">${sizeStr}</span>` : ''}
            </td>
            <td class="vault-list-sub">
              <span class="vault-kind-badge pdf">📄 PDF</span>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="file-status-badge ${doc.status === 'SEALED_OFFICIAL' ? 'sealed' : 'draft'}">
                  ${doc.status === 'SEALED_OFFICIAL' ? 'Sealed' : 'Draft'}
                </span>
                <button class="file-quick-preview-btn" data-quick-pdf="${doc.id}">Preview ↗</button>
              </div>
            </td>
          </tr>
        `;
      });
      return rows;
    };

    return `
      <table class="vault-list-table">
        <thead class="vault-list-header">
          <tr>
            <th style="width: 28px;"></th>
            <th>Name</th>
            <th>Date Modified</th>
            <th>Reference / Size</th>
            <th>Kind</th>
            <th>Status / Actions</th>
          </tr>
        </thead>
        <tbody>
          ${renderFolderRows(childFolders, 0)}
          ${renderFileRows(currentFiles, 0)}
        </tbody>
      </table>
    `;
  }

  // macOS Miller Column View (Dedicated hierarchical view for showing a folder inside a folder)
  renderExplorerColumnsView() {
    const rootFolders = this.directories.filter(d => !d.parent_id).sort((a, b) => a.name.localeCompare(b.name));
    
    // Ensure selectedColumnPath has at least 1 root folder
    if (this.selectedColumnPath.length === 0 && rootFolders.length > 0) {
      this.selectedColumnPath = [rootFolders[0].id];
    }

    let columnsHtml = '';

    // Column 1: Root Folders
    columnsHtml += `
      <div class="vault-column-pane">
        <div class="vault-column-header">
          <span>Vault Root</span>
          <span style="font-size: 10px; color: #94a3b8;">${rootFolders.length} folders</span>
        </div>
        <div class="vault-column-list">
          ${rootFolders.map(dir => {
            const isSelected = this.selectedColumnPath[0] === dir.id;
            const subDirCount = this.directories.filter(d => Number(d.parent_id) === Number(dir.id)).length;
            const docCount = this.documents.filter(doc => Number(doc.dir_id) === Number(dir.id)).length;
            const total = subDirCount + docCount;
            const color = this.getFolderColor(dir.name);
            return `
              <div class="vault-col-item ${isSelected ? 'active' : ''}" data-col-level="0" data-col-dir="${dir.id}">
                <span class="vault-col-thumb" style="color: ${isSelected ? '#fff' : color.hex};">📁</span>
                <span class="vault-col-name" title="${dir.name}">${dir.name}</span>
                <span class="vault-col-sub">${total}</span>
                <span class="vault-col-arrow">›</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Subsequent columns along selectedColumnPath
    for (let level = 0; level < this.selectedColumnPath.length; level++) {
      const parentDirId = this.selectedColumnPath[level];
      const parentDir = this.directories.find(d => d.id === parentDirId);
      if (!parentDir) break;

      const childFolders = this.directories.filter(d => Number(d.parent_id) === Number(parentDirId)).sort((a, b) => a.name.localeCompare(b.name));
      const childFiles = this.documents.filter(doc => Number(doc.dir_id) === Number(parentDirId)).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

      if (childFolders.length === 0 && childFiles.length === 0) {
        columnsHtml += `
          <div class="vault-column-pane">
            <div class="vault-column-header">
              <span title="${parentDir.name}">${parentDir.name}</span>
              <span style="font-size: 10px; color: #94a3b8;">0 items</span>
            </div>
            <div class="vault-column-list" style="display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; text-align: center; padding: 20px;">
              Folder is empty
            </div>
          </div>
        `;
        break;
      }

      const nextSelectedDirId = this.selectedColumnPath[level + 1];

      columnsHtml += `
        <div class="vault-column-pane">
          <div class="vault-column-header">
            <span title="${parentDir.name}">${parentDir.name}</span>
            <span style="font-size: 10px; color: #94a3b8;">${childFolders.length + childFiles.length} items</span>
          </div>
          <div class="vault-column-list">
            <!-- Sub-Folders -->
            ${childFolders.map(dir => {
              const isSelected = nextSelectedDirId === dir.id;
              const subDirCount = this.directories.filter(d => Number(d.parent_id) === Number(dir.id)).length;
              const docCount = this.documents.filter(doc => Number(doc.dir_id) === Number(dir.id)).length;
              const total = subDirCount + docCount;
              const color = this.getFolderColor(dir.name);
              return `
                <div class="vault-col-item ${isSelected ? 'active' : ''}" data-col-level="${level + 1}" data-col-dir="${dir.id}">
                  <span class="vault-col-thumb" style="color: ${isSelected ? '#fff' : color.hex};">📁</span>
                  <span class="vault-col-name" title="${dir.name}">${dir.name}</span>
                  <span class="vault-col-sub">${total}</span>
                  <span class="vault-col-arrow">›</span>
                </div>
              `;
            }).join('')}

            <!-- Files -->
            ${childFiles.map(doc => {
              const isSelected = this.selectedColumnFile?.id === doc.id;
              return `
                <div class="vault-col-item ${isSelected ? 'active' : ''}" data-col-file="${doc.id}">
                  <span class="vault-col-thumb-wrapper">
                    <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
                         class="vault-col-mini-thumb" 
                         loading="lazy" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';" />
                    <span class="vault-col-thumb" style="display:none; color: ${isSelected ? '#fff' : '#ef4444'};">📄</span>
                  </span>
                  <span class="vault-col-name" title="${doc.title}">${doc.title}</span>
                  <span class="vault-kind-badge pdf" style="font-size: 9px; padding: 1px 4px;">PDF</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Inspector Preview Pane (if file selected)
    if (this.selectedColumnFile) {
      const doc = this.selectedColumnFile;
      const sizeStr = this.formatFileSize(doc.file_size);
      columnsHtml += `
        <div class="vault-column-inspector">
          <div class="vault-inspector-hero">
            <div class="vault-inspector-sheet-stage" data-quick-pdf="${doc.id}" title="Click to view full PDF">
              <div class="vault-inspector-sheet">
                <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
                     alt="${doc.title}" 
                     class="vault-inspector-thumb-img" 
                     loading="lazy"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="doc-page-fallback" style="display:none;">
                  <span class="doc-fallback-icon" style="font-size:36px;">📄</span>
                  <span class="doc-fallback-title">${doc.doc_ref_no || 'PDF'}</span>
                </div>
                <div class="doc-sheet-dogear large"></div>
                <div class="vault-inspector-quicklook-overlay">
                  <span>Quick Look ↗</span>
                </div>
              </div>
            </div>
            <div class="vault-inspector-title">${doc.title}</div>
            <div style="font-size: 11px; font-family: monospace; color: #0284c7; margin-top: 4px;">${doc.doc_ref_no || ''}</div>
          </div>

          <div class="vault-inspector-meta">
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">Kind</span>
              <span class="vault-inspector-meta-value"><span class="vault-kind-badge pdf">📄 PDF Document</span></span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">File Size</span>
              <span class="vault-inspector-meta-value">${sizeStr}</span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">File Name</span>
              <span class="vault-inspector-meta-value" title="${doc.file_name || doc.title}">${doc.file_name || 'document.pdf'}</span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">Issue Date</span>
              <span class="vault-inspector-meta-value">${doc.issue_date || 'N/A'}</span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">Party / Agency</span>
              <span class="vault-inspector-meta-value">${doc.sender_party || 'N/A'}</span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">Direction</span>
              <span class="vault-inspector-meta-value">${doc.direction || 'INTERNAL'}</span>
            </div>
            <div class="vault-inspector-meta-row">
              <span class="vault-inspector-meta-label">Status</span>
              <span class="vault-inspector-meta-value">
                <span class="file-status-badge ${doc.status === 'SEALED_OFFICIAL' ? 'sealed' : 'draft'}">
                  ${doc.status === 'SEALED_OFFICIAL' ? 'Sealed Official' : 'Draft'}
                </span>
              </span>
            </div>
          </div>

          <div class="vault-inspector-actions">
            <button class="vault-pill-btn primary" data-quick-pdf="${doc.id}" style="justify-content: center; width: 100%; padding: 10px;">
              <span>Preview PDF ↗</span>
            </button>
            <a href="/api/compliance/vault/documents/${doc.id}/pdf" target="_blank" class="vault-pill-btn" style="text-decoration: none; justify-content: center; width: 100%; padding: 10px;">
              <span>Download File ⤓</span>
            </a>
          </div>
        </div>
      `;
    }

    return `
      <div class="vault-columns-wrapper" id="vaultColumnsWrapper">
        ${columnsHtml}
      </div>
    `;
  }

  attachExplorerEvents(viewport) {
    // History Back / Forward
    viewport.querySelector('#vaultHistBackBtn')?.addEventListener('click', () => this.navigateBack());
    viewport.querySelector('#vaultHistFwdBtn')?.addEventListener('click', () => this.navigateForward());

    // Root breadcrumb click -> reset to root
    viewport.querySelector('#vaultBcRootBtn')?.addEventListener('click', () => {
      this.selectedDirId = null;
      this.breadcrumbPath = [];
      this.selectedColumnPath = [];
      this.selectedColumnFile = null;
      this.recordHistory(this.currentNavPage, null);
      this.renderDirectoryFileManager(viewport);
    });

    // Sub-breadcrumb click
    viewport.querySelectorAll('[data-bc-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.bcIdx);
        const item = this.breadcrumbPath[idx];
        this.selectedDirId = item.id;
        this.breadcrumbPath = this.breadcrumbPath.slice(0, idx + 1);
        this.selectedColumnPath = this.breadcrumbPath.map(p => p.id);
        this.selectedColumnFile = null;
        this.recordHistory(this.currentNavPage, item.id);
        this.renderDirectoryFileManager(viewport);
      });
    });

    // View mode switchers
    viewport.querySelector('#vaultViewGridBtn')?.addEventListener('click', () => {
      this.viewMode = 'grid';
      this.renderDirectoryFileManager(viewport);
    });

    viewport.querySelector('#vaultViewListBtn')?.addEventListener('click', () => {
      this.viewMode = 'list';
      this.renderDirectoryFileManager(viewport);
    });

    viewport.querySelector('#vaultViewColumnsBtn')?.addEventListener('click', () => {
      this.viewMode = 'columns';
      this.renderDirectoryFileManager(viewport);
    });

    // Column View item clicks
    viewport.querySelectorAll('[data-col-dir]').forEach(el => {
      el.addEventListener('click', () => {
        const level = Number(el.dataset.colLevel);
        const dirId = Number(el.dataset.colDir);
        this.selectedColumnPath = this.selectedColumnPath.slice(0, level);
        this.selectedColumnPath.push(dirId);
        this.selectedColumnFile = null;
        this.selectedDirId = dirId;
        this.renderDirectoryFileManager(viewport);
      });
    });

    viewport.querySelectorAll('[data-col-file]').forEach(el => {
      el.addEventListener('click', () => {
        const fileId = Number(el.dataset.colFile);
        this.selectedColumnFile = this.documents.find(d => d.id === fileId) || null;
        this.renderDirectoryFileManager(viewport);
      });
    });

    // Tree toggles in List view
    viewport.querySelectorAll('[data-tree-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dirId = Number(btn.dataset.treeToggle);
        if (this.expandedDirs.has(dirId)) {
          this.expandedDirs.delete(dirId);
        } else {
          this.expandedDirs.add(dirId);
        }
        this.renderDirectoryFileManager(viewport);
      });
    });

    // Drill button in List view
    viewport.querySelectorAll('[data-drill-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dirId = Number(btn.dataset.drillBtn);
        this.drillIntoDirectory(dirId);
      });
    });

    // Inline search in nav bar
    const navSearch = viewport.querySelector('#vaultNavSearchInput');
    const navClear = viewport.querySelector('#vaultNavClearBtn');

    navSearch?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderDirectoryFileManager(viewport);
    });

    navClear?.addEventListener('click', () => {
      this.searchQuery = '';
      this.renderDirectoryFileManager(viewport);
    });

    // Action buttons in nav bar
    viewport.querySelector('#vaultExplorerNewFolderBtn')?.addEventListener('click', () => {
      this.openCreateFolderPrompt(this.selectedDirId);
    });

    viewport.querySelector('#vaultExplorerUploadBtn')?.addEventListener('click', () => {
      this.openUploadDocumentModal(this.selectedDirId);
    });

    // Open Folder click -> Arrow drills into folder; Floating sheets open 3D Cover Flow
    viewport.querySelectorAll('[data-open-dir]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-tree-toggle]') || e.target.closest('[data-drill-btn]')) return;
        const dirId = Number(el.dataset.openDir);

        // 1. Arrow clicked: open folder directly
        if (e.target.closest('.folder-open-arrow') || e.target.closest('[data-drill-arrow]')) {
          e.stopPropagation();
          this.drillIntoDirectory(dirId);
          return;
        }

        // 2. Floating files / subfolders stack, sheet, or upper area clicked: 3D Cover Flow
        const clickedSheet = e.target.closest('.folder-file-sheet');
        const clickedStack = e.target.closest('.folder-files-stack');
        const rect = el.getBoundingClientRect();
        const isUpperHalf = (e.clientY - rect.top) < (rect.height * 0.52);

        if (clickedSheet || clickedStack || isUpperHalf) {
          e.stopPropagation();
          const targetItemId = clickedSheet?.dataset.itemId ? Number(clickedSheet.dataset.itemId) : null;
          this.openCoverFlow(dirId, targetItemId);
          return;
        }

        // 3. Otherwise: drill into folder
        this.drillIntoDirectory(dirId);
      });
    });

    // Checkbox selection
    viewport.querySelectorAll('.file-select-box').forEach(box => {
      box.addEventListener('click', (e) => e.stopPropagation());
      box.addEventListener('change', (e) => {
        const id = Number(box.dataset.checkId);
        if (e.target.checked) this.selectedDocIds.add(id);
        else this.selectedDocIds.delete(id);
        this.updateBatchBar();
        box.closest('.file-card, .vault-list-row')?.classList.toggle('selected', e.target.checked);
      });
    });

    // Quick Preview
    viewport.querySelectorAll('[data-quick-pdf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPdfPreviewModal(Number(btn.dataset.quickPdf));
      });
    });

    // Click file row/card to preview
    viewport.querySelectorAll('.file-card, .vault-list-row[data-file-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.file-select-box') || e.target.closest('.file-add-tag-btn') || e.target.closest('.file-tag-pill') || e.target.closest('.file-quick-preview-btn')) return;
        this.openPdfPreviewModal(Number(el.dataset.fileId));
      });
    });

    // Tag Pill click
    viewport.querySelectorAll('.file-tag-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.searchQuery = pill.dataset.tag.toLowerCase();
        this.renderDirectoryFileManager(viewport);
      });
    });

    // Add Tag
    viewport.querySelectorAll('[data-add-tag]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptAddTag(Number(btn.dataset.addTag));
      });
    });
  }

  // =========================================================================
  // 3. PAPER TRAILS GRAPH VIEW
  // =========================================================================
  // =========================================================================
  // 3. THE SACRED TIMELINE — UNIFIED PAPER TRAIL & CAUSALITY TREE
  // GitHub Multi-Track Branching Precision + Loki Cosmic Neon Filaments
  // =========================================================================
  async renderTrailsPage(viewport) {
    viewport.innerHTML = `
      <div class="vault-timeline-wrapper">
        <div class="vault-timeline-ambient"></div>
        <div style="text-align: center; padding: 60px 0;">
          <div class="vault-viewer-spinner" style="margin: 0 auto 16px;"></div>
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">Illuminating The Sacred Timeline...</div>
        </div>
      </div>
    `;

    let data = { nodes: [], links: [], matters: [] };
    try {
      const res = await fetch('/api/compliance/vault/trails/timeline', {
        headers: this.getAuthHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    this.timelineData = data;
    if (!this.spotlightCase) this.spotlightCase = null;

    const nodes = data.nodes || [];
    const links = data.links || [];
    const matters = data.matters || [];

    // Filter bar HTML
    const totalDocsCount = nodes.length;
    const filterPillsHtml = `
      <div class="vault-case-pill ${!this.spotlightCase ? 'active' : ''}" data-case-filter="ALL">
        <span>✦ All Timeline</span>
        <span style="font-size: 10px; opacity: 0.7;">(${totalDocsCount})</span>
      </div>
      ${matters.map(m => `
        <div class="vault-case-pill ${this.spotlightCase === m.name ? 'active' : ''}" data-case-filter="${m.name}">
          <span>⚡ Case: ${m.name}</span>
          <span style="font-size: 10px; opacity: 0.7;">(${m.docCount} docs)</span>
        </div>
      `).join('')}
      <button class="vault-case-pill-btn-add" id="vaultCreateNewTrailBtn">
        <span>＋ Link Relation</span>
      </button>
    `;

    // Active spotlight telemetry banner
    const activeMatter = matters.find(m => m.name === this.spotlightCase);
    const telemetryBannerHtml = activeMatter ? `
      <div class="vault-case-telemetry" id="vaultCaseTelemetry">
        <div class="vault-case-telemetry-left">
          <span class="vault-case-telemetry-icon">⚡</span>
          <div>
            <div class="vault-case-telemetry-title">Proceeding Spotlight: ${activeMatter.name}</div>
            <div class="vault-case-telemetry-stats">
              <span>● ${activeMatter.docCount} Connected Records</span>
              <span>● ${activeMatter.linkCount} Causality Filaments</span>
              <span>● Verified End-to-End Chain-of-Custody</span>
            </div>
          </div>
        </div>
        <div class="vault-case-telemetry-right">
          <span class="vault-case-telemetry-badge">🛡️ Cryptographically Sealed</span>
          <button class="vault-case-telemetry-clear-btn" id="vaultClearSpotlightBtn">✕ Clear Spotlight</button>
        </div>
      </div>
    ` : '';

    // Sort documents chronologically for row generation
    const sortedDocs = [...nodes].sort((a, b) => {
      const dateA = a.issue_date ? new Date(a.issue_date).getTime() : 0;
      const dateB = b.issue_date ? new Date(b.issue_date).getTime() : 0;
      return dateA - dateB;
    });

    // Create steps list
    const stepRowsHtml = sortedDocs.map(doc => {
      const lane = doc.lane ?? 0;
      const isDocInSpotlight = !this.spotlightCase || (doc.matters || []).includes(this.spotlightCase);
      const thumbUrl = `/api/compliance/vault/documents/${doc.id}/thumbnail`;
      const directionClass = (doc.direction || 'internal').toLowerCase();

      // Find any link where this doc is child to show turnaround delta
      const incomingLink = links.find(l => Number(l.child_doc_id) === Number(doc.id));
      let turnaroundHtml = '';
      if (incomingLink && incomingLink.turnaround_days !== null) {
        const days = incomingLink.turnaround_days;
        const sign = days >= 0 ? `+${days}d` : `${days}d`;
        turnaroundHtml = `<span class="vault-node-turnaround" title="Turnaround interval from parent">⏱ ${sign}</span>`;
      }

      const cardHtml = `
        <div class="vault-node-card ${!isDocInSpotlight ? 'dimmed' : ''} ${this.spotlightCase && isDocInSpotlight ? 'spotlight' : ''}" 
             data-doc-id="${doc.id}" 
             data-lane="${lane}"
             data-matters='${JSON.stringify(doc.matters || [])}'>
          <div class="vault-node-orb" id="orbDoc${doc.id}"></div>
          
          <div class="vault-node-thumb-box">
            <img src="${thumbUrl}" alt="${doc.title}" class="vault-node-thumb-img" loading="lazy" onerror="this.style.display='none';" />
          </div>

          <div class="vault-node-content">
            <div class="vault-node-top-row">
              <span class="vault-node-ref">${doc.doc_ref_no || 'REF'}</span>
              <span class="vault-node-direction-tag ${directionClass}">${doc.direction || 'INTERNAL'}</span>
            </div>
            <div class="vault-node-title" title="${doc.title}">${doc.title}</div>
            <div class="vault-node-bottom-row">
              <span>📅 ${doc.issue_date || 'N/A'}</span>
              ${turnaroundHtml}
            </div>
            
            <div class="vault-node-hover-actions">
              <button class="vault-node-action-btn" data-node-preview="${doc.id}">Quick Look ↗</button>
              <button class="vault-node-action-btn" data-node-link="${doc.id}">＋ Link</button>
              ${incomingLink ? `<button class="vault-node-action-btn delete" data-delete-trail="${incomingLink.id}" title="Sever link">✂ Unlink</button>` : ''}
            </div>
          </div>
        </div>
      `;

      return `
        <div class="vault-timeline-step-row" data-row-doc-id="${doc.id}">
          <div class="vault-lane-col" data-col-lane="0">${lane === 0 ? cardHtml : ''}</div>
          <div class="vault-lane-col" data-col-lane="1">${lane === 1 ? cardHtml : ''}</div>
          <div class="vault-lane-col" data-col-lane="2">${lane === 2 ? cardHtml : ''}</div>
        </div>
      `;
    }).join('');

    viewport.innerHTML = `
      <div class="vault-timeline-wrapper">
        <div class="vault-timeline-ambient"></div>

        <!-- Header Hero -->
        <div class="vault-timeline-header-hero">
          <h1 class="vault-timeline-hero-title">
            <span class="vault-timeline-hero-sparkle">✦</span>
            The Sacred Timeline
          </h1>
          <div class="vault-timeline-hero-sub">
            Continuous enterprise causality network & unified multi-track compliance proceedings
          </div>
        </div>

        <!-- Case Spotlight Selector -->
        <div class="vault-case-filter-bar" id="vaultCaseFilterBar">
          ${filterPillsHtml}
        </div>

        <!-- Active Case Telemetry Banner -->
        ${telemetryBannerHtml}

        <!-- 3 Multi-Track Lanes Header -->
        <div class="vault-timeline-lanes-header">
          <div class="vault-lane-badge trunk">
            <span class="vault-lane-dot trunk"></span>
            Lane 0: Sacred Spine (Core Statutory & Authorizations)
          </div>
          <div class="vault-lane-badge regulatory">
            <span class="vault-lane-dot regulatory"></span>
            Lane 1: Regulatory Proceedings (Inward / Outward)
          </div>
          <div class="vault-lane-badge evidence">
            <span class="vault-lane-dot evidence"></span>
            Lane 2: Evidence & KYC Dossiers
          </div>
        </div>

        <!-- Canvas with Multi-Track Steps & SVG Filaments Overlay -->
        <div class="vault-timeline-canvas" id="vaultTimelineCanvas">
          <svg class="vault-filaments-svg" id="vaultFilamentsSvg">
            <defs>
              <linearGradient id="vaultTrunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.95" />
                <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.95" />
              </linearGradient>
              <linearGradient id="vaultRegGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.95" />
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.95" />
              </linearGradient>
              <linearGradient id="vaultEvidenceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.95" />
                <stop offset="100%" stop-color="#c084fc" stop-opacity="0.95" />
              </linearGradient>
            </defs>
            <g id="vaultFilamentsGroup"></g>
          </svg>

          <div class="vault-timeline-steps-list" id="vaultTimelineStepsList">
            ${stepRowsHtml}
          </div>
        </div>
      </div>
    `;

    // Render SVG Filaments
    const drawFilaments = () => {
      const svgGroup = viewport.querySelector('#vaultFilamentsGroup');
      const canvas = viewport.querySelector('#vaultTimelineCanvas');
      if (!svgGroup || !canvas) return;

      svgGroup.innerHTML = '';
      const canvasRect = canvas.getBoundingClientRect();

      links.forEach(link => {
        const parentCard = viewport.querySelector(`.vault-node-card[data-doc-id="${link.parent_doc_id}"]`);
        const childCard = viewport.querySelector(`.vault-node-card[data-doc-id="${link.child_doc_id}"]`);
        if (!parentCard || !childCard) return;

        const parentOrb = parentCard.querySelector('.vault-node-orb') || parentCard;
        const childOrb = childCard.querySelector('.vault-node-orb') || childCard;

        const pRect = parentOrb.getBoundingClientRect();
        const cRect = childOrb.getBoundingClientRect();

        const x1 = (pRect.left + pRect.width / 2) - canvasRect.left;
        const y1 = (pRect.top + pRect.height / 2) - canvasRect.top;
        const x2 = (cRect.left + cRect.width / 2) - canvasRect.left;
        const y2 = (cRect.top + cRect.height / 2) - canvasRect.top;

        const dy = Math.abs(y2 - y1);
        const c1x = x1;
        const c1y = y1 + Math.max(25, dy * 0.45);
        const c2x = x2;
        const c2y = y2 - Math.max(25, dy * 0.45);

        const pathD = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

        // Lane class
        const parentLane = Number(parentCard.dataset.lane || 0);
        const laneClass = parentLane === 0 ? 'trunk' : parentLane === 1 ? 'regulatory' : 'evidence';

        // Check spotlight
        const isInSpotlight = !this.spotlightCase || link.matter_thread_name === this.spotlightCase;
        const spotlightClass = this.spotlightCase && isInSpotlight ? 'spotlight' : !isInSpotlight ? 'dimmed' : '';

        // Base filament path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('class', `vault-filament-path ${laneClass} ${spotlightClass}`);
        svgGroup.appendChild(path);

        // Animated pulse particle if in spotlight or all active
        if (isInSpotlight) {
          const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pulse.setAttribute('d', pathD);
          pulse.setAttribute('class', 'vault-filament-pulse');
          svgGroup.appendChild(pulse);
        }
      });
    };

    // Draw filaments after layout paints
    requestAnimationFrame(() => {
      setTimeout(drawFilaments, 60);
    });

    window.removeEventListener('resize', this._timelineResizeHandler);
    this._timelineResizeHandler = () => drawFilaments();
    window.addEventListener('resize', this._timelineResizeHandler);

    // Event handlers for Case Filtering / Spotlight
    viewport.querySelectorAll('[data-case-filter]').forEach(pill => {
      pill.addEventListener('click', () => {
        const targetCase = pill.dataset.caseFilter;
        this.spotlightCase = targetCase === 'ALL' ? null : targetCase;
        this.renderTrailsPage(viewport);
      });
    });

    viewport.querySelector('#vaultClearSpotlightBtn')?.addEventListener('click', () => {
      this.spotlightCase = null;
      this.renderTrailsPage(viewport);
    });

    viewport.querySelector('#vaultCreateNewTrailBtn')?.addEventListener('click', () => {
      this.openNewPaperTrailModal();
    });

    // Node interactions
    viewport.querySelectorAll('[data-node-preview]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFileViewer(Number(btn.dataset.nodePreview));
      });
    });

    viewport.querySelectorAll('[data-node-link]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNewPaperTrailModal(Number(btn.dataset.nodeLink));
      });
    });

    viewport.querySelectorAll('.vault-node-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.vault-node-action-btn')) return;
        const docId = Number(card.dataset.docId);
        this.openFileViewer(docId);
      });
    });

    // Unlink handler
    viewport.querySelectorAll('[data-delete-trail]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const trailId = btn.dataset.deleteTrail;
        if (!confirm('Sever this causality filament? This will unlink the two records.')) return;

        try {
          const res = await fetch(`/api/compliance/vault/trail/${trailId}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders(),
            credentials: 'same-origin'
          });
          if (res.ok) {
            this.app?.showNotification('Causality filament severed.', 'info');
            this.renderTrailsPage(viewport);
          }
        } catch (_) {}
      });
    });
  }

  updateBatchBar() {
    const bar = this.container.querySelector('#vaultBatchToolbar');
    const countEl = this.container.querySelector('#vaultBatchCount');
    if (!bar || !countEl) return;

    const count = this.selectedDocIds.size;
    if (count > 0) {
      bar.style.display = 'inline-flex';
      countEl.textContent = `${count} Selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  async handleBatchAction(action) {
    const docIds = Array.from(this.selectedDocIds);
    if (docIds.length === 0) return;

    if (action === 'DELETE') {
      if (!confirm(`Delete ${docIds.length} selected document(s)?`)) return;
    }

    let targetDirId = null;
    if (action === 'MOVE') {
      const dirOptions = this.directories.map(d => `${d.id}: ${d.name}`).join('\n');
      const chosen = prompt(`Enter Directory ID to move to:\n${dirOptions}`);
      if (!chosen) return;
      targetDirId = Number(chosen.trim());
    }

    try {
      const res = await fetch('/api/compliance/vault/documents/batch', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ action, doc_ids: docIds, target_dir_id: targetDirId })
      });

      if (res.ok) {
        this.app?.showNotification(`Updated ${docIds.length} item(s).`, 'success');
        this.selectedDocIds.clear();
        this.updateBatchBar();
        await this.loadData();
      } else {
        const errData = await res.json();
        this.app?.showNotification(errData.error || 'Batch failed', 'error');
      }
    } catch (err) {
      this.app?.showNotification(err.message, 'error');
    }
  }

  promptAddTag(docId) {
    const tag = prompt('Enter tag (e.g. AYUSH, Audit, Tax):');
    if (!tag || !tag.trim()) return;

    const cleanTag = tag.trim().replace(/^#/, '');
    const doc = this.documents.find(d => Number(d.id) === Number(docId));
    if (!doc) return;

    let existingTags = [];
    if (doc.tags_json) {
      try { existingTags = JSON.parse(doc.tags_json); } catch (_) {}
    }
    if (!existingTags.includes(cleanTag)) {
      existingTags.push(cleanTag);
    }

    doc.tags_json = JSON.stringify(existingTags);
    this.renderActivePage();
    this.app?.showNotification(`Tag "${cleanTag}" added.`, 'info');
  }

  // =========================================================================
  // 4. MODALS (Upload, New Doc, Folders, PDF Preview)
  // =========================================================================

  async openUploadDocumentModal(defaultDirId = null) {
    const existing = document.getElementById('vaultUploadModalOverlay');
    if (existing) existing.remove();

    let autoRef = 'UCA/INW/2026/0001';
    try {
      const res = await fetch('/api/compliance/vault/next-ref?dept_code=INW', {
        headers: this.getAuthHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.doc_ref_no) autoRef = data.doc_ref_no;
      }
    } catch (_) {}

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultUploadModalOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 680px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="staff-modal-header">
          <h3>Upload Document</h3>
          <button class="staff-modal-close-btn" id="closeVaultUploadBtn">✕</button>
        </div>

        <form id="vaultUploadDocForm" style="flex: 1; overflow-y: auto; padding: 20px;">
          <div class="vault-dropzone-box" id="vaultUploadDropzone">
            <div style="font-size: 28px; margin-bottom: 6px;">📄</div>
            <div style="font-size: 13px; font-weight: 600;">Drop PDF, Word, or image file here</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">or click to browse</div>
            <input type="file" id="vaultUploadFileInput" style="display: none;" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
            <div id="vaultUploadSelectedFile" style="margin-top: 8px; font-weight: 600; color: #0284c7; font-size: 12px; display: none;"></div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Reference No *</label>
              <input type="text" name="doc_ref_no" value="${autoRef}" required style="font-family: monospace; font-weight: 700;">
            </div>
            <div class="staff-input-group">
              <label>Folder</label>
              <select name="dir_id">
                ${this.directories.map(d => `<option value="${d.id}" ${Number(defaultDirId) === Number(d.id) ? 'selected' : ''}>${d.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Title *</label>
              <input type="text" name="title" placeholder="Document title" required>
            </div>
            <div class="staff-input-group">
              <label>Direction</label>
              <select name="direction">
                <option value="INWARD">Inward</option>
                <option value="OUTWARD">Outward</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Party / Agency</label>
              <input type="text" name="sender_party" placeholder="Sender or recipient">
            </div>
            <div class="staff-input-group">
              <label>Date</label>
              <input type="date" name="issue_date" value="${new Date().toISOString().split('T')[0]}">
            </div>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Summary / Subject</label>
            <input type="text" name="subject" placeholder="Brief description">
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelVaultUploadBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">Upload File</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeVaultUploadBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelVaultUploadBtn')?.addEventListener('click', closeModal);

    const dropzone = overlay.querySelector('#vaultUploadDropzone');
    const fileInput = overlay.querySelector('#vaultUploadFileInput');
    const selectedFileText = overlay.querySelector('#vaultUploadSelectedFile');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        fileInput.files = e.dataTransfer.files;
        selectedFileText.textContent = fileInput.files[0].name;
        selectedFileText.style.display = 'block';
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        selectedFileText.textContent = fileInput.files[0].name;
        selectedFileText.style.display = 'block';
      }
    });

    overlay.querySelector('#vaultUploadDocForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const payload = {
        dir_id: form.dir_id.value ? Number(form.dir_id.value) : null,
        doc_ref_no: form.doc_ref_no.value.trim(),
        title: form.title.value.trim(),
        doc_type: 'LETTER',
        direction: form.direction.value,
        status: 'SEALED_OFFICIAL',
        sender_party: form.sender_party.value.trim(),
        recipient_party: 'Utkal Chemical Aushadhalaya',
        subject: form.subject.value.trim(),
        issue_date: form.issue_date.value,
        content_json: { paragraphs: [form.subject.value.trim() || 'Uploaded document'] },
        signatory_name: 'Dr. Debabrata Mishra',
        signatory_title: 'Chief Medical Officer',
        is_watermarked: 0
      };

      try {
        const res = await fetch('/api/compliance/vault/documents', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          this.app?.showNotification('File uploaded.', 'success');
          closeModal();
          await this.loadData();
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Upload failed', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  async openDocumentEditorModal(existingDoc = null, defaultDirId = null) {
    const isEdit = !!existingDoc;
    let nextRef = existingDoc?.doc_ref_no || '';

    if (!isEdit) {
      try {
        const res = await fetch('/api/compliance/vault/next-ref', {
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.doc_ref_no) nextRef = data.doc_ref_no;
        }
      } catch (_) {}
    }

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultDocEditorOverlay';
    overlay.style.zIndex = '2147483647';

    const chosenDirId = existingDoc?.dir_id || defaultDirId || this.selectedDirId;

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 760px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="staff-modal-header">
          <h3>${isEdit ? 'Edit Document' : 'New Document'}</h3>
          <button class="staff-modal-close-btn" id="closeVaultEditorBtn">✕</button>
        </div>

        <form id="vaultDocEditorForm" style="display: flex; flex-direction: column; flex: 1; overflow-y: auto; padding: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Reference *</label>
              <input type="text" name="doc_ref_no" value="${nextRef}" required style="font-family: monospace; font-weight: 700;">
            </div>
            <div class="staff-input-group">
              <label>Folder</label>
              <select name="dir_id">
                ${this.directories.map(d => `<option value="${d.id}" ${Number(chosenDirId) === Number(d.id) ? 'selected' : ''}>${d.name}</option>`).join('')}
              </select>
            </div>
            <div class="staff-input-group">
              <label>Direction</label>
              <select name="direction">
                <option value="INTERNAL" ${existingDoc?.direction === 'INTERNAL' ? 'selected' : ''}>Internal</option>
                <option value="INWARD" ${existingDoc?.direction === 'INWARD' ? 'selected' : ''}>Inward</option>
                <option value="OUTWARD" ${existingDoc?.direction === 'OUTWARD' ? 'selected' : ''}>Outward</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Title *</label>
              <input type="text" name="title" value="${existingDoc?.title || ''}" placeholder="Document title" required>
            </div>
            <div class="staff-input-group">
              <label>Date</label>
              <input type="date" name="issue_date" value="${existingDoc?.issue_date || new Date().toISOString().split('T')[0]}">
            </div>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Party / Recipient</label>
            <input type="text" name="recipient_party" value="${existingDoc?.recipient_party || ''}" placeholder="e.g. Directorate of AYUSH">
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Subject</label>
            <input type="text" name="subject" value="${existingDoc?.subject || ''}" placeholder="Brief subject line">
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Content</label>
            <textarea name="body" rows="4" placeholder="Document text...">${existingDoc?.subject || ''}</textarea>
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelVaultEditorBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">${isEdit ? 'Save Changes' : 'Create Document'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeVaultEditorBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelVaultEditorBtn')?.addEventListener('click', closeModal);

    overlay.querySelector('#vaultDocEditorForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const payload = {
        dir_id: form.dir_id.value ? Number(form.dir_id.value) : null,
        doc_ref_no: form.doc_ref_no.value.trim(),
        title: form.title.value.trim(),
        doc_type: 'LETTER',
        direction: form.direction.value,
        status: 'SEALED_OFFICIAL',
        recipient_party: form.recipient_party.value.trim(),
        subject: form.subject.value.trim(),
        issue_date: form.issue_date.value,
        content_json: { paragraphs: [form.body.value.trim()] },
        signatory_name: 'Dr. Debabrata Mishra',
        signatory_title: 'Chief Medical Officer',
        is_watermarked: 0
      };

      try {
        const url = isEdit ? `/api/compliance/vault/documents/${existingDoc.id}` : '/api/compliance/vault/documents';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          this.app?.showNotification('Document saved.', 'success');
          closeModal();
          await this.loadData();
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Failed to save', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  openPdfPreviewModal(docId) {
    this.openFileViewer(docId);
  }

  async openFileViewer(docId) {
    const doc = this.documents.find(d => Number(d.id) === Number(docId));
    if (!doc) return;

    // Existing overlay cleanup
    const existing = document.getElementById('vaultFileViewerOverlay');
    if (existing) existing.remove();

    // Determine current folder's documents list for previous/next file navigation
    let folderDocs = [];
    if (doc.dir_id) {
      folderDocs = (this.documents || []).filter(d => Number(d.dir_id) === Number(doc.dir_id));
    }
    if (folderDocs.length === 0) {
      folderDocs = this.documents || [];
    }
    let currentIndex = folderDocs.findIndex(d => Number(d.id) === Number(doc.id));
    if (currentIndex === -1) currentIndex = 0;

    // State for this viewer session
    this.activeViewerDoc = doc;
    this.viewerZoom = 100;
    this.viewerRotation = 0;
    this.viewerActiveTab = 'overview';
    this.viewerLeftRailOpen = true;
    this.viewerRightDrawerOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'vaultFileViewerOverlay';
    overlay.className = 'vault-viewer-overlay';

    const renderViewerContent = async (targetDoc) => {
      if (this.currentViewerBlobUrl) {
        URL.revokeObjectURL(this.currentViewerBlobUrl);
        this.currentViewerBlobUrl = null;
      }
      this.activeViewerDoc = targetDoc;
      currentIndex = folderDocs.findIndex(d => Number(d.id) === Number(targetDoc.id));
      if (currentIndex === -1) currentIndex = 0;

      // Extract metadata
      let parsedContent = {};
      if (targetDoc.content_json) {
        try {
          parsedContent = typeof targetDoc.content_json === 'string' ? JSON.parse(targetDoc.content_json) : targetDoc.content_json;
        } catch (_) {}
      }

      let tags = [];
      if (targetDoc.tags_json) {
        try { tags = JSON.parse(targetDoc.tags_json); } catch (_) {}
      }
      if (tags.length === 0) {
        tags = this.generateTagsAndSummary(targetDoc).tags;
      }

      const sizeStr = this.formatFileSize(targetDoc.file_size);
      const pdfUrl = `/api/compliance/vault/documents/${targetDoc.id}/pdf`;
      const thumbUrl = `/api/compliance/vault/documents/${targetDoc.id}/thumbnail`;
      const dir = (this.directories || []).find(d => Number(d.id) === Number(targetDoc.dir_id));
      const dirName = dir ? dir.name : 'Corporate Vault';

      overlay.innerHTML = `
        <div class="vault-viewer-window" id="vaultViewerWindow">
          <!-- Top Navigation Bar -->
          <div class="vault-viewer-top-bar">
            <!-- Left: Traffic Lights & Prev/Next File Nav -->
            <div class="vault-viewer-top-left">
              <div class="vault-traffic-lights">
                <button class="vault-traffic-dot red" id="viewerTrafficClose" title="Close (Esc)">✕</button>
                <button class="vault-traffic-dot yellow" id="viewerTrafficMinimize" title="Reset Size">─</button>
                <button class="vault-traffic-dot green" id="viewerTrafficFullscreen" title="Toggle Fullscreen (F)">⛶</button>
              </div>

              <div class="vault-viewer-file-nav">
                <button class="vault-file-nav-btn" id="viewerPrevFileBtn" ${currentIndex === 0 ? 'disabled' : ''} title="Previous Document (Shift + ←)">‹</button>
                <span class="vault-file-nav-counter" id="viewerFileCounter">${currentIndex + 1} of ${folderDocs.length}</span>
                <button class="vault-file-nav-btn" id="viewerNextFileBtn" ${currentIndex === folderDocs.length - 1 ? 'disabled' : ''} title="Next Document (Shift + →)">›</button>
              </div>
            </div>

            <!-- Center: Title & Badges -->
            <div class="vault-viewer-top-center">
              <span class="vault-viewer-ref-pill">${targetDoc.doc_ref_no || 'REF'}</span>
              <span class="vault-viewer-doc-title" title="${targetDoc.title}">${targetDoc.title}</span>
              <span class="vault-viewer-dir-pill ${targetDoc.direction ? targetDoc.direction.toLowerCase() : 'internal'}">
                ${targetDoc.direction === 'INWARD' ? '📥 Inward' : targetDoc.direction === 'OUTWARD' ? '📤 Outward' : '📄 Internal'}
              </span>
            </div>

            <!-- Right: Action Buttons -->
            <div class="vault-viewer-top-right">
              <button class="vault-viewer-tool-btn ${this.viewerLeftRailOpen ? 'active' : ''}" id="viewerToggleThumbnailsBtn" title="Toggle Pages Rail (T)">
                <span>📑</span> Pages
              </button>
              <button class="vault-viewer-tool-btn ${this.viewerRightDrawerOpen ? 'active' : ''}" id="viewerToggleInspectorBtn" title="Toggle Compliance Inspector (I)">
                <span>ℹ️</span> Inspector
              </button>
              <button class="vault-viewer-tool-btn" id="viewerPrintBtn" title="Print (P)">
                <span>⎙</span> Print
              </button>
              <a href="${pdfUrl}" download class="vault-viewer-tool-btn vault-viewer-download-link" title="Download File (D)">
                <span>⬇</span> Download
              </a>
              <button class="vault-file-nav-btn" id="viewerHeaderCloseBtn" title="Close (Esc)" style="margin-left: 6px;">✕</button>
            </div>
          </div>

          <!-- 3-Column Body -->
          <div class="vault-viewer-body">
            <!-- Column 1: Left Rail (Thumbnails Filmstrip) -->
            <div class="vault-viewer-left-rail ${this.viewerLeftRailOpen ? '' : 'collapsed'}" id="viewerLeftRail">
              <div class="vault-rail-header">Pages (Page 1)</div>
              <div class="vault-rail-pages-list">
                <div class="vault-page-thumb-card active">
                  <div class="vault-page-mini-sheet">
                    <img src="${thumbUrl}" alt="Page 1" class="vault-page-mini-img" loading="lazy" />
                  </div>
                  <span class="vault-page-num-tag">Page 1</span>
                </div>
              </div>
            </div>

            <!-- Column 2: Center Stage Canvas -->
            <div class="vault-viewer-stage" id="viewerStage">
              <div class="vault-stage-viewport">
                <div class="vault-stage-doc-canvas" id="viewerDocCanvas">
                  <div class="vault-canvas-loading" id="viewerDocLoading">
                    <div class="vault-viewer-spinner"></div>
                    <div style="font-size: 13px; font-weight: 600; color: #94a3b8; margin-top: 14px;">Loading Document Preview...</div>
                  </div>
                  <iframe id="viewerPdfFrame" title="${targetDoc.title}"></iframe>
                </div>
              </div>

              <!-- Floating Bottom Control Dock -->
              <div class="vault-viewer-floating-dock">
                <button class="vault-dock-btn" id="viewerDockRotateBtn" title="Rotate 90° (R)">↻</button>
                <div class="vault-dock-sep"></div>
                <button class="vault-dock-btn" id="viewerDockZoomOutBtn" title="Zoom Out (-)">−</button>
                <span class="vault-dock-zoom-label" id="viewerDockZoomLabel" title="Click to Reset 100%">${this.viewerZoom}%</span>
                <button class="vault-dock-btn" id="viewerDockZoomInBtn" title="Zoom In (+)">+</button>
                <div class="vault-dock-sep"></div>
                <button class="vault-dock-btn" id="viewerDockFitWidthBtn" title="Fit to Canvas">↔</button>
                <button class="vault-dock-btn" id="viewerDockFullscreenBtn" title="Fullscreen (F)">⛶</button>
              </div>
            </div>

            <!-- Column 3: Right Drawer (Compliance & Intelligence Inspector) -->
            <div class="vault-viewer-right-drawer ${this.viewerRightDrawerOpen ? '' : 'collapsed'}" id="viewerRightDrawer">
              <div class="vault-inspector-tab-bar">
                <button class="vault-inspector-tab-btn ${this.viewerActiveTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
                <button class="vault-inspector-tab-btn ${this.viewerActiveTab === 'security' ? 'active' : ''}" data-tab="security">Security</button>
                <button class="vault-inspector-tab-btn ${this.viewerActiveTab === 'trail' ? 'active' : ''}" data-tab="trail">Paper Trail</button>
                <button class="vault-inspector-tab-btn ${this.viewerActiveTab === 'tags' ? 'active' : ''}" data-tab="tags">Tags & Notes</button>
              </div>

              <div class="vault-inspector-content" id="viewerInspectorContent">
                <!-- Dynamically populated tab content -->
              </div>
            </div>
          </div>
        </div>
      `;

      attachViewerEvents(targetDoc);
      renderInspectorTab(this.viewerActiveTab, targetDoc);
    };

    const renderInspectorTab = async (tabName, doc) => {
      this.viewerActiveTab = tabName;
      const contentEl = overlay.querySelector('#viewerInspectorContent');
      if (!contentEl) return;

      overlay.querySelectorAll('.vault-inspector-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });

      const dir = (this.directories || []).find(d => Number(d.id) === Number(doc.dir_id));
      const sizeStr = this.formatFileSize(doc.file_size);

      if (tabName === 'overview') {
        contentEl.innerHTML = `
          <div>
            <div class="vault-insp-section-title">Record Details</div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Reference #</span>
              <span class="vault-insp-val" style="font-family: monospace; color: #38bdf8;">${doc.doc_ref_no || '—'}</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Folder Location</span>
              <span class="vault-insp-val">📁 ${dir ? dir.name : 'Root Vault'}</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Direction</span>
              <span class="vault-insp-val">${doc.direction || 'INTERNAL'}</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Issue / Filing Date</span>
              <span class="vault-insp-val">${doc.issue_date || '—'}</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Status</span>
              <span class="vault-insp-val" style="color: #10b981;">● ${doc.status || 'ACTIVE'}</span>
            </div>
          </div>

          <div>
            <div class="vault-insp-section-title">Physical Archival</div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Facility</span>
              <span class="vault-insp-val">Utkal Chem Archival Central</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Vault Rack</span>
              <span class="vault-insp-val">Rack B-04 / Tier 2</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Storage Box ID</span>
              <span class="vault-insp-val">BOX-2026-MED</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Signatory Authority</span>
              <span class="vault-insp-val">${doc.signatory_name || 'Dr. Debabrata Mishra'}</span>
            </div>
          </div>
        `;
      } else if (tabName === 'security') {
        const hash = doc.verification_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        contentEl.innerHTML = `
          <div>
            <div class="vault-insp-section-title">Cryptographic Verification</div>
            <div class="vault-integrity-box">
              <div class="vault-integrity-status">
                <span>🛡️</span> Verified Authentic & Unaltered
              </div>
              <div style="font-size: 11px; color: #94a3b8;">SHA-256 Checksum:</div>
              <div class="vault-hash-code">${hash}</div>
            </div>
          </div>

          <div>
            <div class="vault-insp-section-title">File Telemetry</div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">File Size</span>
              <span class="vault-insp-val">${sizeStr}</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">MIME Type</span>
              <span class="vault-insp-val">application/pdf</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Color Space</span>
              <span class="vault-insp-val">DeviceRGB (Print Ready)</span>
            </div>
            <div class="vault-insp-row">
              <span class="vault-insp-label">Tamper Protection</span>
              <span class="vault-insp-val" style="color: #10b981;">Active Read-Only</span>
            </div>
          </div>
        `;
      } else if (tabName === 'trail') {
        contentEl.innerHTML = `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div class="vault-insp-section-title" style="margin-bottom: 0;">Causality Lineage & Trail</div>
              <button class="vault-node-action-btn" id="viewerAddTrailLinkBtn" style="background: #0284c7; color: #ffffff;">＋ Link Relation</button>
            </div>
            <div id="viewerTrailLoading" style="font-size: 12px; color: #94a3b8;">Loading Paper Trail...</div>
            <div class="vault-trail-timeline" id="viewerTrailTimeline" style="display: none;"></div>
          </div>
        `;

        contentEl.querySelector('#viewerAddTrailLinkBtn')?.addEventListener('click', () => {
          this.openNewPaperTrailModal(doc.id);
        });

        try {
          const res = await fetch(`/api/compliance/vault/documents/${doc.id}/trail`, {
            headers: this.getAuthHeaders(),
            credentials: 'same-origin'
          });
          const trailData = res.ok ? await res.json() : null;
          const timelineEl = contentEl.querySelector('#viewerTrailTimeline');
          const loadingEl = contentEl.querySelector('#viewerTrailLoading');
          if (loadingEl) loadingEl.style.display = 'none';

          if (timelineEl) {
            timelineEl.style.display = 'flex';
            const parents = trailData?.parents || [];
            const children = trailData?.children || [];

            let html = '';
            if (parents.length > 0) {
              html += `<div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">Triggering Record(s)</div>`;
              parents.forEach(p => {
                html += `
                  <div class="vault-trail-card" data-trail-doc-id="${p.id}">
                    <span class="vault-trail-ref">${p.doc_ref_no}</span>
                    <div class="vault-trail-title">${p.title}</div>
                    <div class="vault-trail-badge">Trigger Document ↗</div>
                  </div>
                `;
              });
            }

            html += `
              <div class="vault-trail-card current">
                <span class="vault-trail-ref">${doc.doc_ref_no}</span>
                <div class="vault-trail-title">${doc.title}</div>
                <div class="vault-trail-badge" style="color: #38bdf8;">● Current Active Document</div>
              </div>
            `;

            if (children.length > 0) {
              html += `<div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-top: 6px;">Follow-up / Attached Record(s)</div>`;
              children.forEach(c => {
                html += `
                  <div class="vault-trail-card" data-trail-doc-id="${c.id}">
                    <span class="vault-trail-ref">${c.doc_ref_no}</span>
                    <div class="vault-trail-title">${c.title}</div>
                    <div class="vault-trail-badge">Follow-up Record ↗</div>
                  </div>
                `;
              });
            } else if (parents.length === 0) {
              html += `<div style="font-size: 11.5px; color: #94a3b8; font-style: italic; margin-top: 8px;">Standalone record with no linked upstream triggers.</div>`;
            }

            timelineEl.innerHTML = html;

            timelineEl.querySelectorAll('[data-trail-doc-id]').forEach(card => {
              card.addEventListener('click', () => {
                const targetId = Number(card.dataset.trailDocId);
                const found = (this.documents || []).find(d => d.id === targetId);
                if (found) renderViewerContent(found);
              });
            });
          }
        } catch (_) {}
      } else if (tabName === 'tags') {
        let currentTags = [];
        if (doc.tags_json) {
          try { currentTags = JSON.parse(doc.tags_json); } catch (_) {}
        }
        if (currentTags.length === 0) {
          currentTags = this.generateTagsAndSummary(doc).tags;
        }

        let remarks = doc.subject || '';
        if (doc.content_json) {
          try {
            const p = typeof doc.content_json === 'string' ? JSON.parse(doc.content_json) : doc.content_json;
            if (p.notes) remarks = p.notes;
          } catch (_) {}
        }

        contentEl.innerHTML = `
          <div>
            <div class="vault-insp-section-title">Compliance Smart Tags</div>
            <div class="vault-viewer-tags-box" id="viewerTagsBox">
              ${currentTags.map(t => `
                <span class="vault-viewer-tag-pill" data-tag-name="${t}">
                  #${t}
                  <span class="vault-viewer-tag-delete" title="Remove tag">✕</span>
                </span>
              `).join('')}
              <input type="text" class="vault-viewer-add-tag-input" id="viewerAddTagInput" placeholder="+ Add tag..." />
            </div>
          </div>

          <div style="margin-top: 8px;">
            <div class="vault-insp-section-title">Audit Remarks & Internal Notes</div>
            <textarea class="vault-viewer-notes-area" id="viewerNotesArea" placeholder="Add remarks or governance notes...">${remarks}</textarea>
            <button class="vault-viewer-tool-btn" id="viewerSaveNotesBtn" style="margin-top: 8px; width: 100%; justify-content: center; background: #0284c7; color: #ffffff;">Save Remarks</button>
          </div>
        `;

        // Handle tag deletion
        contentEl.querySelectorAll('.vault-viewer-tag-delete').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const pill = btn.closest('.vault-viewer-tag-pill');
            const tagToDelete = pill.dataset.tagName;
            currentTags = currentTags.filter(t => t !== tagToDelete);
            doc.tags_json = JSON.stringify(currentTags);
            await fetch(`/api/compliance/vault/documents/${doc.id}`, {
              method: 'PUT',
              headers: this.getAuthHeaders(),
              credentials: 'same-origin',
              body: JSON.stringify({ content_json: { tags: currentTags } })
            });
            renderInspectorTab('tags', doc);
            this.renderActivePage();
          });
        });

        // Handle tag addition
        const addTagInput = contentEl.querySelector('#viewerAddTagInput');
        addTagInput?.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const newTag = addTagInput.value.trim().replace(/^#/, '');
            if (newTag && !currentTags.includes(newTag)) {
              currentTags.push(newTag);
              doc.tags_json = JSON.stringify(currentTags);
              await fetch(`/api/compliance/vault/documents/${doc.id}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({ content_json: { tags: currentTags } })
              });
              renderInspectorTab('tags', doc);
              this.renderActivePage();
            }
          }
        });

        // Handle remarks saving
        contentEl.querySelector('#viewerSaveNotesBtn')?.addEventListener('click', async () => {
          const notesText = contentEl.querySelector('#viewerNotesArea')?.value.trim();
          let currentContent = {};
          if (doc.content_json) {
            try { currentContent = typeof doc.content_json === 'string' ? JSON.parse(doc.content_json) : doc.content_json; } catch (_) {}
          }
          currentContent.notes = notesText;
          doc.content_json = JSON.stringify(currentContent);
          await fetch(`/api/compliance/vault/documents/${doc.id}`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify({ content_json: currentContent })
          });
          this.app?.showNotification('Audit remarks saved.', 'success');
        });
      }
    };

    const attachViewerEvents = (doc) => {
      // Stream PDF via Blob URL to bypass browser iframe cross-origin / header quirks
      const loadPdfStream = async () => {
        const frame = overlay.querySelector('#viewerPdfFrame');
        const loader = overlay.querySelector('#viewerDocLoading');
        if (!frame) return;

        try {
          const res = await fetch(pdfUrl, {
            headers: this.getAuthHeaders ? this.getAuthHeaders() : {},
            credentials: 'same-origin'
          });

          if (res.ok) {
            const blob = await res.blob();
            if (this.currentViewerBlobUrl) {
              URL.revokeObjectURL(this.currentViewerBlobUrl);
            }
            this.currentViewerBlobUrl = URL.createObjectURL(blob);
            frame.src = `${this.currentViewerBlobUrl}#toolbar=0&navpanes=0&scrollbar=1`;
            if (loader) {
              setTimeout(() => { loader.style.display = 'none'; }, 200);
            }
          } else {
            frame.src = `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`;
            if (loader) loader.style.display = 'none';
          }
        } catch (_) {
          frame.src = `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`;
          if (loader) loader.style.display = 'none';
        }
      };

      loadPdfStream();

      // Zoom controls
      const canvas = overlay.querySelector('#viewerDocCanvas');
      const zoomLabel = overlay.querySelector('#viewerDockZoomLabel');

      const applyTransform = () => {
        if (canvas) {
          canvas.style.transform = `scale(${this.viewerZoom / 100}) rotate(${this.viewerRotation}deg)`;
        }
        if (zoomLabel) {
          zoomLabel.textContent = `${this.viewerZoom}%`;
        }
      };

      overlay.querySelector('#viewerDockZoomInBtn')?.addEventListener('click', () => {
        this.viewerZoom = Math.min(250, this.viewerZoom + 15);
        applyTransform();
      });

      overlay.querySelector('#viewerDockZoomOutBtn')?.addEventListener('click', () => {
        this.viewerZoom = Math.max(40, this.viewerZoom - 15);
        applyTransform();
      });

      overlay.querySelector('#viewerDockZoomLabel')?.addEventListener('click', () => {
        this.viewerZoom = 100;
        this.viewerRotation = 0;
        applyTransform();
      });

      overlay.querySelector('#viewerDockRotateBtn')?.addEventListener('click', () => {
        this.viewerRotation = (this.viewerRotation + 90) % 360;
        applyTransform();
      });

      overlay.querySelector('#viewerDockFitWidthBtn')?.addEventListener('click', () => {
        this.viewerZoom = 120;
        this.viewerRotation = 0;
        applyTransform();
      });

      // Fullscreen toggle
      const windowEl = overlay.querySelector('#vaultViewerWindow');
      const toggleFullscreen = () => {
        windowEl?.classList.toggle('fullscreen');
      };
      overlay.querySelector('#viewerTrafficFullscreen')?.addEventListener('click', toggleFullscreen);
      overlay.querySelector('#viewerDockFullscreenBtn')?.addEventListener('click', toggleFullscreen);

      // Reset window size (yellow traffic light)
      overlay.querySelector('#viewerTrafficMinimize')?.addEventListener('click', () => {
        windowEl?.classList.remove('fullscreen');
        this.viewerZoom = 100;
        this.viewerRotation = 0;
        applyTransform();
      });

      // Drawer toggles
      overlay.querySelector('#viewerToggleThumbnailsBtn')?.addEventListener('click', (e) => {
        this.viewerLeftRailOpen = !this.viewerLeftRailOpen;
        e.currentTarget.classList.toggle('active', this.viewerLeftRailOpen);
        overlay.querySelector('#viewerLeftRail')?.classList.toggle('collapsed', !this.viewerLeftRailOpen);
      });

      overlay.querySelector('#viewerToggleInspectorBtn')?.addEventListener('click', (e) => {
        this.viewerRightDrawerOpen = !this.viewerRightDrawerOpen;
        e.currentTarget.classList.toggle('active', this.viewerRightDrawerOpen);
        overlay.querySelector('#viewerRightDrawer')?.classList.toggle('collapsed', !this.viewerRightDrawerOpen);
      });

      // Tab switcher
      overlay.querySelectorAll('.vault-inspector-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          renderInspectorTab(btn.dataset.tab, doc);
        });
      });

      // Print document
      overlay.querySelector('#viewerPrintBtn')?.addEventListener('click', () => {
        const frame = overlay.querySelector('#viewerPdfFrame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.print();
        }
      });

      // Prev / Next file switcher
      overlay.querySelector('#viewerPrevFileBtn')?.addEventListener('click', () => {
        if (currentIndex > 0) {
          renderViewerContent(folderDocs[currentIndex - 1]);
        }
      });

      overlay.querySelector('#viewerNextFileBtn')?.addEventListener('click', () => {
        if (currentIndex < folderDocs.length - 1) {
          renderViewerContent(folderDocs[currentIndex + 1]);
        }
      });

      // Close handlers
      const closeViewer = () => {
        window.removeEventListener('keydown', keyListener);
        if (this.currentViewerBlobUrl) {
          URL.revokeObjectURL(this.currentViewerBlobUrl);
          this.currentViewerBlobUrl = null;
        }
        overlay.style.animation = 'none';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.22s ease';
        setTimeout(() => overlay.remove(), 220);
      };

      overlay.querySelector('#viewerTrafficClose')?.addEventListener('click', closeViewer);
      overlay.querySelector('#viewerHeaderCloseBtn')?.addEventListener('click', closeViewer);

      // Keyboard accelerators
      const keyListener = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          closeViewer();
        } else if (e.key === 'ArrowRight' && e.shiftKey) {
          e.preventDefault();
          if (currentIndex < folderDocs.length - 1) renderViewerContent(folderDocs[currentIndex + 1]);
        } else if (e.key === 'ArrowLeft' && e.shiftKey) {
          e.preventDefault();
          if (currentIndex > 0) renderViewerContent(folderDocs[currentIndex - 1]);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          this.viewerZoom = Math.min(250, this.viewerZoom + 15);
          applyTransform();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          this.viewerZoom = Math.max(40, this.viewerZoom - 15);
          applyTransform();
        } else if (e.key === '0') {
          e.preventDefault();
          this.viewerZoom = 100;
          this.viewerRotation = 0;
          applyTransform();
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          this.viewerRightDrawerOpen = !this.viewerRightDrawerOpen;
          overlay.querySelector('#viewerToggleInspectorBtn')?.classList.toggle('active', this.viewerRightDrawerOpen);
          overlay.querySelector('#viewerRightDrawer')?.classList.toggle('collapsed', !this.viewerRightDrawerOpen);
        } else if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          this.viewerLeftRailOpen = !this.viewerLeftRailOpen;
          overlay.querySelector('#viewerToggleThumbnailsBtn')?.classList.toggle('active', this.viewerLeftRailOpen);
          overlay.querySelector('#viewerLeftRail')?.classList.toggle('collapsed', !this.viewerLeftRailOpen);
        } else if (e.key.toLowerCase() === 'p') {
          e.preventDefault();
          overlay.querySelector('#viewerPdfFrame')?.contentWindow?.print();
        }
      };

      window.addEventListener('keydown', keyListener);
    };

    document.body.appendChild(overlay);
    renderViewerContent(doc);
  }

  async openPaperTrailModal(docId) {
    const existing = document.getElementById('vaultTrailModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultTrailModalOverlay';
    overlay.style.zIndex = '2147483647';

    let trailData = { current: null, parents: [], children: [] };
    try {
      const res = await fetch(`/api/compliance/vault/documents/${docId}/trail`, {
        headers: this.getAuthHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) trailData = await res.json();
    } catch (_) {}

    const cur = trailData.current || this.documents.find(d => Number(d.id) === Number(docId));

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 680px; max-width: 95vw; max-height: 90vh;">
        <div class="staff-modal-header">
          <h3>Document Trail</h3>
          <button class="staff-modal-close-btn" id="closeVaultTrailBtn">✕</button>
        </div>

        <div style="padding: 20px; overflow-y: auto;">
          <div style="background: rgba(0,0,0,0.04); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 700; color: #0284c7;">${cur?.doc_ref_no || ''}</div>
            <div style="font-size: 13px;">${cur?.title || ''}</div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="font-size: 11.5px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">Triggering Records</div>
            ${trailData.parents.length === 0 ? `<div style="font-size: 12px; color: #94a3b8;">No prior triggering records.</div>` : trailData.parents.map(p => `
              <div style="padding: 8px 12px; background: rgba(0,0,0,0.03); border-radius: 6px; margin-bottom: 6px;">
                <div style="font-size: 12.5px; font-weight: 600;">${p.doc_ref_no} — ${p.title}</div>
              </div>
            `).join('')}
          </div>

          <div>
            <div style="font-size: 11.5px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">Connected Replies & Dispatches</div>
            ${trailData.children.length === 0 ? `<div style="font-size: 12px; color: #94a3b8;">No replies linked.</div>` : trailData.children.map(c => `
              <div style="padding: 8px 12px; background: rgba(0,0,0,0.03); border-radius: 6px; margin-bottom: 6px;">
                <div style="font-size: 12.5px; font-weight: 600;">${c.doc_ref_no} — ${c.title}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeVaultTrailBtn')?.addEventListener('click', () => overlay.remove());
  }

  openNewPaperTrailModal(preselectedParentId = null) {
    const existing = document.getElementById('vaultNewTrailModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultNewTrailModalOverlay';
    overlay.style.zIndex = '2147483647';

    // Gather existing matters
    const existingMatters = Array.from(new Set(
      (this.timelineData?.matters || []).map(m => m.name).concat([
        'AYUSH GMP Inspection & Renewal 2026',
        'Dr. Mohanta Medical Officer Onboarding',
        'Statutory Manufacturing Licenses 2026'
      ])
    ));

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 580px; max-width: 95vw;">
        <div class="staff-modal-header">
          <h3>⚡ Link Paper Trail Causality</h3>
          <button class="staff-modal-close-btn" id="closeNewTrailBtn">✕</button>
        </div>

        <form id="vaultNewTrailForm" style="padding: 20px;">
          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Antecedent / Parent Document *</label>
            <select name="parent_doc_id" required>
              <option value="">Select triggering document...</option>
              ${this.documents.map(d => `
                <option value="${d.id}" ${Number(preselectedParentId) === Number(d.id) ? 'selected' : ''}>
                  ${d.doc_ref_no} — ${d.title} (${d.direction})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Causality Relationship Type *</label>
            <select name="link_relation" required>
              <option value="INWARD_TRIGGER">📥 Inward Regulatory Trigger (Notice / Demand)</option>
              <option value="REPLIED_WITH" selected>📤 Official Response / Dispatch (Form 48 / Reply)</option>
              <option value="ATTACHED_EVIDENCE">📎 Supporting Evidence / KYC / Credentials</option>
              <option value="SUPERSEDES">🔄 Supersedes / Replaces Prior Version</option>
              <option value="AUTHORIZED_BY">⚖️ Governing Authority / Board Sanction</option>
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Descendant / Child Document *</label>
            <select name="child_doc_id" required>
              <option value="">Select connected record or response...</option>
              ${this.documents.map(d => `
                <option value="${d.id}" ${Number(preselectedParentId) === Number(d.id) ? 'disabled' : ''}>
                  ${d.doc_ref_no} — ${d.title} (${d.direction})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Proceeding / Matter Thread Name</label>
            <input type="text" name="matter_thread_name" list="vaultMattersList" placeholder="e.g. AYUSH GMP Inspection 2026" value="AYUSH GMP Inspection & Renewal 2026" />
            <datalist id="vaultMattersList">
              ${existingMatters.map(m => `<option value="${m}">`).join('')}
            </datalist>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Audit Remarks / Turnaround Notes</label>
            <input type="text" name="notes" placeholder="e.g. Formal reply submitted within 4 business days" />
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelNewTrailBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save" style="background: linear-gradient(135deg, #0284c7, #38bdf8);">Create Causality Filament</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeNewTrailBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelNewTrailBtn')?.addEventListener('click', closeModal);

    overlay.querySelector('#vaultNewTrailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const parentId = form.parent_doc_id.value;
      const childId = form.child_doc_id.value;
      const relation = form.link_relation.value;
      const matter = form.matter_thread_name.value.trim();
      const notes = form.notes.value.trim();

      if (!parentId || !childId || parentId === childId) {
        alert('Please select two distinct documents.');
        return;
      }

      try {
        const res = await fetch('/api/compliance/vault/trail', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify({
            parent_doc_id: Number(parentId),
            child_doc_id: Number(childId),
            link_relation: relation,
            matter_thread_name: matter || null,
            notes: notes || null
          })
        });

        if (res.ok) {
          this.app?.showNotification('Causality filament created.', 'success');
          closeModal();
          await this.loadData();
          this.renderActivePage();
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Failed to link', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  // Create folder prompt (supports parent_id for sub-folders)
  openCreateFolderPrompt(parentId = null) {
    const parentName = parentId ? this.directories.find(d => d.id === parentId)?.name : null;
    const promptMsg = parentName ? `New sub-folder inside "${parentName}":` : 'Folder name:';
    const name = prompt(promptMsg);
    if (!name || !name.trim()) return;

    fetch('/api/compliance/vault/directories', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({
        name: name.trim(),
        department: 'General',
        icon: '📁',
        parent_id: parentId || null
      })
    })
    .then(r => r.json())
    .then(() => {
      this.app?.showNotification(`Folder "${name}" created.`, 'success');
      this.loadData();
    })
    .catch(err => this.app?.showNotification(err.message, 'error'));
  }

  openFolderOptionsModal(dirId) {
    const dir = this.directories.find(d => d.id === dirId);
    if (!dir) return;

    const action = prompt(`Folder: "${dir.name}"\nType 'RENAME' or 'DELETE':`).trim().toUpperCase();
    if (action === 'RENAME') {
      const newName = prompt('New name:', dir.name);
      if (newName && newName.trim()) {
        fetch(`/api/compliance/vault/directories/${dir.id}`, {
          method: 'PUT',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify({ name: newName.trim() })
        }).then(() => {
          this.app?.showNotification('Renamed.', 'success');
          this.loadData();
        });
      }
    } else if (action === 'DELETE') {
      if (confirm(`Delete folder "${dir.name}" and its contents?`)) {
        fetch(`/api/compliance/vault/directories/${dir.id}`, {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        }).then(() => {
          this.app?.showNotification('Deleted.', 'info');
          if (this.selectedDirId === dir.id) {
            this.selectedDirId = null;
            this.breadcrumbPath = [];
          }
          this.loadData();
        });
      }
    }
  }

  // ================= 3D IPOD COVER FLOW SONG-SELECTOR VIEWER =================
  openCoverFlow(dirId, initialItemId = null) {
    const dir = (this.directories || []).find(d => d.id === dirId);
    if (!dir) return;

    // Helper to find all descendants of a directory
    const getDescendants = (id) => {
      let res = [id];
      (this.directories || []).filter(d => d.parent_id === id).forEach(child => {
        res = res.concat(getDescendants(child.id));
      });
      return res;
    };

    // Sub-directories directly inside this directory
    const subDirs = (this.directories || []).filter(d => d.parent_id === dirId);

    // Documents directly inside this directory
    let dirFiles = (this.documents || []).filter(d => Number(d.dir_id) === dirId);

    // If no direct files, look for files in descendant directories
    if (dirFiles.length === 0) {
      const descendantIds = getDescendants(dirId);
      dirFiles = (this.documents || []).filter(d => descendantIds.includes(Number(d.dir_id)));
    }

    const items = [];

    // Add subfolders
    subDirs.forEach(sub => {
      const subDescendants = getDescendants(sub.id);
      const subFiles = (this.documents || []).filter(d => subDescendants.includes(Number(d.dir_id)));
      items.push({
        kind: 'folder',
        id: sub.id,
        title: sub.name,
        subtitle: `Folder • ${subFiles.length} ${subFiles.length === 1 ? 'file' : 'files'} inside`,
        data: sub,
        subFileCount: subFiles.length,
        color: this.getFolderColor(sub.name)
      });
    });

    // Add files
    dirFiles.forEach(file => {
      const sizeStr = this.formatFileSize(file.file_size);
      const metaParts = [
        file.doc_ref_no || null,
        file.direction ? (file.direction === 'INWARD' ? '📥 Inward' : file.direction === 'OUTWARD' ? '📤 Outward' : '📄 Document') : null,
        file.issue_date || null,
        sizeStr !== '—' ? sizeStr : null
      ].filter(Boolean);

      items.push({
        kind: 'file',
        id: file.id,
        title: file.title,
        subtitle: metaParts.join(' • '),
        data: file
      });
    });

    // If completely empty, just drill into directory
    if (items.length === 0) {
      this.drillIntoDirectory(dirId);
      return;
    }

    let initialIndex = 0;
    if (initialItemId) {
      const foundIdx = items.findIndex(it => it.id === initialItemId);
      if (foundIdx !== -1) initialIndex = foundIdx;
    }

    this.renderCoverFlowModal(dir, items, initialIndex);
  }

  renderCoverFlowModal(dir, items, initialIndex = 0) {
    // Remove existing if any
    const existing = document.getElementById('vaultCoverFlowOverlay');
    if (existing) existing.remove();

    this.coverFlowItems = items;
    this.coverFlowActiveIndex = Math.max(0, Math.min(items.length - 1, initialIndex));
    this.coverFlowCurrentDir = dir;

    const overlay = document.createElement('div');
    overlay.id = 'vaultCoverFlowOverlay';
    overlay.className = 'vault-coverflow-overlay';
    overlay.style.zIndex = '9999999';

    // Build cards HTML
    const cardsHtml = items.map((it, idx) => {
      if (it.kind === 'folder') {
        const sub = it.data;
        const color = it.color || this.getFolderColor(sub.name);
        return `
          <div class="coverflow-card" data-cover-idx="${idx}" style="--folder-color: ${color.hex};">
            <div class="coverflow-card-inner">
              <div class="coverflow-subfolder-inner">
                <div class="coverflow-subfolder-header" style="background: ${color.hex};">
                  <span class="coverflow-subfolder-tab-title">📁 ${sub.name.slice(0, 16)}</span>
                  <span class="coverflow-badge folder">FOLDER</span>
                </div>
                <div class="coverflow-subfolder-body">
                  <div class="coverflow-subfolder-big-icon">📁</div>
                  <div class="coverflow-subfolder-name">${sub.name}</div>
                  <div class="coverflow-subfolder-desc">${it.subFileCount} ${it.subFileCount === 1 ? 'file' : 'files'} inside</div>
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        const doc = it.data;
        return `
          <div class="coverflow-card" data-cover-idx="${idx}">
            <div class="coverflow-card-inner">
              <img src="/api/compliance/vault/documents/${doc.id}/thumbnail" 
                   alt="${doc.title}" 
                   class="coverflow-thumb-img" 
                   loading="lazy" 
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div class="file-card-img-fallback" style="display:none; width: 100%; height: 100%;">
                <span class="file-fallback-icon" style="font-size: 56px;">📄</span>
                <span class="file-fallback-code" style="font-size: 14px;">${doc.doc_ref_no || 'PDF'}</span>
              </div>
              <div class="coverflow-badge">PDF</div>
            </div>
          </div>
        `;
      }
    }).join('');

    overlay.innerHTML = `
      <div class="coverflow-backdrop-ambient"></div>
      <div class="coverflow-ambient-glow" id="coverflowAmbientGlow"></div>

      <!-- Header -->
      <div class="coverflow-header">
        <div class="coverflow-folder-info">
          <span class="coverflow-folder-icon">📁</span>
          <span class="coverflow-folder-name">${dir.name}</span>
          <span class="coverflow-counter-pill" id="coverflowCounterPill">${this.coverFlowActiveIndex + 1} of ${items.length}</span>
        </div>
        <button class="coverflow-close-btn" id="coverflowCloseBtn" title="Close (Esc)">✕</button>
      </div>

      <!-- 3D Stage -->
      <div class="coverflow-stage-wrapper" id="coverflowStageWrapper">
        <div class="coverflow-stage" id="coverflowStage">
          ${cardsHtml}
        </div>
      </div>

      <!-- Active Item Info (Song Selector Album Art style) -->
      <div class="coverflow-active-info" id="coverflowActiveInfo">
        <h2 class="coverflow-active-title" id="coverflowActiveTitle"></h2>
        <p class="coverflow-active-subtitle" id="coverflowActiveSubtitle"></p>
        <div class="coverflow-active-actions" id="coverflowActiveActions">
          <!-- Dynamically populated buttons -->
        </div>
      </div>

      <!-- Bottom Navigation / Scrubber -->
      <div class="coverflow-controls">
        <button class="coverflow-nav-arrow" id="coverflowPrevBtn" title="Previous (←)">‹</button>
        <input type="range" class="coverflow-scrubber" id="coverflowScrubber" min="0" max="${items.length - 1}" value="${this.coverFlowActiveIndex}" />
        <button class="coverflow-nav-arrow" id="coverflowNextBtn" title="Next (→)">›</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const updateCoverflowPositions = () => {
      const activeIdx = this.coverFlowActiveIndex;
      const activeItem = items[activeIdx];
      const cards = overlay.querySelectorAll('.coverflow-card');

      cards.forEach((card, i) => {
        const offset = i - activeIdx;
        if (offset === 0) {
          card.style.transform = `translateX(0px) translateZ(0px) rotateY(0deg) scale(1)`;
          card.style.zIndex = '100';
          card.style.opacity = '1';
          card.style.filter = 'brightness(1)';
          card.classList.add('active');
        } else if (offset < 0) {
          // Left items twisted towards middle (Cover Flow album art style)
          const tx = offset * 135 - 130;
          const tz = -130 - Math.abs(offset) * 55;
          const ry = 48;
          const scale = Math.max(0.66, 0.88 - Math.abs(offset) * 0.06);
          card.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
          card.style.zIndex = String(100 - Math.abs(offset));
          card.style.opacity = String(Math.max(0.12, 1 - Math.abs(offset) * 0.22));
          card.style.filter = `brightness(${Math.max(0.42, 1 - Math.abs(offset) * 0.16)})`;
          card.classList.remove('active');
        } else {
          // Right items twisted towards middle (Cover Flow album art style)
          const tx = offset * 135 + 130;
          const tz = -130 - Math.abs(offset) * 55;
          const ry = -48;
          const scale = Math.max(0.66, 0.88 - Math.abs(offset) * 0.06);
          card.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
          card.style.zIndex = String(100 - Math.abs(offset));
          card.style.opacity = String(Math.max(0.12, 1 - Math.abs(offset) * 0.22));
          card.style.filter = `brightness(${Math.max(0.42, 1 - Math.abs(offset) * 0.16)})`;
          card.classList.remove('active');
        }
      });

      // Update Info text
      const titleEl = overlay.querySelector('#coverflowActiveTitle');
      const subtitleEl = overlay.querySelector('#coverflowActiveSubtitle');
      const counterEl = overlay.querySelector('#coverflowCounterPill');
      const scrubber = overlay.querySelector('#coverflowScrubber');
      const prevBtn = overlay.querySelector('#coverflowPrevBtn');
      const nextBtn = overlay.querySelector('#coverflowNextBtn');
      const actionsEl = overlay.querySelector('#coverflowActiveActions');

      if (titleEl) titleEl.textContent = activeItem.title;
      if (subtitleEl) subtitleEl.textContent = activeItem.subtitle;
      if (counterEl) counterEl.textContent = `${activeIdx + 1} of ${items.length}`;
      if (scrubber) scrubber.value = activeIdx;
      if (prevBtn) prevBtn.disabled = activeIdx === 0;
      if (nextBtn) nextBtn.disabled = activeIdx === items.length - 1;

      // Update ambient glow color reflecting active cover
      const glowEl = overlay.querySelector('#coverflowAmbientGlow');
      if (glowEl) {
        if (activeItem.kind === 'folder') {
          const colorHex = activeItem.color?.hex || '#f59e0b';
          glowEl.style.background = `radial-gradient(circle, ${colorHex}44 0%, transparent 70%)`;
        } else {
          glowEl.style.background = `radial-gradient(circle, rgba(2, 132, 199, 0.28) 0%, transparent 70%)`;
        }
      }

      // Update actions buttons
      if (actionsEl) {
        if (activeItem.kind === 'folder') {
          actionsEl.innerHTML = `
            <button class="coverflow-action-btn primary" id="coverflowOpenActiveBtn">Open Folder 📁</button>
          `;
        } else {
          actionsEl.innerHTML = `
            <button class="coverflow-action-btn primary" id="coverflowOpenActiveBtn">Quick Look ↗</button>
            <a href="/api/compliance/vault/documents/${activeItem.id}/download" download class="coverflow-action-btn secondary" style="text-decoration: none;">Download ⬇</a>
          `;
        }

        actionsEl.querySelector('#coverflowOpenActiveBtn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          handleOpenActive();
        });
      }
    };

    const handleOpenActive = () => {
      const activeItem = items[this.coverFlowActiveIndex];
      closeCoverflow();
      if (activeItem.kind === 'folder') {
        this.drillIntoDirectory(activeItem.id);
      } else {
        this.openPdfPreviewModal(activeItem.id);
      }
    };

    const closeCoverflow = () => {
      window.removeEventListener('keydown', keyListener);
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease';
      setTimeout(() => overlay.remove(), 250);
    };

    const goToIndex = (newIdx) => {
      if (newIdx < 0 || newIdx >= items.length) return;
      this.coverFlowActiveIndex = newIdx;
      updateCoverflowPositions();
    };

    // Card click events: Click side card to center; click active card to open
    overlay.querySelectorAll('.coverflow-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const clickedIdx = Number(card.dataset.coverIdx);
        if (clickedIdx === this.coverFlowActiveIndex) {
          handleOpenActive();
        } else {
          goToIndex(clickedIdx);
        }
      });
    });

    // Scrubber drag/change
    const scrubber = overlay.querySelector('#coverflowScrubber');
    scrubber?.addEventListener('input', (e) => {
      goToIndex(Number(e.target.value));
    });

    // Prev / Next button clicks
    overlay.querySelector('#coverflowPrevBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      goToIndex(this.coverFlowActiveIndex - 1);
    });
    overlay.querySelector('#coverflowNextBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      goToIndex(this.coverFlowActiveIndex + 1);
    });

    // Close on button or backdrop click
    overlay.querySelector('#coverflowCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCoverflow();
    });
    overlay.querySelector('.coverflow-backdrop-ambient')?.addEventListener('click', () => {
      closeCoverflow();
    });

    // Mouse wheel / trackpad scroll control
    let wheelCooldown = false;
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (wheelCooldown) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 18) return;
      wheelCooldown = true;
      setTimeout(() => { wheelCooldown = false; }, 140);
      if (delta > 0) {
        goToIndex(this.coverFlowActiveIndex + 1);
      } else {
        goToIndex(this.coverFlowActiveIndex - 1);
      }
    }, { passive: false });

    // Drag / Swipe support
    let startX = 0;
    let isDragging = false;
    const stageWrapper = overlay.querySelector('#coverflowStageWrapper');
    stageWrapper?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.coverflow-card')) return;
      startX = e.clientX;
      isDragging = true;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const diff = e.clientX - startX;
      if (Math.abs(diff) > 55) {
        isDragging = false;
        if (diff < 0) {
          goToIndex(this.coverFlowActiveIndex + 1);
        } else {
          goToIndex(this.coverFlowActiveIndex - 1);
        }
      }
    });
    window.addEventListener('pointerup', () => {
      isDragging = false;
    });

    // Keyboard Arrow navigation & Escape
    const keyListener = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToIndex(this.coverFlowActiveIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToIndex(this.coverFlowActiveIndex - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCoverflow();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleOpenActive();
      }
    };
    window.addEventListener('keydown', keyListener);

    // Initial positioning
    updateCoverflowPositions();
  }

  destroy() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
    if (this.themeChangeHandler) {
      window.removeEventListener('macos-theme-changed', this.themeChangeHandler);
    }
  }
}
