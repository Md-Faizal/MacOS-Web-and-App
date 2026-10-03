const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:Payments') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * PaymentCreditNote Module
 * Handles payment entry and credit note management with advanced features
 * 
 * Features:
 * - Record new payments with real-time balance calculation
 * - Issue credit notes with detailed tracking
 * - Dashboard with key metrics and analytics
 * - Payment method management with icons
 * - Advanced transaction history with filtering
 * - Quick actions and smart defaults
 */

class PaymentCreditNote {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.viewContainer = billingApp.viewContainer;
    this.billingData = billingApp.billingData || {};
    this.currentBillId = null;
    this.paymentMethod = 'cash';
    this.selectedBillDetails = null;
  }

  isWorkerUser() {
    return (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
  }

  /**
   * Format a date for <input type="date"> (YYYY-MM-DD)
   */
  formatDateForInput(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format a date for <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
   */
  formatDateTimeForInput(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  /**
   * Render the enhanced payment and credit note interface
   */
  async render(params = null) {
    // Refresh billingData reference from billingApp (in case it was reloaded)
    this.billingData = this.billingApp.billingData || {};
    
    const stats = await this.calculateStats();
    
    this.viewContainer.innerHTML = `
      <div class="payment-credit-container">
        <!-- Enhanced Header with Stats -->
        <div class="payment-credit-header-enhanced">
          <div class="header-title">
            <h2>💰 Payment & Credit Manager</h2>
            <p>Manage payments, track balances & issue credits</p>
          </div>
          <div class="header-stats">
            <div class="stat-box">
              <div class="stat-value">₹${stats.totalPending.toFixed(2)}</div>
              <div class="stat-label">Pending</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${stats.partialBills}</div>
              <div class="stat-label">Partial Bills</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">₹${stats.totalPaid.toFixed(2)}</div>
              <div class="stat-label">Collected</div>
            </div>
          </div>
        </div>

        <!-- Enhanced Tabs -->
        <div class="payment-credit-tabs-enhanced">
          <button class="tab-btn-enhanced active" data-tab="payment">
            <span class="tab-icon">💳</span> Record Payment
          </button>
          <button class="tab-btn-enhanced" data-tab="credit-note">
            <span class="tab-icon">📋</span> Issue Credit Note
          </button>
          <button class="tab-btn-enhanced" data-tab="history">
            <span class="tab-icon">📊</span> Transaction History
          </button>
        </div>

        <!-- Record Payment Tab -->
        <div id="payment-tab" class="tab-content-enhanced active">
          <div class="form-container">
            <div class="form-section">
              <div class="section-title">Customer Information</div>
              
              <div class="form-group-enhanced">
                <label>Select Customer *</label>
                <select id="paymentCustomerSelect" class="form-input-enhanced">
                  <option value="">-- Choose a customer --</option>
                  ${this.getUniqueCustomers()
                    .map(customer => `<option value="${customer}">${customer}</option>`)
                    .join('')}
                </select>
              </div>

              <!-- Customer Balance Summary Card -->
              <div id="customerBalanceCard" class="bill-details-card" style="display: none;">
                <div class="details-row">
                  <span class="label">Total Due</span>
                  <span id="customerTotalDue" class="value highlight-balance">₹0.00</span>
                </div>
                <div class="details-row">
                  <span class="label">Outstanding Bills</span>
                  <span id="customerBillCount" class="value">0</span>
                </div>
                <div class="progress-bar">
                  <div id="paymentProgress" class="progress-fill"></div>
                </div>
                <div class="details-row">
                  <span class="label" style="font-size: 10px;">Payment will settle bills in order of priority</span>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="section-title">Payment Details</div>
              
              <div class="form-row-enhanced">
                <div class="form-group-enhanced">
                  <label>Payment Amount *</label>
                  <div class="input-with-button">
                    <input type="number" id="paymentAmount" class="form-input-enhanced" placeholder="0.00" step="0.01" min="0">
                    <button id="payFullBtn" class="quick-btn" title="Pay all outstanding dues">Pay Full Due</button>
                  </div>
                </div>
                
                <div class="form-group-enhanced">
                  <label>Payment Method *</label>
                  <select id="paymentMethod" class="form-input-enhanced">
                    <option value="cash">💵 Cash</option>
                    <option value="cheque">🏦 Cheque</option>
                    <option value="bank-transfer">🏧 Bank Transfer</option>
                    <option value="online">💻 Online Payment</option>
                    <option value="upi">📱 UPI</option>
                    <option value="card">💳 Card</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
              </div>

              <div class="form-row-enhanced">
                <div class="form-group-enhanced">
                  <label>Payment Date *</label>
                  <input type="date" id="paymentDate" class="form-input-enhanced" value="${this.formatDateForInput(new Date())}">
                </div>
                
                <div class="form-group-enhanced">
                  <label>Reference Number</label>
                  <input type="text" id="paymentReference" class="form-input-enhanced" placeholder="Transaction ID, Cheque #, etc.">
                </div>
              </div>

              <div class="form-group-enhanced">
                <label>Notes (Optional)</label>
                <textarea id="paymentNotes" class="form-textarea-enhanced" placeholder="Add any special notes..."></textarea>
              </div>
            </div>

            <div class="form-actions-enhanced">
              <button id="recordPaymentBtn" class="btn btn-primary-enhanced">✓ Record Payment</button>
              <button id="clearPaymentBtn" class="btn btn-secondary-enhanced">Clear Form</button>
            </div>
          </div>
        </div>

        <!-- Issue Credit Note Tab -->
        <div id="credit-note-tab" class="tab-content-enhanced">
          <div class="form-container">
            <div class="form-section">
              <div class="section-title">Select Customer</div>
              
              <div class="form-group-enhanced">
                <label>Customer *</label>
                <select id="creditNoteCustomerSelect" class="form-input-enhanced">
                  <option value="">-- Choose a customer --</option>
                  ${this.getUniqueCustomers()
                    .map(customer => `<option value="${customer}">${customer}</option>`)
                    .join('')}
                </select>
              </div>

              <!-- Customer Info Card for Credit Notes -->
              <div id="creditCustomerInfoCard" class="bill-details-card" style="display: none;">
                <div class="details-row">
                  <span class="label">Total Outstanding</span>
                  <span id="creditCustomerDue" class="value highlight-balance">₹0.00</span>
                </div>
                <div class="details-row">
                  <span class="label">Active Bills</span>
                  <span id="creditCustomerBillCount" class="value">0</span>
                </div>
                <div class="details-row">
                  <span class="label" style="font-size: 10px;">Credit will be applied to reduce total due</span>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="section-title">Credit Details</div>
              
              <div class="form-row-enhanced">
                <div class="form-group-enhanced">
                  <label>Credit Amount *</label>
                  <input type="number" id="creditAmount" class="form-input-enhanced" placeholder="0.00" step="0.01" min="0">
                </div>
                
                <div class="form-group-enhanced">
                  <label>Reason *</label>
                  <select id="creditReason" class="form-input-enhanced">
                    <option value="">-- Select reason --</option>
                    <option value="overpayment">↩️ Overpayment/Refund</option>
                    <option value="product-return">📦 Product Return</option>
                    <option value="discount">🏷️ Discount Adjustment</option>
                    <option value="damage">⚠️ Damaged/Defective</option>
                    <option value="billing-error">❌ Billing Error</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
              </div>

              <div class="form-row-enhanced">
                <div class="form-group-enhanced">
                  <label>Credit Date *</label>
                  <input type="date" id="creditNoteDate" class="form-input-enhanced" value="${this.formatDateForInput(new Date())}">
                </div>
                
                <div class="form-group-enhanced">
                  <label>Reference Number</label>
                  <input type="text" id="creditNoteReference" class="form-input-enhanced" placeholder="Reference ID, etc.">
                </div>
              </div>

              <div class="form-group-enhanced">
                <label>Description</label>
                <textarea id="creditDescription" class="form-textarea-enhanced" placeholder="Detailed explanation for the credit note..."></textarea>
              </div>

              <div class="form-group-enhanced">
                <label>Attachment (Image)</label>
                <input type="file" id="creditAttachment" class="form-input-enhanced" accept="image/jpeg, image/png, image/webp" style="display: none;">
                <button type="button" id="creditAttachmentBtn" class="btn btn-secondary-enhanced" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; padding: 10px; border: 1px dashed #999; background: #f9fafb; cursor: pointer; border-radius: 4px; color: #374151;">
                  <span style="font-size: 16px;">📎</span> <span>Choose Image</span>
                </button>
                <div style="font-size: 11px; color: #666; margin-top: 4px;">Max size: 5MB. JPG, PNG, WEBP allowed.</div>
                
                <div id="attachmentPreviewContainer" style="display: none; margin-top: 10px; position: relative; max-width: 200px;">
                  <img id="attachmentPreviewImg" src="" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; display: block;">
                  <button id="removeAttachmentBtn" type="button" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✕</button>
                </div>
              </div>
            </div>

            <div class="form-actions-enhanced">
              <button id="issueCreditNoteBtn" class="btn btn-warning-enhanced">📋 Issue Credit Note</button>
              <button id="clearCreditBtn" class="btn btn-secondary-enhanced">Clear Form</button>
            </div>
          </div>
        </div>

        <!-- Transaction History Tab -->
        <div id="history-tab" class="tab-content-enhanced">
          <div class="history-container">
            <div class="history-controls">
              <input type="text" id="historySearch" class="search-input" placeholder="Search by bill #, customer, or reference...">
              <select id="historyFilter" class="filter-select">
                <option value="all">All Transactions</option>
                <option value="payment">Payments Only</option>
                <option value="credit-note">Credit Notes Only</option>
                <option value="opening-balance">📊 Opening Balance</option>
              </select>
            </div>
            
            <div id="transactionHistory" class="transaction-history">
              <p class="loading-state">Loading transactions...</p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.loadRecentTransactions();

    // Handle deep link params
    if (params && params.customerName) {
      log.debug(`🔗 PaymentCreditNote: Pre-selecting customer ${params.customerName}`);
      setTimeout(() => {
        const select = document.getElementById('paymentCustomerSelect');
        if (select) {
          select.value = params.customerName;
          // Trigger change event to load balance
          select.dispatchEvent(new Event('change'));
        }
      }, 300);
    }
  }

  /**
   * Attach enhanced event listeners
   */
  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn-enhanced').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Customer selection change - show balance summary
    const paymentCustomerSelect = document.getElementById('paymentCustomerSelect');
    if (paymentCustomerSelect) {
      paymentCustomerSelect.addEventListener('change', () => {
        this.updateCustomerBalance().catch(err => log.error('Error updating customer balance:', err));
      });
    }

    // Payment date change - refresh reference number
    const paymentDate = document.getElementById('paymentDate');
    if (paymentDate) {
      paymentDate.addEventListener('change', () => {
        const paymentReference = document.getElementById('paymentReference');
        const paymentCustomerSelect = document.getElementById('paymentCustomerSelect');
        if (paymentReference && paymentCustomerSelect.value) {
          // Clear reference to trigger auto-fill
          paymentReference.value = '';
          this.updateCustomerBalance().catch(err => log.error('Error updating customer balance:', err));
        }
      });
    }

    // Quick Payment All button
    const payFullBtn = document.getElementById('payFullBtn');
    if (payFullBtn) {
      payFullBtn.addEventListener('click', () => {
        this.payFullDue().catch(err => log.error('Error in payFullDue:', err));
      });
    }

    // Record payment
    document.getElementById('recordPaymentBtn')?.addEventListener('click', () => {
      this.recordPayment();
    });

    // Clear payment form
    document.getElementById('clearPaymentBtn')?.addEventListener('click', () => {
      this.clearPaymentForm();
    });

    // Issue credit note
    document.getElementById('issueCreditNoteBtn')?.addEventListener('click', () => {
      this.issueCreditNote();
    });

    // Clear credit note form
    document.getElementById('clearCreditBtn')?.addEventListener('click', () => {
      this.clearCreditNoteForm();
    });

    // Credit note customer selection change - show customer info
    const creditNoteCustomerSelect = document.getElementById('creditNoteCustomerSelect');
    if (creditNoteCustomerSelect) {
      creditNoteCustomerSelect.addEventListener('change', () => {
        this.updateCreditNoteCustomerInfo().catch(err => log.error('Error updating credit note customer info:', err));
      });
    }

    // Credit note date change - refresh reference number
    const creditNoteDate = document.getElementById('creditNoteDate');
    if (creditNoteDate) {
      creditNoteDate.addEventListener('change', () => {
        const creditNoteReference = document.getElementById('creditNoteReference');
        const creditNoteCustomerSelect = document.getElementById('creditNoteCustomerSelect');
        if (creditNoteReference && creditNoteCustomerSelect.value) {
          // Clear reference to trigger auto-fill
          creditNoteReference.value = '';
          this.updateCreditNoteCustomerInfo().catch(err => log.error('Error updating credit note customer info:', err));
        }
      });
    }

    // History search and filter
    const historySearch = document.getElementById('historySearch');
    const historyFilter = document.getElementById('historyFilter');
    if (historySearch) {
      historySearch.addEventListener('input', () => this.filterTransactionHistory());
    }
    if (historyFilter) {
      historyFilter.addEventListener('change', () => this.filterTransactionHistory());
    }

    // Attachment Handlers
    const creditAttachmentBtn = document.getElementById('creditAttachmentBtn');
    const creditAttachment = document.getElementById('creditAttachment');
    const attachmentPreviewContainer = document.getElementById('attachmentPreviewContainer');
    const attachmentPreviewImg = document.getElementById('attachmentPreviewImg');
    const removeAttachmentBtn = document.getElementById('removeAttachmentBtn');

    if (creditAttachmentBtn && creditAttachment) {
      creditAttachmentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        creditAttachment.click();
      });
      
      creditAttachment.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validation
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          this.showAlert('❌ Please select a valid image (JPG, PNG, or WEBP)', 'error');
          e.target.value = '';
          return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
          this.showAlert('❌ Image must be less than 5MB', 'error');
          e.target.value = '';
          return;
        }

        try {
          const compressedBase64 = await this.compressImage(file);
          if (attachmentPreviewImg) attachmentPreviewImg.src = compressedBase64;
          if (attachmentPreviewContainer) attachmentPreviewContainer.style.display = 'block';
          // Store it in a dataset
          creditAttachment.dataset.compressedData = compressedBase64;
        } catch (err) {
          log.error('Error compressing image:', err);
          this.showAlert('❌ Failed to process image', 'error');
          e.target.value = '';
        }
      });
    }

    if (removeAttachmentBtn) {
      removeAttachmentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const creditAttachment = document.getElementById('creditAttachment');
        const attachmentPreviewContainer = document.getElementById('attachmentPreviewContainer');
        if (creditAttachment) {
          creditAttachment.value = '';
          creditAttachment.dataset.compressedData = '';
        }
        if (attachmentPreviewContainer) attachmentPreviewContainer.style.display = 'none';
      });
    }
  }

  /**
   * Compress image before upload
   */
  compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Get compressed data
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * Switch tabs
   */
  switchTab(tabName) {
    // Hide all tabs and remove active from buttons
    document.querySelectorAll('.tab-content-enhanced').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn-enhanced').forEach(b => b.classList.remove('active'));
    
    // Show selected tab and activate button
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Load history if switching to history tab
    if (tabName === 'history') {
      this.loadTransactionHistory();
    }
  }

  /**
   * Update customer balance display
   */
  async updateCustomerBalance() {
    const customerSelect = document.getElementById('paymentCustomerSelect');
    const customerBalanceCard = document.getElementById('customerBalanceCard');
    const customerTotalDue = document.getElementById('customerTotalDue');
    const customerBillCount = document.getElementById('customerBillCount');
    const paymentProgress = document.getElementById('paymentProgress');
    const paymentAmount = document.getElementById('paymentAmount');
    const paymentReference = document.getElementById('paymentReference');

    if (!customerSelect.value) {
      if (customerBalanceCard) customerBalanceCard.style.display = 'none';
      return;
    }

    const customerName = customerSelect.value;

    try {
      // Get customer outstanding from API (now includes opening_balance)
      const stats = await this.billingApp.api.getCustomerOutstanding(customerName);
      
      const totalDue = stats.total_outstanding || 0;
      const openingBalance = stats.opening_balance || 0;
      const invoicedAmount = stats.total_invoiced || 0;
      const outstandingCount = stats.outstanding_bills_count || 0;
      const totalBills = stats.total_bills || 0;
      const progressPercent = totalBills > 0 ? ((totalBills - outstandingCount) / totalBills) * 100 : 0;
      const customerId = stats.customer_id;

      if (customerTotalDue) {
        // Show opening balance separately in card
        let balanceHTML = `<strong>₹${totalDue.toFixed(2)}</strong>`;
        if (openingBalance !== 0) {
          const openingDisplay = openingBalance > 0 ? `<span style="color: #dc2626;">+ ₹${openingBalance.toFixed(2)} (Opening)</span>` : `<span style="color: #16a34a;">- ₹${Math.abs(openingBalance).toFixed(2)} (Credit)</span>`;
          balanceHTML = `<div style="font-size: 11px; margin-bottom: 2px;">Invoices: <strong>₹${invoicedAmount.toFixed(2)}</strong></div><div style="font-size: 11px;">${openingDisplay}</div><div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ddd; font-size: 12px;">Total: ${balanceHTML}</div>`;
        }
        customerTotalDue.innerHTML = balanceHTML;
      }
      if (customerBillCount) customerBillCount.textContent = `${outstandingCount}`;
      if (paymentProgress) paymentProgress.style.width = `${progressPercent}%`;
      if (customerBalanceCard) customerBalanceCard.style.display = 'block';

      // Auto-fill amount with total due
      if (paymentAmount && paymentAmount.value === '') {
        paymentAmount.placeholder = `Max: ₹${totalDue.toFixed(2)}`;
      }

      // Auto-fill reference number with next payment reference
      if (paymentReference && !paymentReference.value && customerId) {
        try {
          const paymentDate = document.getElementById('paymentDate')?.value || this.formatDateForInput(new Date());
          const refResponse = await fetch(`/api/billing/invoices/payments/next-reference?customer_id=${customerId}&payment_date=${paymentDate}`);
          if (refResponse.ok) {
            const refData = await refResponse.json();
            paymentReference.value = refData.reference_number;
            paymentReference.placeholder = refData.reference_number;
          }
        } catch (err) {
          log.warn('Could not fetch next reference number:', err);
        }
      }
    } catch (error) {
      log.error('Error updating customer balance:', error);
      if (customerBalanceCard) customerBalanceCard.style.display = 'none';
    }
  }

  /**
   * Pay full outstanding due for customer
   */
  async payFullDue() {
    const customerSelect = document.getElementById('paymentCustomerSelect');
    const paymentAmount = document.getElementById('paymentAmount');
    
    if (!customerSelect.value) {
      this.showAlert('Please select a customer first', 'warning');
      return;
    }

    const customerName = customerSelect.value;

    try {
      // Get customer outstanding from API
      const stats = await this.billingApp.api.getCustomerOutstanding(customerName);
      const totalDue = stats.total_outstanding || 0;

      if (paymentAmount) {
        paymentAmount.value = totalDue.toFixed(2);
      }
    } catch (error) {
      log.error('Error fetching full due amount:', error);
      this.showAlert('Error fetching customer balance', 'error');
    }
  }

  /**
   * Calculate amount already paid for a bill
   */
  calculateBillPaid(billId) {
    return (this.billingData.payments || [])
      .filter(p => (p.type === 'PAYMENT' || !p.type) && (p.bill_id == billId || (p.billsSettled && p.billsSettled.some(b => b.billId === billId))))
      .reduce((sum, p) => {
        const billFromParent = p.billsSettled?.find(b => b.billId === billId);
        return sum + (billFromParent ? billFromParent.amount : (p.amount || 0));
      }, 0);
  }

  /**
   * Get unique customer names from scoped contacts and bills
   */
  getUniqueCustomers() {
    const scoped = this.billingApp.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    const contacts = scoped ? scoped.contacts : (this.billingData.contacts || []);
    const bills = scoped ? scoped.bills : (this.billingData.bills || []);
    
    const customers = new Set();
    
    // Add customers from contacts list first
    contacts.forEach(contact => {
      if (contact.name) customers.add(contact.name);
    });

    // Add any customer names from active scoped bills
    bills.forEach(bill => {
      if (bill.customer_name) {
        customers.add(bill.customer_name);
      }
    });

    return Array.from(customers).sort();
  }

  /**
   * Calculate overall statistics
   */
  /**
   * Update the stats display in the header without full re-render
   */
  async updateStatsDisplay() {
    // Refresh billingData reference from billingApp (in case it was reloaded)
    this.billingData = this.billingApp.billingData || {};
    
    const stats = await this.calculateStats();
    
    const statBoxes = document.querySelectorAll('.payment-credit-container .stat-box');
    if (statBoxes.length >= 3) {
      // Update Pending
      statBoxes[0].querySelector('.stat-value').textContent = `₹${stats.totalPending.toFixed(2)}`;
      // Update Partial Bills
      statBoxes[1].querySelector('.stat-value').textContent = `${stats.partialBills}`;
      // Update Collected
      statBoxes[2].querySelector('.stat-value').textContent = `₹${stats.totalPaid.toFixed(2)}`;
    }
  }

  async calculateStats() {
    const isWorker = this.billingApp.isWorkerUser ? this.billingApp.isWorkerUser() : false;
    const scoped = this.billingApp.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    
    const bills = scoped ? (scoped.statsBills || scoped.bills) : (this.billingData.bills || []);
    const contacts = scoped ? (scoped.statsContacts || scoped.contacts) : (this.billingData.contacts || []);
    const payments = scoped ? (scoped.statsPayments || scoped.payments) : (this.billingData.payments || []);

    let totalInvoiced = 0;
    let partialBills = 0;
    let totalPaid = 0;
    let totalOpeningBalance = 0;

    // Calculate total invoiced amount and partial bills
    bills.forEach(bill => {
      totalInvoiced += (bill.total || 0);
      if (bill.status === 'partial') partialBills++;
    });

    // If worker, calculate totalPaid directly from scoped payments
    if (isWorker) {
      payments.forEach(p => {
        if (p.type === 'PAYMENT' || !p.type) {
          totalPaid += (p.amount || 0);
        } else if (p.type === 'CREDIT_NOTE') {
          totalPaid += (p.credit_amount || 0);
        }
      });
    } else {
      // Admin: Get total collected directly from database (respects exclude_from_stats)
      try {
        if (this.billingApp.api && this.billingApp.api.getTotalCollected) {
          const result = await this.billingApp.api.getTotalCollected();
          totalPaid = result.total_collected || 0;
        }
      } catch (error) {
        log.warn('Error fetching total collected:', error.message);
        totalPaid = 0;
      }
    }

    contacts.forEach(contact => {
      totalOpeningBalance += (contact.opening_balance || 0);
    });

    // Pending = Total Invoiced + Opening Balance - Total Collected
    const totalPending = Math.max(0, totalInvoiced + totalOpeningBalance - totalPaid);

    return { totalPending, partialBills, totalPaid };
  }

  /**
   * Record a new payment (applies to customer's outstanding bills in priority order)
   */
  async recordPayment() {
    const customerName = document.getElementById('paymentCustomerSelect')?.value;
    const amount = parseFloat(document.getElementById('paymentAmount')?.value || 0);
    const method = document.getElementById('paymentMethod')?.value;
    const date = document.getElementById('paymentDate')?.value;
    const reference = document.getElementById('paymentReference')?.value;
    const notes = document.getElementById('paymentNotes')?.value;

    // Validation
    if (!customerName) {
      this.showAlert('❌ Please select a customer', 'error');
      return;
    }

    if (amount <= 0) {
      this.showAlert('❌ Please enter a valid payment amount', 'error');
      return;
    }

    // Find customer ID from bills data or contacts data
    let customerId = (this.billingData.bills || []).find(b => b.customer_name === customerName)?.customer_id;
    
    // If not in bills, look in contacts (for opening balance settlements)
    if (!customerId && this.billingData.contacts) {
      customerId = this.billingData.contacts.find(c => c.name === customerName)?.id;
    }

    if (!customerId) {
      this.showAlert('❌ Customer ID not found', 'error');
      return;
    }

    // 1. Identify if this payment is being recorded FROM a specific bill (optional)
    const specificInvoiceId = this.currentBillId || null;

    // 2. Prepare the single consolidated payment record
    const paymentData = {
      invoice_id: specificInvoiceId,
      customer_id: customerId,
      amount: amount,
      payment_medium: method || null,
      reference_number: reference || null,
      payment_date: date || this.formatDateForInput(new Date()),
      notes: notes || null
    };

    log.debug('Sending single consolidated payment data:', paymentData);

    try {
      const response = await fetch('/api/billing/invoices/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || `HTTP ${response.status}`;
        throw new Error(`Failed to save payment: ${errorMsg}`);
      }

      log.debug(`✓ Consolidated payment of ₹${amount.toFixed(2)} saved successfully`, result);

      // Invalidate API read cache immediately
      if (this.billingApp?.api) {
        this.billingApp.api.invalidateCache('/billing');
      }

      // Optimistic local store update for 0ms instantaneous UI feedback
      const createdPayment = {
        id: result.payment_id || result.id || Date.now(),
        transaction_id: specificInvoiceId,
        invoice_id: specificInvoiceId,
        customer_id: customerId,
        customer_name: customerName,
        amount: amount,
        payment_medium: method || 'cash',
        reference_number: result.reference_number || reference || 'PMT',
        payment_date: date || this.formatDateForInput(new Date()),
        type: 'PAYMENT',
        notes: notes || null,
        created_at: new Date().toISOString()
      };
      if (this.billingApp?.billingData) {
        if (!this.billingApp.billingData.payments) this.billingApp.billingData.payments = [];
        this.billingApp.billingData.payments.unshift(createdPayment);
      }

      // Publish to CoreDataBus (intra-window and cross-tab reactive sync)
      if (typeof window !== 'undefined' && window.CoreDataBus) {
        window.CoreDataBus.publish('billing:payment', 'created', createdPayment);
        window.CoreDataBus.publish('billing:ledger', 'updated', {
          customer_id: customerId,
          customer_name: customerName,
          amount: amount,
          current_due: result.current_due
        });
      }

      // Background canonical reload with forceRefresh
      if (this.billingApp.loadBillingDataFromAPI) {
        this.billingApp.loadBillingDataFromAPI({ forceRefresh: true }).catch(() => {});
      }

      this.showAlert(`✓ Payment of ₹${amount.toFixed(2)} recorded successfully`, 'success');
      this.clearPaymentForm();
      await this.updateCustomerBalance();
      this.loadRecentTransactions();
      await this.updateStatsDisplay();
    } catch (error) {
      log.error('Error saving payment:', error);
      this.showAlert(`❌ Error: ${error.message}`, 'error');
    }
  }

  /**
   * Update credit note customer info display
   */
  async updateCreditNoteCustomerInfo() {
    const customerSelect = document.getElementById('creditNoteCustomerSelect');
    const customerInfoCard = document.getElementById('creditCustomerInfoCard');
    const customerDue = document.getElementById('creditCustomerDue');
    const customerBillCount = document.getElementById('creditCustomerBillCount');
    const creditNoteReference = document.getElementById('creditNoteReference');

    if (!customerSelect.value) {
      if (customerInfoCard) customerInfoCard.style.display = 'none';
      return;
    }

    const customerName = customerSelect.value;

    try {
      // Get customer outstanding from API (now includes opening_balance)
      const stats = await this.billingApp.api.getCustomerOutstanding(customerName);
      
      const totalDue = stats.total_outstanding || 0;
      const openingBalance = stats.opening_balance || 0;
      const invoicedAmount = stats.total_invoiced || 0;
      const outstandingCount = stats.outstanding_bills_count || 0;
      const customerId = stats.customer_id;

      if (customerDue) {
        // Show opening balance separately in card (matching payment UI)
        let balanceHTML = `<strong>₹${totalDue.toFixed(2)}</strong>`;
        if (openingBalance !== 0) {
          const openingDisplay = openingBalance > 0 ? `<span style="color: #dc2626;">+ ₹${openingBalance.toFixed(2)} (Opening)</span>` : `<span style="color: #16a34a;">- ₹${Math.abs(openingBalance).toFixed(2)} (Credit)</span>`;
          balanceHTML = `<div style="font-size: 11px; margin-bottom: 2px;">Invoices: <strong>₹${invoicedAmount.toFixed(2)}</strong></div><div style="font-size: 11px;">${openingDisplay}</div><div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ddd; font-size: 12px;">Total: ${balanceHTML}</div>`;
        }
        customerDue.innerHTML = balanceHTML;
      }
      if (customerBillCount) customerBillCount.textContent = `${outstandingCount}`;
      if (customerInfoCard) customerInfoCard.style.display = 'block';

      // Auto-fill reference number with next credit note reference
      if (creditNoteReference && !creditNoteReference.value && customerId) {
        try {
          const creditDate = document.getElementById('creditNoteDate')?.value || this.formatDateForInput(new Date());
          const refResponse = await fetch(`/api/billing/invoices/payments/next-credit-reference?customer_id=${customerId}&payment_date=${creditDate}`);
          if (refResponse.ok) {
            const refData = await refResponse.json();
            creditNoteReference.value = refData.reference_number;
            creditNoteReference.placeholder = refData.reference_number;
          }
        } catch (err) {
          log.warn('Could not fetch next credit note reference:', err);
        }
      }
    } catch (error) {
      log.error('Error updating credit note customer info:', error);
      if (customerInfoCard) customerInfoCard.style.display = 'none';
    }
  }

  /**
   * Issue a credit note (applies to customer's account in priority order)
   */
  async issueCreditNote() {
    const customerName = document.getElementById('creditNoteCustomerSelect')?.value;
    const amount = parseFloat(document.getElementById('creditAmount')?.value || 0);
    const reason = document.getElementById('creditReason')?.value;
    const date = document.getElementById('creditNoteDate')?.value;
    const reference = document.getElementById('creditNoteReference')?.value;
    const description = document.getElementById('creditDescription')?.value;

    const attachmentInput = document.getElementById('creditAttachment');
    let attachment_data = null;
    if (attachmentInput && attachmentInput.dataset.compressedData) {
      attachment_data = attachmentInput.dataset.compressedData;
    } else if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
      // Fallback
      const file = attachmentInput.files[0];
      attachment_data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    // Validation
    if (!customerName) {
      this.showAlert('❌ Please select a customer', 'error');
      return;
    }

    if (amount <= 0) {
      this.showAlert('❌ Please enter a valid credit amount', 'error');
      return;
    }

    if (!reason) {
      this.showAlert('❌ Please select a reason', 'error');
      return;
    }

    // Find customer ID from bills data or contacts data
    let customerId = (this.billingData.bills || []).find(b => b.customer_name === customerName)?.customer_id;
    
    // If not in bills, look in contacts (for opening balance settlements)
    if (!customerId && this.billingData.contacts) {
      customerId = this.billingData.contacts.find(c => c.name === customerName)?.id;
    }

    if (!customerId) {
      this.showAlert('❌ Customer not found', 'error');
      return;
    }

    // Get customer's outstanding bills
    const customerBills = (this.billingData.bills || [])
      .filter(b => b.customer_name === customerName)
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)); // Sort by date for priority

    let remainingCredit = amount;
    let billsAffected = [];

    // Apply credit to bills in priority (oldest first)
    for (const bill of customerBills) {
      if (remainingCredit <= 0) break;

      const paidAmount = this.calculateBillPaid(bill.id);
      const billDue = bill.total - paidAmount;

      if (billDue > 0) {
        const creditForThisBill = Math.min(remainingCredit, billDue);
        billsAffected.push({ invoiceId: bill.id, amount: creditForThisBill });
        remainingCredit -= creditForThisBill;
      }
    }

    // If no bills were affected or if there's remaining credit, record it as a standalone credit note
    // This allows credit notes to be issued against opening balances
    if (billsAffected.length === 0 || remainingCredit > 0) {
      billsAffected.push({ invoiceId: null, amount: remainingCredit });
    }

    // Save each credit note to the database via API
    try {
      let totalSaved = 0;
      for (const { invoiceId, amount: creditAmount } of billsAffected) {
        const creditData = {
          invoice_id: invoiceId,
          customer_id: customerId,
          amount: creditAmount,
          reason: reason,
          payment_date: date || this.formatDateForInput(new Date()),
          reference_number: reference || null,
          notes: description || null,
          attachment_data: attachment_data || null
        };

        log.debug('Sending credit note data:', creditData);

        const response = await fetch('/api/billing/invoices/creditnotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creditData)
        });

        const result = await response.json();

        if (!response.ok) {
          const errorMsg = result.error || `HTTP ${response.status}`;
          throw new Error(`Failed to save credit note for invoice ${invoiceId}: ${errorMsg}`);
        }

        totalSaved += creditAmount;
        log.debug(`✓ Credit note of ₹${creditAmount.toFixed(2)} saved for invoice ${invoiceId}`, result);
      }

      // Invalidate API read cache immediately
      if (this.billingApp?.api) {
        this.billingApp.api.invalidateCache('/billing');
      }

      // Publish to CoreDataBus
      if (typeof window !== 'undefined' && window.CoreDataBus) {
        window.CoreDataBus.publish('billing:creditnote', 'created', { customer_name: customerName, amount: totalSaved });
        window.CoreDataBus.publish('billing:ledger', 'updated', { customer_name: customerName, amount: totalSaved });
      }

      // Background canonical reload with forceRefresh
      if (this.billingApp.loadBillingDataFromAPI) {
        this.billingApp.loadBillingDataFromAPI({ forceRefresh: true }).catch(() => {});
      }

      this.showAlert(`✓ Credit note of ₹${totalSaved.toFixed(2)} issued and applied to ${billsAffected.length} bill(s)`, 'success');
      this.clearCreditNoteForm();
      await this.updateCreditNoteCustomerInfo();
      this.loadRecentTransactions();
      await this.updateStatsDisplay();
    } catch (error) {
      log.error('Error saving credit note:', error);
      this.showAlert(`❌ Error: ${error.message}`, 'error');
    }
  }

  /**
   * Show alert notifications
   */
  showAlert(message, type = 'info') {
    if (this.billingApp?.showNotification) {
      return this.billingApp.showNotification(message, type);
    }
    if (typeof window !== 'undefined' && window.MacOSNotificationManager) {
      return window.MacOSNotificationManager.notify({
        app: 'Billing',
        title: 'Payment & Credit',
        message: message,
        type: type
      });
    }
    if (typeof window !== 'undefined' && window.showNotification) {
      return window.showNotification(message, type, { app: 'Billing', title: 'Payment & Credit' });
    }
  }

  /**
   * Load and display recent transactions (for main dashboard)
   */
  loadRecentTransactions() {
    const container = document.getElementById('recentTransactions');
    if (!container) return;

    // All payments and credit notes come from scoped payments
    const scoped = this.billingApp.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    const allPayments = scoped ? scoped.payments : (this.billingData.payments || []);
    
    // Separate by type
    const payments = allPayments.filter(p => p.type === 'PAYMENT');
    const creditNotes = allPayments.filter(p => p.type === 'CREDIT_NOTE');
    
    // Combine and sort
    const allTransactions = [...payments, ...creditNotes]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    if (allTransactions.length === 0) {
      container.innerHTML = '<p style="color: #999; font-size: 12px;">No transactions yet</p>';
      return;
    }

    container.innerHTML = allTransactions.map(txn => {
      const methodIcon = {
        'cash': '💵',
        'cheque': '🏦',
        'bank-transfer': '🏧',
        'online': '💻',
        'upi': '📱',
        'card': '💳'
      };

      const reasonIcon = {
        'overpayment': '↩️',
        'product-return': '📦',
        'discount': '🏷️',
        'damage': '⚠️',
        'billing-error': '❌',
        'other': '📝'
      };

      return `
        <div class="transaction-item">
          <div class="transaction-icon">${txn.type === 'PAYMENT' ? '💳' : '📋'}</div>
          <div class="transaction-content">
            <div class="transaction-title">
              ${txn.type === 'PAYMENT' ? 'Payment' : 'Credit Note'} - ${txn.customer_name || 'Unknown'}
            </div>
            <div class="transaction-meta">
              ${txn.type === 'PAYMENT' ? `${methodIcon[txn.payment_medium] || '📝'} ${txn.payment_medium || 'N/A'}` : `${reasonIcon[txn.reason] || '📝'} ${txn.reason || 'N/A'}`}
              ${txn.reference_number ? ` • Ref: ${txn.reference_number}` : ''}
            </div>
          </div>
          <div class="transaction-amount" style="color: ${txn.type === 'PAYMENT' ? '#22c55e' : '#f59e0b'}">
            ₹${(txn.amount || txn.credit_amount || 0).toFixed(2)}
          </div>
          <div class="transaction-date">${new Date(txn.created_at).toLocaleDateString()}</div>
        </div>
      `;
    }).join('');
  }

  /**
   * Load full transaction history
   */
  loadTransactionHistory() {
    const scoped = this.billingApp.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    const allPayments = scoped ? scoped.payments : (this.billingData.payments || []);
    this.displayTransactionHistory(allPayments);
  }

  /**
   * Filter transaction history based on search and filter criteria
   */
  filterTransactionHistory() {
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
    const filterType = document.getElementById('historyFilter')?.value || 'all';

    const scoped = this.billingApp.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    let transactions = scoped ? scoped.payments : (this.billingData.payments || []);
    let showingOpeningBalance = false;

    // Apply type filter
    if (filterType === 'opening-balance') {
      showingOpeningBalance = true;
      transactions = [];
    } else if (filterType === 'PAYMENT' || filterType === 'payment') {
      transactions = transactions.filter(t => t.type === 'PAYMENT');
    } else if (filterType === 'CREDIT_NOTE' || filterType === 'credit-note') {
      transactions = transactions.filter(t => t.type === 'CREDIT_NOTE');
    }

    // Apply search filter
    if (searchTerm && !showingOpeningBalance) {
      transactions = transactions.filter(t => 
        (t.customer_name || '').toLowerCase().includes(searchTerm) ||
        (t.reference_number || '').toLowerCase().includes(searchTerm) ||
        (t.reason || '').toLowerCase().includes(searchTerm)
      );
    }

    if (!showingOpeningBalance) {
      transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    this.displayTransactionHistory(transactions, showingOpeningBalance);
  }

  /**
   * Display transaction history
   */
  displayTransactionHistory(transactions, showingOpeningBalance = false) {
    const container = document.getElementById('transactionHistory');
    if (!container) return;

    if (showingOpeningBalance) {
      // Show only opening balance cards for accessible customers
      const uniqueCustomers = this.getUniqueCustomers();
      
      const openingBalanceCardsHTML = uniqueCustomers.map(customer => `
        <div class="transaction-card opening-balance-card" data-customer="${customer}" style="background-color: #f0f8ff; border: 2px solid #1e40af;">
          <div class="card-header">
            <div class="card-title">
              <span class="icon">📊</span>
              <div class="title-text">
                <div class="main-title">Opening Balance</div>
                <div class="sub-title">${customer}</div>
              </div>
            </div>
            <div class="card-amount opening-balance-amount" style="color: #1e40af;">Loading...</div>
          </div>
        </div>
      `).join('');
      
      container.innerHTML = openingBalanceCardsHTML;
      
      // Fetch opening balances for each customer
      uniqueCustomers.forEach(customer => {
        this.fetchAndDisplayOpeningBalanceForCustomer(customer, container);
      });
      return;
    }

    if (transactions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No transactions found</p></div>';
      return;
    }

    const methodIcon = {
      'cash': '💵',
      'cheque': '🏦',
      'bank-transfer': '🏧',
      'online': '💻',
      'upi': '📱',
      'card': '💳'
    };

    const reasonIcon = {
      'overpayment': '↩️',
      'product-return': '📦',
      'discount': '🏷️',
      'damage': '⚠️',
      'billing-error': '❌',
      'other': '📝'
    };

    // Get unique customers from transactions
    const customers = [...new Set(transactions.map(t => t.customer_name))];
    
    // Build opening balance cards for each customer
    const openingBalanceCardsHTML = customers.map(customer => `
      <div class="transaction-card opening-balance-card" data-customer="${customer}" style="background-color: #f0f8ff; border: 2px solid #1e40af;">
        <div class="card-header">
          <div class="card-title">
            <span class="icon">📊</span>
            <div class="title-text">
              <div class="main-title">Opening Balance</div>
              <div class="sub-title">${customer}</div>
            </div>
          </div>
          <div class="card-amount opening-balance-amount" style="color: #1e40af;">Loading...</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = openingBalanceCardsHTML + transactions.map(txn => {
      const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge)
        ? window.renderWorkerBadge(txn, { compact: true })
        : '';
      const auditInfo = JSON.stringify({
        type: txn.type === 'PAYMENT' ? 'Payment' : 'Credit Note',
        id: txn.id,
        name: `${txn.type === 'PAYMENT' ? 'Payment' : 'Credit Note'} (${txn.customer_name || 'Customer'})`,
        created_by_role: txn.created_by_role,
        created_by_name: txn.created_by_name,
        last_edited_by_role: txn.last_edited_by_role,
        last_edited_by_name: txn.last_edited_by_name,
        date: txn.payment_date || txn.created_at,
        created_at: txn.created_at
      });
      return `
      <div class="transaction-card" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
        <div class="card-header">
          <div class="card-title">
            <span class="icon">${txn.type === 'PAYMENT' ? '💳' : '📋'}</span>
            <div class="title-text">
              <div class="main-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><span>${txn.type === 'PAYMENT' ? 'Payment' : 'Credit Note'}</span> ${workerBadgeHtml}</div>
              <div class="sub-title">${txn.customer_name || 'Unknown'}</div>
            </div>
          </div>
          <div class="card-amount">${txn.type === 'PAYMENT' ? '+' : '-'}₹${(txn.type === 'PAYMENT' ? txn.amount : txn.credit_amount).toFixed(2)}</div>
        </div>
        <div class="card-body">
          <div class="detail-row">
            <span class="label">Type</span>
            <span class="value">${txn.type === 'PAYMENT' ? `${methodIcon[txn.payment_medium] || '📝'} ${txn.payment_medium || 'N/A'}` : `${reasonIcon[txn.reason] || '📝'} ${txn.reason || 'N/A'}`}</span>
          </div>
          ${txn.reference_number ? `
            <div class="detail-row">
              <span class="label">Reference</span>
              <span class="value">${txn.reference_number}</span>
            </div>
          ` : ''}
          ${txn.notes ? `
            <div class="detail-row">
              <span class="label">Notes</span>
              <span class="value">${txn.notes}</span>
            </div>
          ` : ''}
          ${txn.attachment_data ? `
            <div class="detail-row">
              <span class="label">Attachment</span>
              <span class="value"><span class="view-attachment-link" onclick="event.stopPropagation(); if(window.HistoryView && window.HistoryView.showViewer) { window.HistoryView.showViewer('${txn.attachment_data}'); } else { log.debug('Viewer not ready'); }" style="cursor: pointer; color: #3b82f6; text-decoration: underline; font-weight: bold;">🖼️ View</span></span>
            </div>
          ` : ''}
          <div class="detail-row">
            <span class="label">Date</span>
            <span class="value">${new Date(txn.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      `;
    }).join('');
    
    // Fetch opening balances for each customer
    customers.forEach(customer => {
      this.fetchAndDisplayOpeningBalanceForCustomer(customer, container);
    });
  }

  async fetchAndDisplayOpeningBalanceForCustomer(customerName, container) {
    try {
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(customerName)}`);
      if (response.ok) {
        const result = await response.json();
        const contacts = result.data || result;
        
        if (Array.isArray(contacts) && contacts.length > 0) {
          const customer = contacts.find(c => c.name.toLowerCase() === customerName.toLowerCase());
          if (customer) {
            const openingBalance = customer.opening_balance || 0;
            const balanceCard = container.querySelector(`[data-customer="${customerName}"]`);
            
            // Hide card if opening balance is 0
            if (openingBalance === 0) {
              if (balanceCard) balanceCard.style.display = 'none';
              return;
            }
            
            const card = container.querySelector(`[data-customer="${customerName}"] .opening-balance-amount`);
            if (card) {
              let balanceHTML = '';
              if (openingBalance < 0) {
                balanceHTML = `<span style="color: #16a34a;">Credit: ₹${Math.abs(openingBalance).toFixed(2)}</span>`;
              } else {
                balanceHTML = `<span style="color: #dc2626;">₹${openingBalance.toFixed(2)}</span>`;
              }
              card.innerHTML = balanceHTML;
            }
          }
        }
      }
    } catch (error) {
      log.error('Error fetching opening balance:', error);
    }
  }

  /**
   * Open edit modal for a payment/credit note
   */
  /**
   * Save payment/credit note edit
   */
  async savePaymentEdit() {
    if (!this.currentEditPaymentId) {
      this.showAlert('No payment selected for editing', 'error');
      return;
    }

    try {
      const paymentId = this.currentEditPaymentId;
      const paymentType = this.currentEditPaymentType;

      let updateData = {};

      if (paymentType === 'PAYMENT') {
        const amount = parseFloat(document.getElementById('editAmount').value);
        if (!amount || amount <= 0) {
          this.showAlert('Please enter a valid amount', 'warning');
          return;
        }

        updateData = {
          amount,
          payment_medium: document.getElementById('editPaymentMethod').value,
          reference_number: document.getElementById('editReference').value,
          payment_date: document.getElementById('editPaymentDate').value,
          notes: document.getElementById('editPaymentNotes').value
        };
      } else if (paymentType === 'CREDIT_NOTE') {
        const creditAmount = parseFloat(document.getElementById('editCreditAmount').value);
        if (!creditAmount || creditAmount <= 0) {
          this.showAlert('Please enter a valid credit amount', 'warning');
          return;
        }

        updateData = {
          credit_amount: creditAmount,
          reason: document.getElementById('editCreditReason').value,
          payment_date: document.getElementById('editCreditDate').value,
          notes: document.getElementById('editCreditNotes').value
        };
      }

      // Send update to backend
      const response = await fetch(`/api/billing/invoices/payments/${paymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update payment');
      }

      const result = await response.json();
      
      // Close modal
      document.getElementById('editPaymentModal').classList.add('hidden');
      
      // Show success message
      this.showAlert('Payment updated successfully', 'success');
      
      // Reload transactions
      this.loadTransactionHistory();
      
      // Invalidate API cache & publish update
      if (this.billingApp?.api) this.billingApp.api.invalidateCache('/billing');
      if (typeof window !== 'undefined' && window.CoreDataBus) {
        window.CoreDataBus.publish('billing:payment', 'updated', { id: paymentId });
        window.CoreDataBus.publish('billing:ledger', 'updated', { id: paymentId });
      }
      if (this.billingApp?.loadBillingDataFromAPI) {
        this.billingApp.loadBillingDataFromAPI({ forceRefresh: true }).catch(() => {});
      }

    } catch (error) {
      log.error('Error saving payment edit:', error);
      this.showAlert('Error updating payment: ' + error.message, 'error');
    }
  }

  /**
   * Delete a payment/credit note
   */
  async deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/billing/invoices/payments/${paymentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete payment');
      }

      if (this.billingApp?.showNotification) {
        this.billingApp.showNotification('Transaction deleted successfully', 'success');
      }
      
      // Reload transactions
      this.loadTransactionHistory();
      
      // Invalidate API cache & publish update
      if (this.billingApp?.api) this.billingApp.api.invalidateCache('/billing');
      if (typeof window !== 'undefined' && window.CoreDataBus) {
        window.CoreDataBus.publish('billing:payment', 'updated', { id: paymentId });
        window.CoreDataBus.publish('billing:ledger', 'updated', { id: paymentId });
      }
      if (this.billingApp?.loadBillingDataFromAPI) {
        this.billingApp.loadBillingDataFromAPI({ forceRefresh: true }).catch(() => {});
      }

    } catch (error) {
      log.error('Error deleting payment:', error);
      this.showAlert('Error deleting transaction: ' + error.message, 'error');
    }
  }

  /**
   * Clear payment form
   */
  clearPaymentForm() {
    const paymentCustomerSelect = document.getElementById('paymentCustomerSelect');
    const paymentAmount = document.getElementById('paymentAmount');
    const paymentMethod = document.getElementById('paymentMethod');
    const paymentDate = document.getElementById('paymentDate');
    const paymentReference = document.getElementById('paymentReference');
    const paymentNotes = document.getElementById('paymentNotes');
    const customerBalanceCard = document.getElementById('customerBalanceCard');

    if (paymentCustomerSelect) paymentCustomerSelect.value = '';
    if (paymentAmount) paymentAmount.value = '';
    if (paymentMethod) paymentMethod.value = 'cash';
    if (paymentDate) paymentDate.value = this.formatDateForInput(new Date());
    if (paymentReference) paymentReference.value = '';
    if (paymentNotes) paymentNotes.value = '';
    if (customerBalanceCard) customerBalanceCard.style.display = 'none';
  }

  /**
   * Clear credit note form
   */
  clearCreditNoteForm() {
    const creditNoteCustomerSelect = document.getElementById('creditNoteCustomerSelect');
    const creditAmount = document.getElementById('creditAmount');
    const creditReason = document.getElementById('creditReason');
    const creditNoteDate = document.getElementById('creditNoteDate');
    const creditNoteReference = document.getElementById('creditNoteReference');
    const creditDescription = document.getElementById('creditDescription');
    const customerInfoCard = document.getElementById('creditCustomerInfoCard');
    const creditAttachment = document.getElementById('creditAttachment');
    const attachmentPreviewContainer = document.getElementById('attachmentPreviewContainer');

    if (creditNoteCustomerSelect) creditNoteCustomerSelect.value = '';
    if (creditAmount) creditAmount.value = '';
    if (creditReason) creditReason.value = '';
    if (creditNoteDate) creditNoteDate.value = this.formatDateForInput(new Date());
    if (creditNoteReference) creditNoteReference.value = '';
    if (creditDescription) creditDescription.value = '';
    if (customerInfoCard) customerInfoCard.style.display = 'none';
    if (creditAttachment) {
      creditAttachment.value = '';
      creditAttachment.dataset.compressedData = '';
    }
    if (attachmentPreviewContainer) attachmentPreviewContainer.style.display = 'none';
  }
}

// Make accessible globally
window.PaymentCreditNote = PaymentCreditNote;
