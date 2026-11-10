/**
 * payment-gateway.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Customer Payment Gateway Controller
 * Architectural design language aligned with Nexus Flight Deck.
 * Clean, subtle, modern interactions with zero filler slop words.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ─── Extract Link Code ──────────────────────────────────────────────────────
  function extractLinkCode() {
    const path = window.location.pathname;
    const pMatch = path.match(/^\/(?:p|pay)\/([a-zA-Z0-9_-]+)/i);
    if (pMatch && pMatch[1]) return pMatch[1];

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code') || urlParams.get('c') || '';
  }

  const code = extractLinkCode();
  let gatewayData = null;
  let activeTrancheIndex = 0;
  let currentMode = 'qr'; // 'qr' or 'bank'

  // DOM Elements
  const loadingView = document.getElementById('loadingView');
  const errorView = document.getElementById('errorView');
  const activeView = document.getElementById('activeView');
  const receiptView = document.getElementById('receiptView');

  const errorTitle = document.getElementById('errorTitle');
  const errorMsg = document.getElementById('errorMsg');

  const companyNameEl = document.getElementById('companyName');
  const invoiceCoverRefEl = document.getElementById('invoiceCoverRef');
  const payableAmountEl = document.getElementById('payableAmount');
  const customerNameEl = document.getElementById('customerName');
  const paymentMemoEl = document.getElementById('paymentMemo');

  const trancheSection = document.getElementById('trancheSection');
  const tranchePills = document.getElementById('tranchePills');
  const trancheProgress = document.getElementById('trancheProgress');
  const terminalTrancheStatus = document.getElementById('terminalTrancheStatus');

  const qrImageEl = document.getElementById('qrImage');
  const launchUpiBtn = document.getElementById('launchUpiBtn');

  const tabBtnQr = document.getElementById('tabBtnQr');
  const tabBtnBank = document.getElementById('tabBtnBank');
  const bankSpecTable = document.getElementById('bankSpecTable');

  const bankHolderEl = document.getElementById('bankHolder');
  const bankBranchEl = document.getElementById('bankBranch');
  const bankAccNoEl = document.getElementById('bankAccNo');
  const bankIfscEl = document.getElementById('bankIfsc');
  const bankUpiEl = document.getElementById('bankUpi');

  const accordionTrigger = document.getElementById('accordionTrigger');
  const accordionContent = document.getElementById('accordionContent');
  const accordionArrow = document.getElementById('accordionArrow');

  const remittanceForm = document.getElementById('remittanceForm');
  const utrFieldsContainer = document.getElementById('utrFieldsContainer');
  const amountInput = document.getElementById('amountInput');
  const payerNameInput = document.getElementById('payerNameInput');
  const notesInput = document.getElementById('notesInput');
  const submitRemittanceBtn = document.getElementById('submitRemittanceBtn');

  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const printReceiptBtn = document.getElementById('printReceiptBtn');

  // Format INR Currency
  function formatINR(val) {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(msg) {
    if (!toast || !toastMsg) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2200);
  }

  // Clipboard Copy Helper
  async function copyText(text, label) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showToast(`Copied ${label}`);
      return true;
    } catch (_) {
      showToast('Copy failed');
      return false;
    }
  }

  // Attach Copy Handlers
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy-target');
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const val = targetEl.textContent.trim().replace(/\s*•\s*/g, ' - ');
      const label = targetEl.previousElementSibling ? targetEl.previousElementSibling.textContent.trim() : 'value';

      btn.classList.add('copied');
      btn.textContent = 'Copied';
      await copyText(val, label);
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = 'Copy';
      }, 1500);
    });
  });

  // ─── Tranche-Aware UTR Form Rendering ────────────────────────────────────────
  function updateUtrFields() {
    if (!utrFieldsContainer || !gatewayData) return;

    if (currentMode === 'bank') {
      // Bank Transfer: Single UTR for entire amount
      utrFieldsContainer.innerHTML = `
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="input-label" for="utrInput">Bank Transfer Reference / UTR Number *</label>
          <input type="text" id="utrInput" class="input-mono" placeholder="Enter 12-digit UTR or Bank Ref" required autocomplete="off" />
        </div>
      `;
      if (amountInput) amountInput.value = Number(gatewayData.amount).toFixed(2);
      return;
    }

    // UPI QR Mode
    if (gatewayData.is_split && Array.isArray(gatewayData.tranches) && gatewayData.tranches.length > 1) {
      // Multiple tranches (> ₹1 Lakh)
      const tranches = gatewayData.tranches;
      utrFieldsContainer.innerHTML = `
        <div class="multi-tranche-utr-notice">
          <div style="font-size: 11px; font-weight: 600; color: #fff; margin-bottom: 3px;">
            UPI Tranche References (${tranches.length} Payments)
          </div>
          <div style="font-size: 10px; color: var(--text-3); line-height: 1.4;">
            Because UPI limits max ₹1,00,000 per transaction, enter the UTR generated for each tranche:
          </div>
        </div>
        ${tranches.map((t, idx) => `
          <div class="form-group tranche-utr-group" id="trancheGroup_${idx}" style="margin-bottom: 10px;">
            <label class="input-label" for="utrInputTranche_${idx}">
              Tranche 0${t.part} UTR (${formatINR(t.amount)}) *
            </label>
            <input type="text" id="utrInputTranche_${idx}" class="input-mono tranche-utr-input" data-part="${t.part}" data-amount="${t.amount}" placeholder="UTR for Tranche 0${t.part}" required autocomplete="off" />
          </div>
        `).join('')}
      `;
      if (amountInput) amountInput.value = Number(gatewayData.amount).toFixed(2);
    } else {
      // Single QR code
      utrFieldsContainer.innerHTML = `
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="input-label" for="utrInput">UPI Transaction Reference / UTR Number *</label>
          <input type="text" id="utrInput" class="input-mono" placeholder="Enter 12-digit UPI UTR" required autocomplete="off" />
        </div>
      `;
      if (amountInput) amountInput.value = Number(gatewayData.amount).toFixed(2);
    }
  }

  // Switch Channels (UPI QR vs Bank Transfer)
  if (tabBtnQr && tabBtnBank && bankSpecTable) {
    tabBtnQr.addEventListener('click', () => {
      currentMode = 'qr';
      tabBtnQr.classList.add('active');
      tabBtnBank.classList.remove('active');
      tabBtnQr.setAttribute('aria-selected', 'true');
      tabBtnBank.setAttribute('aria-selected', 'false');
      bankSpecTable.style.display = 'none';
      updateUtrFields();
    });

    tabBtnBank.addEventListener('click', () => {
      currentMode = 'bank';
      tabBtnBank.classList.add('active');
      tabBtnQr.classList.remove('active');
      tabBtnBank.setAttribute('aria-selected', 'true');
      tabBtnQr.setAttribute('aria-selected', 'false');
      bankSpecTable.style.display = 'flex';
      updateUtrFields();
    });
  }

  // Drawer Accordion Toggle
  if (accordionTrigger && accordionContent) {
    accordionTrigger.addEventListener('click', () => {
      const isOpen = accordionContent.classList.contains('open');
      if (isOpen) {
        accordionContent.classList.remove('open');
        accordionTrigger.setAttribute('aria-expanded', 'false');
        if (accordionArrow) accordionArrow.textContent = '▼';
      } else {
        accordionContent.classList.add('open');
        accordionTrigger.setAttribute('aria-expanded', 'true');
        if (accordionArrow) accordionArrow.textContent = '▲';
        const firstInput = accordionContent.querySelector('input');
        if (firstInput) firstInput.focus();
      }
    });
  }

  // Print Receipt
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Select Active Tranche
  function selectTranche(index) {
    if (!gatewayData || !gatewayData.tranches || !gatewayData.tranches[index]) return;
    activeTrancheIndex = index;
    const tranche = gatewayData.tranches[index];

    if (qrImageEl) {
      qrImageEl.style.opacity = '0.5';
      qrImageEl.src = tranche.qr_data_url || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tranche.upi_uri)}`;
      qrImageEl.onload = () => { qrImageEl.style.opacity = '1'; };
    }
    if (launchUpiBtn) {
      launchUpiBtn.href = tranche.upi_uri;
    }

    if (gatewayData.is_split) {
      if (terminalTrancheStatus) {
        terminalTrancheStatus.textContent = `Part ${tranche.part} of ${tranche.total_parts} (${formatINR(tranche.amount)})`;
      }
      if (trancheProgress) {
        trancheProgress.textContent = `Part ${tranche.part} of ${tranche.total_parts}`;
      }

      // Highlight corresponding tranche input if visible
      document.querySelectorAll('.tranche-utr-group').forEach((grp, gIdx) => {
        if (gIdx === index) {
          grp.style.borderLeft = '2px solid rgba(255, 255, 255, 0.4)';
          grp.style.paddingLeft = '8px';
        } else {
          grp.style.borderLeft = 'none';
          grp.style.paddingLeft = '0';
        }
      });
    } else {
      if (terminalTrancheStatus) {
        terminalTrancheStatus.textContent = '';
      }
    }

    // Update active pill state
    document.querySelectorAll('.tranche-pill').forEach((pill, pIdx) => {
      if (pIdx === index) pill.classList.add('active');
      else pill.classList.remove('active');
    });
  }

  // Show Receipt View
  function showReceipt(info) {
    if (loadingView) loadingView.style.display = 'none';
    if (activeView) activeView.style.display = 'none';
    if (receiptView) receiptView.style.display = 'block';

    const custEl = document.getElementById('receiptCustomer');
    if (custEl) custEl.textContent = info.customer_name || gatewayData?.customer_name || '-';
    const amtEl = document.getElementById('receiptAmount');
    if (amtEl) amtEl.textContent = formatINR(info.claimed_amount || gatewayData?.amount || 0);

    // Invoice Covered
    const invEl = document.getElementById('receiptInvoice');
    if (invEl) {
      invEl.textContent = info.invoice_label || gatewayData?.invoice_label || (gatewayData?.invoices?.length ? `Invoice: ${gatewayData.invoices.join(', ')}` : 'Statement Settlement');
    }

    // UTR display (formatted if multiple tranches)
    const utrEl = document.getElementById('receiptUtr');
    if (utrEl) {
      const rawUtr = info.claimed_utr || 'Pending';
      if (rawUtr.includes('|')) {
        utrEl.innerHTML = rawUtr.split('|').map(u => `<div>${u.trim()}</div>`).join('');
      } else {
        utrEl.textContent = rawUtr;
      }
    }

    const timeEl = document.getElementById('receiptTime');
    if (timeEl) {
      const d = info.claimed_at ? new Date(info.claimed_at) : new Date();
      timeEl.textContent = d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      }) + ' IST';
    }
  }

  // Populate Gateway
  function populateGateway(data) {
    gatewayData = data;

    // Header Meta
    if (companyNameEl) {
      companyNameEl.textContent = data.company?.name || 'Utkal Chemical Aushadhalaya';
    }
      if (invoiceCoverRefEl) {
        invoiceCoverRefEl.textContent = data.invoice_label || (data.invoices?.length ? `Invoice: ${data.invoices.join(', ')}` : 'Statement Settlement');
      }

      // Hero Meta
      if (payableAmountEl) payableAmountEl.textContent = formatINR(data.amount);
      if (customerNameEl) customerNameEl.textContent = data.customer_name || 'Customer';
      if (paymentMemoEl) paymentMemoEl.textContent = data.description || 'Statement Settlement';

      // Status Check
      if (data.status === 'CLAIMED' || data.status === 'SETTLED') {
        showReceipt(data);
        const headEl = receiptView?.querySelector('.state-title');
        if (headEl && data.status === 'SETTLED') {
          headEl.textContent = 'Payment Settled';
        }
        return;
      }

      // Banking Coordinates
      if (bankHolderEl) bankHolderEl.textContent = data.banking?.account_holder || 'MD FAIZAL';
      if (bankBranchEl) bankBranchEl.textContent = data.banking?.bank_branch || 'HDFC Bank - Cuttack';
      if (bankAccNoEl) bankAccNoEl.textContent = data.banking?.account_number || '50100673684509';
      if (bankIfscEl) bankIfscEl.textContent = data.banking?.ifsc || 'HDFC0000236';
      if (bankUpiEl) bankUpiEl.textContent = data.banking?.upi_id || '7749089400@hdfc';

      // Multi-Tranche Rendering (> ₹1 Lakh)
      if (trancheSection && tranchePills) {
        if (data.is_split && Array.isArray(data.tranches) && data.tranches.length > 1) {
          trancheSection.style.display = 'block';
          tranchePills.innerHTML = data.tranches.map((t, idx) => `
          <button type="button" class="tranche-pill ${idx === 0 ? 'active' : ''}" data-tranche-idx="${idx}">
            <span>0${t.part}</span>
            <span style="opacity:0.4;">/</span>
            <span>${formatINR(t.amount)}</span>
          </button>
        `).join('');

          tranchePills.querySelectorAll('.tranche-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.getAttribute('data-tranche-idx'), 10);
              selectTranche(idx);
            });
          });
        } else {
          trancheSection.style.display = 'none';
        }
      }

      // Initialize first tranche and UTR fields
      selectTranche(0);
      updateUtrFields();

      if (loadingView) loadingView.style.display = 'none';
      if (activeView) activeView.style.display = 'grid';
    }

    // Show Error
    function showError(title, msg) {
      if (loadingView) loadingView.style.display = 'none';
      if (activeView) activeView.style.display = 'none';
      if (receiptView) receiptView.style.display = 'none';
      if (errorTitle) errorTitle.textContent = title;
      if (errorMsg) errorMsg.textContent = msg;
      if (errorView) errorView.style.display = 'block';
    }

    // Fetch Gateway Data
    async function fetchGatewayData() {
      if (!code) {
        showError('Payment Link Not Specified', 'No payment link reference was identified in the URL. Please use /p/{code} or ?code={code}.');
        return;
      }

      try {
        const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          showError('Order Not Found', errJson.error || 'This payment link has reached its threshold or does not exist.');
          return;
        }

        const data = await res.json();
        if (data.is_expired) {
          showError('Order Expired', 'This payment order has reached its expiration threshold.');
          return;
        }

        populateGateway(data);
      } catch (_) {
        showError('Connection Error', 'Unable to communicate with the payment server. Please check your network and reload.');
      }
    }

    // Remittance Form Submission
    if (remittanceForm) {
      remittanceForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        let finalUtr = '';
        const trancheInputs = document.querySelectorAll('.tranche-utr-input');

        if (currentMode === 'qr' && trancheInputs.length > 0) {
          // Multi-tranche submission
          const utrParts = [];
          let hasEmpty = false;

          trancheInputs.forEach(input => {
            const val = input.value.trim();
            const part = input.getAttribute('data-part');
            if (!val) {
              hasEmpty = true;
              input.focus();
            }
            utrParts.push(`Tranche 0${part}: ${val}`);
          });

          if (hasEmpty) {
            showToast('Please enter UTR for each tranche');
            return;
          }

          finalUtr = utrParts.join(' | ');
        } else {
          // Single UTR submission (single QR or Bank Transfer)
          const singleUtrEl = document.getElementById('utrInput');
          finalUtr = singleUtrEl ? singleUtrEl.value.trim() : '';
          if (!finalUtr) {
            showToast('Please enter the transaction reference (UTR)');
            if (singleUtrEl) singleUtrEl.focus();
            return;
          }
        }

        const amount = amountInput ? Number(amountInput.value) : Number(gatewayData.amount);
        const payerName = payerNameInput ? payerNameInput.value.trim() : '';
        const notes = notesInput ? notesInput.value.trim() : '';

        if (isNaN(amount) || amount <= 0) {
          showToast('Please enter a valid transferred amount');
          if (amountInput) amountInput.focus();
          return;
        }

        if (submitRemittanceBtn) {
          submitRemittanceBtn.disabled = true;
          submitRemittanceBtn.textContent = 'Submitting...';
        }

        try {
          const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              utr: finalUtr,
              amount,
              payerName,
              notes
            })
          });

          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.error || 'Submission failed');
          }

          showToast('Reference submitted');
          showReceipt({
            customer_name: gatewayData?.customer_name,
            claimed_amount: amount,
            claimed_utr: finalUtr,
            link_code: code,
            invoice_label: gatewayData?.invoice_label,
            claimed_at: new Date().toISOString()
          });

        } catch (err) {
          showToast(err.message || 'Submission failed');
          if (submitRemittanceBtn) {
            submitRemittanceBtn.disabled = false;
            submitRemittanceBtn.textContent = 'Submit Reference';
          }
        }
      });
    }

    // Initialize
    fetchGatewayData();
  }) ();
