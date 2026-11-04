// @ts-nocheck
let rawData = null;
let currentTab = 'bills';

// ==========================================================================
// Customer Telemetry & Read Receipt Tracking
// ==========================================================================
let activeDwellSeconds = 0;
let maxScrollDepth = 0;

function sendTelemetryBeacon(eventType, metadata = null) {
  try {
    const pathMatch = window.location.pathname.match(/\/(?:ledger|l)\/([a-zA-Z0-9_-]+)/i);
    const token = rawData?.customer?.ledger_token || rawData?.customer?.token || (pathMatch && pathMatch[1]) || new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('src') || urlParams.get('source') || undefined;
    const ref_number = urlParams.get('ref') || urlParams.get('ref_number') || undefined;

    const payload = JSON.stringify({
      token,
      event_type: eventType,
      dwell_seconds: activeDwellSeconds,
      scroll_depth: maxScrollDepth,
      metadata,
      source,
      ref_number
    });

    const csrfToken = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1] || '';
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/billing/public/track-event', blob);
    } else {
      fetch('/api/billing/public/track-event', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : {})
        },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  } catch (_) {}
}

setInterval(() => {
  if (document.visibilityState === 'visible') {
    activeDwellSeconds++;
  }
}, 1000);

window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const b = document.body;
  const st = 'scrollTop';
  const sh = 'scrollHeight';
  const total = (h[sh] || b[sh]) - h.clientHeight;
  if (total > 0) {
    const percent = Math.round(((h[st] || b[st]) / total) * 100);
    if (!isNaN(percent) && percent > maxScrollDepth) {
      maxScrollDepth = Math.min(100, percent);
    }
  }
}, { passive: true });

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    sendTelemetryBeacon('HEARTBEAT', { reason: 'hidden' });
  }
});
window.addEventListener('pagehide', () => {
  sendTelemetryBeacon('HEARTBEAT', { reason: 'pagehide' });
});


document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const urlParams = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/\/(?:ledger|l)\/([a-zA-Z0-9_-]+)/i);
  const identifier = (pathMatch && pathMatch[1]) || urlParams.get('token') || urlParams.get('t') || urlParams.get('id');

  if (!identifier) {
    showError("INVALID LINK. MISSING CUSTOMER IDENTIFIER.");
    return;
  }

  fetchLedgerData(identifier);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      e.target.classList.add('active');
      currentTab = e.target.dataset.tab;
      document.getElementById(`${currentTab}Tab`).classList.add('active');
      
      // Update lists
      renderLists();
    });
  });

  // Time Filter
  const timeFilter = document.getElementById('timeFilter');
  const customMonthPicker = document.getElementById('customMonthPicker');
  const customYearPicker = document.getElementById('customYearPicker');
  
  timeFilter.addEventListener('change', (e) => {
    customMonthPicker.style.display = 'none';
    customYearPicker.style.display = 'none';
    
    if (e.target.value === 'custom') {
      customMonthPicker.style.display = 'inline-block';
    } else if (e.target.value === 'customYear') {
      customYearPicker.style.display = 'inline-block';
      if (!customYearPicker.value) {
        customYearPicker.value = new Date().getFullYear();
      }
    }
    updateDashboard();
  });

  customMonthPicker.addEventListener('change', () => updateDashboard());
  customYearPicker.addEventListener('input', () => updateDashboard());

  // Search & Sort
  document.getElementById('searchInput').addEventListener('input', () => {
    renderLists();
  });

  document.getElementById('sortSelect').addEventListener('change', () => {
    renderLists();
  });
});

function initTheme() {
  const themeSelect = document.getElementById('themeSelect');
  
  let theme = localStorage.getItem('theme');
  if (!theme) {
    theme = 'system';
  }
  
  themeSelect.value = theme;
  applyTheme(theme);

  themeSelect.addEventListener('change', (e) => {
    const selected = e.target.value;
    localStorage.setItem('theme', selected);
    applyTheme(selected);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeSelect.value === 'system') {
      applyTheme('system');
    }
  });
}

function applyTheme(theme) {
  let actualTheme = theme;
  if (theme === 'system') {
    actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', actualTheme);
}

function formatCurrency(amount) {
  const num = parseFloat(amount || 0);
  const [intPart, decPart] = num.toFixed(2).split('.');
  
  let formatted = '';
  let count = 0;
  
  for (let i = intPart.length - 1; i >= 0; i--) {
    if (count === 3 || (count > 3 && (count - 3) % 2 === 0)) {
      formatted = ',' + formatted;
    }
    formatted = intPart[i] + formatted;
    count++;
  }
  
  if (num < 0) {
    return '-₹' + formatted.substring(1) + '.' + decPart;
  }
  return '₹' + formatted + '.' + decPart;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-IN', options).toUpperCase();
}

function showError(msg) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'none';
  const dashboard = document.getElementById('dashboard');
  if (dashboard) dashboard.style.display = 'none';
  const errorState = document.getElementById('errorState');
  if (errorState) errorState.style.display = 'block';
  const errorMsg = document.getElementById('errorMsg');
  if (errorMsg) errorMsg.textContent = msg || "We couldn't find the requested ledger.";
}

