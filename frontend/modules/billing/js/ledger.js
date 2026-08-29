/**
 * LedgerView - Manages billing ledger functionality
 * Handles customer records, bills, payments, and financial tracking
 */

class LedgerView {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.viewContainer = billingApp.viewContainer;
    window.currentLedgerView = this;
    
    // Don't cache billingData - always reference it from billingApp
    
    this.pollingInterval = null;
    this.updatedCustomerIds = new Set();
    this.oldLedgerSnapshot = null;
  }

  startPolling(interval = 8000) {
    this.stopPolling();
    this.pollingInterval = setInterval(() => this.syncWithServer(), interval);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async syncWithServer(isManual = false) {
    try {
      // Guard: Don't sync if this is not the active visible view in the registry
      if (this.billingApp.currentViewInstance !== this) {
        this.stopPolling();
        return;
      }
      
      // 1. Refresh global billing data (bills, payments, ...)
      // We MUST await this before getLedgerData because it joins with these arrays
      if (this.billingApp.loadBillingDataFromAPI) {
        await this.billingApp.loadBillingDataFromAPI();
      }
      
      // 2. Aggregate fresh data for Ledger
      const ledgerData = await this.getLedgerData();
      
      // 3. Sync to UI
      this.syncLedger(ledgerData, isManual);
    } catch (e) {
      console.warn('Ledger sync failed:', e);
    }
  }


  getDaysAgo(dateStr) {
    if (!dateStr || dateStr === 'N/A') return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      
      const now = new Date();
      // Set both to start of day for accurate day counting
      const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      const diffTime = startOfNow - startOfDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return '0D';
      if (diffDays === 1) return '1D';
      return `${diffDays}D`;
    } catch (e) {
      return null;
    }
  }

  /**
   * FIFO Settlement Logic
   * Reconciles payments and opening balance against bills to track settlement duration.
   * This handles the case where payments are not explicitly linked to bills.
   */
  calculateSettlementMap(bills, payments, openingBalance = 0) {
    const settlementMap = {};
    if (!bills || bills.length === 0) return settlementMap;

    // 1. Sort bills by date (earliest first for FIFO)
    const sortedBills = [...bills].sort((a, b) => {
      const dateA = new Date(a.invoice_date || a.bill_date || a.created_at);
      const dateB = new Date(b.invoice_date || b.bill_date || b.created_at);
      return dateA - dateB;
    });

    // 2. Prepare credit queue (earliest payments first)
    const sortedPayments = [...payments].sort((a, b) => {
      const dateA = new Date(a.payment_date || a.date || a.created_at);
      const dateB = new Date(b.payment_date || b.date || b.created_at);
      return dateA - dateB;
    });

    const pQueue = sortedPayments.map(p => ({
      remaining: p.amount || p.credit_amount || 0,
      date: p.payment_date || p.date || p.created_at
    }));

    // 3. FIFO Reconciliation starting with Opening Balance
    // Sign convention: Negative opening balance = CREDIT, Positive = DEBT
    let availableCredit = 0;
    let debtToSettleFirst = 0;
    let initialCreditDate = null;
    
    if (openingBalance < 0) {
      availableCredit = Math.abs(openingBalance);
      // For opening credit, we assume the "settlement date" for anything it pays is the date of the first bill
      // or we can just leave it as null to signify it's pre-settled.
    } else {
      debtToSettleFirst = openingBalance;
    }

    // A. Apply payments to initial debt (Opening Balance Debt) first
    while (debtToSettleFirst > 0 && pQueue.length > 0) {
      const p = pQueue[0];
      const consumed = Math.min(debtToSettleFirst, p.remaining);
      debtToSettleFirst -= consumed;
      p.remaining -= consumed;
      if (p.remaining <= 0) pQueue.shift();
    }

    // B. Reconcile invoices
    sortedBills.forEach(bill => {
      const billId = bill.id;
      const billAmount = bill.grand_total || bill.total || bill.amount || 0;
      let remainingToSettle = billAmount;
      let lastCreditDate = null;

      // 1. Consume available credit (from Negative Opening Balance)
      if (availableCredit > 0) {
        const consumed = Math.min(remainingToSettle, availableCredit);
        remainingToSettle -= consumed;
        availableCredit -= consumed;
        if (remainingToSettle <= 0) {
          // Settled by opening credit - use bill date as settlement date (0 days)
          lastCreditDate = bill.invoice_date || bill.bill_date || bill.created_at;
        }
      }

      // 2. Consume payments from the queue
      while (remainingToSettle > 0 && pQueue.length > 0) {
        const p = pQueue[0];
        const consumed = Math.min(remainingToSettle, p.remaining);
        remainingToSettle -= consumed;
        p.remaining -= consumed;
        
        if (p.remaining <= 0) pQueue.shift();
        
        if (remainingToSettle <= 0) {
          lastCreditDate = p.date;
        }
      }

      // 3. Record the settlement duration
      const invoiceDateStr = bill.invoice_date || bill.bill_date || bill.created_at;
      const invoiceDate = new Date(invoiceDateStr);
      
      if (remainingToSettle <= 0 && lastCreditDate) {
        const settleDate = new Date(lastCreditDate);
        const diffTime = Math.max(0, settleDate - invoiceDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        settlementMap[billId] = { settled: true, days: diffDays || 1 };
      } else {
        // Still outstanding
        const now = new Date();
        const diffTime = Math.max(0, now - invoiceDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        settlementMap[billId] = { settled: false, days: diffDays || 1 };
      }
    });

    return settlementMap;
  }

  syncLedger(newData, isImmediate = false) {
    // Guard: Ensure we have DOM elements to update
    if (!document.getElementById('ledgerTotalDue')) return;
    
    // Identify granular changes for robust animations
    const newBillIds = new Set();
    const updatedBillIds = new Set();
    const newPaymentIds = new Set();
    const updatedPaymentIds = new Set();
    this.updatedCustomerIds = new Set();

    if (this.oldLedgerSnapshot) {
      newData.forEach(newCust => {
        const oldCust = this.oldLedgerSnapshot.find(c => c.customerName === newCust.customerName);
        
        // Track customer-level changes for sidebar pulses
        if (!oldCust || oldCust.amountDue !== newCust.amountDue || oldCust.total_bills !== newCust.total_bills || oldCust.total_payments !== newCust.total_payments) {
          this.updatedCustomerIds.add(newCust.customerName);
        }

        // Track bill-level changes
        (newCust.bills || []).forEach(newBill => {
          const oldBill = oldCust ? (oldCust.bills || []).find(b => String(b.id) === String(newBill.id)) : null;
          if (!oldBill) {
            newBillIds.add(newBill.id);
          } else if (JSON.stringify(oldBill) !== JSON.stringify(newBill)) {
            updatedBillIds.add(newBill.id);
          }
        });

        // Track payment/credit note level changes
        (newCust.payments || []).forEach(newPmt => {
          const oldPmt = oldCust ? (oldCust.payments || []).find(p => String(p.id) === String(newPmt.id)) : null;
          if (!oldPmt) {
            newPaymentIds.add(newPmt.id);
          } else if (JSON.stringify(oldPmt) !== JSON.stringify(newPmt)) {
            updatedPaymentIds.add(newPmt.id);
          }
        });
      });
    } else {
      // First sync after load - map initial customers for future diffing
      this.oldLedgerSnapshot = newData;
      window.currentLedgerData = newData;
      this.renderLedgerSidebar(newData);
      this.renderLedgerBillsAndPayments(newData, window.currentSelectedCustomer);
      return;
    }

    // Quick diff to check if anything changed at all (original optimization)
    const oldSnapshotSummary = JSON.stringify(this.oldLedgerSnapshot.map(c => ({ n: c.customerName, d: c.amountDue, b: c.total_bills, p: c.total_payments })));
    const newSnapshotSummary = JSON.stringify(newData.map(c => ({ n: c.customerName, d: c.amountDue, b: c.total_bills, p: c.total_payments })));
    
    if (oldSnapshotSummary === newSnapshotSummary && !isImmediate && 
        newBillIds.size === 0 && updatedBillIds.size === 0 && 
        newPaymentIds.size === 0 && updatedPaymentIds.size === 0) {
      return;
    }

    this.oldLedgerSnapshot = newData;
    window.currentLedgerData = newData;
    
    // Update stats and sidebar
    this.renderLedgerSidebar(newData);
    
    // Refresh main workspace:
    const selectedCustomer = window.currentSelectedCustomer;
    if (window.currentViewMode !== 'timeline') {
      this.renderLedgerBillsAndPayments(newData, selectedCustomer);
      
      if ((selectedCustomer && this.updatedCustomerIds.has(selectedCustomer)) || (!selectedCustomer && this.updatedCustomerIds.size > 0)) {
        this.applyUpdatePulse();
      }
    } else {
      this.showTimelineView(newData);
    }
    
    // Pulse the stats and records with robust animations
    // Added 50ms delay to ensure elements are fully painted before querying
    setTimeout(() => {
      if (newBillIds.size > 0 || updatedBillIds.size > 0 || newPaymentIds.size > 0 || updatedPaymentIds.size > 0) {
        console.log(`[Ledger Sync] Animating: Bills(New:${newBillIds.size}, Upd:${updatedBillIds.size}), Pmts(New:${newPaymentIds.size}, Upd:${updatedPaymentIds.size})`);
      }
      this.applyLedgerSyncAnimations({
        newBillIds, updatedBillIds, newPaymentIds, updatedPaymentIds
      });
    }, 50);
  }

  applyLedgerSyncAnimations(idSets = {}) {
    const { newBillIds, updatedBillIds, newPaymentIds, updatedPaymentIds } = idSets;

    // Pulse header stats
    ['ledgerTotalDue', 'ledgerTotalBills', 'ledgerTotalPayments', 'ledgerTotalCustomers'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('animate-stat-change');
        void el.offsetWidth;
        el.classList.add('animate-stat-change');
      }
    });

    // Pulse updated sidebar items
    this.updatedCustomerIds.forEach(custName => {
      const el = document.querySelector(`.ledger-sidebar-item[data-customer="${custName}"]`);
      if (el) {
        el.classList.remove('animate-pulse-gold');
        void el.offsetWidth;
        el.classList.add('animate-pulse-gold');
        setTimeout(() => el.classList.remove('animate-pulse-gold'), 2000);
      }
    });

    // Apply robust record-level highlight animations
    const applyRecordAnim = (id, type, animClass) => {
      const selector = `[data-${type}-id="${id}"]`;
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        // Reset animation state
        el.classList.remove('highlight-new', 'highlight-updated', 'animate-fade-in');
        void el.offsetWidth; // Force reflow
        
        el.classList.add('animate-fade-in', animClass);
        // Remove highlight but keep fade-in or normal state after animation
        setTimeout(() => el.classList.remove(animClass), 3000);
      });
    };

    if (newBillIds) newBillIds.forEach(id => applyRecordAnim(id, 'bill', 'highlight-new'));
    if (updatedBillIds) updatedBillIds.forEach(id => applyRecordAnim(id, 'bill', 'highlight-updated'));
    if (newPaymentIds) newPaymentIds.forEach(id => applyRecordAnim(id, 'payment', 'highlight-new'));
    if (updatedPaymentIds) updatedPaymentIds.forEach(id => applyRecordAnim(id, 'payment', 'highlight-updated'));
  }

  async render() {
    // Make this instance available globally for toolbar buttons
    window.currentLedgerView = this;
    
    // Initialize view state
    window.currentViewMode = 'list';
    
    this.viewContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;">
        <!-- Combined Top Header with Stats (spans full width) -->
        <div style="padding: 24px 20px; border-bottom: 2px solid #1a1a1a; background: #0a0a0a; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
          <div style="font-size: 13px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1.2px;">
            ◆ LEDGER <span style="color: #666666; font-size: 11px;">|</span> <span style="font-size: 10px; color: #888888; text-transform: uppercase; font-weight: 500; letter-spacing: 0.8px;">FINANCIAL RECORDS</span>
          </div>
          
          <!-- Stats -->
          <div style="display: flex; gap: 12px; font-size: 10px; color: #aaaaaa;">
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">TOTAL DUE</div><span id="ledgerTotalDue" style="color: #ffffff; font-weight: 700; font-size: 12px;">₹0</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">TOTAL BILLS</div><span id="ledgerTotalBills" style="color: #ffffff; font-weight: 700; font-size: 12px;">0</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">TOTAL PAYMENTS</div><span id="ledgerTotalPayments" style="color: #ffffff; font-weight: 700; font-size: 12px;">0</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">CUSTOMERS</div><span id="ledgerTotalCustomers" style="color: #ffffff; font-weight: 700; font-size: 12px;">0</span></div>
          </div>
          
          <!-- Controls -->
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="ledgerListBtn" style="padding: 8px 12px; font-size: 11px; font-weight: 700; border: 1px solid #555555; background: transparent; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 6px;">☰ LIST</button>
            <select id="ledgerDateFilter" style="padding: 6px 10px; font-size: 11px; border: 1px solid #555555; background: #1a1a1a; color: #aaaaaa; cursor: pointer; border-radius: 2px; font-family: 'Courier New', monospace; font-weight: 600;">
              <option value="all">All Dates</option>
              <option value="this-month">This Month</option>
              <option value="last-3">Last 3 Months</option>
              <option value="last-6">Last 6 Months</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>

        <!-- Flex container for sidebar and main -->
        <div style="display: flex; flex: 1; overflow: hidden;">
          <!-- SIDEBAR: Customer Navigation -->
          <div id="ledgerSidebar" style="width: 340px; background: #000000; display: flex; flex-direction: column; overflow: hidden; border-right: 2px solid #1a1a1a; transition: width 0.3s ease, opacity 0.3s ease;">

          <!-- Search & Controls -->
          <div id="ledgerSidebarControls" style="padding: 16px; border-bottom: 2px solid #1a1a1a; background: #0a0a0a;">
            <input type="text" id="ledgerSidebarSearch" placeholder="Search..." style="width: 100%; padding: 10px 12px; font-size: 12px; border: 1px solid #333333; border-radius: 3px; background: #1a1a1a; color: #ffffff; margin-bottom: 10px; font-family: 'Courier New', monospace;">
            <select id="ledgerSidebarSort" style="width: 100%; padding: 10px 12px; font-size: 11px; border: 1px solid #333333; border-radius: 3px; background: #1a1a1a; color: #aaaaaa; font-family: 'Courier New', monospace;">
              <option value="name-asc">━ Name (A-Z)</option>
              <option value="name-desc">━ Name (Z-A)</option>
              <option value="due-desc">━ Amount Due</option>
              <option value="overdue-desc">━ Days Overdue</option>
              <option value="recent">━ Most Recent</option>
            </select>
          </div>

          <!-- Customer List -->
          <div id="ledgerSidebarList" style="flex: 1; overflow-y: auto; padding: 4px; background: #000000;">
            <div style="padding: 40px 20px; text-align: center; color: #555555; font-size: 12px;">Loading...</div>
          </div>
        </div>

        <!-- MAIN WORKSPACE: Bills & Payments -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #ffffff;">
          <!-- Selected Customer Header -->
          <div style="padding: 24px 32px; background: #ffffff; border-bottom: 2px solid #000000; flex-shrink: 0;">
            <h1 id="ledgerSelectedCustomer" style="margin: 0 0 4px 0; font-size: 28px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">All Customers</h1>
            <p id="ledgerCustomerMetrics" style="margin: 0; font-size: 12px; color: #666666; font-weight: 500;">Select a customer to view financial records</p>
          </div>

          <!-- Filter & View Controls -->
          <div class="ledger-filter-controls" style="padding: 6px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
            <button id="ledgerViewBills" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">BILLS</button>
            <button id="ledgerViewPayments" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">PAYMENTS</button>
            <button id="ledgerViewAll" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s;">BOTH</button>
            <div style="flex: 1;"></div>
            <button id="ledgerListViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s;">☰ LIST</button>
            <button id="ledgerTimeViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">▬ TIME</button>
          </div>

          <!-- Two-Column / Unified Workspace -->
          <div class="ledger-columns-container" style="flex: 1; display: flex; gap: 20px; overflow: hidden; padding: 20px 32px;">
            <!-- Bills Column -->
            <div class="ledger-bills-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
                <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">BILLS</h3>
                <span id="ledgerBillsCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
              </div>
              <div id="ledgerBillsContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
                <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No bills to display</div>
              </div>
            </div>

            <!-- Payments Column -->
            <div class="ledger-payments-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
                <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">PAYMENTS</h3>
                <span id="ledgerPaymentsCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
              </div>
              <div id="ledgerPaymentsContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
                <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No payments to display</div>
              </div>
            </div>

            <!-- Unified Column (Mobile BOTH / Stream View) -->
            <div class="ledger-unified-column" style="display: none; flex: 1; flex-direction: column; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
                <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">ALL TRANSACTIONS</h3>
                <span id="ledgerUnifiedCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
              </div>
              <div id="ledgerUnifiedContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
                <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No transactions to display</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Inject ledger styles
    this.injectLedgerStyles();

    // Setup LIST button toggle
    this.setupListButtonToggle();

    // Load data
    await this.loadDualLedgerView();

    // Check for deep link parameters
    if (this.params && (this.params.customerId || this.params.customerName)) {
      console.log(`🔗 LedgerView: Handling deep link for ${this.params.customerName || this.params.customerId}`);
      
      setTimeout(() => {
        // Find customer in ledgerData
        const customer = window.currentLedgerData?.find(c => 
          (this.params.customerName && c.customerName === this.params.customerName) || 
          (this.params.customerId && String(c.customerId) === String(this.params.customerId))
        );
        
        if (customer) {
          // Trigger selection using the existing click logic or direct call
          this.renderLedgerBillsAndPayments(window.currentLedgerData, customer.customerName);
          
          // Also highlight/activate in sidebar
          setTimeout(() => {
            const sidebarItem = document.querySelector(`.ledger-sidebar-item[data-customer="${customer.customerName}"]`);
            if (sidebarItem) {
              sidebarItem.click();
              sidebarItem.scrollIntoView({ block: 'center' });
            }
          }, 300);
        }
        this.params = null; // Clear after use
      }, 500);
    }
  }

  setupListButtonToggle() {
    const listBtn = document.getElementById('ledgerListBtn');
    const sidebar = document.getElementById('ledgerSidebar');
    const sidebarControls = document.getElementById('ledgerSidebarControls');
    const sidebarList = document.getElementById('ledgerSidebarList');
    const flexContainer = sidebar?.parentElement; // Parent flex container
    const mainWorkspace = flexContainer?.querySelector('div[style*="flex: 1"]'); // Main workspace div

    if (!listBtn || !sidebar || !sidebarControls || !sidebarList) return;

    // Check if mobile view (less than 768px)
    const isMobile = window.innerWidth < 768;
    let isVisible = !isMobile; // Start closed on mobile, open on desktop

    // Apply initial state
    if (!isVisible) {
      sidebar.style.width = '0';
      sidebar.style.opacity = '0';
      sidebarControls.style.display = 'none';
      sidebarList.style.display = 'none';
      listBtn.style.opacity = '0.6';
    }

    listBtn.addEventListener('click', () => {
      isVisible = !isVisible;
      if (isVisible) {
        // Open sidebar
        if (window.innerWidth < 768) {
          // On mobile, fill entire container
          sidebar.style.width = '100%';
          if (mainWorkspace) mainWorkspace.style.display = 'none';
        } else {
          // On desktop, 340px width
          sidebar.style.width = '340px';
          if (mainWorkspace) mainWorkspace.style.display = 'flex';
        }
        sidebar.style.opacity = '1';
        sidebarControls.style.display = 'block';
        sidebarList.style.display = 'block';
      } else {
        // Close sidebar
        sidebar.style.width = '0';
        sidebar.style.opacity = '0';
        sidebarControls.style.display = 'none';
        sidebarList.style.display = 'none';
        if (mainWorkspace) mainWorkspace.style.display = 'flex';
      }
      listBtn.style.opacity = isVisible ? '1' : '0.6';
    });

    // Handle window resize to adjust sidebar width when open
    window.addEventListener('resize', () => {
      const nowMobile = window.innerWidth < 768;
      if (isVisible) {
        // Only adjust width/display if sidebar is already open
        if (nowMobile) {
          // If now mobile, make it full width
          sidebar.style.width = '100%';
          if (mainWorkspace) mainWorkspace.style.display = 'none';
        } else {
          // If now desktop, set to 340px
          sidebar.style.width = '340px';
          if (mainWorkspace) mainWorkspace.style.display = 'flex';
        }
      }
    });
  }

  async loadDualLedgerView() {
    try {
      // 1. Fire-and-forget management tasks (Recalculate & Activity status)
      // These are important but shouldn't block the initial render - the polling will pick up the changes
      fetch('/api/billing/invoices/ledger/recalculate', { method: 'POST' })
        .catch(e => console.warn('Background recalculate failed:', e));
        
      fetch('/api/contacts/activity/update-all', { method: 'POST' })
        .catch(e => console.warn('Background activity update failed:', e));

      // 2. Immediate Data Load
      const ledgerData = await this.getLedgerData();
      window.currentBillingApp = this.billingApp;
      window.currentLedgerView = this;
      window.currentLedgerData = ledgerData;
      
      // DEBUG: Log the data we received
      console.log('Ledger Data loaded:', ledgerData);
      if (ledgerData.length > 0) {
        console.log('First customer:', ledgerData[0], 'total_bills:', ledgerData[0].total_bills, 'total_payments:', ledgerData[0].total_payments);
      }
      
      // Update header stats with totals - FILTER OUT EXCLUDED CUSTOMERS (except for workers)
      const isWorker = (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
      const statsCustomers = ledgerData.filter(c => {
        if (isWorker) return true;
        return c.exclude_from_stats !== 1 && c.exclude_from_stats !== '1' && c.exclude_from_stats !== true;
      });
      
      const totalBills = statsCustomers.reduce((sum, c) => sum + (c.total_bills || 0), 0);
      const totalPayments = statsCustomers.reduce((sum, c) => sum + (c.total_payments || 0), 0);
      const totalDue = statsCustomers.reduce((sum, c) => sum + (c.amountDue || 0), 0);
      
      console.log('[Ledger Header] Calculated totals - Bills:', totalBills, 'Payments:', totalPayments, 'Due:', totalDue, 'Stats Customers:', statsCustomers.length);
      
      const totalBillsSpan = document.getElementById('ledgerTotalBills');
      const totalPaymentsSpan = document.getElementById('ledgerTotalPayments');
      
      if (totalBillsSpan) totalBillsSpan.textContent = totalBills;
      if (totalPaymentsSpan) totalPaymentsSpan.textContent = totalPayments;
      
      const totalDueSpan = document.getElementById('ledgerTotalDue');
      if (totalDueSpan) totalDueSpan.textContent = '₹' + totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const totalCustomersSpan = document.getElementById('ledgerTotalCustomers');
      if (totalCustomersSpan) totalCustomersSpan.textContent = statsCustomers.length;
      
      const sidebarList = document.getElementById('ledgerSidebarList');
      if (sidebarList) {
        this.renderLedgerSidebar(ledgerData);
        this.renderLedgerBillsAndPayments(ledgerData, null);
        this.setupViewToggleButtons(ledgerData);
      }
    } catch (e) {
      console.error('Error loading ledger:', e);
      document.getElementById('ledgerSidebarList').innerHTML = `<div style="padding: 16px; color: #ef4444;">Error: ${e.message}</div>`;
    }
  }
  setupViewToggleButtons(ledgerData) {
    // Remove old listeners by cloning and replacing
    const listBtn = document.getElementById('ledgerListViewBtn');
    const timeBtn = document.getElementById('ledgerTimeViewBtn');

    if (!listBtn || !timeBtn) return;

    const newListBtn = listBtn.cloneNode(true);
    const newTimeBtn = timeBtn.cloneNode(true);
    
    listBtn.parentNode.replaceChild(newListBtn, listBtn);
    timeBtn.parentNode.replaceChild(newTimeBtn, timeBtn);

    newListBtn.addEventListener('click', () => {
      newListBtn.style.background = '#000000';
      newListBtn.style.color = '#ffffff';
      newTimeBtn.style.background = '#ffffff';
      newTimeBtn.style.color = '#000000';
      this.showListView(ledgerData);
    });

    newTimeBtn.addEventListener('click', () => {
      newTimeBtn.style.background = '#000000';
      newTimeBtn.style.color = '#ffffff';
      newListBtn.style.background = '#ffffff';
      newListBtn.style.color = '#000000';
      this.showTimelineView(ledgerData);
    });
  }

  showListView(ledgerData) {
    // Store current mode
    window.currentViewMode = 'list';
    
    // Find the main workspace container - it has id ledgerSelectedCustomer inside it
    const customerHeader = document.getElementById('ledgerSelectedCustomer');
    if (!customerHeader) return;
    
    let mainWorkspace = customerHeader.closest('[style*="flex: 1; display: flex; flex-direction: column"]');
    if (!mainWorkspace) {
      mainWorkspace = customerHeader.parentElement.parentElement;
    }
    if (!mainWorkspace) return;

    // Clear the workspace
    mainWorkspace.innerHTML = `
      <div style="padding: 24px 32px; background: #ffffff; border-bottom: 2px solid #000000; flex-shrink: 0;">
        <h1 id="ledgerSelectedCustomer" style="margin: 0 0 4px 0; font-size: 28px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">All Customers</h1>
        <p id="ledgerCustomerMetrics" style="margin: 0; font-size: 12px; color: #666666; font-weight: 500;">Select a customer to view financial records</p>
      </div>
      <div class="ledger-filter-controls" style="padding: 6px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
        <button id="ledgerViewBills" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">BILLS</button>
        <button id="ledgerViewPayments" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">PAYMENTS</button>
        <button id="ledgerViewAll" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s;">BOTH</button>
        <div style="flex: 1;"></div>
        <button id="ledgerListViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s;">☰ LIST</button>
        <button id="ledgerTimeViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">▬ TIME</button>
      </div>
      <div class="ledger-columns-container" style="flex: 1; display: flex; gap: 20px; overflow: hidden; padding: 20px 32px;">
        <div class="ledger-bills-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
            <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">BILLS</h3>
            <span id="ledgerBillsCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
          </div>
          <div id="ledgerBillsContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
            <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No bills to display</div>
          </div>
        </div>
        <div class="ledger-payments-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
            <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">PAYMENTS</h3>
            <span id="ledgerPaymentsCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
          </div>
          <div id="ledgerPaymentsContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
            <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No payments to display</div>
          </div>
        </div>
        <div class="ledger-unified-column" style="display: none; flex: 1; flex-direction: column; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
            <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">ALL TRANSACTIONS</h3>
            <span id="ledgerUnifiedCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
          </div>
          <div id="ledgerUnifiedContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0;">
            <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">No transactions to display</div>
          </div>
        </div>
      </div>
    `;

    // Render the data, preserving any currently selected customer
    const selected = window.currentSelectedCustomer || null;
    this.renderLedgerBillsAndPayments(ledgerData, selected);

    // Ensure sidebar reflects the current selection
    try {
      const sidebarItems = document.querySelectorAll('#ledgerSidebarList .ledger-sidebar-item');
      sidebarItems.forEach(i => {
        if (selected && i.dataset && i.dataset.customer === selected) {
          i.classList.add('active');
          i.style.background = '#2a2a2a';
          i.style.borderColor = '#ffffff';
          i.style.borderLeftColor = '#ffffff';
          i.style.boxShadow = 'inset 0 0 0 1px #ffffff';
          // bring into view
          i.scrollIntoView({ block: 'nearest' });
        } else {
          i.classList.remove('active');
          i.style.background = '#1a1a1a';
          i.style.borderColor = '#333333';
          i.style.borderLeftColor = '#333333';
          i.style.boxShadow = 'none';
        }
      });
    } catch (e) {
      // ignore if sidebar isn't present
    }
    
    // Re-attach button listeners
    setTimeout(() => this.setupViewToggleButtons(ledgerData), 0);
  }

  restoreListView(ledgerData) {
    this.showListView(ledgerData);
  }

  renderLedgerSidebar(ledgerData) {
    const sidebar = document.getElementById('ledgerSidebarList');
    const searchInput = document.getElementById('ledgerSidebarSearch');
    const sortSelect = document.getElementById('ledgerSidebarSort');
    const totalCustomersSpan = document.getElementById('ledgerTotalCustomers');
    const totalDueSpan = document.getElementById('ledgerTotalDue');

    const renderSidebarList = () => {
      let filtered = [...ledgerData];
      
      if (searchInput.value) {
        const q = searchInput.value.toLowerCase();
        filtered = filtered.filter(c => c.customerName.toLowerCase().includes(q));
      }

      switch(sortSelect.value) {
        case 'name-desc':
          filtered.sort((a, b) => b.customerName.localeCompare(a.customerName));
          break;
        case 'due-desc':
          filtered.sort((a, b) => b.amountDue - a.amountDue);
          break;
        case 'overdue-desc':
          filtered.sort((a, b) => b.daysOverdue - a.daysOverdue);
          break;
        case 'recent':
          filtered.sort((a, b) => new Date(b.lastBillDate) - new Date(a.lastBillDate));
          break;
        default:
          filtered.sort((a, b) => a.customerName.localeCompare(b.customerName));
      }

      if (filtered.length === 0) {
        sidebar.innerHTML = '<div style="padding: 24px 16px; text-align: center; color: #555555; font-size: 12px;">No customers found</div>';
        return;
      }

      const statsFiltered = filtered.filter(c => isWorker || !c.exclude_from_stats);
      totalCustomersSpan.textContent = statsFiltered.length;
      const totalDue = statsFiltered.reduce((sum, c) => sum + (c.amountDue || 0), 0);
      // Show positive value if there's overall credit (negative balance)
      const displayTotalDue = Math.abs(totalDue);
      const totalDueColor = totalDue < 0 ? '#10b981' : '#ffffff';
      totalDueSpan.textContent = '₹' + displayTotalDue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
      totalDueSpan.style.color = totalDueColor;
      
      // Update total bills and payments in header
      const totalBills = statsFiltered.reduce((sum, c) => sum + (c.total_bills || 0), 0);
      const totalPayments = statsFiltered.reduce((sum, c) => sum + (c.total_payments || 0), 0);
      const totalBillsSpan = document.getElementById('ledgerTotalBills');
      const totalPaymentsSpan = document.getElementById('ledgerTotalPayments');
      if (totalBillsSpan) totalBillsSpan.textContent = totalBills;
      if (totalPaymentsSpan) totalPaymentsSpan.textContent = totalPayments;

      sidebar.innerHTML = filtered.map((c, idx) => {
        // Determine status based on amountDue
        let statusText, statusBg, statusBorder, statusColor, displayAmount;
        
        if (c.amountDue < 0) {
          // Negative = Credit balance
          statusText = '✓ CREDIT';
          statusBg = '#d1fae5';
          statusBorder = '#059669';
          statusColor = '#059669';
          displayAmount = Math.abs(c.amountDue); // Show as positive
        } else if (c.amountDue === 0) {
          // Zero = Settled
          statusText = '✓ SETTLED';
          statusBg = '#1a1a1a';
          statusBorder = '#333333';
          statusColor = '#ffffff';
          displayAmount = 0;
        } else if (c.daysOverdue > 0) {
          // Positive with overdue = Overdue
          statusText = '⚠ OVERDUE';
          statusBg = '#1a1a1a';
          statusBorder = '#666666';
          statusColor = '#ffffff';
          displayAmount = c.amountDue;
        } else {
          // Positive without overdue = Pending
          statusText = '⏳ PENDING';
          statusBg = '#333333';
          statusBorder = '#555555';
          statusColor = '#000000';
          displayAmount = c.amountDue;
        }
        
        const isActive = window.currentSelectedCustomer === c.customerName;
        
        // Activity counters
        const lastBillDays = this.getDaysAgo(c.lastBillDate);
        const lastPmtDays = this.getDaysAgo(c.lastPaymentDate);
        
        return `
          <div class="ledger-sidebar-item ${isActive ? 'active' : ''}" data-customer="${c.customerName}">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; gap: 8px;">
              <div style="font-weight: 700; color: #ffffff; font-size: 13px; flex: 1; font-family: 'Courier New', monospace; letter-spacing: 0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.customerName}${c.exclude_from_stats ? ' <span title="Excluded from Global Stats">🚫</span>' : ''}</div>
              <div style="font-size: 9px; font-weight: 800; color: ${statusColor}; background: ${statusBg}; border: 1px solid ${statusBorder}; padding: 4px 6px; border-radius: 2px; white-space: nowrap; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${statusText}</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #aaaaaa; margin-bottom: 8px; font-family: 'Courier New', monospace;">
              <span style="font-weight: 600; color: ${c.amountDue < 0 ? '#10b981' : '#ffffff'};">₹${displayAmount.toFixed(0)}</span>
              <span style="padding: 2px 6px; border-radius: 2px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; ${c.active === 'ACTIVE' ? 'background: #d1fae5; color: #4ADE80; border: 1px solid #4ADE80;' : 'background: #fee2e2; color: #dc2626; border: 1px solid #dc2626;'}">${c.active === 'ACTIVE' ? '◆ ACTIVE' : '◇ INACTIVE'}</span>
            </div>
            <div style="display: flex; gap: 10px; font-size: 9px; font-family: 'Courier New', monospace; color: #888888; border-top: 1px solid #222222; padding-top: 8px; margin-top: 4px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: #666666;">BILL:</span>
                <span style="color: ${lastBillDays === '0D' || lastBillDays === '1D' ? '#ffffff' : '#aaaaaa'}; font-weight: 600;">${lastBillDays || 'N/A'}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: #666666;">PMT:</span>
                <span style="color: ${lastPmtDays === '0D' || lastPmtDays === '1D' ? '#10b981' : '#aaaaaa'}; font-weight: 600;">${lastPmtDays || 'N/A'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      sidebar.querySelectorAll('.ledger-sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
          sidebar.querySelectorAll('.ledger-sidebar-item').forEach(i => {
            i.classList.remove('active');
          });
          item.classList.add('active');
          // If timeline is active, update timeline instead of forcing list view
          if (window.currentViewMode === 'timeline') {
            window.currentSelectedCustomer = item.dataset.customer;
            this.showTimelineView(ledgerData);
          } else {
            this.renderLedgerBillsAndPayments(ledgerData, item.dataset.customer);
          }
          if (window.innerWidth < 768) {
            const sidebarElem = document.getElementById('ledgerSidebar');
            const sidebarControlsElem = document.getElementById('ledgerSidebarControls');
            const sidebarListElem = document.getElementById('ledgerSidebarList');
            const listBtnElem = document.getElementById('ledgerListBtn');
            const flexContainer = sidebarElem?.parentElement;
            const mainWorkspace = flexContainer?.querySelector('div[style*="flex: 1"]');
            if (sidebarElem && sidebarControlsElem && sidebarListElem && mainWorkspace) {
              sidebarElem.style.width = '0';
              sidebarElem.style.opacity = '0';
              sidebarControlsElem.style.display = 'none';
              sidebarListElem.style.display = 'none';
              mainWorkspace.style.display = 'flex';
              if (listBtnElem) listBtnElem.style.opacity = '0.6';
            }
          }
        });
      });
    };

    renderSidebarList();
    searchInput.onkeyup = renderSidebarList;
    sortSelect.onchange = renderSidebarList;

    // Double-click on empty space to deselect customer and show all
    sidebar.addEventListener('dblclick', (e) => {
      if (e.target === sidebar || (e.target.parentElement === sidebar)) {
        sidebar.querySelectorAll('.ledger-sidebar-item').forEach(item => {
          item.classList.remove('active');
        });
        document.getElementById('ledgerSelectedCustomer').textContent = 'All Customers';
        document.getElementById('ledgerCustomerMetrics').textContent = 'Select a customer to view financial records';
        // If timeline is active, refresh timeline; otherwise refresh list
        if (window.currentViewMode === 'timeline') {
          window.currentSelectedCustomer = null;
          this.showTimelineView(ledgerData);
        } else {
          this.renderLedgerBillsAndPayments(ledgerData, null);
        }
        if (window.innerWidth < 768) {
          const sidebarElem = document.getElementById('ledgerSidebar');
          const sidebarControlsElem = document.getElementById('ledgerSidebarControls');
          const sidebarListElem = document.getElementById('ledgerSidebarList');
          const listBtnElem = document.getElementById('ledgerListBtn');
          const flexContainer = sidebarElem?.parentElement;
          const mainWorkspace = flexContainer?.querySelector('div[style*="flex: 1"]');
          if (sidebarElem && sidebarControlsElem && sidebarListElem && mainWorkspace) {
            sidebarElem.style.width = '0';
            sidebarElem.style.opacity = '0';
            sidebarControlsElem.style.display = 'none';
            sidebarListElem.style.display = 'none';
            mainWorkspace.style.display = 'flex';
            if (listBtnElem) listBtnElem.style.opacity = '0.6';
          }
        }
      }
    });
  }

  renderLedgerBillsAndPayments(ledgerData, selectedCustomer) {
    // Store the selected customer globally
    window.currentSelectedCustomer = selectedCustomer || null;
    
    let billsToShow = [];
    let paymentsToShow = [];

    if (selectedCustomer) {
      const customer = ledgerData.find(c => c.customerName === selectedCustomer);
      if (customer) {
        billsToShow = customer.bills || [];
        paymentsToShow = customer.payments || [];
        
        const customerHeader = document.getElementById('ledgerSelectedCustomer');
        customerHeader.textContent = selectedCustomer;
        
        const headerContainer = customerHeader.parentElement;
        if (headerContainer && !headerContainer.querySelector('#setLedgerFolderBtn')) {
          const folderBtn = document.createElement('button');
          folderBtn.id = 'setLedgerFolderBtn';
          folderBtn.innerHTML = '📁 FOLDER';
          folderBtn.style.cssText = 'font-size: 10px; padding: 4px 8px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; margin-left: 12px; font-weight: 700; font-family: "Courier New", monospace; vertical-align: middle;';
          folderBtn.onclick = () => this.setExportFolder(selectedCustomer);
          customerHeader.appendChild(folderBtn);
        }
        
        if (headerContainer && !headerContainer.querySelector('#shareLedgerBtn')) {
          const shareBtn = document.createElement('button');
          shareBtn.id = 'shareLedgerBtn';
          shareBtn.innerHTML = '🔗 SHARE LEDGER';
          shareBtn.style.cssText = 'font-size: 10px; padding: 4px 8px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; margin-left: 12px; font-weight: 700; font-family: "Courier New", monospace; vertical-align: middle;';
          shareBtn.onclick = () => {
             const customerObj = ledgerData.find(c => c.customerName === selectedCustomer);
             if (customerObj && customerObj.customer_id) {
               const url = window.location.origin + '/customer-ledger.html?id=' + customerObj.customer_id;
               
               const shareOptions = document.createElement('div');
               shareOptions.style.cssText = 'position: absolute; background: white; border: 1px solid black; padding: 8px; box-shadow: 4px 4px 0 rgba(0,0,0,1); z-index: 2147483647 !important; font-family: "Courier New", monospace;';
               shareOptions.innerHTML = `
                 <div style="margin-bottom: 8px; font-size: 12px; font-weight: bold;">Share Ledger Link:</div>
                 <button id="copyLinkBtn" style="display: block; width: 100%; margin-bottom: 4px; padding: 6px; font-size: 11px; cursor: pointer; background: white; border: 1px solid black;">📋 Copy Link</button>
                 <button id="waLinkBtn" style="display: block; width: 100%; padding: 6px; font-size: 11px; cursor: pointer; background: #25D366; color: white; border: 1px solid black;">💬 WhatsApp</button>
               `;
               
               const rect = shareBtn.getBoundingClientRect();
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
                 const closeFn = (e) => {
                   if (!shareOptions.contains(e.target)) {
                     if (document.body.contains(shareOptions)) document.body.removeChild(shareOptions);
                     document.removeEventListener('click', closeFn);
                   }
                 };
                 document.addEventListener('click', closeFn);
               }, 100);
             } else {
               alert('Customer ID not found. Please wait for sync.');
             }
          };
          customerHeader.appendChild(shareBtn);
        }

        const due = customer.amountDue || 0;
        const openingBalance = customer.opening_balance || 0;
        const daysOverdue = customer.daysOverdue || 0;
        
        // Format the display with opening balance breakdown
        let displayDue = '';
        let openingInfo = '';
        
        if (openingBalance !== 0) {
          const total_debit = customer.total_debit || 0;
          const total_credit = customer.total_credit || 0;
          
          // FIFO Logic: Apply total credit (payments + credit notes) to opening balance first
          const remainingOpening = Math.max(0, openingBalance - total_credit);
          const remainingInvoices = total_debit - Math.max(0, total_credit - openingBalance);
          
          openingInfo = ` | Opening: ₹${remainingOpening.toFixed(2)}`;
          displayDue = `Amount Due: ₹${due.toFixed(2)} (Invoices: ₹${remainingInvoices.toFixed(2)}${openingInfo})`;
        } else {
          displayDue = due < 0 ? `Credit: ₹${Math.abs(due).toFixed(2)}` : `Amount Due: ₹${due.toFixed(2)}`;
        }
        
        const total_credit = customer.total_credit || 0;
        const lastBillDays = this.getDaysAgo(customer.lastBillDate);
        const lastPmtDays = this.getDaysAgo(customer.lastPaymentDate);
        const lastBillStr = lastBillDays ? `${lastBillDays} (${new Date(customer.lastBillDate).toLocaleDateString()})` : 'N/A';
        const lastPmtStr = lastPmtDays ? `${lastPmtDays} (${new Date(customer.lastPaymentDate).toLocaleDateString()})` : 'N/A';
        
        const metrics = `${displayDue} | Total Payments: ₹${total_credit.toFixed(2)} | Days Overdue: ${daysOverdue > 0 ? daysOverdue : 'None'} | Last Bill: ${lastBillStr} | Last Payment: ${lastPmtStr}`;
        document.getElementById('ledgerCustomerMetrics').textContent = metrics;
      }
    } else {
      // Filter out excluded customers for "All Customers" view (except for workers)
      const isWorker = (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
      const statsLedgerData = ledgerData.filter(c => {
        if (isWorker) return true;
        return c.exclude_from_stats !== 1 && c.exclude_from_stats !== '1' && c.exclude_from_stats !== true;
      });
      
      billsToShow = statsLedgerData.flatMap(c => c.bills || []);
      paymentsToShow = statsLedgerData.flatMap(c => c.payments || []);
      document.getElementById('ledgerSelectedCustomer').textContent = 'All Customers';
      const totalDue = statsLedgerData.reduce((sum, c) => sum + (c.amountDue || 0), 0);
      const totalOpening = statsLedgerData.reduce((sum, c) => sum + (c.opening_balance || 0), 0);
      const totalDebit = statsLedgerData.reduce((sum, c) => sum + (c.total_debit || 0), 0);
      const totalCredit = statsLedgerData.reduce((sum, c) => sum + (c.total_credit || 0), 0);
      
      // Calculate sum of individual FIFO results for accurate summary breakdown
      let totalRemainingOpening = 0;
      let totalRemainingInvoices = 0;
      statsLedgerData.forEach(c => {
        const ob = c.opening_balance || 0;
        const dr = c.total_debit || 0;
        const cr = c.total_credit || 0;
        totalRemainingOpening += Math.max(0, ob - cr);
        totalRemainingInvoices += dr - Math.max(0, cr - ob);
      });
      
      // Show positive value for credit (negative balance)
      let displayTotalDue = '';
      if (totalOpening !== 0) {
        displayTotalDue = `Total Amount Due: ₹${totalDue.toFixed(2)} (Invoices: ₹${totalRemainingInvoices.toFixed(2)}, Opening: ₹${totalRemainingOpening.toFixed(2)})`;
      } else {
        displayTotalDue = totalDue < 0 ? `Total Credit: ₹${Math.abs(totalDue).toFixed(2)}` : `Total Amount Due: ₹${totalDue.toFixed(2)}`;
      }
      
      document.getElementById('ledgerCustomerMetrics').textContent = `${displayTotalDue} | Total Collected: ₹${totalCredit.toFixed(2)} | Customers: ${statsLedgerData.length}`;
    }

    document.getElementById('ledgerBillsCount').textContent = `(${billsToShow.length})`;
    document.getElementById('ledgerPaymentsCount').textContent = `(${paymentsToShow.length})`;

    const viewBillsBtn = document.getElementById('ledgerViewBills');
    const viewPaymentsBtn = document.getElementById('ledgerViewPayments');
    const viewAllBtn = document.getElementById('ledgerViewAll');
    const billsContainer = document.getElementById('ledgerBillsContainer');
    const paymentsContainer = document.getElementById('ledgerPaymentsContainer');
    const unifiedContainer = document.getElementById('ledgerUnifiedContainer');
    const billsColumn = billsContainer?.closest('.ledger-bills-column') || billsContainer?.parentElement;
    const paymentsColumn = paymentsContainer?.closest('.ledger-payments-column') || paymentsContainer?.parentElement;
    const unifiedColumn = unifiedContainer?.closest('.ledger-unified-column') || unifiedContainer?.parentElement;
    const columnsWrapper = billsContainer?.closest('.ledger-columns-container');

    const updateColumnVisibility = (mode) => {
      window.currentLedgerFilter = mode;
      const isMobile = window.innerWidth < 768;
      if (columnsWrapper) {
        columnsWrapper.setAttribute('data-mode', mode.toLowerCase());
      }
      
      if (mode === 'BILLS') {
        if (billsColumn) { billsColumn.style.display = 'flex'; billsColumn.style.flex = '1'; billsColumn.classList.add('active-column'); }
        if (billsContainer) { billsContainer.style.display = 'flex'; billsContainer.style.flex = '1'; }
        if (paymentsColumn) { paymentsColumn.style.display = 'none'; paymentsColumn.style.flex = '0'; paymentsColumn.classList.remove('active-column'); }
        if (paymentsContainer) { paymentsContainer.style.display = 'none'; paymentsContainer.style.flex = '0'; }
        if (unifiedColumn) { unifiedColumn.style.display = 'none'; unifiedColumn.style.flex = '0'; unifiedColumn.classList.remove('active-column'); }
        if (unifiedContainer) { unifiedContainer.style.display = 'none'; unifiedContainer.style.flex = '0'; }
        viewBillsBtn.style.background = '#000000'; viewBillsBtn.style.color = '#ffffff';
        viewPaymentsBtn.style.background = '#ffffff'; viewPaymentsBtn.style.color = '#000000';
        viewAllBtn.style.background = '#ffffff'; viewAllBtn.style.color = '#000000';
      } else if (mode === 'PAYMENTS') {
        if (billsColumn) { billsColumn.style.display = 'none'; billsColumn.style.flex = '0'; billsColumn.classList.remove('active-column'); }
        if (billsContainer) { billsContainer.style.display = 'none'; billsContainer.style.flex = '0'; }
        if (paymentsColumn) { paymentsColumn.style.display = 'flex'; paymentsColumn.style.flex = '1'; paymentsColumn.classList.add('active-column'); }
        if (paymentsContainer) { paymentsContainer.style.display = 'flex'; paymentsContainer.style.flex = '1'; }
        if (unifiedColumn) { unifiedColumn.style.display = 'none'; unifiedColumn.style.flex = '0'; unifiedColumn.classList.remove('active-column'); }
        if (unifiedContainer) { unifiedContainer.style.display = 'none'; unifiedContainer.style.flex = '0'; }
        viewPaymentsBtn.style.background = '#000000'; viewPaymentsBtn.style.color = '#ffffff';
        viewBillsBtn.style.background = '#ffffff'; viewBillsBtn.style.color = '#000000';
        viewAllBtn.style.background = '#ffffff'; viewAllBtn.style.color = '#000000';
      } else {
        // BOTH / ALL
        if (isMobile) {
          // On mobile, BOTH shows the Unified Chronological Feed Column exclusively, replacing top-and-bottom split!
          if (billsColumn) { billsColumn.style.display = 'none'; billsColumn.style.flex = '0'; billsColumn.classList.remove('active-column'); }
          if (billsContainer) { billsContainer.style.display = 'none'; billsContainer.style.flex = '0'; }
          if (paymentsColumn) { paymentsColumn.style.display = 'none'; paymentsColumn.style.flex = '0'; paymentsColumn.classList.remove('active-column'); }
          if (paymentsContainer) { paymentsContainer.style.display = 'none'; paymentsContainer.style.flex = '0'; }
          if (unifiedColumn) { unifiedColumn.style.display = 'flex'; unifiedColumn.style.flex = '1'; unifiedColumn.classList.add('active-column'); }
          if (unifiedContainer) { unifiedContainer.style.display = 'flex'; unifiedContainer.style.flex = '1'; }
        } else {
          // On desktop, BOTH shows Bills and Payments side by side
          if (billsColumn) { billsColumn.style.display = 'flex'; billsColumn.style.flex = '1'; billsColumn.classList.add('active-column'); }
          if (billsContainer) { billsContainer.style.display = 'flex'; billsContainer.style.flex = '1'; }
          if (paymentsColumn) { paymentsColumn.style.display = 'flex'; paymentsColumn.style.flex = '1'; paymentsColumn.classList.add('active-column'); }
          if (paymentsContainer) { paymentsContainer.style.display = 'flex'; paymentsContainer.style.flex = '1'; }
          if (unifiedColumn) { unifiedColumn.style.display = 'none'; unifiedColumn.style.flex = '0'; unifiedColumn.classList.remove('active-column'); }
          if (unifiedContainer) { unifiedContainer.style.display = 'none'; unifiedContainer.style.flex = '0'; }
        }
        viewAllBtn.style.background = '#000000'; viewAllBtn.style.color = '#ffffff';
        viewBillsBtn.style.background = '#ffffff'; viewBillsBtn.style.color = '#000000';
        viewPaymentsBtn.style.background = '#ffffff'; viewPaymentsBtn.style.color = '#000000';
      }
    };

    viewBillsBtn.onclick = () => updateColumnVisibility('BILLS');
    viewPaymentsBtn.onclick = () => updateColumnVisibility('PAYMENTS');
    viewAllBtn.onclick = () => updateColumnVisibility('BOTH');

    // Attach resize listener so resizing between desktop and mobile updates layout dynamically
    if (columnsWrapper && !columnsWrapper._hasResizeHandler) {
      columnsWrapper._hasResizeHandler = true;
      window.addEventListener('resize', () => {
        if (window.currentViewMode !== 'timeline' && window.currentLedgerFilter === 'BOTH') {
          updateColumnVisibility('BOTH');
        }
      });
    }

    // Restore previously selected filter
    const prevFilter = window.currentLedgerFilter || 'BOTH';
    updateColumnVisibility(prevFilter);

    // Calculate Settlement Map (FIFO Reconciliation)
    let settlementMap = {};
    if (selectedCustomer) {
      const customer = ledgerData.find(c => c.customerName === selectedCustomer);
      if (customer) {
        settlementMap = this.calculateSettlementMap(billsToShow, paymentsToShow, customer.opening_balance || 0);
      }
    } else {
      // Global View: Calculate per-customer maps and merge
      ledgerData.forEach(c => {
        const customerMap = this.calculateSettlementMap(c.bills || [], c.payments || [], c.opening_balance || 0);
        Object.assign(settlementMap, customerMap);
      });
    }

    this.renderBillsGroupedByMonth(billsToShow, settlementMap);
    this.renderPaymentsGroupedByMonth(paymentsToShow, selectedCustomer);
    this.renderUnifiedGroupedByMonth(billsToShow, paymentsToShow, settlementMap, selectedCustomer);
  }

  renderBillsGroupedByMonth(bills, settlementMap = {}) {
    const container = document.getElementById('ledgerBillsContainer');
    
    if (bills.length === 0) {
      container.innerHTML = '<div style="padding: 32px 16px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">━━━ NO BILLS ━━━</div>';
      return;
    }

    const grouped = {};
    bills.forEach(b => {
      const date = new Date(b.invoice_date || b.bill_date || b.created_at);

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!grouped[key]) grouped[key] = { monthYear, bills: [] };
      grouped[key].bills.push(b);
    });

    const sortedKeys = Object.keys(grouped).sort().reverse();

    container.innerHTML = sortedKeys.map(key => {
      const group = grouped[key];
      return `
        <div style="margin-bottom: 24px;">
          <div style="padding: 8px 12px; background: #000000; font-weight: 700; font-size: 11px; color: #ffffff; border-radius: 2px; margin-bottom: 12px; font-family: 'Courier New', monospace; letter-spacing: 0.3px; text-transform: uppercase;">█ ${group.monthYear}</div>
          ${group.bills.map(b => this.renderBillRecord(b, settlementMap[b.id])).join('')}
        </div>
      `;
    }).join('');
    this.attachBillRecordListeners(container);
  }

  renderPaymentsGroupedByMonth(payments, selectedCustomer) {
    const container = document.getElementById('ledgerPaymentsContainer');
    
    const sortedKeys = [];
    const grouped = {};
    
    if (payments.length > 0) {
      payments.forEach(p => {
        const date = new Date(p.payment_date || p.date || p.created_at);

        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthYear = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        if (!grouped[key]) grouped[key] = { monthYear, payments: [] };
        grouped[key].payments.push(p);
      });
      sortedKeys.push(...Object.keys(grouped).sort().reverse());
    }

    let html = '';
    
    // Add opening balance card at the top (only if opening_balance > 0)
    if (selectedCustomer) {
      html += `
        <div id="opening-balance-container" style="display: none;">
          <div class="ledger-payment-record opening-balance-record" data-opening-balance="true" style="padding: 12px; background: #ffffff; border: 2px solid #1e40af; border-radius: 2px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-family: 'Courier New', monospace;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
              <div style="font-weight: 700; color: #1e40af; font-size: 12px; letter-spacing: 0.3px;">📊 OPENING BALANCE</div>
              <div style="font-size: 10px; font-weight: 800; color: #ffffff; background: #1e40af; padding: 2px 4px; border: 1px solid #1e40af; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">◆ START</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px;">
              <span>█ From Old ERP</span>
              <span id="openingBalanceAmount" style="font-weight: 700; color: #1e40af;">Loading...</span>
            </div>
            <div style="font-size: 10px; color: #1e40af; letter-spacing: 0.2px;">◆ ${selectedCustomer} | Carryover Balance</div>
            <div id="details-opening-balance" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #cccccc;"></div>
          </div>
        </div>
      `;
    }
    
    if (payments.length === 0) {
      container.innerHTML = html + '<div style="padding: 32px 16px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">━━━ NO PAYMENTS ━━━</div>';
      
      // Attach listeners for opening balance card
      this.attachPaymentRecordListeners(container);
      
      // Fetch and display opening balance
      if (selectedCustomer) {
        this.fetchAndDisplayOpeningBalance(selectedCustomer, container);
      }
      return;
    }

    html += sortedKeys.map(key => {
      const group = grouped[key];
      return `
        <div style="margin-bottom: 12px;">
          <div style="padding: 8px 12px; background: #000000; font-weight: 700; font-size: 11px; color: #ffffff; border-radius: 2px; margin-bottom: 8px; font-family: 'Courier New', monospace; letter-spacing: 0.3px; text-transform: uppercase;">█ ${group.monthYear}</div>
          ${group.payments.map(p => this.renderPaymentRecord(p)).join('')}
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    this.attachPaymentRecordListeners(container);
    
    // Fetch and display opening balance
    if (selectedCustomer) {
      this.fetchAndDisplayOpeningBalance(selectedCustomer, container);
    }
  }

  renderUnifiedGroupedByMonth(bills, payments, settlementMap = {}, selectedCustomer) {
    const container = document.getElementById('ledgerUnifiedContainer');
    if (!container) return;

    const allRecords = [];
    bills.forEach(b => {
      allRecords.push({
        type: 'BILL',
        date: b.invoice_date || b.bill_date || b.created_at || '2026-01-01',
        item: b
      });
    });
    payments.forEach(p => {
      allRecords.push({
        type: 'PAYMENT',
        date: p.payment_date || p.date || p.created_at || '2026-01-01',
        item: p
      });
    });

    allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    const countSpan = document.getElementById('ledgerUnifiedCount');
    if (countSpan) countSpan.textContent = `(${allRecords.length})`;

    let html = '';

    if (selectedCustomer) {
      html += `
        <div id="unified-opening-balance-container" style="display: none;">
          <div class="ledger-payment-record opening-balance-record" data-opening-balance="true" style="padding: 12px; background: #f0f8ff; border: 2px solid #1e40af; border-radius: 2px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-family: 'Courier New', monospace;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
              <div style="font-weight: 700; color: #1e40af; font-size: 12px; letter-spacing: 0.3px;">📊 OPENING BALANCE</div>
              <div style="font-size: 10px; font-weight: 800; color: #ffffff; background: #1e40af; padding: 2px 4px; border: 1px solid #1e40af; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">◆ START</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px;">
              <span>█ From Old ERP</span>
              <span id="unifiedOpeningBalanceAmount" style="font-weight: 700; color: #1e40af;">Loading...</span>
            </div>
            <div style="font-size: 10px; color: #1e40af; letter-spacing: 0.2px;">◆ ${selectedCustomer} | Carryover Balance</div>
            <div id="details-unified-opening-balance" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #cccccc;"></div>
          </div>
        </div>
      `;
    }

    if (allRecords.length === 0) {
      container.innerHTML = html + '<div style="padding: 32px 16px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">━━━ NO TRANSACTIONS ━━━</div>';
      if (selectedCustomer) {
        this.fetchAndDisplayOpeningBalanceUnified(selectedCustomer, container);
      }
      return;
    }

    const grouped = {};
    allRecords.forEach(rec => {
      const date = new Date(rec.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!grouped[key]) grouped[key] = { monthYear, records: [] };
      grouped[key].records.push(rec);
    });

    const sortedKeys = Object.keys(grouped).sort().reverse();

    html += sortedKeys.map(key => {
      const group = grouped[key];
      return `
        <div style="margin-bottom: 16px;">
          <div style="padding: 8px 12px; background: #000000; font-weight: 700; font-size: 11px; color: #ffffff; border-radius: 2px; margin-bottom: 8px; font-family: 'Courier New', monospace; letter-spacing: 0.3px; text-transform: uppercase;">█ ${group.monthYear}</div>
          ${group.records.map(rec => {
            if (rec.type === 'BILL') {
              return this.renderBillRecord(rec.item, settlementMap[rec.item.id], 'unified-bill-');
            } else {
              return this.renderPaymentRecord(rec.item, 'unified-payment-');
            }
          }).join('')}
        </div>
      `;
    }).join('');

    container.innerHTML = html;
    this.attachBillRecordListeners(container);
    this.attachPaymentRecordListeners(container);

    if (selectedCustomer) {
      this.fetchAndDisplayOpeningBalanceUnified(selectedCustomer, container);
    }
  }

  async fetchAndDisplayOpeningBalanceUnified(customerName, container) {
    try {
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(customerName)}`);
      if (response.ok) {
        const result = await response.json();
        const contacts = result.data || result;
        if (Array.isArray(contacts) && contacts.length > 0) {
          const customer = contacts.find(c => c.name && c.name.toLowerCase() === customerName.toLowerCase());
          if (customer) {
            const openingBalance = customer.opening_balance || 0;
            const containerDiv = container.querySelector('#unified-opening-balance-container');
            if (containerDiv) {
              if (openingBalance > 0) {
                containerDiv.style.display = 'block';
                const amountSpan = container.querySelector('#unifiedOpeningBalanceAmount');
                if (amountSpan) {
                  const absAmount = Math.abs(openingBalance).toFixed(2);
                  let balanceDisplay = `₹${absAmount}`;
                  let colorStyle = openingBalance < 0 ? 'color: #16a34a;' : 'color: #dc2626;';
                  if (openingBalance === 0) {
                    balanceDisplay = '₹0.00';
                    colorStyle = 'color: #666666;';
                  }
                  amountSpan.innerHTML = `<span style="${colorStyle} font-weight: 700;">${balanceDisplay}</span>`;
                }
              } else {
                containerDiv.style.display = 'none';
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching unified opening balance:', error);
    }
  }

  async fetchAndDisplayOpeningBalance(customerName, container) {
    try {
      // Fetch customer opening balance from contacts API
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(customerName)}`);
      if (response.ok) {
        const result = await response.json();
        const contacts = result.data || result;
        
        if (Array.isArray(contacts) && contacts.length > 0) {
          const customer = contacts.find(c => c.name && c.name.toLowerCase() === customerName.toLowerCase());
          if (customer) {
            const openingBalance = customer.opening_balance || 0;
            
            // Only show opening balance card if opening_balance > 0
            const containerDiv = container.querySelector('#opening-balance-container');
            if (containerDiv) {
              if (openingBalance > 0) {
                containerDiv.style.display = 'block';
                const amountSpan = container.querySelector('#openingBalanceAmount');
                if (amountSpan) {
                  const absAmount = Math.abs(openingBalance).toFixed(2);
                  let balanceDisplay = `₹${absAmount}`;
                  let colorStyle = openingBalance < 0 ? 'color: #16a34a;' : 'color: #dc2626;';
                  
                  if (openingBalance === 0) {
                    balanceDisplay = '₹0.00';
                    colorStyle = 'color: #666666;';
                  }
                  
                  amountSpan.innerHTML = `<span style="${colorStyle} font-weight: 700;">${balanceDisplay}</span>`;
                }
              } else {
                // Hide if opening_balance is 0 or less
                containerDiv.style.display = 'none';
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching opening balance:', error);
    }
  }

  renderBillRecord(bill, settlementInfo, prefix = '') {
    const billId = bill.id; // Use the numeric database ID
    const invoiceNo = bill.invoice_no || billId; // Use invoice_no for API, fallback to ID
    const displayId = bill.reference_no || `BILL-${Date.now()}`; // Use reference_no for display
    const rawDate = new Date(bill.invoice_date || bill.bill_date || bill.created_at);
    const date = rawDate.toLocaleDateString('en-GB').replace(/\//g, '-');


    const amount = (bill.total || 0).toFixed(2);
    const status = bill.status || 'Pending';
    const statusSym = status === 'Paid' ? '✓' : (status === 'Overdue' ? '✕' : '○');
    const statusBorder = status === 'Paid' ? '#000000' : (status === 'Overdue' ? '#000000' : '#666666');
    const statusBg = status === 'Paid' ? '#ffffff' : (status === 'Overdue' ? '#f5f5f5' : '#fafafa');

    // Settlement Counter Badge Logic 
    let settlementHtml = '';
    if (settlementInfo) {
      const days = settlementInfo.days || 1;
      const settled = settlementInfo.settled;
      
      let badgeColor = '#6b7280'; // Default Grey
      let label = settled ? `SETTLED IN ${days}D` : `${days}D OUTSTANDING`;
      
      if (settled) {
        if (days <= 3) badgeColor = '#16a34a'; // Green
        else if (days <= 7) badgeColor = '#84cc16'; // Lime
        else if (days <= 14) badgeColor = '#eab308'; // Yellow
        else if (days <= 30) badgeColor = '#f97316'; // Orange
        else badgeColor = '#dc2626'; // Red
        label = `✓ SETTLED ${days}D`;
      } else {
        if (days <= 7) badgeColor = '#6b7280'; // Grey
        else if (days <= 15) badgeColor = '#eab308'; // Yellow
        else if (days <= 30) badgeColor = '#f97316'; // Orange
        else badgeColor = '#dc2626'; // Red
        label = `⌛ ${days}D AGE`;
      }

      settlementHtml = `
        <div class="settlement-badge" style="font-size: 8px; font-weight: 900; color: #ffffff; background: ${badgeColor}; padding: 3px 6px; border-radius: 2px; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 4px; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.1); display: inline-block;">
          ${label}
        </div>`;
    }

    return `
      <div class="ledger-bill-record" data-bill-id="${billId}" data-invoice-no="${invoiceNo}" style="padding: 12px; background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 2px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-family: 'Courier New', monospace;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
          <div style="font-weight: 700; color: #000000; font-size: 12px; letter-spacing: 0.3px;">${displayId}</div>
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <div style="font-size: 10px; font-weight: 800; color: #000000; background: transparent; padding: 2px 4px; border: 1px solid #000000; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">${statusSym} ${status}</div>
            ${settlementHtml}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px;">
          <span>█ <span class="editable-date">${date}</span></span>
          <span style="font-weight: 700; color: #000000;">₹${amount}</span>
        </div>
        <div style="font-size: 10px; color: #666666; letter-spacing: 0.2px;">◆ ${bill.customer_name || 'Unknown'}</div>
        <div id="details-${prefix}${billId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #cccccc;"></div>
      </div>
    `;
  }

  renderPaymentRecord(payment, prefix = '') {
    const paymentId = payment.id; // Use the numeric database ID
    const rawDate = new Date(payment.payment_date || payment.date || payment.created_at);
    const date = rawDate.toLocaleDateString('en-GB').replace(/\//g, '-');


    const amount = (payment.amount || 0).toFixed(2);
    const creditAmount = (payment.credit_amount || payment.amount || 0).toFixed(2);
    const method = payment.payment_medium || payment.method || 'Cash';
    const reason = payment.reason || 'N/A';
    const isCredit = payment.type === 'CREDIT_NOTE';
    const displayRef = payment.reference_number || (isCredit ? '📋 CREDIT NOTE' : '✓ PAYMENT');

    return `
      <div class="ledger-payment-record${isCredit ? ' credit-note-card' : ''}" data-payment-id="${paymentId}" style="padding: 12px; background: #ffffff; border: 2px solid #000000; border-radius: 2px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-family: 'Courier New', monospace;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
          <div class="payment-ref-number" style="font-weight: 700; color: #000000; font-size: 12px; letter-spacing: 0.3px;">${displayRef} ${payment.attachment_data ? '<span style="font-size: 11px; margin-left: 4px;" title="Image Attached">📎</span>' : ''}</div>
          <div style="font-size: 10px; font-weight: 800; color: #ffffff; background: ${isCredit ? '#f59e0b' : '#000000'}; padding: 2px 4px; border: 1px solid #000000; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">${isCredit ? '+ CR' : '✓ DONE'}</div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px;">
          <span>█ <span class="editable-date">${date}</span></span>
          <span style="font-weight: 700; color: ${isCredit ? '#f59e0b' : '#000000'};">+₹${isCredit ? creditAmount : amount}</span>
        </div>
        <div style="font-size: 10px; color: #666666; letter-spacing: 0.2px;">◆ ${payment.customer_name || 'Unknown'} | ${isCredit ? reason : method}</div>
        <div id="details-${prefix}${paymentId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #cccccc;"></div>
      </div>
    `;
  }

  attachBillRecordListeners(container = document) {
    container.querySelectorAll('.ledger-bill-record').forEach(record => {
      record.addEventListener('click', (e) => {
        e.stopPropagation();
        const billId = record.dataset.billId;
        const invoiceNo = record.dataset.invoiceNo;
        const detailsDiv = record.querySelector('div[id^="details-"]');
        if (!detailsDiv) return;
        const isExpanded = detailsDiv.style.display !== 'none';

        document.querySelectorAll('.ledger-bill-record').forEach(r => {
          if (r !== record) {
            const rDetails = r.querySelector('div[id^="details-"]');
            if (rDetails) rDetails.style.display = 'none';
            r.style.background = '#fafafa';
            r.style.borderColor = '#666666';
            r.style.boxShadow = 'none';
          }
        });

        if (isExpanded) {
          detailsDiv.style.display = 'none';
          record.style.background = '#fafafa';
          record.style.borderColor = '#666666';
          record.style.boxShadow = 'none';
        } else {
          detailsDiv.innerHTML = `
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button onclick="window.currentLedgerView.viewDocument('invoice', '${billId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
              <button onclick="window.currentBillingApp.exportBill('${billId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">█ EXPORT</button>
              <button onclick="window.currentBillingApp.printDocument('invoice', '${billId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">▲ PRINT</button>
              <button onclick="window.currentBillingApp.editBill('${billId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>
              <button onclick="window.currentBillingApp.deleteBill('${billId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✕ DELETE</button>
            </div>
          `;
          detailsDiv.style.display = 'block';
          record.style.background = '#e8e8e8';
          record.style.borderColor = '#000000';
          record.style.boxShadow = 'inset 0 0 0 1px #000000';
        }
      });
    });
  }

  attachPaymentRecordListeners(container = document) {
    container.querySelectorAll('.ledger-payment-record').forEach(record => {
      record.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpeningBalance = record.dataset.openingBalance === 'true';
        const paymentId = isOpeningBalance ? 'opening-balance' : record.dataset.paymentId;
        const detailsDiv = record.querySelector('div[id^="details-"]');
        if (!detailsDiv) return;
        const isExpanded = detailsDiv.style.display !== 'none';

        document.querySelectorAll('.ledger-payment-record').forEach(r => {
          const rDetails = r.querySelector('div[id^="details-"]');
          if (rDetails) rDetails.style.display = 'none';
          r.style.background = '#ffffff';
          r.style.borderColor = r.dataset.openingBalance === 'true' ? '#1e40af' : '#000000';
          r.style.boxShadow = 'none';
        });

        if (isExpanded) {
          detailsDiv.style.display = 'none';
          record.style.background = '#ffffff';
          record.style.borderColor = isOpeningBalance ? '#1e40af' : '#000000';
          record.style.boxShadow = 'none';
        } else {
          if (isOpeningBalance) {
            // Opening balance card details with action buttons
            const selectedCustomerName = document.getElementById('ledgerSelectedCustomer')?.textContent || '';
            detailsDiv.innerHTML = `
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button onclick="window.currentLedgerView.viewDocument('opening-balance', '${selectedCustomerName}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #1e40af; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
                <button onclick="window.currentLedgerView.exportOpeningBalance('${selectedCustomerName}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #1e40af; border: 1px solid #1e40af; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">█ EXPORT</button>
                <button onclick="window.currentBillingApp.printDocument('opening-balance', '${selectedCustomerName}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #1e40af; border: 1px solid #1e40af; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">▲ PRINT</button>
                <button onclick="window.currentLedgerView.editOpeningBalance('${selectedCustomerName}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #1e40af; border: 1px solid #1e40af; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>
              </div>
            `;
            record.style.background = '#f0f8ff';
            record.style.borderColor = '#1e40af';
            record.style.boxShadow = 'inset 0 0 0 2px #1e40af';
          } else {
            // Payment record details
            const paymentObj = window.currentBillingApp.billingData.payments.find(p => p.id == paymentId);
            const attachmentData = paymentObj?.attachment_data || '';
            const isCredit = paymentObj?.type === 'CREDIT_NOTE';
            const attachmentHtml = (attachmentData && !isCredit) ? `<button onclick="window.currentLedgerView.showAttachmentViewer('${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">🖼️ ATTACHMENT</button>` : '';
            detailsDiv.innerHTML = `
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button onclick="window.currentLedgerView.viewDocument('payment', '${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
                ${attachmentHtml}
                <button onclick="window.currentBillingApp.exportPayment('${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">█ EXPORT</button>
                <button onclick="window.currentBillingApp.printDocument('payment', '${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">▲ PRINT</button>
                <button onclick="window.currentBillingApp.deletePayment('${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✕ DELETE</button>
                <button onclick="window.currentBillingApp.editPayment('${paymentId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>
              </div>
              <div style="${attachmentData ? 'display: block;' : 'display: none;'} margin-top: 12px; padding-top: 12px; border-top: 1px solid #eaeaea;">
                <div style="font-size: 10px; color: #666; margin-bottom: 8px; font-weight: 800; text-transform: uppercase;">Image Attachment Thumbnail:</div>
                <img src="${attachmentData}" onclick="window.currentLedgerView.showAttachmentViewer('${paymentId}')" style="max-height: 160px; max-width: 100%; border-radius: 6px; border: 1px solid #ddd; padding: 2px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); object-fit: contain; cursor: pointer;">
              </div>
            `;
            record.style.background = '#f5f5f5';
            record.style.borderColor = '#000000';
            record.style.boxShadow = 'inset 0 0 0 2px #000000';
          }
          detailsDiv.style.display = 'block';
        }
      });
    });
  }

  showAttachmentViewer(paymentId) {
    const paymentObj = window.currentBillingApp?.billingData?.payments?.find(p => p.id == paymentId);
    if (!paymentObj || !paymentObj.attachment_data) return;

    const imageUrl = paymentObj.attachment_data;
    const isCredit = paymentObj.type === 'CREDIT_NOTE';
    const RefName = paymentObj.reference_number || (isCredit ? 'Credit Note' : 'Payment');
    const title = '🖼️ Attachment: ' + RefName;

    const modalId = 'unified-doc-modal-' + Date.now();
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483646;pointer-events:auto;';

    modal.innerHTML = `
      <div style="position:fixed;top:5%;left:5%;width:90%;height:90%;background:white;border-radius:8px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);z-index:2147483647;font-family:'Courier New',monospace;">
        <div style="padding:16px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.5px;">${title}</h3>
          <div style="display:flex;gap:8px;align-items:center;color:#666;">
            <span style="font-size:10px;color:#999;">Hold Z + scroll/drag to zoom/pan | Double-click to reset</span>
            <button id="close-attachment-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;margin-left:12px;">&times;</button>
          </div>
        </div>
        <div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
          <img id="unified-attachment-img" src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
        <div style="padding:12px;border-top:1px solid rgba(0,0,0,0.1);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;">
          <button id="download-attachment-btn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">📥 Download</button>
          <button id="close-attachment-btn" style="padding:8px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

    const closeHandler = () => {
      modal.remove();
    };

    document.getElementById('close-attachment-modal').onclick = closeHandler;
    document.getElementById('close-attachment-btn').onclick = closeHandler;
    document.getElementById('download-attachment-btn').onclick = () => {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `Attachment-${RefName}.png`;
      a.click();
    };

    modal.onclick = (e) => {
      if (e.target === modal) closeHandler();
    };

    // Setup zoom/pan interactions
    (function setupPreviewInteractions() {
      const img = document.getElementById('unified-attachment-img');
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

      // Keyboard controls
      window.addEventListener('keydown', (e) => {
        if (e.key === 'z' || e.key === 'Z') zPressed = true;
      });
      window.addEventListener('keyup', (e) => {
        if (e.key === 'z' || e.key === 'Z') zPressed = false;
      });

      // Wheel zoom when Z held
      modalEl.addEventListener('wheel', (ev) => {
        if (!zPressed) return;
        ev.preventDefault();
        const delta = -ev.deltaY;
        const factor = delta > 0 ? 1.12 : 0.88;
        const prevScale = scale;
        scale = Math.min(maxScale, Math.max(minScale, scale * factor));

        // Zoom towards pointer
        const rect = img.getBoundingClientRect();
        const offsetX = ev.clientX - rect.left - rect.width / 2;
        const offsetY = ev.clientY - rect.top - rect.height / 2;
        translate.x -= offsetX * (scale / prevScale - 1);
        translate.y -= offsetY * (scale / prevScale - 1);

        applyTransform();
      }, { passive: false });

      // Prevent context menu when panning
      modalEl.addEventListener('contextmenu', (ev) => {
        if (zPressed) ev.preventDefault();
      });

      // Pointer pan (right button) when Z held
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
        lastPointer.x = ev.clientX;
        lastPointer.y = ev.clientY;
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

      // Double click resets
      img.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        scale = 1;
        translate.x = 0;
        translate.y = 0;
        applyTransform();
      });

      // Initial styles
      img.style.transition = 'transform 120ms ease-out';
      img.style.willChange = 'transform';
      img.style.cursor = 'auto';
      applyTransform();
    })();
  }

  async updateBillDate(billId, newDateStr, element) {
    const record = document.querySelector(`.ledger-bill-record[data-bill-id="${billId}"]`) || 
                   document.querySelector(`.timeline-record-card[data-bill-id="${billId}"]`);
    
    if (record) record.classList.add('transitioning');

    try {
      // Expecting DD-MM-YYYY or DD MMM YYYY (from timeline)
      // Normalize to YYYY-MM-DD
      let dateParts;
      if (newDateStr.includes('-')) {
        dateParts = newDateStr.split('-');
      } else {
        // Fallback or handle "03 Apr 2026" format
        const d = new Date(newDateStr);
        if (isNaN(d.getTime())) throw new Error("Invalid date format");
        dateParts = [d.getDate(), d.getMonth() + 1, d.getFullYear()];
      }

      if (dateParts.length !== 3) throw new Error("Invalid date format. Use DD-MM-YYYY");
      
      const day = String(dateParts[0]).padStart(2, '0');
      const month = String(dateParts[1]).padStart(2, '0');
      const year = dateParts[2];
      const isoDate = `${year}-${month}-${day}`;

      console.log(`Updating Bill ${billId} date to ${isoDate}`);
      
      const response = await fetch(`/api/billing/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_date: isoDate })
      });

      if (!response.ok) throw new Error("Failed to update bill date");

      window.currentBillingApp.showNotification('✓ Date updated successfully', 'success');
      
      // Update local storage if needed
      const bill = this.billingApp.billingData.bills.find(b => b.id == billId);
      if (bill) bill.invoice_date = isoDate;
      
      // Trigger update animation
      if (record) {
        record.classList.remove('transitioning');
        this.applyLedgerSyncAnimations({ updatedBillIds: new Set([billId]) });
      }
      
    } catch (error) {
      console.error(error);
      if (record) record.classList.remove('transitioning');
      window.currentBillingApp.showNotification(`✕ Error: ${error.message}`, 'error');
    }
  }

  async updatePaymentDate(paymentId, newDateStr, element) {
    const record = document.querySelector(`.ledger-payment-record[data-payment-id="${paymentId}"]`) || 
                   document.querySelector(`.timeline-record-card[data-payment-id="${paymentId}"]`);
    
    if (record) record.classList.add('transitioning');

    try {
      // Normalize date parts
      let dateParts;
      if (newDateStr.includes('-')) {
        dateParts = newDateStr.split('-');
      } else {
        const d = new Date(newDateStr);
        if (isNaN(d.getTime())) throw new Error("Invalid date format");
        dateParts = [d.getDate(), d.getMonth() + 1, d.getFullYear()];
      }

      if (dateParts.length !== 3) throw new Error("Invalid date format. Use DD-MM-YYYY");
      
      const day = String(dateParts[0]).padStart(2, '0');
      const month = String(dateParts[1]).padStart(2, '0');
      const year = dateParts[2];
      const isoDate = `${year}-${month}-${day}`;

      console.log(`Updating Payment ${paymentId} date to ${isoDate}`);
      
      const response = await fetch(`/api/billing/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ created_at: isoDate })
      });

      if (!response.ok) throw new Error("Failed to update payment date");

      window.currentBillingApp.showNotification('✓ Date updated successfully', 'success');
      
      // Update local storage
      const payment = this.billingApp.billingData.payments.find(p => p.id == paymentId);
      if (payment) payment.created_at = isoDate;

      // Trigger update animation
      if (record) {
        record.classList.remove('transitioning');
        this.applyLedgerSyncAnimations({ updatedPaymentIds: new Set([paymentId]) });
      }
      
    } catch (error) {
      console.error(error);
      if (record) record.classList.remove('transitioning');
      window.currentBillingApp.showNotification(`✕ Error: ${error.message}`, 'error');
    }
  }

  async getLedgerData() {
    try {
      // Fetch customers with current_due from new ledger endpoint
      const response = await fetch('/api/billing/ledger/customers');
      if (!response.ok) throw new Error(`Failed to fetch ledger customers: ${response.statusText}`);
      const result = await response.json();
      const ledgerCustomers = result.data || [];

      // Get local bills and payments for additional metrics
      const bills = this.billingApp.billingData.bills || [];
      const payments = this.billingApp.billingData.payments || [];
      
      // Create map of customer data from ledger API
      const ledgerMap = {};
      ledgerCustomers.forEach(c => {
        ledgerMap[c.customerName] = c;
      });

      // Create map of local bills and payments by customer
      const localMap = {};
      bills.forEach(b => {
        const c = b.customer_name || b.customer || 'Unknown';
        if (!localMap[c]) localMap[c] = { customerName: c, bills: [], payments: [] };
        localMap[c].bills.push(b);
      });
      payments.forEach(p => {
        const c = p.customer_name || p.customer || 'Unknown';
        if (!localMap[c]) localMap[c] = { customerName: c, bills: [], payments: [] };
        localMap[c].payments.push(p);
      });

      // Merge ledger data with local metrics
      const mergedData = {};
      
      // First add all customers from ledger - USE DATABASE VALUE, DON'T RECALCULATE
      Object.keys(ledgerMap).forEach(name => {
        const ledgerCustomer = ledgerMap[name];
        mergedData[name] = {
          customer_id: ledgerCustomer.customer_id,
          customerName: name,
          active: ledgerCustomer.active || 'ACTIVE',
          last_activity: ledgerCustomer.last_activity,
          opening_balance: ledgerCustomer.opening_balance || 0,
          exclude_from_stats: ledgerCustomer.exclude_from_stats || 0,
          amountDue: ledgerCustomer.amountDue, // USE DATABASE VALUE AS SINGLE SOURCE OF TRUTH (includes opening balance)
          current_due: ledgerCustomer.current_due || 0, // Current due without opening balance
          total_debit: ledgerCustomer.total_debit || 0,
          total_credit: ledgerCustomer.total_credit || 0,
          total_outstanding: ledgerCustomer.total_outstanding || 0, // Total (invoices + opening balance - payments)
          total_bills: ledgerCustomer.total_bills || 0,
          total_payments: ledgerCustomer.total_payments || 0,
          lastBillDate: ledgerCustomer.lastBillDate || 'N/A',
          lastPaymentDate: ledgerCustomer.lastPaymentDate || 'N/A',
          bills: localMap[name]?.bills || [],
          payments: localMap[name]?.payments || []
        };
      });

      // Then add any local customers not in ledger (for real-time unsaved data)
      // These get calculated since they don't have a database row yet
      Object.keys(localMap).forEach(name => {
        if (!mergedData[name]) {
          const metrics = this.calculateCustomerMetrics(localMap[name].bills, localMap[name].payments);
          mergedData[name] = {
            customer_id: null,
            customerName: name,
            active: 'ACTIVE',
            last_activity: null,
            opening_balance: 0, // Local data doesn't have opening balance from DB
            amountDue: metrics.amountDue,
            current_due: metrics.amountDue,
            total_outstanding: metrics.amountDue,
            daysOverdue: metrics.daysOverdue,
            lastBillDate: metrics.lastBillDate,
            lastPaymentDate: metrics.lastPaymentDate,
            daysSinceLastBill: metrics.daysSinceLastBill,
            daysSinceLastPayment: metrics.daysSinceLastPayment,
            bills: localMap[name].bills,
            payments: localMap[name].payments
          };
        } else {
          // For customers in ledger, calculate additional metrics from local data
          const metrics = this.calculateCustomerMetrics(mergedData[name].bills, mergedData[name].payments);
          mergedData[name].daysOverdue = metrics.daysOverdue;
          if (metrics.lastBillDate !== 'N/A') mergedData[name].lastBillDate = metrics.lastBillDate;
          if (metrics.lastPaymentDate !== 'N/A') mergedData[name].lastPaymentDate = metrics.lastPaymentDate;
          mergedData[name].daysSinceLastBill = metrics.daysSinceLastBill;
          mergedData[name].daysSinceLastPayment = metrics.daysSinceLastPayment;
        }
      });

      return Object.values(mergedData).sort((a, b) => a.customerName.localeCompare(b.customerName));
    } catch (error) {
      console.error('Error fetching ledger data:', error);
      // Fallback to local calculation if API fails
      return this.getLedgerDataLocal();
    }
  }

  /**
   * Fallback local ledger data calculation (for when API is unavailable)
   */
  getLedgerDataLocal() {
    const bills = this.billingApp.billingData.bills || [];
    const payments = this.billingApp.billingData.payments || [];
    const contacts = this.billingApp.billingData.contacts || [];
    const map = {};
    bills.forEach(b => {
      const c = b.customer_name || b.customer || 'Unknown';
      if (!map[c]) map[c] = { customerName: c, bills: [], payments: [] };
      map[c].bills.push(b);
    });
    payments.forEach(p => {
      const c = p.customer_name || p.customer || 'Unknown';
      if (!map[c]) map[c] = { customerName: c, bills: [], payments: [] };
      map[c].payments.push(p);
    });
    Object.values(map).forEach(cd => {
      // Find exclusion flag from contacts data
      const contact = contacts.find(con => con.name === cd.customerName);
      cd.exclude_from_stats = contact ? (contact.exclude_from_stats || 0) : 0;
      
      Object.assign(cd, this.calculateCustomerMetrics(cd.bills, cd.payments));
    });
    return Object.values(map).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }

  renderTimelineView(ledgerData) {
    this.showTimelineView(ledgerData);
  }

  showTimelineView(ledgerData) {
    window.currentViewMode = 'timeline';
    
    // Find the main workspace
    const customerHeader = document.getElementById('ledgerSelectedCustomer');
    if (!customerHeader) return;
    
    let mainWorkspace = customerHeader.closest('[style*="flex: 1; display: flex; flex-direction: column"]');
    if (!mainWorkspace) {
      mainWorkspace = customerHeader.parentElement.parentElement;
    }
    if (!mainWorkspace) return;

    // Collect all bills and payments with their dates
    const allRecords = [];
    
    // Filter by selected customer if one exists
    const recordsToProcess = window.currentSelectedCustomer 
      ? ledgerData.filter(c => c.customerName === window.currentSelectedCustomer)
      : ledgerData;
    
    recordsToProcess.forEach(customer => {
      (customer.bills || []).forEach(bill => {
        allRecords.push({
          type: 'BILL',
          date: bill.invoice_date || bill.bill_date || bill.date || '2026-01-01',
          item: bill

        });
      });
      (customer.payments || []).forEach(payment => {
        allRecords.push({
          type: 'PAYMENT',
          date: payment.payment_date || payment.date || payment.created_at || '2026-01-01',
          item: payment

        });
      });
    });

    // Sort by date (newest first)
    allRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Create timeline HTML
    let timelineHTML = `
      <div style="flex: 1; overflow-y: auto; padding: 32px; background: #ffffff;">
        <div style="max-width: 600px; position: relative;">
    `;

    // Draw timeline
    let previousMonth = null;
    allRecords.forEach((record, idx) => {
      const isLastItem = idx === allRecords.length - 1;
      const recordDate = new Date(record.date);
      const dateStr = recordDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
      const currentMonth = recordDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
      
      // Add month divider when month changes
      if (previousMonth && previousMonth !== currentMonth) {
        timelineHTML += `
          <div style="display: flex; margin: 32px 0; position: relative; align-items: center;">
            <div style="flex: 1; height: 1px; background: #cccccc; margin-right: 12px;"></div>
            <span style="font-size: 10px; color: #999999; font-weight: 700; text-transform: uppercase; white-space: nowrap; font-family: 'Courier New', monospace;">${currentMonth}</span>
            <div style="flex: 1; height: 1px; background: #cccccc; margin-left: 12px;"></div>
          </div>
        `;
      }
      
      previousMonth = currentMonth;
      
      let cardHTML = '';
      const item = record.item;
      const recordId = `${record.type.toLowerCase()}-${item.id}`;

      if (record.type === 'BILL') {
        const bill = item;
        const displayId = bill.reference_no || `BILL-${bill.id}`;
        const status = bill.status || 'Pending';
        const statusSym = status === 'Paid' ? '✓' : (status === 'Overdue' ? '✕' : '○');
        const statusBorder = status === 'Paid' ? '#000000' : (status === 'Overdue' ? '#000000' : '#666666');
        const statusBg = status === 'Paid' ? '#ffffff' : (status === 'Overdue' ? '#f5f5f5' : '#fafafa');
        const amount = (bill.total || 0).toFixed(2);

        cardHTML = `
          <div class="timeline-record-card ledger-bill-record" data-record-id="${recordId}" data-bill-id="${bill.id}" data-invoice-no="${bill.invoice_no || bill.id}" style="padding: 12px 16px; border: 1px solid ${statusBorder}; border-radius: 3px; background: ${statusBg}; transition: all 0.15s; font-family: 'Courier New', monospace;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div style="font-weight: 700; color: #000000; font-size: 13px; letter-spacing: 0.3px;">${displayId}</div>
              <div style="font-size: 10px; font-weight: 800; color: #000000; background: transparent; padding: 2px 4px; border: 1px solid #000000; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">${statusSym} ${status}</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #000000; margin-bottom: 4px;">
              <span>█ <span class="editable-date">${dateStr}</span></span>
              <span style="font-weight: 700; color: #000000;">₹${amount}</span>
            </div>
            <div style="font-size: 11px; color: #666666; letter-spacing: 0.2px;">◆ ${bill.customer_name || 'Unknown'}</div>
            <div id="actions-${recordId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;"></div>
          </div>
        `;
      } else {
        const payment = item;
        const isCredit = payment.type === 'CREDIT_NOTE';
        const displayRef = payment.reference_number || (isCredit ? '📋 CREDIT NOTE' : '✓ PAYMENT');
        const amount = (payment.amount || 0).toFixed(2);
        const creditAmount = (payment.credit_amount || payment.amount || 0).toFixed(2);
        const method = payment.payment_medium || payment.method || 'Cash';
        const reason = payment.reason || 'N/A';

        cardHTML = `
          <div class="timeline-record-card ledger-payment-record${isCredit ? ' credit-note-card' : ''}" data-record-id="${recordId}" data-payment-id="${payment.id}" style="padding: 12px 16px; border: 2px solid #000000; border-radius: 3px; background: #ffffff; transition: all 0.15s; font-family: 'Courier New', monospace;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div class="payment-ref-number" style="font-weight: 700; color: #000000; font-size: 13px; letter-spacing: 0.3px;">${displayRef}</div>
              <div style="font-size: 10px; font-weight: 800; color: #ffffff; background: ${isCredit ? '#f59e0b' : '#000000'}; padding: 2px 4px; border: 1px solid #000000; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">${isCredit ? '+ CR' : '✓ DONE'}</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #000000; margin-bottom: 4px;">
              <span>█ <span class="editable-date">${dateStr}</span></span>
              <span style="font-weight: 700; color: ${isCredit ? '#f59e0b' : '#000000'};">+₹${isCredit ? creditAmount : amount}</span>
            </div>
            <div style="font-size: 11px; color: #666666; letter-spacing: 0.2px;">◆ ${payment.customer_name || 'Unknown'} | ${isCredit ? reason : method}</div>
            <div id="actions-${recordId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;"></div>
          </div>
        `;
      }
      
      timelineHTML += `
        <div class="timeline-record" data-record-id="${recordId}" data-record-type="${record.type}" data-record-id-value="${item.id}" data-invoice-no="${item.invoice_no || item.id}" style="display: flex; margin-bottom: 32px; position: relative; cursor: pointer;">
          <!-- Timeline Line -->
          <div style="width: 2px; background: #1a1a1a; margin-right: 24px; position: relative; flex-shrink: 0;">
            <div style="width: 12px; height: 12px; background: #000000; border-radius: 50%; position: absolute; left: -5px; top: 0; border: 2px solid #ffffff;"></div>
            ${!isLastItem ? `<div style="position: absolute; width: 2px; height: 40px; background: #1a1a1a; top: 20px; left: 0;"></div>` : ''}
          </div>
          <!-- Content -->
          <div style="flex: 1;">
            <div style="font-size: 11px; color: #666666; font-family: 'Courier New', monospace; margin-bottom: 4px; font-weight: 600; text-transform: uppercase;">█ <span class="editable-date">${dateStr}</span></div>
            ${cardHTML}
          </div>
        </div>
      `;
    });

    timelineHTML += `
        </div>
      </div>
    `;

    // Calculate metrics based on selected customer — use same format as list view
    let headerTitle = 'All Customers';
    let metricsText = 'Select a customer to view financial records';

    if (window.currentSelectedCustomer) {
      const customerData = recordsToProcess[0];
      if (customerData) {
        headerTitle = window.currentSelectedCustomer;
        const due = customerData.amountDue || 0;
        const openingBalance = customerData.opening_balance || 0;
        const daysOverdue = customerData.daysOverdue || 0;
        const lastBill = customerData.lastBillDate || '—';
        const lastPayment = customerData.lastPaymentDate || '—';
        
        // FIFO Logic: Apply total credit to opening balance first
        let displayDue = '';
        if (openingBalance !== 0) {
          const total_debit = customerData.total_debit || 0;
          const total_credit = customerData.total_credit || 0;
          const remainingOpening = Math.max(0, openingBalance - total_credit);
          const remainingInvoices = total_debit - Math.max(0, total_credit - openingBalance);
          displayDue = `Amount Due: ₹${due.toFixed(2)} (Invoices: ₹${remainingInvoices.toFixed(2)} | Opening: ₹${remainingOpening.toFixed(2)})`;
        } else {
          displayDue = due < 0 ? `Credit: ₹${Math.abs(due).toFixed(2)}` : `Amount Due: ₹${due.toFixed(2)}`;
        }
        
        const total_credit = customerData.total_credit || 0;
        metricsText = `${displayDue} | Total Payments: ₹${total_credit.toFixed(2)} | Days Overdue: ${daysOverdue > 0 ? daysOverdue : 'None'} | Last Bill: ${lastBill} | Last Payment: ${lastPayment}`;
      }
    } else {
      const totalDue = ledgerData.reduce((sum, c) => sum + (c.amountDue || 0), 0);
      const totalOpening = ledgerData.reduce((sum, c) => sum + (c.opening_balance || 0), 0);
      const totalDebit = ledgerData.reduce((sum, c) => sum + (c.total_debit || 0), 0);
      const totalCredit = ledgerData.reduce((sum, c) => sum + (c.total_credit || 0), 0);
      
      // Calculate sum of individual FIFO results for accurate summary breakdown
      let totalRemainingOpening = 0;
      let totalRemainingInvoices = 0;
      ledgerData.forEach(c => {
        const ob = c.opening_balance || 0;
        const dr = c.total_debit || 0;
        const cr = c.total_credit || 0;
        totalRemainingOpening += Math.max(0, ob - cr);
        totalRemainingInvoices += dr - Math.max(0, cr - ob);
      });
      
      headerTitle = 'All Customers';
      let displayTotalDue = '';
      if (totalOpening !== 0) {
        displayTotalDue = `Total Amount Due: ₹${totalDue.toFixed(2)} (Invoices: ₹${totalRemainingInvoices.toFixed(2)}, Opening: ₹${totalRemainingOpening.toFixed(2)})`;
      } else {
        displayTotalDue = totalDue < 0 ? `Total Credit: ₹${Math.abs(totalDue).toFixed(2)}` : `Total Amount Due: ₹${totalDue.toFixed(2)}`;
      }
      metricsText = `${displayTotalDue} | Total Collected: ₹${totalCredit.toFixed(2)} | Customers: ${ledgerData.length}`;
    }

    // Determine button styles from persisted filter so render doesn't flicker
    const prevFilter = window.currentLedgerFilter || 'BOTH';
    const billsBtnInline = prevFilter === 'BILLS' ? 'background: #000000; color: #ffffff;' : 'background: #ffffff; color: #000000;';
    const paymentsBtnInline = prevFilter === 'PAYMENTS' ? 'background: #000000; color: #ffffff;' : 'background: #ffffff; color: #000000;';
    const allBtnInline = prevFilter === 'BOTH' ? 'background: #000000; color: #ffffff;' : 'background: #ffffff; color: #000000;';

    // Clear the workspace
    mainWorkspace.innerHTML = `
      <div style="padding: 24px 32px; background: #ffffff; border-bottom: 2px solid #000000; flex-shrink: 0;">
        <h1 id="ledgerSelectedCustomer" style="margin: 0 0 4px 0; font-size: 28px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${headerTitle}</h1>
        <p id="ledgerCustomerMetrics" style="margin: 0; font-size: 12px; color: #666666; font-weight: 500;">${metricsText}</p>
      </div>
      <div class="ledger-filter-controls" style="padding: 6px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
        <button id="ledgerViewBills" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; ${billsBtnInline} cursor: pointer; border-radius: 2px; transition: all 0.2s;">BILLS</button>
        <button id="ledgerViewPayments" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; ${paymentsBtnInline} cursor: pointer; border-radius: 2px; transition: all 0.2s;">PAYMENTS</button>
        <button id="ledgerViewAll" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; ${allBtnInline} cursor: pointer; border-radius: 2px; transition: all 0.2s;">BOTH</button>
        <div style="flex: 1;"></div>
        <button id="ledgerListViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">☰ LIST</button>
        <button id="ledgerTimeViewBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s;">▬ TIME</button>
      </div>
      ${timelineHTML}
    `;

    // Re-attach button listeners
    setTimeout(() => {
      this.setupViewToggleButtons(ledgerData);
      this.attachTimelineRecordListeners();
      this.setupTimelineViewFilters();
    }, 0);
  }

  setupTimelineViewFilters() {
    const viewBillsBtn = document.getElementById('ledgerViewBills');
    const viewPaymentsBtn = document.getElementById('ledgerViewPayments');
    const viewAllBtn = document.getElementById('ledgerViewAll');

    if (!viewBillsBtn || !viewPaymentsBtn || !viewAllBtn) return;

    viewBillsBtn.onclick = () => {
      document.querySelectorAll('.timeline-record').forEach(record => {
        if (record.dataset.recordType === 'BILL') {
          record.style.display = 'flex';
        } else {
          record.style.display = 'none';
        }
      });
      window.currentLedgerFilter = 'BILLS';
      viewBillsBtn.style.background = '#000000';
      viewBillsBtn.style.color = '#ffffff';
      viewPaymentsBtn.style.background = '#ffffff';
      viewPaymentsBtn.style.color = '#000000';
      viewAllBtn.style.background = '#ffffff';
      viewAllBtn.style.color = '#000000';
    };

    viewPaymentsBtn.onclick = () => {
      document.querySelectorAll('.timeline-record').forEach(record => {
        if (record.dataset.recordType === 'PAYMENT') {
          record.style.display = 'flex';
        } else {
          record.style.display = 'none';
        }
      });
      window.currentLedgerFilter = 'PAYMENTS';
      viewPaymentsBtn.style.background = '#000000';
      viewPaymentsBtn.style.color = '#ffffff';
      viewBillsBtn.style.background = '#ffffff';
      viewBillsBtn.style.color = '#000000';
      viewAllBtn.style.background = '#ffffff';
      viewAllBtn.style.color = '#000000';
    };

    viewAllBtn.onclick = () => {
      document.querySelectorAll('.timeline-record').forEach(record => {
        record.style.display = 'flex';
      });
      window.currentLedgerFilter = 'BOTH';
      viewAllBtn.style.background = '#000000';
      viewAllBtn.style.color = '#ffffff';
      viewBillsBtn.style.background = '#ffffff';
      viewBillsBtn.style.color = '#000000';
      viewPaymentsBtn.style.background = '#ffffff';
      viewPaymentsBtn.style.color = '#000000';
    };

    // Restore previously selected filter for timeline view
    const prevFilter = window.currentLedgerFilter || 'BOTH';
    if (prevFilter === 'BILLS') viewBillsBtn.onclick();
    else if (prevFilter === 'PAYMENTS') viewPaymentsBtn.onclick();
    else viewAllBtn.onclick();
  }

  attachTimelineRecordListeners() {
    document.querySelectorAll('.timeline-record').forEach(record => {
      record.addEventListener('click', (e) => {
        e.stopPropagation();
        const recordId = record.dataset.recordId;
        const recordType = record.dataset.recordType;
        const recordIdValue = record.dataset.recordIdValue;
        const invoiceNo = record.dataset.invoiceNo;
        const actionsDiv = document.getElementById(`actions-${recordId}`);
        const card = record.querySelector('.timeline-record-card');
        const isExpanded = actionsDiv.style.display !== 'none';

        // Collapse all other records
        document.querySelectorAll('.timeline-record').forEach(r => {
          if (r !== record) {
            const otherId = r.dataset.recordId;
            const otherActionsDiv = document.getElementById(`actions-${otherId}`);
            const otherCard = r.querySelector('.timeline-record-card');
            if (otherActionsDiv) otherActionsDiv.style.display = 'none';
            if (otherCard) {
              otherCard.style.background = '#ffffff';
              otherCard.style.borderColor = '#000000';
            }
          }
        });

        if (isExpanded) {
          actionsDiv.style.display = 'none';
          if (card) {
            card.style.background = '#ffffff';
            card.style.borderColor = '#000000';
          }
        } else {
          const actionButtons = recordType === 'BILL'
            ? `<button class="timeline-delete-bill" data-bill-id="${recordIdValue}" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✕ DELETE</button>
              <button onclick="window.currentLedgerView.viewDocument('invoice', '${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
              <button onclick="window.currentBillingApp.exportBill('${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">█ EXPORT</button>
              <button onclick="window.currentBillingApp.printDocument('invoice', '${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">▲ PRINT</button>
              <button onclick="window.currentBillingApp.editBill('${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>`
            : `<button class="timeline-delete-payment" data-payment-id="${recordIdValue}" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✕ DELETE</button>
              <button onclick="window.currentLedgerView.viewDocument('payment', '${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
              <button onclick="window.currentBillingApp.exportPayment('${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">█ EXPORT</button>
              <button onclick="window.currentBillingApp.printDocument('payment', '${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">▲ PRINT</button>
              <button onclick="window.currentBillingApp.editPayment('${recordIdValue}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>`;

          actionsDiv.innerHTML = `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${actionButtons}</div>`;
          
          // Attach event listeners to delete buttons
          const deleteBillBtn = actionsDiv.querySelector('.timeline-delete-bill');
          if (deleteBillBtn) {
            deleteBillBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              window.currentBillingApp.deleteBill(recordIdValue);
            });
          }
          
          const deletePaymentBtn = actionsDiv.querySelector('.timeline-delete-payment');
          if (deletePaymentBtn) {
            deletePaymentBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              window.currentBillingApp.deletePayment(recordIdValue);
            });
          }
          
          actionsDiv.style.display = 'block';
          if (card) {
            card.style.background = '#f0f0f0';
            card.style.borderColor = '#666666';
          }
        }
      });
    });
  }

  async viewDocument(type, documentId) {
    try {
      // Determine API endpoint and titles based on type
      let endpoint = '';
      let title = '';
      
      if (type === 'invoice') {
        endpoint = '/api/billing/preview-invoice-pdf';
        title = `Invoice ${documentId}`;
      } else if (type === 'payment' || type === 'credit-note') {
        endpoint = '/api/billing/preview-payment-pdf';
        title = type === 'credit-note' ? `Credit Note ${documentId}` : `Payment ${documentId}`;
      } else if (type === 'opening-balance') {
        endpoint = '/api/billing/preview-opening-balance';
        title = `Opening Balance - ${documentId}`;
      } else {
        throw new Error('Invalid document type');
      }

      // Show loading indicator
      const loadingId = 'document-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;font-family:"Courier New",monospace;';
      loadingDiv.innerHTML = '<p>🔄 Loading document...</p>';
      document.body.appendChild(loadingDiv);

      // Fetch preview
      const API_BASE = window.BILLING_API_BASE || '';
      const requestBody = {};
      if (type === 'invoice') {
        // If documentId is a number/string numeric, treat as invoiceId
        const docIdNum = parseInt(documentId);
        if (!isNaN(docIdNum) && docIdNum > 0) {
          requestBody.invoiceId = docIdNum;
        }
        requestBody.invoiceNo = documentId;
      }
      else if (type === 'payment' || type === 'credit-note') requestBody.paymentId = documentId;
      else if (type === 'opening-balance') requestBody.customerName = documentId;

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to load document');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to load document');
        }
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      // Create unified modal
      const modalId = 'unified-doc-modal-' + Date.now();
      const modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483646;pointer-events:auto;';

      modal.innerHTML = `
        <div style="position:fixed;top:5%;left:5%;width:90%;height:90%;background:white;border-radius:8px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);z-index:2147483647;font-family:'Courier New',monospace;">
          <div style="padding:16px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.5px;">${title}</h3>
            <div style="display:flex;gap:8px;align-items:center;color:#666;">
              <span style="font-size:10px;color:#999;">Hold Z + scroll/drag to zoom/pan | Double-click to reset</span>
              <button id="close-document-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;margin-left:12px;">&times;</button>
            </div>
          </div>
          <div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
            <img id="unified-document-img" src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" />
          </div>
          <div style="padding:12px;border-top:1px solid rgba(0,0,0,0.1);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;">
            <button id="download-document-btn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">📥 Download</button>
            <button id="close-document-btn" style="padding:8px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">Close</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      const closeHandler = () => {
        modal.remove();
        URL.revokeObjectURL(imageUrl);
      };

      document.getElementById('close-document-modal').onclick = closeHandler;
      document.getElementById('close-document-btn').onclick = closeHandler;
      document.getElementById('download-document-btn').onclick = () => {
        if (type === 'opening-balance') {
          this.exportOpeningBalance(documentId);
        } else {
          const a = document.createElement('a');
          a.href = imageUrl;
          a.download = `${type}-${documentId}.png`;
          a.click();
        }
      };

      modal.onclick = (e) => {
        if (e.target === modal) closeHandler();
      };

      // Setup zoom/pan interactions
      (function setupPreviewInteractions() {
        const img = document.getElementById('unified-document-img');
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

        // Keyboard controls
        window.addEventListener('keydown', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = true;
        });
        window.addEventListener('keyup', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = false;
        });

        // Wheel zoom when Z held
        modalEl.addEventListener('wheel', (ev) => {
          if (!zPressed) return;
          ev.preventDefault();
          const delta = -ev.deltaY;
          const factor = delta > 0 ? 1.12 : 0.88;
          const prevScale = scale;
          scale = Math.min(maxScale, Math.max(minScale, scale * factor));

          // Zoom towards pointer
          const rect = img.getBoundingClientRect();
          const offsetX = ev.clientX - rect.left - rect.width / 2;
          const offsetY = ev.clientY - rect.top - rect.height / 2;
          translate.x -= offsetX * (scale / prevScale - 1);
          translate.y -= offsetY * (scale / prevScale - 1);

          applyTransform();
        }, { passive: false });

        // Prevent context menu when panning
        modalEl.addEventListener('contextmenu', (ev) => {
          if (zPressed) ev.preventDefault();
        });

        // Pointer pan (right button) when Z held
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
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
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

        // Double click resets
        img.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          scale = 1;
          translate.x = 0;
          translate.y = 0;
          applyTransform();
        });

        // Initial styles
        img.style.transition = 'transform 120ms ease-out';
        img.style.willChange = 'transform';
        img.style.cursor = 'auto';
        applyTransform();
      })();

    } catch (error) {
      const loadingEl = document.querySelector('[id^="document-loading-"]');
      if (loadingEl) loadingEl.remove();

      console.error('Document View Error:', error);
      const errorId = 'document-view-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;font-family:"Courier New",monospace;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        const el = document.getElementById(errorId);
        if (el) el.remove();
      }, 5000);
    }
  }

  calculateCustomerMetrics(bills, payments) {
    const now = new Date();
    const totalBilled = bills.reduce((s, b) => s + (b.grand_total || b.total || b.amount || 0), 0);
    const totalPaid = payments.filter(p => p.type === 'PAYMENT').reduce((s, p) => s + (p.amount || 0), 0);
    const totalCredits = payments.filter(p => p.type === 'CREDIT_NOTE').reduce((s, p) => s + (p.credit_amount || 0), 0);
    // Calculate due: invoices - payments - credits
    const due = totalBilled - totalPaid - totalCredits;
    const lastB = bills.length > 0 ? new Date(Math.max(...bills.map(b => {
      const d = new Date(b.invoice_date || b.bill_date || b.created_at);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }))) : null;
    const lastP = payments.length > 0 ? new Date(Math.max(...payments.map(p => {
      const d = new Date(p.payment_date || p.date || p.created_at);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }))) : null;
    const daysB = lastB ? Math.floor((now - lastB) / 86400000) : null;
    const daysP = lastP ? Math.floor((now - lastP) / 86400000) : null;
    const overdue = due > 0 && daysB && daysB > 30 ? daysB - 30 : 0;
    return { 
      amountDue: due, 
      total_debit: totalBilled,
      total_credit: totalPaid + totalCredits,
      daysOverdue: overdue, 
      lastBillDate: lastB ? lastB.toISOString().split('T')[0] : 'N/A', 
      lastPaymentDate: lastP ? lastP.toISOString().split('T')[0] : 'N/A', 
      daysSinceLastBill: daysB, 
      daysSinceLastPayment: daysP 
    };
  }



  async exportOpeningBalance(customerName) {
    try {
      const loadingId = 'pdf-export-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;';
      loadingDiv.innerHTML = '<p>🔄 Generating PDF...</p>';
      document.body.appendChild(loadingDiv);

      const API_BASE = window.BILLING_API_BASE || '';
      const response = await fetch(`${API_BASE}/api/billing/export-opening-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: customerName })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to generate PDF');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to generate PDF');
        }
      }

      const blob = await response.blob();
      const fileName = `opening-balance-${customerName.replace(/\s+/g, '-')}.pdf`;
      
      // Use the new LedgerFileUtils to handle Save-As and Per-Customer folders
      const result = await window.LedgerFileUtils.exportToLocation(customerName, fileName, blob);

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      if (result.success && !result.cancelled) {
        // Show success notification
        const toastId = 'pdf-success-' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#4CAF50;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
        
        let message = `✓ ${fileName} saved successfully`;
        if (result.folder) message = `✓ Saved to ${result.folder}/${fileName}`;
        else if (result.fallback) message = `✓ ${fileName} downloaded successfully`;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { if (document.getElementById(toastId)) document.getElementById(toastId).remove(); }, 4000);
      }
    } catch (error) {
      const loadingEl = document.querySelector('[id^="pdf-export-loading-"]');
      if (loadingEl) loadingEl.remove();
      console.error('Export Error:', error);
      alert(`Export failed: ${error.message}`);
    }
  }

  async setExportFolder(customerName) {
    if (!customerName) return;
    const handle = await window.LedgerFileUtils.pickDirectory(customerName);
    if (handle) {
      alert(`✓ Export folder set for ${customerName}:\n${handle.name}`);
    }
  }

  async printOpeningBalance(customerName) {
    try {
      const API_BASE = window.BILLING_API_BASE || '';
      const printUrl = `${API_BASE}/api/billing/print-opening-balance?customerName=${encodeURIComponent(customerName)}`;
      const w = window.open(printUrl, '_blank');
      if (!w) {
        throw new Error('Print window blocked - please allow popups');
      }
    } catch (error) {
      console.error('Opening Balance PDF Print Error:', error);
      alert(`Print failed: ${error.message}`);
    }
  }

  async editOpeningBalance(customerName) {
    try {
      // Prompt user for new opening balance value
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(customerName)}`);
      if (!response.ok) throw new Error('Failed to fetch customer data');
      
      const result = await response.json();
      const contacts = result.data || result;
      const customer = Array.isArray(contacts) ? contacts.find(c => c.name && c.name.toLowerCase() === customerName.toLowerCase()) : null;
      
      if (!customer) throw new Error('Customer not found');

      const currentBalance = customer.opening_balance || 0;
      const newBalance = prompt(`Enter new opening balance for ${customerName}:\n\nCurrent: ₹${currentBalance.toFixed(2)}`, currentBalance.toFixed(2));
      
      if (newBalance === null) return; // User cancelled

      const newValue = parseFloat(newBalance);
      if (isNaN(newValue)) {
        alert('Invalid amount entered');
        return;
      }

      // Update opening balance via contacts API
      const updateResponse = await fetch(`/api/contacts/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_balance: newValue })
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(error.error || 'Failed to update opening balance');
      }

      alert(`Opening balance updated to ₹${newValue.toFixed(2)}`);
      
      // Refresh ledger view
      this.loadDualLedgerView();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }

  injectLedgerStyles() {
    if (document.getElementById('ledger-styles')) return;

    const link = document.createElement('link');
    link.id = 'ledger-styles';
    link.rel = 'stylesheet';
    link.href = '/modules/billing/css/ledger.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }

  /**
   * Industrial Standard UI: Subtle pulse highlight on the workspace when updated
   */
  applyUpdatePulse() {
    const container = document.getElementById('ledgerMainWorkspace');
    if (!container) return;
    
    container.classList.add('animate-stat-change');
    setTimeout(() => {
      if (container) container.classList.remove('animate-stat-change');
    }, 1000);
  }
}

// Ensure global availability
window.LedgerView = LedgerView;

