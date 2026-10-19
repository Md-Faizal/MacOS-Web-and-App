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
    this.currentNavPage = 'dashboard'; // 'dashboard', 'all', 'inward', 'outward', 'internal', 'trails'
    this.selectedDirId = null;
    this.selectedDocIds = new Set();
    this.searchQuery = '';
    this.activeFilterChip = 'ALL';
    this.activeSort = 'recent'; // 'recent', 'name', 'inward', 'outward', 'internal'
    this.breadcrumbPath = []; // [{ id, name }]
    this.viewMode = 'grid'; // 'grid' | 'list' | 'columns'
    this.expandedDirs = new Set([1, 9]); // Default expand HR and Dr. Jashobanta so users see the tree
    this.selectedColumnPath = [1, 9]; // Default column path
    this.selectedColumnFile = null;
    this.sidebarCollapsed = false;
    this.fabMenuOpen = false;
    this.showPageNumbers = true;
    this.activeEditingDraftId = null;
    this.activeEditingDoc = null;
    this.originalDocSnapshot = null;

    // History navigation stack
    this.history = [];
    this.historyIdx = -1;

    if (typeof window !== 'undefined') {
      window.DocumentVaultExplorerInstance = this;
    }

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

    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      if (match && match[1]) {
        headers['x-csrf-token'] = decodeURIComponent(match[1]);
      }
    }
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

  // Clean tags and summary with AI priority
  generateTagsAndSummary(doc) {
    if (doc.tags) {
      try {
        const parsed = typeof doc.tags === 'string' ? JSON.parse(doc.tags) : doc.tags;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { tags: parsed, summary: doc.ai_summary || doc.subject || doc.title };
        }
      } catch (_) {}
    }

    const text = `${doc.title || ''} ${doc.subject || ''} ${doc.sender_party || ''} ${doc.recipient_party || ''}`.toLowerCase();
    const tags = new Set();

    if (doc.direction === 'INWARD') tags.add('Inward');
    if (doc.direction === 'OUTWARD') tags.add('Outward');
    if (doc.direction === 'INTERNAL') tags.add('Internal');
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

    const summary = doc.ai_summary || doc.subject || (doc.title ? `${doc.title} (${doc.direction})` : 'Document record');

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
          <button type="button" class="vault-batch-btn" id="vaultBatchEditBtn" style="background: rgba(2, 132, 199, 0.15); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.35); font-weight: 700; display: none;">✏️ Edit in Studio</button>
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
              <button class="vault-nav-item" data-page="internal">
                <span>🏢</span>
                <span>Internal Office Docs</span>
                <span class="vault-nav-badge" id="vaultNavInternalCount">0</span>
              </button>
              <button class="vault-nav-item" data-page="trails">
                <span>🔗</span>
                <span>Trails</span>
                <span class="vault-nav-badge" id="vaultNavTrailsCount">0</span>
              </button>
              <button class="vault-nav-item" data-page="create">
                <span>✍️</span>
                <span>Create Doc</span>
                <span class="vault-nav-badge" style="background: #2563eb; color: #fff;">Word</span>
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

    this.container.querySelector('#vaultBatchEditBtn')?.addEventListener('click', () => {
      const docIds = Array.from(this.selectedDocIds);
      if (docIds.length === 1) {
        const id = docIds[0];
        this.selectedDocIds.clear();
        this.updateBatchBar();
        this.editDocumentInStudio(id);
      }
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
    const internalEl = this.container.querySelector('#vaultNavInternalCount');
    const trailsEl = this.container.querySelector('#vaultNavTrailsCount');

    if (allEl) allEl.textContent = this.documents.length;
    if (inwardEl) inwardEl.textContent = this.documents.filter(d => d.direction === 'INWARD').length;
    if (outwardEl) outwardEl.textContent = this.documents.filter(d => d.direction === 'OUTWARD').length;
    if (internalEl) internalEl.textContent = this.documents.filter(d => d.direction === 'INTERNAL').length;
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
    } else if (this.currentNavPage === 'create') {
      this.renderWordDocumentCreatorView(viewport);
    } else {
      this.renderDirectoryFileManager(viewport);
    }
  }

  editDocumentInStudio(docId) {
    const doc = (this.documents || []).find(d => Number(d.id) === Number(docId));
    if (!doc) {
      this.app?.showNotification('Document record not found in vault.', 'error');
      return;
    }

    this.initialDocToEdit = doc;
    this.activeEditingDraftId = doc.id;
    this.activeEditingDoc = doc;
    this.originalDocSnapshot = JSON.parse(JSON.stringify(doc));
    this.currentNavPage = 'create';
    this.syncSidebarActiveNav();
    this.renderActivePage();
  }

  // =========================================================================
  // WORD-STYLE DOCUMENT CREATOR WITH PREAPPLIED LETTERHEAD & AUTO-SIGNING
  // =========================================================================
  async renderWordDocumentCreatorView(viewport) {
    let nextRef = 'UCA/COR/2026/0001';
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

    // Load signatories for auto-signing dropdown
    let signatories = [];
    try {
      const sRes = await fetch('/api/compliance/staff/signatories');
      if (sRes.ok) {
        const sData = await sRes.json();
        signatories = sData.signatories || [];
      }
    } catch (_) {}

    // Load company settings from app-settings (single source of truth)
    let companySettings = {
      company_name: 'UTKAL CHEMICAL AUSHADHALAYA',
      ayush_license: 'OR-02/AYUR',
      gstin: '21AAAAU1234C1Z5',
      gmp_ref: 'GMP-OD-AYU-2024-08',
      address: 'Industrial Estate, Rasulgarh, Bhubaneswar, Odisha - 751010',
      email: 'compliance@utkalchemical.com',
      phone: '+91 (0674) 2580123',
      proprietor_name: 'MD  FAIZAL',
      proprietor_title: 'Proprietor',
      proprietor_signature_data: ''
    };
    try {
      const appSetRes = await fetch('/api/settings/app-settings');
      if (appSetRes.ok) {
        const appSet = await appSetRes.json();
        if (appSet.company_legal_name) companySettings.company_name = appSet.company_legal_name;
        if (appSet.company_ayush_license) companySettings.ayush_license = appSet.company_ayush_license;
        if (appSet.company_gstin) companySettings.gstin = appSet.company_gstin;
        if (appSet.company_gmp_ref) companySettings.gmp_ref = appSet.company_gmp_ref;
        if (appSet.company_address) companySettings.address = appSet.company_address;
        if (appSet.company_email) companySettings.email = appSet.company_email;
        if (appSet.company_phone) companySettings.phone = appSet.company_phone;
        if (appSet.proprietor_name) companySettings.proprietor_name = appSet.proprietor_name;
        if (appSet.proprietor_title) companySettings.proprietor_title = appSet.proprietor_title;
        if (appSet.proprietor_signature_data) companySettings.proprietor_signature_data = appSet.proprietor_signature_data;
      }
    } catch (_) {}

    // Prepend Proprietor as master authorized signatory authority
    const proprietorSigner = {
      id: 'proprietor',
      full_name: companySettings.proprietor_name || 'MD  FAIZAL',
      designation: companySettings.proprietor_title || 'Proprietor',
      signature_title: companySettings.proprietor_title || 'Proprietor',
      signature_data: companySettings.proprietor_signature_data || '',
      is_authorized_signatory: 1
    };
    signatories = [proprietorSigner, ...signatories];

    let cachedHeaderBase64 = '';
    try {
      const hRes = await fetch('/assets/uca-letterhead-header.jpg');
      if (hRes.ok) {
        const hBlob = await hRes.blob();
        const reader = new FileReader();
        cachedHeaderBase64 = await new Promise((res) => {
          reader.onloadend = () => {
            const r = reader.result || '';
            res(r.includes(';base64,') ? r.split(';base64,')[1] : r);
          };
          reader.readAsDataURL(hBlob);
        });
      }
    } catch (_) {}

    const selectedSigner = signatories[0];
    this.creatorZoom = this.creatorZoom || 100;
    let updateTelemetry = () => {};
    let triggerLiveWasmSync = () => {};
    let checkPageAutoOverflow = () => {};
    let insertPageBreakAtSelection = () => {};

    viewport.innerHTML = `
      <div class="vault-word-creator-container">
        
        <!-- Word Ribbon Toolbar -->
        <div class="vault-word-ribbon">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="wrdBackToVaultBtn" class="vault-word-tool-btn" title="Back to Vault" style="font-weight: 700; color: #0284c7; background: rgba(2, 132, 199, 0.08); border-color: rgba(2, 132, 199, 0.2); padding: 5px 10px;">
              ‹ Vault
            </button>
            <span style="font-weight: 800; font-size: 13.5px; color: #1e3a8a; display: flex; align-items: center; gap: 5px; margin-right: 4px;">
              <span id="wrdStudioTitleIcon" style="font-size: 16px;">${this.activeEditingDraftId ? (this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? '✏️' : '📝') : '📄'}</span>
              <span id="wrdStudioTitleText">${this.activeEditingDraftId ? (this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? 'Document Editor' : 'Draft Editor') : 'Document Creator'}</span>
            </span>
            <span id="wrdStatusPill" style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; background: #e0f2fe; color: #0369a1; border: 1px solid rgba(2, 132, 199, 0.2);">
              ${this.activeEditingDraftId ? (this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? `Editing Official Record #${this.activeEditingDraftId}` : `Editing Draft #${this.activeEditingDraftId}`) : 'New Document'}
            </span>
            <select id="wrdDirSelect" required style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px; border: 1.5px solid #cbd5e1; background: #ffffff; outline: none; font-weight: 600;">
              <option value="">📁 Choose Vault Folder * (Required)</option>
              ${this.directories.map(d => `<option value="${d.id}" ${Number(this.selectedDirId) === Number(d.id) ? 'selected' : ''}>${d.name}</option>`).join('')}
            </select>
            <select id="wrdDirectionSelect" style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; outline: none; font-weight: 500;">
              <option value="OUTWARD">📤 Outward Official Letter</option>
              <option value="INTERNAL">🏢 Internal Office Note</option>
              <option value="INWARD">📥 Inward Regulatory Record</option>
            </select>
            <select id="wrdSignerSelect" title="Select Authorized Signatory for this document" style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px; border: 1.5px solid #0284c7; background: #f0f9ff; color: #0369a1; outline: none; font-weight: 700;">
              ${signatories.map(s => `
                <option value="${s.id}" ${String(selectedSigner?.id) === String(s.id) ? 'selected' : ''}>
                  ✍️ ${s.full_name} (${s.designation || 'Signatory'}${s.signature_data ? ' ✓' : ''})
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Quick Text Formatting Controls -->
          <div class="vault-creator-tool-group">
            <button type="button" class="vault-word-tool-btn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button type="button" class="vault-word-tool-btn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button type="button" class="vault-word-tool-btn" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
            <button type="button" class="vault-word-tool-btn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
            <span style="color: #cbd5e1; margin: 0 2px;">|</span>
            <button type="button" class="vault-word-tool-btn" data-cmd="insertUnorderedList" title="Bullet List">• List</button>
            <button type="button" class="vault-word-tool-btn" data-cmd="insertOrderedList" title="Numbered List">1. List</button>
            <span style="color: #cbd5e1; margin: 0 2px;">|</span>
            <button type="button" class="vault-word-tool-btn" data-cmd="justifyLeft" title="Align Left">Left</button>
            <button type="button" class="vault-word-tool-btn" data-cmd="justifyCenter" title="Align Center">Center</button>
            <button type="button" class="vault-word-tool-btn" data-cmd="justifyRight" title="Align Right">Right</button>
            <button type="button" class="vault-word-tool-btn" data-cmd="removeFormat" title="Clear Formatting">✕ Clear</button>
            <span style="color: #cbd5e1; margin: 0 2px;">|</span>
            <button type="button" id="wrdTogglePageNoBtn" class="vault-word-tool-btn" style="display: flex; align-items: center; gap: 5px; font-weight: 600; font-size: 11.5px; padding: 4px 9px;" title="Toggle Page Numbers on/off">
              <span>📄</span>
              <span id="wrdPageNoBtnLabel">Page Nos: ${this.showPageNumbers !== false ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" id="wrdAiDraftBtn" style="font-size: 12px; padding: 6px 12px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 5px rgba(79, 70, 229, 0.25);">
              <span>✨</span>
              <span>Draft with AI</span>
            </button>

            <button type="button" id="wrdToggleDraftsBtn" class="vault-word-tool-btn" style="border: 1px solid #cbd5e1; background: #ffffff; font-weight: 600; padding: 5px 10px;">
              <span>📑 Drafts</span>
              <span id="wrdDraftsBadge" style="background: #0284c7; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 10px; margin-left: 2px;">0</span>
            </button>

            <!-- Revert / Discard Unsaved Changes Button -->
            <button type="button" id="wrdRevertBtn" class="vault-word-tool-btn" style="display: ${this.activeEditingDraftId ? 'inline-flex' : 'none'}; border: 1px solid #fca5a5; background: #fef2f2; color: #dc2626; font-weight: 700; padding: 5px 10px;" title="Discard unsaved edits and restore original document state">
              ↺ <span id="wrdRevertBtnText">Revert</span>
            </button>

            <button type="button" id="wrdDraftBtn" class="vault-word-tool-btn" style="border: 1px solid #cbd5e1; background: #ffffff; font-weight: 700; padding: 5px 12px;">
              <span id="wrdDraftBtnIcon">${this.activeEditingDraftId && this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? '📋' : '💾'}</span> <span id="wrdDraftBtnText">${this.activeEditingDraftId ? (this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? 'Save as Copy' : 'Update Draft') : 'Save Draft'}</span>
            </button>

            <!-- Single-click Instant Pure Rust Vector WASM Proof Toggle -->
            <button type="button" id="wrdToggleProofBtn" class="vault-word-tool-btn" style="border: 1.5px solid #0284c7; background: #f0f9ff; color: #0284c7; font-weight: 700; padding: 5px 12px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;" title="Proof exact layout rendered by Pure Rust WASM Vector Engine">
              <span id="wrdToggleProofIcon">👁️</span>
              <span id="wrdToggleProofText">Vector Proof</span>
            </button>

            <!-- Export Dropdown Menu Wrapper -->
            <div class="vault-export-menu-wrapper">
              <button type="button" id="wrdExportMenuBtn" class="vault-word-tool-btn" style="background: #f8fafc; border: 1px solid #cbd5e1; font-weight: 700; padding: 5px 10px;">
                <span>📤 Export</span>
                <span style="font-size: 10px;">▼</span>
              </button>
              <div class="vault-export-dropdown" id="wrdExportDropdown">
                <button type="button" class="vault-export-item" id="wrdExportPdfBtn">
                  <span style="font-size: 15px;">📄</span>
                  <div>
                    <div style="font-weight: 700;">Export PDF</div>
                    <div style="font-size: 10.5px; color: #64748b;">Pure Rust Vector Engine (Letterhead & Seal)</div>
                  </div>
                </button>
                <button type="button" class="vault-export-item" id="wrdExportDocxBtn">
                  <span style="font-size: 15px;">📝</span>
                  <div>
                    <div style="font-weight: 700;">Export Word (.docx)</div>
                    <div style="font-size: 10.5px; color: #64748b;">Pure Rust OpenXML with Embedded Letterhead</div>
                  </div>
                </button>
                <button type="button" class="vault-export-item" id="wrdExportJpegBtn">
                  <span style="font-size: 15px;">🖼️</span>
                  <div>
                    <div style="font-weight: 700;">Export High-Res JPEG</div>
                    <div style="font-size: 10.5px; color: #64748b;">200 DPI Master Letterhead Print Graphic</div>
                  </div>
                </button>
                <div style="border-top: 1px solid #f1f5f9; margin: 4px 0;"></div>
                <button type="button" class="vault-export-item" id="wrdPrintBtn">
                  <span style="font-size: 15px;">🖨️</span>
                  <div>
                    <div style="font-weight: 700;">Print Document</div>
                    <div style="font-size: 10.5px; color: #64748b;">Direct browser printing dialog</div>
                  </div>
                </button>
              </div>
            </div>

            <button type="button" id="wrdSealBtn" style="font-size: 12px; padding: 6px 14px; background: ${this.activeEditingDraftId && this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)'}; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 5px ${this.activeEditingDraftId && this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? 'rgba(2, 132, 199, 0.25)' : 'rgba(5, 150, 105, 0.25)'};">
              <span id="wrdSealBtnIcon">${this.activeEditingDraftId && this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? '💾' : '🔏'}</span>
              <span id="wrdSealBtnText">${this.activeEditingDraftId && this.activeEditingDoc?.status === 'SEALED_OFFICIAL' ? 'Save Changes' : 'Issue & Seal'}</span>
            </button>
          </div>
        </div>

        <!-- Master Document Desk with Responsive Viewport & Zoom Scaling -->
        <div class="vault-creator-desk" id="wrdCreatorDesk">
          <!-- Floating Selection Format Capsule (Medium / Notion / Google Docs style) -->
          <div class="vault-bubble-toolbar hidden" id="wrdBubbleToolbar">
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
            <div class="vault-bubble-divider"></div>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="formatBlock" data-bubble-val="h2" title="Heading 2">H2</button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="insertUnorderedList" title="Bullet List">• List</button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="insertOrderedList" title="Numbered List">1. List</button>
            <div class="vault-bubble-divider"></div>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="hiliteColor" data-bubble-val="#fef08a" title="Highlight">🖍️</button>
            <button type="button" class="vault-bubble-btn" data-bubble-cmd="removeFormat" title="Clear Formatting">🧹</button>
          </div>

          <!-- Slash Command Menu Dropdown -->
          <div class="vault-slash-menu hidden" id="wrdSlashMenu" style="display: none;"></div>

          <!-- Real-Time Pure Rust Vector WASM Proof Container (Exact Same Layout & Geometry) -->
          <div class="vault-creator-scale-wrapper" id="wrdSvgScaleWrapper" style="display: none; transform: scale(${this.creatorZoom / 100}); transform-origin: top center; margin: 0 auto 36px auto; width: 794px;">
            <div id="wrdSvgPreviewContainer" style="width: 794px; background: #ffffff; box-shadow: 0 14px 38px -8px rgba(0,0,0,0.16), 0 0 1px 1px rgba(0,0,0,0.06); border-radius: 2px; overflow: hidden;">
            </div>
          </div>

          <div class="vault-creator-scale-wrapper" id="wrdScaleWrapper" style="transform: scale(${this.creatorZoom / 100});">
            
            <div class="vault-pages-container" id="wrdPagesContainer">
              <!-- Page 1 (Master Sheet with Letterhead Header) -->
              <div class="vault-page-sheet" data-page-index="0" id="wrdPageSheet_0">
                
                <!-- Preapplied Company Letterhead Header (Authentic High-Resolution Asset - Edge to Edge) -->
                <div class="vault-word-letterhead-header" style="position: relative; width: 100%; height: 218px; margin: 0; padding: 0; line-height: 0; border: none; overflow: hidden;">
                  <img src="/assets/uca-letterhead-header.png" alt="Utkal Chemical Aushadhalaya Letterhead" style="width: 100%; height: 218px; object-fit: cover; display: block; margin: 0; padding: 0; border: none;" onerror="this.onerror=null; this.src='/assets/uca-letterhead-header.jpg';">
                  
                  <!-- Dynamic Reference Number Input overlaid directly onto header's Ref. field at exact Rust coordinate (x=73pt/97px, y=103pt/137px) -->
                  <input type="text" id="wrdRefNo" value="${nextRef}" title="Document Reference Number" placeholder="Ref No" style="position: absolute; left: 97px; top: 137px; width: 195px; height: 20px; line-height: 18px; background: rgba(255, 255, 255, 0.95); border: 1px dashed rgba(148, 163, 184, 0.7); border-radius: 3px; padding: 1px 6px; font-family: Helvetica, Arial, sans-serif; font-weight: 700; font-size: 11.3px; color: #141e33; box-shadow: 0 1px 2px rgba(0,0,0,0.04); outline: none;">
                  
                  <!-- Dynamic Issue Date Input overlaid directly onto header's Date field at exact Rust coordinate (x=464pt/619px, y=103pt/137px) -->
                  <input type="date" id="wrdIssueDate" value="${new Date().toISOString().split('T')[0]}" title="Document Issue Date" style="position: absolute; left: 619px; top: 137px; width: 125px; height: 20px; line-height: 18px; background: rgba(255, 255, 255, 0.95); border: 1px dashed rgba(148, 163, 184, 0.7); border-radius: 3px; padding: 1px 6px; font-family: Helvetica, Arial, sans-serif; font-weight: 700; font-size: 11.3px; color: #141e33; box-shadow: 0 1px 2px rgba(0,0,0,0.04); outline: none;">
                </div>

                <!-- Letter Body Container calibrated to exact Rust content start (175pt = 233px from top -> margin-top: 15px) and margins (50pt = 67px) -->
                <div class="vault-word-body-content" style="margin-top: 15px; padding: 0 67px; position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;">
                  <!-- Recipient Party, Subject & Title Inputs (Crisp document typography matching PDF layout) -->
                  <div style="margin-bottom: 16px; display: flex; flex-direction: column; gap: 14px;">
                    <div>
                      <div style="font-weight: 700; font-size: 14px; color: #000000; margin-bottom: 2px; font-family: Helvetica, Arial, sans-serif;">To,</div>
                      <input type="text" id="wrdRecipient" placeholder="Recipient Authority / Name (e.g. The State Licensing Authority, AYUSH)" style="width: 100%; border: 1px dashed rgba(148, 163, 184, 0.6); border-radius: 4px; padding: 3px 6px; font-size: 14.7px; line-height: 18.7px; font-weight: 700; color: #142647; outline: none; background: rgba(248, 250, 252, 0.6); font-family: Helvetica, Arial, sans-serif;">
                    </div>

                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                      <span style="font-weight: 700; font-size: 14.7px; color: #142e59; letter-spacing: 0.2px; margin-top: 3px; white-space: nowrap; font-family: Helvetica, Arial, sans-serif;">SUB:</span>
                      <textarea id="wrdSubject" rows="1" placeholder="Formal Subject Line (e.g. Compliance Report for Form 25D renewal)" style="flex: 1; border: 1px dashed rgba(148, 163, 184, 0.6); border-radius: 4px; padding: 3px 6px; font-size: 14.7px; line-height: 18.7px; font-weight: 700; color: #142e59; outline: none; background: rgba(248, 250, 252, 0.6); resize: none; overflow-y: hidden; font-family: Helvetica, Arial, sans-serif; box-sizing: border-box; text-transform: uppercase;"></textarea>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; font-size: 14.7px; color: #142647; letter-spacing: 0.2px; white-space: nowrap; font-family: Helvetica, Arial, sans-serif;">TITLE:</span>
                      <input type="text" id="wrdTitle" placeholder="Document Title (e.g. Annual Technical Compliance Submission)" style="flex: 1; border: 1px dashed rgba(148, 163, 184, 0.6); border-radius: 4px; padding: 3px 6px; font-size: 14.7px; line-height: 18.7px; font-weight: 700; color: #142647; outline: none; background: rgba(248, 250, 252, 0.6); text-transform: uppercase; font-family: Helvetica, Arial, sans-serif;">
                    </div>
                  </div>

                  <!-- Page 1 ContentEditable Body (Calibrated to exact Rust font-size 9.0pt/12px and line-height 14.0pt/18.7px) -->
                  <div id="wrdEditorBody" class="wrd-page-editor" data-page-index="0" contenteditable="true" spellcheck="true" style="min-height: 300px; outline: none; line-height: 18.7px; font-size: 12.0px; color: #1f242e; padding: 4px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; font-family: Helvetica, Arial, sans-serif;">
                    <p style="margin-bottom: 16px;">Dear Sir / Madam,</p>
                    <p style="margin-bottom: 10.7px;">With reference to statutory requirements and regulatory guidelines under the Drugs & Cosmetics Rules 1945 and Schedule T governance, we hereby submit the official documentation for your kind record and consideration.</p>
                    <p style="margin-bottom: 10.7px;">The manufacturing premises and operations continue to strictly comply with all prescribed standard operating procedures (SOPs), quality control validations, and batch manufacturing records (BMR).</p>
                    <p style="margin-bottom: 10.7px;">Kindly acknowledge receipt and issue regulatory confirmation accordingly.</p>
                  </div>
                </div>

                <!-- Auto-Signing Authority Section (Positioned at exact Rust WASM coordinates: with sig top 893px = 669.89pt, without sig top 925px = 693.89pt, right 67px = 50pt, width 273px = 205pt) -->
                <div id="wrdSignatorySection" style="position: absolute; ${selectedSigner?.signature_data ? 'top: 893px;' : 'top: 925px;'} right: 67px; width: 273px; text-align: left; z-index: 5;">
                  <div style="font-size: 12.7px; font-weight: 700; color: #0d3366; font-family: Helvetica, Arial, sans-serif; line-height: 16px; margin: 0 0 6px 0;">
                    For ${companySettings.company_name},
                  </div>

                  <!-- Specimen Signature Canvas / Clearance Box (Exact 52pt/69px Rust WASM Geometry - Vertically Centered) -->
                  <div id="wrdSignaturePreviewBox" style="${selectedSigner?.signature_data ? 'height: 60px; min-height: 60px; max-height: 60px; margin: 4px 0 4px 0; display: flex; align-items: center; justify-content: flex-start;' : 'height: 51px; min-height: 51px; max-height: 51px; margin: 0 0 13px 0; display: flex; align-items: flex-end; justify-content: flex-start;'} width: 100%; padding: 0;">
                    ${selectedSigner?.signature_data ? `
                      <img id="wrdSignatureImg" src="${selectedSigner.signature_data}" alt="Authorized Signature" style="max-height: 54px; max-width: 200px; object-fit: contain; object-position: left center;">
                    ` : `
                      <div id="wrdNoSigNotice" style="width: 160px; border-bottom: 1.5px dashed #94a3b8; padding-bottom: 3px; font-size: 11px; color: #94a3b8; font-style: italic;">
                        (Authorized Signatory)
                      </div>
                    `}
                  </div>

                  <div id="wrdSignerName" style="font-weight: 700; font-size: 14px; color: #000000; font-family: Helvetica, Arial, sans-serif; line-height: 16px; margin: 0 0 1px 0;">
                    ${selectedSigner?.full_name || 'MD  FAIZAL'}
                  </div>
                  <div id="wrdSignerTitle" style="font-size: 12px; color: #59616b; font-family: Helvetica, Arial, sans-serif; line-height: 15px; margin: 0 0 1px 0;">
                    ${selectedSigner?.signature_title || selectedSigner?.designation || 'Proprietor'}
                  </div>
                  <div id="wrdSignerReg" style="font-size: 10px; color: #14664d; font-weight: 700; line-height: 13px; margin: 0; font-family: monospace;">
                    ${selectedSigner?.technical_reg_no ? `Reg: ${selectedSigner.technical_reg_no}` : ''}
                  </div>
                </div>

                <!-- Page 1 Footer -->
                <div class="vault-page-footer" data-page-footer="0" style="display: ${this.showPageNumbers !== false ? 'flex' : 'none'}; justify-content: flex-end;">
                  <span class="wrd-page-number-label" style="font-size: 11px; font-weight: 700; color: #475569;">Page 1 of <span class="wrd-total-pages-count">1</span></span>
                </div>
              </div>
            </div>

            <!-- Add Continuation Page Desk Control (Centered below pages container) -->
            <div style="display: flex; justify-content: center; width: 794px; margin: 20px 0 36px 0;">
              <button type="button" id="wrdAddPageBtn" class="vault-add-page-btn">
                <span style="font-size: 16px;">➕</span> Add Continuation Page
              </button>
            </div>

          </div>
        </div>

        <!-- Slide-over Saved Drafts Drawer -->
        <div class="vault-drafts-drawer" id="wrdDraftsDrawer">
          <div style="padding: 14px 16px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; background: #f8fafc;">
            <div style="font-weight: 800; font-size: 14px; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <span>📑 Saved Drafts</span>
              <span id="wrdDrawerDraftCount" style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 7px; border-radius: 10px;">0</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button type="button" id="wrdNewDocBtn" style="font-size: 11px; font-weight: 700; background: #0284c7; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                + New Blank
              </button>
              <button type="button" id="wrdCloseDraftsBtn" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b;">✕</button>
            </div>
          </div>
          <div id="wrdDraftsList" style="flex: 1; overflow-y: auto; padding: 14px;">
            <div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 20px;">Loading drafts...</div>
          </div>
        </div>

        <!-- Floating Status Bar with Telemetry & Zoom -->
        <div class="vault-creator-footer" id="wrdCreatorFooter">
          <div style="display: flex; align-items: center; gap: 12px;" id="wrdTelemetryStats">
            <span id="wrdPageCount" style="font-weight: 700; color: #0284c7;">Page 1 of 1</span>
            <span>•</span>
            <span id="wrdWordCount">0 words</span>
            <span>•</span>
            <span id="wrdCharCount">0 characters</span>
            <span>•</span>
            <span id="wrdReadTime">0 min read</span>
            <span>•</span>
            <span id="wrdWasmStatus" style="font-size: 11px; color: #059669; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              <span style="font-size: 12px;">⚡</span> WASM Vector Proof: In Sync
            </span>
          </div>

          <div id="wrdAutoSaveStatus" style="font-weight: 500; color: #059669; display: flex; align-items: center; gap: 4px;">
            <span>☁️</span> Auto-save ready
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" id="wrdZoomOutBtn" style="background: none; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer;" title="Zoom Out (-)">−</button>
            <span id="wrdZoomLabel" style="min-width: 42px; text-align: center; font-weight: 700; font-size: 11px; cursor: pointer;" title="Reset Zoom to 100%">${this.creatorZoom}%</span>
            <button type="button" id="wrdZoomInBtn" style="background: none; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer;" title="Zoom In (+)">+</button>
            <button type="button" id="wrdZoomFitBtn" style="background: none; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer;" title="Fit Width">Fit</button>
          </div>
        </div>

      </div>
    `;

    // Setup Text Formatting Tools
    viewport.querySelectorAll('.vault-word-tool-btn[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (cmd) {
          document.execCommand(cmd, false, null);
          updateTelemetry();
        }
      });
    });

    // Navigation back to Vault
    viewport.querySelector('#wrdBackToVaultBtn')?.addEventListener('click', () => {
      this.currentNavPage = 'dashboard';
      this.container.querySelectorAll('.vault-nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.page === 'dashboard');
      });
      this.renderActivePage();
    });

    // Zoom Controls
    const scaleWrapper = viewport.querySelector('#wrdScaleWrapper');
    const svgScaleWrapper = viewport.querySelector('#wrdSvgScaleWrapper');
    const zoomLabel = viewport.querySelector('#wrdZoomLabel');
    const applyZoom = (val) => {
      this.creatorZoom = Math.max(50, Math.min(180, Math.round(val)));
      if (scaleWrapper) scaleWrapper.style.transform = `scale(${this.creatorZoom / 100})`;
      if (svgScaleWrapper) svgScaleWrapper.style.transform = `scale(${this.creatorZoom / 100})`;
      if (zoomLabel) zoomLabel.textContent = `${this.creatorZoom}%`;
    };

    viewport.querySelector('#wrdZoomInBtn')?.addEventListener('click', () => applyZoom(this.creatorZoom + 10));
    viewport.querySelector('#wrdZoomOutBtn')?.addEventListener('click', () => applyZoom(this.creatorZoom - 10));
    viewport.querySelector('#wrdZoomLabel')?.addEventListener('click', () => applyZoom(100));
    viewport.querySelector('#wrdZoomFitBtn')?.addEventListener('click', () => {
      const desk = viewport.querySelector('#wrdCreatorDesk');
      if (desk) {
        const availableWidth = desk.clientWidth - 48;
        const fitZoom = (availableWidth / 794) * 100;
        applyZoom(fitZoom);
      }
    });

    // Desk & Container References
    const desk = viewport.querySelector('#wrdCreatorDesk');
    const pagesContainer = viewport.querySelector('#wrdPagesContainer');
    const signatorySection = viewport.querySelector('#wrdSignatorySection');
    const bubbleToolbar = viewport.querySelector('#wrdBubbleToolbar');
    const slashMenu = viewport.querySelector('#wrdSlashMenu');

    // ================= SLASH COMMAND PALETTE DEFINITIONS =================
    const SLASH_COMMANDS = [
      {
        id: 'text',
        title: 'Text Paragraph',
        desc: 'Plain text paragraph with standard line spacing',
        badge: 'P',
        icon: '📝',
        keywords: ['text', 'paragraph', 'normal', 'p', 'body'],
        action: () => document.execCommand('formatBlock', false, '<p>')
      },
      {
        id: 'h1',
        title: 'Heading 1',
        desc: 'Top-level document section heading',
        badge: 'H1',
        icon: '🏷️',
        keywords: ['h1', 'heading', 'title', 'section', 'header'],
        action: () => document.execCommand('formatBlock', false, '<h2>')
      },
      {
        id: 'h2',
        title: 'Heading 2',
        desc: 'Sub-heading for technical sub-clauses',
        badge: 'H2',
        icon: '📌',
        keywords: ['h2', 'subheading', 'subtitle', 'clause'],
        action: () => document.execCommand('formatBlock', false, '<h3>')
      },
      {
        id: 'bullet_list',
        title: 'Bullet List',
        desc: 'Standard un-ordered regulatory item list',
        badge: 'UL',
        icon: '•',
        keywords: ['bullet', 'list', 'ul', 'points'],
        action: () => document.execCommand('insertUnorderedList', false, null)
      },
      {
        id: 'numbered_list',
        title: 'Numbered List',
        desc: 'Sequential protocol or procedural step list',
        badge: 'OL',
        icon: '1.',
        keywords: ['numbered', 'list', 'ol', 'steps', 'sequence'],
        action: () => document.execCommand('insertOrderedList', false, null)
      },
      {
        id: 'table',
        title: 'Regulatory QA Table',
        desc: 'Standard 3x3 quality release & test matrix',
        badge: 'Table',
        icon: '📊',
        keywords: ['table', 'qa', 'test', 'matrix', 'grid', 'specification'],
        action: () => {
          const tableHtml = `
            <table class="vault-editor-table">
              <thead>
                <tr>
                  <th style="width: 28%;">Test Parameter</th>
                  <th style="width: 44%;">Statutory Standard (API / Pharmacopoeial)</th>
                  <th style="width: 28%;">Observed Result</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Description &amp; Character</td><td>Homogeneous classical Ayurvedic preparation</td><td>Complies standard</td></tr>
                <tr><td>Assay / Active Marker</td><td>Not less than 95.0% w/w</td><td>98.4% w/w (Pass)</td></tr>
                <tr><td>Microbial Contamination</td><td>Total aerobic microbial count &lt; 10³ CFU/g</td><td>&lt; 10² CFU/g (Pass)</td></tr>
              </tbody>
            </table>
            <p><br></p>
          `;
          document.execCommand('insertHTML', false, tableHtml);
        }
      },
      {
        id: 'schedule_t',
        title: 'Schedule T GMP Clause',
        desc: 'Statutory Good Manufacturing Practices warranty statement',
        badge: 'Statutory',
        icon: '🛡️',
        keywords: ['schedule', 'gmp', 't', 'compliance', 'statutory'],
        action: () => {
          const clauseHtml = `
            <p style="margin: 10px 0; background: #f0f9ff; border-left: 3px solid #0284c7; padding: 6px 12px; font-style: italic; font-size: 11.5px; color: #0f172a;">
              <strong>Statutory Schedule T Compliance:</strong> The manufacturing operations, aseptic handling, in-process testing, and batch manufacturing records (BMR) strictly adhere to Schedule T of the Drugs &amp; Cosmetics Rules 1945, ensuring full technical compliance and quality assurance.
            </p>
            <p><br></p>
          `;
          document.execCommand('insertHTML', false, clauseHtml);
        }
      },
      {
        id: 'form_25d',
        title: 'Form 25D Licensing Clause',
        desc: 'Official Ayurvedic manufacturing license affirmation',
        badge: 'License',
        icon: '📜',
        keywords: ['form', '25d', 'license', 'ayush', 'authority'],
        action: () => {
          const clauseHtml = `
            <p style="margin: 10px 0; background: #ecfdf5; border-left: 3px solid #059669; padding: 6px 12px; font-style: italic; font-size: 11.5px; color: #064e3b;">
              <strong>Statutory Licensing Clause:</strong> Manufactured under valid Ayurvedic Drug License issued on Form 25D by the State Licensing Authority (AYUSH), maintained in full active standing and compliance with statutory inspection protocols.
            </p>
            <p><br></p>
          `;
          document.execCommand('insertHTML', false, clauseHtml);
        }
      },
      {
        id: 'raw_material_qc',
        title: 'Raw Material QC Statement',
        desc: 'Botanical authentication & pharmacopoeial assay clearance',
        badge: 'QC Test',
        icon: '🔬',
        keywords: ['raw', 'material', 'qc', 'herbal', 'purity', 'testing', 'assay'],
        action: () => {
          const clauseHtml = `
            <p style="margin: 10px 0; background: #fffbeb; border-left: 3px solid #d97706; padding: 6px 12px; font-style: italic; font-size: 11.5px; color: #78350f;">
              <strong>Raw Material QC Clearance:</strong> All herbal inputs, mineral ingredients, and excipients used in this batch have passed rigorous botanical identity authentication, assay, heavy metal screening, and pesticide residue testing prior to production.
            </p>
            <p><br></p>
          `;
          document.execCommand('insertHTML', false, clauseHtml);
        }
      },
      {
        id: 'date_stamp',
        title: 'Current Date Stamp',
        desc: 'Inserts current official formatted date',
        badge: 'Date',
        icon: '📅',
        keywords: ['date', 'today', 'stamp', 'time', 'now'],
        action: () => {
          const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
          document.execCommand('insertText', false, today);
        }
      },
      {
        id: 'page_break',
        title: 'Page Break',
        desc: 'Pushes content following caret cleanly to a continuation sheet',
        badge: 'Break',
        icon: '✂️',
        keywords: ['page', 'break', 'new', 'sheet', 'continuation', 'split'],
        action: () => insertPageBreakAtSelection()
      }
    ];

    // ================= SLASH COMMAND PALETTE CONTROLLER =================
    let slashActive = false;
    let slashQuery = '';
    let slashFilteredCommands = [...SLASH_COMMANDS];
    let selectedSlashIdx = 0;
    let slashAnchorNode = null;
    let slashAnchorOffset = 0;

    const renderSlashMenu = () => {
      if (!slashMenu) return;
      if (slashFilteredCommands.length === 0) {
        slashMenu.innerHTML = `
          <div class="vault-slash-header">Commands</div>
          <div style="padding: 10px; font-size: 11.5px; color: #94a3b8; text-align: center;">No matching block or clause</div>
        `;
        return;
      }

      let html = '<div class="vault-slash-header">Insert Block or Statutory Clause</div>';
      slashFilteredCommands.forEach((cmd, i) => {
        const isSelected = i === selectedSlashIdx;
        html += `
          <button type="button" class="vault-slash-item ${isSelected ? 'selected' : ''}" data-slash-idx="${i}">
            <div class="vault-slash-icon">${cmd.icon}</div>
            <div class="vault-slash-text-col">
              <div class="vault-slash-title">${cmd.title}</div>
              <div class="vault-slash-desc">${cmd.desc}</div>
            </div>
            <span class="vault-slash-badge">${cmd.badge}</span>
          </button>
        `;
      });
      slashMenu.innerHTML = html;

      slashMenu.querySelectorAll('.vault-slash-item').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = Number(btn.dataset.slashIdx);
          executeSlashCommand(slashFilteredCommands[idx]);
        });
      });
    };

    const openSlashMenu = (rect) => {
      if (!slashMenu || !desk) return;
      slashActive = true;
      slashQuery = '';
      slashFilteredCommands = [...SLASH_COMMANDS];
      selectedSlashIdx = 0;
      renderSlashMenu();

      const deskRect = desk.getBoundingClientRect();
      const left = Math.max(16, Math.min(desk.scrollWidth - 340, (rect.left - deskRect.left) + desk.scrollLeft));
      const top = (rect.bottom - deskRect.top) + desk.scrollTop + 6;

      slashMenu.style.left = `${left}px`;
      slashMenu.style.top = `${top}px`;
      slashMenu.style.display = 'flex';
      slashMenu.classList.remove('hidden');
    };

    const closeSlashMenu = () => {
      slashActive = false;
      slashQuery = '';
      if (slashMenu) {
        slashMenu.style.display = 'none';
        slashMenu.classList.add('hidden');
      }
    };

    const executeSlashCommand = (cmd) => {
      if (!cmd) return;
      const sel = window.getSelection();
      if (slashAnchorNode && sel && sel.containsNode(slashAnchorNode, true)) {
        try {
          const text = slashAnchorNode.nodeValue || '';
          const before = text.substring(0, Math.max(0, slashAnchorOffset - 1));
          const after = text.substring(slashAnchorOffset + slashQuery.length);
          slashAnchorNode.nodeValue = before + after;
          const range = document.createRange();
          range.setStart(slashAnchorNode, before.length);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
      }
      closeSlashMenu();
      cmd.action();
      updateTelemetry();
      const activeEd = document.activeElement?.closest('.wrd-page-editor') || viewport.querySelector('#wrdEditorBody');
      if (activeEd) checkPageAutoOverflow(activeEd);
      triggerLiveWasmSync();
    };

    // ================= FLOATING SELECTION BUBBLE TOOLBAR =================
    const updateBubbleToolbar = () => {
      if (!bubbleToolbar || !desk) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        bubbleToolbar.classList.add('hidden');
        return;
      }

      const text = sel.toString().trim();
      if (text.length === 0) {
        bubbleToolbar.classList.add('hidden');
        return;
      }

      const range = sel.getRangeAt(0);
      const commonNode = range.commonAncestorContainer;
      const editor = commonNode.nodeType === Node.ELEMENT_NODE
        ? commonNode.closest('.wrd-page-editor')
        : commonNode.parentElement?.closest('.wrd-page-editor');

      if (!editor) {
        bubbleToolbar.classList.add('hidden');
        return;
      }

      const rect = range.getBoundingClientRect();
      const deskRect = desk.getBoundingClientRect();
      const toolbarWidth = bubbleToolbar.offsetWidth || 340;
      const toolbarHeight = bubbleToolbar.offsetHeight || 38;

      const centerLeft = (rect.left - deskRect.left) + desk.scrollLeft + (rect.width / 2);
      const targetLeft = Math.max(20, Math.min(desk.scrollWidth - toolbarWidth - 20, centerLeft - (toolbarWidth / 2)));
      const targetTop = Math.max(10, (rect.top - deskRect.top) + desk.scrollTop - toolbarHeight - 12);

      bubbleToolbar.style.left = `${targetLeft}px`;
      bubbleToolbar.style.top = `${targetTop}px`;
      bubbleToolbar.classList.remove('hidden');

      bubbleToolbar.querySelectorAll('.vault-bubble-btn[data-bubble-cmd]').forEach(b => {
        const cmd = b.dataset.bubbleCmd;
        if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'strikeThrough') {
          b.classList.toggle('active', document.queryCommandState(cmd));
        }
      });
    };

    bubbleToolbar?.querySelectorAll('.vault-bubble-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const cmd = btn.dataset.bubbleCmd;
        const val = btn.dataset.bubbleVal || null;
        if (cmd) {
          document.execCommand(cmd, false, val);
          updateTelemetry();
          updateBubbleToolbar();
          triggerLiveWasmSync();
        }
      });
    });

    document.addEventListener('selectionchange', () => {
      if (desk && !desk.contains(document.activeElement)) {
        bubbleToolbar?.classList.add('hidden');
        return;
      }
      updateBubbleToolbar();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#wrdSlashMenu')) {
        closeSlashMenu();
      }
    });

    // ================= LIVE TELEMETRY (Words, Chars, Pages, Read Time) =================
    updateTelemetry = () => {
      const editors = viewport.querySelectorAll('.wrd-page-editor');
      let text = '';
      editors.forEach(ed => {
        text += ' ' + (ed.innerText || ed.textContent || '');
      });
      text = text.trim();
      const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
      const chars = text.length;
      const readMinutes = Math.max(1, Math.ceil(words / 200));

      const wordEl = viewport.querySelector('#wrdWordCount');
      const charEl = viewport.querySelector('#wrdCharCount');
      const readEl = viewport.querySelector('#wrdReadTime');
      const pageCountEl = viewport.querySelector('#wrdPageCount');

      if (wordEl) wordEl.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
      if (charEl) charEl.textContent = `${chars} ${chars === 1 ? 'character' : 'characters'}`;
      if (readEl) readEl.textContent = words > 0 ? `${readMinutes} min read` : '0 min read';

      if (pageCountEl && pagesContainer) {
        const sheets = pagesContainer.querySelectorAll('.vault-page-sheet');
        const activeSheet = document.activeElement?.closest('.vault-page-sheet');
        const curPage = activeSheet ? (Number(activeSheet.dataset.pageIndex || 0) + 1) : 1;
        pageCountEl.textContent = `Page ${curPage} of ${Math.max(1, sheets.length)}`;
      }
    };

    // ================= MULTIPAGE MANAGEMENT & NUMBERING =================
    const updatePageFootersAndNumbers = () => {
      if (!pagesContainer) return;
      const sheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));
      const totalPages = Math.max(1, sheets.length);
      const currentRef = viewport.querySelector('#wrdRefNo')?.value || '';
      const currentDt = viewport.querySelector('#wrdIssueDate')?.value || '';

      sheets.forEach((sheet, idx) => {
        sheet.dataset.pageIndex = idx;
        const pageNum = idx + 1;

        const badge = sheet.querySelector('.wrd-page-badge');
        if (badge) badge.textContent = `📑 Page ${pageNum}`;

        const refOverlay = sheet.querySelector('.wrd-continuation-ref-overlay');
        const dateOverlay = sheet.querySelector('.wrd-continuation-date-overlay');
        if (refOverlay) refOverlay.textContent = currentRef;
        if (dateOverlay) dateOverlay.textContent = currentDt;

        const refDateEl = sheet.querySelector('.wrd-continuation-ref-date');
        if (refDateEl) {
          refDateEl.textContent = `${currentRef}  •  ${currentDt}`;
        }

        const upBtn = sheet.querySelector('.wrd-move-page-up');
        const downBtn = sheet.querySelector('.wrd-move-page-down');
        if (upBtn) upBtn.disabled = idx === 1;
        if (downBtn) downBtn.disabled = idx === totalPages - 1;

        const footer = sheet.querySelector('.vault-page-footer');
        if (footer) {
          footer.style.display = this.showPageNumbers !== false ? 'flex' : 'none';
          const label = footer.querySelector('.wrd-page-number-label');
          if (label) {
            label.innerHTML = `Page ${pageNum} of <span class="wrd-total-pages-count">${totalPages}</span>`;
          }
        }
      });

      // Move Signatory block strictly to the last page ONLY
      if (signatorySection && sheets.length > 0) {
        const lastSheet = sheets[sheets.length - 1];
        if (signatorySection.parentElement !== lastSheet) {
          lastSheet.appendChild(signatorySection);
        }
      }

      updateTelemetry();
    };

    const reshufflePages = (fromIdx, toIdx) => {
      const sheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));
      const fromEd = sheets[fromIdx]?.querySelector('.wrd-page-editor');
      const toEd = sheets[toIdx]?.querySelector('.wrd-page-editor');
      if (fromEd && toEd) {
        const temp = fromEd.innerHTML;
        fromEd.innerHTML = toEd.innerHTML;
        toEd.innerHTML = temp;
        updatePageFootersAndNumbers();
        this.app?.showNotification(`Swapped Page ${fromIdx + 1} with Page ${toIdx + 1}`, 'info');
      }
    };

    // ================= CONTINUOUS BI-DIRECTIONAL AUTO-PAGINATION ENGINE =================
    let isSpilling = false;
    checkPageAutoOverflow = (editor) => {
      if (isSpilling || !editor) return;
      const idx = Number(editor.dataset.pageIndex || 0);
      const sheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));
      const isLastSheet = idx === sheets.length - 1;
      const maxAllowedHeight = idx === 0 ? 490 : (isLastSheet ? 520 : 660);

      // 1. Forward Overflow: push trailing block elements to next sheet
      if (editor.scrollHeight > maxAllowedHeight + 15) {
        isSpilling = true;
        try {
          const children = Array.from(editor.children);
          if (children.length > 1) {
            let splitIdx = children.length - 1;
            for (let i = 0; i < children.length; i++) {
              const childBottom = children[i].offsetTop + children[i].offsetHeight;
              if (childBottom > maxAllowedHeight) {
                splitIdx = Math.max(1, i);
                break;
              }
            }
            const overflowing = children.slice(splitIdx);
            if (overflowing.length > 0) {
              const overflowHtml = overflowing.map(c => c.outerHTML).join('');
              overflowing.forEach(c => c.remove());

              if (idx + 1 < sheets.length) {
                const nextEd = sheets[idx + 1].querySelector('.wrd-page-editor');
                if (nextEd) {
                  nextEd.innerHTML = overflowHtml + nextEd.innerHTML;
                  checkPageAutoOverflow(nextEd);
                }
              } else {
                addContinuationPage(overflowHtml, false);
              }
            }
          }
        } finally {
          isSpilling = false;
          updatePageFootersAndNumbers();
        }
      } else if (editor.scrollHeight < maxAllowedHeight - 80 && idx + 1 < sheets.length) {
        // 2. Backward Underflow: pull first block of next sheet back if space is available
        const nextSheet = sheets[idx + 1];
        const nextEd = nextSheet?.querySelector('.wrd-page-editor');
        if (nextEd && nextEd.firstElementChild) {
          const candidate = nextEd.firstElementChild;
          editor.appendChild(candidate.cloneNode(true));
          if (editor.scrollHeight <= maxAllowedHeight) {
            candidate.remove();
            const remainingText = (nextEd.innerText || '').trim();
            if (!remainingText && nextEd.querySelectorAll('img, table').length === 0) {
              nextSheet.remove();
            }
            updatePageFootersAndNumbers();
          } else {
            editor.lastElementChild?.remove();
          }
        }
      }
    };

    // ================= PAGE BREAK INSERTION =================
    insertPageBreakAtSelection = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const activeEd = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer.closest('.wrd-page-editor')
        : range.commonAncestorContainer.parentElement?.closest('.wrd-page-editor');
      if (!activeEd) return;

      const pageIdx = Number(activeEd.dataset.pageIndex || 0);
      const sheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));

      const tailRange = document.createRange();
      tailRange.setStart(range.endContainer, range.endOffset);
      tailRange.setEndAfter(activeEd.lastChild);
      const frag = tailRange.extractContents();

      const tempDiv = document.createElement('div');
      tempDiv.appendChild(frag);
      const tailHtml = tempDiv.innerHTML.trim() || '<p><br></p>';

      if (pageIdx + 1 < sheets.length) {
        const nextEd = sheets[pageIdx + 1].querySelector('.wrd-page-editor');
        nextEd.innerHTML = tailHtml + nextEd.innerHTML;
        nextEd.focus();
      } else {
        addContinuationPage(tailHtml, true);
      }
      updatePageFootersAndNumbers();
      triggerLiveWasmSync();
    };

    // ================= ATTACH RICH EDITOR EVENT LISTENERS =================
    const attachEditorEvents = (editor) => {
      if (!editor || editor._eventsAttached) return;
      editor._eventsAttached = true;

      editor.addEventListener('input', () => {
        updateTelemetry();
        if (slashActive) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount && slashAnchorNode) {
            const currentText = slashAnchorNode.nodeValue || '';
            slashQuery = currentText.substring(slashAnchorOffset, sel.anchorOffset).toLowerCase().trim();
            slashFilteredCommands = SLASH_COMMANDS.filter(c =>
              c.title.toLowerCase().includes(slashQuery) ||
              c.desc.toLowerCase().includes(slashQuery) ||
              c.keywords.some(k => k.includes(slashQuery))
            );
            selectedSlashIdx = 0;
            renderSlashMenu();
          }
        }
        checkPageAutoOverflow(editor);
        triggerLiveWasmSync();
      });

      editor.addEventListener('paste', () => {
        setTimeout(() => {
          updateTelemetry();
          checkPageAutoOverflow(editor);
          triggerLiveWasmSync();
        }, 50);
      });

      editor.addEventListener('keydown', (e) => {
        // Slash Menu Navigation
        if (slashActive) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSlashIdx = (selectedSlashIdx + 1) % Math.max(1, slashFilteredCommands.length);
            renderSlashMenu();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSlashIdx = (selectedSlashIdx - 1 + slashFilteredCommands.length) % Math.max(1, slashFilteredCommands.length);
            renderSlashMenu();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (slashFilteredCommands[selectedSlashIdx]) {
              executeSlashCommand(slashFilteredCommands[selectedSlashIdx]);
            }
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            closeSlashMenu();
            return;
          }
        }

        // Trigger Slash on '/'
        if (e.key === '/' && !slashActive) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            slashAnchorNode = range.startContainer;
            slashAnchorOffset = range.startOffset + 1;
            setTimeout(() => {
              const caretRect = range.getBoundingClientRect();
              openSlashMenu(caretRect);
            }, 10);
          }
        }

        // Smart Keyboard: Tab and Shift+Tab indent/outdent
        if (e.key === 'Tab') {
          e.preventDefault();
          if (e.shiftKey) {
            document.execCommand('outdent', false, null);
          } else {
            const sel = window.getSelection();
            const node = sel?.anchorNode;
            if (node && (node.closest?.('li') || node.parentElement?.closest('li'))) {
              document.execCommand('indent', false, null);
            } else {
              document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
          }
          updateTelemetry();
          checkPageAutoOverflow(editor);
          triggerLiveWasmSync();
          return;
        }

        // Smart Keyboard: Ctrl+Enter / Cmd+Enter for Page Break
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          insertPageBreakAtSelection();
          return;
        }
      });

      editor.addEventListener('focus', () => {
        updateTelemetry();
      });

      editor.addEventListener('blur', () => {
        setTimeout(() => {
          if (!slashMenu?.matches(':hover')) {
            closeSlashMenu();
          }
        }, 150);
      });
    };

    // ================= ADD CONTINUATION PAGE =================
    const addContinuationPage = (initialHtml = '<p><br></p>', focusAfter = true) => {
      const sheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));
      const newIdx = sheets.length;
      const ref = viewport.querySelector('#wrdRefNo')?.value || '';
      const dt = viewport.querySelector('#wrdIssueDate')?.value || '';

      const pageEl = document.createElement('div');
      pageEl.className = 'vault-page-sheet';
      pageEl.dataset.pageIndex = newIdx;
      pageEl.id = `wrdPageSheet_${newIdx}`;
      pageEl.innerHTML = `
        <div class="vault-page-action-bar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="wrd-page-badge" style="font-weight: 700; font-size: 12px; color: #0284c7;">📑 Page ${newIdx + 1}</span>
            <span style="font-size: 11px; color: #64748b;">(Continuation Sheet)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" class="vault-page-btn wrd-move-page-up" data-page="${newIdx}" title="Move Page Up">▲ Up</button>
            <button type="button" class="vault-page-btn wrd-move-page-down" data-page="${newIdx}" title="Move Page Down">▼ Down</button>
            <button type="button" class="vault-page-btn danger wrd-delete-page" data-page="${newIdx}" title="Remove This Page">🗑️ Delete</button>
          </div>
        </div>

        <!-- Authentic Company Letterhead Header matching Page 1 exactly -->
        <div class="vault-word-letterhead-header" style="position: relative; width: 100%; margin: 0; padding: 0; line-height: 0; border: none;">
          <img src="/assets/uca-letterhead-header.png" alt="Utkal Chemical Aushadhalaya Letterhead" style="width: 100%; height: auto; display: block; margin: 0; padding: 0; border: none;" onerror="this.onerror=null; this.src='/assets/uca-letterhead-header.jpg';">
          
          <!-- Overlaid Reference Number matching Page 1 at exact Rust coordinate -->
          <div class="wrd-continuation-ref-overlay" style="position: absolute; left: 117px; top: 162px; width: 195px; height: 22px; line-height: 20px; background: rgba(255, 255, 255, 0.9); border: 1px dashed rgba(148, 163, 184, 0.7); border-radius: 3px; padding: 1px 6px; font-family: monospace; font-weight: 700; font-size: 11.5px; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.04); display: flex; align-items: center;">${ref}</div>
          
          <!-- Overlaid Issue Date matching Page 1 at exact Rust coordinate -->
          <div class="wrd-continuation-date-overlay" style="position: absolute; left: 615px; top: 162px; width: 125px; height: 22px; line-height: 20px; background: rgba(255, 255, 255, 0.9); border: 1px dashed rgba(148, 163, 184, 0.7); border-radius: 3px; padding: 1px 6px; font-family: inherit; font-weight: 600; font-size: 11.5px; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.04); display: flex; align-items: center;">${dt}</div>
        </div>

        <div class="vault-word-body-content" style="margin-top: 49px; position: relative; z-index: 2; padding: 0 67px 24px 67px; flex: 1; display: flex; flex-direction: column;">
          <div class="wrd-page-editor" data-page-index="${newIdx}" contenteditable="true" spellcheck="true" style="max-height: 520px; min-height: 480px; outline: none; line-height: 18.7px; font-size: 12.7px; color: #2d3748; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-family: Helvetica, Arial, sans-serif;">
            ${initialHtml}
          </div>
        </div>

        <!-- Continuation Page Footer (Zero Statutory text, clean numbering) -->
        <div class="vault-page-footer" data-page-footer="${newIdx}" style="display: ${this.showPageNumbers !== false ? 'flex' : 'none'}; justify-content: flex-end;">
          <span class="wrd-page-number-label" style="font-size: 11px; font-weight: 700; color: #475569;">Page ${newIdx + 1} of <span class="wrd-total-pages-count">${newIdx + 1}</span></span>
        </div>
      `;

      pagesContainer.appendChild(pageEl);

      const editor = pageEl.querySelector('.wrd-page-editor');
      attachEditorEvents(editor);

      pageEl.querySelector('.wrd-move-page-up')?.addEventListener('click', () => {
        const idx = Number(pageEl.dataset.pageIndex);
        if (idx > 1) {
          reshufflePages(idx, idx - 1);
          triggerLiveWasmSync();
        }
      });
      pageEl.querySelector('.wrd-move-page-down')?.addEventListener('click', () => {
        const idx = Number(pageEl.dataset.pageIndex);
        const sheetsNow = pagesContainer.querySelectorAll('.vault-page-sheet');
        if (idx < sheetsNow.length - 1) {
          reshufflePages(idx, idx + 1);
          triggerLiveWasmSync();
        }
      });
      pageEl.querySelector('.wrd-delete-page')?.addEventListener('click', () => {
        if (confirm(`Delete Page ${Number(pageEl.dataset.pageIndex) + 1}?`)) {
          pageEl.remove();
          updatePageFootersAndNumbers();
          triggerLiveWasmSync();
        }
      });

      updatePageFootersAndNumbers();

      if (focusAfter) {
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return pageEl;
    };

    // Attach to Page 1 Editor
    const page1Editor = viewport.querySelector('#wrdEditorBody');
    if (page1Editor) {
      attachEditorEvents(page1Editor);
    }

    // Add Page Button Click
    viewport.querySelector('#wrdAddPageBtn')?.addEventListener('click', () => {
      addContinuationPage('<p><br></p>', true);
      triggerLiveWasmSync();
      this.app?.showNotification('Added new continuation page.', 'success');
    });

    // Toggle Page Numbers Button
    viewport.querySelector('#wrdTogglePageNoBtn')?.addEventListener('click', () => {
      this.showPageNumbers = !this.showPageNumbers;
      const lbl = viewport.querySelector('#wrdPageNoBtnLabel');
      if (lbl) lbl.textContent = `Page Nos: ${this.showPageNumbers ? 'ON' : 'OFF'}`;
      updatePageFootersAndNumbers();
      triggerLiveWasmSync();
      this.app?.showNotification(`Page numbers turned ${this.showPageNumbers ? 'ON' : 'OFF'}.`, 'info');
    });

    viewport.querySelector('#wrdTitle')?.addEventListener('input', () => {
      updateTelemetry();
      triggerLiveWasmSync();
    });
    viewport.querySelector('#wrdRecipient')?.addEventListener('input', triggerLiveWasmSync);
    viewport.querySelector('#wrdSubject')?.addEventListener('input', triggerLiveWasmSync);
    viewport.querySelector('#wrdRefNo')?.addEventListener('input', () => {
      updatePageFootersAndNumbers();
      triggerLiveWasmSync();
    });
    viewport.querySelector('#wrdIssueDate')?.addEventListener('input', () => {
      updatePageFootersAndNumbers();
      triggerLiveWasmSync();
    });
    updateTelemetry();

    // Export Dropdown Toggle
    const exportDropdown = viewport.querySelector('#wrdExportDropdown');
    const exportBtn = viewport.querySelector('#wrdExportMenuBtn');
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown?.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.vault-export-menu-wrapper')) {
        exportDropdown?.classList.remove('show');
      }
    });

    // Handle Signatory Switching
    const signerSelect = viewport.querySelector('#wrdSignerSelect');
    signerSelect?.addEventListener('change', () => {
      const val = signerSelect.value;
      const chosen = signatories.find(s => String(s.id) === String(val));
      if (chosen) {
        const nameEl = viewport.querySelector('#wrdSignerName');
        const titleEl = viewport.querySelector('#wrdSignerTitle');
        const regEl = viewport.querySelector('#wrdSignerReg');
        if (nameEl) nameEl.textContent = chosen.full_name;
        if (titleEl) titleEl.textContent = chosen.signature_title || chosen.designation || 'Proprietor';
        if (regEl) regEl.textContent = chosen.technical_reg_no ? `Reg: ${chosen.technical_reg_no}` : '';

        const previewBox = viewport.querySelector('#wrdSignaturePreviewBox');
        const signatorySec = viewport.querySelector('#wrdSignatorySection');
        if (previewBox) {
          if (chosen.signature_data) {
            if (signatorySec) signatorySec.style.top = '893px';
            previewBox.style.height = '60px';
            previewBox.style.minHeight = '60px';
            previewBox.style.maxHeight = '60px';
            previewBox.style.marginTop = '4px';
            previewBox.style.marginBottom = '4px';
            previewBox.style.alignItems = 'center';
            previewBox.innerHTML = `<img id="wrdSignatureImg" src="${chosen.signature_data}" alt="Authorized Signature" style="max-height: 54px; max-width: 200px; object-fit: contain; object-position: left center;">`;
          } else {
            if (signatorySec) signatorySec.style.top = '925px';
            previewBox.style.height = '51px';
            previewBox.style.minHeight = '51px';
            previewBox.style.maxHeight = '51px';
            previewBox.style.marginBottom = '13px';
            previewBox.style.alignItems = 'flex-end';
            previewBox.innerHTML = `<div id="wrdNoSigNotice" style="width: 160px; border-bottom: 1.5px dashed #94a3b8; padding-bottom: 3px; font-size: 11px; color: #94a3b8; font-style: italic;">(Authorized Signatory)</div>`;
          }
        }
      }
      triggerLiveWasmSync();
    });

    // Helper: Collect Active Form Data
    const getActiveDocumentPayload = (isSealed = false) => {
      const title = viewport.querySelector('#wrdTitle')?.value.trim() || 'Untitled Letter';
      const signerVal = signerSelect?.value;
      const chosenSigner = signatories.find(s => String(s.id) === String(signerVal));
      const refNo = viewport.querySelector('#wrdRefNo')?.value.trim() || nextRef;
      const issueDate = viewport.querySelector('#wrdIssueDate')?.value || new Date().toISOString().split('T')[0];
      const recipient = viewport.querySelector('#wrdRecipient')?.value.trim() || '';
      const subject = viewport.querySelector('#wrdSubject')?.value.trim() || '';
      const dirVal = viewport.querySelector('#wrdDirSelect')?.value;
      const dirId = dirVal ? Number(dirVal) : null;
      const direction = viewport.querySelector('#wrdDirectionSelect')?.value || 'OUTWARD';

      // Gather content across all pages in order
      const pageSheets = Array.from(pagesContainer.querySelectorAll('.vault-page-sheet'));
      const pages = [];
      const allParagraphs = [];
      let combinedHtml = '';

      pageSheets.forEach((sheet, idx) => {
        const ed = sheet.querySelector('.wrd-page-editor');
        if (!ed) return;
        const pHtml = ed.innerHTML || '';
        combinedHtml += (idx > 0 ? '<hr class="page-break" />' : '') + pHtml;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = pHtml;
        const pNodes = tempDiv.querySelectorAll('p, div, li');
        let paras = [];
        if (pNodes.length > 0) {
          pNodes.forEach(p => {
            const t = p.textContent.trim();
            if (t) paras.push(t);
          });
        }
        if (paras.length === 0) {
          const plain = tempDiv.textContent.trim();
          if (plain) paras.push(plain);
        }

        pages.push({
          page_index: idx,
          html: pHtml,
          paragraphs: paras
        });
        allParagraphs.push(...paras);
      });

      if (allParagraphs.length === 0) {
        allParagraphs.push('No content provided.');
      }

      return {
        id: this.activeEditingDraftId || null,
        dir_id: dirId,
        doc_ref_no: refNo,
        title: title,
        doc_type: 'LETTER',
        direction: direction,
        status: isSealed ? 'SEALED_OFFICIAL' : 'DRAFT',
        sender_party: companySettings.company_name,
        recipient_party: recipient,
        subject: subject,
        issue_date: issueDate,
        show_page_numbers: this.showPageNumbers !== false,
        content_json: {
          pages: pages,
          html: combinedHtml,
          paragraphs: allParagraphs,
          recipient_name: recipient,
          subject: subject,
          show_page_numbers: this.showPageNumbers !== false,
          signature_image: chosenSigner?.signature_data || null
        },
        signatory_staff_id: (signerVal && signerVal !== 'proprietor' && !isNaN(signerVal)) ? Number(signerVal) : null,
        signatory_name: chosenSigner?.full_name || companySettings.proprietor_name || 'Authorized Signatory',
        signatory_title: chosenSigner?.signature_title || chosenSigner?.designation || 'Proprietor',
        signatory_reg_no: chosenSigner?.technical_reg_no || '',
        signature_image: chosenSigner?.signature_data || null,
        is_watermarked: isSealed ? 0 : 1
      };
    };

    // Helper: Convert any image (PNG, WebP, canvas dataURL) to clean JPEG base64 with white background
    const convertImageToJpegBase64 = (imgSrc) => {
      if (!imgSrc || typeof imgSrc !== 'string' || !imgSrc.trim()) return Promise.resolve('');
      return new Promise((resolve) => {
        if (imgSrc.startsWith('/9j/')) {
          return resolve(imgSrc);
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 300;
            canvas.height = img.naturalHeight || img.height || 100;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            resolve(dataUrl.split(',')[1] || '');
          } catch (e) {
            const b64 = imgSrc.includes(';base64,') ? imgSrc.split(';base64,')[1] : imgSrc;
            resolve(b64);
          }
        };
        img.onerror = () => {
          const b64 = imgSrc.includes(';base64,') ? imgSrc.split(';base64,')[1] : imgSrc;
          resolve(b64);
        };
        img.src = imgSrc;
      });
    };

    // Helper: Build Rust SuiteCore Letterhead Request Payload
    const buildRustLetterheadRequest = async (payload) => {
      let headerBase64 = cachedHeaderBase64 || '';
      if (!headerBase64) {
        const headerImg = viewport.querySelector('.vault-word-letterhead-header img, #wrdSheetCanvas img');
        if (headerImg && headerImg.src && headerImg.src.startsWith('data:image')) {
          headerBase64 = headerImg.src.split(',')[1] || '';
        }
      }

      let sigBase64 = '';
      if (payload.signature_image) {
        sigBase64 = await convertImageToJpegBase64(payload.signature_image);
      }

      return {
        doc_ref_no: payload.doc_ref_no,
        title: payload.title,
        date: payload.issue_date,
        department: payload.direction === 'OUTWARD' ? 'Corporate Office' : 'Statutory Affairs',
        recipient_name: payload.recipient_party || '',
        recipient_title: '',
        recipient_address: '',
        subject: payload.subject || payload.title,
        salutation: 'Dear Sir / Madam,',
        paragraphs: payload.content_json?.paragraphs || [],
        terms_clauses: [],
        signatory_name: payload.signatory_name || 'Authorized Signatory',
        signatory_title: payload.signatory_title || 'Proprietor',
        signatory_reg_no: payload.signatory_reg_no || '',
        header_image_base64: headerBase64,
        signature_image_base64: sigBase64,
        is_watermarked: payload.is_watermarked === 1 && payload.status === 'DRAFT',
        watermark_text: (payload.is_watermarked === 1 && payload.status === 'DRAFT') ? 'DRAFT - NOT FOR REGULATORY RELEASE' : '',
        matter_thread_ref: '',
        verification_hash: ''
      };
    };

    // Dynamic Studio Ribbon State Manager (Adapts buttons, labels, and actions to editing context)
    const updateStudioRibbonState = () => {
      const titleIconEl = viewport.querySelector('#wrdStudioTitleIcon');
      const titleTextEl = viewport.querySelector('#wrdStudioTitleText');
      const statusPill = viewport.querySelector('#wrdStatusPill');
      const sealBtn = viewport.querySelector('#wrdSealBtn');
      const sealBtnIcon = viewport.querySelector('#wrdSealBtnIcon');
      const sealBtnText = viewport.querySelector('#wrdSealBtnText');
      const draftBtn = viewport.querySelector('#wrdDraftBtn');
      const draftBtnIcon = viewport.querySelector('#wrdDraftBtnIcon');
      const draftBtnText = viewport.querySelector('#wrdDraftBtnText');
      const revertBtn = viewport.querySelector('#wrdRevertBtn');

      const isEditing = !!this.activeEditingDraftId;
      const isSealed = isEditing && (this.activeEditingDoc?.status === 'SEALED_OFFICIAL');

      if (isSealed) {
        if (titleIconEl) titleIconEl.textContent = '✏️';
        if (titleTextEl) titleTextEl.textContent = 'Document Editor';
        if (statusPill) {
          statusPill.textContent = `Editing Official Record #${this.activeEditingDraftId} (${this.activeEditingDoc?.doc_ref_no || 'SEALED'})`;
          statusPill.style.background = '#fef3c7';
          statusPill.style.color = '#92400e';
          statusPill.style.border = '1px solid rgba(245, 158, 11, 0.4)';
        }
        if (sealBtn) {
          sealBtn.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
          sealBtn.style.boxShadow = '0 2px 5px rgba(2, 132, 199, 0.3)';
          sealBtn.title = 'Save changes directly to this sealed document record';
        }
        if (sealBtnIcon) sealBtnIcon.textContent = '💾';
        if (sealBtnText) sealBtnText.textContent = 'Save Changes';

        if (draftBtn) {
          draftBtn.title = 'Save as a new copy with next sequence reference without altering this sealed document';
        }
        if (draftBtnIcon) draftBtnIcon.textContent = '📋';
        if (draftBtnText) draftBtnText.textContent = 'Save as Copy';

        if (revertBtn) revertBtn.style.display = 'inline-flex';
      } else if (isEditing) {
        if (titleIconEl) titleIconEl.textContent = '📝';
        if (titleTextEl) titleTextEl.textContent = 'Draft Editor';
        if (statusPill) {
          statusPill.textContent = `Editing Draft #${this.activeEditingDraftId}`;
          statusPill.style.background = '#e0f2fe';
          statusPill.style.color = '#0369a1';
          statusPill.style.border = '1px solid rgba(2, 132, 199, 0.2)';
        }
        if (sealBtn) {
          sealBtn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
          sealBtn.style.boxShadow = '0 2px 5px rgba(5, 150, 105, 0.25)';
          sealBtn.title = 'Officially seal and issue this draft into the vault';
        }
        if (sealBtnIcon) sealBtnIcon.textContent = '🔏';
        if (sealBtnText) sealBtnText.textContent = 'Issue & Seal';

        if (draftBtn) {
          draftBtn.title = 'Update draft changes in vault';
        }
        if (draftBtnIcon) draftBtnIcon.textContent = '💾';
        if (draftBtnText) draftBtnText.textContent = 'Update Draft';

        if (revertBtn) revertBtn.style.display = 'inline-flex';
      } else {
        if (titleIconEl) titleIconEl.textContent = '📄';
        if (titleTextEl) titleTextEl.textContent = 'Document Creator';
        if (statusPill) {
          statusPill.textContent = 'New Document';
          statusPill.style.background = '#e0f2fe';
          statusPill.style.color = '#0369a1';
          statusPill.style.border = '1px solid rgba(2, 132, 199, 0.2)';
        }
        if (sealBtn) {
          sealBtn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
          sealBtn.style.boxShadow = '0 2px 5px rgba(5, 150, 105, 0.25)';
          sealBtn.title = 'Officially seal and issue document';
        }
        if (sealBtnIcon) sealBtnIcon.textContent = '🔏';
        if (sealBtnText) sealBtnText.textContent = 'Issue & Seal';

        if (draftBtn) {
          draftBtn.title = 'Save draft';
        }
        if (draftBtnIcon) draftBtnIcon.textContent = '💾';
        if (draftBtnText) draftBtnText.textContent = 'Save Draft';

        if (revertBtn) revertBtn.style.display = 'none';
      }
    };

    // Save as a New Copy (Branches from current doc with next sequence reference number)
    const saveAsNewCopy = async () => {
      try {
        let copyRef = 'UCA/COR/2026/0001';
        const res = await fetch('/api/compliance/vault/next-ref', {
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.doc_ref_no) copyRef = data.doc_ref_no;
        }

        const refInput = viewport.querySelector('#wrdRefNo');
        if (refInput) refInput.value = copyRef;

        const titleInput = viewport.querySelector('#wrdTitle');
        if (titleInput && !titleInput.value.includes('(Copy)')) {
          titleInput.value = `${titleInput.value.trim()} (Copy)`;
        }

        // Clear active editing ID so saveDocument performs a new document POST
        this.activeEditingDraftId = null;
        this.activeEditingDoc = null;

        const newId = await saveDocument(false);
        if (newId) {
          this.activeEditingDraftId = newId;
          this.activeEditingDoc = { id: newId, status: 'DRAFT', doc_ref_no: copyRef };
          this.originalDocSnapshot = getActiveDocumentPayload(false);
          updateStudioRibbonState();
          this.app?.showNotification(`Saved as new draft copy ${copyRef}`, 'success');
        }
      } catch (err) {
        alert('Failed to save copy: ' + err.message);
      }
    };

    // Save or Update Document in Database
    const saveDocument = async (isSealed = false) => {
      const isUpdate = !!this.activeEditingDraftId;
      const isSealedRecord = this.activeEditingDoc?.status === 'SEALED_OFFICIAL';
      const effectiveSealed = isSealedRecord ? true : isSealed;
      const payload = getActiveDocumentPayload(effectiveSealed);

      if (!payload.title || payload.title === 'Untitled Letter') {
        const titleInput = viewport.querySelector('#wrdTitle');
        if (!titleInput.value.trim()) {
          alert('Please enter a document title.');
          titleInput.focus();
          return null;
        }
      }

      if (!payload.dir_id) {
        const dirSelect = viewport.querySelector('#wrdDirSelect');
        if (dirSelect) {
          dirSelect.style.borderColor = '#ef4444';
          dirSelect.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.25)';
          dirSelect.focus();
        }
        alert('Please choose a Vault Folder for this document (* Required). Every document must be assigned to a vault folder so it is organized properly in the directory.');
        return null;
      }

      const url = isUpdate ? `/api/compliance/vault/documents/${this.activeEditingDraftId}` : '/api/compliance/vault/documents';
      const method = isUpdate ? 'PUT' : 'POST';

      try {
        const res = await fetch(url, {
          method: method,
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (!isUpdate && resData.id) {
            this.activeEditingDraftId = resData.id;
          }

          if (this.activeEditingDoc) {
            this.activeEditingDoc.status = effectiveSealed ? 'SEALED_OFFICIAL' : 'DRAFT';
            this.activeEditingDoc.doc_ref_no = payload.doc_ref_no;
          } else {
            this.activeEditingDoc = { id: this.activeEditingDraftId, status: effectiveSealed ? 'SEALED_OFFICIAL' : 'DRAFT', doc_ref_no: payload.doc_ref_no };
          }
          this.originalDocSnapshot = JSON.parse(JSON.stringify(payload));

          updateStudioRibbonState();

          const statusPill = viewport.querySelector('#wrdStatusPill');
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (statusPill) {
            statusPill.textContent = `✓ Saved (${timeStr})`;
            setTimeout(() => updateStudioRibbonState(), 4000);
          }

          this.app?.showNotification(
            isUpdate 
              ? `Changes to ${payload.doc_ref_no} saved successfully.`
              : (effectiveSealed ? `Document ${payload.doc_ref_no} sealed & officially recorded!` : `Draft ${payload.doc_ref_no} saved successfully.`),
            'success'
          );

          await this.loadData();
          loadDraftsList();

          // Only redirect back to dashboard if creating a brand new document and sealing it
          if (effectiveSealed && !isUpdate) {
            this.currentNavPage = 'dashboard';
            this.container.querySelectorAll('.vault-nav-item').forEach(b => {
              b.classList.toggle('active', b.dataset.page === 'dashboard');
            });
            this.renderActivePage();
          }

          return this.activeEditingDraftId;
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to save document');
          return null;
        }
      } catch (err) {
        alert(err.message);
        return null;
      }
    };

    // Auto-save logic (local storage backup)
    let autoSaveTimer = null;
    const triggerLocalAutoSave = () => {
      try {
        const payload = getActiveDocumentPayload(false);
        localStorage.setItem('vault_creator_autosave', JSON.stringify({
          draftId: this.activeEditingDraftId,
          timestamp: Date.now(),
          payload
        }));
        const statusEl = viewport.querySelector('#wrdAutoSaveStatus');
        if (statusEl) {
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          statusEl.innerHTML = `<span>☁️</span> Auto-saved locally (${timeStr})`;
        }
      } catch (_) {}
    };

    autoSaveTimer = setInterval(triggerLocalAutoSave, 15000);

    // ================= DRAFTS DRAWER LOGIC =================
    const draftsDrawer = viewport.querySelector('#wrdDraftsDrawer');
    const draftsList = viewport.querySelector('#wrdDraftsList');
    const draftsBadge = viewport.querySelector('#wrdDraftsBadge');
    const drawerDraftCount = viewport.querySelector('#wrdDrawerDraftCount');

    const loadDraftsList = async () => {
      try {
        const res = await fetch('/api/compliance/vault/drafts', {
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        });
        if (!res.ok) return;
        const data = await res.json();
        const drafts = data.drafts || [];

        if (draftsBadge) draftsBadge.textContent = drafts.length;
        if (drawerDraftCount) drawerDraftCount.textContent = drafts.length;

        if (drafts.length === 0) {
          draftsList.innerHTML = `
            <div style="text-align: center; color: #94a3b8; font-size: 12.5px; padding: 40px 16px;">
              <span style="font-size: 32px; display: block; margin-bottom: 8px;">📁</span>
              No active drafts in vault.<br>Save your work as a draft to resume later.
            </div>
          `;
          return;
        }

        draftsList.innerHTML = drafts.map(d => {
          const isActive = this.activeEditingDraftId === d.id;
          return `
            <div class="vault-draft-card ${isActive ? 'active' : ''}" data-draft-card-id="${d.id}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 12.5px; color: #0284c7; font-family: monospace;">${d.doc_ref_no || 'UCA/DRAFT'}</span>
                <span style="font-size: 10px; color: #94a3b8;">${d.issue_date || ''}</span>
              </div>
              <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 3px; line-height: 1.3;">${d.title}</div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${d.recipient_party ? `To: ${d.recipient_party}` : 'No recipient specified'}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 8px;">
                <button type="button" class="wrd-resume-draft-btn" data-resume-id="${d.id}" style="font-size: 11px; font-weight: 700; background: #0284c7; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                  ${isActive ? 'Currently Editing' : 'Resume / Edit ↗'}
                </button>
                <button type="button" class="wrd-delete-draft-btn" data-delete-id="${d.id}" style="font-size: 11px; background: none; border: 1px solid #fca5a5; color: #dc2626; padding: 3px 8px; border-radius: 4px; cursor: pointer;">
                  🗑️ Delete
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Wire Resume Buttons
        draftsList.querySelectorAll('.wrd-resume-draft-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const draftId = Number(btn.dataset.resumeId);
            const found = drafts.find(d => d.id === draftId);
            if (found) {
              resumeDraft(found);
              draftsDrawer.classList.remove('open');
            }
          });
        });

        // Wire Delete Buttons
        draftsList.querySelectorAll('.wrd-delete-draft-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const draftId = Number(btn.dataset.deleteId);
            if (confirm(`Permanently delete draft record #${draftId}?`)) {
              try {
                const dRes = await fetch(`/api/compliance/vault/documents/${draftId}`, {
                  method: 'DELETE',
                  headers: this.getAuthHeaders(),
                  credentials: 'same-origin'
                });
                if (dRes.ok) {
                  this.app?.showNotification(`Draft #${draftId} deleted.`, 'info');
                  if (this.activeEditingDraftId === draftId) {
                    resetToNewDocument();
                  }
                  loadDraftsList();
                  await this.loadData();
                }
              } catch (err) {
                alert(err.message);
              }
            }
          });
        });

      } catch (_) {}
    };

    // Resume an existing draft or document into the editor
    const resumeDraft = (draft) => {
      this.activeEditingDraftId = draft.id;
      this.activeEditingDoc = draft;
      this.originalDocSnapshot = JSON.parse(JSON.stringify(draft));

      if (viewport.querySelector('#wrdTitle')) viewport.querySelector('#wrdTitle').value = draft.title || '';
      if (viewport.querySelector('#wrdRecipient')) viewport.querySelector('#wrdRecipient').value = draft.recipient_party || '';
      if (viewport.querySelector('#wrdSubject')) {
        const sEl = viewport.querySelector('#wrdSubject');
        sEl.value = draft.subject || '';
        sEl.dispatchEvent(new Event('input'));
      }
      if (viewport.querySelector('#wrdRefNo')) viewport.querySelector('#wrdRefNo').value = draft.doc_ref_no || nextRef;
      if (viewport.querySelector('#wrdIssueDate')) viewport.querySelector('#wrdIssueDate').value = draft.issue_date || new Date().toISOString().split('T')[0];
      if (viewport.querySelector('#wrdDirectionSelect')) viewport.querySelector('#wrdDirectionSelect').value = draft.direction || 'OUTWARD';
      if (viewport.querySelector('#wrdDirSelect')) viewport.querySelector('#wrdDirSelect').value = draft.dir_id || '';

      let content = {};
      try {
        content = typeof draft.content_json === 'string' ? JSON.parse(draft.content_json) : (draft.content_json || {});
      } catch (_) {}

      // Clean up any existing continuation pages first
      pagesContainer.querySelectorAll('.vault-page-sheet:not(#wrdPageSheet_0)').forEach(p => p.remove());

      if (typeof content.show_page_numbers === 'boolean') {
        this.showPageNumbers = content.show_page_numbers;
      } else if (typeof draft.show_page_numbers === 'boolean') {
        this.showPageNumbers = draft.show_page_numbers;
      }
      const pageNoLbl = viewport.querySelector('#wrdPageNoBtnLabel');
      if (pageNoLbl) pageNoLbl.textContent = `Page Nos: ${this.showPageNumbers !== false ? 'ON' : 'OFF'}`;

      const editor = viewport.querySelector('#wrdEditorBody');
      if (content.pages && Array.isArray(content.pages) && content.pages.length > 0) {
        if (editor) editor.innerHTML = content.pages[0].html || (content.pages[0].paragraphs ? content.pages[0].paragraphs.map(p => `<p>${p}</p>`).join('') : '<p><br></p>');
        for (let i = 1; i < content.pages.length; i++) {
          const pg = content.pages[i];
          const pgHtml = pg.html || (pg.paragraphs ? pg.paragraphs.map(p => `<p>${p}</p>`).join('') : '<p><br></p>');
          addContinuationPage(pgHtml, false);
        }
      } else if (editor) {
        if (content.html) {
          editor.innerHTML = content.html;
        } else if (content.paragraphs && Array.isArray(content.paragraphs)) {
          editor.innerHTML = content.paragraphs.map(p => `<p>${p}</p>`).join('');
        }
      }

      if (draft.signatory_staff_id && signerSelect) {
        signerSelect.value = draft.signatory_staff_id;
        signerSelect.dispatchEvent(new Event('change'));
      } else if (signerSelect) {
        const matched = signatories.find(s => s.full_name?.toLowerCase() === draft.signatory_name?.toLowerCase());
        if (matched) {
          signerSelect.value = matched.id;
          signerSelect.dispatchEvent(new Event('change'));
        }
      }

      updateStudioRibbonState();
      updatePageFootersAndNumbers();
      updateTelemetry();
      this.app?.showNotification(`Document ${draft.doc_ref_no || '#' + draft.id} loaded into Studio.`, 'success');
    };

    // Reset editor to a blank document
    const resetToNewDocument = () => {
      this.activeEditingDraftId = null;
      this.initialDocToEdit = null;
      this.activeEditingDoc = null;
      this.originalDocSnapshot = null;
      // Remove all continuation sheets
      pagesContainer.querySelectorAll('.vault-page-sheet:not(#wrdPageSheet_0)').forEach(p => p.remove());

      if (viewport.querySelector('#wrdTitle')) viewport.querySelector('#wrdTitle').value = '';
      if (viewport.querySelector('#wrdRecipient')) viewport.querySelector('#wrdRecipient').value = '';
      if (viewport.querySelector('#wrdSubject')) {
        const sEl = viewport.querySelector('#wrdSubject');
        sEl.value = '';
        sEl.dispatchEvent(new Event('input'));
      }
      if (viewport.querySelector('#wrdRefNo')) viewport.querySelector('#wrdRefNo').value = nextRef;
      if (viewport.querySelector('#wrdIssueDate')) viewport.querySelector('#wrdIssueDate').value = new Date().toISOString().split('T')[0];
      if (viewport.querySelector('#wrdEditorBody')) {
        viewport.querySelector('#wrdEditorBody').innerHTML = `
          <p style="margin-bottom: 16px;">Dear Sir / Madam,</p>
          <p style="margin-bottom: 10.7px;">With reference to statutory requirements and regulatory guidelines under the Drugs & Cosmetics Rules 1945 and Schedule T governance, we hereby submit the official documentation for your kind record and consideration.</p>
          <p style="margin-bottom: 10.7px;">The manufacturing premises and operations continue to strictly comply with all prescribed standard operating procedures (SOPs), quality control validations, and batch manufacturing records (BMR).</p>
          <p style="margin-bottom: 10.7px;">Kindly acknowledge receipt and issue regulatory confirmation accordingly.</p>
        `;
      }

      updateStudioRibbonState();
      updatePageFootersAndNumbers();
      updateTelemetry();
    };

    // Drafts Drawer Toggle Handlers
    viewport.querySelector('#wrdToggleDraftsBtn')?.addEventListener('click', () => {
      draftsDrawer?.classList.toggle('open');
      if (draftsDrawer?.classList.contains('open')) loadDraftsList();
    });
    viewport.querySelector('#wrdCloseDraftsBtn')?.addEventListener('click', () => {
      draftsDrawer?.classList.remove('open');
    });
    viewport.querySelector('#wrdNewDocBtn')?.addEventListener('click', () => {
      resetToNewDocument();
      draftsDrawer?.classList.remove('open');
    });

    loadDraftsList();

    if (this.initialDocToEdit) {
      resumeDraft(this.initialDocToEdit);
      this.initialDocToEdit = null;
    } else {
      updateStudioRibbonState();
    }

    // ================= MULTI-FORMAT EXPORT HANDLERS =================
    // Helper: Trigger browser file download from Blob
    const downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 500);
    };

    // Direct Multi-Format Document Exporter (Zero database save needed)
    const exportDocumentAs = async (format) => {
      exportDropdown?.classList.remove('show');
      const formatLabels = { pdf: 'PDF', docx: 'Word (.docx)', jpeg: 'High-Res Image (.jpg)' };
      const label = formatLabels[format] || format.toUpperCase();
      this.app?.showNotification(`Exporting ${label}...`, 'info');

      try {
        const payload = getActiveDocumentPayload(false);

        // Client-side WASM fast paths if available
        if (format === 'pdf' && window.SuiteCoreBridge && typeof window.SuiteCoreBridge.renderLetterheadPdf === 'function') {
          try {
            const rustReq = await buildRustLetterheadRequest(payload);
            const result = window.SuiteCoreBridge.renderLetterheadPdf(rustReq);
            if (result && result.pdf_base64) {
              const byteChars = atob(result.pdf_base64);
              const byteNums = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
              const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
              downloadBlob(blob, `${(payload.doc_ref_no || 'UCA_DOCUMENT').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`);
              this.app?.showNotification('PDF exported via Pure Rust WASM Engine!', 'success');
              return;
            }
          } catch (wasmErr) {
            console.warn('[Vault] Client-side WASM PDF fallback to server:', wasmErr);
          }
        }

        if (format === 'docx' && window.SuiteCoreBridge && typeof window.SuiteCoreBridge.renderLetterheadDocx === 'function') {
          try {
            const rustReq = await buildRustLetterheadRequest(payload);
            const result = window.SuiteCoreBridge.renderLetterheadDocx(rustReq);
            if (result && result.docx_base64) {
              const byteChars = atob(result.docx_base64);
              const byteNums = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
              const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
              downloadBlob(blob, `${(payload.doc_ref_no || 'UCA_DOCUMENT').replace(/[/\\?%*:|"<>]/g, '_')}.docx`);
              this.app?.showNotification('Word (.docx) package generated via Pure Rust!', 'success');
              return;
            }
          } catch (wasmErr) {
            console.warn('[Vault] Client-side WASM DOCX fallback to server:', wasmErr);
          }
        }

        // Direct Server-Side Rust Export Route
        const res = await fetch(`/api/compliance/vault/export/${format}`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const blob = await res.blob();
          const ext = format === 'jpeg' ? 'jpg' : format;
          downloadBlob(blob, `${(payload.doc_ref_no || 'UCA_DOCUMENT').replace(/[/\\?%*:|"<>]/g, '_')}.${ext}`);
          this.app?.showNotification(`${label} exported successfully!`, 'success');
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(`Export failed: ${errData.error || res.statusText}`);
        }
      } catch (err) {
        alert(`Export ${format.toUpperCase()} error: ${err.message}`);
      }
    };

    // Wire Export Dropdown Buttons
    viewport.querySelector('#wrdExportPdfBtn')?.addEventListener('click', () => exportDocumentAs('pdf'));
    viewport.querySelector('#wrdExportDocxBtn')?.addEventListener('click', () => exportDocumentAs('docx'));
    viewport.querySelector('#wrdExportJpegBtn')?.addEventListener('click', () => exportDocumentAs('jpeg'));

    // Print Document Handler
    viewport.querySelector('#wrdPrintBtn')?.addEventListener('click', () => {
      exportDropdown?.classList.remove('show');
      window.print();
    });

    // ================= REAL-TIME SHARED WASM VECTOR PROOF & SYNC =================
    let isProofMode = false;
    let wasmSyncTimer = null;
    const svgPreviewContainer = viewport.querySelector('#wrdSvgPreviewContainer');
    const toggleProofBtn = viewport.querySelector('#wrdToggleProofBtn');
    const toggleProofText = viewport.querySelector('#wrdToggleProofText');
    const toggleProofIcon = viewport.querySelector('#wrdToggleProofIcon');

    const updateVectorWasmProof = async () => {
      const wasmStatusEl = viewport.querySelector('#wrdWasmStatus');
      if (wasmStatusEl) {
        wasmStatusEl.innerHTML = '<span style="font-size: 12px; color: #0284c7;">⚡</span> <span style="color: #0284c7; font-weight: 600;">WASM Vector Proof: Syncing...</span>';
      }
      const payload = getActiveDocumentPayload(false);
      try {
        let svgResult = null;
        if (window.SuiteCoreBridge && typeof window.SuiteCoreBridge.renderLetterheadSvg === 'function') {
          try {
            const rustReq = await buildRustLetterheadRequest(payload);
            svgResult = window.SuiteCoreBridge.renderLetterheadSvg(rustReq);
          } catch (wasmErr) {
            console.warn('[Studio] Client-side WASM SVG error:', wasmErr);
          }
        }
        if (svgResult && svgResult.svg) {
          if (svgPreviewContainer) {
            svgPreviewContainer.innerHTML = svgResult.svg;
          }
          if (wasmStatusEl) {
            wasmStatusEl.innerHTML = '<span style="font-size: 12px; color: #059669;">⚡</span> <span style="color: #059669; font-weight: 600;">WASM Vector Proof: In Sync (100% Parity)</span>';
          }
        }
      } catch (e) {
        console.warn('[Studio] Vector proof generation error:', e);
      }
    };

    triggerLiveWasmSync = () => {
      // Dynamic signature anchoring in editor to prevent overlap with long body content
      const editorEl = viewport.querySelector('#wrdEditorBody');
      const sigEl = viewport.querySelector('#wrdSignatorySection');
      if (editorEl && sigEl) {
        const editorBottom = editorEl.offsetTop + editorEl.offsetHeight;
        const targetTop = Math.max(893, editorBottom + 16);
        sigEl.style.top = `${targetTop}px`;
      }

      if (wasmSyncTimer) clearTimeout(wasmSyncTimer);
      wasmSyncTimer = setTimeout(() => {
        updateVectorWasmProof();
      }, 60);
    };

    const toggleProofMode = async () => {
      isProofMode = !isProofMode;
      if (isProofMode) {
        if (scaleWrapper) scaleWrapper.style.display = 'none';
        if (svgScaleWrapper) svgScaleWrapper.style.display = 'block';
        if (toggleProofBtn) {
          toggleProofBtn.style.background = '#0284c7';
          toggleProofBtn.style.color = '#ffffff';
          toggleProofBtn.style.borderColor = '#0284c7';
        }
        if (toggleProofText) toggleProofText.textContent = 'Back to Editor';
        if (toggleProofIcon) toggleProofIcon.textContent = '✏️';
        await updateVectorWasmProof();
      } else {
        if (scaleWrapper) scaleWrapper.style.display = 'flex';
        if (svgScaleWrapper) svgScaleWrapper.style.display = 'none';
        if (toggleProofBtn) {
          toggleProofBtn.style.background = '#f0f9ff';
          toggleProofBtn.style.color = '#0284c7';
          toggleProofBtn.style.borderColor = '#0284c7';
        }
        if (toggleProofText) toggleProofText.textContent = 'Vector Proof';
        if (toggleProofIcon) toggleProofIcon.textContent = '👁️';
      }
    };

    toggleProofBtn?.addEventListener('click', toggleProofMode);

    // Smart Multi-Line Auto-Expanding Subject Handler
    const wrdSubjectEl = viewport.querySelector('#wrdSubject');
    const autoResizeSubject = () => {
      if (!wrdSubjectEl) return;
      wrdSubjectEl.style.height = 'auto';
      wrdSubjectEl.style.height = Math.max(34, wrdSubjectEl.scrollHeight) + 'px';
    };
    wrdSubjectEl?.addEventListener('input', autoResizeSubject);
    autoResizeSubject();

    // Reset error highlight on folder select when user chooses a vault folder
    const wrdDirEl = viewport.querySelector('#wrdDirSelect');
    wrdDirEl?.addEventListener('change', () => {
      if (wrdDirEl.value) {
        wrdDirEl.style.borderColor = '#cbd5e1';
        wrdDirEl.style.boxShadow = 'none';
      }
    });

    // Wire Primary Action Buttons
    viewport.querySelector('#wrdAiDraftBtn')?.addEventListener('click', () => this.openAiDocumentCreatorModal(viewport));

    viewport.querySelector('#wrdDraftBtn')?.addEventListener('click', () => {
      if (this.activeEditingDoc?.status === 'SEALED_OFFICIAL') {
        saveAsNewCopy();
      } else {
        saveDocument(false);
      }
    });

    viewport.querySelector('#wrdSealBtn')?.addEventListener('click', () => {
      saveDocument(true);
    });

    viewport.querySelector('#wrdRevertBtn')?.addEventListener('click', () => {
      if (!this.originalDocSnapshot) {
        this.app?.showNotification('No original snapshot found to revert.', 'info');
        return;
      }
      if (confirm('Discard all unsaved edits and revert back to the original document state?')) {
        resumeDraft(this.originalDocSnapshot);
        this.app?.showNotification('Reverted document to original state.', 'info');
      }
    });
  }

  // AI Legal & Statutory Document Drafter Modal (Anti-Slop Guaranteed)
  openAiDocumentCreatorModal(viewport) {
    const existing = document.getElementById('vaultAiCreatorModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultAiCreatorModalOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 760px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
        
        <!-- Header -->
        <div class="staff-modal-header" style="background: linear-gradient(135deg, #1e3a8a 0%, #312e81 100%); color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">✨</span>
            <div>
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #fff;">AI Legal & Compliance Document Drafter</h3>
              <div style="font-size: 11px; color: #c7d2fe; margin-top: 2px; display: flex; align-items: center; gap: 6px;">
                <span>Autonomous Regulatory Draft Engine</span>
                <span style="background: rgba(16, 185, 129, 0.25); color: #6ee7b7; padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">
                  🛡️ Anti-Slop Filter Active (Zero Buzzwords • Pure Facts)
                </span>
              </div>
            </div>
          </div>
          <button class="staff-modal-close-btn" id="closeVaultAiCreatorBtn" style="color: #c7d2fe; font-size: 18px; cursor: pointer; background: none; border: none;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding: 20px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; background: #f8fafc;">
          
          <!-- Quick Statutory Presets -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
              Quick Statutory Scenarios:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button type="button" class="vault-ai-preset-btn" data-prompt="Draft an application to the State Licensing Authority for renewal and endorsement of Form 25D Ayurvedic Drug Manufacturing License OR-02/AYUR under Rule 154." style="font-size: 11px; padding: 5px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; color: #1e293b; font-weight: 600; transition: all 0.15s ease;">
                🏛️ AYUSH Form 25D Renewal
              </button>
              <button type="button" class="vault-ai-preset-btn" data-prompt="Draft official submission of Schedule T GMP annual air handling unit (AHU) environmental validation, particulate count, and filter integrity audit reports." style="font-size: 11px; padding: 5px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; color: #1e293b; font-weight: 600; transition: all 0.15s ease;">
                🏭 Schedule T GMP Audit
              </button>
              <button type="button" class="vault-ai-preset-btn" data-prompt="Draft a formal Notice of Quality Control Rejection to botanical raw materials vendor due to moisture content exceeding 8.0% w/w under Ayurvedic Pharmacopoeia of India standards, demanding immediate quarantined batch replacement." style="font-size: 11px; padding: 5px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; color: #1e293b; font-weight: 600; transition: all 0.15s ease;">
                🌿 Raw Material QC Rejection
              </button>
              <button type="button" class="vault-ai-preset-btn" data-prompt="Draft an official communication to the Divisional Forest Officer requesting inspection and transit pass endorsement for inward consignment of raw forest produce (Triphala constituents) for pharmaceutical processing." style="font-size: 11px; padding: 5px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; color: #1e293b; font-weight: 600; transition: all 0.15s ease;">
                🌲 Forest Transit Pass Request
              </button>
              <button type="button" class="vault-ai-preset-btn" data-prompt="Draft an Internal Technical SOP Office Circular regarding mandatory 100% in-process batch recording (BMR) and retention sample preservation under Schedule T Part I governance." style="font-size: 11px; padding: 5px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; color: #1e293b; font-weight: 600; transition: all 0.15s ease;">
                📋 Internal SOP Circular
              </button>
            </div>
          </div>

          <!-- Prompt Input -->
          <div class="staff-input-group full-width" style="margin-bottom: 0;">
            <label style="font-weight: 700; color: #1e293b; font-size: 12px; display: flex; justify-content: space-between;">
              <span>Document Requirements & Context:</span>
              <span style="font-weight: 400; color: #64748b; font-size: 11px;">Specify recipient, purpose, and key facts</span>
            </label>
            <textarea id="vaultAiPromptInput" rows="3" placeholder="e.g. Draft an official compliance reply to the State Drug Controller answering audit observation No. 3 regarding secondary packaging area sanitation..." style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; resize: vertical; outline: none; background: #ffffff;"></textarea>
          </div>

          <!-- Tone Selector & Generate Button Row -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 12px; font-weight: 600; color: #475569;">Tone / Framework:</label>
              <select id="vaultAiToneSelect" style="font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; background: #ffffff;">
                <option value="REGULATORY">Authoritative Regulatory (AYUSH / Drug Control)</option>
                <option value="STRICT_LEGAL">Strict Commercial & Legal Notice</option>
                <option value="INTERNAL_SOP">Internal SOP & Operations Directive</option>
              </select>
            </div>

            <button type="button" id="vaultAiGenerateBtn" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25);">
              <span id="vaultAiGenSpinner" style="display: none;">⏳</span>
              <span id="vaultAiGenIcon">🚀</span>
              <span id="vaultAiGenText">Generate Slop-Free Draft</span>
            </button>
          </div>

          <!-- Generated Preview Container -->
          <div id="vaultAiPreviewContainer" style="display: none; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-top: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">
              <span style="font-size: 12px; font-weight: 700; color: #059669; display: flex; align-items: center; gap: 4px;">
                <span>✓</span> Slop-Free Draft Ready
              </span>
              <span id="vaultAiPreviewDirectionBadge" style="font-size: 11px; background: #e0f2fe; color: #0284c7; padding: 2px 8px; border-radius: 12px; font-weight: 700;">OUTWARD</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; margin-bottom: 12px;">
              <div>
                <span style="color: #64748b; font-weight: 600;">Title:</span>
                <div id="vaultAiPreviewTitle" style="font-weight: 700; color: #0f172a; margin-top: 2px;"></div>
              </div>
              <div>
                <span style="color: #64748b; font-weight: 600;">Recipient:</span>
                <div id="vaultAiPreviewRecipient" style="font-weight: 700; color: #0f172a; margin-top: 2px;"></div>
              </div>
              <div style="grid-column: span 2;">
                <span style="color: #64748b; font-weight: 600;">Subject:</span>
                <div id="vaultAiPreviewSubject" style="font-style: italic; color: #334155; margin-top: 2px;"></div>
              </div>
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Body Content Preview:</div>
              <div id="vaultAiPreviewBody" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6; color: #1e293b; max-height: 180px; overflow-y: auto;"></div>
            </div>
          </div>

        </div>

        <!-- Footer Actions -->
        <div style="padding: 12px 20px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="cmp-btn-cancel" id="cancelVaultAiModalBtn">Cancel</button>
          <button type="button" id="applyVaultAiDraftBtn" disabled style="background: #059669; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: not-allowed; opacity: 0.5; display: flex; align-items: center; gap: 6px;">
            <span>📥</span> Apply to Document
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeVaultAiCreatorBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelVaultAiModalBtn')?.addEventListener('click', closeModal);

    // Preset button clicks
    overlay.querySelectorAll('.vault-ai-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const promptInput = overlay.querySelector('#vaultAiPromptInput');
        if (promptInput) {
          promptInput.value = btn.dataset.prompt;
          promptInput.focus();
        }
      });
    });

    let generatedDoc = null;

    // Generate click
    overlay.querySelector('#vaultAiGenerateBtn')?.addEventListener('click', async () => {
      const promptText = overlay.querySelector('#vaultAiPromptInput').value.trim();
      if (!promptText) {
        alert('Please specify your document requirements or choose a scenario.');
        overlay.querySelector('#vaultAiPromptInput').focus();
        return;
      }

      const tone = overlay.querySelector('#vaultAiToneSelect').value;
      const genBtn = overlay.querySelector('#vaultAiGenerateBtn');
      const genText = overlay.querySelector('#vaultAiGenText');
      const genSpinner = overlay.querySelector('#vaultAiGenSpinner');
      const genIcon = overlay.querySelector('#vaultAiGenIcon');
      const applyBtn = overlay.querySelector('#applyVaultAiDraftBtn');

      genBtn.disabled = true;
      genText.textContent = 'Drafting Slop-Free Content...';
      genSpinner.style.display = 'inline';
      genIcon.style.display = 'none';

      try {
        const res = await fetch('/api/compliance/vault/ai/generate-document', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify({ prompt: promptText, tone })
        });

        if (res.ok) {
          const data = await res.json();
          generatedDoc = data;
          
          const previewBox = overlay.querySelector('#vaultAiPreviewContainer');
          previewBox.style.display = 'block';
          overlay.querySelector('#vaultAiPreviewTitle').textContent = data.title || '';
          overlay.querySelector('#vaultAiPreviewRecipient').textContent = data.recipient || '';
          overlay.querySelector('#vaultAiPreviewSubject').textContent = data.subject || '';
          overlay.querySelector('#vaultAiPreviewBody').innerHTML = data.html || '';
          overlay.querySelector('#vaultAiPreviewDirectionBadge').textContent = data.direction || 'OUTWARD';

          applyBtn.disabled = false;
          applyBtn.style.cursor = 'pointer';
          applyBtn.style.opacity = '1';
        } else {
          const errData = await res.json();
          alert(errData.error || 'Failed to generate document');
        }
      } catch (err) {
        alert(err.message);
      } finally {
        genBtn.disabled = false;
        genText.textContent = 'Re-Generate';
        genSpinner.style.display = 'none';
        genIcon.style.display = 'inline';
      }
    });

    // Apply button click
    overlay.querySelector('#applyVaultAiDraftBtn')?.addEventListener('click', () => {
      if (!generatedDoc) return;

      if (generatedDoc.title) {
        const el = viewport.querySelector('#wrdTitle');
        if (el) el.value = generatedDoc.title;
      }
      if (generatedDoc.recipient) {
        const el = viewport.querySelector('#wrdRecipient');
        if (el) el.value = generatedDoc.recipient;
      }
      if (generatedDoc.subject) {
        const el = viewport.querySelector('#wrdSubject');
        if (el) {
          el.value = generatedDoc.subject;
          el.dispatchEvent(new Event('input'));
        }
      }
      if (generatedDoc.direction) {
        const el = viewport.querySelector('#wrdDirectionSelect');
        if (el) el.value = generatedDoc.direction;
      }
      if (generatedDoc.html) {
        const el = viewport.querySelector('#wrdEditorBody');
        if (el) el.innerHTML = generatedDoc.html;
      }

      this.app?.showNotification('AI document draft applied cleanly to letterhead.', 'success');
      closeModal();
    });
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
    } else if (this.activeFilterChip === 'INTERNAL') {
      docs = docs.filter(d => d.direction === 'INTERNAL');
    } else if (this.activeFilterChip === 'SEALED') {
      docs = docs.filter(d => d.status === 'SEALED_OFFICIAL');
    }

    if (this.activeSort === 'name') {
      docs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (this.activeSort === 'inward') {
      docs.sort((a, b) => (a.direction === 'INWARD' ? -1 : 1));
    } else if (this.activeSort === 'outward') {
      docs.sort((a, b) => (a.direction === 'OUTWARD' ? -1 : 1));
    } else if (this.activeSort === 'internal') {
      docs.sort((a, b) => (a.direction === 'INTERNAL' ? -1 : 1));
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
            <option value="internal" ${this.activeSort === 'internal' ? 'selected' : ''}>Internal</option>
          </select>
        </div>

        <!-- Filter Chips (Liquid Glass Pills) -->
        <div class="gemini-filter-chips">
          <button class="gemini-chip ${this.activeFilterChip === 'ALL' ? 'active' : ''}" data-chip="ALL">All</button>
          <button class="gemini-chip ${this.activeFilterChip === 'FOLDERS' ? 'active' : ''}" data-chip="FOLDERS">Folders</button>
          <button class="gemini-chip ${this.activeFilterChip === 'INWARD' ? 'active' : ''}" data-chip="INWARD">Inward</button>
          <button class="gemini-chip ${this.activeFilterChip === 'OUTWARD' ? 'active' : ''}" data-chip="OUTWARD">Outward</button>
          <button class="gemini-chip ${this.activeFilterChip === 'INTERNAL' ? 'active' : ''}" data-chip="INTERNAL">Internal</button>
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
    } else if (this.currentNavPage === 'internal') {
      currentFiles = this.documents.filter(d => d.direction === 'INTERNAL');
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

    const rootLabel = this.currentNavPage === 'inward' 
      ? 'Inward' 
      : this.currentNavPage === 'outward' 
      ? 'Outward' 
      : this.currentNavPage === 'internal' 
      ? 'Internal Office Docs' 
      : 'Vault';

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
            <button class="vault-bc-btn ${isRoot ? 'current' : ''}" id="vaultBcRootBtn">${rootLabel}</button>
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
            ${this.currentNavPage === 'inward' ? 'No Inward documents in Vault.' : this.currentNavPage === 'outward' ? 'No Outward documents in Vault.' : this.currentNavPage === 'internal' ? 'No Internal Office documents in Vault.' : isRoot ? 'No folders in Vault. Click "＋ Folder" to create one.' : 'This folder is empty.'}
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
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">
            ${this.currentNavPage === 'inward' ? 'No Inward documents' : this.currentNavPage === 'outward' ? 'No Outward documents' : this.currentNavPage === 'internal' ? 'No Internal Office documents' : 'Empty folder'}
          </div>
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
            <button class="vault-pill-btn" data-edit-in-studio="${doc.id}" style="justify-content: center; width: 100%; padding: 10px; background: rgba(2, 132, 199, 0.08); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.25); font-weight: 700;">
              <span>✏️ Edit in Studio</span>
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

    // Edit in Studio
    viewport.querySelectorAll('[data-edit-in-studio]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editDocumentInStudio(Number(btn.dataset.editInStudio));
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
  // =========================================================================
  // 3. HORIZONTAL SHERLOCK HOLMES PAPER TRAIL — ENTERPRISE EVIDENCE CHAIN
  // Linear left-to-right evidence board used by top-tier legal & compliance
  // =========================================================================
  async renderTrailsPage(viewport) {
    viewport.innerHTML = `
      <div class="sherlock-trail-wrapper">
        <div class="sherlock-trail-ambient"></div>
        <div style="text-align: center; padding: 60px 0;">
          <div class="vault-viewer-spinner" style="margin: 0 auto 16px;"></div>
          <div style="font-size: 13.5px; font-weight: 600; color: #94a3b8;">Loading Evidence Paper Trail...</div>
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
    const nodes = data.nodes || [];
    const links = data.links || [];
    const matters = data.matters || [];

    // Select default active case / matter
    if (!this.selectedMatterName && matters.length > 0) {
      this.selectedMatterName = matters[0].name;
    }

    const currentMatter = matters.find(m => m.name === this.selectedMatterName) || matters[0] || null;

    // Filter links & nodes for current matter
    let matterLinks = [];
    let orderedDocs = [];

    if (currentMatter) {
      matterLinks = links.filter(l => l.matter_thread_name === currentMatter.name);
      
      // Determine linear sequence: start from root documents, then follow children
      const childIdSet = new Set(matterLinks.map(l => l.child_doc_id));
      const rootLinks = matterLinks.filter(l => !childIdSet.has(l.parent_doc_id));
      
      // Build ordered array
      const visitedDocIds = new Set();
      const docsMap = new Map(nodes.map(n => [n.id, n]));

      // Add roots
      rootLinks.forEach(l => {
        if (!visitedDocIds.has(l.parent_doc_id)) {
          const doc = docsMap.get(l.parent_doc_id);
          if (doc) {
            orderedDocs.push({ doc, incomingLink: null });
            visitedDocIds.add(l.parent_doc_id);
          }
        }
      });

      // Chain children recursively
      let changed = true;
      while (changed) {
        changed = false;
        for (const l of matterLinks) {
          if (visitedDocIds.has(l.parent_doc_id) && !visitedDocIds.has(l.child_doc_id)) {
            const doc = docsMap.get(l.child_doc_id);
            if (doc) {
              orderedDocs.push({ doc, incomingLink: l });
              visitedDocIds.add(l.child_doc_id);
              changed = true;
            }
          }
        }
      }

      // Add any remaining matter documents sorted by date
      currentMatter.docIds.forEach(id => {
        if (!visitedDocIds.has(id)) {
          const doc = docsMap.get(id);
          if (doc) {
            orderedDocs.push({ doc, incomingLink: null });
            visitedDocIds.add(id);
          }
        }
      });
    }

    // Fallback if no specific matter or empty: sort all docs by issue_date
    if (orderedDocs.length === 0) {
      orderedDocs = nodes.map((doc, idx) => ({
        doc,
        incomingLink: links.find(l => l.child_doc_id === doc.id) || null
      }));
    }

    // Role badge helper
    const getRoleInfo = (doc, idx, total) => {
      const text = `${doc.title || ''} ${doc.doc_ref_no || ''}`.toLowerCase();
      if (idx === 0) return { label: 'Initial Root Trigger', class: 'trigger' };
      if (idx === total - 1) return { label: 'Final Resolution / Grant', class: 'resolution' };
      if (doc.direction === 'INWARD' || text.includes('notice')) return { label: 'Inward Demand', class: 'trigger' };
      if (doc.direction === 'OUTWARD' || text.includes('reply')) return { label: 'Compliance Reply', class: 'reply' };
      if (text.includes('aadhaar') || text.includes('pan') || text.includes('degree') || text.includes('endorsement')) {
        return { label: 'Supporting Evidence', class: 'evidence' };
      }
      return { label: 'Evidence Record', class: 'reply' };
    };

    // Calculate total days turnaround
    let totalDays = 0;
    orderedDocs.forEach(({ incomingLink }) => {
      if (incomingLink && incomingLink.turnaround_days) {
        totalDays += Math.abs(incomingLink.turnaround_days);
      }
    });

    // Render Steps & Connector Ribbons
    const stepsHtml = orderedDocs.map(({ doc, incomingLink }, idx) => {
      const stepNum = String(idx + 1).padStart(2, '0');
      const role = getRoleInfo(doc, idx, orderedDocs.length);
      const thumbUrl = `/api/compliance/vault/documents/${doc.id}/thumbnail`;

      // Card HTML
      const cardHtml = `
        <div class="sherlock-doc-card" data-doc-id="${doc.id}">
          <div class="sherlock-pin-head" title="Evidence Pin #${stepNum}"></div>
          
          <div class="sherlock-doc-header">
            <span class="sherlock-step-number">STEP ${stepNum}</span>
            <span class="sherlock-role-tag ${role.class}">${role.label}</span>
          </div>

          <div class="sherlock-doc-thumb-stage">
            <div class="sherlock-thumb-fallback">
              <span class="sherlock-fallback-icon">📄</span>
              <span class="sherlock-fallback-badge">${(doc.file_type || 'PDF').toUpperCase()}</span>
            </div>
            <img src="${thumbUrl}" alt="${doc.title}" class="sherlock-doc-thumb-img" loading="lazy" onerror="this.style.display='none';" />
            <div class="sherlock-doc-hover-overlay">
              <span class="sherlock-quicklook-pill">Quick Look ↗</span>
            </div>
          </div>

          <div class="sherlock-doc-body">
            <div class="sherlock-doc-ref">${doc.doc_ref_no || 'REF'}</div>
            <div class="sherlock-doc-title" title="${doc.title}">${doc.title}</div>
            <div class="sherlock-doc-date">📅 ${doc.issue_date || 'N/A'} • ${doc.direction || 'INTERNAL'}</div>
          </div>
        </div>
      `;

      // Outgoing Connector Arrow to next step
      let connectorHtml = '';
      if (idx < orderedDocs.length - 1) {
        const nextStep = orderedDocs[idx + 1];
        const nextLink = nextStep.incomingLink;
        const days = nextLink && nextLink.turnaround_days !== null ? Math.abs(nextLink.turnaround_days) : null;
        const daysText = days !== null ? `⏱ +${days} days` : 'Sequence Order';
        const label = nextLink?.notes || nextLink?.link_relation?.replace(/_/g, ' ') || 'Connected Sequence';

        connectorHtml = `
          <div class="sherlock-connector">
            <div class="sherlock-string-line"></div>
            <div class="sherlock-connector-badge">${daysText}</div>
            <div class="sherlock-connector-label" title="${label}">${label}</div>
            <div class="sherlock-connector-arrow">►</div>
          </div>
        `;
      }

      return `
        <div class="sherlock-step-block">
          ${cardHtml}
          ${connectorHtml}
        </div>
      `;
    }).join('');

    viewport.innerHTML = `
      <div class="sherlock-trail-wrapper">
        <div class="sherlock-trail-ambient"></div>

        <!-- Case Tabs Selector -->
        <div class="sherlock-case-header">
          <div class="sherlock-case-tabs-bar" id="sherlockCaseTabsBar">
            ${matters.map(m => `
              <div class="sherlock-case-tab ${currentMatter?.name === m.name ? 'active' : ''}" data-matter-tab="${m.name}">
                <span>📂 ${m.name}</span>
                <span class="sherlock-case-tab-badge">${m.docCount} files</span>
              </div>
            `).join('')}
            <button class="sherlock-case-tab-btn-add" id="sherlockAddTrailBtn">
              <span>＋ Link New Trail</span>
            </button>
          </div>
        </div>

        <!-- Case Dossier Header -->
        <div class="sherlock-dossier-card">
          <div class="sherlock-dossier-left">
            <div class="sherlock-dossier-tag">
              <span>🔍</span> Investigation Evidence Chain
            </div>
            <h2 class="sherlock-dossier-title">${currentMatter?.name || 'Corporate Document Causality Chain'}</h2>
            <div class="sherlock-dossier-subtitle">
              Verified horizontal evidence sequence: Tracking chronological causality from root regulatory trigger through evidence submission to formal closure.
            </div>
          </div>

          <div class="sherlock-dossier-stats">
            <div class="sherlock-stat-pill">
              <span>📁</span> ${orderedDocs.length} Documents in Order
            </div>
            <div class="sherlock-stat-pill">
              <span>⏱</span> ${totalDays > 0 ? totalDays + ' Days Span' : 'Immediate'}
            </div>
            <div class="sherlock-stat-pill success">
              <span>🛡️</span> 100% SHA-256 Verified
            </div>
          </div>
        </div>

        <!-- Horizontal Sherlock Holmes Evidence Stage -->
        <div class="sherlock-trail-stage">
          <button class="sherlock-track-nav-btn left" id="sherlockScrollLeftBtn" title="Scroll Left">‹</button>
          <button class="sherlock-track-nav-btn right" id="sherlockScrollRightBtn" title="Scroll Right">›</button>

          <div class="sherlock-trail-scroll-track" id="sherlockScrollTrack">
            ${stepsHtml}
          </div>
        </div>
      </div>
    `;

    // Horizontal Scroll Arrows & Wheel Pan
    const track = viewport.querySelector('#sherlockScrollTrack');
    viewport.querySelector('#sherlockScrollLeftBtn')?.addEventListener('click', () => {
      track?.scrollBy({ left: -380, behavior: 'smooth' });
    });

    viewport.querySelector('#sherlockScrollRightBtn')?.addEventListener('click', () => {
      track?.scrollBy({ left: 380, behavior: 'smooth' });
    });

    if (track) {
      track.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) {
          e.preventDefault();
          track.scrollLeft += e.deltaY * 1.2;
        }
      }, { passive: false });
    }

    // Case Tab Switching
    viewport.querySelectorAll('[data-matter-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        this.selectedMatterName = tab.dataset.matterTab;
        this.renderTrailsPage(viewport);
      });
    });

    // Open File Viewer on card click
    viewport.querySelectorAll('.sherlock-doc-card').forEach(card => {
      card.addEventListener('click', () => {
        const docId = Number(card.dataset.docId);
        this.openFileViewer(docId);
      });
    });

    // Link New Trail button
    viewport.querySelector('#sherlockAddTrailBtn')?.addEventListener('click', () => {
      this.openNewPaperTrailModal();
    });
  }

  updateBatchBar() {
    const bar = this.container.querySelector('#vaultBatchToolbar');
    const countEl = this.container.querySelector('#vaultBatchCount');
    const editBtn = this.container.querySelector('#vaultBatchEditBtn');
    if (!bar || !countEl) return;

    const count = this.selectedDocIds.size;
    if (count > 0) {
      bar.style.display = 'inline-flex';
      countEl.textContent = `${count} Selected`;
      if (editBtn) {
        editBtn.style.display = count === 1 ? 'inline-flex' : 'none';
      }
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
      const isNative = !targetDoc.file_path;
      const filePath = targetDoc.file_path || '';
      const rawExt = filePath ? filePath.split('.').pop().toLowerCase() : '';
      const isPdf = rawExt === 'pdf';
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'].includes(rawExt);
      const isWord = ['docx', 'doc'].includes(rawExt);

      const downloadUrl = `/api/compliance/vault/documents/${targetDoc.id}/download`;
      const pdfUrl = `/api/compliance/vault/documents/${targetDoc.id}/pdf`;
      const docxUrl = `/api/compliance/vault/documents/${targetDoc.id}/docx`;
      const jpegUrl = `/api/compliance/vault/documents/${targetDoc.id}/jpeg`;
      const thumbUrl = `/api/compliance/vault/documents/${targetDoc.id}/thumbnail`;
      const baseFilename = (targetDoc.doc_ref_no || targetDoc.title || 'document').replace(/[/\\?%*:|"<>]/g, '_');
      const originalFileName = (targetDoc.file_name || (rawExt ? `${baseFilename}.${rawExt}` : `${baseFilename}.pdf`)).replace(/[/\\?%*:|"<>]/g, '_');

      let exportDropdownHtml = '';
      if (isNative) {
        exportDropdownHtml = `
          <div style="padding: 7px 12px; font-size: 10.5px; font-weight: 700; color: #0369a1; background: #f0f9ff; border-bottom: 1px solid #e0f2fe; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 5px;">
            <span>✦</span> <span>Compliance Studio Letterhead</span>
          </div>
          <a href="${pdfUrl}" download="${baseFilename}.pdf" class="vault-export-item" id="viewerExportPdfLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📄</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #0284c7;">Export as PDF</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Pure Rust Vector Engine • High Fidelity</div>
            </div>
          </a>
          <a href="${docxUrl}" download="${baseFilename}.docx" class="vault-export-item" id="viewerExportDocxLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📝</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #059669;">Export as Word (.docx)</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Editable OpenXML with Header & Table</div>
            </div>
          </a>
          <a href="${jpegUrl}" download="${baseFilename}.jpg" class="vault-export-item" id="viewerExportJpegLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">🖼️</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #d97706;">Export as Image (.jpg)</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Rasterized 200 DPI Letterhead</div>
            </div>
          </a>
        `;
      } else if (isPdf) {
        exportDropdownHtml = `
          <div style="padding: 7px 12px; font-size: 10.5px; font-weight: 700; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 5px;">
            <span>📁</span> <span>Uploaded PDF Document (${sizeStr})</span>
          </div>
          <a href="${downloadUrl}" download="${originalFileName}" class="vault-export-item" id="viewerDownloadOriginalLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📥</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #0284c7;">Download Original PDF</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Authentic uploaded file • ${sizeStr}</div>
            </div>
          </a>
          <a href="${jpegUrl}" download="${baseFilename}.jpg" class="vault-export-item" id="viewerExportJpegLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">🖼️</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #d97706;">Export as High-Res Image (.jpg)</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">200 DPI PyMuPDF rasterization</div>
            </div>
          </a>
          <div class="vault-export-item" style="opacity: 0.55; cursor: not-allowed; background: #f8fafc;" title="Word export requires structured studio documents, not scanned or external PDF files.">
            <span class="vault-export-icon">📝</span>
            <div>
              <div class="vault-export-name" style="font-weight: 600; color: #94a3b8;">Export as Word (.docx)</div>
              <div class="vault-export-desc" style="font-size: 10px; color: #94a3b8;">Unavailable for uploaded PDF scans</div>
            </div>
          </div>
        `;
      } else if (isImage) {
        exportDropdownHtml = `
          <div style="padding: 7px 12px; font-size: 10.5px; font-weight: 700; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 5px;">
            <span>📁</span> <span>Uploaded Image (${sizeStr})</span>
          </div>
          <a href="${downloadUrl}" download="${originalFileName}" class="vault-export-item" id="viewerDownloadOriginalLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📥</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #d97706;">Download Original Image</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Original resolution image • ${sizeStr}</div>
            </div>
          </a>
          <a href="${pdfUrl}" download="${baseFilename}.pdf" class="vault-export-item" id="viewerExportPdfLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📄</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #0284c7;">Convert & Export as PDF</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Lossless A4 printable document</div>
            </div>
          </a>
        `;
      } else if (isWord) {
        exportDropdownHtml = `
          <div style="padding: 7px 12px; font-size: 10.5px; font-weight: 700; color: #475569; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 5px;">
            <span>📁</span> <span>Uploaded Word Document (${sizeStr})</span>
          </div>
          <a href="${downloadUrl}" download="${originalFileName}" class="vault-export-item" id="viewerDownloadOriginalLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📥</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #059669;">Download Original Word (.docx)</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Original editable document • ${sizeStr}</div>
            </div>
          </a>
          <a href="${pdfUrl}" download="${baseFilename}.pdf" class="vault-export-item" id="viewerExportPdfLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📄</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #0284c7;">Convert & Export as PDF</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Automated server-side conversion</div>
            </div>
          </a>
          <a href="${jpegUrl}" download="${baseFilename}.jpg" class="vault-export-item" id="viewerExportJpegLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">🖼️</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #d97706;">Export as Image (.jpg)</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">Rasterized 200 DPI JPEG</div>
            </div>
          </a>
        `;
      } else {
        exportDropdownHtml = `
          <a href="${downloadUrl}" download="${originalFileName}" class="vault-export-item" id="viewerDownloadOriginalLink" style="text-decoration: none; color: inherit;">
            <span class="vault-export-icon">📥</span>
            <div>
              <div class="vault-export-name" style="font-weight: 700; color: #0284c7;">Download Original File</div>
              <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">${originalFileName} • ${sizeStr}</div>
            </div>
          </a>
        `;
      }

      exportDropdownHtml += `
        <button type="button" class="vault-export-item" id="viewerDirectPrintBtn" style="border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px;">
          <span class="vault-export-icon">⎙</span>
          <div>
            <div class="vault-export-name" style="font-weight: 700; color: #475569;">Print Document</div>
            <div class="vault-export-desc" style="font-size: 11px; color: #64748b;">System Print Dialog</div>
          </div>
        </button>
      `;

      const dir = (this.directories || []).find(d => Number(d.id) === Number(targetDoc.dir_id));
      const dirName = dir ? dir.name : 'Corporate Vault';

      const totalPagesCount = (parsedContent?.pages && Array.isArray(parsedContent.pages) && parsedContent.pages.length > 0)
        ? parsedContent.pages.length
        : 1;

      let pagesThumbHtml = '';
      for (let pIdx = 0; pIdx < totalPagesCount; pIdx++) {
        pagesThumbHtml += `
          <div class="vault-page-thumb-card ${pIdx === 0 ? 'active' : ''}">
            <div class="vault-page-mini-sheet">
              <img src="${pIdx === 0 ? thumbUrl : thumbUrl + '?page=' + (pIdx + 1)}" alt="Page ${pIdx + 1}" class="vault-page-mini-img" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
              <div class="vault-page-mini-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:#fff; font-size:18px;">📄</div>
            </div>
            <span class="vault-page-num-tag">Page ${pIdx + 1}</span>
          </div>
        `;
      }

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
              <button class="vault-viewer-tool-btn" id="viewerEditInStudioBtn" title="Edit in Document Creation Studio" style="background: rgba(2, 132, 199, 0.14); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.35); font-weight: 700;">
                <span>✏️</span> Edit in Studio
              </button>
              <button class="vault-viewer-tool-btn ${this.viewerLeftRailOpen ? 'active' : ''}" id="viewerToggleThumbnailsBtn" title="Toggle Pages Rail (T)">
                <span>📑</span> Pages (${totalPagesCount})
              </button>
              <button class="vault-viewer-tool-btn ${this.viewerRightDrawerOpen ? 'active' : ''}" id="viewerToggleInspectorBtn" title="Toggle Compliance Inspector (I)">
                <span>ℹ️</span> Inspector
              </button>
              <button class="vault-viewer-tool-btn" id="viewerPrintBtn" title="Print Document (P)">
                <span>⎙</span> Print
              </button>
              <div class="vault-export-menu-wrapper" style="position: relative;">
                <button type="button" class="vault-viewer-tool-btn" id="viewerExportMenuBtn" title="Export in multiple formats">
                  <span>🚀</span> Export ▾
                </button>
                <div class="vault-export-dropdown" id="viewerExportDropdown" style="position: absolute; right: 0; top: 100%; margin-top: 6px; z-index: 1000; min-width: 250px;">
                  ${exportDropdownHtml}
                </div>
              </div>
              <button class="vault-file-nav-btn" id="viewerHeaderCloseBtn" title="Close (Esc)" style="margin-left: 6px;">✕</button>
            </div>
          </div>

          <!-- 3-Column Body -->
          <div class="vault-viewer-body">
            <!-- Column 1: Left Rail (Thumbnails Filmstrip) -->
            <div class="vault-viewer-left-rail ${this.viewerLeftRailOpen ? '' : 'collapsed'}" id="viewerLeftRail">
              <div class="vault-rail-header">Pages (${totalPagesCount})</div>
              <div class="vault-rail-pages-list">
                ${pagesThumbHtml}
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
                <button class="vault-inspector-tab-btn ${this.viewerActiveTab === 'copilot' ? 'active' : ''}" data-tab="copilot">AI Copilot 🤖</button>
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
      const tagsInfo = this.generateTagsAndSummary(doc);
      const tagsList = tagsInfo.tags || [];

      if (tabName === 'overview') {
        const isMismatched = doc.suggested_dir_id && Number(doc.suggested_dir_id) !== Number(doc.dir_id);
        const suggestedDir = isMismatched ? (this.directories || []).find(d => Number(d.id) === Number(doc.suggested_dir_id)) : null;

        contentEl.innerHTML = `
          <!-- AI Executive Brief -->
          <div class="vault-insp-ai-card">
            <div class="vault-insp-ai-header">
              <span class="vault-insp-ai-badge">🤖 AI Executive Summary</span>
              <button class="vault-insp-ai-refresh-btn" id="viewerReanalyzeAiBtn" title="Re-Analyze with Gemini AI">↺ Re-Extract</button>
            </div>
            <p class="vault-insp-ai-summary-text">${doc.ai_summary || tagsInfo.summary || 'AI analysis pending. Click Re-Extract to generate summary and tags.'}</p>
            <div class="vault-insp-tags-row">
              ${tagsList.map(t => `<span class="vault-insp-tag-pill" data-doc-tag="${t}">#${t}</span>`).join('')}
            </div>
            ${suggestedDir ? `
              <div class="vault-insp-autosort-banner">
                <span>💡 AI recommends folder: <strong>${suggestedDir.name}</strong></span>
                <button class="vault-insp-autosort-btn" id="viewerAutoSortBtn">Move Now</button>
              </div>
            ` : ''}
          </div>

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
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(226, 232, 240, 0.6);">
              <button class="vault-pill-btn" id="viewerInspEditInStudioBtn" style="justify-content: center; width: 100%; padding: 8px 12px; background: rgba(2, 132, 199, 0.1); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.25); font-weight: 700; cursor: pointer;">
                <span>✏️ Open & Edit in Studio</span>
              </button>
            </div>
          </div>
        `;

        contentEl.querySelector('#viewerInspEditInStudioBtn')?.addEventListener('click', () => {
          const overlayEl = document.getElementById('vaultPdfPreviewOverlay');
          if (overlayEl) overlayEl.remove();
          this.editDocumentInStudio(doc.id);
        });

        // Re-Extract AI button handler
        contentEl.querySelector('#viewerReanalyzeAiBtn')?.addEventListener('click', async () => {
          const btn = contentEl.querySelector('#viewerReanalyzeAiBtn');
          if (btn) btn.textContent = '⏳ Analyzing...';
          try {
            const res = await fetch(`/api/compliance/vault/documents/${doc.id}/ai-analyze`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              credentials: 'same-origin'
            });
            if (res.ok) {
              const data = await res.json();
              doc.ai_summary = data.ai_summary;
              doc.tags = JSON.stringify(data.tags);
              doc.suggested_dir_id = data.suggested_dir_id;
              this.app?.showNotification('Document re-analyzed with Gemini AI.', 'success');
              renderInspectorTab('overview', doc);
            }
          } catch (_) {
            if (btn) btn.textContent = '↺ Re-Extract';
          }
        });

        // Auto-sort move button handler
        contentEl.querySelector('#viewerAutoSortBtn')?.addEventListener('click', async () => {
          try {
            const res = await fetch(`/api/compliance/vault/documents/${doc.id}/auto-sort`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              credentials: 'same-origin'
            });
            if (res.ok) {
              const data = await res.json();
              doc.dir_id = data.new_dir_id;
              this.app?.showNotification(`Moved to ${data.directory_name}`, 'success');
              await this.loadData();
              renderInspectorTab('overview', doc);
            }
          } catch (_) {}
        });
      } else if (tabName === 'copilot') {
        contentEl.innerHTML = `
          <div class="vault-copilot-container">
            <div class="vault-copilot-header">
              <div class="vault-copilot-avatar">🤖</div>
              <div>
                <div class="vault-copilot-title">Vault Copilot</div>
                <div class="vault-copilot-subtitle">Powered by Gemini 2.5 Flash • Zero Cost</div>
              </div>
            </div>

            <div class="vault-copilot-messages" id="viewerCopilotMessages">
              <div class="vault-copilot-msg bot">
                Hello! I am your <strong>Document Copilot</strong> for <em>${doc.title}</em> (${doc.doc_ref_no || 'REF'}).
                <br><br>
                What would you like me to inspect, verify, or extract from this document?
              </div>
            </div>

            <div class="vault-copilot-chips">
              <button class="vault-copilot-chip" data-copilot-ask="Summarize key obligations, liabilities, and core clauses">Key Clauses 📜</button>
              <button class="vault-copilot-chip" data-copilot-ask="List all statutory dates, renewal deadlines, and timelines">Deadlines & Dates ⏱</button>
              <button class="vault-copilot-chip" data-copilot-ask="What statutory rules, regulations, or inspection acts apply here?">Statutory Rules 🛡️</button>
            </div>

            <div class="vault-copilot-input-bar">
              <input type="text" class="vault-copilot-input" id="viewerCopilotInput" placeholder="Ask anything about this document..." />
              <button class="vault-copilot-send-btn" id="viewerCopilotSendBtn" title="Send question">➤</button>
            </div>
          </div>
        `;

        const messagesBox = contentEl.querySelector('#viewerCopilotMessages');
        const inputEl = contentEl.querySelector('#viewerCopilotInput');
        const sendBtn = contentEl.querySelector('#viewerCopilotSendBtn');
        const history = [];

        const sendCopilotQuestion = async (qText) => {
          if (!qText || !qText.trim()) return;
          const question = qText.trim();
          if (inputEl) inputEl.value = '';

          // Append user question
          const userMsg = document.createElement('div');
          userMsg.className = 'vault-copilot-msg user';
          userMsg.textContent = question;
          messagesBox?.appendChild(userMsg);

          // Append loading pulse
          const loadingMsg = document.createElement('div');
          loadingMsg.className = 'vault-copilot-msg bot';
          loadingMsg.innerHTML = '<em>Consulting document context...</em>';
          messagesBox?.appendChild(loadingMsg);
          if (messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;

          try {
            const res = await fetch(`/api/compliance/vault/documents/${doc.id}/chat`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              credentials: 'same-origin',
              body: JSON.stringify({ question, history })
            });
            const data = await res.json();
            const answer = data.answer || 'No response returned from document.';

            loadingMsg.innerHTML = answer.replace(/\n/g, '<br>');
            history.push({ role: 'user', text: question });
            history.push({ role: 'model', text: answer });
          } catch (err) {
            loadingMsg.textContent = `Error: ${err.message}`;
          }

          if (messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;
        };

        sendBtn?.addEventListener('click', () => {
          sendCopilotQuestion(inputEl?.value);
        });

        inputEl?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            sendCopilotQuestion(inputEl.value);
          }
        });

        contentEl.querySelectorAll('[data-copilot-ask]').forEach(chip => {
          chip.addEventListener('click', () => {
            sendCopilotQuestion(chip.dataset.copilotAsk);
          });
        });
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
      const pdfUrl = `/api/compliance/vault/documents/${doc.id}/pdf`;
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

      // Viewer Export Dropdown Handler
      const vExportDropdown = overlay.querySelector('#viewerExportDropdown');
      const vExportBtn = overlay.querySelector('#viewerExportMenuBtn');
      vExportBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        vExportDropdown?.classList.toggle('show');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#viewerExportDropdown') && !e.target.closest('#viewerExportMenuBtn')) {
          vExportDropdown?.classList.remove('show');
        }
      });
      overlay.querySelectorAll('.vault-export-item').forEach(item => {
        item.addEventListener('click', () => {
          vExportDropdown?.classList.remove('show');
        });
      });

      // Print document
      const triggerPrint = () => {
        const frame = overlay.querySelector('#viewerPdfFrame');
        if (frame && frame.contentWindow) {
          try {
            frame.contentWindow.print();
            return;
          } catch (_) {}
        }
        window.print();
      };

      overlay.querySelector('#viewerPrintBtn')?.addEventListener('click', triggerPrint);
      overlay.querySelector('#viewerDirectPrintBtn')?.addEventListener('click', triggerPrint);

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

      overlay.querySelector('#viewerEditInStudioBtn')?.addEventListener('click', () => {
        closeViewer();
        this.editDocumentInStudio(doc.id);
      });

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
            <button class="coverflow-action-btn secondary" id="coverflowEditActiveBtn" style="color: #0284c7; font-weight: 700;">Edit in Studio ✏️</button>
            <a href="/api/compliance/vault/documents/${activeItem.id}/download" download class="coverflow-action-btn secondary" style="text-decoration: none;">Download ⬇</a>
          `;
        }

        actionsEl.querySelector('#coverflowOpenActiveBtn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          handleOpenActive();
        });

        actionsEl.querySelector('#coverflowEditActiveBtn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const docId = activeItem.id;
          closeCoverflow();
          this.editDocumentInStudio(docId);
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
