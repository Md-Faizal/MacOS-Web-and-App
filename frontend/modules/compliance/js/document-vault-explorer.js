/**
 * DocumentVaultExplorer - The Company "Holy Bible" Virtual Indexer & File Explorer
 * Design Language:
 * 1. Dedicated inner sidebar with distinct pages:
 *    - 📊 Dashboard (Hero search bar, recent document thumbnails, metrics, active trails)
 *    - 📁 All Documents / Explorer (Master file indexer & sandbox table)
 *    - 📥 Inward Register (Statutory notices, regulatory letters received)
 *    - 📤 Outward Dispatches (Official letters sent, replies to authorities)
 *    - 🔗 Paper Trails & Dossiers (Causality linkage graph & timeline cases)
 *    - 🪪 Personnel & KYC Vault (Employee appointment letters, statutory certificates)
 *    - 🔒 Official Sealed Archive (21 CFR Part 11 sealed and locked records)
 * 2. Top action bar with simple, prominent buttons:
 *    - ➕ Create Document (Official UCA letterhead composer)
 *    - 📤 Upload Document (File dropzone & record registration with auto doc ref)
 *    - 🔗 New Paper Trail (Link triggering notices to replies)
 *    - 📁 New Folder (Virtual directory creation)
 *    - ↻ Sync / Refresh
 * 3. Dashboard page with hero spotlight search bar and miniature letterhead thumbnail cards.
 * 4. Pure Rust PDF generation & verification hash via SuiteCoreBridge / WASM.
 */

export class DocumentVaultExplorer {
  constructor(appInstance) {
    this.app = appInstance;
    this.container = null;
    this.directories = [];
    this.documents = [];
    this.paperTrails = [];
    this.currentNavPage = 'dashboard';
    this.selectedDirId = null;
    this.selectedDirection = 'ALL';
    this.selectedDocIds = new Set();
    this.searchQuery = '';
    this.activeFilterChip = 'ALL';
  }

  getAuthHeaders() {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
      : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="vault-explorer-root">
        <!-- Top Action Bar -->
        <header class="vault-top-bar">
          <div class="vault-brand-block">
            <div class="vault-brand-icon">📜</div>
            <div class="vault-brand-text">
              <span class="vault-brand-title">Holy Bible Document Vault</span>
              <span class="vault-brand-sub">Master Company Index • 21 CFR Part 11 Compliant</span>
            </div>
          </div>

          <div class="vault-top-actions">
            <!-- Sandbox Batch Action Bar (Appears when docs selected in Explorer) -->
            <div class="vault-batch-toolbar" id="vaultBatchToolbar" style="display: none;">
              <span class="vault-batch-count" id="vaultBatchCount">0 Selected</span>
              <button class="vault-batch-btn" data-batch="CLONE" title="Clone / Duplicate selected">📋 Clone</button>
              <button class="vault-batch-btn" data-batch="MOVE" title="Move to folder">📂 Move</button>
              <button class="vault-batch-btn" data-batch="SEAL" title="Mark Sealed Official & Remove Watermark">🔒 Seal Official</button>
              <button class="vault-batch-btn danger" data-batch="DELETE" title="Delete selected">🗑️ Delete</button>
            </div>

            <!-- Simple, Prominent Top Action Buttons -->
            <button class="vault-btn-primary" id="vaultTopCreateBtn" title="Compose formal letter on official UCA letterhead">
              <span>➕</span> Create Document
            </button>
            <button class="vault-btn-secondary" id="vaultTopUploadBtn" title="Upload scanned PDF or index existing document">
              <span>📤</span> Upload Document
            </button>
            <button class="vault-btn-secondary vault-btn-trail" id="vaultTopTrailBtn" title="Connect notices and replies into an audit trail">
              <span>🔗</span> New Paper Trail
            </button>
            <button class="vault-btn-secondary" id="vaultTopNewFolderBtn" title="Create virtual directory">
              <span>📁+</span> New Folder
            </button>
            <button class="vault-btn-secondary" id="vaultTopRefreshBtn" title="Refresh vault index">
              <span>↻</span>
            </button>
          </div>
        </header>

        <!-- Master Split Layout: Dedicated Sidebar + Viewport -->
        <div class="vault-layout-body">
          <!-- Inner Vault Sidebar Navigation -->
          <aside class="vault-sidebar">
            <div class="vault-sidebar-section">
              <div class="vault-sidebar-title">
                <span>NAVIGATION</span>
              </div>
              <nav class="vault-nav-menu">
                <button class="vault-nav-item active" data-page="dashboard">
                  <span class="vault-nav-icon">📊</span>
                  <span class="vault-nav-label">Dashboard</span>
                </button>
                <button class="vault-nav-item" data-page="all">
                  <span class="vault-nav-icon">📁</span>
                  <span class="vault-nav-label">All Documents</span>
                  <span class="vault-nav-badge" id="vaultNavAllCount">0</span>
                </button>
                <button class="vault-nav-item" data-page="inward">
                  <span class="vault-nav-icon">📥</span>
                  <span class="vault-nav-label">Inward Register</span>
                  <span class="vault-nav-badge" id="vaultNavInwardCount">0</span>
                </button>
                <button class="vault-nav-item" data-page="outward">
                  <span class="vault-nav-icon">📤</span>
                  <span class="vault-nav-label">Outward Dispatches</span>
                  <span class="vault-nav-badge" id="vaultNavOutwardCount">0</span>
                </button>
                <button class="vault-nav-item" data-page="trails">
                  <span class="vault-nav-icon">🔗</span>
                  <span class="vault-nav-label">Paper Trails & Cases</span>
                  <span class="vault-nav-badge" id="vaultNavTrailsCount">0</span>
                </button>
                <button class="vault-nav-item" data-page="kyc">
                  <span class="vault-nav-icon">🪪</span>
                  <span class="vault-nav-label">Personnel & KYC</span>
                  <span class="vault-nav-badge" id="vaultNavKycCount">0</span>
                </button>
                <button class="vault-nav-item" data-page="archive">
                  <span class="vault-nav-icon">🔒</span>
                  <span class="vault-nav-label">Sealed Archive</span>
                  <span class="vault-nav-badge" id="vaultNavSealedCount">0</span>
                </button>
              </nav>
            </div>

            <!-- Virtual Directories Section -->
            <div class="vault-sidebar-section">
              <div class="vault-sidebar-title">
                <span>DIRECTORIES</span>
                <button class="vault-sidebar-title-btn" id="vaultSidebarAddFolderBtn" title="New Folder">＋</button>
              </div>
              <div class="vault-folder-list" id="vaultSidebarFolderList">
                <div style="padding: 6px 10px; color: #94a3b8; font-size: 11px;">Loading directories...</div>
              </div>
            </div>

            <!-- Audit & Engine Seal Footer -->
            <div class="vault-sidebar-footer">
              <strong><span>🛡️</span> 21 CFR Part 11 Active</strong>
              <div>Pure Rust SuiteCore PDF Engine • Immutable SHA-256 Ledger</div>
            </div>
          </aside>

          <!-- Main Viewport Area -->
          <main class="vault-viewport" id="vaultMainViewport">
            <!-- Dynamically populated based on active page -->
          </main>
        </div>
      </div>
    `;

    this.attachTopEventListeners();
    await this.loadData();
  }

  attachTopEventListeners() {
    // ➕ Create Document button
    this.container.querySelector('#vaultTopCreateBtn')?.addEventListener('click', () => {
      this.openDocumentEditorModal();
    });

    // 📤 Upload Document button
    this.container.querySelector('#vaultTopUploadBtn')?.addEventListener('click', () => {
      this.openUploadDocumentModal();
    });

    // 🔗 New Paper Trail button
    this.container.querySelector('#vaultTopTrailBtn')?.addEventListener('click', () => {
      this.openNewPaperTrailModal();
    });

    // 📁 New Folder button (Top & Sidebar)
    this.container.querySelector('#vaultTopNewFolderBtn')?.addEventListener('click', () => {
      this.openCreateFolderPrompt();
    });
    this.container.querySelector('#vaultSidebarAddFolderBtn')?.addEventListener('click', () => {
      this.openCreateFolderPrompt();
    });

    // ↻ Refresh button
    this.container.querySelector('#vaultTopRefreshBtn')?.addEventListener('click', async () => {
      await this.loadData();
      this.app?.showNotification('Vault master index synchronized.', 'success');
    });

    // Sidebar Navigation Click Handlers
    this.container.querySelectorAll('.vault-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.vault-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentNavPage = btn.dataset.page;
        this.selectedDirId = null; // Reset folder filter when clicking main navigation
        this.renderActivePage();
      });
    });

    // Batch Action Handlers
    this.container.querySelectorAll('[data-batch]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handleBatchAction(btn.dataset.batch);
      });
    });

    // Global keyboard shortcut: Ctrl+K / Cmd+K to focus search bar
    this.keyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = this.container.querySelector('#vaultHeroSearchInput') || this.container.querySelector('#vaultExplorerSearchInput');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler);
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

      this.updateSidebarCounters();
      this.renderSidebarFolders();
      this.renderActivePage();
    } catch (err) {
      console.warn('[DocumentVault] Load error:', err.message);
    }
  }

  updateSidebarCounters() {
    const allEl = this.container.querySelector('#vaultNavAllCount');
    const inwardEl = this.container.querySelector('#vaultNavInwardCount');
    const outwardEl = this.container.querySelector('#vaultNavOutwardCount');
    const trailsEl = this.container.querySelector('#vaultNavTrailsCount');
    const kycEl = this.container.querySelector('#vaultNavKycCount');
    const sealedEl = this.container.querySelector('#vaultNavSealedCount');

    const total = this.documents.length;
    const inwardCount = this.documents.filter(d => d.direction === 'INWARD').length;
    const outwardCount = this.documents.filter(d => d.direction === 'OUTWARD').length;
    const trailsCount = this.documents.filter(d => (d.trail_count || 0) > 0).length;
    const kycCount = this.documents.filter(d => ['APPOINTMENT_LETTER', 'JOINING_REPORT', 'FORM_48'].includes(d.doc_type)).length;
    const sealedCount = this.documents.filter(d => d.status === 'SEALED_OFFICIAL').length;

    if (allEl) allEl.textContent = total;
    if (inwardEl) inwardEl.textContent = inwardCount;
    if (outwardEl) outwardEl.textContent = outwardCount;
    if (trailsEl) trailsEl.textContent = trailsCount;
    if (kycEl) kycEl.textContent = kycCount;
    if (sealedEl) sealedEl.textContent = sealedCount;
  }

  renderSidebarFolders() {
    const listEl = this.container.querySelector('#vaultSidebarFolderList');
    if (!listEl) return;

    if (this.directories.length === 0) {
      listEl.innerHTML = `<div style="padding: 6px 10px; color: #94a3b8; font-size: 11px;">No directories found</div>`;
      return;
    }

    let html = '';
    this.directories.forEach(d => {
      const isSelected = this.selectedDirId === d.id;
      const count = this.documents.filter(doc => Number(doc.dir_id) === Number(d.id)).length;
      html += `
        <div class="vault-folder-item ${isSelected ? 'active' : ''}" data-dir-id="${d.id}">
          <span style="font-size: 13px;">${d.icon || '📁'}</span>
          <span class="vault-folder-name" title="${d.name}">${d.name}</span>
          <span class="vault-folder-count">${count}</span>
          <button class="vault-folder-opts-btn" data-edit-dir="${d.id}" title="Rename or delete folder">⋯</button>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('.vault-folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.vault-folder-opts-btn')) return;
        const dirId = Number(item.dataset.dirId);
        this.selectedDirId = dirId;
        this.currentNavPage = 'all';

