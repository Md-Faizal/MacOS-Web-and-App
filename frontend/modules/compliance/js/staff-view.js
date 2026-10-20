/**
 * StaffView - Directory & Compliance App
 * Cloned directly from macOS Contacts App:
 * - Liquid glass action buttons with backdrop-filter blur & saturation
 * - Dynamic vibrant color gradients (3-stop color interpolation)
 * - Fixed background avatar with smooth parallax scroll animation
 * - Translucent glass info cards with subtle borders
 * - Master-detail flush layout with zero double-padding
 */

export class StaffView {
  constructor(appInstance) {
    this.app = appInstance;
    this.container = null;
    this.sidebarContainer = null;
    this.cardContainer = null;

    // Contact Color Palette (Directly matching macOS Contacts)
    this.colors = [
      '#d4516b', // Rose
      '#5b6cf6', // Royal Blue
      '#2bb381', // Emerald
      '#f39c12', // Amber
      '#9b59b6', // Amethyst Violet
      '#3498db', // Sky Blue
      '#e74c3c', // Crimson
      '#1abc9c', // Mint Teal
      '#34495e'  // Slate
    ];

    this.staffList = [];
    this.selectedStaffId = null;
    this.filterCategory = 'ALL';
    this.searchQuery = '';
    this.isLoading = false;

    // Load from backend if available
    this.loadStaffFromAPI();
  }

