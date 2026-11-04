// @ts-nocheck
/**
 * Customer Self-Ordering Kiosk Component
 * Direct-from-factory wholesale ordering portal with multi-variant selection,
 * latest-batch auto-allocation, canonical ORD-YY#### sequences, and clean Apple/Swiss density.
 */

(function() {
  function formatCurrency(amt) {
    return '₹' + Number(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  window.openCustomerKiosk = async function(options = {}) {
    const {
      token,
      customerName = 'Customer',
      promoCode = '',
      promoDiscountPercent = 0,
      promoDescription = ''
    } = options;

    if (!token) {
      alert('Ledger session token is missing.');
      return;
    }

    // Remove any existing kiosk
    const existing = document.getElementById('customerKioskOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customerKioskOverlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(5px);
      z-index: 2000000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #ffffff;
      color: #000000;
      width: min(920px, 96vw);
      max-height: 92vh;
      border: 2px solid #000000;
      box-shadow: 6px 6px 0px rgba(0,0,0,1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: trackingModalPop 0.15s ease-out;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #000000;
      color: #ffffff;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 0.5px;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>ORDER PORTAL — ${customerName.toUpperCase()}</span>
      </div>
      <button id="closeKioskBtn" style="background: transparent; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 0 4px; font-weight: 700;">✕</button>
    `;

    // Content container
    const content = document.createElement('div');
    content.style.cssText = `
      display: flex;
      flex: 1;
      overflow: hidden;
      flex-direction: column;
    `;
    content.innerHTML = `
      <div style="text-align: center; padding: 60px 0;">
        <div style="font-size: 24px; animation: spin 1s infinite linear;">⚙️</div>
        <div style="margin-top: 10px; font-size: 12px; font-weight: bold;">LOADING CATALOG...</div>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    header.querySelector('#closeKioskBtn').onclick = closeModal;

    // Cart state: array of { cartKey, productId, name, rate, qty, variantId, unit, batchId, batchNo }
    let cart = [];
    let appliedPromoPercent = Number(promoDiscountPercent) || 0;
    let appliedPromoCode = promoCode || '';

    // Selected variant map per product: productId -> variant object
    const selectedVariantByProductId = new Map();

    try {
      const res = await fetch(`/api/billing/public/customer-items/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error('Could not load catalog');
      const data = await res.json();
      const pastItems = data.items || [];
      const catalog = data.catalog || [];

      // Run shared pattern engine for quick reorder suggestions
      let predictions = [];
      if (window.CustomerPatternEngine) {
        predictions = window.CustomerPatternEngine.analyzeProductCadenceAndDepletion(pastItems);
      }

      // Initialize default selected variant for each catalog product
      catalog.forEach(p => {
        if (Array.isArray(p.variants) && p.variants.length > 0) {
          selectedVariantByProductId.set(p.id, p.variants[0]);
        } else {
          selectedVariantByProductId.set(p.id, {
            id: p.variant_id || null,
            unit: p.unit || '1 Unit',
            price: Number(p.price || p.mrp) || 0,
            mrp: Number(p.mrp) || 0,
            batch_id: p.batch_id || null,
            batch_no: p.batch_no || ''
          });
        }
      });

      // Render Layout
      content.innerHTML = `
        <div style="display: flex; flex: 1; overflow: hidden; flex-direction: row; flex-wrap: wrap;">
          <!-- Left: Catalog & Suggestions (60%) -->
          <div style="flex: 1 1 480px; padding: 14px; overflow-y: auto; border-right: 1.5px solid #000000; max-height: calc(92vh - 60px);">
            
            ${predictions.length > 0 ? `
              <!-- Recent Reorder Items Shelf -->
              <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                  <span>FREQUENT PURCHASES</span>
                  <span style="font-size: 9px; color: #6b7280;">1-Click Quick Add</span>
                </div>
                <div id="kioskPredictionsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px;">
                  ${predictions.slice(0, 4).map(p => {
                    const catProd = catalog.find(cp => String(cp.id) === String(p.productId));
                    const defVar = catProd && Array.isArray(catProd.variants) && catProd.variants.length > 0 ? catProd.variants[0] : null;
                    const vId = defVar?.id || null;
                    const unit = defVar?.unit || p.pack_value || '1 Unit';
                    const bId = defVar?.batch_id || null;
                    const bNo = defVar?.batch_no || '';
                    const rate = Number(p.rate || defVar?.price || 0);
                    const qty = Number(p.avgQtyPerOrder) || 1;

                    return `
                      <div style="border: 1px solid #000000; padding: 8px; background: #ffffff; box-shadow: 2px 2px 0 #000000; display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                          <div style="font-weight: 700; font-size: 11px; line-height: 1.3;">${p.name}</div>
                          <div style="font-size: 9px; color: #4b5563; margin-top: 2px;">
                            ${unit}${bNo ? ` · Batch: ${bNo}` : ''}
                          </div>
                          <div style="font-size: 12px; font-weight: 900; margin-top: 4px; color: #111827;">
                            ${formatCurrency(rate)}
                          </div>
                        </div>
                        <button class="kiosk-quick-add-btn" 
                          data-product-id="${p.productId}" 
                          data-name="${p.name}" 
                          data-rate="${rate}" 
                          data-qty="${qty}"
                          data-variant-id="${vId || ''}"
                          data-unit="${unit}"
                          data-batch-id="${bId || ''}"
                          data-batch-no="${bNo}"
                          style="margin-top: 8px; background: #000000; color: #ffffff; border: 1px solid #000000; padding: 4px 8px; font-size: 10px; font-weight: 800; cursor: pointer;">
                          + ADD (${qty} PK)
                        </button>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Full Catalog Search & Category Filters -->
            <div>
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>PRODUCT CATALOG</span>
                <span id="kioskCatalogMatchCount" style="font-size: 9px; color: #6b7280; font-weight: normal;"></span>
              </div>
              
              <!-- Category Filter Pills -->
              <div id="kioskCategoryPills" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 8px;">
                <button class="kiosk-cat-pill active" data-cat="all" style="padding: 3px 8px; font-size: 10px; font-weight: 700; border: 1px solid #000; background: #000; color: #fff; cursor: pointer; white-space: nowrap;">ALL</button>
                <button class="kiosk-cat-pill" data-cat="gold" style="padding: 3px 8px; font-size: 10px; font-weight: 700; border: 1px solid #000; background: #fff; color: #b45309; cursor: pointer; white-space: nowrap;">GOLD</button>
                <button class="kiosk-cat-pill" data-cat="nongold" style="padding: 3px 8px; font-size: 10px; font-weight: 700; border: 1px solid #000; background: #fff; color: #000; cursor: pointer; white-space: nowrap;">NON-GOLD</button>
              </div>

              <input type="text" id="kioskCatalogSearch" placeholder="Search product name or category..." style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 11px; border: 1.5px solid #000000; margin-bottom: 10px; font-family: monospace;">
              <div id="kioskCatalogList" style="display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto;">
                <!-- Catalog items rendered via JS -->
              </div>
            </div>
          </div>

          <!-- Right: Order Cart & Checkout (40%) -->
          <div style="flex: 1 1 320px; padding: 14px; background: #fafafa; display: flex; flex-direction: column; justify-content: space-between; max-height: calc(92vh - 60px);">
            <div>
              <div style="font-size: 12px; font-weight: 800; border-bottom: 2px solid #000000; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between;">
                <span>ORDER ITEMS (<span id="kioskCartItemCount">0</span>)</span>
                <span id="kioskClearCartBtn" style="font-size: 10px; color: #ef4444; cursor: pointer; text-decoration: underline;">Clear</span>
              </div>

              <!-- Cart items container -->
              <div id="kioskCartItems" style="max-height: 280px; overflow-y: auto; margin-bottom: 12px; font-size: 11px;">
                <div style="text-align: center; padding: 30px 0; color: #6b7280;">Cart is empty. Click [+ Add] to order items.</div>
              </div>

              <!-- Order notes -->
              <div style="margin-bottom: 10px;">
                <label style="font-size: 10px; font-weight: 700; display: block; margin-bottom: 2px;">DELIVERY / PACKING NOTES:</label>
                <textarea id="kioskOrderNotes" placeholder="Optional notes for factory packing & dispatch..." style="width: 100%; box-sizing: border-box; height: 50px; font-size: 10px; border: 1px solid #000000; padding: 6px; font-family: sans-serif; resize: none;"></textarea>
              </div>
            </div>

            <!-- Totals & Submit -->
            <div style="border-top: 1.5px solid #000000; padding-top: 10px;">
              <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; margin-bottom: 10px;">
                <span>TOTAL:</span>
                <span id="kioskGrandTotal">₹0.00</span>
              </div>
              <button id="kioskSubmitOrderBtn" style="width: 100%; padding: 10px; background: #000000; color: #ffffff; border: 2px solid #000000; font-weight: 800; font-size: 12px; cursor: pointer; box-shadow: 2px 2px 0 #000000; letter-spacing: 0.5px;">
                CONFIRM & SUBMIT ORDER
              </button>
            </div>
          </div>
        </div>
      `;

      let currentCatalogCategory = 'all';

      // Render Catalog helper with variant pills
      function renderCatalog(filterText = '') {
        const list = content.querySelector('#kioskCatalogList');
        const matchCountSpan = content.querySelector('#kioskCatalogMatchCount');
        if (!list) return;

        const q = filterText.toLowerCase().trim();
        const filtered = catalog.filter(p => {
          const isGold = (p.classification && String(p.classification).toLowerCase() === 'gold') ||
                         (p.category && String(p.category).toLowerCase().includes('gold'));

          if (currentCatalogCategory === 'gold' && !isGold) return false;
          if (currentCatalogCategory === 'nongold' && isGold) return false;

          if (!q) return true;
          return p.name.toLowerCase().includes(q) || (p.category && String(p.category).toLowerCase().includes(q));
        });

        if (matchCountSpan) {
          matchCountSpan.textContent = `${filtered.length} of ${catalog.length} items`;
        }

        if (filtered.length === 0) {
          list.innerHTML = `<div style="font-size: 11px; color: #6b7280; padding: 12px; text-align: center; border: 1px dashed #d1d5db;">No products match "${filterText || currentCatalogCategory}"</div>`;
          return;
        }

        list.innerHTML = filtered.map(p => {
          const isGold = (p.classification && String(p.classification).toLowerCase() === 'gold') ||
                         (p.category && String(p.category).toLowerCase().includes('gold'));
          
          const variants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : [];
          const activeVar = selectedVariantByProductId.get(p.id) || (variants[0] || null);

          const curPrice = activeVar ? Number(activeVar.price || activeVar.mrp) : Number(p.price || p.mrp || 0);
          const curUnit = activeVar ? activeVar.unit : (p.unit || '1 Unit');
          const curBatchNo = activeVar ? activeVar.batch_no : (p.batch_no || '');
          const curVariantId = activeVar ? activeVar.id : null;
          const curBatchId = activeVar ? activeVar.batch_id : null;

          return `
            <div style="padding: 8px 10px; border: 1px solid #e5e7eb; background: #ffffff;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1; padding-right: 8px;">
                  <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
                    <span style="font-weight: 700; font-size: 11px; line-height: 1.2;">${p.name}</span>
                    ${isGold ? '<span style="font-size: 8px; font-weight: 800; background: #fff8e6; color: #b45309; border: 1px solid #fde68a; padding: 1px 4px;">GOLD</span>' : ''}
                  </div>
                  <div style="font-size: 9px; color: #6b7280;">
                    ${p.category || 'General'}${curBatchNo ? ` · Batch: ${curBatchNo}` : ''}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 800; font-size: 12px;">${formatCurrency(curPrice)}</span>
                  <button class="kiosk-add-btn" 
                    data-product-id="${p.id}" 
                    data-name="${p.name}" 
                    data-rate="${curPrice}" 
                    data-variant-id="${curVariantId || ''}"
                    data-unit="${curUnit}"
                    data-batch-id="${curBatchId || ''}"
                    data-batch-no="${curBatchNo}"
                    data-qty="1" 
                    style="background: #ffffff; border: 1px solid #000; padding: 3px 8px; font-size: 10px; cursor: pointer; font-weight: bold; box-shadow: 1px 1px 0 #000;">
                    + Add
                  </button>
                </div>
              </div>

              ${variants.length > 1 ? `
                <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
                  ${variants.map(v => {
                    const isSel = activeVar && String(activeVar.id) === String(v.id);
                    return `
                      <button class="kiosk-var-pill" 
                        data-product-id="${p.id}" 
                        data-variant-id="${v.id}"
                        style="padding: 2px 6px; font-size: 9px; font-weight: 700; border: 1px solid #000000; background: ${isSel ? '#000000' : '#ffffff'}; color: ${isSel ? '#ffffff' : '#000000'}; cursor: pointer;">
                        ${v.unit} - ${formatCurrency(v.price || v.mrp)}
                      </button>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('');

        // Wire catalog add buttons
        list.querySelectorAll('.kiosk-add-btn').forEach(btn => {
          btn.onclick = () => {
            addToCart(
              btn.dataset.productId,
              btn.dataset.name,
              Number(btn.dataset.rate) || 0,
              Number(btn.dataset.qty) || 1,
              btn.dataset.variantId || null,
              btn.dataset.unit || '',
              btn.dataset.batchId || null,
              btn.dataset.batchNo || ''
            );
          };
        });

        // Wire variant selector pills
        list.querySelectorAll('.kiosk-var-pill').forEach(pill => {
          pill.onclick = () => {
            const pId = pill.dataset.productId;
            const vId = pill.dataset.variantId;
            const prod = catalog.find(cp => String(cp.id) === String(pId));
            if (prod && Array.isArray(prod.variants)) {
              const matchedVar = prod.variants.find(v => String(v.id) === String(vId));
              if (matchedVar) {
                selectedVariantByProductId.set(prod.id, matchedVar);
                const searchInput = content.querySelector('#kioskCatalogSearch');
                renderCatalog(searchInput ? searchInput.value : '');
              }
            }
          };
        });
      }

      // Wire Category Pills
      content.querySelectorAll('.kiosk-cat-pill').forEach(pill => {
        pill.onclick = () => {
          content.querySelectorAll('.kiosk-cat-pill').forEach(p => {
            p.classList.remove('active');
            p.style.background = '#ffffff';
            p.style.color = p.dataset.cat === 'gold' ? '#b45309' : '#000000';
          });
          pill.classList.add('active');
          pill.style.background = '#000000';
          pill.style.color = '#ffffff';
          currentCatalogCategory = pill.dataset.cat;
          const searchInput = content.querySelector('#kioskCatalogSearch');
          renderCatalog(searchInput ? searchInput.value : '');
        };
      });

      // Catalog search input
      const searchInput = content.querySelector('#kioskCatalogSearch');
      if (searchInput) {
        searchInput.oninput = () => renderCatalog(searchInput.value);
        renderCatalog();
      }

      // Wire quick-add buttons from predictions
      content.querySelectorAll('.kiosk-quick-add-btn').forEach(btn => {
        btn.onclick = () => {
          addToCart(
            btn.dataset.productId,
            btn.dataset.name,
            Number(btn.dataset.rate) || 0,
            Number(btn.dataset.qty) || 1,
            btn.dataset.variantId || null,
            btn.dataset.unit || '',
            btn.dataset.batchId || null,
            btn.dataset.batchNo || ''
          );
        };
      });

      // Cart management functions with compound key
      function addToCart(productId, name, rate, qty = 1, variantId = null, unit = '', batchId = null, batchNo = '') {
        const cartKey = `${productId}_${variantId || 'def'}`;
        const existing = cart.find(i => i.cartKey === cartKey);
        if (existing) {
          existing.qty += qty;
        } else {
          cart.push({
            cartKey,
            productId,
            name,
            rate,
            qty,
            variantId,
            unit,
            batchId,
            batchNo
          });
        }
        renderCart();
      }

      function updateItemQty(index, delta) {
        if (!cart[index]) return;
        cart[index].qty += delta;
        if (cart[index].qty <= 0) {
          cart.splice(index, 1);
        }
        renderCart();
      }

      function renderCart() {
        const container = content.querySelector('#kioskCartItems');
        const countSpan = content.querySelector('#kioskCartItemCount');
        const grandTotalSpan = content.querySelector('#kioskGrandTotal');

        const totalItemsCount = cart.reduce((acc, i) => acc + i.qty, 0);
        if (countSpan) countSpan.textContent = totalItemsCount;

        if (cart.length === 0) {
          container.innerHTML = `<div style="text-align: center; padding: 30px 0; color: #6b7280;">Cart is empty. Click [+ Add] to order items.</div>`;
          grandTotalSpan.textContent = '₹0.00';
          return;
        }

        let total = 0;
        container.innerHTML = cart.map((item, idx) => {
          const itemTotal = item.qty * item.rate;
          total += itemTotal;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
              <div style="flex: 1; padding-right: 6px;">
                <div style="font-weight: 700; line-height: 1.2;">${item.name}</div>
                <div style="font-size: 9px; color: #6b7280;">
                  ${item.unit ? item.unit : ''}${item.batchNo ? ` · Batch: ${item.batchNo}` : ''}
                </div>
                <div style="font-size: 9px; color: #374151;">${formatCurrency(item.rate)} each</div>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <button class="kiosk-qty-btn" data-idx="${idx}" data-delta="-1" style="width: 20px; height: 20px; border: 1px solid #000; background: #fff; cursor: pointer; font-weight: bold;">-</button>
                <span style="font-weight: 800; min-width: 18px; text-align: center;">${item.qty}</span>
                <button class="kiosk-qty-btn" data-idx="${idx}" data-delta="1" style="width: 20px; height: 20px; border: 1px solid #000; background: #fff; cursor: pointer; font-weight: bold;">+</button>
              </div>
              <div style="font-weight: 800; min-width: 55px; text-align: right;">
                ${formatCurrency(itemTotal)}
              </div>
            </div>
          `;
        }).join('');

        // Wire quantity buttons
        container.querySelectorAll('.kiosk-qty-btn').forEach(btn => {
          btn.onclick = () => updateItemQty(Number(btn.dataset.idx), Number(btn.dataset.delta));
        });

        grandTotalSpan.textContent = formatCurrency(total);
      }

      // Clear cart
      const clearBtn = content.querySelector('#kioskClearCartBtn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          cart = [];
          renderCart();
        };
      }

      // Submit order handler
      const submitBtn = content.querySelector('#kioskSubmitOrderBtn');
      if (submitBtn) {
        submitBtn.onclick = async () => {
          if (cart.length === 0) {
            alert('Your order cart is empty.');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'SUBMITTING...';

          try {
            const notes = content.querySelector('#kioskOrderNotes')?.value || '';

            const payload = {
              token,
              items: cart,
              notes
            };

            const csrfToken = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1] || '';
            const orderRes = await fetch('/api/billing/public/kiosk-order', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...(csrfToken ? { 'x-csrf-token': decodeURIComponent(csrfToken) } : {})
              },
              body: JSON.stringify(payload)
            });

            if (!orderRes.ok) {
              const errData = await orderRes.json().catch(() => ({}));
              throw new Error(errData.error || 'Failed to place order');
            }

            const resData = await orderRes.json();

            // Minimal, clean confirmation screen
            content.innerHTML = `
              <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
                <div style="font-size: 16px; font-weight: 800; margin-bottom: 4px;">ORDER PLACED: #${resData.orderNumber}</div>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 16px;">
                  Total: <strong>${formatCurrency(resData.totalAmount)}</strong> · Status: <strong>Pending Dispatch</strong>
                </div>
                <div style="max-width: 420px; margin: 0 auto; background: #f4f4f5; border: 1.5px solid #000000; padding: 12px 16px; font-size: 11px; color: #18181b; line-height: 1.5; text-align: left;">
                  Order recorded under your account. Items will be packed and invoiced directly.
                </div>
                <button id="kioskSuccessDoneBtn" style="margin-top: 20px; padding: 8px 24px; background: #000000; color: #ffffff; border: 2px solid #000000; font-weight: 800; font-size: 11px; cursor: pointer; box-shadow: 2px 2px 0 #000;">
                  RETURN TO STATEMENT
                </button>
              </div>
            `;

            content.querySelector('#kioskSuccessDoneBtn').onclick = () => {
              closeModal();
              if (typeof window.fetchLedgerData === 'function') {
                window.fetchLedgerData(token);
              }
            };

          } catch (orderErr) {
            alert('Error submitting order: ' + orderErr.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'CONFIRM & SUBMIT ORDER';
          }
        };
      }

    } catch (err) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
          <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
          <div style="font-size: 14px; font-weight: bold;">Unable to Load Catalog</div>
          <div style="font-size: 11px; margin-top: 4px;">${err.message}</div>
        </div>
      `;
    }
  };
})();