        // Update active nav pill to "All Documents"
        this.container.querySelectorAll('.vault-nav-item').forEach(b => {
          b.classList.toggle('active', b.dataset.page === 'all');
        });

        listEl.querySelectorAll('.vault-folder-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        this.renderActivePage();
      });
    });

    listEl.querySelectorAll('[data-edit-dir]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFolderOptionsModal(Number(btn.dataset.editDir));
      });
    });
  }

  renderActivePage() {
    const viewport = this.container.querySelector('#vaultMainViewport');
    if (!viewport) return;

    if (this.currentNavPage === 'dashboard') {
      this.renderDashboardPage(viewport);
    } else if (this.currentNavPage === 'trails') {
      this.renderPaperTrailsPage(viewport);
    } else {
      this.renderDocumentsExplorerPage(viewport);
    }
  }

  // =========================================================================
  // 1. DASHBOARD PAGE: Hero Spotlight Search + Recent Docs Thumbnails + Metrics
  // =========================================================================
  renderDashboardPage(viewport) {
    const totalDocs = this.documents.length;
    const inwardCount = this.documents.filter(d => d.direction === 'INWARD').length;
    const outwardCount = this.documents.filter(d => d.direction === 'OUTWARD').length;
    const sealedCount = this.documents.filter(d => d.status === 'SEALED_OFFICIAL').length;

    // Filter documents for the Recent Thumbnails section based on search query or chips
    let displayDocs = [...this.documents];

    if (this.searchQuery) {
      displayDocs = displayDocs.filter(d =>
        (d.doc_ref_no || '').toLowerCase().includes(this.searchQuery) ||
        (d.title || '').toLowerCase().includes(this.searchQuery) ||
        (d.subject || '').toLowerCase().includes(this.searchQuery) ||
        (d.sender_party || '').toLowerCase().includes(this.searchQuery) ||
        (d.recipient_party || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (this.activeFilterChip === 'INWARD') {
      displayDocs = displayDocs.filter(d => d.direction === 'INWARD');
    } else if (this.activeFilterChip === 'OUTWARD') {
      displayDocs = displayDocs.filter(d => d.direction === 'OUTWARD');
    } else if (this.activeFilterChip === 'APPOINTMENT') {
      displayDocs = displayDocs.filter(d => d.doc_type === 'APPOINTMENT_LETTER');
    } else if (this.activeFilterChip === 'SEALED') {
      displayDocs = displayDocs.filter(d => d.status === 'SEALED_OFFICIAL');
    }

    // Recent items: take first 8 for thumbnails display
    const recentDocs = displayDocs.slice(0, 8);

    // Active paper trails preview (docs that have connections)
    const trailedDocs = this.documents.filter(d => (d.trail_count || 0) > 0).slice(0, 3);

    viewport.innerHTML = `
      <div class="vault-dashboard-scroll">
        <!-- Hero Spotlight Search Bar Container -->
        <div class="vault-hero-search-container">
          <div class="vault-hero-search-box">
            <span class="vault-hero-search-icon">🔍</span>
            <input
              type="text"
              class="vault-hero-search-input"
              id="vaultHeroSearchInput"
              placeholder="Search Holy Bible index by reference no, title, department, party, or keyword..."
              value="${this.searchQuery}"
              autocomplete="off"
            >
            ${this.searchQuery ? `<button class="vault-hero-search-clear" id="vaultHeroClearBtn" style="display: block;">✕</button>` : ''}
            <span class="vault-hero-search-shortcut">⌘K</span>
          </div>

          <!-- Quick Filter Chips -->
          <div class="vault-hero-filter-chips">
            <button class="vault-filter-chip ${this.activeFilterChip === 'ALL' ? 'active' : ''}" data-chip="ALL">
              All Documents (${totalDocs})
            </button>
            <button class="vault-filter-chip ${this.activeFilterChip === 'INWARD' ? 'active' : ''}" data-chip="INWARD">
              📥 Inward Received (${inwardCount})
            </button>
            <button class="vault-filter-chip ${this.activeFilterChip === 'OUTWARD' ? 'active' : ''}" data-chip="OUTWARD">
              📤 Outward Dispatches (${outwardCount})
            </button>
            <button class="vault-filter-chip ${this.activeFilterChip === 'APPOINTMENT' ? 'active' : ''}" data-chip="APPOINTMENT">
              📜 Appointment Letters
            </button>
            <button class="vault-filter-chip ${this.activeFilterChip === 'SEALED' ? 'active' : ''}" data-chip="SEALED">
              🔒 Sealed Official (${sealedCount})
            </button>
          </div>
        </div>

        <!-- Section: Recent Documents Thumbnails Carousel / Grid -->
        <div>
          <div class="vault-section-header">
            <div class="vault-section-titles">
              <div class="vault-section-title">
                <span>📑</span> Recent Documents
              </div>
              <div class="vault-section-sub">
                Live interactive letterheads with pure Rust PDF generation & digital seals
              </div>
            </div>
            <button class="vault-section-link" id="vaultViewAllDocsLink">
              View All In Explorer →
            </button>
          </div>

          <!-- Thumbnails Grid -->
          <div class="vault-thumbnails-grid" id="vaultThumbnailsGrid">
            ${this.renderThumbnailsHtml(recentDocs)}
          </div>
        </div>

        <!-- Section: Key Metrics Overview -->
        <div>
          <div class="vault-section-header">
            <div class="vault-section-titles">
              <div class="vault-section-title">
                <span>📈</span> Statutory & Corporate Audit Index
              </div>
              <div class="vault-section-sub">Real-time status of master filing and records</div>
            </div>
          </div>

          <div class="vault-metrics-grid">
            <div class="vault-metric-card">
              <div class="vault-metric-icon-box blue">📚</div>
              <div class="vault-metric-info">
                <span class="vault-metric-value">${totalDocs}</span>
                <span class="vault-metric-label">Total Indexed Records</span>
              </div>
            </div>

            <div class="vault-metric-card">
              <div class="vault-metric-icon-box amber">📥</div>
              <div class="vault-metric-info">
                <span class="vault-metric-value">${inwardCount}</span>
                <span class="vault-metric-label">Inward Notices & Letters</span>
              </div>
            </div>

            <div class="vault-metric-card">
              <div class="vault-metric-icon-box indigo">📤</div>
              <div class="vault-metric-info">
                <span class="vault-metric-value">${outwardCount}</span>
                <span class="vault-metric-label">Outward Dispatched Replies</span>
              </div>
            </div>

            <div class="vault-metric-card">
              <div class="vault-metric-icon-box green">🔒</div>
              <div class="vault-metric-info">
                <span class="vault-metric-value">${sealedCount}</span>
                <span class="vault-metric-label">21 CFR Part 11 Sealed</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Section: Active Regulatory Paper Trails -->
        <div>
          <div class="vault-section-header">
            <div class="vault-section-titles">
              <div class="vault-section-title">
                <span>🔗</span> Active Regulatory Paper Trails & Dossiers
              </div>
              <div class="vault-section-sub">Verified causality chains linking statutory notices to corporate replies</div>
            </div>
            <button class="vault-section-link" id="vaultViewAllTrailsLink">
              Explore All Trails →
            </button>
          </div>

          <div class="vault-trails-preview-grid">
            ${this.renderPaperTrailsPreviewHtml(trailedDocs)}
          </div>
        </div>
      </div>
    `;

    this.attachDashboardEventListeners(viewport);
  }

  renderThumbnailsHtml(docs) {
    if (docs.length === 0) {
      return `
        <div style="grid-column: 1 / -1; padding: 36px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 10px;">
          <div style="font-size: 28px; margin-bottom: 6px;">🔍</div>
          <div style="font-size: 13.5px; font-weight: 700; color: #334155;">No matching documents found</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Try a different search query or click "Create Document" above.</div>
        </div>
      `;
    }

    return docs.map(doc => {
      const isDraft = doc.status === 'DRAFT';
      const directionClass = doc.direction === 'INWARD' ? 'inward' : doc.direction === 'OUTWARD' ? 'outward' : 'internal';
      const directionLabel = doc.direction === 'INWARD' ? '📥 Inward' : doc.direction === 'OUTWARD' ? '📤 Outward' : '📄 Internal';
      const party = doc.direction === 'INWARD' ? (doc.sender_party || 'External Authority') : (doc.recipient_party || 'Recipient Party');

      return `
        <div class="vault-doc-thumb-card" data-doc-id="${doc.id}">
          <!-- Miniature UCA Letterhead Banner -->
          <div class="vault-thumb-letterhead-bar">
            <div class="vault-thumb-lh-top">
              <span class="vault-thumb-lh-crest">Utkal Chemical Aushadhalaya</span>
              <span class="vault-thumb-lh-seal">ESTD 1948</span>
            </div>
          </div>

          <!-- Document Content Body -->
          <div class="vault-thumb-body">
            <div class="vault-thumb-ref-row">
              <span class="vault-thumb-ref-code">${doc.doc_ref_no || 'UCA-REF'}</span>
              <span class="vault-thumb-dir-pill ${directionClass}">${directionLabel}</span>
            </div>

            <div class="vault-thumb-title" title="${doc.title}">
              ${doc.title}
            </div>

            <div class="vault-thumb-party" title="${party}">
              ${doc.direction === 'INWARD' ? 'From:' : 'To:'} ${party}
            </div>

            <!-- Paper Skeleton Lines simulating printed letterhead layout -->
            <div class="vault-thumb-paper-skeleton">
              <div class="vault-thumb-line w-full"></div>
              <div class="vault-thumb-line w-80"></div>
              <div class="vault-thumb-line w-60"></div>
            </div>

            <div class="vault-thumb-footer">
              <span>${doc.issue_date || 'Oct 16, 2026'}</span>
              <span class="vault-thumb-status-tag ${isDraft ? 'draft' : 'sealed'}">
                ${isDraft ? 'Draft' : '✓ Sealed'}
              </span>
            </div>
          </div>

          <!-- Hover Action Overlay -->
          <div class="vault-thumb-overlay">
            <button class="vault-overlay-btn preview" data-preview="${doc.id}">
              <span>📄</span> Live PDF Preview
            </button>
            <button class="vault-overlay-btn trail" data-trail="${doc.id}">
              <span>🔗</span> Paper Trail (${doc.trail_count || 0})
            </button>
            <button class="vault-overlay-btn edit" data-edit="${doc.id}">
              <span>✏️</span> Edit Sandbox
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderPaperTrailsPreviewHtml(trailedDocs) {
    if (trailedDocs.length === 0) {
      return `
        <div style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 10px;">
          <div style="font-size: 13px; font-weight: 600; color: #475569;">No active regulatory dossiers linked yet</div>
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 4px;">Click "New Paper Trail" on top to link inspection notices to compliance packets.</div>
        </div>
      `;
    }

    return trailedDocs.map(doc => `
      <div class="vault-trail-summary-card">
        <div class="vault-trail-badge-row">
          <span class="vault-trail-tag">Linked Regulatory Case</span>
          <button class="vault-action-pill trail" data-open-trail="${doc.id}">Inspect Full Graph →</button>
        </div>
        <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
          ${doc.doc_ref_no} — ${doc.title}
        </div>
        <div class="vault-trail-nodes">
          <div class="vault-trail-node-item parent">
            <span style="font-size: 11px; font-weight: 700; color: #b45309;">Root Document (${doc.direction})</span>
            <span style="font-size: 11px; color: #64748b;">${doc.doc_ref_no} • ${doc.issue_date || 'N/A'}</span>
          </div>
          <div class="vault-trail-node-item">
            <span style="font-size: 11px; font-weight: 700; color: #0284c7;">Connected Regulatory Responses</span>
            <span style="font-size: 11px; color: #64748b;">${doc.trail_count} registered causal linkage(s)</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  attachDashboardEventListeners(viewport) {
    // Spotlight Search Input
    const searchInput = viewport.querySelector('#vaultHeroSearchInput');
    const clearBtn = viewport.querySelector('#vaultHeroClearBtn');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderDashboardPage(viewport);
    });

    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.renderDashboardPage(viewport);
    });

    // Quick Filter Chips
    viewport.querySelectorAll('.vault-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeFilterChip = chip.dataset.chip;
        this.renderDashboardPage(viewport);
      });
    });

    // View All In Explorer Links
    viewport.querySelector('#vaultViewAllDocsLink')?.addEventListener('click', () => {
      this.currentNavPage = 'all';
      this.container.querySelectorAll('.vault-nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.page === 'all');
      });
      this.renderActivePage();
    });

    viewport.querySelector('#vaultViewAllTrailsLink')?.addEventListener('click', () => {
      this.currentNavPage = 'trails';
      this.container.querySelectorAll('.vault-nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.page === 'trails');
      });
      this.renderActivePage();
    });

    // Thumbnail Action Overlay Buttons
    viewport.querySelectorAll('[data-preview]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPdfPreviewModal(Number(btn.dataset.preview));
      });
    });

    viewport.querySelectorAll('[data-trail]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPaperTrailModal(Number(btn.dataset.trail));
      });
    });

    viewport.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doc = this.documents.find(d => Number(d.id) === Number(btn.dataset.edit));
        if (doc) this.openDocumentEditorModal(doc);
      });
    });

    viewport.querySelectorAll('[data-open-trail]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPaperTrailModal(Number(btn.dataset.openTrail));
      });
    });
  }

  // =========================================================================
  // 2. MASTER DOCUMENTS EXPLORER PAGE: Full Table / Directory View
  // =========================================================================
  renderDocumentsExplorerPage(viewport) {
    let filtered = [...this.documents];

    // Filter by Directory if selected
    if (this.selectedDirId !== null) {
      filtered = filtered.filter(doc => Number(doc.dir_id) === Number(this.selectedDirId));
    }

    // Filter by Current Navigation Page
    if (this.currentNavPage === 'inward') {
      filtered = filtered.filter(doc => doc.direction === 'INWARD');
    } else if (this.currentNavPage === 'outward') {
      filtered = filtered.filter(doc => doc.direction === 'OUTWARD');
    } else if (this.currentNavPage === 'kyc') {
      filtered = filtered.filter(doc => ['APPOINTMENT_LETTER', 'JOINING_REPORT', 'FORM_48'].includes(doc.doc_type));
    } else if (this.currentNavPage === 'archive') {
      filtered = filtered.filter(doc => doc.status === 'SEALED_OFFICIAL');
    }

    // Filter by Search Query
    if (this.searchQuery) {
      filtered = filtered.filter(doc =>
        (doc.doc_ref_no || '').toLowerCase().includes(this.searchQuery) ||
        (doc.title || '').toLowerCase().includes(this.searchQuery) ||
        (doc.subject || '').toLowerCase().includes(this.searchQuery) ||
        (doc.sender_party || '').toLowerCase().includes(this.searchQuery) ||
        (doc.recipient_party || '').toLowerCase().includes(this.searchQuery)
      );
    }

    const currentDirName = this.selectedDirId !== null
      ? (this.directories.find(d => d.id === this.selectedDirId)?.name || 'Folder')
      : (this.currentNavPage === 'inward' ? 'Inward Register'
        : this.currentNavPage === 'outward' ? 'Outward Dispatches'
        : this.currentNavPage === 'kyc' ? 'Personnel & KYC Vault'
        : this.currentNavPage === 'archive' ? 'Official Sealed Archive'
        : 'All Master Records');

    let rowsHtml = '';
    filtered.forEach(doc => {
      const isChecked = this.selectedDocIds.has(doc.id);
      const isDraft = doc.status === 'DRAFT';
      const hasTrail = (doc.trail_count || 0) > 0;

      const directionBadge = doc.direction === 'INWARD'
        ? `<span class="vault-dir-badge inward">📥 Inward</span>`
        : doc.direction === 'OUTWARD'
        ? `<span class="vault-dir-badge outward">📤 Outward</span>`
        : `<span class="vault-dir-badge internal">Internal</span>`;

      const statusBadge = isDraft
        ? `<span class="vault-status-badge draft">Draft (Watermarked)</span>`
        : `<span class="vault-status-badge sealed">✓ Sealed Official</span>`;

      const party = doc.direction === 'INWARD' ? (doc.sender_party || 'External Sender') : (doc.recipient_party || 'Recipient Party');

      rowsHtml += `
        <tr class="vault-table-row ${isChecked ? 'selected' : ''}" data-doc-id="${doc.id}">
          <td style="width: 32px; text-align: center;">
            <input type="checkbox" class="vault-row-checkbox" data-id="${doc.id}" ${isChecked ? 'checked' : ''}>
          </td>
          <td>
            <div class="vault-ref-cell">
              <span class="vault-ref-text">${doc.doc_ref_no}</span>
              ${hasTrail ? `<span class="vault-trail-indicator" title="Connected to Paper Trail">🔗 ${doc.trail_count}</span>` : ''}
            </div>
          </td>
          <td>
            <div class="vault-title-cell">
              <div class="vault-doc-title">${doc.title}</div>
              <div class="vault-doc-sub">${doc.subject || 'Statutory compliance document'}</div>
            </div>
          </td>
          <td>${directionBadge}</td>
          <td><span style="font-size: 12px; color: #334155;">${party}</span></td>
          <td><span style="font-size: 11.5px; color: #64748b;">${doc.issue_date || 'Oct 16, 2026'}</span></td>
          <td>${statusBadge}</td>
          <td>
            <div class="vault-row-actions">
              <button class="vault-action-pill" data-preview-pdf="${doc.id}" title="Preview Official Letterhead PDF">📄 PDF</button>
              <button class="vault-action-pill trail" data-view-trail="${doc.id}" title="View Paper Trail Timeline">🔗 Trail</button>
              <button class="vault-action-pill" data-edit-doc="${doc.id}" title="Edit in Sandbox">✏️ Edit</button>
            </div>
          </td>
        </tr>
      `;
    });

    viewport.innerHTML = `
      <div class="vault-explorer-view">
        <div class="vault-explorer-header-row">
          <div class="vault-explorer-summary">
            Showing <strong>${filtered.length}</strong> record(s) in <em>${currentDirName}</em>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input
              type="text"
              class="vault-filter-input"
              id="vaultExplorerSearchInput"
              placeholder="Filter references, titles, parties..."
              value="${this.searchQuery}"
            >
          </div>
        </div>

        <div class="vault-table-container">
          ${filtered.length === 0 ? `
            <div class="vault-empty-view">
              <div style="font-size: 32px; margin-bottom: 8px;">📇</div>
              <div style="font-size: 14px; font-weight: 700; color: #475569;">No documents found in ${currentDirName}</div>
              <p style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Click "Create Document" or "Upload Document" above to populate records.</p>
            </div>
          ` : `
            <table class="vault-table">
              <thead>
                <tr>
                  <th style="width: 32px; text-align: center;">
                    <input type="checkbox" id="vaultSelectAllCheckbox">
                  </th>
                  <th>Reference No</th>
                  <th>Title & Subject</th>
                  <th>Direction</th>
                  <th>Party</th>
                  <th>Issue Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    this.attachExplorerEventListeners(viewport, filtered);
  }

  attachExplorerEventListeners(viewport, filtered) {
    const searchInput = viewport.querySelector('#vaultExplorerSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderDocumentsExplorerPage(viewport);
    });

    const selectAllBox = viewport.querySelector('#vaultSelectAllCheckbox');
    selectAllBox?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      filtered.forEach(d => {
        if (checked) this.selectedDocIds.add(d.id);
        else this.selectedDocIds.delete(d.id);
      });
      this.updateBatchBar();
      this.renderDocumentsExplorerPage(viewport);
    });

    viewport.querySelectorAll('.vault-row-checkbox').forEach(box => {
      box.addEventListener('change', (e) => {
        const id = Number(box.dataset.id);
        if (e.target.checked) this.selectedDocIds.add(id);
        else this.selectedDocIds.delete(id);
        this.updateBatchBar();
        const tr = box.closest('tr');
        if (tr) tr.classList.toggle('selected', e.target.checked);
      });
    });

    viewport.querySelectorAll('[data-preview-pdf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPdfPreviewModal(Number(btn.dataset.previewPdf));
      });
    });

    viewport.querySelectorAll('[data-view-trail]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPaperTrailModal(Number(btn.dataset.viewTrail));
      });
    });

    viewport.querySelectorAll('[data-edit-doc]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doc = this.documents.find(d => Number(d.id) === Number(btn.dataset.editDoc));
        if (doc) this.openDocumentEditorModal(doc);
      });
    });
  }

  // =========================================================================
  // 3. PAPER TRAILS & DOSSIERS PAGE: Visual graph & timeline
  // =========================================================================
  renderPaperTrailsPage(viewport) {
    const trailedDocs = this.documents.filter(d => (d.trail_count || 0) > 0);

    viewport.innerHTML = `
      <div class="vault-dashboard-scroll">
        <div class="vault-section-header">
          <div class="vault-section-titles">
            <div class="vault-section-title">
              <span>🔗</span> Compliance Paper Trails & Regulatory Cases
            </div>
            <div class="vault-section-sub">
              Auditable timelines linking statutory inward notices to outward company dispatches
            </div>
          </div>
          <button class="vault-btn-primary" id="vaultCreateTrailInViewBtn">
            <span>➕</span> Assemble New Trail
          </button>
        </div>

        <div class="vault-trails-preview-grid">
          ${this.renderPaperTrailsPreviewHtml(trailedDocs)}
        </div>
      </div>
    `;

    viewport.querySelector('#vaultCreateTrailInViewBtn')?.addEventListener('click', () => {
      this.openNewPaperTrailModal();
    });

    viewport.querySelectorAll('[data-open-trail]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openPaperTrailModal(Number(btn.dataset.openTrail));
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
      if (!confirm(`Are you sure you want to delete ${docIds.length} selected document(s)?`)) return;
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
        this.app?.showNotification(`Batch action ${action} completed on ${docIds.length} item(s).`, 'success');
        this.selectedDocIds.clear();
        this.updateBatchBar();
        await this.loadData();
      } else {
        const errData = await res.json();
        this.app?.showNotification(errData.error || 'Batch action failed', 'error');
      }
    } catch (err) {
      this.app?.showNotification(err.message, 'error');
    }
  }

  // =========================================================================
  // 4. MODALS: Upload Document, Compose Document, PDF Preview, Paper Trail
  // =========================================================================

  // Upload Document Modal
  async openUploadDocumentModal() {
    const existing = document.getElementById('vaultUploadModalOverlay');
    if (existing) existing.remove();

    let autoRef = 'UCA/INW/2026/0001';
    try {
      if (window.SuiteCoreBridge && typeof window.SuiteCoreBridge.generateNextCompanyDocRef === 'function') {
        const existingRefs = this.documents.map(d => d.doc_ref_no).filter(Boolean);
        autoRef = window.SuiteCoreBridge.generateNextCompanyDocRef(existingRefs, {
          company_prefix: 'UCA',
          department_code: 'INW',
          year: '2026',
          padding: 4
        });
      } else {
        const res = await fetch('/api/compliance/vault/next-ref?dept_code=INW', {
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.doc_ref_no) autoRef = data.doc_ref_no;
        }
      }
    } catch (_) {}

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultUploadModalOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 720px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="staff-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📤</span>
            <h3>Upload & Register Document in Vault</h3>
          </div>
          <button class="staff-modal-close-btn" id="closeVaultUploadBtn">✕</button>
        </div>

        <form id="vaultUploadDocForm" style="flex: 1; overflow-y: auto; padding: 20px;">
          <!-- Dropzone Box -->
          <div class="vault-dropzone-box" id="vaultUploadDropzone">
            <div class="vault-dropzone-icon">📄</div>
            <div class="vault-dropzone-text">Drag & drop scanned PDF, Word document, or image here</div>
            <div class="vault-dropzone-sub">or click to browse from device (PDF, DOCX, PNG, JPG up to 50MB)</div>
            <input type="file" id="vaultUploadFileInput" style="display: none;" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
            <div id="vaultUploadSelectedFile" style="margin-top: 8px; font-weight: 700; color: #0284c7; font-size: 12px; display: none;"></div>
          </div>

          <!-- Metadata Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Document Reference No *</label>
              <input type="text" name="doc_ref_no" value="${autoRef}" required style="font-family: monospace; font-weight: 700; background: #f8fafc;">
            </div>
            <div class="staff-input-group">
              <label>Directory / Folder</label>
              <select name="dir_id">
                ${this.directories.map(d => `<option value="${d.id}">${d.icon || '📁'} ${d.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Document Title *</label>
              <input type="text" name="title" placeholder="e.g. Annual Factory Inspection Notice under Rule 157" required>
            </div>
            <div class="staff-input-group">
              <label>Direction</label>
              <select name="direction" id="vaultUploadDirectionSelect">
                <option value="INWARD">📥 Inward (Received)</option>
                <option value="OUTWARD">📤 Outward (Sent)</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Document Type</label>
              <select name="doc_type">
                <option value="STATUTORY_NOTICE">Statutory / Regulatory Notice</option>
                <option value="COMPLIANCE_REPLY">Compliance Reply</option>
                <option value="APPOINTMENT_LETTER">Appointment Letter</option>
                <option value="INWARD_LETTER">Inward Registered Letter</option>
                <option value="OUTWARD_DISPATCH">Outward Dispatch</option>
                <option value="INVOICE">Tax Invoice / Bill</option>
                <option value="AUDIT_REPORT">GMP Audit Report</option>
              </select>
            </div>
            <div class="staff-input-group">
              <label>Sender / Issuing Authority</label>
              <input type="text" name="sender_party" placeholder="e.g. State Drug Controller, Odisha">
            </div>
            <div class="staff-input-group">
              <label>Recipient / Target</label>
              <input type="text" name="recipient_party" value="Utkal Chemical Aushadhalaya">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="staff-input-group">
              <label>Date Received / Issued</label>
              <input type="date" name="issue_date" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="staff-input-group">
              <label>Tracking / Consignment No (SpeedPost / Courier)</label>
              <input type="text" name="tracking_consignment_no" placeholder="e.g. ED849201948IN">
            </div>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 12px;">
            <label>Subject / Executive Summary</label>
            <input type="text" name="subject" placeholder="e.g. Submission of compliance report for Schedule T deficiencies">
          </div>

          <div class="staff-input-group full-width">
            <label>Notes / Scanned Text Excerpt</label>
            <textarea name="notes" rows="3" placeholder="Paste excerpts, key statutory citations, or inspection observations..."></textarea>
          </div>

          <div class="staff-modal-actions-footer" style="padding-top: 16px; margin-top: 16px;">
            <button type="button" class="cmp-btn-cancel" id="cancelVaultUploadBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">Index & Save to Vault</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeVaultUploadBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelVaultUploadBtn')?.addEventListener('click', closeModal);

    // Dropzone interaction
    const dropzone = overlay.querySelector('#vaultUploadDropzone');
    const fileInput = overlay.querySelector('#vaultUploadFileInput');
    const selectedFileText = overlay.querySelector('#vaultUploadSelectedFile');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        fileInput.files = e.dataTransfer.files;
        selectedFileText.textContent = `Attached: ${e.dataTransfer.files[0].name} (${Math.round(e.dataTransfer.files[0].size / 1024)} KB)`;
        selectedFileText.style.display = 'block';
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        selectedFileText.textContent = `Attached: ${fileInput.files[0].name} (${Math.round(fileInput.files[0].size / 1024)} KB)`;
        selectedFileText.style.display = 'block';
      }
    });

    // Form submission
    overlay.querySelector('#vaultUploadDocForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const notes = form.notes.value.trim();

      const contentObj = {
        recipient_name: form.recipient_party.value.trim(),
        recipient_address: 'Jagatpur Industrial Estate, Cuttack',
        paragraphs: notes ? [notes] : ['Document registered into company vault index.'],
        terms_clauses: []
      };

      const payload = {
        dir_id: form.dir_id.value ? Number(form.dir_id.value) : null,
        doc_ref_no: form.doc_ref_no.value.trim(),
        title: form.title.value.trim(),
        doc_type: form.doc_type.value,
        direction: form.direction.value,
        status: 'SEALED_OFFICIAL',
        sender_party: form.sender_party.value.trim(),
        recipient_party: form.recipient_party.value.trim(),
        subject: form.subject.value.trim(),
        issue_date: form.issue_date.value,
        tracking_consignment_no: form.tracking_consignment_no.value.trim(),
        content_json: contentObj,
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
          const result = await res.json();
          this.app?.showNotification(`Document ${payload.doc_ref_no} registered in Vault.`, 'success');
          closeModal();
          await this.loadData();
          if (result.id) {
            this.openPdfPreviewModal(result.id);
          }
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Failed to upload document', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  // Document Creator & Sandbox Editor Modal
  async openDocumentEditorModal(existingDoc = null) {
    const isEdit = !!existingDoc;
    let nextRef = existingDoc?.doc_ref_no || '';

    if (!isEdit) {
      try {
        if (window.SuiteCoreBridge && typeof window.SuiteCoreBridge.generateNextCompanyDocRef === 'function') {
          const existingRefs = this.documents.map(d => d.doc_ref_no).filter(Boolean);
          nextRef = window.SuiteCoreBridge.generateNextCompanyDocRef(existingRefs, {
            company_prefix: 'UCA',
            department_code: 'GEN',
            year: '2026',
            padding: 4
          });
        } else {
          const res = await fetch('/api/compliance/vault/next-ref', {
            headers: this.getAuthHeaders(),
            credentials: 'same-origin'
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.doc_ref_no) nextRef = data.doc_ref_no;
          }
        }
      } catch (_) {}
    }

    let parsedContent = {};
    if (existingDoc?.content_json) {
      try { parsedContent = JSON.parse(existingDoc.content_json); } catch (_) {}
    }

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultDocEditorOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 860px; max-width: 95vw; max-height: 92vh; display: flex; flex-direction: column;">
        <div class="staff-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>✍️</span>
            <h3>${isEdit ? 'Edit Document Sandbox' : 'Compose Company Document on Official Letterhead'}</h3>
            <span style="font-size: 10px; font-weight: 700; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px;">⚡ Rust Letterhead Engine</span>
          </div>
          <button class="staff-modal-close-btn" id="closeVaultEditorBtn">✕</button>
        </div>

        <form id="vaultDocEditorForm" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
          <div style="flex: 1; overflow-y: auto; padding: 20px;">
            <!-- Document Meta Row -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div class="staff-input-group">
                <label>Document Reference No *</label>
                <input type="text" name="doc_ref_no" value="${nextRef}" required style="font-family: monospace; font-weight: 700; background: #f8fafc;">
              </div>
              <div class="staff-input-group">
                <label>Folder / Directory</label>
                <select name="dir_id">
                  ${this.directories.map(d => `<option value="${d.id}" ${Number(existingDoc?.dir_id) === Number(d.id) ? 'selected' : ''}>${d.icon || '📁'} ${d.name}</option>`).join('')}
                </select>
              </div>
              <div class="staff-input-group">
                <label>Document Type</label>
                <select name="doc_type" id="vaultDocTypeSelect">
                  <option value="APPOINTMENT_LETTER" ${existingDoc?.doc_type === 'APPOINTMENT_LETTER' ? 'selected' : ''}>Appointment Letter</option>
                  <option value="JOINING_REPORT" ${existingDoc?.doc_type === 'JOINING_REPORT' ? 'selected' : ''}>Joining Report / Undertaking</option>
                  <option value="COMPLIANCE_REPLY" ${existingDoc?.doc_type === 'COMPLIANCE_REPLY' ? 'selected' : ''}>Compliance Reply (To Authority)</option>
                  <option value="STATUTORY_NOTICE" ${existingDoc?.doc_type === 'STATUTORY_NOTICE' ? 'selected' : ''}>Statutory Inward Notice</option>
                  <option value="OFFICE_ORDER" ${existingDoc?.doc_type === 'OFFICE_ORDER' ? 'selected' : ''}>Internal Office Order / SOP</option>
                  <option value="LETTER" ${existingDoc?.doc_type === 'LETTER' ? 'selected' : ''}>General Official Letter</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div class="staff-input-group">
                <label>Document Title *</label>
                <input type="text" name="title" value="${existingDoc?.title || ''}" placeholder="e.g. Appointment Letter - Quality Control Chemist" required>
              </div>
              <div class="staff-input-group">
                <label>Direction</label>
                <select name="direction">
                  <option value="INTERNAL" ${existingDoc?.direction === 'INTERNAL' ? 'selected' : ''}>Internal</option>
                  <option value="INWARD" ${existingDoc?.direction === 'INWARD' ? 'selected' : ''}>📥 Inward (Received)</option>
                  <option value="OUTWARD" ${existingDoc?.direction === 'OUTWARD' ? 'selected' : ''}>📤 Outward (Sent)</option>
                </select>
              </div>
              <div class="staff-input-group">
                <label>Issue Date</label>
                <input type="date" name="issue_date" value="${existingDoc?.issue_date || new Date().toISOString().split('T')[0]}">
              </div>
            </div>

            <!-- Subject & Recipient -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
              <div class="staff-input-group">
                <label>Recipient Name & Party</label>
                <input type="text" name="recipient_party" value="${existingDoc?.recipient_party || parsedContent.recipient_name || ''}" placeholder="e.g. Dr. Debabrata Mishra / Drug Controller">
              </div>
              <div class="staff-input-group">
                <label>Recipient Title & Address</label>
                <input type="text" name="recipient_address" value="${parsedContent.recipient_address || ''}" placeholder="e.g. Madhupatna, Cuttack / Directorate of AYUSH">
              </div>
            </div>

            <div class="staff-input-group full-width" style="margin-bottom: 14px;">
              <label>Subject</label>
              <input type="text" name="subject" value="${existingDoc?.subject || ''}" placeholder="e.g. Offer of Employment for Chief Ayurvedic Medical Officer under Rule 157">
            </div>

            <!-- Body Paragraphs & Template Clauses -->
            <div class="staff-input-group full-width" style="margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="margin-bottom: 0;">Letter Body Paragraphs (One per line or paragraph)</label>
                <button type="button" class="vault-action-pill" id="vaultLoadTemplateBtn">Load Standard Clauses</button>
              </div>
              <textarea name="paragraphs" id="vaultParagraphsArea" rows="4" style="font-family: inherit; font-size: 13px;">${(parsedContent.paragraphs || [
                existingDoc?.subject || 'We are pleased to issue this formal document under the authority and governance of Utkal Chemical Aushadhalaya.',
                'Please review the statutory compliance terms and acknowledge receipt of this communication.'
              ]).join('\n\n')}</textarea>
            </div>

            <!-- Terms & Statutory Clauses -->
            <div class="staff-input-group full-width" style="margin-bottom: 14px;">
              <label>Numbered Terms / Statutory Clauses (One per line)</label>
              <textarea name="terms_clauses" id="vaultTermsArea" rows="3" placeholder="1. Compliance with Schedule T Good Manufacturing Practices\n2. Mandatory submission of annual Form 48 Clinical Health clearance">${(parsedContent.terms_clauses || []).join('\n')}</textarea>
            </div>

            <!-- Signatory & Part 11 Approval -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div class="staff-input-group">
                <label>Signatory Name</label>
                <input type="text" name="signatory_name" value="${existingDoc?.signatory_name || 'Dr. Debabrata Mishra'}">
              </div>
              <div class="staff-input-group">
                <label>Signatory Designation</label>
                <input type="text" name="signatory_title" value="${existingDoc?.signatory_title || 'Chief Ayurvedic Medical Officer'}">
              </div>
              <div class="staff-input-group">
                <label>Technical Reg / Authority No</label>
                <input type="text" name="signatory_reg_no" value="${existingDoc?.signatory_reg_no || 'BAMS-OR-4521'}">
              </div>
            </div>

            <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="is_watermarked" id="vaultWatermarkBox" ${existingDoc?.status === 'DRAFT' || existingDoc?.is_watermarked ? 'checked' : ''} style="width: auto;">
                <label for="vaultWatermarkBox" style="font-size: 12px; color: #475569; margin: 0; cursor: pointer;">
                  Apply "DRAFT - NOT FOR REGULATORY RELEASE" watermark (Uncheck for official seal)
                </label>
              </div>
            </div>
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelVaultEditorBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">${isEdit ? 'Save Changes' : 'Generate & Save in Vault'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeVaultEditorBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelVaultEditorBtn')?.addEventListener('click', closeModal);

    overlay.querySelector('#vaultLoadTemplateBtn')?.addEventListener('click', () => {
      const type = overlay.querySelector('#vaultDocTypeSelect').value;
      const parasEl = overlay.querySelector('#vaultParagraphsArea');
      const termsEl = overlay.querySelector('#vaultTermsArea');

      if (type === 'APPOINTMENT_LETTER') {
        parasEl.value = `With reference to your application and subsequent statutory interview, we are pleased to appoint you as Approved Technical Person under Rule 157 (Schedule T) of the Drugs & Cosmetics Rules, 1945 at Utkal Chemical Aushadhalaya.\n\nYou shall be in direct charge of manufacturing and testing operations, ensuring complete adherence to Ayurvedic Pharmacopoeia of India (API) standards and GMP guidelines.`;
        termsEl.value = `1. Remuneration: As mutually agreed and stated in the company compensation annexure.\n2. Schedule T Statutory Responsibility: You shall sign Batch Manufacturing Records (BMR) and Certificate of Analysis (CoA) prior to batch release.\n3. Form 48 Health Clearance: Maintenance of annual clinical health fitness under Rule 158 is mandatory.`;
      } else if (type === 'COMPLIANCE_REPLY') {
        parasEl.value = `With reference to your inspection memo / letter cited above, we submit herewith our point-wise compliance report and verified documentation as mandated under Good Manufacturing Practices.\n\nAll observations noted during the factory audit at Jagatpur Industrial Estate have been addressed, verified, and logged in accordance with AYUSH GMP guidelines.`;
        termsEl.value = `1. Submission of updated Approved Technical Persons register.\n2. Complete Form 48 Clinical Health certificates for all 42 operational personnel.\n3. Water test reports and retention sample inspection register under Rule 161B.`;
      } else {
        parasEl.value = `This official communication is issued under the authority and governance of Utkal Chemical Aushadhalaya.\n\nPlease retain this document for official records and regulatory inspection.`;
        termsEl.value = `1. Strict adherence to company quality governance.\n2. Maintenance of confidential trade formulations.`;
      }
      this.app?.showNotification('Loaded standard template clauses.', 'info');
    });

    overlay.querySelector('#vaultDocEditorForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const isDraft = form.is_watermarked.checked;

      const paragraphs = form.paragraphs.value.split('\n\n').map(p => p.trim()).filter(Boolean);
      const terms_clauses = form.terms_clauses.value.split('\n').map(c => c.trim()).filter(Boolean);

      const contentObj = {
        recipient_name: form.recipient_party.value.trim(),
        recipient_address: form.recipient_address.value.trim(),
        paragraphs,
        terms_clauses
      };

      const payload = {
        dir_id: form.dir_id.value ? Number(form.dir_id.value) : null,
        doc_ref_no: form.doc_ref_no.value.trim(),
        title: form.title.value.trim(),
        doc_type: form.doc_type.value,
        direction: form.direction.value,
        status: isDraft ? 'DRAFT' : 'SEALED_OFFICIAL',
        recipient_party: form.recipient_party.value.trim(),
        subject: form.subject.value.trim(),
        issue_date: form.issue_date.value,
        content_json: contentObj,
        signatory_name: form.signatory_name.value.trim(),
        signatory_title: form.signatory_title.value.trim(),
        signatory_reg_no: form.signatory_reg_no.value.trim(),
        is_watermarked: isDraft ? 1 : 0
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
          const result = await res.json();
          this.app?.showNotification(`Document ${payload.doc_ref_no} saved in Vault.`, 'success');
          closeModal();
          await this.loadData();
          if (result.id) {
            this.openPdfPreviewModal(result.id);
          }
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Failed to save document', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  // PDF Preview & Inspection Modal
  openPdfPreviewModal(docId) {
    const doc = this.documents.find(d => Number(d.id) === Number(docId));
    if (!doc) return;

    const existing = document.getElementById('vaultPdfModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultPdfModalOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 900px; max-width: 95vw; height: 88vh; display: flex; flex-direction: column;">
        <div class="staff-modal-header" style="padding: 12px 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📄</span>
            <strong style="font-size: 14px;">${doc.doc_ref_no} — ${doc.title}</strong>
            <span style="font-size: 10px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Rust SuiteCore PDF</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <a href="/api/compliance/vault/documents/${doc.id}/pdf" target="_blank" class="vault-action-pill" style="text-decoration: none; padding: 4px 10px;">Download ↗</a>
            <button class="staff-modal-close-btn" id="closeVaultPdfBtn">✕</button>
          </div>
        </div>
        <div style="flex: 1; min-height: 0; background: #525659; display: flex; align-items: center; justify-content: center;">
          <iframe src="/api/compliance/vault/documents/${doc.id}/pdf" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeVaultPdfBtn')?.addEventListener('click', () => overlay.remove());
  }

  // Paper Trail Modal (Inspect specific document causality)
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

    let parentsHtml = trailData.parents.length === 0
      ? `<div style="font-size: 12px; color: #94a3b8; font-style: italic;">No upstream triggering documents (Root document).</div>`
      : trailData.parents.map(p => `
          <div class="vault-trail-card parent">
            <div class="vault-trail-relation-tag">Triggered By (${p.link_relation})</div>
            <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${p.doc_ref_no} — ${p.title}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Date: ${p.issue_date || 'N/A'} • Party: ${p.sender_party || 'External'}</div>
            ${p.notes ? `<div style="font-size: 11px; color: #334155; margin-top: 4px; font-style: italic;">"${p.notes}"</div>` : ''}
          </div>
        `).join('');

    let childrenHtml = trailData.children.length === 0
      ? `<div style="font-size: 12px; color: #94a3b8; font-style: italic;">No downstream replies or attachments yet.</div>`
      : trailData.children.map(c => `
          <div class="vault-trail-card child">
            <div class="vault-trail-relation-tag" style="background: #e0e7ff; color: #4338ca;">Downstream Action (${c.link_relation})</div>
            <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${c.doc_ref_no} — ${c.title}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Date: ${c.issue_date || 'N/A'} • Party: ${c.recipient_party || 'Recipient'}</div>
            ${c.notes ? `<div style="font-size: 11px; color: #334155; margin-top: 4px; font-style: italic;">"${c.notes}"</div>` : ''}
          </div>
        `).join('');

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 780px; max-width: 95vw; max-height: 90vh;">
        <div class="staff-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>🔗</span>
            <h3>Compliance Paper Trail & Regulatory Dossier Graph</h3>
          </div>
          <button class="staff-modal-close-btn" id="closeVaultTrailBtn">✕</button>
        </div>

        <div style="padding: 20px; overflow-y: auto;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b;">Current Inspected Record</div>
            <div style="font-size: 15px; font-weight: 800; color: #0284c7; margin-top: 2px;">${cur?.doc_ref_no || ''}</div>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${cur?.title || ''}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Direction: <strong>${cur?.direction || ''}</strong> • Issue Date: ${cur?.issue_date || ''} • Verification Hash: <code>${(cur?.verification_hash || '').substring(0, 16)}...</code></div>
          </div>

          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>⬆️</span> UPSTREAM TRIGGERING DOCUMENTS (Inward notices, prior SOPs)
            </div>
            ${parentsHtml}
          </div>

          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>⬇️</span> DOWNSTREAM REPLIES & DISPATCHES (Outward compliance packets, BMR attachments)
            </div>
            ${childrenHtml}
          </div>

          <!-- Link New Document Form -->
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
            <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">+ Link An Existing Document to this Trail</div>
            <form id="vaultLinkTrailForm" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              <select id="vaultLinkTargetDocId" style="flex: 2; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;" required>
                <option value="">Select Document to link...</option>
                ${this.documents.filter(d => Number(d.id) !== Number(docId)).map(d => `<option value="${d.id}">${d.doc_ref_no} — ${d.title}</option>`).join('')}
              </select>
              <select id="vaultLinkRelation" style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
                <option value="REPLIED_WITH">REPLIED_WITH</option>
                <option value="TRIGGERED_BY">TRIGGERED_BY</option>
                <option value="ATTACHED_AS_EVIDENCE">ATTACHED_AS_EVIDENCE</option>
                <option value="SUPERSEDES">SUPERSEDES</option>
              </select>
              <input type="text" id="vaultLinkNotes" placeholder="Context notes (e.g. Reply to inspection notice)" style="flex: 2; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px;">
              <button type="submit" class="vault-btn-primary" style="padding: 6px 14px; font-size: 12px;">Connect</button>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeVaultTrailBtn')?.addEventListener('click', () => overlay.remove());

    overlay.querySelector('#vaultLinkTrailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const childId = overlay.querySelector('#vaultLinkTargetDocId').value;
      const rel = overlay.querySelector('#vaultLinkRelation').value;
      const notes = overlay.querySelector('#vaultLinkNotes').value.trim();

      if (!childId) return;

      try {
        const res = await fetch('/api/compliance/vault/trail', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify({
            parent_doc_id: docId,
            child_doc_id: Number(childId),
            link_relation: rel,
            notes
          })
        });

        if (res.ok) {
          this.app?.showNotification('Paper trail connection established.', 'success');
          overlay.remove();
          this.openPaperTrailModal(docId);
          await this.loadData();
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  // New Paper Trail Builder Modal
  openNewPaperTrailModal() {
    const existing = document.getElementById('vaultNewTrailModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'vaultNewTrailModalOverlay';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="width: 680px; max-width: 95vw;">
        <div class="staff-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>🔗</span>
            <h3>Assemble New Regulatory Paper Trail</h3>
          </div>
          <button class="staff-modal-close-btn" id="closeNewTrailBtn">✕</button>
        </div>

        <form id="vaultNewTrailForm" style="padding: 20px;">
          <p style="font-size: 12.5px; color: #64748b; margin-bottom: 16px;">
            Link an upstream triggering document (e.g. an Inward Statutory Notice from the Drug Controller) to a downstream corporate reply or dispatch.
          </p>

          <div class="staff-input-group full-width" style="margin-bottom: 14px;">
            <label>1. Select Root / Triggering Document (Parent) *</label>
            <select id="vaultTrailParentDoc" required style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12.5px;">
              <option value="">Choose root document...</option>
              ${this.documents.map(d => `<option value="${d.id}">[${d.direction}] ${d.doc_ref_no} — ${d.title}</option>`).join('')}
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 14px;">
            <label>2. Relationship Type *</label>
            <select id="vaultTrailRelation" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12.5px;">
              <option value="REPLIED_WITH">REPLIED_WITH (Downstream reply issued to address parent notice)</option>
              <option value="ATTACHED_AS_EVIDENCE">ATTACHED_AS_EVIDENCE (BMR or Lab Report attached to filing)</option>
              <option value="SUPERSEDES">SUPERSEDES (Updated revision of prior document)</option>
              <option value="TRIGGERED_BY">TRIGGERED_BY (Initiated as a result of parent inquiry)</option>
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 14px;">
            <label>3. Select Linked Document (Child / Reply) *</label>
            <select id="vaultTrailChildDoc" required style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12.5px;">
              <option value="">Choose linked reply document...</option>
              ${this.documents.map(d => `<option value="${d.id}">[${d.direction}] ${d.doc_ref_no} — ${d.title}</option>`).join('')}
            </select>
          </div>

          <div class="staff-input-group full-width" style="margin-bottom: 16px;">
            <label>Audit Notes / Context Summary</label>
            <input type="text" id="vaultTrailNotes" placeholder="e.g. Formal point-wise reply to Show-Cause Notice regarding Rule 157" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12.5px;">
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelNewTrailBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">Establish Linkage Chain</button>
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
      const parentId = overlay.querySelector('#vaultTrailParentDoc').value;
      const childId = overlay.querySelector('#vaultTrailChildDoc').value;
      const rel = overlay.querySelector('#vaultTrailRelation').value;
      const notes = overlay.querySelector('#vaultTrailNotes').value.trim();

      if (!parentId || !childId) return;
      if (parentId === childId) {
        alert('Parent and child documents must be different.');
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
            link_relation: rel,
            notes
          })
        });

        if (res.ok) {
          this.app?.showNotification('Paper trail established.', 'success');
          closeModal();
          await this.loadData();
          this.openPaperTrailModal(Number(parentId));
        } else {
          const errData = await res.json();
          this.app?.showNotification(errData.error || 'Failed to establish trail', 'error');
        }
      } catch (err) {
        this.app?.showNotification(err.message, 'error');
      }
    });
  }

  // Create Folder Prompt
  openCreateFolderPrompt() {
    const name = prompt('Enter new directory / department folder name:');
    if (!name || !name.trim()) return;

    fetch('/api/compliance/vault/directories', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'same-origin',
      body: JSON.stringify({ name: name.trim(), department: 'General', icon: '📁' })
    })
    .then(r => r.json())
    .then(() => {
      this.app?.showNotification(`Directory "${name}" created.`, 'success');
      this.loadData();
    })
    .catch(err => this.app?.showNotification(err.message, 'error'));
  }

  // Folder Options Dialog (Rename or Delete)
  openFolderOptionsModal(dirId) {
    const dir = this.directories.find(d => d.id === dirId);
    if (!dir) return;

    const action = prompt(`Folder: "${dir.name}"\nType 'RENAME' to edit title or 'DELETE' to remove folder:`).trim().toUpperCase();
    if (action === 'RENAME') {
      const newName = prompt('Enter new name:', dir.name);
      if (newName && newName.trim()) {
        fetch(`/api/compliance/vault/directories/${dir.id}`, {
          method: 'PUT',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin',
          body: JSON.stringify({ name: newName.trim() })
        }).then(() => {
          this.app?.showNotification('Folder renamed.', 'success');
          this.loadData();
        });
      }
    } else if (action === 'DELETE') {
      if (confirm(`Are you sure you want to delete directory "${dir.name}"?`)) {
        fetch(`/api/compliance/vault/directories/${dir.id}`, {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
          credentials: 'same-origin'
        })
          .then(() => {
            this.app?.showNotification('Folder deleted.', 'info');
            this.selectedDirId = null;
            this.loadData();
          });
      }
    }
  }

  destroy() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
  }
}