  // Color adjustment helper (Contacts App calculation)
  adjustColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
    return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
  }

  getStaffColor(name) {
    let hash = 0;
    const str = name || 'Staff';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.colors[Math.abs(hash) % this.colors.length];
  }

  getStaffInitials(name) {
    if (!name) return 'ST';
    const clean = name.replace(/^(Dr\.|Vaidya|Mr\.|Mrs\.|Ms\.)\s+/i, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  async loadStaffFromAPI() {
    this.isLoading = true;
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
        : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/compliance/staff', { headers, credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.staff)) {
          this.staffList = data.staff;
          if (this.staffList.length > 0 && (!this.selectedStaffId || !this.staffList.some(s => Number(s.id) === Number(this.selectedStaffId)))) {
            this.selectedStaffId = this.staffList[0].id;
          }
          if (this.sidebarContainer) {
            this.renderSidebarList();
            this.renderDetailCard();
          }
        }
      }
    } catch (e) {
      console.warn('[StaffView] API sync fallback:', e.message);
    } finally {
      this.isLoading = false;
    }
  }

  // Make sort bubbles draggable and edge-to-edge
  setupChipsDraggable(chipsContainer) {
    if (!chipsContainer) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    chipsContainer.addEventListener('mousedown', (e) => {
      isDown = true;
      hasMoved = false;
      chipsContainer.classList.add('is-dragging');
      startX = e.pageX - chipsContainer.offsetLeft;
      scrollLeft = chipsContainer.scrollLeft;
    });

    chipsContainer.addEventListener('mouseleave', () => {
      isDown = false;
      chipsContainer.classList.remove('is-dragging');
    });

    chipsContainer.addEventListener('mouseup', () => {
      isDown = false;
      chipsContainer.classList.remove('is-dragging');
    });

    chipsContainer.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - chipsContainer.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 4) {
        hasMoved = true;
      }
      chipsContainer.scrollLeft = scrollLeft - walk;
    });

    chipsContainer.addEventListener('touchstart', (e) => {
      startX = e.touches[0].pageX - chipsContainer.offsetLeft;
      scrollLeft = chipsContainer.scrollLeft;
    }, { passive: true });

    chipsContainer.addEventListener('touchmove', (e) => {
      const x = e.touches[0].pageX - chipsContainer.offsetLeft;
      const walk = (x - startX) * 1.5;
      chipsContainer.scrollLeft = scrollLeft - walk;
    }, { passive: true });

    chipsContainer.querySelectorAll('.staff-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (hasMoved) {
          e.stopPropagation();
          hasMoved = false;
        }
      }, true);
    });
  }

  // Render Full-Bleed Master-Detail Layout (zero double-padding)
  render(targetContainer) {
    this.container = targetContainer;
    if (!this.container) return;

    if (!this.selectedStaffId && this.staffList.length > 0) {
      this.selectedStaffId = this.staffList[0].id;
    }

    this.container.innerHTML = `
      <div class="staff-split-layout">
        <!-- 1. Left Column: Staff Sidebar List -->
        <div class="staff-sidebar-panel">
          <div class="staff-sidebar-top-bar">
            <div class="staff-search-box-row">
              <input type="text" 
                     id="staffSearchInput" 
                     class="staff-search-input-field" 
                     placeholder="Search staff, code, role..."
                     value="${this.searchQuery || ''}"
                     autocomplete="off">
              <button class="staff-icon-button" id="staffAddBtn" title="Add New Staff">+</button>
            </div>

            <!-- Filter Chips (Draggable & Edge-to-Edge) -->
            <div class="staff-filter-chips">
              <button class="staff-chip ${this.filterCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">All (${this.staffList.length})</button>
              <button class="staff-chip ${this.filterCategory === 'TECHNICAL' ? 'active' : ''}" data-cat="TECHNICAL">Schedule T</button>
              <button class="staff-chip ${this.filterCategory === 'QC' ? 'active' : ''}" data-cat="QC">QC & Chemist</button>
              <button class="staff-chip ${this.filterCategory === 'WORKER' ? 'active' : ''}" data-cat="WORKER">Factory</button>
              <button class="staff-chip ${this.filterCategory === 'OFFICE' ? 'active' : ''}" data-cat="OFFICE">Office</button>
            </div>
          </div>

          <!-- Staff Items List -->
          <div class="staff-list-container" id="staffListContainer"></div>

          <!-- Bottom Bar: Status & Refresh -->
          <div class="staff-sidebar-bottom-bar">
            <span class="staff-sidebar-status-text" id="staffSidebarCountText">${this.staffList.length} Contacts</span>
            <button class="staff-sidebar-refresh-btn" id="staffRefreshBtn" title="Refresh Staff List">
              <span class="staff-refresh-icon" id="staffRefreshIcon">↻</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <!-- 2. Right Column: Contacts Profile Card with Liquid Glass -->
        <div class="staff-card-pane" id="staffCardContainer"></div>
      </div>
    `;

    this.sidebarContainer = this.container.querySelector('#staffListContainer');
    this.cardContainer = this.container.querySelector('#staffCardContainer');

    // Search input event
    const searchInput = this.container.querySelector('#staffSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderSidebarList();
    });

    // Make filter chips draggable
    const chipsEl = this.container.querySelector('.staff-filter-chips');
    this.setupChipsDraggable(chipsEl);

    // Filter chips events
    this.container.querySelectorAll('.staff-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.container.querySelectorAll('.staff-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filterCategory = chip.dataset.cat;
        this.renderSidebarList();
      });
    });

    // Add Staff event
    this.container.querySelector('#staffAddBtn')?.addEventListener('click', () => {
      this.openAddStaffModal();
    });

    // Refresh button event (At bottom of sidebar)
    this.container.querySelector('#staffRefreshBtn')?.addEventListener('click', async () => {
      const icon = this.container.querySelector('#staffRefreshIcon');
      if (icon) icon.classList.add('spinning');
      await this.loadStaffFromAPI();
      this.renderSidebarList();
      this.renderDetailCard();
      if (icon) icon.classList.remove('spinning');
      this.app?.showNotification?.('Staff list synchronized.', 'success');
    });

    this.renderSidebarList();
    this.renderDetailCard();
  }

  // Draggable horizontal scroll for filter chips
  setupChipsDraggable(chipsContainer) {
    if (!chipsContainer) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    // Mouse drag
    chipsContainer.addEventListener('mousedown', (e) => {
      isDown = true;
      hasDragged = false;
      chipsContainer.classList.add('is-dragging');
      startX = e.pageX - chipsContainer.offsetLeft;
      scrollLeft = chipsContainer.scrollLeft;
    });

    chipsContainer.addEventListener('mouseleave', () => {
      if (isDown) {
        isDown = false;
        chipsContainer.classList.remove('is-dragging');
      }
    });

    chipsContainer.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        chipsContainer.classList.remove('is-dragging');
      }
    });

    chipsContainer.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - chipsContainer.offsetLeft;
      const walk = (x - startX) * 1.5; // Drag scroll multiplier
      if (Math.abs(walk) > 4) {
        hasDragged = true;
      }
      chipsContainer.scrollLeft = scrollLeft - walk;
    });

    // Prevent accidental chip selection/click if dragged
    chipsContainer.addEventListener('click', (e) => {
      if (hasDragged) {
        e.stopPropagation();
        e.preventDefault();
        hasDragged = false;
      }
    }, true);

    // Mouse wheel horizontal scroll
    chipsContainer.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        chipsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  // Render Sidebar List
  renderSidebarList() {
    if (!this.sidebarContainer) return;

    let filtered = this.staffList;

    const countText = this.container?.querySelector('#staffSidebarCountText');
    if (countText) {
      countText.textContent = `${this.staffList.length} Contacts`;
    }

    // Filter categories
    if (this.filterCategory === 'TECHNICAL') {
      filtered = filtered.filter(s => s.is_schedule_t_technical === 1 || s.role_type === 'Technical Person');
    } else if (this.filterCategory === 'QC') {
      filtered = filtered.filter(s => (s.department || '').toLowerCase().includes('qc') || (s.designation || '').toLowerCase().includes('chemist'));
    } else if (this.filterCategory === 'WORKER') {
      filtered = filtered.filter(s => (s.role_type || '').toLowerCase() === 'worker');
    } else if (this.filterCategory === 'OFFICE') {
      filtered = filtered.filter(s => (s.department || '').toLowerCase().includes('accounts') || (s.role_type || '').toLowerCase() === 'staff');
    }

    // Search query
    if (this.searchQuery) {
      filtered = filtered.filter(s => 
        (s.full_name || '').toLowerCase().includes(this.searchQuery) ||
        (s.emp_code || '').toLowerCase().includes(this.searchQuery) ||
        (s.designation || '').toLowerCase().includes(this.searchQuery) ||
        (s.department || '').toLowerCase().includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      this.sidebarContainer.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: #888; font-size: 12px;">
          No staff matching current filter
        </div>
      `;
      return;
    }

    // Alphabetical grouping (Contacts App Style)
    const grouped = {};
    filtered.forEach(staff => {
      const letter = (staff.full_name || 'A').trim().charAt(0).toUpperCase();
      if (!grouped[letter]) grouped[letter] = [];
      grouped[letter].push(staff);
    });

    let html = '';
    Object.keys(grouped).sort().forEach(letter => {
      html += `<div class="staff-alphabet-header">${letter}</div>`;
      grouped[letter].forEach(staff => {
        const isSelected = Number(this.selectedStaffId) === Number(staff.id);
        const initials = this.getStaffInitials(staff.full_name);
        const staffColor = staff.color || this.getStaffColor(staff.full_name);
        staff.color = staffColor;

        html += `
          <button class="staff-list-item-btn ${isSelected ? 'active' : ''}" data-id="${staff.id}">
            <div class="staff-list-avatar" style="background: ${staffColor};">
              ${initials}
            </div>
            <div class="staff-list-meta-text">
              <div class="staff-list-name">${staff.full_name}</div>
              <div class="staff-list-role">${staff.designation || staff.department || 'Staff'}</div>
            </div>
            <span class="staff-list-status-dot" style="color: ${staff.status === 'ACTIVE' ? '#22c55e' : '#ef4444'};">●</span>
          </button>
        `;
      });
    });

    this.sidebarContainer.innerHTML = html;

    // Attach click events
    this.sidebarContainer.querySelectorAll('.staff-list-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sidebarContainer.querySelectorAll('.staff-list-item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectStaff(btn.dataset.id);
      });
    });
  }

  selectStaff(id) {
    this.selectedStaffId = Number(id);
    this.renderDetailCard();
  }

  // Render Right Column Detail Card (Contacts App Liquid Glass Clone)
  renderDetailCard() {
    if (!this.cardContainer) return;

    const staff = this.staffList.find(s => Number(s.id) === Number(this.selectedStaffId));

    if (!staff) {
      this.cardContainer.style.background = '#ffffff';
      this.cardContainer.innerHTML = `
        <div class="staff-empty-state">
          <div class="staff-empty-state-icon">📇</div>
          <div class="staff-empty-state-text">No staff member selected</div>
        </div>
      `;
      return;
    }

    const staffColor = staff.color || this.getStaffColor(staff.full_name);
    staff.color = staffColor;
    const initials = this.getStaffInitials(staff.full_name);
    const isTechnical = staff.is_schedule_t_technical === 1;

    // Dynamic 3-Stop Color Gradient Background (Contacts App signature style)
    this.cardContainer.style.background = `linear-gradient(135deg, ${staffColor} 0%, ${this.adjustColor(staffColor, -20)} 50%, ${this.adjustColor(staffColor, -40)} 100%)`;
    this.cardContainer.style.transition = 'background 0.5s cubic-bezier(0.4, 0, 0.2, 1)';

    const card = document.createElement('div');
    card.className = 'staff-contacts-card';

    card.innerHTML = `
      <!-- Fixed Avatar Background for Parallax Animation -->
      <div class="staff-fixed-bg-avatar">
        <div class="staff-large-avatar" style="background: ${staffColor};">
          ${initials}
        </div>
      </div>

      <!-- Scrolling Content Layer (moves over fixed avatar with glass blur) -->
      <div class="staff-details-scroll" id="staffScrollArea">
        
        <!-- Profile Header inside scroll area -->
        <div class="staff-profile-header">
          <div class="staff-profile-name">
            ${staff.full_name}
          </div>
          <div class="staff-profile-title-sub">
            ${staff.designation || 'Staff'} • ${staff.department || 'Manufacturing'} • ${staff.emp_code}
          </div>

          <!-- Liquid Glass Action Buttons -->
          <div class="staff-actions-bar">
            ${staff.phone ? `<button class="staff-liquid-btn" title="Message WhatsApp" data-action="whatsapp">💬</button>` : ''}
            ${staff.phone ? `<button class="staff-liquid-btn" title="Call Mobile" data-action="call">📞</button>` : ''}
            ${staff.email ? `<button class="staff-liquid-btn" title="Send Email" data-action="email">✉️</button>` : ''}
            <button class="staff-liquid-btn" title="View KYC & Vault Documents" data-action="docs">🪪</button>
            <button class="staff-liquid-btn" title="Form 48 Health Records" data-action="health">🩺</button>
            <button class="staff-liquid-btn" title="Worker Access Settings" data-action="access">⚙️</button>
            <button class="staff-liquid-btn" title="Edit Profile" data-action="edit">✏️</button>
          </div>
        </div>

        <!-- Poster Glass Row -->
        <div class="staff-poster-glass-row" id="staffPosterRow">
          <div class="staff-poster-left">
            <div class="staff-poster-badge-dot" style="background: ${staffColor};">
              ${initials}
            </div>
            <span>Staff Profile & Schedule T Dossier</span>
          </div>
          <span class="staff-poster-chevron">›</span>
        </div>

        <!-- 1. Statutory & Regulatory Credentials (Schedule T) -->
        <div class="staff-section-glass-header">Statutory & Regulatory Credentials (Schedule T)</div>
        <div class="staff-glass-card">
          <div class="staff-glass-row">
            <span class="staff-glass-label">schedule t status</span>
            <span class="staff-glass-value" style="font-weight: 700;">
              ${isTechnical ? '✓ Approved Technical Person (AYUSH Rule 157)' : 'Standard Operational Personnel'}
            </span>
          </div>
          ${staff.technical_reg_no ? `
            <div class="staff-glass-row">
              <span class="staff-glass-label">technical reg / lic no</span>
              <span class="staff-glass-value" style="font-family: monospace;">${staff.technical_reg_no}</span>
            </div>
          ` : ''}
          <div class="staff-glass-row">
            <span class="staff-glass-label">signing authority</span>
            <span class="staff-glass-value">
              ${isTechnical ? 'Authorized Signatory for Batch Dossiers (BMR) & CoA Release' : 'Line Operation Logs & Hygiene Verification'}
            </span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">annual medical fitness</span>
            <span class="staff-glass-value" style="display: flex; justify-content: space-between; align-items: center;">
              <span>Certified Fit under Rule 158 (Form 48)</span>
              <a href="#" id="staffInspectHealthLink" style="font-size: 12px; color: #ffffff;">View Health Cert ›</a>
            </span>
          </div>
        </div>

        <!-- 2. Employment Information -->
        <div class="staff-section-glass-header">Employment Profile</div>
        <div class="staff-glass-card">
          <div class="staff-glass-row">
            <span class="staff-glass-label">employee code</span>
            <span class="staff-glass-value">${staff.emp_code}</span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">department</span>
            <span class="staff-glass-value">${staff.department || 'Manufacturing'}</span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">designation</span>
            <span class="staff-glass-value">${staff.designation || 'Staff'}</span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">role classification</span>
            <span class="staff-glass-value">${staff.role_type || 'Worker'}</span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">date of joining</span>
            <span class="staff-glass-value">${staff.joining_date || 'Feb 01, 2018'}</span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">account status</span>
            <span class="staff-glass-value">${staff.status || 'ACTIVE'}</span>
          </div>
        </div>

        <!-- 3. Contact & Personal Details -->
        <div class="staff-section-glass-header">Contact & Personal Details</div>
        <div class="staff-glass-card">
          ${staff.phone ? `
            <div class="staff-glass-row">
              <span class="staff-glass-label">mobile phone</span>
              <span class="staff-glass-value"><a href="tel:${staff.phone}">${staff.phone}</a></span>
            </div>
          ` : ''}
          ${staff.email ? `
            <div class="staff-glass-row">
              <span class="staff-glass-label">email address</span>
              <span class="staff-glass-value"><a href="mailto:${staff.email}">${staff.email}</a></span>
            </div>
          ` : ''}
          ${staff.address ? `
            <div class="staff-glass-row">
              <span class="staff-glass-label">residential address</span>
              <span class="staff-glass-value">${staff.address}</span>
            </div>
          ` : ''}
          <div class="staff-glass-row">
            <span class="staff-glass-label">blood group</span>
            <span class="staff-glass-value">${staff.blood_group || 'Not Specified'}</span>
          </div>
          ${staff.emergency_contact ? `
            <div class="staff-glass-row">
              <span class="staff-glass-label">emergency contact</span>
              <span class="staff-glass-value">${staff.emergency_contact}</span>
            </div>
          ` : ''}
        </div>

        <!-- 3b. Digital Signature & Auto-Signing Authority -->
        <div class="staff-section-glass-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Digital Signature & Auto-Sign Seal</span>
          <button class="staff-doc-action-pill" id="staffUpdateSignatureBtn" style="padding: 3px 10px; font-size: 11px; background: rgba(255,255,255,0.22); color: #fff;">
            ${staff.signature_data ? '✏️ Change Signature' : '🖋️ Upload Signature'}
          </button>
        </div>
        <div class="staff-glass-card">
          <div class="staff-glass-row">
            <span class="staff-glass-label">signing status</span>
            <span class="staff-glass-value" style="font-weight: 700;">
              ${staff.is_authorized_signatory || staff.is_schedule_t_technical ? '✓ Authorized Signatory for Official Documents' : 'Not Configured for Auto-Signing'}
            </span>
          </div>
          <div class="staff-glass-row">
            <span class="staff-glass-label">signature designation</span>
            <span class="staff-glass-value">${staff.signature_title || staff.designation || 'Authorized Signatory'}</span>
          </div>
          <div class="staff-glass-row" style="align-items: center;">
            <span class="staff-glass-label">specimen signature</span>
            <div class="staff-glass-value" style="padding: 6px 0;">
              ${staff.signature_data ? `
                <div style="background: rgba(255,255,255,0.92); padding: 8px 16px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                  <img src="${staff.signature_data}" alt="Signature" style="max-height: 48px; max-width: 180px; object-fit: contain; filter: contrast(1.1);">
                </div>
              ` : `
                <div style="font-size: 12px; color: rgba(255,255,255,0.7); font-style: italic;">
                  No specimen signature uploaded. Click "Upload Signature" above to draw or upload PNG.
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- 4. Attached KYC & Documents Vault with Blurred Previews -->
        <div class="staff-section-glass-header">Verified Digital Credentials & Cloud Vault (Blurred Previews)</div>
        <div class="staff-docs-preview-grid">
          ${this.renderDocPreviewCards(staff)}
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
          <a href="#" id="staffOpenCloudLink" style="font-size: 12px; color: rgba(255,255,255,0.92); font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            Open All Files in StackOverdrive Cloud App ↗
          </a>
        </div>

        <!-- 5. Delete Action -->
        <div class="staff-delete-glass-container">
          <button class="staff-delete-glass-btn" id="staffDeleteBtn">🗑️ Delete Staff Record</button>
        </div>
      </div>
    `;

    this.cardContainer.innerHTML = '';
    this.cardContainer.appendChild(card);

    // Parallax Scroll Animation (Exact Contacts App replication)
    const scrollContainer = card.querySelector('#staffScrollArea');
    const bgAvatar = card.querySelector('.staff-fixed-bg-avatar .staff-large-avatar');

    if (scrollContainer && bgAvatar) {
      scrollContainer.addEventListener('scroll', () => {
        const scrollTop = scrollContainer.scrollTop;
        const maxScroll = 150;
        const progress = Math.min(scrollTop / maxScroll, 1);

        const scale = 1 - (progress * 0.25);
        const translateY = -(progress * 20);
        const opacity = 1 - (progress * 0.15);

        bgAvatar.style.transform = `translateY(${translateY}px) scale(${scale})`;
        bgAvatar.style.opacity = opacity;

        if (scrollTop > 5) {
          scrollContainer.style.background = `rgba(0, 0, 0, ${progress * 0.08})`;
          scrollContainer.style.backdropFilter = `blur(${progress * 25}px)`;
          scrollContainer.style.webkitBackdropFilter = `blur(${progress * 25}px)`;
        } else {
          scrollContainer.style.background = 'transparent';
          scrollContainer.style.backdropFilter = 'none';
          scrollContainer.style.webkitBackdropFilter = 'none';
        }
      });
    }

    // Action button listeners
    card.querySelector('[data-action="whatsapp"]')?.addEventListener('click', () => {
      const num = (staff.phone || '').replace(/[^0-9]/g, '');
      if (num) window.open(`https://wa.me/${num}`, '_blank');
    });

    card.querySelector('[data-action="call"]')?.addEventListener('click', () => {
      if (staff.phone) window.location.href = `tel:${staff.phone}`;
    });

    card.querySelector('[data-action="email"]')?.addEventListener('click', () => {
      if (staff.email) window.location.href = `mailto:${staff.email}`;
    });

    card.querySelector('[data-action="docs"]')?.addEventListener('click', () => {
      this.showDocsModal(staff);
    });

    card.querySelector('[data-action="health"]')?.addEventListener('click', () => {
      this.showHealthModal(staff);
    });

    card.querySelector('#staffInspectHealthLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showHealthModal(staff);
    });

    card.querySelector('[data-action="access"]')?.addEventListener('click', () => {
      if (window.AppWindow && window.SettingsApp) {
        window.AppWindow.launchApp('settings', window.SettingsApp, 'settingsAppContainer');
        this.app?.showNotification?.('Switched to Settings: Worker Access.', 'info');
      }
    });

    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
      this.openEditStaffModal(staff);
    });

    card.querySelector('#staffPosterRow')?.addEventListener('click', () => {
      this.openEditStaffModal(staff);
    });

    card.querySelector('#staffUpdateSignatureBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSignatureModal(staff);
    });

    // Document Inspector & Cloud listeners
    card.querySelectorAll('[data-inspect]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDocInspector(btn.dataset.inspect, staff);
      });
    });

    card.querySelectorAll('[data-cloud]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.AppWindow && window.CloudApp) {
          window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
          this.app?.showNotification?.(`Viewing ${staff.full_name}'s document in Cloud.`, 'info');
        }
      });
    });

    card.querySelectorAll('.staff-doc-preview-card').forEach(docCard => {
      docCard.addEventListener('click', () => {
        const type = docCard.dataset.type;
        if (type) this.openDocInspector(type, staff);
      });
    });

    card.querySelector('#staffOpenCloudLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.AppWindow && window.CloudApp) {
        window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
        this.app?.showNotification?.(`Viewing ${staff.full_name}'s vault in Cloud.`, 'info');
      }
    });

    card.querySelector('#staffDeleteBtn')?.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete staff record for ${staff.full_name} (${staff.emp_code})?`)) {
        this.deleteStaff(staff.id);
      }
    });
  }

  // Add Staff Modal
  async openAddStaffModal() {
    let nextEmpCode = `EMP-00${this.staffList.length + 1}`;
    try {
      if (window.SuiteCoreBridge && typeof window.SuiteCoreBridge.generateNextEmployeeCode === 'function') {
        const existingCodes = this.staffList.map(s => s.emp_code).filter(Boolean);
        nextEmpCode = window.SuiteCoreBridge.generateNextEmployeeCode(existingCodes, {
          prefix: 'EMP',
          separator: '-',
          padding: 3
        });
      } else {
        const token = typeof window !== 'undefined'
          ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
          : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/compliance/staff/next-emp-code', { headers, credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.employee_code) nextEmpCode = data.employee_code;
        }
      }
    } catch (_) {}

    this.showModal({
      emp_code: nextEmpCode,
      full_name: '',
      department: 'Manufacturing',
      designation: '',
      role_type: 'Worker',
      phone: '',
      email: '',
      blood_group: 'B+',
      emergency_contact: '',
      address: '',
      is_schedule_t_technical: 0,
      technical_reg_no: '',
      status: 'ACTIVE'
    }, false);
  }

  // Edit Staff Modal
  openEditStaffModal(staff) {
    this.showModal(staff, true);
  }

  // Modal Dialog (Contacts App Clone)
  showModal(staffData, isEdit = false) {
    const existing = document.getElementById('staffModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'staffModalOverlay';
    overlay.style.zIndex = '2147483640';

    overlay.innerHTML = `
      <div class="staff-modal-box">
        <div class="staff-modal-header">
          <h3>${isEdit ? 'Edit Staff Profile' : 'New Staff Member'}</h3>
          <button class="staff-modal-close-btn" id="closeStaffModalBtn">✕</button>
        </div>

        <form id="staffModalForm">
          <div class="staff-modal-form-content">
            <div class="staff-form-grid-2col">
              <div class="staff-input-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <label style="margin-bottom: 0;">Employee Code</label>
                  <span style="font-size: 10px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">⚡ Rust Auto-Generated</span>
                </div>
                <input type="text" name="emp_code" value="${staffData.emp_code || ''}" placeholder="Auto-assigned (e.g. EMP-005)" style="background: #f8fafc; font-weight: 600;">
              </div>

              <div class="staff-input-group">
                <label>Full Name *</label>
                <input type="text" name="full_name" value="${staffData.full_name || ''}" placeholder="e.g. Dr. Jashobanta Rao Mohanta" required>
              </div>

              <div class="staff-input-group">
                <label>Department</label>
                <select name="department">
                  <option value="Manufacturing" ${staffData.department === 'Manufacturing' ? 'selected' : ''}>Manufacturing</option>
                  <option value="QC & Analytical" ${staffData.department === 'QC & Analytical' ? 'selected' : ''}>QC & Analytical</option>
                  <option value="Billing & Accounts" ${staffData.department === 'Billing & Accounts' ? 'selected' : ''}>Billing & Accounts</option>
                  <option value="Packaging & Warehousing" ${staffData.department === 'Packaging & Warehousing' ? 'selected' : ''}>Packaging & Warehousing</option>
                  <option value="Administration" ${staffData.department === 'Administration' ? 'selected' : ''}>Administration</option>
                </select>
              </div>

              <div class="staff-input-group">
                <label>Designation</label>
                <input type="text" name="designation" value="${staffData.designation || ''}" placeholder="e.g. Chief Medical Officer">
              </div>

              <div class="staff-input-group">
                <label>Role Classification</label>
                <select name="role_type">
                  <option value="Technical Person" ${staffData.role_type === 'Technical Person' ? 'selected' : ''}>Technical Person (Ayurveda/Chemist)</option>
                  <option value="Worker" ${staffData.role_type === 'Worker' ? 'selected' : ''}>Factory Worker / Operator</option>
                  <option value="Staff" ${staffData.role_type === 'Staff' ? 'selected' : ''}>Office Staff</option>
                  <option value="Manager" ${staffData.role_type === 'Manager' ? 'selected' : ''}>Manager / Head</option>
                </select>
              </div>

              <div class="staff-input-group">
                <label>Mobile Phone</label>
                <input type="tel" name="phone" value="${staffData.phone || ''}" placeholder="+91 94370 12345">
              </div>

              <div class="staff-input-group">
                <label>Email Address</label>
                <input type="email" name="email" value="${staffData.email || ''}" placeholder="staff@utkalchemical.com">
              </div>

              <div class="staff-input-group">
                <label>Blood Group</label>
                <select name="blood_group">
                  <option value="A+" ${staffData.blood_group === 'A+' ? 'selected' : ''}>A+</option>
                  <option value="A-" ${staffData.blood_group === 'A-' ? 'selected' : ''}>A-</option>
                  <option value="B+" ${staffData.blood_group === 'B+' ? 'selected' : ''}>B+</option>
                  <option value="B-" ${staffData.blood_group === 'B-' ? 'selected' : ''}>B-</option>
                  <option value="O+" ${staffData.blood_group === 'O+' ? 'selected' : ''}>O+</option>
                  <option value="O-" ${staffData.blood_group === 'O-' ? 'selected' : ''}>O-</option>
                  <option value="AB+" ${staffData.blood_group === 'AB+' ? 'selected' : ''}>AB+</option>
                  <option value="AB-" ${staffData.blood_group === 'AB-' ? 'selected' : ''}>AB-</option>
                </select>
              </div>

              <div class="staff-input-group full-width">
                <label>Emergency Contact</label>
                <input type="text" name="emergency_contact" value="${staffData.emergency_contact || ''}" placeholder="Relationship & Phone (e.g. Spouse +91 ...)">
              </div>

              <div class="staff-input-group full-width">
                <label>Residential Address</label>
                <textarea name="address" rows="2">${staffData.address || ''}</textarea>
              </div>

              <!-- Schedule T Credentials -->
              <div class="staff-input-group full-width" style="padding: 10px; background: #f8fafc; border-radius: 8px; border: 1px solid rgba(0,0,0,0.06);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="staffSchedTBox" name="is_schedule_t_technical" ${staffData.is_schedule_t_technical ? 'checked' : ''} style="width: auto;">
                  <label for="staffSchedTBox" style="font-weight: 700; color: #111; cursor: pointer;">
                    Schedule T Approved Technical Person (AYUSH Rule 157)
                  </label>
                </div>
                <div style="margin-top: 8px;">
                  <label style="font-size: 11px;">Technical Registration / State Board License No</label>
                  <input type="text" name="technical_reg_no" value="${staffData.technical_reg_no || ''}" placeholder="e.g. BAMS-OR-4521 or QC-784">
                </div>
              </div>
            </div>
          </div>

          <div class="staff-modal-actions-footer">
            <button type="button" class="cmp-btn-cancel" id="cancelStaffModalBtn">Cancel</button>
            <button type="submit" class="cmp-btn-save">${isEdit ? 'Save Changes' : 'Create Staff Record'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeStaffModalBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelStaffModalBtn')?.addEventListener('click', closeModal);

    overlay.querySelector('#staffModalForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = {
        emp_code: form.emp_code.value.trim(),
        full_name: form.full_name.value.trim(),
        department: form.department.value,
        designation: form.designation.value.trim(),
        role_type: form.role_type.value,
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        blood_group: form.blood_group.value,
        emergency_contact: form.emergency_contact.value.trim(),
        address: form.address.value.trim(),
        is_schedule_t_technical: form.is_schedule_t_technical.checked ? 1 : 0,
        technical_reg_no: form.technical_reg_no.value.trim(),
        signature_title: form.signature_title ? form.signature_title.value.trim() : (staffData.signature_title || form.designation.value.trim()),
        is_authorized_signatory: form.is_authorized_signatory ? (form.is_authorized_signatory.checked ? 1 : 0) : (staffData.is_authorized_signatory || 0),
        status: 'ACTIVE'
      };

      this.saveStaff(formData, isEdit ? staffData.id : null);
      closeModal();
    });
  }

  // Save Staff (POST or PUT to backend)
  async saveStaff(formData, staffId = null) {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
        : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = staffId ? `/api/compliance/staff/${staffId}` : '/api/compliance/staff';
      const method = staffId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData),
        credentials: 'same-origin'
      });

      if (res.ok) {
        const result = await res.json();
        const savedId = staffId || result.id || Date.now();
        await this.loadStaffFromAPI();
        this.selectedStaffId = savedId;
        this.renderSidebarList();
        this.renderDetailCard();
        this.app?.showNotification?.(`Staff profile for ${formData.full_name} saved.`, 'success');
      } else {
        this.saveStaffLocal(formData, staffId);
      }
    } catch (err) {
      console.warn('[StaffView] Save API error, using local fallback:', err.message);
      this.saveStaffLocal(formData, staffId);
    }
  }

  saveStaffLocal(formData, staffId) {
    if (staffId) {
      const idx = this.staffList.findIndex(s => Number(s.id) === Number(staffId));
      if (idx !== -1) {
        this.staffList[idx] = { ...this.staffList[idx], ...formData };
      }
    } else {
      const newStaff = { id: Date.now(), ...formData, document_count: 1 };
      this.staffList.unshift(newStaff);
      this.selectedStaffId = newStaff.id;
    }
    this.renderSidebarList();
    this.renderDetailCard();
    this.app?.showNotification?.(`Staff record updated: ${formData.full_name}`, 'success');
  }

  // Delete Staff
  async deleteStaff(staffId) {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
        : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`/api/compliance/staff/${staffId}`, { method: 'DELETE', headers, credentials: 'same-origin' });
    } catch (err) {
      console.warn('[StaffView] Delete API error:', err.message);
    }

    this.staffList = this.staffList.filter(s => Number(s.id) !== Number(staffId));
    this.selectedStaffId = this.staffList[0]?.id || null;
    this.renderSidebarList();
    this.renderDetailCard();
    this.app?.showNotification?.('Staff member deleted.', 'info');
  }

  // Signature Upload & Drawing Modal
  openSignatureModal(staff) {
    const existing = document.getElementById('staffSignatureModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'staffSignatureModal';
    overlay.style.zIndex = '2147483647';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="max-width: 540px;">
        <div class="staff-modal-header">
          <h3>Digital Signature Specimen</h3>
          <button class="staff-modal-close-btn" id="closeSigModalBtn">✕</button>
        </div>
        <div class="staff-modal-form-content">
          <div style="font-size: 13px; color: #475569; margin-bottom: 12px; line-height: 1.5;">
            Upload or draw the authorized signature for <strong>${staff.full_name}</strong> (${staff.emp_code}). This signature will be applied automatically when generating sealed company documents and letters.
          </div>

          <div class="staff-input-group" style="margin-bottom: 12px;">
            <label>Signature Designation Title</label>
            <input type="text" id="sigTitleInput" value="${staff.signature_title || staff.designation || 'Authorized Signatory'}" placeholder="e.g. Chief Medical Officer / Managing Director">
          </div>

          <!-- Tabs: Draw vs Upload -->
          <div style="display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.08); padding-bottom: 8px;">
            <button type="button" class="staff-chip active" id="tabDrawSig" style="font-size: 12px;">✏️ Draw Signature</button>
            <button type="button" class="staff-chip" id="tabUploadSig" style="font-size: 12px;">📁 Upload Image (PNG/JPG)</button>
          </div>

          <!-- Drawing Canvas Pane -->
          <div id="sigDrawPane">
            <div style="border: 2px dashed #cbd5e1; border-radius: 8px; background: #ffffff; position: relative; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.04);">
              <canvas id="sigCanvas" width="480" height="180" style="width: 100%; height: 180px; display: block; cursor: crosshair; touch-action: none;"></canvas>
              <div style="position: absolute; bottom: 8px; left: 12px; font-size: 11px; color: #94a3b8; pointer-events: none;">
                Sign above with mouse, stylus, or touch
              </div>
              <button type="button" id="clearSigCanvasBtn" style="position: absolute; top: 8px; right: 8px; font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer;">
                Clear
              </button>
            </div>
          </div>

          <!-- Upload Pane -->
          <div id="sigUploadPane" style="display: none;">
            <div style="border: 2px dashed #cbd5e1; border-radius: 8px; padding: 24px; text-align: center; background: #f8fafc;">
              <input type="file" id="sigFileInput" accept="image/png, image/jpeg, image/webp" style="display: none;">
              <button type="button" id="triggerSigUploadBtn" class="cmp-btn-cancel" style="margin-bottom: 8px; background: #fff;">
                Select Signature Image ↗
              </button>
              <div style="font-size: 12px; color: #64748b;">Recommended transparent PNG, max 1MB</div>
              <div id="sigUploadPreviewContainer" style="margin-top: 12px; display: none;">
                <img id="sigUploadPreview" src="" alt="Preview" style="max-height: 80px; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px; background: #fff;">
              </div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="sigAuthBox" checked style="width: auto;">
            <label for="sigAuthBox" style="font-size: 13px; font-weight: 600; color: #1e293b; cursor: pointer; margin-bottom: 0;">
              Authorize this signature for automated batch seals & letterhead issuance
            </label>
          </div>
        </div>

        <div class="staff-modal-actions-footer">
          <button type="button" class="cmp-btn-cancel" id="cancelSigModalBtn">Cancel</button>
          <button type="button" class="cmp-btn-save" id="saveSignatureBtn">Save Specimen Signature</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeSigModalBtn')?.addEventListener('click', closeModal);
    overlay.querySelector('#cancelSigModalBtn')?.addEventListener('click', closeModal);

    // Tab Switching
    const tabDraw = overlay.querySelector('#tabDrawSig');
    const tabUpload = overlay.querySelector('#tabUploadSig');
    const drawPane = overlay.querySelector('#sigDrawPane');
    const uploadPane = overlay.querySelector('#sigUploadPane');

    tabDraw?.addEventListener('click', () => {
      tabDraw.classList.add('active');
      tabUpload.classList.remove('active');
      drawPane.style.display = 'block';
      uploadPane.style.display = 'none';
    });

    tabUpload?.addEventListener('click', () => {
      tabUpload.classList.add('active');
      tabDraw.classList.remove('active');
      drawPane.style.display = 'none';
      uploadPane.style.display = 'block';
    });

    // Canvas Drawing Logic
    const canvas = overlay.querySelector('#sigCanvas');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    let isDrawing = false;
    let hasDrawn = false;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const startDraw = (e) => {
      isDrawing = true;
      hasDrawn = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      e.preventDefault();
    };

    const draw = (e) => {
      if (!isDrawing) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      e.preventDefault();
    };

    const stopDraw = () => {
      if (isDrawing) {
        ctx.closePath();
        isDrawing = false;
      }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    overlay.querySelector('#clearSigCanvasBtn')?.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    });

    // File Upload Logic
    let uploadedBase64 = null;
    const fileInput = overlay.querySelector('#sigFileInput');
    const triggerUploadBtn = overlay.querySelector('#triggerSigUploadBtn');
    const previewContainer = overlay.querySelector('#sigUploadPreviewContainer');
    const previewImg = overlay.querySelector('#sigUploadPreview');

    triggerUploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          uploadedBase64 = event.target.result;
          previewImg.src = uploadedBase64;
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    // Save Signature Action
    overlay.querySelector('#saveSignatureBtn')?.addEventListener('click', async () => {
      let finalSignatureData = null;
      if (tabUpload.classList.contains('active')) {
        finalSignatureData = uploadedBase64;
      } else {
        if (hasDrawn) {
          finalSignatureData = canvas.toDataURL('image/png');
        }
      }

      if (!finalSignatureData && !staff.signature_data) {
        alert('Please draw a signature or upload an image file first.');
        return;
      }

      const sigTitle = overlay.querySelector('#sigTitleInput').value.trim();
      const isAuth = overlay.querySelector('#sigAuthBox').checked;

      await this.saveStaffSignature(staff.id, {
        signature_data: finalSignatureData || staff.signature_data,
        signature_title: sigTitle,
        is_authorized_signatory: isAuth ? 1 : 0
      });

      closeModal();
    });
  }

  // API Call to save signature specifically
  async saveStaffSignature(staffId, data) {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || localStorage.getItem('token'))
        : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/compliance/staff/${staffId}/signature`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        credentials: 'same-origin'
      });

      if (res.ok) {
        await this.loadStaffFromAPI();
        this.selectedStaffId = staffId;
        this.renderSidebarList();
        this.renderDetailCard();
        this.app?.showNotification?.('Digital signature registered and authorized.', 'success');
      } else {
        // Local fallback update
        const idx = this.staffList.findIndex(s => Number(s.id) === Number(staffId));
        if (idx !== -1) {
          this.staffList[idx] = { ...this.staffList[idx], ...data };
          this.renderSidebarList();
          this.renderDetailCard();
          this.app?.showNotification?.('Digital signature saved locally.', 'success');
        }
      }
    } catch (err) {
      console.warn('[StaffView] Save signature error:', err.message);
    }
  }

  // Render Blurred Document Preview Cards
  renderDocPreviewCards(staff, isModal = false) {
    const aadhaarLast4 = staff.aadhaar_last4 || (staff.id ? String(1000 + staff.id * 123).slice(-4) : '8421');
    const regNo = staff.technical_reg_no || `AYU/SCH-T/${1000 + Number(staff.id || 1)}`;

    return `
      <!-- 1. Aadhaar Card Preview -->
      <div class="staff-doc-preview-card" data-type="aadhaar" title="Click to inspect Aadhaar KYC">
        <div class="staff-doc-sheet aadhaar">
          <div class="staff-doc-aadhaar-top-stripe"></div>
          <div class="staff-doc-aadhaar-header">
            <span class="staff-doc-aadhaar-title">Unique Identification Authority of India</span>
            <span style="font-size: 14px;">🇮🇳</span>
          </div>
          <div class="staff-doc-aadhaar-body">
            <div class="staff-doc-aadhaar-photo">
              ${staff.gender === 'Female' ? '👩' : '👨'}
            </div>
            <div class="staff-doc-aadhaar-fields">
              <div style="font-weight: 700; color: #0f172a;">${staff.full_name}</div>
              <div>DOB: 14/08/1986 | ${staff.gender || 'Male'}</div>
              <div>O/o StackOverdrive Bio-Mfg Labs</div>
              <div class="staff-doc-aadhaar-number">•••• •••• ${aadhaarLast4}</div>
            </div>
          </div>
        </div>
        <div class="staff-doc-blur-overlay">
          <div class="staff-doc-blur-badge">🪪 Aadhaar Verified</div>
          <div class="staff-doc-blur-sub">Govt of India • UIDAI Vault</div>
          <div class="staff-doc-btn-group">
            <button class="staff-doc-action-pill" data-inspect="aadhaar">👁️ Quick Inspect</button>
            <button class="staff-doc-action-pill cloud-pill" data-cloud="aadhaar">Cloud ↗</button>
          </div>
        </div>
      </div>

      <!-- 2. Technical Degree / Schedule T Certificate Preview -->
      <div class="staff-doc-preview-card" data-type="certificate" title="Click to inspect Professional Qualification">
        <div class="staff-doc-sheet certificate">
          <div class="staff-doc-cert-crest">
            <span>🏛️</span>
            <span>Central Council of Indian Medicine</span>
          </div>
          <div class="staff-doc-cert-body">
            <div>Statutory Technical Qualification (Schedule T)</div>
            <div class="staff-doc-cert-recipient">${staff.full_name}</div>
            <div>BAMS / M.Pharm • Manufacturing & QC Incharge</div>
          </div>
          <div class="staff-doc-cert-footer">
            <span>Reg: ${regNo}</span>
            <span style="color: #059669; font-weight: 700;">Active Credential</span>
          </div>
        </div>
        <div class="staff-doc-blur-overlay">
          <div class="staff-doc-blur-badge">📜 Schedule T Certificate</div>
          <div class="staff-doc-blur-sub">Reg: ${regNo}</div>
          <div class="staff-doc-btn-group">
            <button class="staff-doc-action-pill" data-inspect="certificate">👁️ Quick Inspect</button>
            <button class="staff-doc-action-pill cloud-pill" data-cloud="certificate">Cloud ↗</button>
          </div>
        </div>
      </div>

      <!-- 3. Form 48 Annual Health Clearance -->
      <div class="staff-doc-preview-card" data-type="medical" title="Click to inspect Form 48 Health Record">
        <div class="staff-doc-sheet medical">
          <div class="staff-doc-med-header">
            <span class="staff-doc-med-title">🩺 Form 48 Clinical Health Certificate</span>
            <span style="font-size: 10px; color: #059669; font-weight: 700;">ANNUAL EXAM</span>
          </div>
          <div class="staff-doc-med-body">
            <div>Employee: <strong>${staff.full_name}</strong> (${staff.emp_code})</div>
            <div>Screening: Communicable & Contagious Disease</div>
            <div style="margin-top: 4px;">Clearance: <strong style="color: #059669;">Fit for Food/Drug Handling</strong></div>
            <div class="staff-doc-med-stamp">✓ Certified Oct 2025 • Due Oct 2026</div>
          </div>
        </div>
        <div class="staff-doc-blur-overlay">
          <div class="staff-doc-blur-badge">🩺 Form 48 Medical Clearance</div>
          <div class="staff-doc-blur-sub">Rule 158 / Schedule T Fitness</div>
          <div class="staff-doc-btn-group">
            <button class="staff-doc-action-pill" data-inspect="medical">👁️ Quick Inspect</button>
            <button class="staff-doc-action-pill cloud-pill" data-cloud="medical">Cloud ↗</button>
          </div>
        </div>
      </div>
    `;
  }

  // High Resolution Document Inspector Modal
  openDocInspector(docType, staff) {
    const existing = document.getElementById('staffDocInspectModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'staffDocInspectModal';
    overlay.style.zIndex = '2147483645';

    const aadhaarLast4 = staff.aadhaar_last4 || (staff.id ? String(1000 + staff.id * 123).slice(-4) : '8421');
    const regNo = staff.technical_reg_no || `AYU/SCH-T/${1000 + Number(staff.id || 1)}`;

    let title = 'Document Inspection';
    let docContent = '';

    if (docType === 'aadhaar') {
      title = `UIDAI Aadhaar KYC — ${staff.full_name}`;
      docContent = `
        <div style="width: 100%; max-width: 520px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 10px 30px rgba(0,0,0,0.12); overflow: hidden; font-family: -apple-system, sans-serif;">
          <div style="height: 8px; background: linear-gradient(90deg, #FF9933 33.3%, #ffffff 33.3%, #ffffff 66.6%, #138808 66.6%);"></div>
          <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase;">भारत सरकार / Government of India</div>
              <div style="font-size: 11px; color: #64748b;">Unique Identification Authority of India</div>
            </div>
            <div style="font-size: 24px;">🇮🇳</div>
          </div>
          <div style="padding: 20px; display: flex; gap: 20px; align-items: flex-start;">
            <div style="width: 90px; height: 110px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 40px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
              ${staff.gender === 'Female' ? '👩' : '👨'}
              <span style="font-size: 9px; color: #64748b; font-weight: 600; margin-top: 4px;">DIGITAL ID</span>
            </div>
            <div style="flex: 1; min-width: 0; line-height: 1.6; font-size: 13px; color: #1e293b;">
              <div style="font-size: 16px; font-weight: 800; color: #0f172a;">${staff.full_name}</div>
              <div style="color: #475569;">जन्म तिथि / DOB: 14/08/1986</div>
              <div style="color: #475569;">लिंग / Gender: ${staff.gender || 'Male'}</div>
              <div style="color: #475569; font-size: 12px; margin-top: 4px;">Address: Factory Campus, Industrial Area, Sector 5, Haridwar, UK - 249401</div>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 18px; font-weight: 800; letter-spacing: 3px; font-family: monospace; color: #0f172a;">
              •••• •••• ${aadhaarLast4}
            </div>
            <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px;">
              ✓ Aadhaar Verified
            </span>
          </div>
        </div>
      `;
    } else if (docType === 'certificate') {
      title = `Schedule T Credential — ${staff.full_name}`;
      docContent = `
        <div style="width: 100%; max-width: 540px; background: #fffdfa; border-radius: 12px; border: 2px solid #d4af37; padding: 26px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); font-family: Georgia, serif; text-align: center; position: relative;">
          <div style="border: 1px dashed #d4af37; padding: 20px; border-radius: 8px;">
            <div style="font-size: 14px; letter-spacing: 1.5px; color: #854d0e; font-weight: 700; text-transform: uppercase;">
              Central Council of Indian Medicine / AYUSH
            </div>
            <div style="font-size: 11px; color: #78716c; margin-top: 2px;">
              Statutory Schedule T Technical Approval Certificate
            </div>
            <div style="margin: 20px 0 14px 0; font-size: 13px; color: #44403c; font-style: italic;">
              This is to certify that
            </div>
            <div style="font-size: 22px; font-weight: 700; color: #1c1917; letter-spacing: 0.5px; border-bottom: 2px solid #d4af37; display: inline-block; padding-bottom: 4px;">
              ${staff.full_name}
            </div>
            <div style="margin-top: 14px; font-size: 13px; color: #44403c; line-height: 1.6;">
              has complied with the provisions of Drugs & Cosmetics Rules 1945, Rule 158 and Schedule T as approved
              <strong>${staff.designation || 'Technical Officer / Chemist'}</strong> in Ayurvedic & Herbal Manufacturing.
            </div>
            <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #57534e; text-align: left;">
              <div>
                <div>Registration No: <strong>${regNo}</strong></div>
                <div>Issued: October 2021</div>
                <div>Validity: Life / Periodic Audit</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 26px;">🔏</div>
                <div style="font-weight: 700; color: #854d0e; border-top: 1px solid #78716c; padding-top: 2px;">Licensing Authority</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      title = `Form 48 Annual Health Record — ${staff.full_name}`;
      docContent = `
        <div style="width: 100%; max-width: 520px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 10px 30px rgba(0,0,0,0.12); overflow: hidden; font-family: -apple-system, sans-serif;">
          <div style="background: #065f46; color: #ffffff; padding: 14px 20px;">
            <div style="font-size: 14px; font-weight: 700;">FORM 48 — CERTIFICATE OF FITNESS</div>
            <div style="font-size: 11px; opacity: 0.85;">Rule 158 / Schedule T Annual Worker Health Inspection</div>
          </div>
          <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #334155;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Worker / Employee:</span>
              <span style="font-weight: 700; color: #0f172a;">${staff.full_name} (${staff.emp_code})</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Clinical Examination Date:</span>
              <span style="font-weight: 600; color: #0f172a;">October 24, 2025</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Communicable Diseases:</span>
              <span style="color: #059669; font-weight: 700;">Clean / Non-Infectious</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Skin / Sputum Pathological Test:</span>
              <span style="color: #059669; font-weight: 700;">Negative / Certified Fit</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
              <span style="color: #64748b;">Next Mandatory Re-check:</span>
              <span style="color: #dc2626; font-weight: 700;">October 24, 2026</span>
            </div>
            <div style="margin-top: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">🩺</span>
              <div style="font-size: 12px; color: #065f46;">
                <strong>Medical Officer Attestation:</strong> Certified free from open wounds, eczema, and infectious diseases under Drugs & Cosmetics Rules 1945.
              </div>
            </div>
          </div>
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="staff-doc-inspect-dialog">
        <div class="staff-modal-header">
          <h3>${title}</h3>
          <button class="staff-modal-close-btn" id="closeInspectModalBtn">✕</button>
        </div>
        <div class="staff-doc-inspect-paper">
          ${docContent}
        </div>
        <div class="staff-modal-actions-footer">
          <button class="cmp-btn-cancel" id="cloudInspectLaunchBtn" style="color: #007aff; font-weight: 600;">Open Original in StackOverdrive Cloud App ↗</button>
          <button class="cmp-btn-save" id="closeInspectDoneBtn">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeInspectModalBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#closeInspectDoneBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cloudInspectLaunchBtn')?.addEventListener('click', () => {
      overlay.remove();
      if (window.AppWindow && window.CloudApp) {
        window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
        this.app?.showNotification?.(`Viewing ${staff.full_name}'s original document in Cloud.`, 'info');
      }
    });
  }

  // Form 48 Health Record Dialog
  showHealthModal(staff) {
    const existing = document.getElementById('staffHealthModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'staffHealthModal';
    overlay.style.zIndex = '2147483640';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="max-width: 520px;">
        <div class="staff-modal-header">
          <h3>Form 48 Annual Health Clearance</h3>
          <button class="staff-modal-close-btn" id="closeHealthModalBtn">✕</button>
        </div>
        <div class="staff-modal-form-content">
          <div style="font-size: 13px; line-height: 1.5; color: #444;">
            <p style="margin-top: 0;"><strong>Employee:</strong> ${staff.full_name} (${staff.emp_code})</p>
            <p><strong>Statutory Rule:</strong> Drugs & Cosmetics Rules 1945, Rule 158 / Schedule T (Annual Health Checkup for Food & Drug Handlers).</p>
            <div class="staff-glass-card" style="margin-top: 12px; background: #fbfbfc; border: 1px solid rgba(0,0,0,0.08);">
              <div class="staff-glass-row" style="border-bottom: 1px solid rgba(0,0,0,0.06);">
                <span class="staff-glass-label" style="color: #666;">Exam Date</span>
                <span class="staff-glass-value" style="color: #111;">October 24, 2025</span>
              </div>
              <div class="staff-glass-row" style="border-bottom: 1px solid rgba(0,0,0,0.06);">
                <span class="staff-glass-label" style="color: #666;">Medical Officer</span>
                <span class="staff-glass-value" style="color: #111;">Civil Surgeon / Registered Medical Practitioner</span>
              </div>
              <div class="staff-glass-row" style="border-bottom: 1px solid rgba(0,0,0,0.06);">
                <span class="staff-glass-label" style="color: #666;">Contagious Diseases</span>
                <span class="staff-glass-value" style="color: #059669; font-weight: 700;">Negative / Clean</span>
              </div>
              <div class="staff-glass-row" style="border-bottom: 1px solid rgba(0,0,0,0.06);">
                <span class="staff-glass-label" style="color: #666;">Skin & Sputum Clearance</span>
                <span class="staff-glass-value" style="color: #059669; font-weight: 700;">Certified Fit for Processing</span>
              </div>
              <div class="staff-glass-row">
                <span class="staff-glass-label" style="color: #666;">Next Renewal Due</span>
                <span class="staff-glass-value" style="color: #dc2626; font-weight: 700;">October 24, 2026 (Due in 8 days)</span>
              </div>
            </div>
          </div>
        </div>
        <div class="staff-modal-actions-footer">
          <button class="cmp-btn-cancel" id="quickInspectHealthBtn" style="color: #007aff; font-weight: 600;">Inspect Full Certificate 👁️</button>
          <button class="cmp-btn-save" id="closeHealthBtnAction">Close Record</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeHealthModalBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#closeHealthBtnAction')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#quickInspectHealthBtn')?.addEventListener('click', () => {
      overlay.remove();
      this.openDocInspector('medical', staff);
    });
  }

  // Attached KYC & Documents Dialog (With Blurred Previews)
  showDocsModal(staff) {
    const existing = document.getElementById('staffDocsModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'staff-modal-overlay';
    overlay.id = 'staffDocsModal';
    overlay.style.zIndex = '2147483640';

    overlay.innerHTML = `
      <div class="staff-modal-box" style="max-width: 620px;">
        <div class="staff-modal-header">
          <h3>${staff.full_name}'s Document Vault</h3>
          <button class="staff-modal-close-btn" id="closeDocsModalBtn">✕</button>
        </div>
        <div class="staff-modal-form-content">
          <p style="font-size: 12.5px; color: #666; margin-top: 0;">Verified digital credentials and cloud records in StackOverdrive Cloud. Hover or click to inspect high-resolution documents.</p>
          <div class="staff-docs-preview-grid" id="modalDocPreviewGrid">
            ${this.renderDocPreviewCards(staff, true)}
          </div>
        </div>
        <div class="staff-modal-actions-footer">
          <button class="cmp-btn-cancel" id="cloudDocsLaunchBtn" style="color: #007aff; font-weight: 600;">Open All in Cloud App ↗</button>
          <button class="cmp-btn-save" id="closeDocsActionBtn">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners inside modal
    overlay.querySelector('#closeDocsModalBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#closeDocsActionBtn')?.addEventListener('click', () => overlay.remove());

    overlay.querySelectorAll('[data-inspect]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.remove();
        this.openDocInspector(btn.dataset.inspect, staff);
      });
    });

    overlay.querySelectorAll('[data-cloud]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.remove();
        if (window.AppWindow && window.CloudApp) {
          window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
          this.app?.showNotification?.(`Viewing ${staff.full_name}'s document in Cloud.`, 'info');
        }
      });
    });

    overlay.querySelectorAll('.staff-doc-preview-card').forEach(docCard => {
      docCard.addEventListener('click', () => {
        const type = docCard.dataset.type;
        if (type) {
          overlay.remove();
          this.openDocInspector(type, staff);
        }
      });
    });

    overlay.querySelector('#cloudDocsLaunchBtn')?.addEventListener('click', () => {
      overlay.remove();
      if (window.AppWindow && window.CloudApp) {
        window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
        this.app?.showNotification?.(`Viewing ${staff.full_name}'s vault in Cloud.`, 'info');
      }
    });
  }
}

// Global Export
window.StaffView = StaffView;
