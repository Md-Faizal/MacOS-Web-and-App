/**
 * order-fulfillment.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plant & Warehouse Order Fulfillment Client
 * Plain, industrial, work-related mobile fulfillment portal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // State
  let currentToken = null;
  let manifestData = null;
  let activeTab = 'grouped'; // 'grouped' | 'consolidated'
  let localItemStates = {}; // { itemId: { plant_status, packed_quantity, packed_batch_id, packed_batch_no, packed_expiry, plant_notes } }

  // DOM Elements
  const loadingView = document.getElementById('loadingView');
  const errorView = document.getElementById('errorView');
  const errorTitle = document.getElementById('errorTitle');
  const errorMsg = document.getElementById('errorMsg');
  const manifestContentView = document.getElementById('manifestContentView');
  const successView = document.getElementById('successView');
  const stickyBar = document.getElementById('stickyBar');

  const manifestTitle = document.getElementById('manifestTitle');
  const manifestSubtitle = document.getElementById('manifestSubtitle');
  const manifestStatusBadge = document.getElementById('manifestStatusBadge');

  const diffBanner = document.getElementById('diffBanner');
  const diffTitle = document.getElementById('diffTitle');
  const diffDesc = document.getElementById('diffDesc');

  const tabGrouped = document.getElementById('tabGrouped');
  const tabConsolidated = document.getElementById('tabConsolidated');
  const itemsContainer = document.getElementById('itemsContainer');

  const casesInput = document.getElementById('casesInput');
  const plantNotesInput = document.getElementById('plantNotesInput');

  const progressChecked = document.getElementById('progressChecked');
  const progressTotal = document.getElementById('progressTotal');
  const progressBreakdown = document.getElementById('progressBreakdown');
  const btnSubmitPacking = document.getElementById('btnSubmitPacking');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  function showToast(msg) {
    if (!toast) return;
    toastMsg.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2800);
  }

  function extractTokenFromUrl() {
    const url = new URL(window.location.href);
    const paramToken = url.searchParams.get('token') || url.searchParams.get('code');
    if (paramToken) return paramToken.trim();

    const parts = url.pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart && (lastPart.startsWith('PLANT-') || parts.includes('plant') || parts.includes('order-fulfillment'))) {
      if (lastPart !== 'plant' && lastPart !== 'order-fulfillment' && !lastPart.endsWith('.html')) {
        return lastPart.trim();
      }
    }
    return null;
  }

  async function loadManifest() {
    currentToken = extractTokenFromUrl();
    if (!currentToken) {
      showError('Missing Plant Link Token', 'Please open a valid link provided by the billing team.');
      return;
    }

    try {
      // Load local draft state from storage if exists
      try {
        const stored = localStorage.getItem('plant_state_' + currentToken);
        if (stored) localItemStates = JSON.parse(stored);
      } catch (_) { }

      const res = await fetch(`/api/orders/public/manifest/${encodeURIComponent(currentToken)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch plant manifest details.');
      }

      manifestData = await res.json();
      renderManifest();
    } catch (err) {
      showError('Unable to Load Manifest', err.message);
    }
  }

  function showError(title, msg) {
    if (loadingView) loadingView.style.display = 'none';
    if (manifestContentView) manifestContentView.style.display = 'none';
    if (stickyBar) stickyBar.style.display = 'none';
    if (errorView) {
      errorView.style.display = 'block';
      if (errorTitle) errorTitle.textContent = title;
      if (errorMsg) errorMsg.textContent = msg;
    }
  }

  function renderManifest() {
    if (!manifestData || !manifestData.manifest) return;
    const { manifest, orders, diffs } = manifestData;

    loadingView.style.display = 'none';
    errorView.style.display = 'none';
    manifestContentView.style.display = 'block';

    // Header info
    manifestTitle.textContent = manifest.title || `Dispatch Manifest #${manifest.token}`;
    const orderNumbers = orders.map(o => o.order_number).join(', ');
    manifestSubtitle.textContent = `Token: ${manifest.token} | Orders: ${orderNumbers}`;

    // Status Badge
    manifestStatusBadge.className = 'status-badge';
    if (manifest.is_locked) {
      manifestStatusBadge.classList.add('locked');
      manifestStatusBadge.textContent = '🔒 Settled & Delivered (Read-Only)';
    } else if (manifest.status === 'submitted') {
      manifestStatusBadge.classList.add('submitted');
      manifestStatusBadge.textContent = '✓ Submitted to QC';
    } else {
      manifestStatusBadge.classList.add('active');
      manifestStatusBadge.textContent = '🟢 Packing in Progress';
    }

    // Packaging Inputs
    if (casesInput) {
      casesInput.value = manifest.cases_count || 1;
      if (manifest.is_locked) casesInput.disabled = true;
    }
    if (plantNotesInput) {
      plantNotesInput.value = manifest.plant_notes || '';
      if (manifest.is_locked) plantNotesInput.disabled = true;
    }

    // Diff / Change Alert Banner
    if (diffs && diffs.length > 0) {
      diffBanner.style.display = 'flex';
      diffTitle.textContent = `⚡ Manifest Updated by Office (v${manifest.version})`;
      diffDesc.textContent = `${diffs.length} item(s) modified or updated. Existing checked items and batch overrides were preserved.`;
    } else {
      diffBanner.style.display = 'none';
    }

    // Populate localItemStates from remote if not already locally drafted
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        if (!localItemStates[item.id]) {
          localItemStates[item.id] = {
            plant_status: item.plant_status && item.plant_status !== 'pending' ? item.plant_status : null,
            packed_quantity: item.packed_quantity !== null && item.packed_quantity !== undefined ? item.packed_quantity : null,
            packed_batch_id: item.packed_batch?.id || item.requested_batch?.id,
            packed_batch_no: item.packed_batch?.batch_no || item.requested_batch?.batch_no || '',
            packed_expiry: item.packed_batch?.exp_date || item.requested_batch?.exp_date || '',
            plant_notes: item.plant_notes || ''
          };
        }
      });
    });

    renderItems();
    updateProgressUI();

    if (!manifest.is_locked) {
      stickyBar.style.display = 'flex';
    } else {
      stickyBar.style.display = 'none';
    }
  }

  function renderItems() {
    itemsContainer.innerHTML = '';
    const { orders } = manifestData;

    if (activeTab === 'grouped') {
      // Group by Order View
      orders.forEach((order, idx) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'order-group';

        const headerEl = document.createElement('div');
        headerEl.className = 'order-group-header';
        headerEl.innerHTML = `
          <div>
            <div class="order-group-title">Order ${idx + 1} of ${orders.length}: ${order.order_number}</div>
            <div class="order-group-customer">Party: <strong>${escapeHtml(order.customer_name || 'Customer')}</strong> | Date: ${order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : '-'}</div>
          </div>
          <div style="font-family: var(--mono); font-size: 11px; color: var(--text-2);">
            ${(order.items || []).length} items
          </div>
        `;
        groupEl.appendChild(headerEl);

        const itemsWrap = document.createElement('div');
        (order.items || []).forEach(item => {
          itemsWrap.appendChild(createItemCard(item));
        });
        groupEl.appendChild(itemsWrap);
        itemsContainer.appendChild(groupEl);
      });
    } else {
      // Consolidated Pick List View
      const consolidatedGroup = document.createElement('div');
      consolidatedGroup.className = 'order-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'order-group-header';
      headerEl.innerHTML = `
        <div>
          <div class="order-group-title">Consolidated Pick List across ${orders.length} Order(s)</div>
          <div class="order-group-customer">Items grouped by product for bulk warehouse retrieval</div>
        </div>
      `;
      consolidatedGroup.appendChild(headerEl);

      const itemsWrap = document.createElement('div');
      orders.forEach(order => {
        (order.items || []).forEach(item => {
          itemsWrap.appendChild(createItemCard(item, order.order_number));
        });
      });
      consolidatedGroup.appendChild(itemsWrap);
      itemsContainer.appendChild(consolidatedGroup);
    }
  }

  function createItemCard(item, parentOrderNumber) {
    const isLocked = manifestData.manifest.is_locked;
    const state = localItemStates[item.id] || {};
    const plantStatus = state.plant_status || item.plant_status || 'pending';

    const card = document.createElement('div');
    card.className = 'plant-item-card';
    card.id = `item-card-${item.id}`;

    if (plantStatus === 'available') card.classList.add('is-available');
    else if (plantStatus === 'partial') card.classList.add('is-partial');
    else if (plantStatus === 'out_of_stock') card.classList.add('is-out');

    // Build batch select options
    const availBatches = item.available_batches || [];
    let batchOptionsHtml = '';
    const currentBatchNo = state.packed_batch_no || item.packed_batch?.batch_no || item.requested_batch?.batch_no || 'Standard';

    // Ensure current batch is included in options
    const hasCurrentInAvail = availBatches.some(b => b.batch_no === currentBatchNo);
    if (!hasCurrentInAvail && currentBatchNo) {
      batchOptionsHtml += `<option value="${escapeHtml(currentBatchNo)}" selected>${escapeHtml(currentBatchNo)} (Order Spec)</option>`;
    }

    availBatches.forEach(b => {
      const isSel = b.batch_no === currentBatchNo ? 'selected' : '';
      const expStr = b.exp_date ? `Exp: ${b.exp_date}` : '';
      batchOptionsHtml += `<option value="${escapeHtml(b.batch_no)}" data-id="${b.id}" data-exp="${escapeHtml(b.exp_date || '')}" ${isSel}>${escapeHtml(b.batch_no)} ${expStr}</option>`;
    });

    card.innerHTML = `
      <div class="item-headline">
        <div>
          <span class="item-product-name">${escapeHtml(item.product_name)}</span>
          ${item.pack_size ? `<span class="item-pack-badge">${escapeHtml(item.pack_size)}</span>` : ''}
          ${parentOrderNumber ? `<span style="font-size: 10px; font-family: var(--mono); color: var(--text-3); margin-left: 6px;">[${parentOrderNumber}]</span>` : ''}
        </div>
        <div class="item-req-qty">Req: ${item.quantity}</div>
      </div>

      ${item.diffBadge ? `<div class="diff-pill">⚡ ${escapeHtml(item.diffText || 'Quantity updated by office')}</div>` : ''}

      <div class="batch-strip">
        <div>
          <span>Req Batch: <strong>${escapeHtml(item.requested_batch?.batch_no || 'Standard')}</strong></span>
          ${item.requested_batch?.exp_date ? `<span style="color: var(--text-3); margin-left: 6px;">(Exp: ${escapeHtml(item.requested_batch.exp_date)})</span>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>Packed Batch:</span>
          <select class="batch-selector" data-item-id="${item.id}" ${isLocked ? 'disabled' : ''}>
            ${batchOptionsHtml}
          </select>
        </div>
      </div>

      <div class="triage-group">
        <button type="button" class="triage-btn available ${plantStatus === 'available' ? 'active' : ''}" data-item-id="${item.id}" data-action="available" ${isLocked ? 'disabled' : ''}>
          ✓ Full (${item.quantity})
        </button>
        <button type="button" class="triage-btn partial ${plantStatus === 'partial' ? 'active' : ''}" data-item-id="${item.id}" data-action="partial" ${isLocked ? 'disabled' : ''}>
          ◒ Partial
        </button>
        <button type="button" class="triage-btn out ${plantStatus === 'out_of_stock' ? 'active' : ''}" data-item-id="${item.id}" data-action="out_of_stock" ${isLocked ? 'disabled' : ''}>
          ✕ Out of Stock
        </button>
      </div>

      <div class="partial-input-wrap" id="partial-wrap-${item.id}" style="display: ${plantStatus === 'partial' ? 'flex' : 'none'};">
        <span style="font-size: 11px; font-family: var(--mono); color: var(--text-2);">Actual Packed Count:</span>
        <input type="number" class="partial-input" data-item-id="${item.id}" min="1" max="${item.quantity}" value="${state.packed_quantity !== null && state.packed_quantity !== undefined ? state.packed_quantity : ''}" placeholder="Qty" ${isLocked ? 'disabled' : ''} />
        <span style="font-size: 11px; font-family: var(--mono); color: var(--text-3);">of ${item.quantity}</span>
      </div>

      <input type="text" class="item-notes-input" data-item-id="${item.id}" placeholder="Remarks (optional e.g. rack shortage, dented outer carton)" value="${escapeHtml(state.plant_notes || '')}" ${isLocked ? 'disabled' : ''} />
    `;

    // Event listeners
    const triageBtns = card.querySelectorAll('.triage-btn');
    triageBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (isLocked) return;
        const action = btn.getAttribute('data-action');
        handleTriageClick(item, action, card);
      });
    });

    const partialInput = card.querySelector('.partial-input');
    if (partialInput) {
      partialInput.addEventListener('input', (e) => {
        if (!localItemStates[item.id]) localItemStates[item.id] = {};
        localItemStates[item.id].packed_quantity = Number(e.target.value) || 0;
        persistLocalState();
        updateProgressUI();
      });
    }

    const batchSelect = card.querySelector('.batch-selector');
    if (batchSelect) {
      batchSelect.addEventListener('change', (e) => {
        const selOpt = e.target.options[e.target.selectedIndex];
        if (!localItemStates[item.id]) localItemStates[item.id] = {};
        localItemStates[item.id].packed_batch_no = e.target.value;
        localItemStates[item.id].packed_batch_id = selOpt ? Number(selOpt.getAttribute('data-id')) || null : null;
        localItemStates[item.id].packed_expiry = selOpt ? selOpt.getAttribute('data-exp') || '' : '';
        persistLocalState();
        showToast(`Batch set to ${e.target.value}`);
      });
    }

    const notesInput = card.querySelector('.item-notes-input');
    if (notesInput) {
      notesInput.addEventListener('input', (e) => {
        if (!localItemStates[item.id]) localItemStates[item.id] = {};
        localItemStates[item.id].plant_notes = e.target.value;
        persistLocalState();
      });
    }

    return card;
  }

  function handleTriageClick(item, action, card) {
    if (!localItemStates[item.id]) localItemStates[item.id] = {};
    localItemStates[item.id].plant_status = action;

    card.classList.remove('is-available', 'is-partial', 'is-out');
    const partialWrap = card.querySelector(`#partial-wrap-${item.id}`);

    card.querySelectorAll('.triage-btn').forEach(b => b.classList.remove('active'));
    const clickedBtn = card.querySelector(`.triage-btn[data-action="${action}"]`);
    if (clickedBtn) clickedBtn.classList.add('active');

    if (action === 'available') {
      card.classList.add('is-available');
      localItemStates[item.id].packed_quantity = item.quantity;
      if (partialWrap) partialWrap.style.display = 'none';
    } else if (action === 'partial') {
      card.classList.add('is-partial');
      if (partialWrap) {
        partialWrap.style.display = 'flex';
        const inp = partialWrap.querySelector('.partial-input');
        if (inp) {
          if (!inp.value || Number(inp.value) >= item.quantity) {
            inp.value = Math.max(1, Math.floor(item.quantity / 2));
          }
          localItemStates[item.id].packed_quantity = Number(inp.value);
          inp.focus();
        }
      }
    } else if (action === 'out_of_stock') {
      card.classList.add('is-out');
      localItemStates[item.id].packed_quantity = 0;
      if (partialWrap) partialWrap.style.display = 'none';
    }

    persistLocalState();
    updateProgressUI();
  }

  function persistLocalState() {
    if (!currentToken) return;
    try {
      localStorage.setItem('plant_state_' + currentToken, JSON.stringify(localItemStates));
    } catch (_) { }
  }

  function updateProgressUI() {
    if (!manifestData || !manifestData.orders) return;
    const allItems = manifestData.orders.flatMap(o => o.items || []);
    const total = allItems.length;

    let availableCount = 0;
    let partialCount = 0;
    let outCount = 0;

    allItems.forEach(item => {
      const st = localItemStates[item.id];
      const status = st?.plant_status || item.plant_status;
      if (status === 'available') availableCount++;
      else if (status === 'partial') partialCount++;
      else if (status === 'out_of_stock') outCount++;
    });

    const checkedTotal = availableCount + partialCount + outCount;

    if (progressChecked) progressChecked.textContent = checkedTotal;
    if (progressTotal) progressTotal.textContent = total;
    if (progressBreakdown) {
      progressBreakdown.textContent = `${availableCount} full | ${partialCount} partial | ${outCount} out`;
    }

    if (btnSubmitPacking) {
      if (checkedTotal === 0) {
        btnSubmitPacking.disabled = true;
        btnSubmitPacking.textContent = 'CHECK ITEMS TO SUBMIT';
      } else {
        btnSubmitPacking.disabled = false;
        btnSubmitPacking.textContent = `✓ SUBMIT PACKING (${checkedTotal}/${total} CHECKED)`;
      }
    }
  }

  // Submit Handler
  if (btnSubmitPacking) {
    btnSubmitPacking.addEventListener('click', async () => {
      if (!manifestData || !manifestData.orders) return;
      const allItems = manifestData.orders.flatMap(o => o.items || []);

      const payloadItems = allItems.map(item => {
        const st = localItemStates[item.id] || {};
        return {
          order_item_id: item.id,
          plant_status: st.plant_status || item.plant_status || 'available',
          packed_quantity: st.packed_quantity !== null && st.packed_quantity !== undefined ? st.packed_quantity : item.quantity,
          packed_batch_id: st.packed_batch_id || item.packed_batch?.id || item.requested_batch?.id,
          packed_batch_no: st.packed_batch_no || item.packed_batch?.batch_no || item.requested_batch?.batch_no || '',
          packed_expiry: st.packed_expiry || item.packed_batch?.exp_date || item.requested_batch?.exp_date || '',
          plant_notes: st.plant_notes || ''
        };
      });

      const casesCount = Number(casesInput?.value) || 1;
      const plantNotes = plantNotesInput?.value || '';

      btnSubmitPacking.disabled = true;
      btnSubmitPacking.textContent = 'SUBMITTING TO OFFICE...';

      try {
        const res = await fetch(`/api/orders/public/manifest/${encodeURIComponent(currentToken)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: payloadItems,
            cases_count: casesCount,
            plant_notes: plantNotes
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to submit packing details.');
        }

        // Clear local draft state upon successful submission
        try { localStorage.removeItem('plant_state_' + currentToken); } catch (_) { }

        manifestContentView.style.display = 'none';
        stickyBar.style.display = 'none';
        successView.style.display = 'block';
        showToast('Packing submitted to office successfully');
      } catch (err) {
        showToast('Error: ' + err.message);
        btnSubmitPacking.disabled = false;
        btnSubmitPacking.textContent = '✓ SUBMIT PACKING TO OFFICE';
      }
    });
  }

  // Tab Switching
  if (tabGrouped) {
    tabGrouped.addEventListener('click', () => {
      activeTab = 'grouped';
      tabGrouped.classList.add('active');
      tabConsolidated.classList.remove('active');
      renderItems();
    });
  }

  if (tabConsolidated) {
    tabConsolidated.addEventListener('click', () => {
      activeTab = 'consolidated';
      tabConsolidated.classList.add('active');
      tabGrouped.classList.remove('active');
      renderItems();
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  loadManifest();
})();
