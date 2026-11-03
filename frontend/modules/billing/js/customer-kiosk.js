// @ts-nocheck
/**
 * Customer Self-Ordering Kiosk Component
 * Powers in-portal wholesale self-ordering, smart reorder predictions,
 * live upsell milestones, auto-applied promo discounts, and instant admin notifications.
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
      box-shadow: 8px 8px 0px rgba(0,0,0,1);
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
        <span style="font-size: 16px;">⚡</span>
        <span>WHOLESALE SELF-ORDERING KIOSK — ${customerName.toUpperCase()}</span>
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
        <div style="font-size: 28px; animation: spin 1s infinite linear;">⚙️</div>
        <div style="margin-top: 12px; font-size: 12px; font-weight: bold;">LOADING WHOLESALE CATALOG & PURCHASE PREDICTIONS...</div>
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

    // Cart state
    let cart = []; // array of { productId, name, rate, qty, variant }
    let appliedPromoPercent = Number(promoDiscountPercent) || 0;
    let appliedPromoCode = promoCode || '';

    // Fetch customer items and catalog
    try {
      const res = await fetch(`/api/billing/public/customer-items/${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error('Could not load order history and catalog');
      const data = await res.json();
      const pastItems = data.items || [];
      const catalog = data.catalog || [];

      // Run shared pattern engine
      let predictions = [];
      if (window.CustomerPatternEngine) {
        predictions = window.CustomerPatternEngine.analyzeProductCadenceAndDepletion(pastItems);
      }

      // Render Kiosk Layout
      content.innerHTML = `
        <div style="display: flex; flex: 1; overflow: hidden; flex-direction: row; flex-wrap: wrap;">
          <!-- Left: Catalog & Suggestions (60%) -->
          <div style="flex: 1 1 480px; padding: 14px; overflow-y: auto; border-right: 1.5px solid #000000; max-height: calc(92vh - 60px);">
            ${appliedPromoPercent > 0 ? `
              <div style="background: #fef3c7; border: 1.5px solid #d97706; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <strong>🏷️ PROMO ACTIVE:</strong> ${promoDescription || `${appliedPromoPercent}% Cash Rebate Applied to Cart`}
                </div>
                <span style="background: #b45309; color: #fff; padding: 1px 6px; font-weight: bold; font-size: 10px;">${appliedPromoCode || 'AUTO'}</span>
              </div>
            ` : ''}

            <!-- Smart Restock Predictions Shelf -->
            <div style="margin-bottom: 18px;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>🎯 PREDICTED RESTOCK NEEDS (BASED ON YOUR CADENCE)</span>
                <span style="font-size: 9px; color: #6b7280; font-weight: normal;">Replenish before stockout</span>
              </div>
              <div id="kioskPredictionsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px;">
                ${predictions.length === 0 ? `
                  <div style="font-size: 11px; color: #6b7280; padding: 10px; border: 1px dashed #d1d5db;">No purchase history yet. Browse full catalog below.</div>
                ` : predictions.slice(0, 6).map(p => `
                  <div style="border: 1px solid #000000; padding: 8px; background: #ffffff; box-shadow: 2px 2px 0 #000000; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                      <div style="font-weight: 700; font-size: 11px; line-height: 1.3;">${p.name}</div>
                      <div style="font-size: 9px; color: #4b5563; margin-top: 2px;">
                        Cycle: <strong>${p.skuCadenceDays}d</strong> • Last: <strong>${p.daysSinceLast}d ago</strong>
                      </div>
                      <div style="font-size: 12px; font-weight: 900; margin-top: 4px; color: #111827;">
                        ${formatCurrency(p.rate)}
                      </div>
                    </div>
                    <button class="kiosk-add-btn" data-id="${p.productId}" data-name="${p.name}" data-rate="${p.rate}" data-qty="${p.avgQtyPerOrder || 1}" style="margin-top: 8px; background: #10b981; color: #ffffff; border: 1px solid #000000; padding: 4px 8px; font-size: 10px; font-weight: 800; cursor: pointer;">
                      + ADD (${p.avgQtyPerOrder || 1} PK)
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Full Catalog Search -->
            <div>
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">
                <span>📦 WHOLESALE CATALOG SEARCH</span>
              </div>
              <input type="text" id="kioskCatalogSearch" placeholder="Search product name or category..." style="width: 100%; box-sizing: border-box; padding: 6px 10px; font-size: 11px; border: 1.5px solid #000000; margin-bottom: 10px; font-family: monospace;">
              <div id="kioskCatalogList" style="display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto;">
                <!-- Catalog items rendered via JS -->
              </div>
            </div>
          </div>

          <!-- Right: Order Cart & Checkout (40%) -->
          <div style="flex: 1 1 320px; padding: 14px; background: #fafafa; display: flex; flex-direction: column; justify-content: space-between; max-height: calc(92vh - 60px);">
            <div>
              <div style="font-size: 12px; font-weight: 800; border-bottom: 2px solid #000000; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between;">
                <span>🛒 ORDER CART (<span id="kioskCartItemCount">0</span>)</span>
                <span id="kioskClearCartBtn" style="font-size: 10px; color: #ef4444; cursor: pointer; text-decoration: underline;">Clear</span>
              </div>

              <!-- Cart items container -->
              <div id="kioskCartItems" style="max-height: 240px; overflow-y: auto; margin-bottom: 12px; font-size: 11px;">
                <div style="text-align: center; padding: 30px 0; color: #6b7280;">Your order cart is empty. Click [+ ADD] to reorder items.</div>
              </div>

              <!-- Live Volume Milestone Upsell Bar -->
              <div id="kioskUpsellMilestone" style="background: #ffffff; border: 1px solid #000000; padding: 8px; margin-bottom: 12px; font-size: 10px;">
                <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px;">
                  <span>BULK VOLUME DISCOUNT:</span>
                  <span id="kioskMilestoneStatus">₹0 / ₹50,000</span>
                </div>
                <div style="width: 100%; height: 6px; background: #e5e7eb; border: 1px solid #000000; overflow: hidden;">
                  <div id="kioskMilestoneBar" style="width: 0%; height: 100%; background: #8b5cf6; transition: width 0.3s ease;"></div>
                </div>
                <div id="kioskMilestonePrompt" style="margin-top: 4px; color: #6b7280; font-size: 9px;">
                  Add ₹50,000 worth of items to unlock an extra 3% Wholesale Volume Rebate!
                </div>
              </div>

              <!-- Order notes -->
              <div style="margin-bottom: 10px;">
                <label style="font-size: 10px; font-weight: 700; display: block; margin-bottom: 2px;">DELIVERY NOTES / SPECIAL REQUESTS:</label>
                <textarea id="kioskOrderNotes" placeholder="e.g. Please dispatch with morning route, urgent delivery..." style="width: 100%; box-sizing: border-box; height: 50px; font-size: 10px; border: 1px solid #000000; padding: 6px; font-family: sans-serif; resize: none;"></textarea>
              </div>
            </div>

            <!-- Totals & Submit -->
            <div style="border-top: 1.5px solid #000000; padding-top: 10px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                <span>Subtotal:</span>
                <span id="kioskSubtotal">₹0.00</span>
              </div>
              <div id="kioskDiscountRow" style="display: none; justify-content: space-between; font-size: 11px; color: #16a34a; margin-bottom: 4px;">
                <span>Promo / Volume Rebate:</span>
                <span id="kioskDiscountAmount">-₹0.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; border-top: 1px dashed #d1d5db; padding-top: 6px; margin-bottom: 10px;">
                <span>GRAND TOTAL:</span>
                <span id="kioskGrandTotal">₹0.00</span>
              </div>
              <button id="kioskSubmitOrderBtn" style="width: 100%; padding: 10px; background: #000000; color: #ffffff; border: 2px solid #000000; font-weight: 900; font-size: 12px; cursor: pointer; box-shadow: 3px 3px 0 #000000; letter-spacing: 0.5px;">
                SUBMIT WHOLESALE ORDER ⚡
              </button>
            </div>
          </div>
        </div>
      `;

      // Render Catalog helper
      function renderCatalog(filterText = '') {
        const list = content.querySelector('#kioskCatalogList');
        if (!list) return;
        const q = filterText.toLowerCase().trim();
        const filtered = catalog.filter(p => !q || p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));

        if (filtered.length === 0) {
          list.innerHTML = `<div style="font-size: 11px; color: #6b7280; padding: 8px;">No products match "${filterText}"</div>`;
          return;
        }

        list.innerHTML = filtered.map(p => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border: 1px solid #e5e7eb; background: #ffffff;">
            <div>
              <div style="font-weight: 700; font-size: 11px;">${p.name}</div>
              <div style="font-size: 9px; color: #6b7280;">${p.category || 'General'} • MRP: ₹${p.mrp || p.price}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 800; font-size: 11px;">${formatCurrency(p.price)}</span>
              <button class="kiosk-add-btn" data-id="${p.id}" data-name="${p.name}" data-rate="${p.price}" data-qty="1" style="background: #ffffff; border: 1px solid #000; padding: 2px 6px; font-size: 10px; cursor: pointer; font-weight: bold;">
                + Add
              </button>
            </div>
          </div>
        `).join('');

        // Wire catalog add buttons
        list.querySelectorAll('.kiosk-add-btn').forEach(btn => {
          btn.onclick = () => addToCart(btn.dataset.id, btn.dataset.name, Number(btn.dataset.rate) || 0, Number(btn.dataset.qty) || 1);
        });
      }

      // Catalog search input
      const searchInput = content.querySelector('#kioskCatalogSearch');
      if (searchInput) {
        searchInput.oninput = () => renderCatalog(searchInput.value);
        renderCatalog();
      }

      // Wire predictions add buttons
      content.querySelectorAll('#kioskPredictionsGrid .kiosk-add-btn').forEach(btn => {
        btn.onclick = () => addToCart(btn.dataset.id, btn.dataset.name, Number(btn.dataset.rate) || 0, Number(btn.dataset.qty) || 1);
      });

      // Cart management functions
      function addToCart(productId, name, rate, qty = 1) {
        const existing = cart.find(i => String(i.productId) === String(productId) || i.name === name);
        if (existing) {
          existing.qty += qty;
        } else {
          cart.push({ productId, name, rate, qty });
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
        const subtotalSpan = content.querySelector('#kioskSubtotal');
        const grandTotalSpan = content.querySelector('#kioskGrandTotal');
        const discountRow = content.querySelector('#kioskDiscountRow');
        const discountAmountSpan = content.querySelector('#kioskDiscountAmount');
        const milestoneBar = content.querySelector('#kioskMilestoneBar');
        const milestoneStatus = content.querySelector('#kioskMilestoneStatus');
        const milestonePrompt = content.querySelector('#kioskMilestonePrompt');

        const totalItemsCount = cart.reduce((acc, i) => acc + i.qty, 0);
        if (countSpan) countSpan.textContent = totalItemsCount;

        if (cart.length === 0) {
          container.innerHTML = `<div style="text-align: center; padding: 30px 0; color: #6b7280;">Your order cart is empty. Click [+ ADD] to reorder items.</div>`;
          subtotalSpan.textContent = '₹0.00';
          grandTotalSpan.textContent = '₹0.00';
          if (discountRow) discountRow.style.display = 'none';
          if (milestoneBar) milestoneBar.style.width = '0%';
          if (milestoneStatus) milestoneStatus.textContent = '₹0 / ₹50,000';
          return;
        }

        let subtotal = 0;
        container.innerHTML = cart.map((item, idx) => {
          const itemTotal = item.qty * item.rate;
          subtotal += itemTotal;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #e5e7eb;">
              <div style="flex: 1; padding-right: 6px;">
                <div style="font-weight: 700; line-height: 1.2;">${item.name}</div>
                <div style="font-size: 9px; color: #6b7280;">${formatCurrency(item.rate)} each</div>
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

        // Calculate discounts (Promo + Volume Threshold)
        let effectiveDiscountPercent = appliedPromoPercent;
        if (subtotal >= 50000) {
          effectiveDiscountPercent = Math.max(effectiveDiscountPercent, 3.0); // 3% wholesale volume rebate
        }

        const discountAmt = (subtotal * effectiveDiscountPercent) / 100;
        const grandTotal = Math.max(0, subtotal - discountAmt);

        subtotalSpan.textContent = formatCurrency(subtotal);
        grandTotalSpan.textContent = formatCurrency(grandTotal);

        if (effectiveDiscountPercent > 0) {
          discountRow.style.display = 'flex';
          discountAmountSpan.textContent = `-${formatCurrency(discountAmt)} (${effectiveDiscountPercent}%)`;
        } else {
          discountRow.style.display = 'none';
        }

        // Update Volume Milestone Bar (Target: 50,000)
        const milestonePercent = Math.min(100, Math.round((subtotal / 50000) * 100));
        if (milestoneBar) milestoneBar.style.width = `${milestonePercent}%`;
        if (milestoneStatus) milestoneStatus.textContent = `${formatCurrency(subtotal)} / ₹50,000`;
        if (milestonePrompt) {
          if (subtotal >= 50000) {
            milestonePrompt.innerHTML = `<strong style="color: #16a34a;">✓ 3% Wholesale Volume Rebate Qualified!</strong>`;
          } else {
            const rem = 50000 - subtotal;
            milestonePrompt.textContent = `Add ${formatCurrency(rem)} more to unlock an extra 3% Wholesale Volume Rebate!`;
          }
        }
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
            alert('Your order cart is empty. Please add items to submit an order.');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'TRANSMITTING ORDER... ⚙️';

          try {
            const notes = content.querySelector('#kioskOrderNotes')?.value || '';
            const subtotal = cart.reduce((acc, i) => acc + (i.qty * i.rate), 0);
            let effectiveDiscountPercent = appliedPromoPercent;
            if (subtotal >= 50000) effectiveDiscountPercent = Math.max(effectiveDiscountPercent, 3.0);
            const discountAmt = (subtotal * effectiveDiscountPercent) / 100;

            const payload = {
              token,
              items: cart,
              notes,
              promoCode: appliedPromoCode,
              promoDiscount: discountAmt
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

            // Render success screen
            content.innerHTML = `
              <div style="text-align: center; padding: 40px 20px;">
                <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
                <div style="font-size: 18px; font-weight: 900; margin-bottom: 8px;">ORDER SUBMITTED SUCCESSFULLY!</div>
                <div style="font-size: 13px; color: #4b5563; margin-bottom: 16px;">
                  Order Reference: <strong>${resData.orderNumber}</strong> • Amount: <strong>${formatCurrency(resData.totalAmount)}</strong>
                </div>
                <div style="max-width: 480px; margin: 0 auto; background: #ecfdf5; border: 1.5px solid #10b981; padding: 14px; font-size: 11px; color: #065f46; line-height: 1.5; text-align: left;">
                  ✓ Your order has been placed directly into the dispatch queue.<br>
                  ✓ The store owner has received an instant email notification with your order details.<br>
                  ✓ The order will be packed and invoiced under your customer account.
                </div>
                <button id="kioskSuccessDoneBtn" style="margin-top: 24px; padding: 8px 24px; background: #000000; color: #ffffff; border: 2px solid #000000; font-weight: 800; cursor: pointer; box-shadow: 3px 3px 0 #000;">
                  RETURN TO STATEMENT
                </button>
              </div>
            `;

            content.querySelector('#kioskSuccessDoneBtn').onclick = closeModal;

          } catch (orderErr) {
            alert('Error submitting order: ' + orderErr.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'SUBMIT WHOLESALE ORDER ⚡';
          }
        };
      }

    } catch (err) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #ef4444;">
          <div style="font-size: 24px; margin-bottom: 8px;">⚠️</div>
          <div style="font-size: 14px; font-weight: bold;">Unable to Load Kiosk Catalog</div>
          <div style="font-size: 11px; margin-top: 4px;">${err.message}</div>
        </div>
      `;
    }
  };
})();

