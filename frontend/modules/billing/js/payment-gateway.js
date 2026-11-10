/**
 * payment-gateway.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone client controller for Customer-Facing Payment Gateway
 * Handles payload hydration, dynamic QR display, 1-click clipboard actions,
 * interactive tab transitions, and remittance notice dispatch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ─── Extract Link Code ──────────────────────────────────────────────────────
  function extractLinkCode() {
    const path = window.location.pathname;
    const pMatch = path.match(/^\/(?:p|pay)\/([a-zA-Z0-9_-]+)/);
    if (pMatch && pMatch[1]) return pMatch[1];

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code') || urlParams.get('c') || '';
  }

  const code = extractLinkCode();
  let gatewayData = null;

  // DOM Elements
  const loadingView = document.getElementById('loadingView');
  const errorView = document.getElementById('errorView');
  const activeView = document.getElementById('activeView');
  const receiptView = document.getElementById('receiptView');

  const errorTitle = document.getElementById('errorTitle');
  const errorMsg = document.getElementById('errorMsg');

  const companyNameEl = document.getElementById('companyName');
  const linkRefTokenEl = document.getElementById('linkRefToken');
  const statusBadgeEl = document.getElementById('statusBadge');
  const statusTextEl = document.getElementById('statusText');
  const payableAmountEl = document.getElementById('payableAmount');
  const customerNameEl = document.getElementById('customerName');
  const paymentMemoEl = document.getElementById('paymentMemo');

  const qrImageEl = document.getElementById('qrImage');
  const launchUpiBtn = document.getElementById('launchUpiBtn');

  const bankHolderEl = document.getElementById('bankHolder');
  const bankBranchEl = document.getElementById('bankBranch');
  const bankAccNoEl = document.getElementById('bankAccNo');
  const bankIfscEl = document.getElementById('bankIfsc');
  const bankUpiEl = document.getElementById('bankUpi');

  const tabBtnQr = document.getElementById('tabBtnQr');
  const tabBtnBank = document.getElementById('tabBtnBank');
  const tabPanelQr = document.getElementById('tabPanelQr');
  const tabPanelBank = document.getElementById('tabPanelBank');

  const drawerTrigger = document.getElementById('drawerTrigger');
  const drawerContent = document.getElementById('drawerContent');
  const remittanceForm = document.getElementById('remittanceForm');
  const utrInput = document.getElementById('utrInput');
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

  // Toast helper
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2000);
  }

  // Copy helper
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
    } catch (e) {
      showToast('Copy failed');
      return false;
    }
  }

  // Switch tabs
  function setTab(tabName) {
    if (tabName === 'qr') {
      tabBtnQr.classList.add('active');
      tabBtnBank.classList.remove('active');
      tabBtnQr.setAttribute('aria-selected', 'true');
      tabBtnBank.setAttribute('aria-selected', 'false');
      tabPanelQr.classList.add('active');
      tabPanelBank.classList.remove('active');
    } else {
      tabBtnBank.classList.add('active');
      tabBtnQr.classList.remove('active');
      tabBtnBank.setAttribute('aria-selected', 'true');
      tabBtnQr.setAttribute('aria-selected', 'false');
      tabPanelBank.classList.add('active');
      tabPanelQr.classList.remove('active');
    }
  }

  tabBtnQr.addEventListener('click', () => setTab('qr'));
  tabBtnBank.addEventListener('click', () => setTab('bank'));

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetId = btn.getAttribute('data-copy-target');
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const val = targetEl.textContent.trim().replace(/\s*•\s*/, ' - ');
      const label = targetEl.previousElementSibling ? targetEl.previousElementSibling.textContent : 'value';

      btn.classList.add('copied');
      btn.textContent = 'Copied ✓';
      await copyText(val, label);
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = 'Copy';
      }, 1500);
    });
  });

  // Drawer Toggle
  drawerTrigger.addEventListener('click', () => {
    const isOpen = drawerContent.classList.contains('open');
    if (isOpen) {
      drawerContent.classList.remove('open');
      drawerTrigger.classList.remove('open');
      drawerTrigger.setAttribute('aria-expanded', 'false');
    } else {
      drawerContent.classList.add('open');
      drawerTrigger.classList.add('open');
      drawerTrigger.setAttribute('aria-expanded', 'true');
      utrInput.focus();
    }
  });

  // Print Receipt
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Render Receipt View
  function showReceipt(info) {
    activeView.style.display = 'none';
    receiptView.style.display = 'block';

    document.getElementById('receiptCustomer').textContent = info.customer_name || gatewayData.customer_name;
    document.getElementById('receiptAmount').textContent = formatINR(info.claimed_amount || gatewayData.amount);
    document.getElementById('receiptUtr').textContent = info.claimed_utr || 'Pending';
    document.getElementById('receiptRef').textContent = 'PAY-' + (info.link_code || code);

    const d = info.claimed_at ? new Date(info.claimed_at) : new Date();
    document.getElementById('receiptTime').textContent = d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    }) + ' IST';
  }

  // Populate Active Data
  function populateGateway(data) {
    gatewayData = data;

    // Header
    companyNameEl.textContent = data.company?.name || 'UTKAL CHEMICAL AUSHADHALAYA';
    linkRefTokenEl.textContent = `REF: PAY-${data.code}`;
    payableAmountEl.textContent = formatINR(data.amount);
    customerNameEl.textContent = data.customer_name || 'Customer';
    paymentMemoEl.textContent = data.description || 'Settlement of Outstanding Statement Balance';

    // Status
    if (data.status === 'CLAIMED') {
      showReceipt(data);
      return;
    }

    if (data.status === 'SETTLED') {
      showReceipt(data);
      document.querySelector('.receipt-title').textContent = 'Payment Settled & Cleared';
      document.querySelector('.receipt-sub').textContent = 'This electronic order has been officially verified and settled into the company ledger.';
      document.getElementById('receiptDetails').style.borderColor = '#10b981';
      return;
    }

    // Dynamic QR Image
    if (data.qr_data_url) {
      qrImageEl.src = data.qr_data_url;
    } else {
      // Fallback to Google chart QR if needed
      qrImageEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.upi_uri)}`;
    }

    // Launch UPI App Deep Link
    launchUpiBtn.href = data.upi_uri;

    // Bank Details
    bankHolderEl.textContent = data.banking?.account_holder || 'MD  FAIZAL';
    bankBranchEl.textContent = (data.banking?.bank_branch || 'CUTTACK - ODISHA');
    bankAccNoEl.textContent = data.banking?.account_number || '50100673684509';
    bankIfscEl.textContent = data.banking?.ifsc || 'HDFC0000236';
    bankUpiEl.textContent = data.banking?.upi_id || '7749089400@hdfc';

    // Pre-populate amount in remittance form
    amountInput.value = Number(data.amount).toFixed(2);

    loadingView.style.display = 'none';
    activeView.style.display = 'block';
  }

  // Show Error State
  function showError(title, msg) {
    loadingView.style.display = 'none';
    activeView.style.display = 'none';
    receiptView.style.display = 'none';
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    errorView.style.display = 'block';
  }

  // Load Gateway Data
  async function fetchGatewayData() {
    if (!code) {
      showError('Invalid Link', 'No payment link code was found in the URL. Please verify your link.');
      return;
    }

    try {
      const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        showError('Order Not Found', errJson.error || 'This payment link has expired or does not exist.');
        return;
      }

      const data = await res.json();
      if (data.is_expired) {
        showError('Link Expired', 'This electronic payment order has reached its expiry threshold. Please request an updated link.');
        return;
      }

      populateGateway(data);
    } catch (err) {
      showError('Network Error', 'Unable to reach the settlement gateway. Please verify your connection and reload.');
    }
  }

  // Handle Remittance Form Submission
  remittanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const utr = utrInput.value.trim();
    const amount = Number(amountInput.value);
    const payerName = payerNameInput.value.trim();
    const notes = notesInput.value.trim();

    if (!utr) {
      showToast('Please enter the transaction UTR number');
      utrInput.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid transfer amount');
      amountInput.focus();
      return;
    }

    submitRemittanceBtn.disabled = true;
    submitRemittanceBtn.innerHTML = '<span>Transmitting Settlement Notice...</span>';

    try {
      const res = await fetch(`/api/billing/public/pay/${encodeURIComponent(code)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utr,
          amount,
          payerName,
          notes
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit remittance claim.');
      }

      showToast('Remittance notice recorded ✓');
      showReceipt({
        customer_name: gatewayData.customer_name,
        claimed_amount: amount,
        claimed_utr: utr,
        link_code: code,
        claimed_at: new Date().toISOString()
      });

    } catch (err) {
      showToast(err.message || 'Submission failed');
      submitRemittanceBtn.disabled = false;
      submitRemittanceBtn.innerHTML = '<span>Confirm & Dispatch Receipt Request</span>';
    }
  });

  // Initialize
  fetchGatewayData();
})();