async function fetchLedgerData(customerId) {
  try {
    if (typeof window !== 'undefined' && window.SuiteCoreBridge && typeof window.SuiteCoreBridge.ensureReady === 'function') {
      try {
        await window.SuiteCoreBridge.ensureReady();
      } catch (wasmErr) {
        console.warn('[CustomerLedger] WebAssembly core pre-fetch warning:', wasmErr);
      }
    }

    const response = await fetch(`/api/billing/public/ledger/${encodeURIComponent(customerId)}`);
    if (!response.ok) {
      let errText = `Ledger unavailable (status: ${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson && (errJson.error || errJson.message)) {
          errText = typeof errJson.error === 'string' ? errJson.error : (errJson.message || errText);
        }
      } catch (_) {}
      throw new Error(errText);
    }

    const result = await response.json();
    if (!result || !result.success || !result.data) {
      throw new Error(result?.error || 'Failed to fetch ledger data');
    }

    rawData = result.data;
    
    // Polish URL in browser bar to clean unguessable short path
    const ledgerToken = rawData.customer?.ledger_token || rawData.customer?.token;
    if (ledgerToken && window.history && window.history.replaceState) {
      const canonicalPath = `/ledger/${ledgerToken}`;
      if (window.location.pathname !== canonicalPath && !window.location.pathname.endsWith('customer-ledger.html')) {
        window.history.replaceState(null, '', canonicalPath);
      }
    }
    
    document.getElementById('customerName').textContent = rawData.customer.name;
    document.getElementById('printCustomerName').textContent = rawData.customer.name;
    document.getElementById('printDate').textContent = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
    const currentDueEl = document.getElementById('currentDue');
    currentDueEl.textContent = formatCurrency(Math.abs(rawData.customer.current_due));
    if (rawData.customer.current_due < 0) currentDueEl.textContent += ' (CR)';
    document.getElementById('openingBalance').textContent = formatCurrency(rawData.customer.opening_balance);
    
    const statusBadge = document.getElementById('statusBadge');
    if (rawData.customer.current_due > 0) {
      statusBadge.textContent = '◆ PENDING';
      statusBadge.className = 'status-badge status-pending';
    } else {
      statusBadge.textContent = '◆ SETTLED';
      statusBadge.className = 'status-badge status-settled';
    }

    updateDashboard();

    // Calculate Progress and Ageing breakdown
    updateProgressAndAgeing();

    // Render Bank & UPI Payment section
    if (rawData.bank) {
      document.getElementById('bankHolder').textContent = rawData.bank.account_holder || 'N/A';
      document.getElementById('bankNumber').textContent = rawData.bank.account_number || 'N/A';
      document.getElementById('bankIfsc').textContent = rawData.bank.ifsc || 'N/A';
      document.getElementById('bankType').textContent = rawData.bank.account_type || 'Savings Account';
      document.getElementById('bankBranch').textContent = rawData.bank.branch || 'N/A';

      const mmidContainer = document.getElementById('bankMmidContainer');
      const mmidEl = document.getElementById('bankMmid');
      const showMmid = String(rawData.bank.show_mmid ?? 'true').toLowerCase() === 'true';
      if (mmidContainer && mmidEl) {
        if (showMmid && rawData.bank.mmid) {
          mmidEl.textContent = rawData.bank.mmid;
          mmidContainer.style.display = 'block';
        } else {
          mmidContainer.style.display = 'none';
        }
      }
    }
    
    // Bind Payment Section Event Handlers
    initPaymentHandlers();
    initAdditionalHandlers();
    
    // Generate initial default QR code
    renderPaymentSection(rawData.customer.current_due);
    
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    const dash = document.getElementById('dashboard');
    if (dash) dash.style.display = 'block';
  } catch (error) {
    console.error('[CustomerLedger] Load error:', error);
    showError(error.message);
  }
}

function calculateSettlementMap(bills, payments, openingBalance = 0) {
  const settlementMap = {};
  const paymentAllocMap = {};
  if (!bills || bills.length === 0) return { settlementMap, paymentAllocMap };

  // Server/Client Authoritative SuiteCore WebAssembly Calculation (100% Rust)
  if (typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded() && typeof window.SuiteCoreBridge.calculateStatement === 'function') {
    const rustBills = bills.map(b => ({
      id: String(b.id),
      customer_id: String(b.customer_id || ''),
      invoice_no: b.invoice_no || '',
      date: b.invoice_date || b.created_at || '',
      due_date: b.due_date || null,
      grand_total: parseFloat(b.amount !== undefined ? b.amount : (b.grand_total || 0))
    }));

    const rustPayments = (payments || []).map(p => ({
      id: String(p.id),
      customer_id: String(p.customer_id || ''),
      reference_no: p.reference_number || 'PMT',
      date: p.payment_date || p.created_at || '',
      amount: parseFloat(p.amount !== undefined ? p.amount : (p.credit_amount || 0)),
      is_credit_note: p.type === 'CREDIT_NOTE' || Boolean(p.is_credit_note),
      payment_medium: p.payment_medium || null
    }));

    const nowDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const stmt = window.SuiteCoreBridge.calculateStatement(parseFloat(openingBalance || 0), rustBills, rustPayments, nowDays);
    if (stmt && stmt.fifo_result) {
      return {
        settlementMap: stmt.fifo_result.bill_settlements,
        paymentAllocMap: stmt.fifo_result.payment_allocations
      };
    }
    throw new Error('[CustomerLedger] SuiteCore WebAssembly calculateStatement returned invalid result');
  }

  throw new Error('[CustomerLedger] SuiteCore WebAssembly engine is required for ledger calculation.');
}

function getFilteredData() {
  const filter = document.getElementById('timeFilter').value;
  const customVal = document.getElementById('customMonthPicker').value; // "YYYY-MM"
  const customYearVal = document.getElementById('customYearPicker').value;
  
  const now = new Date();
  
  let startDate = null;
  let endDate = null;

  if (filter === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (filter === 'quarter') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    startDate = new Date(now.getFullYear(), quarterMonth, 1);
    endDate = new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59);
  } else if (filter === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  } else if (filter === 'custom' && customVal) {
    const [y, m] = customVal.split('-');
    startDate = new Date(y, parseInt(m) - 1, 1);
    endDate = new Date(y, parseInt(m), 0, 23, 59, 59);
  } else if (filter === 'customYear' && customYearVal) {
    const y = parseInt(customYearVal);
    startDate = new Date(y, 0, 1);
    endDate = new Date(y, 11, 31, 23, 59, 59);
  }

  let bills = [...rawData.bills];
  let payments = [...rawData.payments];

  if (startDate && endDate) {
    bills = bills.filter(b => {
      const d = new Date(b.invoice_date || b.created_at);
      return d >= startDate && d <= endDate;
    });
    payments = payments.filter(p => {
      const d = new Date(p.payment_date || p.created_at);
      return d >= startDate && d <= endDate;
    });
  }

  return { bills, payments };
}

function updateDashboard() {
  if (!rawData) return;

  // Pre-calculate settlement maps globally
  const maps = calculateSettlementMap(rawData.bills, rawData.payments, rawData.customer.opening_balance);
  window.settlementMap = maps.settlementMap;
  window.paymentAllocMap = maps.paymentAllocMap;

  // Populate print statement table
  populatePrintStatementTable();

  const { bills, payments } = getFilteredData();

  // Calculate metrics for current filtered data
  let totalSales = 0;
  bills.forEach(b => totalSales += b.amount);

  let totalPaymentsAmount = 0;
  let paymentCount = 0;
  payments.forEach(p => {
    if (p.type === 'PAYMENT') {
       totalPaymentsAmount += p.amount;
       paymentCount++;
    }
  });

  const avgBill = bills.length > 0 ? (totalSales / bills.length) : 0;
  const avgPayment = paymentCount > 0 ? (totalPaymentsAmount / paymentCount) : 0;

  let settlementDays = 0;
  let settledBillsCount = 0;
  let totalSettlementDays = 0;

  bills.forEach(b => {
    const info = window.settlementMap[b.id];
    if (info && info.settled) {
       totalSettlementDays += info.days;
       settledBillsCount++;
    }
  });

  if (settledBillsCount > 0) {
    settlementDays = Math.round(totalSettlementDays / settledBillsCount);
  }

  document.getElementById('totalSales').textContent = formatCurrency(totalSales);
  document.getElementById('avgBill').textContent = formatCurrency(avgBill);
  document.getElementById('avgPayment').textContent = formatCurrency(avgPayment);
  document.getElementById('settlementDays').textContent = settlementDays + ' DAYS';
  
  document.getElementById('totalBillsCount').textContent = bills.length;
  document.getElementById('totalPaymentsCount').textContent = payments.length;

  let lastBillDays = 'N/A';
  if (bills.length > 0) {
    const sortedBills = [...bills].sort((a,b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at));
    const mostRecentBillDate = new Date(sortedBills[0].invoice_date || sortedBills[0].created_at);
    const diffTime = Math.abs(new Date() - mostRecentBillDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    lastBillDays = diffDays === 0 ? 'TODAY' : `${diffDays} DAYS AGO`;
  }

  let lastPmtDays = 'N/A';
  if (payments.length > 0) {
    const sortedPmts = [...payments].sort((a,b) => new Date(b.payment_date || b.created_at) - new Date(a.payment_date || a.created_at));
    const mostRecentPmtDate = new Date(sortedPmts[0].payment_date || sortedPmts[0].created_at);
    const diffTime = Math.abs(new Date() - mostRecentPmtDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    lastPmtDays = diffDays === 0 ? 'TODAY' : `${diffDays} DAYS AGO`;
  }

  document.getElementById('lastBillDays').textContent = lastBillDays;
  document.getElementById('lastPmtDays').textContent = lastPmtDays;

  // Pattern Engine, Period Sales, Symmetrical Cadence & Buying Power
  if (window.CustomerPatternEngine) {
    const periodSales = window.CustomerPatternEngine.calculatePeriodSales(rawData.bills);
    const mEl = document.getElementById('salesThisMonth');
    const qEl = document.getElementById('salesThisQuarter');
    const yEl = document.getElementById('salesThisYear');
    if (mEl) mEl.textContent = `${formatCurrency(periodSales.month.total)} (${periodSales.month.count})`;
    if (qEl) qEl.textContent = `${formatCurrency(periodSales.quarter.total)} (${periodSales.quarter.count})`;
    if (yEl) yEl.textContent = `${formatCurrency(periodSales.year.total)} (${periodSales.year.count})`;

    // Symmetrical Cadence & Interval
    const cadence = window.CustomerPatternEngine.calculateBillCadence(rawData.bills);
    const cadenceEl = document.getElementById('billCadence');
    if (cadenceEl) {
      cadenceEl.textContent = cadence.label;
      cadenceEl.title = `Average order interval: ${cadence.avgIntervalDays} days (~${cadence.monthlyFrequency}x/month)`;
    }

    // Industrial Credit Limit & Buying Power
    const credit = window.CustomerPatternEngine.calculateCreditLimitAndBuyingPower({
      manualCreditLimit: rawData.customer?.credit_limit,
      avgBill,
      currentDue: rawData.customer?.current_due,
      settlementDays,
      avgIntervalDays: cadence.avgIntervalDays
    });

    const buyPowerEl = document.getElementById('availableBuyingPower');
    const buyPowerBar = document.getElementById('buyingPowerBar');
    const buyPowerLimit = document.getElementById('buyingPowerLimitLabel');
    const healthBadge = document.getElementById('creditHealthBadge');

    if (buyPowerEl) buyPowerEl.textContent = formatCurrency(credit.available);
    if (buyPowerBar) {
      buyPowerBar.style.width = `${credit.availablePercent}%`;
      buyPowerBar.style.background = credit.isExceeded ? '#ef4444' : (credit.utilizationPercent > 70 ? '#f59e0b' : '#10b981');
    }
    if (buyPowerLimit) buyPowerLimit.textContent = `LINE: ${formatCurrency(credit.approvedCreditLimit)}`;
    if (healthBadge) {
      if (credit.isExceeded) {
        healthBadge.textContent = 'LINE EXCEEDED';
        healthBadge.style.background = '#fef2f2';
        healthBadge.style.color = '#b91c1c';
        healthBadge.style.borderColor = '#ef4444';
      } else if (credit.utilizationPercent > 70) {
        healthBadge.textContent = 'NEARING LIMIT';
        healthBadge.style.background = '#fffbeb';
        healthBadge.style.color = '#b45309';
        healthBadge.style.borderColor = '#f59e0b';
      } else {
        healthBadge.textContent = 'HEALTHY';
        healthBadge.style.background = '#ecfdf5';
        healthBadge.style.color = '#065f46';
        healthBadge.style.borderColor = '#10b981';
      }
    }

    // Cleaned UI: No AI slop or promotional banner clutter
    const vipBadge = document.getElementById('vipTierBadge');
    if (vipBadge) vipBadge.style.display = 'none';
    const restockContainer = document.getElementById('smartRestockAlertContainer');
    if (restockContainer) restockContainer.style.display = 'none';
    const promoContainer = document.getElementById('dynamicPromoBannerContainer');
    if (promoContainer) promoContainer.style.display = 'none';
  }

  renderLists();
}

function renderLists() {
  const { bills, payments } = getFilteredData();
  const search = document.getElementById('searchInput').value.toLowerCase();
  const sort = document.getElementById('sortSelect').value;

  // 1. Search & Filter
  const filteredBills = bills.filter(b => {
    if (!search) return true;
    const str = `${b.invoice_no} ${b.amount} ${formatDate(b.invoice_date || b.created_at)}`.toLowerCase();
    return str.includes(search);
  });

  const filteredPayments = payments.filter(p => {
    if (!search) return true;
    const str = `${p.reference_number || ''} ${p.amount} ${p.credit_amount || ''} ${formatDate(p.payment_date || p.created_at)}`.toLowerCase();
    return str.includes(search);
  });

  // 2. Sort
  const sortFn = (a, b) => {
    let valA, valB;
    if (sort.startsWith('date')) {
      valA = new Date(a.invoice_date || a.payment_date || a.created_at).getTime();
      valB = new Date(b.invoice_date || b.payment_date || b.created_at).getTime();
    } else {
      valA = a.amount || a.credit_amount || 0;
      valB = b.amount || b.credit_amount || 0;
    }
    
    if (sort.endsWith('asc')) return valA - valB;
    return valB - valA;
  };

  filteredBills.sort(sortFn);
  filteredPayments.sort(sortFn);

  // 3. Filter & Sort Orders
  const orders = rawData?.orders || [];
  const filteredOrders = orders.filter(o => {
    if (!search) return true;
    const str = `${o.order_number || ''} ${o.bill_reference || ''} ${o.total_amount || ''} ${o.current_stage || ''} ${o.status || ''}`.toLowerCase();
    return str.includes(search);
  });

  filteredOrders.sort((a, b) => {
    if (sort.startsWith('date')) {
      const valA = new Date(a.order_date || a.created_at).getTime();
      const valB = new Date(b.order_date || b.created_at).getTime();
      return sort.endsWith('asc') ? valA - valB : valB - valA;
    } else {
      const valA = Number(a.total_amount) || 0;
      const valB = Number(b.total_amount) || 0;
      return sort.endsWith('asc') ? valA - valB : valB - valA;
    }
  });

  // 4. Render Groups
  renderGroupedList(document.getElementById('billsList'), filteredBills, 'bill');
  renderGroupedList(document.getElementById('paymentsList'), filteredPayments, 'payment');
  renderOrdersList(document.getElementById('ordersList'), filteredOrders);
}

function renderGroupedList(container, items, type) {
  if (items.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem; font-weight: bold; border: 2px dashed var(--border-color);">━━ NO RECORDS FOUND ━━</div>`;
    return;
  }

  const groups = {};
  items.forEach(item => {
    const d = new Date(item.invoice_date || item.payment_date || item.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }).toUpperCase();
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(item);
  });

  const sortedKeys = Object.keys(groups).sort((a,b) => b.localeCompare(a));

  let html = '';
  sortedKeys.forEach(key => {
    html += `<div class="month-group-header">█ ${groups[key].label}</div>`;
    
    groups[key].items.forEach(item => {
      if (type === 'bill') {
        const settlementInfo = window.settlementMap[item.id] || { settled: false, days: 1 };
        const days = settlementInfo.days;
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

        const badgeHtml = `
          <div class="settlement-badge" style="font-size: 8px; font-weight: 900; color: #ffffff; background: ${badgeColor}; padding: 3px 6px; border-radius: 2px; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.6px; margin-left: 0.5rem; vertical-align: middle; display: inline-block; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
            ${label}
          </div>`;

        const paid = settlementInfo.paid || 0;
        const total = settlementInfo.total || item.amount || 0;
        const percentage = Math.min(100, Math.round((paid / total) * 100));
        
        const cardProgressHtml = `
          <div class="card-progress-container" style="margin-top: 8px; width: 100%; max-width: 320px;">
            <div style="display: flex; justify-content: space-between; font-size: 8px; font-weight: 900; margin-bottom: 2px; color: var(--text-secondary); letter-spacing: 0.5px;">
              <span>PAID</span>
              <span>${percentage}% (${formatCurrency(paid)})</span>
            </div>
            <div style="width: 100%; height: 8px; border: 1px solid var(--border-color); background: var(--btn-hover); overflow: hidden; display: flex; box-shadow: 0.5px 0.5px 0px var(--shadow-color);">
              <div style="width: ${percentage}%; height: 100%; background: var(--negative-color); transition: width 0.3s ease;"></div>
            </div>
          </div>
        `;

        html += `
          <div class="record-card">
            <div class="record-info">
              <div class="record-title" style="display: flex; align-items: center;">📄 BILL #${item.invoice_no} ${badgeHtml}</div>
              <div class="record-date" style="margin-bottom: 4px;">█ ${formatDate(item.invoice_date || item.created_at)}</div>
              ${cardProgressHtml}
              <button class="download-btn" onclick="downloadInvoice(${item.id}, '${item.invoice_no}')" style="margin-top: 8px;">█ DOWNLOAD PDF</button>
            </div>
            <div class="record-amount amount-positive">${formatCurrency(item.amount)}</div>
          </div>
        `;
      } else {
        const isCredit = item.type === 'CREDIT_NOTE';
        const amount = isCredit ? item.credit_amount : item.amount;
        const icon = isCredit ? '📝' : '💳';
        const title = isCredit ? 'CREDIT NOTE' : 'PAYMENT';
        
        const allocInfo = window.paymentAllocMap[item.id] || { allocated: 0, total: amount };
        const allocated = allocInfo.allocated || 0;
        const total = allocInfo.total || amount || 0;
        const percentage = Math.min(100, Math.round((allocated / total) * 100));

        const cardProgressHtml = `
          <div class="card-progress-container" style="margin-top: 8px; width: 100%; max-width: 320px;">
            <div style="display: flex; justify-content: space-between; font-size: 8px; font-weight: 900; margin-bottom: 2px; color: var(--text-secondary); letter-spacing: 0.5px;">
              <span>ALLOCATED</span>
              <span>${percentage}% (${formatCurrency(allocated)})</span>
            </div>
            <div style="width: 100%; height: 8px; border: 1px solid var(--border-color); background: var(--btn-hover); overflow: hidden; display: flex; box-shadow: 0.5px 0.5px 0px var(--shadow-color);">
              <div style="width: ${percentage}%; height: 100%; background: var(--negative-color); transition: width 0.3s ease;"></div>
            </div>
          </div>
        `;

        html += `
          <div class="record-card">
            <div class="record-info">
              <div class="record-title">${icon} ${title} ${item.reference_number ? `(${item.reference_number})` : ''}</div>
              <div class="record-date">█ ${formatDate(item.payment_date || item.created_at)}</div>
              ${cardProgressHtml}
            </div>
            <div class="record-amount amount-negative">+${formatCurrency(amount)}</div>
          </div>
        `;
      }
    });
  });

  container.innerHTML = html;
}

