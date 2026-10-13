const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:History') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * HistoryView - Premium Transaction Timeline
 * Enhanced transaction history with stats, filtering, and modern UI
 * Resilient in-memory store resolution with fallback to API client
 */

class HistoryView {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.viewContainer = billingApp?.viewContainer;
    this.loadCSS();
    this.allTransactions = [];
    this.customerOpeningBalances = new Map();
  }

  loadCSS() {
    if (!document.getElementById('history-stylesheet')) {
      const link = document.createElement('link');
      link.id = 'history-stylesheet';
      link.rel = 'stylesheet';
      link.href = '/modules/billing/css/history.css';
      // document.head.appendChild(link); /* Disabled for Vite */
    }
  }

  render() {
    this.viewContainer.innerHTML = `
      <div class="history-container">
        <!-- PREMIUM HEADER WITH STATS -->
        <div class="history-header-enhanced">
          <div class="header-title">
            <h2>📊 Transaction Timeline</h2>
            <p>Complete audit trail of all invoices, payments & credits</p>
          </div>
          <div class="header-stats" id="headerStats">
            <div class="stat-box">
              <div class="stat-value">₹0.00</div>
              <div class="stat-label">Total Invoiced</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">₹0.00</div>
              <div class="stat-label">Total Paid</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">₹0.00</div>
              <div class="stat-label">Outstanding</div>
            </div>
          </div>
        </div>

        <!-- FILTER CONTROLS -->
        <div class="history-controls-panel">
          <div class="control-group">
            <input type="text" id="historySearch" class="history-search-input" placeholder="🔍 Search customer, invoice, or reference...">
          </div>
          <div class="control-group-right">
            <select id="historyTypeFilter" class="history-filter-select">
              <option value="">All Types</option>
              <option value="bill">📄 Invoices</option>
              <option value="payment">✓ Payments</option>
              <option value="credit_note">💳 Credits</option>
              <option value="opening-balance">📊 Opening Balance</option>
            </select>
            <select id="historySortSelect" class="history-filter-select">
              <option value="date-new">⬇ Newest First</option>
              <option value="date-old">⬆ Oldest First</option>
              <option value="customer">👤 Customer (A-Z)</option>
              <option value="amount-high">₹ Amount (High)</option>
            </select>
          </div>
        </div>

        <!-- TRANSACTION LIST -->
        <div class="history-content-area">
          <div id="historyLoadingMsg" class="history-loading-state" style="padding: 40px 20px; display: flex; justify-content: center; align-items: center;">
            ${(typeof window !== 'undefined' && window.MacOSLoader) ? window.MacOSLoader.create('Loading Transactions...', 'Syncing financial audit trail') : `
              <div class="loading-spinner"></div>
              <div>Loading transactions...</div>
            `}
          </div>
          <div id="historyContainer" style="display: none;" class="history-timeline"></div>
        </div>
      </div>
    `;
    this.loadHistoryData();
  }

  isWorkerUser() {
    return (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
  }

  async loadHistoryData() {
    const root = this.viewContainer || document;
    const container = root.querySelector('#historyContainer');
    const loadingMsg = root.querySelector('#historyLoadingMsg');

    try {
      log.debug('Loading history data...');
      
      const isWorker = this.isWorkerUser();
      const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
      const accessibleNames = scoped && isWorker ? new Set(scoped.contacts.map(c => c.name).filter(Boolean)) : null;

      let billsDataRaw = scoped?.bills || this.billingApp?.billingData?.bills;
      let paymentsDataRaw = scoped?.payments || this.billingApp?.billingData?.payments;

      // If in-memory data is not yet available, attempt to load from API with a 6-second timeout race
      if (!billsDataRaw || !paymentsDataRaw) {
        if (this.billingApp?.loadBillingDataFromAPI) {
          try {
            await Promise.race([
              this.billingApp.loadBillingDataFromAPI(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('API load timeout')), 6000))
            ]);
            const refreshedScoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
            billsDataRaw = refreshedScoped?.bills || this.billingApp?.billingData?.bills;
            paymentsDataRaw = refreshedScoped?.payments || this.billingApp?.billingData?.payments;
          } catch (e) {
            log.warn('BillingData API load timed out or failed, falling back:', e.message);
          }
        }
      }

      // If still missing, try individual fetchBills/fetchPayments with race timeout
      if (!billsDataRaw || !paymentsDataRaw) {
        const [fallbackBills, fallbackPayments] = await Promise.all([
          this.fetchBills(),
          this.fetchPayments()
        ]);
        if (!billsDataRaw) billsDataRaw = fallbackBills || [];
        if (!paymentsDataRaw) paymentsDataRaw = fallbackPayments || [];
      }

      billsDataRaw = billsDataRaw || [];
      paymentsDataRaw = paymentsDataRaw || [];

      // Filter by worker access if applicable
      const billsData = (isWorker && accessibleNames)
        ? billsDataRaw.filter(b => accessibleNames.has(b.customer_name))
        : billsDataRaw;

      const paymentsData = (isWorker && accessibleNames)
        ? paymentsDataRaw.filter(p => accessibleNames.has(p.customer_name))
        : paymentsDataRaw;

      log.debug('✓ Bills resolved:', billsData.length);
      log.debug('✓ Payments resolved:', paymentsData.length);

      // Separate payments and credit notes
      const payments = paymentsData.filter(p => p.type === 'PAYMENT' || !p.type);
      const creditNotes = paymentsData.filter(p => p.type === 'CREDIT_NOTE');

      // Build unified transaction list
      this.allTransactions = [
        ...billsData.map(bill => ({
          typeCode: 'bill',
          date: new Date(bill.bill_date || bill.invoice_date || bill.created_at || Date.now()),
          data: bill
        })),
        ...payments.map(payment => ({
          typeCode: 'payment',
          date: new Date(payment.payment_date || payment.created_at || Date.now()),
          data: payment
        })),
        ...creditNotes.map(credit => ({
          typeCode: 'credit_note',
          date: new Date(credit.payment_date || credit.created_at || Date.now()),
          data: credit
        }))
      ];

      log.debug(`✓ Total transactions: ${this.allTransactions.length} (${billsData.length} bills, ${payments.length} payments, ${creditNotes.length} credits)`);

      try {
        await this.updateStats();
      } catch (statErr) {
        log.warn('Non-fatal error updating stats:', statErr);
      }

      this.setupEventListeners();
      this.renderTransactions();

    } catch (error) {
      log.error('Error loading history:', error);
      if (loadingMsg) {
        loadingMsg.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">⚠ Error loading transactions: ${error.message}</div>`;
      }
    } finally {
      // Guaranteed dismiss of the loading state
      if (loadingMsg && container && container.style.display === 'block') {
        loadingMsg.style.setProperty('display', 'none', 'important');
        loadingMsg.classList.add('hidden');
        loadingMsg.remove();
      }
    }
  }

  async fetchBills() {
    try {
      if (this.billingApp?.billingData?.bills?.length > 0) {
        return this.billingApp.billingData.bills;
      }
      if (!this.billingApp?.api?.getBills) return [];
      const response = await Promise.race([
        this.billingApp.api.getBills(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching bills')), 5000))
      ]);
      const normalizeCollection = payload => {
        if (Array.isArray(payload)) return payload;
        if (!payload) return [];
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.data?.items)) return payload.data.items;
        return [];
      };
      
      let bills = normalizeCollection(response);
      return Array.isArray(bills) ? bills : [];
    } catch (error) {
      log.error('Error fetching bills:', error);
      return [];
    }
  }

  async fetchPayments() {
    try {
      if (this.billingApp?.billingData?.payments?.length > 0) {
        return this.billingApp.billingData.payments;
      }
      if (!this.billingApp?.api?.getPayments) return [];
      const response = await Promise.race([
        this.billingApp.api.getPayments(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching payments')), 5000))
      ]);
      const normalizeCollection = payload => {
        if (Array.isArray(payload)) return payload;
        if (!payload) return [];
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.data?.items)) return payload.data.items;
        return [];
      };
      
      let payments = normalizeCollection(response);
      return Array.isArray(payments) ? payments : [];
    } catch (error) {
      log.error('Error fetching payments:', error);
      return [];
    }
  }

  async updateStats() {
    let excludedCustomerNames = new Set();
    let customerOpeningBalances = new Map();
    
    // First check contacts from in-memory billingData to avoid redundant network call
    const inMemoryContacts = this.billingApp?.billingData?.contacts || (this.billingApp?.getScopedBillingData?.()?.contacts);
    if (Array.isArray(inMemoryContacts) && inMemoryContacts.length > 0) {
      inMemoryContacts.forEach(c => {
        if (c.exclude_from_stats === 1 || c.exclude_from_stats === '1' || c.exclude_from_stats === true) {
          excludedCustomerNames.add(c.name);
        }
        if (c.opening_balance) {
          customerOpeningBalances.set(c.name, Number(c.opening_balance) || 0);
        }
      });
    } else {
      try {
        const response = await Promise.race([
          fetch('/api/contacts'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching contacts')), 4000))
        ]);
        if (response.ok) {
          const result = await response.json();
          const normalizeCollection = payload => {
            if (Array.isArray(payload)) return payload;
            if (!payload) return [];
            if (Array.isArray(payload.items)) return payload.items;
            if (Array.isArray(payload.data)) return payload.data;
            if (Array.isArray(payload.data?.items)) return payload.data.items;
            return [];
          };
          const contactsArr = normalizeCollection(result);
          contactsArr.forEach(c => {
            if (c.exclude_from_stats === 1 || c.exclude_from_stats === '1' || c.exclude_from_stats === true) {
              excludedCustomerNames.add(c.name);
            }
            if (c.opening_balance) {
              customerOpeningBalances.set(c.name, Number(c.opening_balance) || 0);
            }
          });
        }
      } catch (error) {
        log.warn('Error fetching contacts for history stats:', error);
      }
    }

    // Filter transactions by excluded customers for admin stats calculation
    const bills = (this.allTransactions || []).filter(t => t.typeCode === 'bill' && !excludedCustomerNames.has(t.data?.customer_name));
    const payments = (this.allTransactions || []).filter(t => t.typeCode === 'payment' && !excludedCustomerNames.has(t.data?.customer_name));
    const credits = (this.allTransactions || []).filter(t => t.typeCode === 'credit_note' && !excludedCustomerNames.has(t.data?.customer_name));

    // Calculate totals with explicit number coercion
    let totalInvoiced = bills.reduce((sum, t) => sum + (Number(t.data?.grand_total || t.data?.total) || 0), 0);
    const totalPaid = payments.reduce((sum, t) => sum + (Number(t.data?.amount) || 0), 0);
    const totalCredits = credits.reduce((sum, t) => sum + (Number(t.data?.credit_amount) || 0), 0);

    // Add opening balance ONLY from non-excluded customers
    let totalOpeningBalance = 0;
    customerOpeningBalances.forEach((balance, name) => {
      if (!excludedCustomerNames.has(name)) {
        totalOpeningBalance += (Number(balance) || 0);
      }
    });
    
    totalInvoiced += totalOpeningBalance;
    const outstanding = totalInvoiced - totalPaid - totalCredits;

    const root = this.viewContainer || document;
    const statBoxes = root.querySelectorAll('#headerStats .stat-box');
    if (statBoxes && statBoxes.length >= 3) {
      const v0 = statBoxes[0].querySelector('.stat-value');
      const v1 = statBoxes[1].querySelector('.stat-value');
      const v2 = statBoxes[2].querySelector('.stat-value');
      if (v0) v0.textContent = `₹${(Number(totalInvoiced) || 0).toFixed(2)}`;
      if (v1) v1.textContent = `₹${(Number(totalPaid + totalCredits) || 0).toFixed(2)}`;
      if (v2) v2.textContent = `₹${(Number(outstanding) || 0).toFixed(2)}`;
    }
  }

  setupEventListeners() {
    const root = this.viewContainer || document;
    const searchInput = root.querySelector('#historySearch');
    const typeFilter = root.querySelector('#historyTypeFilter');
    const sortSelect = root.querySelector('#historySortSelect');

    if (searchInput && !searchInput._hasHistoryListener) {
      searchInput._hasHistoryListener = true;
      searchInput.addEventListener('input', () => this.renderTransactions());
    }
    if (typeFilter && !typeFilter._hasHistoryListener) {
      typeFilter._hasHistoryListener = true;
      typeFilter.addEventListener('change', () => this.renderTransactions());
    }
    if (sortSelect && !sortSelect._hasHistoryListener) {
      sortSelect._hasHistoryListener = true;
      sortSelect.addEventListener('change', () => this.renderTransactions());
    }

    if (!this._workerBadgeListenerBound) {
      this._workerBadgeListenerBound = true;
      window.addEventListener('worker-badges-toggle-changed', () => {
        this.renderTransactions();
      });
    }
  }

  renderTransactions() {
    const root = this.viewContainer || document;
    const searchInput = root.querySelector('#historySearch');
    const typeFilter = root.querySelector('#historyTypeFilter');
    const sortSelect = root.querySelector('#historySortSelect');
    const container = root.querySelector('#historyContainer');
    const loadingMsg = root.querySelector('#historyLoadingMsg');

    if (!container) return;

    let filtered = [...(this.allTransactions || [])];
    let showingOpeningBalance = false;

    // Filter by type
    if (typeFilter?.value) {
      if (typeFilter.value === 'opening-balance') {
        showingOpeningBalance = true;
        filtered = [];
      } else {
        filtered = filtered.filter(t => t.typeCode === typeFilter.value);
      }
    }

    // Search
    if (searchInput?.value) {
      const q = searchInput.value.toLowerCase().trim();
      if (q) {
        filtered = filtered.filter(t => {
          const customer = (t.data?.customer_name || '').toLowerCase();
          const ref = (t.data?.reference_no || t.data?.reference_number || t.data?.invoice_no || '').toLowerCase();
          return customer.includes(q) || ref.includes(q);
        });
      }
    }

    // Sort
    if (sortSelect?.value) {
      switch (sortSelect.value) {
        case 'date-old':
          filtered.sort((a, b) => a.date - b.date);
          break;
        case 'customer':
          filtered.sort((a, b) => (a.data?.customer_name || '').localeCompare(b.data?.customer_name || ''));
          break;
        case 'amount-high':
          filtered.sort((a, b) => {
            const aAmount = Number(a.data?.grand_total || a.data?.amount || a.data?.credit_amount) || 0;
            const bAmount = Number(b.data?.grand_total || b.data?.amount || b.data?.credit_amount) || 0;
            return bAmount - aAmount;
          });
          break;
        default:
          filtered.sort((a, b) => b.date - a.date);
      }
    } else {
      filtered.sort((a, b) => b.date - a.date);
    }

    // Always ensure loadingMsg is hidden and container is displayed
    if (loadingMsg) {
      loadingMsg.style.setProperty('display', 'none', 'important');
      loadingMsg.classList.add('hidden');
      loadingMsg.remove();
    }
    container.style.display = 'block';

    // Render Opening Balance View
    if (showingOpeningBalance) {
      const customers = [...new Set((this.allTransactions || []).map(t => t.data?.customer_name).filter(Boolean))];
      
      if (customers.length === 0) {
        container.innerHTML = `<div class="history-empty" style="text-align:center; padding:40px; color:#6b7280;"><span>✨</span> No customer balances found</div>`;
        return;
      }

      const openingBalanceCardsHTML = customers.map(customer => `
        <div class="history-card opening-balance-card" data-customer="${customer}" style="background: linear-gradient(135deg, #f0f8ff 0%, #e0efff 100%); border: 2px solid #1e40af; margin-bottom: 12px; border-radius: 8px;">
          <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 11px; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">📊 Opening Balance</div>
                <div style="font-size: 13px; color: #1e40af; font-weight: 700; margin-top: 6px;">${customer}</div>
              </div>
              <div class="opening-balance-amount" style="font-size: 16px; font-weight: 700; color: #1e40af;">Loading...</div>
            </div>
            <div style="font-size: 10px; color: #1e40af; margin-top: 8px; font-weight: 500;">From Old ERP (${new Date().getFullYear() - 1})</div>
          </div>
        </div>
      `).join('');
      
      container.innerHTML = openingBalanceCardsHTML;
      
      customers.forEach(customer => {
        this.fetchAndDisplayOpeningBalance(customer, container);
      });
      return;
    }
    
    if (filtered.length === 0) {
      container.innerHTML = `<div class="history-empty" style="text-align:center; padding:40px; color:#6b7280;"><span style="font-size:24px; display:block; margin-bottom:8px;">✨</span> No transactions found</div>`;
      return;
    }

    try {
      const html = filtered.map(t => this.renderCard(t)).join('');
      container.innerHTML = html;
    } catch (renderErr) {
      log.error('Error rendering transaction cards:', renderErr);
      container.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">⚠ Error rendering transactions: ${renderErr.message}</div>`;
    }
  }

  async fetchAndDisplayOpeningBalance(customerName, container) {
    try {
      // First check cache in this.customerOpeningBalances or in-memory contacts
      let openingBalance = this.customerOpeningBalances.get(customerName);
      if (openingBalance === undefined) {
        const inMemoryContacts = this.billingApp?.billingData?.contacts || (this.billingApp?.getScopedBillingData?.()?.contacts);
        if (Array.isArray(inMemoryContacts)) {
          const match = inMemoryContacts.find(c => (c.name || '').toLowerCase() === customerName.toLowerCase());
          if (match) {
            openingBalance = Number(match.opening_balance) || 0;
            this.customerOpeningBalances.set(customerName, openingBalance);
          }
        }
      }

      if (openingBalance === undefined) {
        const response = await fetch(`/api/contacts?search=${encodeURIComponent(customerName)}`);
        if (response.ok) {
          const result = await response.json();
          const contacts = result.data || result;
          if (Array.isArray(contacts) && contacts.length > 0) {
            const customer = contacts.find(c => (c.name || '').toLowerCase() === customerName.toLowerCase());
            if (customer) {
              openingBalance = Number(customer.opening_balance) || 0;
              this.customerOpeningBalances.set(customerName, openingBalance);
            }
          }
        }
      }

      if (openingBalance !== undefined) {
        const balanceCard = container.querySelector(`[data-customer="${customerName}"]`);
        if (openingBalance === 0) {
          if (balanceCard) balanceCard.style.display = 'none';
          return;
        }
        
        const card = container.querySelector(`[data-customer="${customerName}"] .opening-balance-amount`);
        if (card) {
          let balanceHTML = '';
          if (openingBalance < 0) {
            balanceHTML = `<span style="color: #16a34a;">Cr. ₹${Math.abs(openingBalance).toFixed(2)}</span>`;
          } else {
            balanceHTML = `<span style="color: #dc2626;">₹${openingBalance.toFixed(2)}</span>`;
          }
          card.innerHTML = balanceHTML;
        }
      }
    } catch (error) {
      log.error('Error fetching opening balance:', error);
    }
  }

  renderCard(transaction) {
    const { typeCode, data } = transaction;

    const dateField = typeCode === 'bill' 
      ? (data.bill_date || data.invoice_date || data.created_at) 
      : (data.payment_date || data.created_at);
    const dateObj = dateField ? new Date(dateField) : new Date();
    const date = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) : 'N/A';

    if (typeCode === 'bill') {
      return this.renderBillCard(data, date);
    } else if (typeCode === 'payment') {
      return this.renderPaymentCard(data, date);
    } else {
      return this.renderCreditCard(data, date);
    }
  }

  renderBillCard(data, date) {
    const invNo = data.invoice_no || data.invoice_number || `INV-${data.id || ''}`;
    const amount = Number(data.grand_total || data.total || 0) || 0;
    const status = data.status || 'pending';
    const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge)
      ? window.renderWorkerBadge(data, { compact: true })
      : '';

    const auditInfo = JSON.stringify({
      type: 'Invoice',
      id: data.id,
      name: `Invoice ${invNo} (${data.customer_name || 'Customer'})`,
      created_by_role: data.created_by_role,
      created_by_name: data.created_by_name,
      last_edited_by_role: data.last_edited_by_role,
      last_edited_by_name: data.last_edited_by_name,
      date: data.invoice_date || data.bill_date || data.created_at,
      created_at: data.created_at
    });

    return `
      <div class="transaction-card invoice-card" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
        <div class="card-marker invoice-marker"></div>
        <div class="card-content">
          <div class="card-header-row">
            <div class="card-title-block">
              <span class="card-badge invoice-badge">📄</span>
              <div>
                <div class="card-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span>Invoice ${invNo}</span> ${workerBadgeHtml}</div>
                <div class="card-subtitle">${data.customer_name || 'Unknown'}</div>
              </div>
            </div>
            <div class="card-amount-block">
              <div class="card-amount invoice-amount">₹${amount.toFixed(2)}</div>
              <div class="card-date">${date}</div>
            </div>
          </div>
          <div class="card-details-row">
            <span class="detail-item status-badge status-${status.toLowerCase()}">${status}</span>
            ${data.reference_no ? `<span class="detail-item">${data.reference_no}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderPaymentCard(data, date) {
    const refNo = data.reference_no || data.reference_number || `PAY-${data.id || ''}`;
    const amount = Number(data.amount || 0) || 0;
    const medium = data.payment_medium || 'Cash';
    const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge)
      ? window.renderWorkerBadge(data, { compact: true })
      : '';

    const auditInfo = JSON.stringify({
      type: 'Payment',
      id: data.id,
      name: `Payment ${refNo} (${data.customer_name || 'Customer'})`,
      created_by_role: data.created_by_role,
      created_by_name: data.created_by_name,
      last_edited_by_role: data.last_edited_by_role,
      last_edited_by_name: data.last_edited_by_name,
      date: data.payment_date || data.created_at,
      created_at: data.created_at
    });

    return `
      <div class="transaction-card payment-card" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
        <div class="card-marker payment-marker"></div>
        <div class="card-content">
          <div class="card-header-row">
            <div class="card-title-block">
              <span class="card-badge payment-badge">✓</span>
              <div>
                <div class="card-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span>Payment ${refNo}</span> ${workerBadgeHtml}</div>
                <div class="card-subtitle">${data.customer_name || 'Unknown'}</div>
              </div>
            </div>
            <div class="card-amount-block">
              <div class="card-amount payment-amount">−₹${amount.toFixed(2)}</div>
              <div class="card-date">${date}</div>
            </div>
          </div>
          <div class="card-details-row">
            <span class="detail-item">💳 ${medium}</span>
            ${data.notes ? `<span class="detail-item">${data.notes}</span>` : ''}
            ${data.attachment_data ? `<span class="detail-item" style="cursor: pointer; color: #3b82f6; font-weight: bold;" onclick="event.stopPropagation(); window.HistoryView.showViewer('${data.attachment_data}', '${data.reference_number || 'Payment'}')">🖼️ View Attachment</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderCreditCard(data, date) {
    const refNo = data.reference_no || data.reference_number || `CREDIT-${data.id || ''}`;
    const amount = Number(data.credit_amount || 0) || 0;
    const reason = data.reason || 'General Credit';
    const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge)
      ? window.renderWorkerBadge(data, { compact: true })
      : '';

    const auditInfo = JSON.stringify({
      type: 'Credit Note',
      id: data.id,
      name: `Credit Note ${refNo} (${data.customer_name || 'Customer'})`,
      created_by_role: data.created_by_role,
      created_by_name: data.created_by_name,
      last_edited_by_role: data.last_edited_by_role,
      last_edited_by_name: data.last_edited_by_name,
      date: data.payment_date || data.created_at,
      created_at: data.created_at
    });

    return `
      <div class="transaction-card credit-card" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
        <div class="card-marker credit-marker"></div>
        <div class="card-content">
          <div class="card-header-row">
            <div class="card-title-block">
              <span class="card-badge credit-badge">💳</span>
              <div>
                <div class="card-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span>Credit Note ${refNo}</span> ${workerBadgeHtml}</div>
                <div class="card-subtitle">${data.customer_name || 'Unknown'}</div>
              </div>
            </div>
            <div class="card-amount-block">
              <div class="card-amount credit-amount">+₹${amount.toFixed(2)}</div>
              <div class="card-date">${date}</div>
            </div>
          </div>
          <div class="card-details-row">
            <span class="detail-item">📋 ${reason}</span>
            ${data.notes ? `<span class="detail-item">${data.notes}</span>` : ''}
            ${data.attachment_data ? `<span class="detail-item" style="cursor: pointer; color: #3b82f6; font-weight: bold;" onclick="event.stopPropagation(); window.HistoryView.showViewer('${data.attachment_data}', '${data.reference_number || 'Credit'}')">🖼️ View Attachment</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }
}

