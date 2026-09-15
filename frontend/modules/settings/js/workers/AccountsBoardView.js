/**
 * AccountsBoardView.js
 * Interactive Accounts & Permissions Relationship Board.
 * Visually displays Local and Google accounts with dynamic SVG wire connectors
 * representing permissions, roles, and platform linkings.
 */
export class AccountsBoardView {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.graphData = null;
    this.selectedUserId = null;
    this.selectedModuleId = null;
    this.filterMode = 'all'; // 'all' | 'google' | 'local' | 'active'
    this.searchQuery = '';
    this.zoomLevel = 1.0;
    this.container = null;
    this.wiresSvg = null;
    this.animFrameId = null;
  }

  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="wa-board-container">
        <!-- Toolbar -->
        <div class="wa-board-toolbar">
          <div class="wa-board-toolbar-left">
            <div style="position: relative;">
              <span style="position: absolute; left: 8px; top: 6px; font-size: 11px; opacity: 0.5;">🔍</span>
              <input type="text" class="wa-board-search" id="waBoardSearch" placeholder="Filter accounts...">
            </div>
            <button class="worker-filter-pill ${this.filterMode === 'all' ? 'active' : ''}" data-board-filter="all">All Accounts</button>
            <button class="worker-filter-pill ${this.filterMode === 'google' ? 'active' : ''}" data-board-filter="google">🌐 Google</button>
            <button class="worker-filter-pill ${this.filterMode === 'local' ? 'active' : ''}" data-board-filter="local">🔑 Local</button>
            <button class="worker-filter-pill ${this.filterMode === 'active' ? 'active' : ''}" data-board-filter="active">🟢 Active</button>
          </div>

          <div class="wa-board-stats" id="waBoardStats">
            <span class="wa-board-stat-item">Loading graph data...</span>
          </div>

          <div class="wa-board-toolbar-right">
            <button class="wa-board-zoom-btn" id="waZoomOut" title="Zoom Out">−</button>
            <button class="wa-board-zoom-btn" id="waZoomReset" title="Reset Zoom" style="font-size: 11px; width: 36px;">100%</button>
            <button class="wa-board-zoom-btn" id="waZoomIn" title="Zoom In">+</button>
          </div>
        </div>

        <!-- Viewport & Canvas -->
        <div class="wa-board-viewport" id="waBoardViewport">
          <div class="wa-board-canvas" id="waBoardCanvas">
            <!-- Dynamic SVG Wires Layer -->
            <svg class="wa-wires-layer" id="waWiresSvg"></svg>

            <!-- Column 1: Identity & Authentication Roots -->
            <div class="wa-board-column wa-col-roots" id="waColRoots">
              <div class="wa-col-header">
                <span>Identity Roots</span>
                <span style="font-size: 10px; opacity: 0.6;">Tier 1</span>
              </div>
              <div id="waRootsList" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>

            <!-- Column 2: User Accounts (Local & Google) -->
            <div class="wa-board-column wa-col-accounts" id="waColAccounts">
              <div class="wa-col-header">
                <span>Accounts & Workers</span>
                <span style="font-size: 10px; opacity: 0.6;">Tier 2</span>
              </div>
              <div id="waAccountsList" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>

            <!-- Column 3: Applications & Modules -->
            <div class="wa-board-column wa-col-modules" id="waColModules">
              <div class="wa-col-header">
                <span>Permissions & Apps</span>
                <span style="font-size: 10px; opacity: 0.6;">Tier 3</span>
              </div>
              <div id="waModulesList" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>

            <!-- Column 4: Scopes & Target Platforms -->
            <div class="wa-board-column wa-col-targets" id="waColTargets">
              <div class="wa-col-header">
                <span>Platforms & Data Scopes</span>
                <span style="font-size: 10px; opacity: 0.6;">Tier 4</span>
              </div>
              <div id="waTargetsList" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>
          </div>
        </div>

        <!-- Wire Hover Tooltip -->
        <div class="wa-wire-tooltip" id="waWireTooltip"></div>
      </div>
    `;

    this.wiresSvg = this.container.querySelector('#waWiresSvg');
    this.setupBoardListeners();
    await this.fetchAndRenderGraph();
  }

  setupBoardListeners() {
    // Search input
    const searchInput = this.container.querySelector('#waBoardSearch');
    if (searchInput) {
      searchInput.value = this.searchQuery;
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderGraphColumns();
        this.scheduleRedrawWires();
      });
    }

    // Filter pills
    this.container.querySelectorAll('[data-board-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.container.querySelectorAll('[data-board-filter]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.filterMode = e.currentTarget.dataset.boardFilter;
        this.renderGraphColumns();
        this.scheduleRedrawWires();
      });
    });

    // Zoom controls
    const canvas = this.container.querySelector('#waBoardCanvas');
    const zoomResetBtn = this.container.querySelector('#waZoomReset');

    const updateZoom = (level) => {
      this.zoomLevel = Math.min(1.4, Math.max(0.65, Math.round(level * 100) / 100));
      if (canvas) canvas.style.transform = `scale(${this.zoomLevel})`;
      if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(this.zoomLevel * 100)}%`;
      this.scheduleRedrawWires();
    };

    this.container.querySelector('#waZoomIn')?.addEventListener('click', () => updateZoom(this.zoomLevel + 0.1));
    this.container.querySelector('#waZoomOut')?.addEventListener('click', () => updateZoom(this.zoomLevel - 0.1));
    zoomResetBtn?.addEventListener('click', () => updateZoom(1.0));

    // Viewport scroll updates wire positions
    const viewport = this.container.querySelector('#waBoardViewport');
    viewport?.addEventListener('scroll', () => {
      this.scheduleRedrawWires();
    });

    window.addEventListener('resize', () => {
      this.scheduleRedrawWires();
    });
  }

  async fetchAndRenderGraph() {
    try {
      const res = await fetch('/api/admin/accounts-graph');
      if (!res.ok) throw new Error('Failed to load accounts graph');
      this.graphData = await res.json();
      this.renderGraphColumns();
      this.scheduleRedrawWires();
    } catch (err) {
      console.error('AccountsBoardView error:', err);
      const accountsList = this.container?.querySelector('#waAccountsList');
      if (accountsList) {
        accountsList.innerHTML = `<div style="color:var(--wa-danger); padding:20px; text-align:center;">Failed to load accounts graph: ${err.message}</div>`;
      }
    }
  }

  renderGraphColumns() {
    if (!this.graphData) return;

    const { users = [], identities = [], permissions = [], contactAccess = [], modules = [] } = this.graphData;

    // Filter users
    let filteredUsers = users;

    if (this.filterMode === 'google') {
      filteredUsers = filteredUsers.filter(u => u.google_id || u.google_email || identities.some(i => i.user_id === u.id && i.provider === 'google'));
    } else if (this.filterMode === 'local') {
      filteredUsers = filteredUsers.filter(u => !u.google_id && !u.google_email && (u.username || identities.some(i => i.user_id === u.id && i.provider === 'local')));
    } else if (this.filterMode === 'active') {
      filteredUsers = filteredUsers.filter(u => u.status === 'active' || u.role === 'owner');
    }

    if (this.searchQuery) {
      const q = this.searchQuery;
      filteredUsers = filteredUsers.filter(u => 
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.google_email && u.google_email.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q))
      );
    }

    // Update Stats Bar
    const statsEl = this.container.querySelector('#waBoardStats');
    const unlinked = this.graphData.unlinkedCredentials || { totalUnlinked: 0 };
    if (statsEl) {
      const totalAccounts = users.length;
      const googleCount = users.filter(u => u.google_id || u.google_email).length;
      const localCount = users.filter(u => !u.google_id && !u.google_email).length;
      const activeCount = users.filter(u => u.status === 'active').length;
      const unlinkedCount = unlinked.totalUnlinked || 0;

      statsEl.innerHTML = `
        <span class="wa-board-stat-item" title="Total Accounts">👥 <strong>${totalAccounts}</strong> Accounts</span>
        <span class="wa-board-stat-item" title="Google Accounts" style="color: var(--wa-wire-google);">🌐 <strong>${googleCount}</strong> Google</span>
        <span class="wa-board-stat-item" title="Local Accounts" style="color: var(--wa-wire-active);">🔑 <strong>${localCount}</strong> Local</span>
        <span class="wa-board-stat-item" title="Active Users">🟢 <strong>${activeCount}</strong> Active</span>
        <span class="wa-board-stat-item" title="Unlinked Credentials" style="color: ${unlinkedCount > 0 ? 'var(--wa-danger)' : '#34c759'};">🛡️ <strong>${unlinkedCount}</strong> Unlinked</span>
      `;
    }

    // 1. Render Tier 1: Identity Roots
    const rootsContainer = this.container.querySelector('#waRootsList');
    const owner = users.find(u => u.role === 'owner') || { id: 'admin_auth', full_name: 'Store Owner', email: 'Owner' };
    const ownerIdentities = identities.filter(i => i.user_id === owner.id);
    
    // Check owner dual emails
    const ownerLocal = owner.email || (identities.find(i => i.user_id === owner.id && i.provider === 'local')?.provider_email);
    const ownerGoogle = owner.google_email || (identities.find(i => i.user_id === owner.id && i.provider === 'google')?.provider_email);
    const ownerHasBothDifferent = Boolean(ownerLocal && ownerGoogle && ownerLocal.toLowerCase() !== ownerGoogle.toLowerCase());

    rootsContainer.innerHTML = `
      <div class="wa-node-card root-card" data-root-id="${owner.id}" id="node-root-${owner.id}">
        <div class="wa-port-pin right"></div>
        <div class="wa-node-header">
          <div class="worker-avatar" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border-color: rgba(99, 102, 241, 0.3);">👑</div>
          <div style="min-width:0; flex:1;">
            <div class="wa-node-title">${this.escape(owner.full_name || owner.username || 'Administrator')}</div>
            ${ownerHasBothDifferent ? `
              <div class="wa-dual-email" style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
                <div class="wa-node-sub" title="Local Email: ${this.escape(ownerLocal)}" style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:10px; opacity:0.8;">🔑</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(ownerLocal)}</span>
                </div>
                <div class="wa-node-sub" title="Google Email: ${this.escape(ownerGoogle)}" style="display:flex; align-items:center; gap:4px; color:var(--wa-wire-google);">
                  <span style="font-size:10px; opacity:0.8;">🌐</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(ownerGoogle)}</span>
                </div>
              </div>
            ` : `
              <div class="wa-node-sub" title="${this.escape(ownerGoogle || ownerLocal || 'Root Account')}">${this.escape(ownerGoogle || ownerLocal || 'Root Account')}</div>
            `}
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
          <span class="wa-provider-pill local">🔑 Local Auth</span>
          <span class="wa-provider-pill google">🌐 Google OAuth</span>
          <span class="wa-provider-pill webauthn">🪪 Passkey</span>
        </div>

        <div style="font-size:11px; margin-top:8px; color:var(--wa-text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; color:var(--wa-accent);">SUPERADMIN</span>
          <span>Full Root Access</span>
        </div>
      </div>

      ${unlinked.totalUnlinked > 0 ? `
        <div class="wa-node-card unlinked-alert-card" style="background:rgba(255, 69, 58, 0.08); border:1px solid rgba(255, 69, 58, 0.35); border-radius:10px; padding:12px;">
          <div class="wa-node-header">
            <div style="font-size:20px;">⚠️</div>
            <div>
              <div class="wa-node-title" style="font-size:12.5px; color:var(--wa-danger);">Unlinked Credentials (${unlinked.totalUnlinked})</div>
              <div class="wa-node-sub" style="font-size:10.5px;">No active account bound</div>
            </div>
          </div>
          <div style="font-size:11px; color:var(--wa-text-muted); line-height:1.4; margin-top:6px;">
            ${unlinked.orphanIdentities?.length ? `• ${unlinked.orphanIdentities.length} orphan OAuth/passkey identity<br>` : ''}
            ${unlinked.orphanLegacyCredentials?.length ? `• ${unlinked.orphanLegacyCredentials.length} legacy auth credential<br>` : ''}
            ${unlinked.unresolvedConflicts?.length ? `• ${unlinked.unresolvedConflicts.length} quarantined conflict<br>` : ''}
          </div>
        </div>
      ` : `
        <div class="wa-node-card" style="background:var(--wa-card-bg); border-style:dashed; opacity:0.85;">
          <div class="wa-node-header">
            <div style="font-size:18px;">🛡️</div>
            <div>
              <div class="wa-node-title" style="font-size:12px;">Security & RBAC Hub</div>
              <div class="wa-node-sub" style="font-size:10.5px; color:#34c759;">🟢 0 Unlinked Credentials</div>
            </div>
          </div>
          <div style="font-size:11px; color:var(--wa-text-muted); line-height:1.4;">
            All local, Google, and passkey credentials are fully bound to verified accounts.
          </div>
        </div>
      `}
    `;

    // 2. Render Tier 2: User Accounts (Local & Google Workers)
    const accountsContainer = this.container.querySelector('#waAccountsList');
    const workerUsers = filteredUsers.filter(u => u.role !== 'owner');

    if (workerUsers.length === 0) {
      accountsContainer.innerHTML = `
        <div style="padding:24px 10px; text-align:center; color:var(--wa-text-muted); font-size:12px; background:var(--wa-card-bg); border-radius:10px;">
          No workers match the current filter.
        </div>
      `;
    } else {
      accountsContainer.innerHTML = workerUsers.map(user => {
        const isGoogle = Boolean(user.google_id || user.google_email || identities.some(i => i.user_id === user.id && i.provider === 'google'));
        const providerBadge = isGoogle 
          ? '<span class="wa-provider-pill google">🌐 Google</span>'
          : '<span class="wa-provider-pill local">🔑 Local</span>';

        const platform = (user.last_client_type || (user.last_device_type?.includes('PWA') ? 'pwa' : (user.last_device_type?.includes('Android') ? 'android' : (user.last_platform || '')))).toLowerCase();
        const platformBadge = platform === 'pwa' 
          ? '<span class="worker-platform-badge pwa" style="font-size:9.5px; padding:1px 5px;">📱 PWA</span>'
          : (platform === 'android' || platform === 'native_android')
          ? '<span class="worker-platform-badge android" style="font-size:9.5px; padding:1px 5px;">🤖 Android</span>'
          : platform === 'web'
          ? '<span class="worker-platform-badge web" style="font-size:9.5px; padding:1px 5px;">💻 Web</span>'
          : '';

        const isSelected = this.selectedUserId === user.id;

        // Check for both local and Google emails
        const userLocal = user.email || (identities.find(i => i.user_id === user.id && i.provider === 'local')?.provider_email);
        const userGoogle = user.google_email || (identities.find(i => i.user_id === user.id && i.provider === 'google')?.provider_email);
        const hasBothDifferent = Boolean(userLocal && userGoogle && userLocal.toLowerCase() !== userGoogle.toLowerCase());

        return `
          <div class="wa-node-card account-card ${isSelected ? 'selected' : ''}" data-user-id="${user.id}" id="node-user-${user.id}">
            <div class="wa-port-pin left"></div>
            <div class="wa-port-pin right"></div>

            <div class="wa-node-header">
              <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" class="worker-avatar" style="width:34px; height:34px; font-size:13px;" alt="Avatar" onerror="this.src='/assets/Images/DefaultUser.png'">
              <div style="min-width:0; flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span class="wa-node-title" title="${this.escape(user.full_name || user.google_email || user.username)}">${this.escape(user.full_name || user.google_email || user.username)}</span>
                  ${providerBadge}
                </div>
                ${hasBothDifferent ? `
                  <div class="wa-dual-email" style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
                    <div class="wa-node-sub" title="Local Email: ${this.escape(userLocal)}" style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:9.5px; opacity:0.8;">🔑</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(userLocal)}</span>
                    </div>
                    <div class="wa-node-sub" title="Google Email: ${this.escape(userGoogle)}" style="display:flex; align-items:center; gap:4px; color:var(--wa-wire-google);">
                      <span style="font-size:9.5px; opacity:0.8;">🌐</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(userGoogle)}</span>
                    </div>
                  </div>
                ` : `
                  <div class="wa-node-sub" title="${this.escape(userGoogle || userLocal || user.username)}">${this.escape(userGoogle || userLocal || user.username)}</div>
                `}
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <div style="display:flex; gap:4px; align-items:center;">
                <span class="worker-status ${user.status}" style="font-size:9.5px; padding:1px 6px;">${user.status}</span>
                ${platformBadge}
              </div>
              <span style="font-size:10.5px; color:var(--wa-text-muted);">${user.role}</span>
            </div>

            ${isSelected ? `
              <div class="wa-quick-actions">
                <button class="wa-quick-btn btn-board-edit" data-id="${user.id}">⚙️ Permissions</button>
                <button class="wa-quick-btn btn-board-history" data-id="${user.id}">📜 History</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // 3. Render Tier 3: Applications & Permissions
    const modulesContainer = this.container.querySelector('#waModulesList');
    modulesContainer.innerHTML = this.coordinator.APP_LIST.map(app => {
      // Calculate how many active accounts have access
      const userPerms = permissions.filter(p => p.module === app.id && p.can_view === 1);
      // Also if user has no explicit permissions rows, default worker apps include billing, products, contacts, analytics
      const activeUserIdsWithAccess = users
        .filter(u => u.status === 'active' || u.role === 'owner')
        .filter(u => {
          if (u.role === 'owner') return true;
          const explicit = userPerms.find(p => p.user_id === u.id);
          if (explicit) return true;
          const hasAnyPerms = permissions.some(p => p.user_id === u.id);
          if (!hasAnyPerms && this.coordinator.DEFAULT_APPS.includes(app.id)) return true;
          return false;
        }).length;

      const isSelectedModule = this.selectedModuleId === app.id;

      return `
        <div class="wa-node-card wa-module-card ${isSelectedModule ? 'selected' : ''}" data-module-id="${app.id}" id="node-module-${app.id}">
          <div class="wa-port-pin left"></div>
          <div class="wa-port-pin right"></div>

          <div class="wa-module-info">
            <span class="wa-module-icon">${app.icon}</span>
            <div>
              <div class="wa-node-title" style="font-size:12.5px;">${this.escape(app.name)}</div>
              <div class="wa-node-sub" style="font-size:10.5px;">${this.escape(app.desc)}</div>
            </div>
          </div>

          <span class="wa-module-count-badge" title="${activeUserIdsWithAccess} active accounts with permission">${activeUserIdsWithAccess} users</span>
        </div>
      `;
    }).join('');

    // 4. Render Tier 4: Platforms & Data Scopes
    const targetsContainer = this.container.querySelector('#waTargetsList');
    const totalSharedContacts = contactAccess.reduce((acc, curr) => acc + (curr.shared_contact_count || 0), 0);
    const pwaUsersCount = users.filter(u => (u.last_client_type || '').includes('pwa') || (u.last_device_type || '').includes('PWA')).length;
    const androidUsersCount = users.filter(u => (u.last_client_type || '').includes('android') || (u.last_device_type || '').includes('Android')).length;
    const webUsersCount = Math.max(1, users.filter(u => !u.last_client_type || u.last_client_type === 'web').length);

    targetsContainer.innerHTML = `
      <div class="wa-node-card" id="node-target-contacts">
        <div class="wa-port-pin left"></div>
        <div class="wa-node-header">
          <span style="font-size:20px;">👥</span>
          <div>
            <div class="wa-node-title" style="font-size:12.5px;">Shared Customers</div>
            <div class="wa-node-sub">${totalSharedContacts} Total Bindings</div>
          </div>
        </div>
        <div style="font-size:11px; color:var(--wa-text-muted);">Scoped ledger & customer contact visibility</div>
      </div>

      <div class="wa-node-card" id="node-target-pwa">
        <div class="wa-port-pin left"></div>
        <div class="wa-node-header">
          <span style="font-size:20px;">📱</span>
          <div>
            <div class="wa-node-title" style="font-size:12.5px;">PWA Mobile Client</div>
            <div class="wa-node-sub">${pwaUsersCount} Devices Active</div>
          </div>
        </div>
        <div style="font-size:11px; color:var(--wa-text-muted);">Progressive Web App installation on mobile</div>
      </div>

      <div class="wa-node-card" id="node-target-android">
        <div class="wa-port-pin left"></div>
        <div class="wa-node-header">
          <span style="font-size:20px;">🤖</span>
          <div>
            <div class="wa-node-title" style="font-size:12.5px;">Android Native App</div>
            <div class="wa-node-sub">${androidUsersCount} Devices Active</div>
          </div>
        </div>
        <div style="font-size:11px; color:var(--wa-text-muted);">Native Kotlin Business Suite with Biometrics</div>
      </div>

      <div class="wa-node-card" id="node-target-web">
        <div class="wa-port-pin left"></div>
        <div class="wa-node-header">
          <span style="font-size:20px;">💻</span>
          <div>
            <div class="wa-node-title" style="font-size:12.5px;">Desktop Web Suite</div>
            <div class="wa-node-sub">${webUsersCount} Active Consoles</div>
          </div>
        </div>
        <div style="font-size:11px; color:var(--wa-text-muted);">Full macOS Web Desktop experience</div>
      </div>
    `;

    this.bindNodeInteractions();
  }

  bindNodeInteractions() {
    // Click account card
    this.container.querySelectorAll('.account-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const userId = card.dataset.userId;
        if (this.selectedUserId === userId) {
          this.selectedUserId = null;
        } else {
          this.selectedUserId = userId;
          this.selectedModuleId = null;
        }
        this.renderGraphColumns();
        this.scheduleRedrawWires();
      });
    });

    // Quick edit / history buttons on account card
    this.container.querySelectorAll('.btn-board-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.coordinator.openWorkerEditModal(btn.dataset.id);
      });
    });

    this.container.querySelectorAll('.btn-board-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.coordinator.openWorkerHistoryModal(btn.dataset.id);
      });
    });

    // Click module card
    this.container.querySelectorAll('.wa-module-card').forEach(card => {
      card.addEventListener('click', () => {
        const modId = card.dataset.moduleId;
        if (this.selectedModuleId === modId) {
          this.selectedModuleId = null;
        } else {
          this.selectedModuleId = modId;
          this.selectedUserId = null;
        }
        this.renderGraphColumns();
        this.scheduleRedrawWires();
      });
    });
  }

  scheduleRedrawWires() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(() => {
      this.drawWires();
    });
  }

  drawWires() {
    if (!this.wiresSvg || !this.graphData) return;

    const canvas = this.container.querySelector('#waBoardCanvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const scale = this.zoomLevel || 1.0;

    // Clear previous wires
    this.wiresSvg.innerHTML = '';

    const { users = [], permissions = [], contactAccess = [] } = this.graphData;
    const owner = users.find(u => u.role === 'owner');

    const getPinPos = (el, side = 'right') => {
      if (!el) return null;
      const pin = el.querySelector(`.wa-port-pin.${side}`) || el;
      const rect = pin.getBoundingClientRect();
      return {
        x: (rect.left + rect.width / 2 - canvasRect.left) / scale,
        y: (rect.top + rect.height / 2 - canvasRect.top) / scale
      };
    };

    const addWire = (startPos, endPos, options = {}) => {
      if (!startPos || !endPos) return;

      const {
        className = 'active',
        tooltipText = '',
        isHighlighted = false,
        isDimmed = false
      } = options;

      const dx = Math.max(35, Math.abs(endPos.x - startPos.x) * 0.45);
      const d = `M ${startPos.x} ${startPos.y} C ${startPos.x + dx} ${startPos.y}, ${endPos.x - dx} ${endPos.y}, ${endPos.x} ${endPos.y}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      let classes = `wa-wire-path ${className}`;
      if (isHighlighted) classes += ' highlighted';
      if (isDimmed) classes += ' dimmed';
      path.setAttribute('class', classes);

      // Tooltip events
      const tooltip = this.container.querySelector('#waWireTooltip');
      if (tooltip && tooltipText) {
        path.addEventListener('mouseenter', (e) => {
          tooltip.textContent = tooltipText;
          tooltip.style.display = 'block';
          tooltip.style.left = `${e.clientX - canvasRect.left + 10}px`;
          tooltip.style.top = `${e.clientY - canvasRect.top - 20}px`;
        });
        path.addEventListener('mousemove', (e) => {
          tooltip.style.left = `${e.clientX - canvasRect.left + 10}px`;
          tooltip.style.top = `${e.clientY - canvasRect.top - 20}px`;
        });
        path.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
      }

      this.wiresSvg.appendChild(path);
    };

    // 1. Draw Root Owner ➔ All Modules Wires (Owner has full access)
    const rootEl = this.container.querySelector(owner ? `#node-root-${owner.id}` : '.root-card');
    const rootPin = getPinPos(rootEl, 'right');

    this.coordinator.APP_LIST.forEach(app => {
      const modEl = this.container.querySelector(`#node-module-${app.id}`);
      const modLeftPin = getPinPos(modEl, 'left');

      const isHigh = this.selectedUserId === owner?.id || this.selectedModuleId === app.id;
      const isDim = (this.selectedUserId && this.selectedUserId !== owner?.id) || 
                    (this.selectedModuleId && this.selectedModuleId !== app.id);

      addWire(rootPin, modLeftPin, {
        className: 'owner',
        tooltipText: `Superadmin ➔ ${app.name} (Full Access)`,
        isHighlighted: isHigh,
        isDimmed: isDim
      });
    });

    // 2. Draw Root Owner ➔ Workers Wires (Account supervision link)
    users.filter(u => u.role !== 'owner').forEach(worker => {
      const workerEl = this.container.querySelector(`#node-user-${worker.id}`);
      const workerLeftPin = getPinPos(workerEl, 'left');

      const isGoogle = Boolean(worker.google_id || worker.google_email);
      const isHigh = this.selectedUserId === worker.id;
      const isDim = this.selectedUserId && this.selectedUserId !== worker.id;

      addWire(rootPin, workerLeftPin, {
        className: isGoogle ? 'google' : 'active',
        tooltipText: `Owner Supervision ➔ ${worker.full_name || worker.username} (${isGoogle ? 'Google' : 'Local'})`,
        isHighlighted: isHigh,
        isDimmed: isDim
      });
    });

    // 3. Draw Worker ➔ Assigned Applications Wires
    users.filter(u => u.role !== 'owner').forEach(worker => {
      const workerEl = this.container.querySelector(`#node-user-${worker.id}`);
      const workerRightPin = getPinPos(workerEl, 'right');
      if (!workerEl || !workerRightPin) return;

      const workerPerms = permissions.filter(p => p.user_id === worker.id && p.can_view === 1);
      const hasExplicit = permissions.some(p => p.user_id === worker.id);

      this.coordinator.APP_LIST.forEach(app => {
        let hasAccess = false;
        if (hasExplicit) {
          hasAccess = workerPerms.some(p => p.module === app.id);
        } else {
          hasAccess = this.coordinator.DEFAULT_APPS.includes(app.id);
        }

        if (hasAccess && worker.status === 'active') {
          const modEl = this.container.querySelector(`#node-module-${app.id}`);
          const modLeftPin = getPinPos(modEl, 'left');

          const isHigh = this.selectedUserId === worker.id || this.selectedModuleId === app.id;
          const isDim = (this.selectedUserId && this.selectedUserId !== worker.id) ||
                        (this.selectedModuleId && this.selectedModuleId !== app.id);

          addWire(workerRightPin, modLeftPin, {
            className: 'active',
            tooltipText: `${worker.full_name || worker.username} ➔ ${app.name} (Granted)`,
            isHighlighted: isHigh,
            isDimmed: isDim
          });
        }
      });
    });

    // 4. Draw Modules ➔ Target Platforms & Scopes Wires
    const contactsNode = this.container.querySelector('#node-target-contacts');
    const pwaNode = this.container.querySelector('#node-target-pwa');
    const androidNode = this.container.querySelector('#node-target-android');
    const webNode = this.container.querySelector('#node-target-web');

    const contactsMod = this.container.querySelector('#node-module-contacts');
    const billingMod = this.container.querySelector('#node-module-billing');

    addWire(getPinPos(contactsMod, 'right'), getPinPos(contactsNode, 'left'), {
      className: 'active',
      tooltipText: 'Contacts App ➔ Scoped Customer Contact Access',
      isHighlighted: this.selectedModuleId === 'contacts',
      isDimmed: this.selectedModuleId && this.selectedModuleId !== 'contacts'
    });

    addWire(getPinPos(billingMod, 'right'), getPinPos(pwaNode, 'left'), {
      className: 'active',
      tooltipText: 'Billing & POS ➔ PWA Mobile Terminal',
      isHighlighted: this.selectedModuleId === 'billing',
      isDimmed: this.selectedModuleId && this.selectedModuleId !== 'billing'
    });

    addWire(getPinPos(billingMod, 'right'), getPinPos(androidNode, 'left'), {
      className: 'active',
      tooltipText: 'Billing & POS ➔ Android Native Terminal',
      isHighlighted: this.selectedModuleId === 'billing',
      isDimmed: this.selectedModuleId && this.selectedModuleId !== 'billing'
    });

    addWire(getPinPos(billingMod, 'right'), getPinPos(webNode, 'left'), {
      className: 'active',
      tooltipText: 'Billing & POS ➔ Desktop Web Suite',
      isHighlighted: this.selectedModuleId === 'billing',
      isDimmed: this.selectedModuleId && this.selectedModuleId !== 'billing'
    });
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