async function downloadInvoice(id, invoiceNo) {
  try {
    const response = await fetch('/api/billing/public/export-invoice-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: id })
    });
    
    if (!response.ok) {
      throw new Error('FAILED TO GENERATE PDF');
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    
    const binaryStr = window.atob(data.pdf);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.fileName || `Invoice_${invoiceNo}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    alert('COULD NOT DOWNLOAD INVOICE: ' + error.message);
  }
}

// Global variable to store active UPI Link
let currentUpiLink = "";

// ==========================================================================
// UPI QR Code Dynamic Generator & Payment Handlers
// ==========================================================================
function renderPaymentSection(amount) {
  if (!rawData || !rawData.bank) return;
  
  const upiId = rawData.bank.upi_id;
  const customerName = rawData.customer.name;
  const amountLabelEl = document.getElementById('qrAmountLabel');
  const qrImageEl = document.getElementById('paymentQrCode');
  const qrPlaceholderEl = document.getElementById('qrPlaceholder');
  const upiAppBtn = document.getElementById('payViaUpiAppBtn');

  const totalDue = parseFloat(rawData.customer.current_due || 0);
  let parsedAmount = parseFloat(amount);
  
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    amountLabelEl.textContent = "Balance Settled / No Due";
    qrImageEl.style.display = 'none';
    qrPlaceholderEl.textContent = "NO PENDING DUE";
    qrPlaceholderEl.style.display = 'block';
    if (upiAppBtn) upiAppBtn.style.display = 'none';
    return;
  }

  // Cap amount at 1 Lakh (₹1,00,000) for UPI limit
  let isCapped = false;
  if (parsedAmount > 100000) {
    parsedAmount = 100000;
    isCapped = true;
  }

  amountLabelEl.textContent = `Payable: ${formatCurrency(parsedAmount)}`;
  if (isCapped) {
    amountLabelEl.textContent += " (UPI Capped to ₹1,00,000)";
  }
  
  qrPlaceholderEl.textContent = "GENERATING QR CODE...";
  qrPlaceholderEl.style.display = 'block';
  qrImageEl.style.display = 'none';

  // Determine remaining amount for transaction note
  const remaining = Math.max(0, totalDue - parsedAmount);
  let noteText = "";
  if (remaining <= 0.01) {
    noteText = `${customerName}-FULL PAYMENT`;
  } else {
    const formattedRemaining = Math.round(remaining).toLocaleString('en-IN');
    noteText = `${customerName}-PARTIAL PAYMENT-Rs:${formattedRemaining} LEFT`;
  }

  // Clamp strictly to 52 characters to prevent UPI pop-up limit errors
  if (noteText.length > 52) {
    const formattedRemaining = Math.round(remaining).toLocaleString('en-IN');
    const suffix = remaining <= 0.01 ? "-FULL" : `-PART-Rs:${formattedRemaining} LEFT`;
    const nameLimit = 52 - suffix.length;
    noteText = customerName.substring(0, nameLimit) + suffix;
    // final safety check
    noteText = noteText.substring(0, 52);
  }

  // Generate standard UPI pay link: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE
  currentUpiLink = `upi://pay?pa=${upiId}&pn=Utkal%20Chemical%20Aushadhalaya&am=${parsedAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(noteText)}`;
  
  if (upiAppBtn) {
    upiAppBtn.style.display = 'flex';
  }

  // Set QR Code image source using api.qrserver.com
  qrImageEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(currentUpiLink)}`;
  
  qrImageEl.onload = () => {
    qrPlaceholderEl.style.display = 'none';
    qrImageEl.style.display = 'block';
  };
  
  qrImageEl.onerror = () => {
    qrImageEl.style.display = 'none';
    qrPlaceholderEl.textContent = "COULD NOT GENERATE QR";
    qrPlaceholderEl.style.display = 'block';
  };
}

function initPaymentHandlers() {
  const customInput = document.getElementById('customAmountInput');
  const resetBtn = document.getElementById('resetAmountBtn');
  const slider = document.getElementById('paymentSlider');
  const percentageLabel = document.getElementById('paymentPercentage');
  const upiAppBtn = document.getElementById('payViaUpiAppBtn');

  if (!customInput || !resetBtn || !slider || !percentageLabel) return;

  // Prevent multiple bindings
  if (customInput.dataset.bound) return;
  customInput.dataset.bound = "true";

  const totalDue = parseFloat(rawData.customer.current_due || 0);
  const maxPayable = Math.min(totalDue, 100000);

  // Setup initial slider configuration
  if (totalDue <= 0) {
    slider.disabled = true;
    customInput.disabled = true;
    if (upiAppBtn) upiAppBtn.style.display = 'none';
  } else {
    slider.disabled = false;
    customInput.disabled = false;
    slider.value = 100;
  }

  function updatePaymentPercentage(amt) {
    if (totalDue <= 0) {
      percentageLabel.textContent = "0% OF DUE";
      return;
    }
    const percent = Math.round((amt / totalDue) * 100);
    percentageLabel.textContent = `${percent}% OF DUE`;
  }

  // Handle Input Changes
  customInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      if (val > 100000) {
        val = 100000;
        customInput.value = 100000;
      }
      renderPaymentSection(val);
      updatePaymentPercentage(val);
      
      // Update slider value
      const sliderVal = Math.min(100, Math.round((val / maxPayable) * 100));
      slider.value = sliderVal;
    } else {
      renderPaymentSection(totalDue);
      updatePaymentPercentage(totalDue);
      slider.value = 100;
    }
  });

  // Handle Slider Changes
  slider.addEventListener('input', (e) => {
    const sliderVal = parseInt(e.target.value);
    const calculatedAmount = (sliderVal / 100) * maxPayable;
    
    customInput.value = calculatedAmount > 0 ? calculatedAmount.toFixed(2) : '';
    renderPaymentSection(calculatedAmount);
    updatePaymentPercentage(calculatedAmount);
  });

  // Reset Button
  resetBtn.addEventListener('click', () => {
    customInput.value = '';
    slider.value = 100;
    renderPaymentSection(totalDue);
    updatePaymentPercentage(totalDue);
  });

  // Pay via UPI App button click handler
  if (upiAppBtn) {
    upiAppBtn.addEventListener('click', () => {
      if (currentUpiLink) {
        window.location.href = currentUpiLink;
      }
    });
  }
}

// ==========================================================================
// Additional Portal Actions (Share, Copy, CSV Export)
// ==========================================================================
function launchKiosk(promoCode = '', promoPercent = 0, promoDesc = '') {
  const pathMatch = window.location.pathname.match(/\/(?:ledger|l)\/([a-zA-Z0-9_-]+)/i);
  const token = rawData?.customer?.ledger_token || rawData?.customer?.token || (pathMatch && pathMatch[1]) || new URLSearchParams(window.location.search).get('token');
  const custName = rawData?.customer?.name || 'Customer';

  if (typeof window.openCustomerKiosk === 'function') {
    window.openCustomerKiosk({
      token,
      customerName: custName,
      promoCode,
      promoDiscountPercent: promoPercent,
      promoDescription: promoDesc
    });
  } else {
    alert('Loading self-ordering kiosk...');
  }
}

function initAdditionalHandlers() {
  // 0. Open Kiosk Button
  const kioskBtn = document.getElementById('openKioskBtn');
  if (kioskBtn && !kioskBtn.dataset.bound) {
    kioskBtn.dataset.bound = 'true';
    kioskBtn.addEventListener('click', () => {
      launchKiosk();
    });
  }

  // 1. Share Portal Link Button
  const shareBtn = document.getElementById('sharePortalBtn');
  if (shareBtn && !shareBtn.dataset.bound) {
    shareBtn.dataset.bound = "true";
    shareBtn.addEventListener('click', () => {
      const token = rawData?.customer?.ledger_token || rawData?.customer?.token;
      const url = token ? `${window.location.origin}/ledger/${token}` : window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        const oldText = shareBtn.textContent;
        shareBtn.textContent = "✓ COPIED LINK!";
        shareBtn.style.background = "var(--negative-color)";
        setTimeout(() => {
          shareBtn.textContent = oldText;
          shareBtn.style.background = "";
        }, 2000);
      }).catch(err => {
        alert("Could not copy URL: " + err);
      });
    });
  }

  // 2. Download Statement Button
  const downloadBtn = document.getElementById('downloadStatementBtn');
  if (downloadBtn && !downloadBtn.dataset.bound) {
    downloadBtn.dataset.bound = "true";
    downloadBtn.addEventListener('click', () => {
      sendTelemetryBeacon('DOWNLOAD_CSV');
      downloadStatementCSV();
    });
  }

  // 3. Bank details Copy Buttons
  const copyNumberBtn = document.getElementById('copyNumberBtn');
  const copyIfscBtn = document.getElementById('copyIfscBtn');
  
  if (copyNumberBtn && !copyNumberBtn.dataset.bound) {
    copyNumberBtn.dataset.bound = "true";
    copyNumberBtn.addEventListener('click', () => {
      sendTelemetryBeacon('COPY_ACCOUNT');
      const text = document.getElementById('bankNumber').textContent;
      navigator.clipboard.writeText(text).then(() => {
        copyNumberBtn.textContent = "✓ COPIED";
        setTimeout(() => copyNumberBtn.textContent = "COPY", 2000);
      });
    });
  }
  
  if (copyIfscBtn && !copyIfscBtn.dataset.bound) {
    copyIfscBtn.dataset.bound = "true";
    copyIfscBtn.addEventListener('click', () => {
      sendTelemetryBeacon('COPY_IFSC');
      const text = document.getElementById('bankIfsc').textContent;
      navigator.clipboard.writeText(text).then(() => {
        copyIfscBtn.textContent = "✓ COPIED";
        setTimeout(() => copyIfscBtn.textContent = "COPY", 2000);
      });
    });
  }

  // 4. Print Statement Button
  const printBtn = document.getElementById('printStatementBtn');
  if (printBtn && !printBtn.dataset.bound) {
    printBtn.dataset.bound = "true";
    printBtn.addEventListener('click', () => {
      sendTelemetryBeacon('PRINT');
      window.print();
    });
  }
}

// Client-side Reconciled Statement CSV Exporter
function downloadStatementCSV() {
  if (!rawData) return;
  const customerName = rawData.customer.name;
  
  let csv = "\uFEFFDATE,TRANSACTION TYPE,REFERENCE / INVOICE NO,DEBIT (SALE),CREDIT (PAYMENT),RUNNING BALANCE\n";
  
  // Combine bills and payments into a single chronologically sorted array
  const combined = [];
  rawData.bills.forEach(b => {
    combined.push({
      date: new Date(b.invoice_date || b.created_at),
      type: "BILL",
      ref: b.invoice_no,
      debit: parseFloat(b.amount || 0),
      credit: 0
    });
  });
  
  rawData.payments.forEach(p => {
    const isCredit = p.type === 'CREDIT_NOTE';
    const amount = parseFloat(isCredit ? p.credit_amount : p.amount);
    combined.push({
      date: new Date(p.payment_date || p.created_at),
      type: isCredit ? "CREDIT NOTE" : "PAYMENT",
      ref: p.reference_number || "PMT",
      debit: 0,
      credit: amount
    });
  });
  
  // Sort oldest to newest to compute running balance correctly
  combined.sort((a, b) => a.date - b.date);
  
  let runningBalance = parseFloat(rawData.customer.opening_balance || 0);
  csv += `Opening Balance,,,0.00,0.00,${runningBalance.toFixed(2)}\n`;
  
  combined.forEach(item => {
    const dateStr = item.date.toISOString().split('T')[0];
    if (item.type === "BILL") {
      runningBalance += item.debit;
    } else {
      runningBalance -= item.credit;
    }
    csv += `"${dateStr}","${item.type}","${item.ref}",${item.debit.toFixed(2)},${item.credit.toFixed(2)},${runningBalance.toFixed(2)}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Statement_${customerName.replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Payment Progress & Dues Ageing Breakdown Calculator
function updateProgressAndAgeing() {
  if (!rawData) return;
  
  // 1. Calculate Progress
  let totalPurchases = 0;
  rawData.bills.forEach(b => totalPurchases += parseFloat(b.amount || 0));
  
  const opBal = parseFloat(rawData.customer.opening_balance || 0);
  if (opBal > 0) {
    totalPurchases += opBal;
  }
  
  const currentDue = parseFloat(rawData.customer.current_due || 0);
  const totalSettled = Math.max(0, totalPurchases - currentDue);
  
  let paidPercent = 0;
  if (totalPurchases > 0) {
    paidPercent = Math.round((totalSettled / totalPurchases) * 100);
  }
  
  document.getElementById('paidPercentLabel').textContent = `${paidPercent}%`;
  document.getElementById('paymentProgressBar').style.width = `${paidPercent}%`;
  document.getElementById('progressText').textContent = `You have settled ${formatCurrency(totalSettled)} of ${formatCurrency(totalPurchases)} purchases.`;

  // 2. Calculate Ageing
  let ageing0to7 = 0;
  let ageing8to15 = 0;
  let ageing16to30 = 0;
  let ageingOver30 = 0;

  if (opBal > 0) {
    ageingOver30 += opBal;
  }

  rawData.bills.forEach(b => {
    const info = window.settlementMap ? window.settlementMap[b.id] : null;
    if (info && !info.settled) {
      const days = info.days;
      const amt = parseFloat(b.amount || 0);
      if (days <= 7) {
        ageing0to7 += amt;
      } else if (days <= 15) {
        ageing8to15 += amt;
      } else if (days <= 30) {
        ageing16to30 += amt;
      } else {
        ageingOver30 += amt;
      }
    }
  });

  document.getElementById('ageing0to7').textContent = formatCurrency(ageing0to7);
  document.getElementById('ageing8to15').textContent = formatCurrency(ageing8to15);
  document.getElementById('ageing16to30').textContent = formatCurrency(ageing16to30);
  document.getElementById('ageingOver30').textContent = formatCurrency(ageingOver30);
}

// Generate unified chronological statement table for printer output
function populatePrintStatementTable() {
  const tbody = document.getElementById('printStatementBody');
  if (!tbody || !rawData) return;

  let html = '';
  // Combine all bills and payments
  const combined = [];
  rawData.bills.forEach(b => {
    combined.push({
      id: b.id,
      date: new Date(b.invoice_date || b.created_at),
      type: "BILL",
      ref: b.invoice_no,
      debit: parseFloat(b.amount || 0),
      credit: 0
    });
  });
  
  rawData.payments.forEach(p => {
    const isCredit = p.type === 'CREDIT_NOTE';
    const amount = parseFloat(isCredit ? p.credit_amount : p.amount);
    combined.push({
      id: p.id,
      date: new Date(p.payment_date || p.created_at),
      type: isCredit ? "CREDIT NOTE" : "PAYMENT",
      ref: p.reference_number || "PMT",
      debit: 0,
      credit: amount
    });
  });

  // Sort oldest to newest
  combined.sort((a, b) => a.date - b.date);

  let runningBalance = parseFloat(rawData.customer.opening_balance || 0);
  html += `
    <tr style="border-bottom: 1px solid #000000;">
      <td style="padding: 6px;">-</td>
      <td style="padding: 6px; font-weight: bold;">OPENING BALANCE</td>
      <td style="padding: 6px;">-</td>
      <td style="padding: 6px; font-weight: bold; color: var(--text-secondary);">-</td>
      <td style="padding: 6px; text-align: right;">-</td>
      <td style="padding: 6px; text-align: right;">-</td>
      <td style="padding: 6px; text-align: right; font-weight: bold;">${formatCurrency(runningBalance)}</td>
    </tr>
  `;

  combined.forEach(item => {
    let settlementTimeInfo = '-';
    
    if (item.type === "BILL") {
      runningBalance += item.debit;
      const settleInfo = window.settlementMap ? window.settlementMap[item.id] : null;
      if (settleInfo) {
        settlementTimeInfo = settleInfo.settled ? `SETTLED IN ${settleInfo.days}D` : `${settleInfo.days}D OUTSTANDING`;
      }
    } else {
      runningBalance -= item.credit;
      const allocInfo = window.paymentAllocMap ? window.paymentAllocMap[item.id] : null;
      if (allocInfo) {
        const percent = Math.min(100, Math.round((allocInfo.allocated / (allocInfo.total || 1)) * 100));
        settlementTimeInfo = `ALLOCATED (${percent}%)`;
      }
    }
    
    html += `
      <tr style="border-bottom: 1px solid #e5e7eb; page-break-inside: avoid;">
        <td style="padding: 6px;">${formatDate(item.date)}</td>
        <td style="padding: 6px; font-weight: bold;">${item.type}</td>
        <td style="padding: 6px;">${item.ref}</td>
        <td style="padding: 6px; font-weight: bold; color: var(--text-secondary); font-size: 9px; text-transform: uppercase;">${settlementTimeInfo}</td>
        <td style="padding: 6px; text-align: right;">${item.debit > 0 ? formatCurrency(item.debit) : '-'}</td>
        <td style="padding: 6px; text-align: right;">${item.credit > 0 ? formatCurrency(item.credit) : '-'}</td>
        <td style="padding: 6px; text-align: right; font-weight: bold;">${formatCurrency(runningBalance)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}


function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders || orders.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem; font-weight: bold; border: 2px dashed var(--border-color);">━━ NO ORDERS FOUND ━━</div>`;
    return;
  }

  let html = '';
  orders.forEach(order => {
    const hasInvoice = Boolean(order.bill_reference && String(order.bill_reference).trim());
    let stageBadge = '';
    if (hasInvoice) {
      stageBadge = `<span style="font-size: 8px; font-weight: 900; color: #ffffff; background: #16a34a; padding: 3px 6px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.6px; margin-left: 0.5rem; display: inline-block;">INVOICED: ${order.bill_reference}</span>`;
    } else if (order.current_stage === 'stage2') {
      stageBadge = `<span style="font-size: 8px; font-weight: 900; color: #ffffff; background: #2563eb; padding: 3px 6px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.6px; margin-left: 0.5rem; display: inline-block;">PACKING / IN TRANSIT</span>`;
    } else {
      stageBadge = `<span style="font-size: 8px; font-weight: 900; color: #ffffff; background: #6b7280; padding: 3px 6px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.6px; margin-left: 0.5rem; display: inline-block;">PENDING DISPATCH</span>`;
    }

    const itemCount = order.item_count || (order.items ? order.items.length : 0);
    const itemsList = Array.isArray(order.items) ? order.items : [];

    html += `
      <div class="record-card" style="flex-direction: column; align-items: stretch; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <div class="record-info">
            <div class="record-title" style="display: flex; align-items: center; flex-wrap: wrap;">
              📦 ORDER #${order.order_number} ${stageBadge}
            </div>
            <div class="record-date" style="margin-top: 3px;">█ ${formatDate(order.order_date || order.created_at)} · ${itemCount} item(s)</div>
          </div>
          <div class="record-amount amount-positive">${formatCurrency(order.total_amount)}</div>
        </div>
        ${itemsList.length > 0 ? `
          <div style="margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 6px;">
            <div style="display: flex; flex-direction: column; gap: 3px;">
              ${itemsList.map(it => `
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-color);">
                  <span>
                    <strong>${it.product_name}</strong>
                    ${(it.pack || it.batch_no) ? `<span style="color: var(--text-secondary);"> (${[it.pack, it.batch_no ? `Batch: ${it.batch_no}` : ''].filter(Boolean).join(' · ')})</span>` : ''}
                    <span style="color: var(--text-secondary);"> × ${it.quantity}</span>
                  </span>
                  <span style="font-weight: 600;">${formatCurrency(it.line_total || (it.quantity * it.unit_price))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}
