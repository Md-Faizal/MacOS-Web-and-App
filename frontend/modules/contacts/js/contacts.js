const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Contacts') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * ContactsApp - A macOS Contacts application with detailed contact management
 * Features: Contact list, detailed contact cards, search, add/edit contacts with business info
 * Now connected to backend API
 */

import { renderWorkerBadge } from '/shared/worker-badges.js';

class ContactsApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const width = window.innerWidth;
    let config = { appId: 'contacts', appName: 'Contacts', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    // Try to use backend API, fallback to localStorage if not available
    this.apiUrl = '/api/contacts';
    this.useAPI = true;
    this.contacts = [];
    this.selectedContactId = null;
    this.editingContactId = null;
    this.setupContactsUI();
    this.loadContactsFromAPI();
  }

  setupContactsUI() {
    // Inject contacts-specific styles
    this.injectContactsStyles();

    // Build the contacts UI
    this.buildContactsLayout();

    // Add custom header controls
    this.setupHeaderControls();

    // Setup contacts-specific event listeners
    this.setupContactsEventListeners();

    // Render initial state
    this.renderContactsList();

    // Store reference for home.html
    window.currentContactsApp = this;
  }

  buildContactsLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <!-- Contacts Sidebar -->
      <div class="contacts-sidebar">
        <div id="contactsList"></div>
        <div class="contacts-sidebar-footer">
          <button class="refresh-btn" id="contactsRefreshBtn" title="Refresh contacts from database">↻</button>
        </div>
      </div>

      <!-- Contact Card -->
      <div class="contacts-card-container" id="contactCardContainer">
        <div class="contact-empty-state">
          <div class="contact-empty-state-icon">📇</div>
          <div class="contact-empty-state-text">No contact selected</div>
        </div>
      </div>
    `;

    // Setup element references
    this.sidebar = contentArea.querySelector('.contacts-sidebar');
    this.contactsList = contentArea.querySelector('#contactsList');
    this.cardContainer = contentArea.querySelector('#contactCardContainer');
    
    // Search input will be set in setupHeaderControls
    this.searchInput = null;
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (after traffic lights)
    const leftControls = document.createElement('div');
    leftControls.className = 'contacts-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'contacts-header-btn';
    expandBtn.id = 'expandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(expandBtn);
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    
    // Create right controls group (replace title-spacer)
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'contacts-header-controls';
    
    // Create buttons container (Edit, Add)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'contacts-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="contacts-header-btn edit-btn-text" id="editBtn" title="Edit Contact">Edit</button>
      <button class="contacts-header-btn" id="addBtn" title="Add Contact">+</button>
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'contacts-header-search';
    searchInput.id = 'headerSearch';
    searchInput.placeholder = 'Search';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);
    
    // Replace spacer with right controls
    spacer.parentNode.replaceChild(rightControls, spacer);
    
    // Store search input reference
    this.searchInput = searchInput;
  }

  setupContactsEventListeners() {
    // Search functionality from header
    this.searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.renderContactsList(query);
    });

    // Expand button - toggle sidebar visibility with animation
    const expandBtn = document.getElementById('expandBtn');
    expandBtn?.addEventListener('click', () => {
      this.sidebar.classList.toggle('hidden');
    });

    // Edit button
    const editBtn = document.getElementById('editBtn');
    editBtn?.addEventListener('click', () => {
      if (this.selectedContactId) {
        this.openEditContactModal();
      } else {
        alert('Please select a contact to edit');
      }
    });

    // Add button
    const addBtn = document.getElementById('addBtn');
    addBtn?.addEventListener('click', () => {
      this.openAddContactModal();
    });

    // Refresh button - reload contacts from database
    const refreshBtn = this.sidebar ? this.sidebar.querySelector('#contactsRefreshBtn') : document.getElementById('contactsRefreshBtn');
    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.style.opacity = '0.5';
      refreshBtn.style.cursor = 'wait';
      try {
        await this.loadContactsFromAPI();
        if (this.selectedContactId) {
          const stillExists = this.contacts.some(c => c.id === this.selectedContactId);
          if (stillExists) {
            this.renderContactCard();
          }
        }
        this.showNotification('Contacts refreshed from database', 'success');
        log.debug('✓ Contacts refreshed from database');
      } catch (error) {
        log.error('Failed to refresh contacts:', error);
        this.showNotification('Failed to refresh contacts', 'error');
      } finally {
        refreshBtn.style.opacity = '1';
        refreshBtn.style.cursor = 'pointer';
      }
    });

    // Listen for worker badge visibility toggle
    window.addEventListener('worker-badges-toggle-changed', () => {
      this.renderContactsList(this.searchInput?.value?.toLowerCase() || '');
      if (this.selectedContactId) {
        this.renderContactCard();
      }
    });
  }

  renderContactsList(searchQuery = '') {
    this.contactsList.innerHTML = '';

    let filteredContacts = this.contacts;
    if (searchQuery) {
      filteredContacts = this.contacts.filter(contact =>
        contact.name.toLowerCase().includes(searchQuery) ||
        contact.email?.toLowerCase().includes(searchQuery) ||
        contact.phone?.includes(searchQuery)
      );
    }

    // Group contacts by first letter
    const grouped = {};
    filteredContacts.forEach(contact => {
      const letter = contact.name.charAt(0).toUpperCase();
      if (!grouped[letter]) {
        grouped[letter] = [];
      }
      grouped[letter].push(contact);
    });

    // Render grouped contacts
    Object.keys(grouped).sort().forEach(letter => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="contacts-section-title">${letter}</div>`;
      this.contactsList.appendChild(section);

      grouped[letter].forEach(contact => {
        const item = document.createElement('button');
        item.className = 'contacts-list-item';
        const auditInfo = JSON.stringify({
          type: 'Contact',
          id: contact.id,
          name: contact.name,
          created_by_role: contact.created_by_role,
          created_by_name: contact.created_by_name,
          last_edited_by_role: contact.last_edited_by_role,
          last_edited_by_name: contact.last_edited_by_name,
          created_at: contact.creationDate,
          last_activity: contact.lastActivity
        });
        item.setAttribute('data-worker-audit', auditInfo);
        item.setAttribute('data-contact-id', contact.id);
        if (this.selectedContactId === contact.id) {
          item.classList.add('active');
        }

        const initials = this.getInitials(contact.name);
        const activeIndicator = contact.active === 'ACTIVE' 
          ? '<span class="contacts-list-active-badge" style="color: #8bc34a;">●</span>'
          : '<span class="contacts-list-active-badge" style="color: #dc2626;">●</span>';
        
        const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge)
          ? window.renderWorkerBadge(contact, { compact: true })
          : '';

        item.innerHTML = `
          <div class="contacts-avatar" style="background: ${contact.color};">
            ${initials}
          </div>
          <span style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${contact.name}</span>
            ${workerBadgeHtml}
          </span>
          ${activeIndicator}
        `;

        item.addEventListener('click', () => {
          this.selectContact(contact.id);
        });

        this.contactsList.appendChild(item);
      });
    });
  }

  selectContact(contactId) {
    this.selectedContactId = contactId;

    // Update active state
    document.querySelectorAll('.contacts-list-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Find and highlight the active contact in the list
    const activeItem = document.querySelector(`.contacts-list-item[data-contact-id="${contactId}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

    // Render contact card
    this.renderContactCard();
  }

  renderContactCard() {
    const contact = this.contacts.find(c => c.id === this.selectedContactId);
    if (!contact) return;

    const initials = this.getInitials(contact.name);

    const card = document.createElement('div');
    card.className = 'contacts-card';

    const creationDate = contact.creationDate ? new Date(contact.creationDate).toLocaleDateString() : 'N/A';
    const totalSales = this.formatCurrency(contact.totalSales);
    const avgSales = this.formatCurrency(contact.avgSales);
    const lastActivityDate = contact.lastActivity ? new Date(contact.lastActivity).toLocaleDateString() : 'N/A';
    const activeStatus = contact.active === 'ACTIVE' ? '◆ ACTIVE' : '◇ INACTIVE';
    const activeStatusColor = contact.active === 'ACTIVE' ? '#8bc34a' : '#dc2626';
    const activeStatusBg = contact.active === 'ACTIVE' ? '#d1fae5' : '#fee2e2';
    // Helper function to safely render a row only if the value exists and is not just whitespace
    const renderRow = (label, value, isLink = false) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return `
          <div class="contact-info-row-new">
            <span class="contact-info-label-new">${label}</span>
            <span class="contact-info-value-new ${isLink ? 'contact-info-value-link' : ''}">${value}</span>
          </div>
        `;
      }
      return '';
    };

    // Apply dynamic background to the container
    if (this.cardContainer) {
      this.cardContainer.style.background = `linear-gradient(135deg, ${contact.color} 0%, ${this.adjustColor(contact.color, -20)} 50%, ${this.adjustColor(contact.color, -40)} 100%)`;
      this.cardContainer.style.transition = 'background 0.5s ease';
    }

    const workerBadgeDetail = (!this.isWorkerUser() && window.renderWorkerBadge)
      ? window.renderWorkerBadge(contact, { compact: false })
      : '';

    const auditInfo = JSON.stringify({
      type: 'Contact',
      id: contact.id,
      name: contact.name,
      created_by_role: contact.created_by_role,
      created_by_name: contact.created_by_name,
      last_edited_by_role: contact.last_edited_by_role,
      last_edited_by_name: contact.last_edited_by_name,
      created_at: contact.creationDate,
      last_activity: contact.lastActivity
    });

    card.innerHTML = `
      <!-- Fixed Avatar Background -->
      <div class="contact-fixed-bg-avatar">
        <div class="contact-large-avatar" style="background: ${contact.color};">
          ${initials}
        </div>
      </div>

      <!-- Scrolling Content (moves over the fixed background) -->
      <div class="contact-details-scroll">
        
        <!-- Profile Header (Name & Actions) inside scroll area -->
        <div class="contact-profile-header" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
          <div class="contact-name" style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>${contact.name}</span>
            ${contact.excludeFromStats ? ' <span class="excluded-badge" title="Excluded from Statistics" style="font-size: 16px; vertical-align: middle;">🚫</span>' : ''}
            ${workerBadgeDetail}
          </div>
          <div class="contact-actions">
            <button class="contact-action-btn message-btn" title="Message (WhatsApp)" data-action="whatsapp">💬</button>
            <button class="contact-action-btn phone-btn" title="View Ledger" data-action="ledger">📄</button>
            <button class="contact-action-btn" title="Share Ledger" data-action="share-ledger" style="font-size: 14px;">🔗</button>
            ${!this.isWorkerUser() ? `<button class="contact-action-btn share-worker-btn" title="Share with Worker" data-action="share-worker" style="font-size: 14px;">👥</button>` : ''}
            <button class="contact-action-btn video-btn" title="New Bill" data-action="new-bill">🧾</button>
            <button class="contact-action-btn mail-btn" title="New Payment" data-action="new-payment">💰</button>
            <button class="contact-action-btn print-btn" title="Print Slip" data-action="print-slip">⎙</button>
          </div>
        </div>
        
        <!-- Photo & Poster Row -->
        <div class="contact-poster-row">
          <div class="contact-poster-content">
            <div class="contact-poster-mini-avatar" style="background: ${contact.color};">
              ${initials}
            </div>
            <span>Contact Photo & Poster</span>
          </div>
          <span class="contact-poster-arrow">›</span>
        </div>

        <!-- Basic Contact Info Container -->
        ${contact.phone || contact.email || contact.address ? `
        <div class="contact-info-card">
          ${renderRow('mobile', contact.phone)}
          ${renderRow('home', contact.email, true)}
          ${renderRow('address', contact.address)}
        </div>
        ` : ''}

        <!-- Business Information Container -->
        ${contact.gstin || contact.licenceNo || contact.pan ? `
          <div class="contact-section-header-new">Business Information</div>
          <div class="contact-info-card">
            ${renderRow('gstin', contact.gstin)}
            ${renderRow('licence no', contact.licenceNo)}
            ${renderRow('pan', contact.pan)}
          </div>
        ` : ''}

        <!-- Sales Information Container -->
        ${(contact.totalSales !== undefined && contact.totalSales !== null) || (contact.avgSales !== undefined && contact.avgSales !== null) || contact.favouriteProducts ? `
          <div class="contact-section-header-new">Sales Information</div>
          <div class="contact-info-card">
            ${renderRow('total sales', totalSales)}
            ${renderRow('avg sales', avgSales)}
            ${renderRow('favourite products', contact.favouriteProducts)}
          </div>
        ` : ''}

        <!-- Financial & additional info combined -->
        ${(contact.openingBalance !== undefined && contact.openingBalance !== null) || contact.transportPreference || contact.creationDate ? `
          <div class="contact-section-header-new">Additional Details</div>
          <div class="contact-info-card">
            ${renderRow('opening balance', this.formatCurrency(contact.openingBalance))}
            ${renderRow('transport', contact.transportPreference)}
            ${renderRow('created', creationDate)}
          </div>
        ` : ''}

        <!-- Status & Activity -->
        <div class="contact-section-header-new">Status</div>
        <div class="contact-info-card">
          <div class="contact-info-row-new">
            <span class="contact-info-label-new">status</span>
            <span class="contact-info-value-new" style="color: ${activeStatusColor}; font-weight: 600;">${activeStatus}</span>
          </div>
          ${renderRow('last activity', lastActivityDate)}
        </div>

        <!-- Notes -->
        ${contact.notes ? `
          <div class="contact-section-header-new">Notes</div>
          <div class="contact-info-card">
            <div class="contact-info-row-new">
              <span class="contact-info-value-new" style="text-align: left; margin-left: 0; line-height: 1.4;">${contact.notes}</span>
            </div>
          </div>
        ` : ''}

        <!-- Delete Button -->
        <div class="contact-delete-container">
          <button class="contact-delete-btn" data-contact-id="${contact.id}">🗑️ Delete Contact</button>
        </div>
      </div>
    `;

    this.cardContainer.innerHTML = '';
    this.cardContainer.appendChild(card);

    // Add delete button event listener
    const deleteBtn = card.querySelector('.contact-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteContact(this.selectedContactId));
    }

    // Add edit contact listener to Poster row
    const posterRow = card.querySelector('.contact-poster-row');
    if (posterRow) {
      posterRow.addEventListener('click', () => {
        this.openEditContactModal();
      });
    }

    // Add action buttons listeners
    card.querySelectorAll('.contact-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const contact = this.contacts.find(c => c.id === this.selectedContactId);
        
        switch(action) {
          case 'share-ledger':
               const token = contact.ledger_token || contact.ledgerToken || contact.token;
               const url = token ? `${window.location.origin}/ledger/${token}` : `${window.location.origin}/customer-ledger.html?id=${contact.id}`;
               
               const shareOptions = document.createElement('div');
               shareOptions.style.cssText = 'position: absolute; background: white; border: 1px solid black; padding: 8px; box-shadow: 4px 4px 0 rgba(0,0,0,1); z-index: 2147483647 !important; font-family: "Courier New", monospace;';
               shareOptions.innerHTML = `
                 <div style="margin-bottom: 8px; font-size: 12px; font-weight: bold;">Share Ledger Link:</div>
                 <button id="copyLinkBtn" style="display: block; width: 100%; margin-bottom: 4px; padding: 6px; font-size: 11px; cursor: pointer; background: white; border: 1px solid black;">📋 Copy Link</button>
                 <button id="waLinkBtn" style="display: block; width: 100%; padding: 6px; font-size: 11px; cursor: pointer; background: #25D366; color: white; border: 1px solid black;">💬 WhatsApp</button>
               `;
               
               const rect = btn.getBoundingClientRect();
               shareOptions.style.top = (rect.bottom + window.scrollY + 5) + 'px';
               shareOptions.style.left = (rect.left + window.scrollX) + 'px';
               
               document.body.appendChild(shareOptions);
               
               document.getElementById('copyLinkBtn').onclick = () => {
                 navigator.clipboard.writeText(url).then(() => {
                   alert('Ledger link copied to clipboard!');
                   if (document.body.contains(shareOptions)) document.body.removeChild(shareOptions);
                 });
               };
               
               document.getElementById('waLinkBtn').onclick = () => {
                  const msg = encodeURIComponent('Hello! You can view your bills, payments, and ledger balance here: ' + url);
                  window.open('https://wa.me/?text=' + msg, '_blank');
                  if (document.body.contains(shareOptions)) document.body.removeChild(shareOptions);
               };
               
               setTimeout(() => {
                 const closeFn = (ev) => {
                   if (!shareOptions.contains(ev.target)) {
                     if (document.body.contains(shareOptions)) document.body.removeChild(shareOptions);
                     document.removeEventListener('click', closeFn);
                   }
                 };
                 document.addEventListener('click', closeFn);
               }, 100);
            break;
          case 'share-worker':
            this.openShareContactModal(contact.id, contact.name);
            break;
          case 'ledger':
            if (window.appBar) {
              window.appBar.launchApp('billing', { view: 'ledger', customerId: contact.id, customerName: contact.name });
            }
            break;
          case 'new-bill':
            if (window.appBar) {
              window.appBar.launchApp('billing', { view: 'create', customerName: contact.name });
            }
            break;
          case 'new-payment':
            if (window.appBar) {
              window.appBar.launchApp('billing', { view: 'payment-credit', customerName: contact.name });
            }
            break;
          case 'whatsapp':
            if (contact.phone) {
              const cleanPhone = contact.phone.replace(/\D/g, '');
              window.open(`https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}`, '_blank');
            } else {
              alert('No phone number available for WhatsApp');
            }
            break;
          case 'print-slip':
            this.printSlip(contact.id);
            break;
        }
      });
    });

    // Add scroll animation for the avatar and glass effect
    const scrollContainer = card.querySelector('.contact-details-scroll');
    const bgAvatar = card.querySelector('.contact-fixed-bg-avatar .contact-large-avatar');
    
    if (scrollContainer && bgAvatar) {
      scrollContainer.addEventListener('scroll', () => {
        const scrollTop = scrollContainer.scrollTop;
        const maxScroll = 150; // Distance to complete animation
        const progress = Math.min(scrollTop / maxScroll, 1);
        
        // Transform Avatar: Shrink, move up, reduce opacity
        const scale = 1 - (progress * 0.25); // Keeps it larger (max shrink to 0.75)
        const translateY = -(progress * 20); 
        const opacity = 1 - (progress * 0.15); // Keeps it mostly visible (min opacity 0.85)
        
        bgAvatar.style.transform = `translateY(${translateY}px) scale(${scale})`;
        bgAvatar.style.opacity = opacity;
        
        // Animate Container: Add blur and faint overlay to push avatar to background
        if (scrollTop > 5) {
          scrollContainer.style.background = `rgba(0, 0, 0, ${progress * 0.05})`;
          scrollContainer.style.backdropFilter = `blur(${progress * 25}px)`;
          scrollContainer.style.webkitBackdropFilter = `blur(${progress * 25}px)`;
        } else {
          scrollContainer.style.background = 'transparent';
          scrollContainer.style.backdropFilter = 'none';
          scrollContainer.style.webkitBackdropFilter = 'none';
        }
      });
    }
  }

  adjustColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  getInitials(name) {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  }

  formatCurrency(amount) {
    if (!amount && amount !== 0) return 'N/A';
    const num = parseFloat(amount);
    if (isNaN(num)) return 'N/A';
    
    // Format number with Indian numbering system (e.g., 11,639 or 1,00,000)
    // Split into integer and decimal parts
    const [intPart, decPart] = num.toFixed(2).split('.');
    const intPartStr = intPart;
    
    // For Indian format: last 3 digits, then pairs of 2 from right
    let formatted = '';
    let count = 0;
    
    for (let i = intPartStr.length - 1; i >= 0; i--) {
      // Add comma after first 3 digits, then every 2 digits
      if (count === 3 || (count > 3 && (count - 3) % 2 === 0)) {
        formatted = ',' + formatted;
      }
      formatted = intPartStr[i] + formatted;
      count++;
    }
    
    return '₹' + formatted + '.' + decPart;
  }

  printSlip(contactId) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact) return;

    const fromName = "UTKAL CHEMICAL AUSHADHALAYA";
    const fromAddress = "Beside Sai Hospital Annex, Mirkamalpatna, Mangalabagh, 753001";
    const fromPhone = "7749089400";
    
    const toName = contact.name;
    const toAddress = contact.address || "No address provided";
    const toPhone = contact.phone || "";

    const slipHtml = `
      <div class="shipping-slip">
        <div class="slip-border">
          <div class="slip-header">SHIPPING SLIP</div>
          <div class="slip-grid">
            <div class="slip-to">
              <div class="slip-label">TO:</div>
              <div class="slip-value name">${toName}</div>
              <div class="slip-value address">${toAddress}</div>
              ${toPhone ? `<div class="slip-value">Ph: ${toPhone}</div>` : ''}
            </div>
            <div class="slip-from">
              <div class="slip-label">FROM:</div>
              <div class="slip-value name">${fromName}</div>
              <div class="slip-value">${fromAddress}</div>
              <div class="slip-value">Ph: ${fromPhone}</div>
            </div>
          </div>
        </div>
        <div class="cutting-line">
          <span>✂️</span>
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the shipping slip.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipping Slip - ${toName}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { 
              margin: 0; 
              padding: 0; 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background: #f0f0f0;
            }
            .print-container { 
              width: 210mm; 
              height: 297mm; 
              background: white;
              margin: 0 auto;
              position: relative;
            }
            .shipping-slip { 
              width: 100%; 
              height: 148.5mm; 
              padding: 10mm 15mm; 
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              position: relative;
            }
            .slip-border { 
              border: 4px solid #000; 
              width: 100%; 
              flex: 1;
              padding: 8mm 12mm; 
              box-sizing: border-box; 
              display: flex; 
              flex-direction: column;
              background: white;
            }
            .slip-header { 
              text-align: center; 
              font-size: 22pt; 
              font-weight: 900; 
              border-bottom: 4px solid #000; 
              margin-bottom: 6mm; 
              padding-bottom: 4mm;
              letter-spacing: 2px;
            }
            .slip-grid { 
              display: flex; 
              flex-direction: column; 
              gap: 4mm;
              flex: 1;
              justify-content: space-between;
            }
            .slip-to { 
              flex: 1;
              margin-bottom: 4mm;
            }
            .slip-from { 
              border-top: 1px solid #ddd; 
              padding-top: 5mm; 
            }
            .slip-label { 
              font-size: 12pt; 
              font-weight: bold; 
              color: #333; 
              margin-bottom: 2mm;
              text-decoration: underline;
            }
            .slip-value { 
              font-size: 15pt; 
              margin-bottom: 1mm; 
              line-height: 1.2;
            }
            .slip-value.name { 
              font-size: 22pt; 
              font-weight: 900; 
              margin-bottom: 3mm;
              text-transform: uppercase;
            }
            .slip-value.address {
              font-size: 16pt;
              word-wrap: break-word;
            }
            .cutting-line {
              position: absolute;
              bottom: 0;
              left: 5mm;
              right: 5mm;
              border-bottom: 2px dashed #000;
              text-align: center;
              height: 0;
            }
            .cutting-line span {
              position: absolute;
              top: -12pt;
              left: 50%;
              transform: translateX(-50%);
              background: white;
              padding: 0 10px;
              font-size: 18pt;
            }

            @media print {
              body { background: white; }
              .print-container { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${slipHtml}
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }



  injectContactsStyles() {
    if (document.getElementById('contacts-app-styles')) return;

    const link = document.createElement('link');
    link.id = 'contacts-app-styles';
    link.rel = 'stylesheet';
    link.href = '/modules/contacts/css/contacts.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }

  loadContactsFromAPI() {
    const normalizeContactsPayload = (payload, fallback = []) => {
      if (Array.isArray(payload)) return payload;
      if (!payload) return fallback;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.data)) return payload.data;
      if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
      if (payload.data && Array.isArray(payload.data.contacts)) return payload.data.contacts;
      if (Array.isArray(payload.contacts)) return payload.contacts;
      return fallback;
    };

    return fetch(this.apiUrl, { credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`API error: ${response.statusText}`);
        return response.json();
      })
      .then(data => {
        const contactsList = normalizeContactsPayload(data, []);
        
        this.contacts = contactsList.map(contact => ({
          id: contact.id,
          name: contact.name,
          email: contact.email || '',
          phone: contact.phone || '',
          address: contact.address || '',
          gstin: contact.gstin || '',
          licenceNo: contact.licence_no || '',
          pan: contact.pan || '',
          totalSales: contact.real_total_sales || 0,
          avgSales: contact.real_avg_sales || 0,
          favouriteProducts: contact.favorite_product || contact.favourite_products || '',
          openingBalance: contact.opening_balance || 0,
          notes: contact.notes || '',
          creationDate: contact.created_at || new Date().toISOString(),
          transportPreference: contact.transport_preference || '',
          active: contact.active || 'INACTIVE',
          lastActivity: contact.last_activity || null,
          excludeFromStats: contact.exclude_from_stats || 0,
          disableDuplexExport: contact.disable_duplex_export || 0,
          created_by_role: contact.created_by_role,
          created_by_name: contact.created_by_name,
          last_edited_by_role: contact.last_edited_by_role,
          last_edited_by_name: contact.last_edited_by_name,
          color: this.generateColorForContact(contact.name)
        }));
        log.debug(`✓ Loaded ${this.contacts.length} contacts from API`);
        this.renderContactsList();
        return this.contacts;
      })
      .catch(error => {
        log.error('Error loading contacts from API:', error);
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const port = isDev ? '3002 (dev) or 3001 (prod)' : '3001';
        log.warn(`⚠️  Contacts API not available on :${port}. The billing-api-server may not be running.`);
        this.contacts = [];
        this.renderContactsList();
        throw error;
      });
  }

  generateColorForContact(name) {
    const colors = ['#d4516b', '#ff9500', '#af52de', '#34c759', '#0a84ff', '#ff3b30', '#ffcc00', '#ff2d55'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  loadContacts() {
    // Legacy method - kept for backward compatibility
    const saved = localStorage.getItem('contactsAppData');
    if (saved) {
      return JSON.parse(saved);
    }
    return [];
  }

  saveContacts() {
    // Legacy method - now handled by API
    // Kept for backward compatibility
  }

  openAddContactModal() {
    this.editingContactId = null;
    this.showContactModal({});
  }

  openEditContactModal() {
    if (!this.selectedContactId) return;
    
    // Fetch fresh data for this specific contact to ensure all analytics are current
    fetch(`${this.apiUrl}/${this.selectedContactId}`, { credentials: 'same-origin' })
      .then(response => response.json())
      .then(contact => {
        const mappedContact = {
          id: contact.id,
          name: contact.name,
          email: contact.email || '',
          phone: contact.phone || '',
          address: contact.address || '',
          gstin: contact.gstin || '',
          licenceNo: contact.licence_no || '',
          pan: contact.pan || '',
          totalSales: contact.real_total_sales || 0,
          avgSales: contact.real_avg_sales || 0,
          favouriteProducts: contact.favorite_product || contact.favourite_products || '',
          openingBalance: contact.opening_balance || 0,
          notes: contact.notes || '',
          creationDate: contact.created_at || new Date().toISOString(),
          transportPreference: contact.transport_preference || '',
          active: contact.active || 'INACTIVE',
          lastActivity: contact.last_activity || null,
          excludeFromStats: contact.exclude_from_stats || 0,
          disableDuplexExport: contact.disable_duplex_export || 0,
          color: this.generateColorForContact(contact.name)
        };
        this.editingContactId = this.selectedContactId;
        this.showContactModal(mappedContact);
      })
      .catch(error => {
        log.error('Error fetching contact for edit:', error);
        // Fallback to local data if API fails
        const localContact = this.contacts.find(c => c.id === this.selectedContactId);
        if (localContact) {
          this.editingContactId = this.selectedContactId;
          this.showContactModal(JSON.parse(JSON.stringify(localContact)));
        }
      });
  }

  showContactModal(contactData) {
    const isWorker = (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
    // Generate random color if new contact
    const contactColor = contactData.color || this.generateColorForContact(contactData.name || 'New');

    const modalHTML = `
      <div class="contact-modal-overlay" id="contactModalOverlay">
        <div class="contact-modal">
          <div class="contact-modal-header">
            <h2>${this.editingContactId ? 'Edit Contact' : 'New Contact'}</h2>
            <button class="contact-modal-close" id="closeModalBtn">✕</button>
          </div>

          <form class="contact-modal-form" id="contactForm">
            <!-- Basic Information Section -->
            <div class="contact-form-section">
              <div class="contact-form-row">
                <div class="contact-form-avatar-section">
                  <div class="contact-modal-avatar" style="background: ${contactColor}; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; font-weight: 600; margin-bottom: 8px;">
                    ${contactData.name ? this.getInitials(contactData.name) : '?'}
                  </div>
                </div>
                <div class="contact-form-group" style="flex: 1;">
                  <label>Full Name <span class="required">*</span></label>
                  <input type="text" name="name" placeholder="John Doe" value="${contactData.name || ''}" required style="font-size: 18px; font-weight: 600;" />
                </div>
              </div>

              <div class="contact-form-row">
                <div class="contact-form-group">
                  <label>Phone</label>
                  <input type="tel" name="phone" placeholder="+91 00000 00000" value="${contactData.phone || ''}" />
                </div>
                <div class="contact-form-group">
                  <label>Email</label>
                  <input type="email" name="email" placeholder="email@example.com" value="${contactData.email || ''}" />
                </div>
              </div>

              <div class="contact-form-group">
                <label>Address</label>
                <input type="text" name="address" placeholder="123 Apple way, Cupertino" value="${contactData.address || ''}" />
              </div>
            </div>

            <!-- Business Information Section -->
            <div class="contact-form-section">
              <h3 class="contact-form-section-title">Business Information</h3>
              
              <div class="contact-form-row">
                <div class="contact-form-group">
                  <label>GSTIN</label>
                  <input type="text" name="gstin" placeholder="GSTIN number" value="${contactData.gstin || ''}" />
                </div>
                <div class="contact-form-group">
                  <label>Licence No</label>
                  <input type="text" name="licenceNo" placeholder="Licence number" value="${contactData.licenceNo || ''}" />
                </div>
              </div>

              <div class="contact-form-row">
                <div class="contact-form-group">
                  <label>PAN</label>
                  <input type="text" name="pan" placeholder="PAN number" value="${contactData.pan || ''}" />
                </div>
              </div>
            </div>

            <!-- Analytics Summary (Display Only) -->
            ${this.editingContactId ? `
            <div class="contact-form-section analytics-summary-box" style="background: rgba(139, 92, 246, 0.05); border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid rgba(139, 92, 246, 0.1);">
              <h3 class="contact-form-section-title" style="color: #6d28d9; margin-bottom: 12px;">📈 Business Analytics</h3>
              <div class="analytics-stat-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="stat-item">
                  <div class="stat-label" style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Lifetime Revenue</div>
                  <div class="stat-value" style="font-size: 16px; font-weight: 700; color: #1e293b;">${this.formatCurrency(contactData.totalSales)}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label" style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Average Order</div>
                  <div class="stat-value" style="font-size: 16px; font-weight: 700; color: #1e293b;">${this.formatCurrency(contactData.avgSales)}</div>
                </div>
                <div class="stat-item" style="grid-column: span 2; border-top: 1px solid rgba(0,0,0,0.05); pt: 8px; margin-top: 4px;">
                  <div class="stat-label" style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Most Ordered Product</div>
                  <div class="stat-value" style="font-size: 14px; color: #4b5563; font-weight: 500;">${contactData.favouriteProducts || 'No sales history yet'}</div>
                </div>
              </div>
              <input type="hidden" name="totalSales" value="${contactData.totalSales || '0'}" />
              <input type="hidden" name="avgSales" value="${contactData.avgSales || '0'}" />
              <input type="hidden" name="favouriteProducts" value="${contactData.favouriteProducts || ''}" />
            </div>
            ` : ''}

            <!-- Financial & Preferences Section -->
            <div class="contact-form-section">
              <h3 class="contact-form-section-title">Financial & Preferences</h3>
              
              <div class="contact-form-row">
                <div class="contact-form-group">
                  <label>Opening Balance</label>
                  <input type="number" name="openingBalance" placeholder="0.00" step="0.01" value="${contactData.openingBalance || ''}" />
                </div>
                <div class="contact-form-group">
                  <label>Transport Preference</label>
                  <input type="text" name="transportPreference" placeholder="e.g., Ground, Air, Sea" value="${contactData.transportPreference || ''}" />
                </div>
              </div>

              <div class="contact-form-row">
                <div class="contact-form-group full-width" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px; margin-top: 8px; width: 100%;">
                  <div style="flex: 1;">
                    <label style="margin: 0; font-weight: 600;">Exclude from Statistics</label>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: #666;">Don't include this customer in total sales, payments, or analytics summary.</p>
                  </div>
                  <label class="macos-switch">
                    <input type="checkbox" name="excludeFromStats" ${contactData.excludeFromStats ? 'checked' : ''}>
                    <span class="macos-slider"></span>
                  </label>
                </div>
              </div>

              <div class="contact-form-row">
                <div class="contact-form-group full-width" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px; margin-top: 8px; width: 100%;">
                  <div style="flex: 1;">
                    <label style="margin: 0; font-weight: 600;">2-Page Duplex Printing</label>
                    <p style="margin: 2px 0 0 0; font-size: 11px; color: #666;">Enable front & back duplex layout when exporting or printing invoices for this customer.</p>
                  </div>
                  <label class="macos-switch">
                    <input type="checkbox" name="duplexPrint" ${(contactData.disableDuplexExport === 0 || contactData.disableDuplexExport === '0' || contactData.disableDuplexExport === false || contactData.disableDuplexExport === undefined) ? 'checked' : ''}>
                    <span class="macos-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Additional Information Section -->
            <div class="contact-form-section">
              <h3 class="contact-form-section-title">Additional Information</h3>
              
              <div class="contact-form-row">
                <div class="contact-form-group full-width">
                  <label>Notes</label>
                  <textarea name="notes" placeholder="Add any notes about this contact..." rows="3">${contactData.notes || ''}</textarea>
                </div>
              </div>
            </div>

            <!-- Form Actions -->
            <div class="contact-modal-actions" style="display: flex; flex-direction: column; gap: 10px; padding: 20px; border-top: 1px solid rgba(0,0,0,0.05);">
              <button type="submit" class="contact-modal-btn submit" style="width: 100%; margin: 0; height: 44px; font-size: 14px; font-weight: 600;">Save Contact</button>
              <button type="button" class="contact-modal-btn cancel" id="cancelBtn" style="width: 100%; margin: 0; background: transparent; border: 1px solid #ddd; color: #666; height: 36px; font-size: 13px;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Add modal to body
    const modal = document.createElement('div');
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal.firstElementChild);

    const overlay = document.getElementById('contactModalOverlay');
    const closeBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const form = document.getElementById('contactForm');

    // Close handlers
    const closeModal = () => {
      overlay.remove();
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveContactFromModal(form, closeModal);
    });
  }

  isWorkerUser() {
    return (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
  }

  saveContactFromModal(form, closeModal) {
    const formData = new FormData(form);
    const name = formData.get('name').trim();

    if (!name) {
      alert('Contact name is required');
      return;
    }
    
    const contactData = {
      name,
      phone: formData.get('phone') || '',
      email: formData.get('email') || '',
      address: formData.get('address') || '',
      gstin: formData.get('gstin') || '',
      licence_no: formData.get('licenceNo') || '',
      pan: formData.get('pan') || '',
      total_sales: parseFloat(formData.get('totalSales')) || 0,
      avg_sales: parseFloat(formData.get('avgSales')) || 0,
      favourite_products: formData.get('favouriteProducts') || '',
      opening_balance: parseFloat(formData.get('openingBalance')) || 0,
      exclude_from_stats: formData.get('excludeFromStats') === 'on' ? 1 : 0,
      disable_duplex_export: formData.get('duplexPrint') === 'on' ? 0 : 1,
      notes: formData.get('notes') || '',
      transport_preference: formData.get('transportPreference') || ''
    };

    if (this.editingContactId) {
      // Update existing contact via API
      fetch(`${this.apiUrl}/${this.editingContactId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      })
        .then(response => {
          if (!response.ok) throw new Error(`API error: ${response.statusText}`);
          return response.json();
        })
        .then(() => {
          log.debug('Contact updated successfully');
          this.loadContactsFromAPI();
          closeModal();
        })
        .catch(error => {
          log.error('Update error:', error);
          const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const port = isDev ? 3002 : 3001;
          alert(`Error updating contact: ${error.message}\n\nMake sure the backend API server is running on port ${port}`);
        });
    } else {
      // Create new contact via API
      fetch(this.apiUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      })
        .then(response => {
          if (!response.ok) throw new Error(`API error: ${response.statusText}`);
          return response.json();
        })
        .then(() => {
          log.debug('Contact created successfully');
          this.loadContactsFromAPI();
          closeModal();
        })
        .catch(error => {
          log.error('Create error:', error);
          const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const port = isDev ? 3002 : 3001;
          alert(`Error creating contact: ${error.message}\n\nMake sure the backend API server is running on port ${port}`);
        });
    }
  }

  deleteContact(contactId) {
    const contact = this.contacts.find(c => c.id === contactId);
    if (!contact) return;

    // Show confirmation dialog
    if (confirm(`Are you sure you want to delete "${contact.name}"? This action cannot be undone.`)) {
      // Delete contact via API
      fetch(`${this.apiUrl}/${contactId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      })
        .then(response => {
          if (!response.ok) throw new Error(`API error: ${response.statusText}`);
          return response.json();
        })
        .then(() => {
          log.debug('Contact deleted successfully');
          this.loadContactsFromAPI();
          this.selectedContactId = null;
          this.cardContainer.innerHTML = `
            <div class="contact-empty-state">
              <div class="contact-empty-state-icon">📇</div>
              <div class="contact-empty-state-text">No contact selected</div>
            </div>
          `;
        })
        .catch(error => {
          log.error('Delete error:', error);
          const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const port = isDev ? 3002 : 3001;
          alert(`Error deleting contact: ${error.message}\n\nMake sure the backend API server is running on port ${port}`);
        });
    }
  }

  async openShareContactModal(contactId, contactName) {
    try {
      const res = await fetch(`${this.apiUrl}/${contactId}/access`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to fetch worker access list');
      const data = await res.json();
      const workers = data.workers || [];

      const modalHTML = `
        <div class="contact-modal-overlay" id="shareWorkerModalOverlay" style="z-index: 2147483647;">
          <div class="contact-modal" style="max-width: 440px; border-radius: 14px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.35);">
            <div class="contact-modal-header" style="background: var(--bg-secondary, #f7f7f7); border-bottom: 1px solid rgba(0,0,0,0.08); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <h2 class="contact-modal-title" style="font-size: 16px; font-weight: 700; margin: 0;">Share with Workers</h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #777;">Control worker access for <strong>${contactName}</strong>.</p>
              </div>
              <button type="button" class="contact-modal-close" id="closeShareModalBtn" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: #888;">&times;</button>
            </div>
            <div class="contact-modal-body" style="padding: 16px 20px; max-height: 360px; overflow-y: auto;">
              ${workers.length === 0 ? `
                <div style="text-align: center; padding: 24px 0; color: #888; font-size: 13px;">No active worker accounts found.</div>
              ` : `
                <div class="worker-share-list" style="display: flex; flex-direction: column; gap: 8px;">
                  ${workers.map(w => {
                    const initials = (w.fullName || w.username).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    return `
                      <label class="worker-share-row" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.06); cursor: pointer; transition: background 0.2s;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                          <div style="width: 36px; height: 36px; border-radius: 50%; background: #007aff; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">
                            ${initials}
                          </div>
                          <div>
                            <div style="font-weight: 600; font-size: 13px; color: var(--text-color, #000);">${w.fullName}</div>
                            <div style="font-size: 11px; color: #888;">${w.email || `@${w.username}`}</div>
                          </div>
                        </div>
                        <input type="checkbox" class="worker-access-checkbox" value="${w.id}" ${w.hasAccess ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #007aff;">
                      </label>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
            <div class="contact-modal-actions" style="display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid rgba(0,0,0,0.08); background: var(--bg-secondary, #f7f7f7);">
              <button type="button" class="contact-modal-btn submit" id="saveWorkerAccessBtn" style="flex: 1; height: 38px; font-size: 13px; font-weight: 600; border-radius: 8px; background: #007aff; color: #fff; border: none; cursor: pointer;">Save Access</button>
              <button type="button" class="contact-modal-btn cancel" id="cancelShareModalBtn" style="flex: 1; height: 38px; font-size: 13px; border-radius: 8px; background: transparent; border: 1px solid #ccc; color: #555; cursor: pointer;">Cancel</button>
            </div>
          </div>
        </div>
      `;

      const modalElem = document.createElement('div');
      modalElem.innerHTML = modalHTML;
      document.body.appendChild(modalElem.firstElementChild);

      const overlay = document.getElementById('shareWorkerModalOverlay');
      const closeBtn = document.getElementById('closeShareModalBtn');
      const cancelBtn = document.getElementById('cancelShareModalBtn');
      const saveBtn = document.getElementById('saveWorkerAccessBtn');

      const closeModal = () => overlay.remove();
      closeBtn?.addEventListener('click', closeModal);
      cancelBtn?.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      saveBtn?.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        const checkboxes = overlay.querySelectorAll('.worker-access-checkbox:checked');
        const userIds = Array.from(checkboxes).map(cb => cb.value);

        try {
          const updateRes = await fetch(`${this.apiUrl}/${contactId}/access`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds })
          });
          const updateData = await updateRes.json();
          if (!updateRes.ok || !updateData.success) {
            throw new Error(updateData.error || 'Failed to update access');
          }
          closeModal();
          alert(`Worker access updated for ${contactName}.`);
        } catch (err) {
          alert('Error saving worker access: ' + err.message);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Access';
        }
      });
    } catch (err) {
      alert('Error fetching worker list: ' + err.message);
    }
  }

  showNotification(message, type = 'info') {
    let notification = document.querySelector('.contacts-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'contacts-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `contacts-notification contacts-notification-${type}`;
    notification.style.display = 'block';

    setTimeout(() => {
      notification.style.display = 'none';
    }, 3000);
  }
}

// Ensure global availability
window.ContactsApp = ContactsApp;