// Static helper to display image overlay
HistoryView.showViewer = function(imgData, refName = 'Unknown') {
  const modalId = 'history-unified-doc-modal-' + Date.now();
  const title = '🖼️ Attachment: ' + refName;

  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483646;pointer-events:auto;';
    
    modal.innerHTML = `
      <div style="position:fixed;top:5%;left:5%;width:90%;height:90%;background:white;border-radius:8px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);z-index:2147483647;font-family:'Courier New',monospace;">
        <div style="padding:16px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.5px;">${title}</h3>
          <div style="display:flex;gap:8px;align-items:center;color:#666;">
            <span style="font-size:10px;color:#999;">Hold Z + scroll/drag to zoom/pan | Double-click to reset</span>
            <button id="close-hist-unified-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;margin-left:12px;">&times;</button>
          </div>
        </div>
        <div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
          <img id="hist-unified-img" src="${imgData}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
        <div style="padding:12px;border-top:1px solid rgba(0,0,0,0.1);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;">
          <button id="download-hist-btn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">📥 Download</button>
          <button id="close-hist-btn" style="padding:8px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeHandler = () => { modal.remove(); };
    document.getElementById('close-hist-unified-modal').onclick = closeHandler;
    document.getElementById('close-hist-btn').onclick = closeHandler;
    
    document.getElementById('download-hist-btn').onclick = () => {
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `Attachment-${refName}.png`;
      a.click();
    };

    modal.onclick = (e) => { if (e.target === modal) closeHandler(); };

    // Setup zoom/pan interactions
    (function setupPreviewInteractions() {
      const img = document.getElementById('hist-unified-img');
      if (!img) return;

      const modalEl = document.getElementById(modalId);
      let scale = 1;
      let minScale = 0.2;
      let maxScale = 5;
      let translate = { x: 0, y: 0 };
      let isPanning = false;
      let lastPointer = { x: 0, y: 0 };
      let zPressed = false;

      const applyTransform = () => {
        img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
        img.style.transformOrigin = 'center center';
      };

      window.addEventListener('keydown', (e) => { if (e.key === 'z' || e.key === 'Z') zPressed = true; });
      window.addEventListener('keyup', (e) => { if (e.key === 'z' || e.key === 'Z') zPressed = false; });

      modalEl.addEventListener('wheel', (ev) => {
        if (!zPressed) return;
        ev.preventDefault();
        const delta = -ev.deltaY;
        const factor = delta > 0 ? 1.12 : 0.88;
        const prevScale = scale;
        scale = Math.min(maxScale, Math.max(minScale, scale * factor));

        const rect = img.getBoundingClientRect();
        const offsetX = ev.clientX - rect.left - rect.width / 2;
        const offsetY = ev.clientY - rect.top - rect.height / 2;
        translate.x -= offsetX * (scale / prevScale - 1);
        translate.y -= offsetY * (scale / prevScale - 1);

        applyTransform();
      }, { passive: false });

      modalEl.addEventListener('contextmenu', (ev) => { if (zPressed) ev.preventDefault(); });

      modalEl.addEventListener('pointerdown', (ev) => {
        if (!(zPressed && ev.button === 2)) return;
        ev.preventDefault();
        isPanning = true;
        lastPointer.x = ev.clientX;
        lastPointer.y = ev.clientY;
        modalEl.setPointerCapture(ev.pointerId);
        img.style.cursor = 'grabbing';
      });

      modalEl.addEventListener('pointermove', (ev) => {
        if (!isPanning) return;
        ev.preventDefault();
        const dx = ev.clientX - lastPointer.x;
        const dy = ev.clientY - lastPointer.y;
        lastPointer.x = dx;
        lastPointer.y = dy;
        translate.x += dx;
        translate.y += dy;
        applyTransform();
      });

      modalEl.addEventListener('pointerup', (ev) => {
        if (!isPanning) return;
        isPanning = false;
        try { modalEl.releasePointerCapture(ev.pointerId); } catch (e) {}
        img.style.cursor = 'auto';
      });

      img.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        scale = 1; translate.x = 0; translate.y = 0;
        applyTransform();
      });

      img.style.transition = 'transform 120ms ease-out';
      img.style.willChange = 'transform';
      img.style.cursor = 'auto';
      applyTransform();
    })();
  }
};

// Make accessible globally
window.HistoryView = HistoryView;
