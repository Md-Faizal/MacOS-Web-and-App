const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:Orders') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/* 3-Stage Order Management System
   
   WORKFLOW:
   1. SIDEBAR: Shows all customers with search
   2. CLICK CUSTOMER: Shows their order history + "New Order" button
   3. CLICK "NEW ORDER": Opens form to add products, view recommendations, add notes, complete
   4. STAGE 1: Create order list (product search, recommendations, notes)
   5. STAGE 2: QC & receive items (checklist, received quantities, notes)
   6. STAGE 3: Delivery & billing (delivery date, bill reference)
*/

const ORDER_CONSTANTS = {
  STAGES: {
    CREATE: 'stage1',
    QC: 'stage2',
    DELIVERY: 'stage3'
  },
  STATUS: {
    PENDING: 'pending',
    COMPLETE: 'complete'
  }
};

const Utils = {
  debounce: (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  },
  formatDate: (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  },
  formatMonthYear: (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric'
    }).format(date).toUpperCase();
  }
};

class OrdersView {
    // Track selected orders for multi-select
    selectedOrderIds = new Set();

    isWorkerUser() {
      const role = window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role');
      return role === 'worker';
    }

    isExcluded(contact) {
      if (!contact) return false;
      return contact.exclude_from_stats === 1 || contact.exclude_from_stats === '1' || contact.exclude_from_stats === true;
    }

    toggleOrderSelection(orderId) {
      if (!this.selectedOrderIds) this.selectedOrderIds = new Set();
      if (this.selectedOrderIds.has(orderId)) {
        this.selectedOrderIds.delete(orderId);
      } else {
        this.selectedOrderIds.add(orderId);
      }
      this.updateMultiSelectUI();
    }

    // Utility: Clear selection and update UI
    clearOrderSelection() {
        this.selectedOrderIds = new Set();
        this.updateMultiSelectUI();
    }

    // Utility: Remove deleted order from selection
    removeOrderFromSelection(orderId) {
        if (this.selectedOrderIds.has(orderId)) {
            this.selectedOrderIds.delete(orderId);
            this.updateMultiSelectUI();
        }
    }

    updateMultiSelectUI() {
      // Show/hide View button, update checkboxes only
      const viewBtn = document.getElementById('multiOrderViewBtn');
      const newOrderBtn = document.getElementById('newOrderBtn');
      // In customer view, if more than 1 order, show both buttons side by side if 2+ selected
      const inCustomerView = !!this.selectedCustomerId && this.customerViewOrders && this.customerViewOrders.length > 1;
      if (this.selectedOrderIds.size >= 2) {
        if (viewBtn) {
          viewBtn.style.display = '';
        }
        if (newOrderBtn) {
          newOrderBtn.style.display = '';
        }
      } else {
        if (viewBtn) viewBtn.style.display = 'none';
        // Always show newOrderBtn in both views now
        if (newOrderBtn) newOrderBtn.style.display = '';
      }
      // Update checkboxes' checked state in DOM
      document.querySelectorAll('.order-multiselect-checkbox').forEach(cb => {
        const oid = cb.getAttribute('data-order-id');
        cb.checked = this.selectedOrderIds.has(oid);
      });
      // UI feedback: Disable/hide View Selected button if fewer than two orders selected
      if (viewBtn) {
        viewBtn.disabled = this.selectedOrderIds.size < 2;
        viewBtn.style.display = this.selectedOrderIds.size < 2 ? 'none' : '';
      }
    }

    // Show condensed view for selected orders
    showCustomerSelectionModal() {
    let modalHTML = `
      <div style="padding: 24px; max-width: 500px; width: 90%; background: #ffffff; border-radius: 4px; box-shadow: 0 20px 25px rgba(0,0,0,0.15);">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px; border-bottom: 2px solid #000000; padding-bottom: 12px;">SELECT CUSTOMER</h2>
        
        <div style="margin-bottom: 20px;">
          <input type="text" id="modalCustomerSearch" placeholder="Search customers..." style="width: 100%; padding: 12px; border: 1.5px solid #000000; border-radius: 2px; font-size: 13px; font-family: 'Courier New', monospace; outline: none;" />
        </div>
        
        <div id="modalCustomerList" style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;" class="hide-scrollbar">
          <!-- Customers will be rendered here -->
        </div>
        
        <div style="display: flex; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eeeeee;">
          <button id="closeCustomerModal" style="padding: 10px 20px; background: #ffffff; color: #000000; border: 2px solid #000000; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">CANCEL</button>
        </div>
      </div>
    `;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'customerSelectionModal';
    modalOverlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 2500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    modalOverlay.innerHTML = modalHTML;
    this.viewContainer.appendChild(modalOverlay);

    const searchInput = modalOverlay.querySelector('#modalCustomerSearch');
    const listContainer = modalOverlay.querySelector('#modalCustomerList');
    const closeBtn = modalOverlay.querySelector('#closeCustomerModal');

    const renderModalList = (filter = '') => {
      const filtered = this.customers.filter(c => 
        c.name.toLowerCase().includes(filter.toLowerCase())
      ).sort((a,b) => a.name.localeCompare(b.name));

      if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 12px; font-family: \'Courier New\', monospace;">No customers found</div>';
        return;
      }

      listContainer.innerHTML = filtered.map(c => `
        <div class="modal-customer-card" data-id="${c.id}" data-name="${c.name}" style="padding: 12px 16px; border: 1.5px solid #eeeeee; border-radius: 3px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; background: #fafafa;">
          <div style="font-weight: 700; color: #000000; font-size: 13px; font-family: 'Courier New', monospace;">${c.name}</div>
          <div style="font-size: 10px; color: #0066cc; font-weight: 700;">SELECT →</div>
        </div>
      `).join('');

      listContainer.querySelectorAll('.modal-customer-card').forEach(card => {
        card.addEventListener('mouseover', () => {
          card.style.borderColor = '#000000';
          card.style.background = '#ffffff';
        });
        card.addEventListener('mouseout', () => {
          card.style.borderColor = '#eeeeee';
          card.style.background = '#fafafa';
        });
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          const name = card.dataset.name;
          modalOverlay.remove();
          this.createNewOrder(id, name);
        });
      });
    };

    renderModalList();

    searchInput.addEventListener('input', (e) => renderModalList(e.target.value));
    searchInput.focus();

    closeBtn.onclick = () => modalOverlay.remove();
    modalOverlay.onclick = (e) => { if(e.target === modalOverlay) modalOverlay.remove(); };
  }

  async showCondensedOrdersView() {
      const selectedOrderIds = Array.from(this.selectedOrderIds);
      if (selectedOrderIds.length < 2) return;
      // Fetch all selected orders' full data
      const orders = [];
      for (const orderId of selectedOrderIds) {
        try {
          const res = await fetch(`/api/billing/orders/${orderId}`);
          if (res.ok) {
            const order = await res.json();
            // Normalize items
            const items = (order.items || []).map(item => {
              const product = this.products.find(p => p.id === item.product_id);
              return {
                ...item,
                qty: item.quantity || item.qty,
                quantity: item.quantity || item.qty,
                price: item.unit_price || item.price,
                unit_price: item.unit_price || item.price,
                product_name: product?.name || item.product_name || `Product ${item.product_id}`,
                received_quantity: (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : (item.received_qty || 0),
                pack_size_value: item.pack_size_value || '',
                pack_size_type: item.pack_size_type || ''
              };
            });
            orders.push({ ...order, items });
          }
        } catch (e) {
          // skip failed fetches
        }
      }
      if (orders.length === 0) return;

      // Consolidate all items by product+variant
      const consolidated = {};
      for (const order of orders) {
        for (const item of order.items) {
          const key = `${item.product_id || item.product_name}__${item.pack_size_value || ''}__${item.pack_size_type || ''}__${item.batch_no || ''}`;
          if (!consolidated[key]) {
            consolidated[key] = {
              product_id: item.product_id,
              product_name: item.product_name,
              pack_size_value: item.pack_size_value || '',
              pack_size_type: item.pack_size_type || '',
              batch_no: item.batch_no || '',
              qty: 0
            };
          }
          consolidated[key].qty += Number(item.qty || item.quantity || 0);
        }
      }
      const consolidatedList = Object.values(consolidated);

      this.selectedOrderIds = new Set();
      this.updateMultiSelectUI();

      // Build formatted text for copy button
      const headerLine = 'PRODUCT NAME--VARIANT--QTY';
      const contentLines = consolidatedList.map((item, idx) => {
        const variant = `${item.pack_size_value} ${item.pack_size_type}`.trim();
        const label = `${idx + 1}.${item.product_name}`;
        return label + '--' + variant + '--' + item.qty;
      });
      const formattedLines = [headerLine, ...contentLines];
      const formattedItems = formattedLines.join('\n');
      const escapedItems = formattedItems.replace(/'/g, "\\'").replace(/\n/g, '\\n');

      // Build HTML for all individual orders
      let individualOrdersHtml = '';
      orders.forEach((order, oidx) => {
        const orderNumber = this.generateOrderNumber(order, new Date(order.order_date || order.created_at));
        const customerName = order.customer_name || this.customers.find(c => c.id === order.customer_id)?.name || 'Unknown';
        const items = order.items || [];
        // Copy text for this order
        const headerLine = 'PRODUCT NAME--QTY';
        const contentLines = items.map((item, idx) => {
          const variantInfo = item.pack_size_value ? ` ${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
          const label = `${idx + 1}.${item.product_name.trim()}${variantInfo ? ' ' + variantInfo : ''}`;
          return label + '--' + (item.qty || item.quantity || 0);
        });
        const formattedLines = [headerLine, ...contentLines];
        const formattedItems = formattedLines.join('\\n');
        const escapedItems = formattedItems.replace(/'/g, "\\'").replace(/\n/g, '\\n');
        individualOrdersHtml += `<div class="order-modal-card" style="margin-bottom: 28px; background: #fff; border-radius: 4px; box-shadow: 0 4px 24px #0001; border: 1.5px solid #e0e0e0;">`;
        individualOrdersHtml += `<div style="padding: 24px;">`;
        individualOrdersHtml += `<h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${orderNumber}</h2>`;
        individualOrdersHtml += `<p style="margin: 0 0 20px 0; font-size: 12px; color: #666666; font-weight: 500;">Customer: ${customerName} | Date: ${order.order_date ? new Date(order.order_date).toLocaleDateString() : ''}</p>`;
        individualOrdersHtml += `<h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #000000; padding-bottom: 8px;">📋 ORDERED ITEMS</h3>`;
        individualOrdersHtml += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">`;
        if (items.length === 0) {
          individualOrdersHtml += '<div style="padding: 20px; text-align: center; color: #999999; font-size: 12px; font-family: Courier New, monospace;">No items in this order</div>';
        } else {
          items.forEach((item, idx) => {
            const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
            const batchDisplay = item.batch_no || 'N/A';
            individualOrdersHtml += `
              <div style="padding: 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 3px; font-family: 'Courier New', monospace;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                  <div>
                    <div style="font-weight: 700; color: #000000; font-size: 12px;">${item.product_name}</div>
                    ${variantDisplay ? `<div style="font-size: 9px; color: #0066cc; margin-top: 2px;">Variant: ${variantDisplay}</div>` : ''}
                    <div style="font-size: 9px; color: #666666; margin-top: 2px;">Batch: ${batchDisplay}</div>
                  </div>
                  <div style="font-weight: 700; color: #000000;">Qty: ${item.qty || item.quantity || 0}</div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666666;">
                  <span>Unit Price: ₹${(item.unit_price || item.price || 0).toFixed(2)}</span>
                  <span>Total: ₹${((item.unit_price || item.price || 0) * (item.qty || item.quantity || 0)).toFixed(2)}</span>
                </div>
              </div>
            `;
          });
        }
        individualOrdersHtml += `</div>`;
        if (order.order_notes) {
          individualOrdersHtml += `<div style="padding: 12px; background: #f0f8ff; border: 1px solid #1e40af; border-radius: 3px; margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 600; color: #1e40af; margin-bottom: 6px;">📝 ORDER NOTES</div>
            <div style="font-size: 11px; color: #333333; font-family: 'Courier New', monospace;">${order.order_notes}</div>
          </div>`;
        }
        individualOrdersHtml += `<div style="display: flex; justify-content: flex-end; gap: 8px;">`;
        individualOrdersHtml += `<button onclick="navigator.clipboard.writeText('${escapedItems}').then(() => alert('Items copied to clipboard!')).catch(() => alert('Failed to copy'))" style="padding: 8px 16px; background: #0066cc; color: #ffffff; border: 2px solid #0066cc; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">📋 COPY ITEMS</button>`;
        individualOrdersHtml += `</div>`;
        individualOrdersHtml += `</div></div>`;
      });

      // Build modal content (individual orders + consolidated)
      let content = '';
      content += `<div style="padding: 24px; max-width: 700px;">`;
      content += `<h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">Selected Orders & Consolidated List</h2>`;
      content += `<p style="margin: 0 0 20px 0; font-size: 12px; color: #666666; font-weight: 500;">${orders.length} selected orders</p>`;
      content += `<div style="margin-bottom: 32px;">${individualOrdersHtml}</div>`;
      content += `<h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #000000; padding-bottom: 8px;">📋 CONSOLIDATED ITEMS</h3>`;
      content += `<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">`;
      if (consolidatedList.length === 0) {
          content += '<div style="padding: 20px; text-align: center; color: #999999; font-size: 12px; font-family: Courier New, monospace;">No products found in selected orders.</div>';
      } else {
        content += `<table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="text-align:left;padding:6px 8px;">Product</th>
              <th style="text-align:left;padding:6px 8px;">Variant</th>
              <th style="text-align:right;padding:6px 8px;">Total Qty</th>
            </tr>
          </thead>
          <tbody>${consolidatedList.map(item => `<tr><td style="padding:6px 8px;">${item.product_name}</td><td style="padding:6px 8px; color: #0066cc; font-size: 9px;">${item.pack_size_value} ${item.pack_size_type}</td><td style="padding:6px 8px;text-align:right;">${item.qty}</td></tr>`).join('')}</tbody>
        </table>`;
      }
      content += `</div>`;
      content += `<div style="display: flex; justify-content: flex-end; gap: 8px;">`;
      content += `<button onclick="navigator.clipboard.writeText('${escapedItems}').then(() => alert('Items copied to clipboard!')).catch(() => alert('Failed to copy'))" style="padding: 8px 16px; background: #0066cc; color: #ffffff; border: 2px solid #0066cc; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">📋 COPY ITEMS</button>`;
      content += `<button onclick="document.getElementById('orderModal').remove(); void 0;" style="padding: 8px 16px; background: #ffffff; color: #000000; border: 2px solid #000000; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">CLOSE</button>`;
      content += `</div>`;
      content += `</div>`;

      // Create and show modal inside the app (like showOrderModal)
      const modal = document.createElement('div');
      modal.id = 'orderModal';
      modal.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
      `;
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: #ffffff;
        border-radius: 4px;
        max-width: 700px;
        width: 90%;
        max-height: 90%;
        overflow-y: auto;
        box-shadow: 0 20px 25px rgba(0,0,0,0.15);
      `;
      modalContent.innerHTML = content;
      modal.appendChild(modalContent);
      this.viewContainer.appendChild(modal);
      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }

    // Helper to get the same HTML as showOrderModal (for a single order)
    _getOrderModalContent(order) {
      // Copy the logic from showOrderModal, but return the HTML string instead of showing a modal
      const stage = order.current_stage || 'stage1';
      const items = order.items || [];
      const customerName = order.customer_name || this.customers.find(c => c.id === order.customer_id)?.name || 'Unknown';
      const orderDate = new Date(order.order_date || order.created_at);
      const orderNumber = this.generateOrderNumber(order, orderDate);
      let content = '';
      if (stage === 'stage2' || stage === 'stage1') {
        const headerLine = 'PRODUCT NAME--QTY';
        const contentLines = items.map((item, idx) => {
          const variantInfo = item.pack_size_value ? ` ${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
          const label = `${idx + 1}.${item.product_name.trim()}${variantInfo ? ' ' + variantInfo : ''}`;
          return label + '--' + (item.qty || item.quantity || 0);
        });
        const formattedLines = [headerLine, ...contentLines];
        const formattedItems = formattedLines.join('\n');
        const escapedItems = formattedItems.replace(/'/g, "\\'").replace(/\n/g, '\\n');
        content = `
      <div style="padding: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${orderNumber}</h2>
        <p style="margin: 0 0 20px 0; font-size: 12px; color: #666666; font-weight: 500;">Customer: ${customerName} | Date: ${orderDate.toLocaleDateString()}</p>
        <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #000000; padding-bottom: 8px;">📋 ORDERED ITEMS</h3>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
          ${items.length === 0 ?
            '<div style="padding: 20px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">No items in this order</div>' :
            items.map((item, idx) => {
              const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
              const batchDisplay = item.batch_no || 'N/A';
              return `
              <div style="padding: 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 3px; font-family: 'Courier New', monospace;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                  <div>
                    <div style="font-weight: 700; color: #000000; font-size: 12px;">${item.product_name}</div>
                    ${variantDisplay ? `<div style="font-size: 9px; color: #0066cc; margin-top: 2px;">Variant: ${variantDisplay}</div>` : ''}
                    <div style="font-size: 9px; color: #666666; margin-top: 2px;">Batch: ${batchDisplay}</div>
                  </div>
                  <div style="font-weight: 700; color: #000000;">Qty: ${item.qty || item.quantity || 0}</div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666666;">
                  <span>Unit Price: ₹${(item.unit_price || item.price || 0).toFixed(2)}</span>
                  <span>Total: ₹${((item.unit_price || item.price || 0) * (item.qty || item.quantity || 0)).toFixed(2)}</span>
                </div>
              </div>
            `;
            }).join('')
          }
        </div>
        ${order.order_notes ? `\n          <div style="padding: 12px; background: #f0f8ff; border: 1px solid #1e40af; border-radius: 3px; margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 600; color: #1e40af; margin-bottom: 6px;">📝 ORDER NOTES</div>
            <div style="font-size: 11px; color: #333333; font-family: 'Courier New', monospace;">${order.order_notes}</div>
          </div>\n        ` : ''}
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="navigator.clipboard.writeText('${escapedItems}').then(() => alert('Items copied to clipboard!')).catch(() => alert('Failed to copy'))" style="padding: 8px 16px; background: #0066cc; color: #ffffff; border: 2px solid #0066cc; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">📋 COPY ITEMS</button>
        </div>
      </div>
    `;
      } else if (stage === 'stage3' || order.status === 'complete') {
        // Show Stage 3 info (received items, QC, delivery)
        const receivedItems = items.filter(i => (i.received_quantity || i.received_qty || 0) >= 1);
        const notReceivedItems = items.filter(i => (i.received_quantity || i.received_qty || 0) < 1);
        const fullSubtotal = items.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.qty || i.quantity || 0)), 0);
        const grandTotal = receivedItems.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.received_quantity || i.received_qty || 0)), 0);
        const notReceivedTotal = fullSubtotal - grandTotal;

        content = `
          <div style="padding:24px;">
            <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${orderNumber}</h2>
            <p style="margin: 0 0 20px 0; font-size: 12px; color: #666666; font-weight: 500;">Customer: ${customerName} | Date: ${orderDate.toLocaleDateString()}</p>
            
            <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #000000; padding-bottom: 8px;">📦 ITEMS RECEIVED</h3>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; min-height: 150px;">
              ${receivedItems.length === 0 ? 
                '<div style="padding: 12px; text-align: center; color: #999; font-size: 11px; font-family: Courier New, monospace;">No items received</div>' :
                receivedItems.map(item => {
                  const rec = item.received_quantity || item.received_qty || 0;
                  const price = item.unit_price || item.price || 0;
                  return `
                    <div style="padding: 10px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 3px; font-family: 'Courier New', monospace;">
                      <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                          <div style="font-weight: 700; font-size: 12px;">${item.product_name}</div>
                          <div style="font-size: 9px; color: #666;">Batch: ${item.batch_no || 'N/A'}</div>
                        </div>
                        <div style="font-weight: 700;">Qty: ${rec}</div>
                      </div>
                      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px;">
                        <span>₹${price.toFixed(2)}</span>
                        <span>₹${(price * rec).toFixed(2)}</span>
                      </div>
                    </div>
                  `;
                }).join('')
              }
            </div>

            ${notReceivedItems.length > 0 ? `
              <h3 style="margin: 24px 0 12px 0; font-size: 13px; font-weight: 900; color: #666666; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 2px solid #eeeeee; padding-bottom: 8px;">🚫 ITEMS NOT RECEIVED</h3>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; opacity: 0.7; min-height: 150px;">
                ${notReceivedItems.map(item => {
                  const qty = item.qty || item.quantity || 0;
                  const price = item.unit_price || item.price || 0;
                  const variantDisplay = item.pack_size_value ? `${item.pack_size_value}${item.pack_size_type || ''}` : '';
                  return `
                    <div style="padding: 10px; background: #fff; border: 1px solid #eee; border-radius: 3px; font-family: 'Courier New', monospace;">
                      <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                          <div style="font-weight: 700; font-size: 12px; color: #888;">${item.product_name}</div>
                          <div style="font-size: 9px; color: #aaa;">Batch: ${item.batch_no || 'N/A'}</div>
                          ${variantDisplay ? `<div style="font-size: 9px; color: #aaa;">Variant: ${variantDisplay}</div>` : ''}
                        </div>
                        <div style="font-weight: 700; color: #888;">Qty: ${qty} / 0</div>
                      </div>
                      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; color: #aaa;">
                        <span>₹${price.toFixed(2)}</span>
                        <span>₹0.00</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <div style="background:#f9f9f9; padding:16px; border-radius:3px; margin-top:20px; border: 1px solid #eee;">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:11px; color: #666;">
                <span>SUBTOTAL (ORDERED):</span>
                <span>₹${fullSubtotal.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:11px; color: #c00;">
                <span>- NOT RECEIVED:</span>
                <span>₹${notReceivedTotal.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:2px solid #000; font-weight: 900; font-size: 14px; color: #000;">
                <span>GRAND TOTAL:</span>
                <span>₹${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        `;
      }
      return content;
    }
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.viewContainer = billingApp.viewContainer;
    this.billingData = billingApp.billingData || {};
    this.customers = [];
    this.products = [];
    this.orders = [];
    this.currentOrderData = null;
    this.currentOrderId = null;
    this.selectedCustomerId = null;
    this.currentStage = null;
    this.suppressionDays = 0;
    this.stageSequence = ['stage1', 'stage2', 'stage3'];
    this.ordersColumnMode = 'both';
    this.injectOrdersStyles();
    
    // Polling and sync state
    this.pollingInterval = null;
    this.newlyAddedIds = [];
    this.updatedIds = [];
    
    // Invoice Dropdown State (Stage 3)
    this.allCustomerInvoices = [];
    this.invoiceSelectedIndex = -1;
    this.isInvoiceDropdownOpen = false;
  }

  startPolling(interval = 5000) {
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
      
      // Don't sync if user is currently in a complex edit session (Stage 1 form open)
      if (this.currentOrderData && this.currentStage === 'stage1' && !isManual) {
        return;
      }

      const res = await fetch('/api/billing/orders');
      if (!res.ok) return;
      
      const data = await res.json();
      const newOrders = Array.isArray(data) ? data : (data.data || []);
      
      this.syncOrders(newOrders, isManual);
    } catch (e) {
      log.warn('Sync failed:', e);
    }
  }

  syncOrders(newOrders, isImmediate = false) {
    // Guard: Ensure we have DOM elements to update
    if (!document.getElementById('ordersMainTitle')) return;

    // 1. Detect changes using a quick snapshot
    const oldSnapshot = JSON.stringify(this.orders.map(o => ({ id: o.id, s: o.status, st: o.current_stage, u: o.updated_at })));
    const newSnapshot = JSON.stringify(newOrders.map(o => ({ id: o.id, s: o.status, st: o.current_stage, u: o.updated_at })));
    
    if (oldSnapshot === newSnapshot && !isImmediate) return;

    // 2. Identify what changed for animations
    const oldIds = new Set(this.orders.map(o => String(o.id)));
    
    this.newlyAddedIds = newOrders.filter(o => !oldIds.has(String(o.id))).map(o => String(o.id));
    this.updatedIds = newOrders.filter(o => {
      const old = this.orders.find(oo => String(oo.id) === String(o.id));
      return old && (old.status !== o.status || old.current_stage !== o.current_stage || old.updated_at !== o.updated_at);
    }).map(o => String(o.id));

    // 3. Update orders data
    this.orders = newOrders;
    
    // 4. Update UI
    this.updateStats();
    if (this.selectedCustomerId) {
      this.showCustomerOrders(this.selectedCustomerId, null, true);
    } else {
      this.showAllCustomersView(true);
    }
    this.renderCustomersList();
    
    // Always rerender order cards
    this.rerenderOrderCards();
    
    // 5. Apply animations
    setTimeout(() => this.applySyncAnimations(), 50);
  }

  applySyncAnimations() {
    // Animate new cards
    if (this.newlyAddedIds?.length) {
      this.newlyAddedIds.forEach(id => {
        const el = document.querySelector(`[data-order-id="${id}"]`);
        if (el) {
          el.classList.add('animate-fade-in', 'highlight-new');
          setTimeout(() => el.classList.remove('highlight-new'), 3000);
        }
      });
    }
    
    // Animate updated cards
    if (this.updatedIds?.length) {
      this.updatedIds.forEach(id => {
        const el = document.querySelector(`[data-order-id="${id}"]`);
        if (el) {
          el.classList.add('animate-pulse-green', 'highlight-updated');
          setTimeout(() => el.classList.remove('highlight-updated'), 3000);
        }
      });
    }
    
    // Animate stats change
    document.querySelectorAll('.orders-stat-value').forEach(el => {
      el.classList.remove('animate-stat-change');
      void el.offsetWidth; // trigger reflow
      el.classList.add('animate-stat-change');
    });
  }

  showNotification(message, type = 'info') {
    const id = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.remove();
    }, 4000);
  }

  showConfirm(title, message) {
    return confirm(`${title}\n\n${message}`);
  }

  async render() {
    if (!document.querySelector('link[href*="new-order.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/modules/billing/css/new-order.css';
      // document.head.appendChild(link); /* Disabled for Vite */
    }
    
    await this.loadCustomersAndProducts();
    await this.loadOrders();
    
    // Calculate stats
    const totalOrders = this.orders.length;
    const pendingOrders = this.orders.filter(o => o.status !== 'complete').length;
    const completedOrders = this.orders.filter(o => o.status === 'complete').length;
    const totalItems = this.orders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    
    this.viewContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;">
        <!-- Combined Top Header with Stats (spans full width) -->
        <div style="padding: 24px 20px; border-bottom: 2px solid #1a1a1a; background: #0a0a0a; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 68px;">
          <div style="font-size: 13px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1.2px; white-space: nowrap;">
            ◆ ORDERS <span style="color: #666666; font-size: 11px;">|</span> <span style="font-size: 10px; color: #888888; text-transform: uppercase; font-weight: 500; letter-spacing: 0.8px;">MANAGEMENT</span>
          </div>
          
          <!-- Stats -->
          <div style="display: flex; gap: 12px; font-size: 10px; color: #aaaaaa;">
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">TOTAL ORDERS</div><span id="ordersTotal" style="color: #ffffff; font-weight: 700; font-size: 12px;">${totalOrders}</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">PENDING</div><span id="ordersPending" style="color: #ffffff; font-weight: 700; font-size: 12px;">${pendingOrders}</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">COMPLETED</div><span id="ordersCompleted" style="color: #ffffff; font-weight: 700; font-size: 12px;">${completedOrders}</span></div>
            <div style="padding: 8px 12px; border: 1px solid #333333; text-align: center;"><div style="font-size: 10px; margin-bottom: 4px;">TOTAL ITEMS</div><span id="ordersTotalItems" style="color: #ffffff; font-weight: 700; font-size: 12px;">${totalItems}</span></div>
          </div>
          
          <!-- Controls -->
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="ordersListBtn" style="padding: 8px 12px; font-size: 11px; font-weight: 700; border: 1px solid #555555; background: transparent; color: #ffffff; cursor: pointer; border-radius: 2px; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 6px;">☰ LIST</button>
            <select id="ordersDateFilter" style="padding: 6px 10px; font-size: 11px; border: 1px solid #555555; background: #1a1a1a; color: #aaaaaa; cursor: pointer; border-radius: 2px; font-family: 'Courier New', monospace; font-weight: 600;">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="this-week">This Week</option>
              <option value="this-month">This Month</option>
              <option value="last-3">Last 3 Months</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>

        <!-- Flex container for sidebar and main -->
        <div style="display: flex; flex: 1; overflow: hidden;">
          <!-- SIDEBAR: Customer Navigation -->
          <div id="ordersListPanel" style="width: 340px; flex-shrink: 0; background: #000000; display: flex; flex-direction: column; overflow: hidden; border-right: 2px solid #1a1a1a; transition: width 0.3s ease, opacity 0.3s ease;">

          <!-- Search & Controls -->
          <div id="ordersSidebarControls" class="orders-sidebar-controls" style="padding: 16px; border-bottom: 2px solid #1a1a1a; background: #0a0a0a;">
            <input id="customerSearch" type="text" placeholder="Search..." style="width: 100%; padding: 10px 12px; font-size: 12px; border: 1px solid #333333; border-radius: 3px; background: #1a1a1a; color: #ffffff; margin-bottom: 10px; font-family: 'Courier New', monospace;" />
            <select id="customerSort" style="width: 100%; padding: 10px 12px; font-size: 11px; border: 1px solid #333333; border-radius: 3px; background: #1a1a1a; color: #aaaaaa; font-family: 'Courier New', monospace;">
              <option value="name-asc">━ Name (A-Z)</option>
              <option value="name-desc">━ Name (Z-A)</option>
              <option value="recent">━ Most Recent</option>
            </select>
          </div>

          <!-- Customer List -->
          <div id="customersList" style="flex: 1; overflow-y: auto; padding: 4px; background: #000000; display: flex; flex-direction: column;"></div>
        </div>

        <!-- MAIN WORKSPACE: Orders Management -->
        <div id="mainContent" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #ffffff;">
          <!-- Header Section -->
          <div style="padding: 24px 32px; background: #ffffff; border-bottom: 2px solid #000000; flex-shrink: 0;">
            <h1 id="ordersMainTitle" style="margin: 0 0 4px 0; font-size: 28px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">All Customers</h1>
            <p id="ordersMainMetrics" style="margin: 0; font-size: 12px; color: #666666; font-weight: 500;">Total Orders: 0 | Pending: 0 | Completed: 0 | Items: 0</p>
          </div>

          <!-- Filter & View Controls -->
          <div class="orders-filter-controls" style="padding: 6px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
            <button id="ordersStage2Btn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">STAGE 2</button>
            <button id="ordersStage3Btn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">STAGE 3</button>
            <div class="orders-spacer-inline" style="flex: 1;"></div>
            <button id="multiOrderViewBtn" class="orders-view-selected-btn" style="font-size: 11px; padding: 6px 10px; background: #000000; color: #ffffff; border: 2px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 700; display: none;"><span class="orders-btn-desktop-text">◆ VIEW SELECTED</span><span class="orders-btn-mobile-text" style="display: none;">◆ VIEW</span></button>
            <button id="newOrderBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; display: none; border-radius: 2px; transition: all 0.2s;">+ NEW ORDER</button>
          </div>

          <!-- Columns Workspace -->
          <div class="orders-columns-container" style="flex: 1; display: flex; gap: 20px; overflow: hidden; padding: 20px 32px;">
            <!-- Pending Orders Column -->
            <div class="orders-pending-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
                <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">PENDING</h3>
                <span id="ordersPendingCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
              </div>
              <div id="ordersPendingContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0; gap: 8px;">
                <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">Loading...</div>
              </div>
            </div>

            <!-- Completed Orders Column -->
            <div class="orders-completed-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
                <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">COMPLETED</h3>
                <span id="ordersCompletedCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
              </div>
              <div id="ordersCompletedContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0; gap: 8px;">
                <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">Loading...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    await this.setupUI();
    this.bindEvents();
    this.setupListButtonToggle();
    this.setupDateFilter();
    this.showAllCustomersView();
    this.renderCustomersList();
    // Setup multi-select view button event
    setTimeout(() => {
      const viewBtn = document.getElementById('multiOrderViewBtn');
      if (viewBtn) viewBtn.onclick = () => this.showCondensedOrdersView();
    }, 0);
    window.currentOrdersView = this;
  }

  updateAllOrdersContainers(pendingOrders, completedOrders, inCustomerView = false) {
    const pendingContainer = document.getElementById('ordersPendingContainer');
    const completedContainer = document.getElementById('ordersCompletedContainer');

    const pendingCount = pendingOrders.length;
    const completedCount = completedOrders.length;

    if (document.getElementById('ordersPendingCount')) {
      document.getElementById('ordersPendingCount').textContent = `(${pendingCount})`;
    }
    if (document.getElementById('ordersCompletedCount')) {
      document.getElementById('ordersCompletedCount').textContent = `(${completedCount})`;
    }

    if (pendingContainer) {
      if (pendingCount === 0) {
        pendingContainer.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">━━━ NO PENDING ━━━</div>';
      } else {
        pendingContainer.innerHTML = this.renderOrdersGroupedByMonth(pendingOrders, inCustomerView, 'pending-');
      }
    }

    if (completedContainer) {
      if (completedCount === 0) {
        completedContainer.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px; font-family: \'Courier New\', monospace;">━━━ NO COMPLETED ━━━</div>';
      } else {
        completedContainer.innerHTML = this.renderOrdersGroupedByMonth(completedOrders, inCustomerView, 'completed-');
      }
    }

    this.attachOrderRecordListeners();
  }

  async showAllCustomersView(skipRefresh = false) {
      this.clearOrderSelection();
      this.updateMultiSelectUI();
    this.selectedCustomerId = null;
    this.currentStageFilter = null;
    this.currentCustomerViewStageFilter = null;
    this.customerViewOrders = null;
    this.selectedOrderIds = new Set();
    this.updateMultiSelectUI();

    const excludedCustomerIds = new Set(
      (this.customers || []).filter(c => this.isExcluded(c)).map(c => String(c.id))
    );
    const statsOrders = this.orders.filter(o => !excludedCustomerIds.has(String(o.customer_id)));
    const totalOrders = statsOrders.length;
    const totalItems = statsOrders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    const pendingOrders = this.orders.filter(o => o.status !== 'complete');
    const completedOrders = this.orders.filter(o => o.status === 'complete');
    const pendingCount = statsOrders.filter(o => o.status !== 'complete').length;
    const completedCount = statsOrders.filter(o => o.status === 'complete').length;

    // Update header
    const titleEl = document.getElementById('ordersMainTitle');
    if (titleEl) titleEl.textContent = 'All Customers';
    const metricsEl = document.getElementById('ordersMainMetrics');
    if (metricsEl) metricsEl.textContent = `Total Orders: ${totalOrders} | Pending: ${pendingCount} | Completed: ${completedCount} | Items: ${totalItems}`;

    // Update all columns (pending, completed, and mobile unified stream)
    this.updateAllOrdersContainers(pendingOrders, completedOrders, false);

    // Update button states via multi-select UI logic
    this.updateMultiSelectUI();
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
      newOrderBtn.onclick = () => this.showCustomerSelectionModal();
    }

    // Setup event listeners
    this.setupStageFilterButtons();
    this.updateStageButtonStates();

    // Check for deep link parameters
    if (this.params && this.params.customerId) {
        const customerId = this.params.customerId;
        const customerName = this.params.customerName || 'Customer';
        
        log.debug(`🔗 OrdersView: Handling deep link for ${customerName} (${customerId})`);
        
        setTimeout(() => {
            // Find customer to get the correct name if it was missing
            const customer = this.customers.find(c => String(c.id) === String(customerId));
            const finalName = customer ? customer.name : customerName;
            
            // Mark as selected and show their orders
            this.selectedCustomerId = customerId;
            this.showCustomerOrders(customerId, finalName);
            
            // Update active state in sidebar after a short delay to ensure it's rendered
            setTimeout(() => {
                const list = document.getElementById('customersList');
                if (list) {
                    list.querySelectorAll('.orders-customer-item').forEach(i => {
                        i.classList.remove('active');
                        i.style.background = '#1a1a1a';
                        i.style.borderColor = '#333333';
                    });
                    const item = list.querySelector(`[data-customer-id="${customerId}"]`);
                    if (item) {
                        item.classList.add('active');
                        item.style.background = '#2a2a2a';
                        item.style.borderColor = '#ffffff';
                        item.scrollIntoView({ block: 'center' });
                    }
                }
            }, 300);
            
            this.params = null; // Clear after use
        }, 200);
    }
}

  setupStageFilterButtons() {
    const stage2Btn = document.getElementById('ordersStage2Btn');
    const stage3Btn = document.getElementById('ordersStage3Btn');

    if (!stage2Btn || !stage3Btn) return;

    stage2Btn.removeEventListener('click', this._stage2ClickHandler);
    stage3Btn.removeEventListener('click', this._stage3ClickHandler);

    // Determine which filter method to use based on current view
    if (this.selectedCustomerId) {
      // Individual customer view
      this._stage2ClickHandler = () => this.filterCustomerViewOrdersByStage('stage2');
      this._stage3ClickHandler = () => this.filterCustomerViewOrdersByStage('stage3');
    } else {
      // All customers view
      this._stage2ClickHandler = () => this.filterOrdersByStage('stage2');
      this._stage3ClickHandler = () => this.filterOrdersByStage('stage3');
    }

    stage2Btn.addEventListener('click', this._stage2ClickHandler);
    stage3Btn.addEventListener('click', this._stage3ClickHandler);

    this.updateStageButtonStates();
  }

  filterOrdersByStage(stage) {
    this.currentStageFilter = this.currentStageFilter === stage ? null : stage;
    
    // Filter orders by stage if a stage is selected
    const ordersToDisplay = this.currentStageFilter 
      ? this.orders.filter(order => order.current_stage === this.currentStageFilter)
      : this.orders;

    // Update display
    const pendingOrders = ordersToDisplay.filter(order => order.status !== 'complete');
    const completedOrders = ordersToDisplay.filter(order => order.status === 'complete');

    this.updateAllOrdersContainers(pendingOrders, completedOrders, false);

    // Update button states
    this.updateStageButtonStates();
  }

  updateStageButtonStates() {
    const stage2Btn = document.getElementById('ordersStage2Btn');
    const stage3Btn = document.getElementById('ordersStage3Btn');

    if (!stage2Btn || !stage3Btn) return;

    // Reset both buttons
    stage2Btn.style.background = '#ffffff';
    stage2Btn.style.color = '#000000';
    stage3Btn.style.background = '#ffffff';
    stage3Btn.style.color = '#000000';

    // Highlight active stage based on which view we're in
    const filterState = this.selectedCustomerId ? this.currentCustomerViewStageFilter : this.currentStageFilter;
    
    if (filterState === 'stage2') {
      stage2Btn.style.background = '#000000';
      stage2Btn.style.color = '#ffffff';
    } else if (filterState === 'stage3') {
      stage3Btn.style.background = '#000000';
      stage3Btn.style.color = '#ffffff';
    }
  }

  filterCustomerViewOrdersByStage(stage) {
    this.currentCustomerViewStageFilter = this.currentCustomerViewStageFilter === stage ? null : stage;
    
    // Filter orders by stage if a stage is selected
    const ordersToDisplay = this.currentCustomerViewStageFilter 
      ? this.customerViewOrders.filter(order => order.current_stage === this.currentCustomerViewStageFilter)
      : this.customerViewOrders;

    // Update display
    const pendingOrders = ordersToDisplay.filter(order => order.status !== 'complete');
    const completedOrders = ordersToDisplay.filter(order => order.status === 'complete');

    this.updateAllOrdersContainers(pendingOrders, completedOrders, true);

    // Update button states
    this.updateStageButtonStates();
  }

  async setupUI() {
    await this.loadCustomersAndProducts();
  }

  bindEvents() {
    const debouncedSearch = Utils.debounce(() => this.renderCustomersList(), 300);
    document.getElementById('customerSearch')?.addEventListener('input', debouncedSearch);
    document.getElementById('customerSort')?.addEventListener('change', () => this.renderCustomersList());
  }

  setupListButtonToggle() {
    const listBtn = document.getElementById('ordersListBtn');
    const sidebar = document.getElementById('ordersListPanel');
    const sidebarControls = sidebar?.querySelector('#ordersSidebarControls');
    const sidebarList = document.getElementById('customersList');
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
        listBtn.style.opacity = '1';
      } else {
        // Close sidebar
        sidebar.style.width = '0';
        sidebar.style.opacity = '0';
        sidebarControls.style.display = 'none';
        sidebarList.style.display = 'none';
        if (mainWorkspace) mainWorkspace.style.display = 'flex';
        listBtn.style.opacity = '0.6';
      }
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

  setupDateFilter() {
    const dateFilter = document.getElementById('ordersDateFilter');
    dateFilter?.addEventListener('change', (e) => {
      const dateRange = e.target.value;
      this.filterOrdersByDate(dateRange);
    });
  }

  filterOrdersByDate(dateRange) {
    // Filter and re-render based on date range
    let filteredOrders = [...this.orders];
    const now = new Date();
    
    switch(dateRange) {
      case 'today':
        filteredOrders = this.orders.filter(o => {
          const orderDate = new Date(o.order_date || o.created_at);
          return orderDate.toDateString() === now.toDateString();
        });
        break;
      case 'this-week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredOrders = this.orders.filter(o => {
          const orderDate = new Date(o.order_date || o.created_at);
          return orderDate >= weekAgo;
        });
        break;
      case 'this-month':
        filteredOrders = this.orders.filter(o => {
          const orderDate = new Date(o.order_date || o.created_at);
          return orderDate.getMonth() === now.getMonth() && 
                 orderDate.getFullYear() === now.getFullYear();
        });
        break;
      case 'last-3':
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        filteredOrders = this.orders.filter(o => {
          const orderDate = new Date(o.order_date || o.created_at);
          return orderDate >= threeMonthsAgo;
        });
        break;
      case 'year':
        filteredOrders = this.orders.filter(o => {
          const orderDate = new Date(o.order_date || o.created_at);
          return orderDate.getFullYear() === now.getFullYear();
        });
        break;
      case 'all':
      default:
        filteredOrders = [...this.orders];
        break;
    }
    
    // Refresh the customers list with filtered orders
    this.orders = filteredOrders;
    this.updateStats();
  }

  updateStats() {
    const totalOrders = this.orders.length;
    const pendingOrders = this.orders.filter(o => o.status !== 'complete').length;
    const completedOrders = this.orders.filter(o => o.status === 'complete').length;
    const totalItems = this.orders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    
    document.getElementById('ordersTotal').textContent = totalOrders;
    document.getElementById('ordersPending').textContent = pendingOrders;
    document.getElementById('ordersCompleted').textContent = completedOrders;
    document.getElementById('ordersTotalItems').textContent = totalItems;
  }

  async refreshOrdersData() {
    try {
      // Guard: Ensure we are still the active view
      if (this.billingApp.currentViewInstance !== this) return;

      // Load fresh data from the server
      await this.loadCustomersAndProducts();
      await this.loadOrders();
      
      // Update stats
      this.updateStats();
      
      // Re-render the current view
      if (this.selectedCustomerId) {
        // If a customer is selected, refresh that customer's view
        const customer = this.customers.find(c => String(c.id) === String(this.selectedCustomerId));
        if (customer) {
          await this.showCustomerOrders(this.selectedCustomerId, customer.name, true);
        }
      } else {
        // Otherwise, refresh the all customers view
        this.renderCustomersList();
        await this.showAllCustomersView(true);
      }
      
      this.rerenderOrderCards();
      log.debug('✓ Orders data refreshed');
    } catch (error) {
      log.error('Error refreshing orders:', error);
    }
  }

  async loadCustomersAndProducts() {
    try {
      const normalizeCollection = payload => {
        if (Array.isArray(payload)) return payload;
        if (!payload) return [];
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.data?.items)) return payload.data.items;
        if (Array.isArray(payload.contacts)) return payload.contacts;
        if (Array.isArray(payload.products)) return payload.products;
        return [];
      };
      const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
      if (scoped && scoped.contacts && scoped.contacts.length > 0) {
        this.customers = scoped.contacts;
      } else {
        const customersRes = await fetch('/api/contacts');
        const custData = customersRes.ok ? await customersRes.json() : [];
        this.customers = normalizeCollection(custData);
      }
      const productsRes = await fetch('/api/products');
      const prodData = productsRes.ok ? await productsRes.json() : [];
      this.products = normalizeCollection(prodData);
    } catch (error) {
      log.error('Error loading data:', error);
      this.showNotification('Failed to load customers and products', 'error');
    }
  }

  async loadOrders() {
    try {
      const isWorker = (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
      const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
      const accessibleContactIds = scoped && isWorker ? new Set(scoped.contacts.map(c => c.id).filter(Boolean)) : null;

      const normalizeCollection = payload => {
        if (Array.isArray(payload)) return payload;
        if (!payload) return [];
        if (Array.isArray(payload.items)) return payload.items;
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.data?.items)) return payload.data.items;
        return [];
      };

      const res = await fetch('/api/billing/orders');
      if (res.ok) {
        const data = await res.json();
        let orders = normalizeCollection(data);
        
        // Ensure items array exists even if missing
        orders = orders.map(order => {
          if (!order.items) {
            order.items = [];
          }
          return order;
        });

        if (isWorker && accessibleContactIds) {
          orders = orders.filter(o => accessibleContactIds.has(o.customer_id));
        }
        
        this.orders = orders;
      }
    } catch (error) {
      log.error('Error loading orders:', error);
      this.showNotification('Failed to load orders', 'error');
      this.orders = [];
    }
  }

  renderCustomersList() {
    const list = document.getElementById('customersList');
    if (!list) return;
    const searchTerm = document.getElementById('customerSearch')?.value.toLowerCase() || '';
    const sortOption = document.getElementById('customerSort')?.value || 'name-asc';
    
    // Filter customers by search
    let filtered = this.customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm)
    );

    // Sort customers
    switch(sortOption) {
      case 'name-desc':
        filtered.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'recent':
        filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      default:
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!filtered.length) {
      list.innerHTML = '<div style="padding:24px 16px; text-align:center; color:#555555; font-size:12px;">No customers found</div>';
      return;
    }

    list.innerHTML = filtered.map(customer => {
      // Count orders for this customer
      const orderCount = this.orders.filter(o => String(o.customer_id) === String(customer.id)).length;
      const pendingCount = this.orders.filter(o => String(o.customer_id) === String(customer.id) && o.status !== 'complete').length;
      const completeCount = this.orders.filter(o => String(o.customer_id) === String(customer.id) && o.status === 'complete').length;
      const isExcluded = this.isExcluded(customer);
      
      // Build status display based on order status
      let statusText = '';
      if (pendingCount > 0) {
        statusText = `${pendingCount} Pending Order${pendingCount > 1 ? 's' : ''}`;
      } else if (completeCount > 0) {
        statusText = `${completeCount} Complete Order${completeCount > 1 ? 's' : ''}`;
      } else {
        statusText = 'No Orders';
      }
      
      const statusColor = pendingCount > 0 ? '#facc15' : completeCount > 0 ? '#4ade80' : '#888888';
      
      return `
      <div class="orders-customer-item" data-customer-id="${customer.id}" data-customer-name="${customer.name}" style="padding: 12px 12px; margin: 6px 4px; border-radius: 3px; cursor: pointer; transition: all 0.15s; user-select: none; background: #1a1a1a; border: 1px solid #333333; border-left: 3px solid #333333; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; gap: 8px;">
          <div style="font-weight: 700; color: #ffffff; font-size: 13px; font-family: 'Courier New', monospace; letter-spacing: 0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${customer.name}${isExcluded ? ' <span title="Excluded from Global Stats">🚫</span>' : ''}</div>
          <div class="order-count-badge" data-customer-id="${customer.id}" style="font-size: 9px; font-weight: 800; color: #ffffff; background: #333333; border: 1px solid #555555; padding: 4px 6px; border-radius: 2px; white-space: nowrap; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${orderCount}</div>
        </div>
        <div class="order-status-text" data-customer-id="${customer.id}" style="font-size: 10px; color: ${statusColor}; font-family: 'Courier New', monospace; font-weight: 600;">● ${statusText}</div>
      </div>
    `;
    }).join('');

    list.querySelectorAll('.orders-customer-item').forEach(item => {
      item.addEventListener('mouseover', () => {
        if (!item.classList.contains('active')) {
          item.style.background = '#2a2a2a';
          item.style.borderColor = '#444444';
        }
      });
      item.addEventListener('mouseout', () => {
        if (!item.classList.contains('active')) {
          item.style.background = '#1a1a1a';
          item.style.borderColor = '#333333';
        }
      });
      item.addEventListener('click', () => {
        list.querySelectorAll('.orders-customer-item').forEach(i => {
          i.classList.remove('active');
          i.style.background = '#1a1a1a';
          i.style.borderColor = '#333333';
          i.style.borderLeftColor = '#333333';
          i.style.boxShadow = 'none';
        });
        item.classList.add('active');
        item.style.background = '#2a2a2a';
        item.style.borderColor = '#ffffff';
        item.style.borderLeftColor = '#ffffff';
        item.style.boxShadow = 'inset 0 0 0 1px #ffffff';
        
        const customerId = item.dataset.customerId;
        this.selectedCustomerId = customerId;
        this.refreshOrdersData();
      });
    });

    // Reapply active state to previously selected customer after re-rendering
    if (this.selectedCustomerId) {
      const selectedItem = list.querySelector(`[data-customer-id="${this.selectedCustomerId}"]`);
      if (selectedItem) {
        selectedItem.classList.add('active');
        selectedItem.style.background = '#2a2a2a';
        selectedItem.style.borderColor = '#ffffff';
        selectedItem.style.borderLeftColor = '#ffffff';
        selectedItem.style.boxShadow = 'inset 0 0 0 1px #ffffff';
      }
    }

    // Double-click on empty space to deselect customer and show all
    list.addEventListener('dblclick', (e) => {
      if (e.target === list || (e.target.parentElement === list)) {
        list.querySelectorAll('.orders-customer-item').forEach(item => {
          item.classList.remove('active');
          item.style.background = '#1a1a1a';
          item.style.borderColor = '#333333';
          item.style.borderLeftColor = '#333333';
          item.style.boxShadow = 'none';
        });
        this.selectedCustomerId = null;
        this.refreshOrdersData();
      }
    });
  }

  updateCustomerCardStatus(customerId) {
    // Update just the order count and status text for a specific customer card
    // without re-rendering the entire list
    
    // Calculate updated counts for this customer
    const customerOrders = this.orders.filter(o => String(o.customer_id) === String(customerId));
    const orderCount = customerOrders.length;
    const pendingCount = customerOrders.filter(o => o.status !== 'complete').length;
    const completeCount = customerOrders.filter(o => o.status === 'complete').length;
    
    // Build updated status display
    let statusText = '';
    if (pendingCount > 0) {
      statusText = `${pendingCount} Pending Order${pendingCount > 1 ? 's' : ''}`;
    } else if (completeCount > 0) {
      statusText = `${completeCount} Complete Order${completeCount > 1 ? 's' : ''}`;
    } else {
      statusText = 'No Orders';
    }
    
    const statusColor = pendingCount > 0 ? '#facc15' : completeCount > 0 ? '#4ade80' : '#888888';
    
    // Update the DOM elements directly
    const countBadge = document.querySelector(`.order-count-badge[data-customer-id="${customerId}"]`);
    const statusElement = document.querySelector(`.order-status-text[data-customer-id="${customerId}"]`);
    
    if (countBadge) {
      countBadge.textContent = orderCount;
    }
    
    if (statusElement) {
      statusElement.textContent = `● ${statusText}`;
      statusElement.style.color = statusColor;
    }
  }

  async showCustomerOrders(customerId, customerName, skipRefresh = false) {
    this.selectedCustomerId = customerId;

    // Fetch all orders from the database and filter client-side
    try {
      const res = await fetch('/api/billing/orders');
      if (res.ok) {
        const data = await res.json();
        const allOrders = Array.isArray(data) ? data : (data.data || []);
        
        // Update this.orders with fresh data from database
        this.orders = allOrders;
        
        // Filter orders for this customer
        const customerOrders = allOrders.filter(o => String(o.customer_id) === String(customerId));
        
        log.debug('Fetched orders:', { total: allOrders.length, forCustomer: customerOrders.length, customerId, customerOrders });
        
        // Render with fetched orders
        this.renderCustomerOrdersList(customerId, customerName, customerOrders);
      } else {
        throw new Error('Failed to fetch orders');
      }
    } catch (error) {
      log.error('Error fetching customer orders:', error);
      // Fallback to in-memory orders
      const customerOrders = this.orders.filter(o => String(o.customer_id) === String(customerId));
      this.renderCustomerOrdersList(customerId, customerName, customerOrders);
    }
  }

  renderCustomerOrdersList(customerId, customerName, customerOrders) {
        this.clearOrderSelection();
        this.updateMultiSelectUI();
      // Clear selection when switching to a customer
      this.selectedOrderIds = new Set();
      this.updateMultiSelectUI();
    // Ensure the main content structure exists - restore if stage view replaced it
    const mainContent = document.getElementById('mainContent');
    if (!document.getElementById('ordersMainTitle')) {
      // Structure was replaced, recreate it
      mainContent.innerHTML = `
        <!-- Header Section -->
        <div style="padding: 24px 32px; background: #ffffff; border-bottom: 2px solid #000000; flex-shrink: 0;">
          <h1 id="ordersMainTitle" style="margin: 0 0 4px 0; font-size: 28px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">Customer Orders</h1>
          <p id="ordersMainMetrics" style="margin: 0; font-size: 12px; color: #666666; font-weight: 500;">Total Orders: 0 | Pending: 0 | Completed: 0 | Items: 0</p>
        </div>

        <!-- Filter & View Controls -->
        <div class="orders-filter-controls" style="padding: 6px 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
          <button id="ordersStage2Btn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">STAGE 2</button>
          <button id="ordersStage3Btn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #ffffff; color: #000000; cursor: pointer; border-radius: 2px; transition: all 0.2s;">STAGE 3</button>
          <div class="orders-spacer-inline" style="flex: 1;"></div>
          <button id="multiOrderViewBtn" class="orders-view-selected-btn" style="font-size: 11px; padding: 6px 10px; background: #000000; color: #ffffff; border: 2px solid #000000; border-radius: 2px; cursor: pointer; transition: all 0.15s; font-weight: 700; display: none;"><span class="orders-btn-desktop-text">◆ VIEW SELECTED</span><span class="orders-btn-mobile-text" style="display: none;">◆ VIEW</span></button>
          <button id="newOrderBtn" style="padding: 6px 10px; font-size: 11px; font-weight: 700; border: 2px solid #000000; background: #000000; color: #ffffff; cursor: pointer; display: none; border-radius: 2px; transition: all 0.2s;">+ NEW ORDER</button>
        </div>

        <!-- Columns Workspace -->
        <div class="orders-columns-container" style="flex: 1; display: flex; gap: 20px; overflow: hidden; padding: 20px 32px;">
          <!-- Pending Orders Column -->
          <div class="orders-pending-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
              <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">PENDING</h3>
              <span id="ordersPendingCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
            </div>
            <div id="ordersPendingContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0; gap: 8px;">
              <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">Loading...</div>
            </div>
          </div>

          <!-- Completed Orders Column -->
          <div class="orders-completed-column" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #000000;">
              <h3 style="margin: 0; font-size: 13px; font-weight: 900; color: #000000; text-transform: uppercase; letter-spacing: 0.8px;">COMPLETED</h3>
              <span id="ordersCompletedCount" style="font-size: 11px; font-weight: 700; color: #666666;">(0)</span>
            </div>
            <div id="ordersCompletedContainer" style="flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 0; gap: 8px;">
              <div style="padding: 40px 20px; text-align: center; color: #999999; font-size: 12px;">Loading...</div>
            </div>
          </div>
        </div>
      `;
    }

    // Calculate metrics for this customer
    const totalOrders = customerOrders.length;
    const totalItems = customerOrders.reduce((sum, order) => sum + (order.items?.length || 0), 0);
    const pendingOrders = customerOrders.filter(o => o.status !== 'complete').length;
    const completedOrders = customerOrders.filter(o => o.status === 'complete').length;
    
    // Update header
    document.getElementById('ordersMainTitle').textContent = customerName;
    document.getElementById('ordersMainMetrics').textContent = `Total Orders: ${totalOrders} | Pending: ${pendingOrders} | Completed: ${completedOrders} | Items: ${totalItems}`;
    
    // Setup state before rendering
    this.customerViewOrders = customerOrders;
    this.currentCustomerViewStageFilter = null;
    
    // Update all columns (pending, completed, and mobile unified stream)
    const pendingOrdersList = customerOrders.filter(o => o.status !== 'complete');
    const completedOrdersList = customerOrders.filter(o => o.status === 'complete');
    this.updateAllOrdersContainers(pendingOrdersList, completedOrdersList, true);
    
    // Update button states via multi-select UI logic
    this.updateMultiSelectUI();
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
      newOrderBtn.onclick = () => this.createNewOrder(customerId, customerName);
    }
    
    // Setup multi-select view button event
    const viewBtn = document.getElementById('multiOrderViewBtn');
    if (viewBtn) {
      viewBtn.onclick = () => this.showCondensedOrdersView();
    }

    // Always re-bind stage filter buttons for customer view
    this.setupStageFilterButtons();
    // Update button states
    this.updateStageButtonStates();
  }

  attachOrderRecordListeners() {
    document.querySelectorAll('.orders-order-record').forEach(record => {
      record.addEventListener('click', (e) => {
        e.stopPropagation();
        const orderId = record.dataset.orderId;
        const detailsDiv = record.querySelector('div[id^="details-"]');
        if (!detailsDiv) return;
        const isExpanded = detailsDiv.style.display !== 'none';

        // Collapse all other records
        document.querySelectorAll('.orders-order-record').forEach(r => {
          const dDiv = r.querySelector('div[id^="details-"]');
          if (dDiv) {
            dDiv.style.display = 'none';
          }
          r.style.background = '#fafafa';
          r.style.borderColor = '#666666';
          r.style.boxShadow = 'none';
        });

        // Toggle current record
        if (isExpanded) {
          detailsDiv.style.display = 'none';
          record.style.background = '#fafafa';
          record.style.borderColor = '#666666';
          record.style.boxShadow = 'none';
        } else {
          detailsDiv.innerHTML = `
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button onclick="window.currentOrdersView.viewOrder('${orderId}')" style="font-size: 10px; padding: 6px 10px; background: #000000; color: #ffffff; border: 1px solid #000000; border-radius: 2px; cursor: pointer; font-size: 10px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">◆ VIEW</button>
              <button onclick="window.currentOrdersView.editOrder('${orderId}')" style="font-size: 10px; padding: 6px 10px; background: #ffffff; color: #000000; border: 1px solid #000000; border-radius: 2px; cursor: pointer; font-size: 10px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✎ EDIT</button>
              <button onclick="window.currentOrdersView.deleteOrder('${orderId}')" style="font-size: 10px; padding: 6px 10px; background: #ff4444; color: #ffffff; border: 1px solid #cc0000; border-radius: 2px; cursor: pointer; font-size: 10px; font-weight: 600; font-family: 'Courier New', monospace; letter-spacing: 0.3px;">✕ DELETE</button>
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

  groupOrdersByMonth(orders) {
    const grouped = {};
    orders.forEach(order => {
      const date = new Date(order.order_date || order.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!grouped[key]) grouped[key] = { monthYear, orders: [] };
      grouped[key].orders.push(order);
    });
    return grouped;
  }

  renderOrdersGroupedByMonth(orders, inCustomerView = false, prefix = '') {
    if (orders.length === 0) {
      return '';
    }

    const grouped = this.groupOrdersByMonth(orders);
    const sortedKeys = Object.keys(grouped).sort().reverse();

    return sortedKeys.map(key => {
      const group = grouped[key];
      return `
        <div style="margin-bottom: 12px;">
          <div style="padding: 8px 12px; background: #000000; font-weight: 700; font-size: 11px; color: #ffffff; border-radius: 2px; margin-bottom: 8px; font-family: 'Courier New', monospace; letter-spacing: 0.3px; text-transform: uppercase;">█ ${group.monthYear}</div>
          ${group.orders.map(order => this.renderOrderCard(order, inCustomerView, prefix)).join('')}
        </div>
      `;
    }).join('');
  }

  // Utility: Re-render all order cards (call after any order count change or view switch)
  rerenderOrderCards() {
    // Example: re-render pending and completed containers
    if (this.selectedCustomerId) {
      // Customer view
      const customer = this.customers.find(c => String(c.id) === String(this.selectedCustomerId));
      const customerName = customer ? customer.name : 'Unknown';
      this.showCustomerOrders(this.selectedCustomerId, customerName, true);
    } else {
      // All customers view
      this.showAllCustomersView();
    }
  }

  renderOrderCard(order, inCustomerView, prefix = '') {
    const orderId = order.id;
    const date = new Date(order.order_date || order.created_at);
    const itemCount = order.items?.length || 0;
    const stage = order.current_stage || ORDER_CONSTANTS.STAGES.CREATE;
    const stageName = stage === ORDER_CONSTANTS.STAGES.CREATE ? 'CREATE' : (stage === ORDER_CONSTANTS.STAGES.QC ? 'QC' : 'DELIVERY');
    const stageSym = stage === ORDER_CONSTANTS.STAGES.CREATE ? '📋' : (stage === ORDER_CONSTANTS.STAGES.QC ? '📦' : '🚚');
    const customerId = order.customer_id;
    const customerName = order.customer_name || this.customers.find(c => c.id === customerId)?.name || 'Unknown';
    const orderNumber = this.generateOrderNumber(order, date);
    const checked = this.selectedOrderIds?.has?.(orderId) ? 'checked' : '';
    // Show/hide tickbox based on view and order count
    let showCheckbox = false;
    if (this.selectedCustomerId && this.customerViewOrders) {
      // Individual customer view
      if (this.customerViewOrders.length > 1) {
        showCheckbox = true;
      }
    } else {
      // All customers view
      if (this.orders && this.orders.length > 1) {
        showCheckbox = true;
      }
    }
    const customer = this.customers?.find?.(c => String(c.id) === String(customerId));
    const isCustExcluded = this.isExcluded(customer);
    const orderObj = this.orders?.find?.(o => String(o.id) === String(orderId)) || order;
    const workerBadgeHtml = (!this.isWorkerUser() && window.renderWorkerBadge && orderObj)
      ? window.renderWorkerBadge(orderObj, { compact: true })
      : '';

    const auditInfo = JSON.stringify({
      type: 'Order',
      id: orderId,
      name: `Order ${orderNumber} (${customerName})`,
      created_by_role: orderObj?.created_by_role || order.created_by_role,
      created_by_name: orderObj?.created_by_name || order.created_by_name,
      last_edited_by_role: orderObj?.last_edited_by_role || order.last_edited_by_role,
      last_edited_by_name: orderObj?.last_edited_by_name || order.last_edited_by_name,
      date: order.order_date || order.created_at,
      created_at: order.created_at,
      updated_at: order.updated_at
    });

    return `
      <div class="orders-order-record" data-order-id="${orderId}" data-total-items="${itemCount}" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}' style="padding: 12px; background: #fafafa; border: 2px solid #666666; border-radius: 2px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; font-family: 'Courier New', monospace; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
          <div style="font-weight: 700; color: #000000; font-size: 12px; letter-spacing: 0.3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${orderNumber}</span>
            ${workerBadgeHtml}
          </div>
          <div style="font-size: 10px; font-weight: 800; color: #ffffff; background: #000000; padding: 2px 4px; border: 1px solid #000000; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px;">${stageSym} ${stageName}</div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px;">
          <span>█ ${Utils.formatDate(date)}</span>
          <span class="item-count-display" style="font-weight: 700; color: #000000;">Items: ${itemCount}</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px; justify-content: space-between;">
          <div style="font-size: 10px; color: #666666; letter-spacing: 0.2px;">◆ ${customerName}${isCustExcluded ? ' <span title="Excluded from Global Stats">🚫</span>' : ''}</div>
          ${showCheckbox ? `<input type="checkbox" class="order-multiselect-checkbox" data-order-id="${orderId}" style="margin-left: 8px; position: static;" onclick="event.stopPropagation(); window.currentOrdersView.toggleOrderSelection('${orderId}')">` : ''}
        </div>
        <div id="details-${prefix}${orderId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #cccccc;"></div>
      </div>
    `;
  }

  generateOrderNumber(order, orderDate) {
    const year = orderDate.getFullYear();
    const yrShort = String(year).slice(-2);
    
    // Get all orders in the same calendar year (global uniqueness)
    const ordersInYear = this.orders.filter(o => {
      const oDate = new Date(o.order_date || o.created_at);
      return oDate.getFullYear() === year;
    });
    
    // Find the serial number for this order
    const existingIndex = ordersInYear.findIndex(o => String(o.id) === String(order.id));
    const serialNumber = existingIndex >= 0 ? existingIndex + 1 : ordersInYear.length + 1;
    const serialNumberFormatted = String(serialNumber).padStart(4, '0'); // Pad to 4 digits
    
    return `ORD-${yrShort}${serialNumberFormatted}`;
  }

  async createNewOrder(customerId, customerName) {
    const orderId = 'ORD-' + Date.now();
    const orderDate = new Date();
    let orderNumber = `ORD-${String(orderDate.getFullYear()).slice(-2)}xxxx`; // Fallback placeholder
    
    try {
      const res = await fetch(`/api/billing/orders/next-number?order_date=${orderDate.toISOString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.order_number) {
          orderNumber = data.order_number;
        }
      }
    } catch (error) {
      log.error('Error fetching next order number:', error);
      // Fallback: Generate locally if API fails, though backend will also generate it on save
      const tempOrder = { id: orderId, order_date: orderDate.toISOString() };
      orderNumber = this.generateOrderNumber(tempOrder, orderDate);
    }
    
    this.currentOrderData = {
      id: orderId,
      order_number: orderNumber,
      customer_id: customerId,
      customer_name: customerName,
      current_stage: 'stage1',
      order_date: orderDate.toISOString(),
      items: [],
      order_notes: '',
      qc_date: null,
      qc_notes: '',
      delivery_date: null,
      bill_reference: '',
      created_at: orderDate.toISOString(),
      updated_at: orderDate.toISOString()
    };
    this.currentOrderId = orderId;
    this.currentStage = 'stage1';
    this.selectedOrderIds = new Set();
    this.lastSavedPayload = null;
    this.updateMultiSelectUI();
    this.renderCurrentStage();
  }

  loadOrder(orderId) {
    const order = this.orders.find(o => String(o.id) === String(orderId));
    if (order) {
      this.currentOrderData = { ...order };
      this.currentOrderId = String(orderId);
      this.currentStage = order.current_stage || 'stage1';
      this.renderCurrentStage();
    }
  }

  viewOrder(orderId) {
    const order = this.orders.find(o => String(o.id) === String(orderId));
    if (order) {
      // Fetch full order data and show modal
      this.fetchAndViewOrder(orderId);
    }
  }

  editOrder(orderId) {
    const order = this.orders.find(o => String(o.id) === String(orderId));
    if (order) {
      // Fetch full order data with items from API for editing
      this.fetchAndEditOrder(orderId);
    }
  }

  async fetchAndViewOrder(orderId) {
    try {
      const res = await fetch(`/api/billing/orders/${orderId}`);
      if (res.ok) {
        const order = await res.json();
        
        // Normalize items
        const items = (order.items || []).map(item => {
          const product = this.products.find(p => p.id === item.product_id);
          return {
            ...item,
            qty: item.quantity || item.qty,
            quantity: item.quantity || item.qty,
            price: item.unit_price || item.price,
            unit_price: item.unit_price || item.price,
            product_name: product?.name || item.product_name || `Product ${item.product_id}`,
            received_quantity: (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : (item.received_qty || 0)
          };
        });
        
        this.showOrderModal({...order, items});
      } else {
        this.showNotification('Failed to load order', 'error');
      }
    } catch (error) {
      log.error('Error fetching order:', error);
      this.showNotification('Error loading order', 'error');
    }
  }

  async fetchAndEditOrder(orderId) {
    try {
      const res = await fetch(`/api/billing/orders/${orderId}`);
      if (res.ok) {
        const order = await res.json();
        
        // Normalize items to use consistent property names (qty, price)
        const items = (order.items || []).map(item => {
          // Look up product name from products array
          const product = this.products.find(p => p.id === item.product_id);
          
          return {
            ...item,
            qty: item.quantity || item.qty,
            quantity: item.quantity || item.qty,
            price: item.unit_price || item.price,
            unit_price: item.unit_price || item.price,
            product_name: product?.name || item.product_name || `Product ${item.product_id}`,
            received_quantity: (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : (item.received_qty || 0)
          };
        });
        
        this.currentOrderData = {
          ...order,
          items: items
        };
        this.currentOrderId = String(orderId);
        this.currentStage = order.current_stage || 'stage1';
        this.isViewMode = false;
        this.selectedOrderIds = new Set();
        this.lastSavedPayload = null;
        this.updateMultiSelectUI();
        this.renderCurrentStage();
      } else {
        this.showNotification('Failed to load order', 'error');
      }
    } catch (error) {
      log.error('Error fetching order:', error);
      this.showNotification('Error loading order', 'error');
    }
  }

  showOrderModal(order) {
    this.renderOrderViewModal(order);
  }

  createBaseElement(tag, styles = {}, textContent = '') {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    if (textContent) el.textContent = textContent;
    return el;
  }

  renderOrderViewModal(order) {
    const stage = order.current_stage || ORDER_CONSTANTS.STAGES.CREATE;
    const items = order.items || [];
    const customerName = order.customer_name || this.customers.find(c => c.id === order.customer_id)?.name || 'Unknown';
    const orderDate = new Date(order.order_date || order.created_at);
    const orderNumber = this.generateOrderNumber(order, orderDate);

    // Create Modal Overlay
    const modal = this.createBaseElement('div', {
      position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '1000', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace"
    });
    modal.id = 'orderModal';

    // Create Modal Content panel
    const modalContent = this.createBaseElement('div', {
      background: '#ffffff', borderRadius: '4px', maxWidth: '480px', width: '90%', maxHeight: '85%',
      overflowY: 'auto', boxShadow: '0 20px 25px rgba(0,0,0,0.15)', padding: '24px'
    });

    // 1. Header
    const workerBadgeModal = (!this.isWorkerUser() && window.renderWorkerBadge)
      ? window.renderWorkerBadge(order)
      : '';
    const headerTitle = this.createBaseElement('h2', { margin: '0 0 16px 0', fontSize: '18px', fontWeight: '900', color: '#000', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
    headerTitle.innerHTML = `<span>${orderNumber}</span> ${workerBadgeModal}`;
    const deliveryInfo = order.delivery_date ? ` | Delivery: ${Utils.formatDate(new Date(order.delivery_date))}` : ' | Not Delivered';
    const headerSub = this.createBaseElement('p', { margin: '0 0 20px 0', fontSize: '12px', color: '#666', fontWeight: '500' }, `Customer: ${customerName} | Order Date: ${Utils.formatDate(orderDate)}${deliveryInfo}`);
    modalContent.append(headerTitle, headerSub);

    // 2. Items Section
    const itemsTitleText = (stage === ORDER_CONSTANTS.STAGES.DELIVERY || order.status === 'complete') ? '📦 FINAL DISPATCH ITEMS' : (stage === ORDER_CONSTANTS.STAGES.QC ? '📦 QC / PICKING ITEMS' : '📋 ORDERED ITEMS');
    const itemsTitle = this.createBaseElement('h3', { margin: '0 0 12px 0', fontSize: '13px', fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '2px solid #000', paddingBottom: '8px' }, itemsTitleText);
    modalContent.appendChild(itemsTitle);

    const itemsContainer = this.createBaseElement('div', { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' });
    
    if (items.length === 0) {
      itemsContainer.appendChild(this.createBaseElement('div', { padding: '20px', textAlign: 'center', color: '#999', fontSize: '12px', fontFamily: "'Courier New', monospace" }, 'No items in this order'));
    } else {
      if (stage === ORDER_CONSTANTS.STAGES.DELIVERY || stage === ORDER_CONSTANTS.STAGES.QC || order.status === 'complete') {
        // Simplified lists for Stage 3/Complete
        const receivedItems = items.filter(i => (i.received_quantity || i.received_qty || 0) >= 1);
        const notReceivedItems = items.filter(i => (i.received_quantity || i.received_qty || 0) < 1);
        const subtotal = receivedItems.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.received_quantity || i.received_qty || 0)), 0);

        // Enhanced Table for Stage 2 & 3
        const tableContainer = this.createBaseElement('div', { minHeight: '150px', marginBottom: '20px' });
        const table = this.createBaseElement('table', { width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: "'Courier New', monospace" });
        table.innerHTML = `
          <thead>
            <tr style="border-bottom: 2px solid #000; text-align: left;">
              <th style="padding: 8px 4px;">ITEM</th>
              <th style="padding: 8px 4px; text-align: right;">${stage === ORDER_CONSTANTS.STAGES.CREATE ? 'QTY' : 'ORD/REC'}</th>
              <th style="padding: 8px 4px; text-align: right;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${receivedItems.map(item => {
              const qty = item.qty || item.quantity || 0;
              const rec = (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : 0;
              const price = item.unit_price || item.price || 0;
              const lineTotal = price * rec;
              const variantDisplay = item.pack_size_value ? `${item.pack_size_value}${item.pack_size_type || ''}` : '';
              return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 4px;">
                    <div style="font-weight: 700;">${item.product_name}</div>
                    <div style="font-size: 9px; color: #666;">${variantDisplay} | Batch: ${item.batch_no || 'N/A'}</div>
                  </td>
                  <td style="padding: 8px 4px; text-align: right; vertical-align: middle;">
                    <span style="font-weight: 700;">${qty}</span> / <span style="color: ${rec < qty ? '#c00' : '#059669'}; font-weight: 700;">${rec}</span>
                  </td>
                  <td style="padding: 8px 4px; text-align: right; font-weight: 700; vertical-align: middle;">₹${lineTotal.toFixed(2)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No items received</td></tr>'}
          </tbody>
        `;
        tableContainer.appendChild(table);
        itemsContainer.appendChild(tableContainer);

        if (notReceivedItems.length > 0) {
          const notRecTitle = this.createBaseElement('h4', { margin: '20px 0 8px 0', fontSize: '11px', fontWeight: '900', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '4px' }, '🚫 ITEMS NOT RECEIVED');
          const notRecList = this.createBaseElement('div', { display: 'flex', flexDirection: 'column', gap: '8px', opacity: '0.7', minHeight: '150px' });
          notReceivedItems.forEach(item => {
            const qty = item.qty || item.quantity || 0;
            const price = item.unit_price || item.price || 0;
            const variantDisplay = item.pack_size_value ? `${item.pack_size_value}${item.pack_size_type || ''}` : '';
            
            const card = this.createBaseElement('div', { padding: '10px', background: '#fff', border: '1px solid #eee', borderRadius: '3px', fontFamily: "'Courier New', monospace" });
            card.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                  <div style="font-weight: 700; font-size: 11px; color: #888;">${item.product_name}</div>
                  <div style="font-size: 9px; color: #aaa;">Batch: ${item.batch_no || 'N/A'}</div>
                   ${variantDisplay ? `<div style="font-size: 9px; color: #aaa;">Variant: ${variantDisplay}</div>` : ''}
                </div>
                <div style="font-weight: 700; color: #888;">Qty: ${qty} / 0</div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 4px; color: #aaa;">
                <span>₹${price.toFixed(2)}</span>
                <span>₹0.00</span>
              </div>
            `;
            notRecList.appendChild(card);
          });
          itemsContainer.appendChild(notRecTitle);
          itemsContainer.appendChild(notRecList);
        }

        const fullSubtotal = items.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.qty || i.quantity || 0)), 0);
        const notReceivedTotal = fullSubtotal - subtotal;

        const totalBox = this.createBaseElement('div', { 
          marginTop: '12px', padding: '16px', background: '#f9f9f9', color: '#000', 
          border: '1px solid #ddd', borderRadius: '2px' 
        });
        totalBox.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:10px; color:#666;">
            <span>SUBTOTAL (ORDERED)</span><span>₹${fullSubtotal.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:10px; color:#c00;">
            <span>- NOT RECEIVED</span><span>₹${notReceivedTotal.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1.5px solid #000; font-weight:900; font-size:13px;">
            <span>GRAND TOTAL</span><span>₹${subtotal.toFixed(2)}</span>
          </div>
        `;
        itemsContainer.appendChild(totalBox);
      } else {
        // Traditional cards for Stage 1/2
        items.forEach((item, idx) => {
          const itemBox = this.createBaseElement('div', { padding: '12px', background: '#f9f9f9', border: '1px solid #ddd', borderRadius: '3px', fontFamily: "'Courier New', monospace" });
          const variantDisplay = item.pack_size_value ? ` ${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
          const batchDisplay = item.batch_no || 'N/A';
          const qty = item.qty || item.quantity || 0;
          const price = item.unit_price || item.price || 0;
          itemBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
              <div>
                <div style="font-weight: 700; color: #000000; font-size: 12px;">${item.product_name}</div>
                ${variantDisplay ? `<div style="font-size: 9px; color: #0066cc; margin-top: 2px;">Variant: ${variantDisplay}</div>` : ''}
                <div style="font-size: 9px; color: #666666; margin-top: 2px;">Batch: ${batchDisplay}</div>
              </div>
              <div style="font-weight: 700; color: #000000;">Qty: ${qty}</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666666;">
              <span>Unit Price: ₹${price.toFixed(2)}</span>
              <span>Total: ₹${(price * qty).toFixed(2)}</span>
            </div>
          `;
          itemsContainer.appendChild(itemBox);
        });
      }
    }
    modalContent.appendChild(itemsContainer);

    // 3. Notes Section
    const createNoteBox = (title, contentText, bg, border, color) => {
      const box = this.createBaseElement('div', { padding: '12px', background: bg, border: `1px solid ${border}`, borderRadius: '3px', marginBottom: '20px' });
      const t = this.createBaseElement('div', { fontSize: '11px', fontWeight: '600', color: color, marginBottom: '6px' }, title);
      const c = this.createBaseElement('div', { fontSize: '11px', color: '#333', fontFamily: "'Courier New', monospace" }, contentText);
      box.append(t, c);
      return box;
    };

    if (order.order_notes) modalContent.appendChild(createNoteBox('📝 ORDER NOTES', order.order_notes, '#f0f8ff', '#1e40af', '#1e40af'));
    
    if (stage === ORDER_CONSTANTS.STAGES.DELIVERY || order.status === 'complete') {
      if (order.qc_notes) modalContent.appendChild(createNoteBox('⚠️ QC NOTES', order.qc_notes, '#fef3c7', '#f59e0b', '#d97706'));
      if (order.qc_date) {
         const dBox = this.createBaseElement('div', { padding: '12px', background: '#f5f3ff', border: '1px solid #d8b4fe', borderRadius: '3px', marginBottom: '20px' });
         dBox.innerHTML = `<div style="font-size: 11px; font-weight: 600; color: #9333ea; margin-bottom: 4px;">📅 QC DATE</div><div style="font-size: 12px; font-weight: 700; color: #000; font-family: 'Courier New', monospace;">${Utils.formatDate(order.qc_date)}</div>`;
         modalContent.appendChild(dBox);
      }

      const delTitle = this.createBaseElement('h3', { margin: '20px 0 12px 0', fontSize: '13px', fontWeight: '900', color: '#000', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '2px solid #000', paddingBottom: '8px' }, '🚚 DELIVERY DETAILS');
      const delBox = this.createBaseElement('div', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' });
      delBox.innerHTML = `
        <div style="padding: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 3px;">
          <div style="font-size: 10px; color: #16a34a; font-weight: 600; margin-bottom: 4px;">DELIVERY DATE</div>
          <div style="font-size: 12px; font-weight: 700; color: #000000; font-family: 'Courier New', monospace;">${order.delivery_date ? Utils.formatDate(order.delivery_date) : 'Not set'}</div>
        </div>
        <div style="padding: 12px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 3px;">
          <div style="font-size: 10px; color: #0284c7; font-weight: 600; margin-bottom: 4px;">BILL REFERENCE</div>
          <div style="font-size: 12px; font-weight: 700; color: #000000; font-family: 'Courier New', monospace;">${order.bill_reference || 'Not linked'}</div>
        </div>
      `;
      modalContent.append(delTitle, delBox);
    }

    // 4. Footer Buttons
    const footer = this.createBaseElement('div', { display: 'flex', justifyContent: 'flex-end', gap: '8px' });
    
    if (stage !== ORDER_CONSTANTS.STAGES.DELIVERY) {
      const copyBtn = this.createBaseElement('button', { padding: '8px 16px', background: '#0066cc', color: '#fff', border: '2px solid #0066cc', borderRadius: '2px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', transition: 'all 0.2s' }, '📋 COPY ITEMS');
      copyBtn.onclick = () => {
        const contentLines = items.map((item, idx) => {
          const v = item.pack_size_value ? ` ${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
          return `${idx + 1}.${item.product_name.trim()}${v ? ' ' + v : ''}--${item.qty || item.quantity || 0}`;
        });
        const formattedItems = ['PRODUCT NAME--QTY', ...contentLines].join('\n');
        navigator.clipboard.writeText(formattedItems).then(() => alert('Items copied to clipboard!')).catch(() => alert('Failed to copy'));
      };
      footer.appendChild(copyBtn);
    }

    const closeBtn = this.createBaseElement('button', { padding: '8px 16px', background: '#fff', color: '#000', border: '2px solid #000', borderRadius: '2px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', transition: 'all 0.2s' }, 'CLOSE');
    closeBtn.onclick = () => modal.remove();
    footer.appendChild(closeBtn);

    modalContent.appendChild(footer);
    modal.appendChild(modalContent);
    this.viewContainer.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  canAccessStage(stage) {
    if (stage === ORDER_CONSTANTS.STAGES.CREATE) return true;
    
    if (stage === ORDER_CONSTANTS.STAGES.QC) {
      return this.currentOrderData.items && this.currentOrderData.items.length > 0;
    }
    
    if (stage === ORDER_CONSTANTS.STAGES.DELIVERY) {
      // Stage 3 requires QC date and checked items
      return !!this.currentOrderData.qc_date;
    }
    
    return false;
  }

  renderCurrentStage() {
    const content = document.getElementById('mainContent');
    
    if (!this.currentOrderData) {
      content.innerHTML = '<div style="padding:20px; color:#999;">Select or create an order</div>';
      return;
    }

    const canQC = this.canAccessStage(ORDER_CONSTANTS.STAGES.QC);
    const canDelivery = this.canAccessStage(ORDER_CONSTANTS.STAGES.DELIVERY);

    // Show stage indicator
    let stageHTML = `
      <div class="stage-indicator" style="display:flex; flex-wrap:wrap; gap:8px; padding:12px; background:#f5f5f5; border-bottom:1px solid #ddd; margin-bottom:20px;">
        <button class="stage-btn" data-stage="${ORDER_CONSTANTS.STAGES.CREATE}" style="padding:8px 12px; background:${this.currentStage === ORDER_CONSTANTS.STAGES.CREATE ? '#0066cc' : '#ddd'};color:${this.currentStage === ORDER_CONSTANTS.STAGES.CREATE ? '#fff' : '#666'}; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600; flex:1; min-width:120px;">📋 STAGE 1: CREATE</button>
        <button class="stage-btn" data-stage="${ORDER_CONSTANTS.STAGES.QC}" ${canQC ? '' : 'disabled'} style="padding:8px 12px; background:${this.currentStage === ORDER_CONSTANTS.STAGES.QC ? '#ff9900' : (canQC ? '#ddd' : '#eeeeee')};color:${this.currentStage === ORDER_CONSTANTS.STAGES.QC ? '#fff' : (canQC ? '#666' : '#aaaaaa')}; border:none; border-radius:4px; cursor:${canQC ? 'pointer' : 'not-allowed'}; font-size:11px; font-weight:600; flex:1; min-width:120px;">📦 STAGE 2: QC</button>
        <button class="stage-btn" data-stage="${ORDER_CONSTANTS.STAGES.DELIVERY}" ${canDelivery ? '' : 'disabled'} style="padding:8px 12px; background:${this.currentStage === ORDER_CONSTANTS.STAGES.DELIVERY ? '#00cc00' : (canDelivery ? '#ddd' : '#eeeeee')};color:${this.currentStage === ORDER_CONSTANTS.STAGES.DELIVERY ? '#fff' : (canDelivery ? '#666' : '#aaaaaa')}; border:none; border-radius:4px; cursor:${canDelivery ? 'pointer' : 'not-allowed'}; font-size:11px; font-weight:600; flex:1; min-width:120px;">🚚 STAGE 3: DELIVERY</button>
      </div>
    `;

    content.innerHTML = stageHTML + `<div id="stageContent" style="margin:0 20px; flex:1; overflow-y:auto; display:flex; flex-direction:column; scrollbar-width:none; -ms-overflow-style:none;" class="hide-scrollbar"></div>`;

    document.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetStage = btn.dataset.stage;
        if (targetStage === this.currentStage) return;
        
        // Save current stage data before switching
        const saved = await this.saveCurrentStageState(true, targetStage);
        if (!saved) return; // Validation failed, don't switch
        
        this.currentStage = targetStage;
        this.renderCurrentStage();
      });
    });

    switch(this.currentStage) {
      case 'stage1':
        this.renderStage1();
        break;
      case 'stage2':
        this.renderStage2();
        break;
      case 'stage3':
        this.renderStage3();
        break;
    }
  }

  // ===== STAGE 1: CREATE ORDER =====
  renderStage1() {
    const container = document.getElementById('stageContent');
    if (!container) return;

    // Get customer name with fallback lookup
    const customer = this.customers.find(c => c.id === this.currentOrderData.customer_id);
    const customerName = customer?.name || this.currentOrderData.customer_name || 'Unknown';

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="flex:1; overflow-y:auto; padding:0; scrollbar-width:none; -ms-overflow-style:none;" class="hide-scrollbar">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-size:14px; font-weight:600;">CREATE ORDER - ${customerName}</h3>
              <button id="exitStageBtn" style="width:32px; height:32px; padding:0; background:#ff6b6b; color:#fff; border:none; border-radius:3px; cursor:pointer; font-size:18px; font-weight:bold; line-height:1;">✕</button>
            </div>

            <!-- Order Date Selector -->
            <div style="margin-bottom:20px;">
              <label for="orderDate" style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">ORDER DATE</label>
              <input type="date" id="orderDate" style="padding:10px; border:1px solid #ddd; border-radius:3px; font-size:11px; width:200px;" value="${this.currentOrderData.order_date ? this.currentOrderData.order_date.split('T')[0] : ''}" />
            </div>

            <!-- Product Search -->
            <div style="margin-bottom:20px;">
              <label style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">SEARCH & ADD PRODUCTS</label>
              <div style="display:flex; gap:8px;">
                <input id="productSearch" list="productsList" placeholder="Search products..." style="flex:1; padding:10px; border:1px solid #ddd; border-radius:3px; font-size:11px;" />
                <datalist id="productsList"></datalist>
                <button id="addProductBtn" style="padding:10px 16px; background:#0066cc; color:#fff; border:none; border-radius:3px; cursor:pointer; font-weight:600;">+ ADD</button>
                <button id="stage1VisionAssistBtn" style="padding:10px 16px; background:#10b981; color:#fff; border:none; border-radius:3px; cursor:pointer; font-weight:700; display:flex; align-items:center; gap:6px;">📷 AI ASSIST</button>
              </div>
            </div>

            <!-- Two columns: Recommendations + Items -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:20px;">
              <!-- Recommended Products -->
              <div>
                <h4 style="font-size:11px; font-weight:600; margin-bottom:8px; color:#333;">✨ RECOMMENDED PRODUCTS</h4>
                <div id="recommendations" style="border:1px solid #ddd; border-radius:3px; padding:12px; background:#f0f8ff; max-height:300px; overflow-y:auto;"></div>
              </div>

              <!-- Order Items -->
              <div>
                <h4 style="font-size:11px; font-weight:600; margin-bottom:8px; color:#333;">YOUR ORDER (${this.currentOrderData.items.length})</h4>
                <div id="orderItems" style="border:1px solid #ddd; border-radius:3px; padding:12px; background:#f9f9f9; max-height:300px; overflow-y:auto;"></div>
              </div>
            </div>

            <!-- Notes -->
            <div style="margin-bottom:20px;">
              <label style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">📝 ORDER NOTES (Optional)</label>
              <textarea id="orderNotes" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:3px; min-height:80px; font-size:11px;" placeholder="Special requests, pricing notes, etc...">${this.currentOrderData.order_notes}</textarea>
            </div>
          </div>
        </div>

        <div style="margin-top:20px; display:flex; gap:8px; flex-shrink:0; padding:20px; background:#ffffff; border-top:1px solid #ddd;">
          <button id="completeStage1Btn" style="flex:1; padding:12px; background:#0066cc; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">✓ COMPLETE STAGE 1 → STAGE 2</button>
        </div>
      </div>
    `;

    this.bindStage1Events();
    this.renderStage1SearchResults();
    this.renderStage1Recommendations();
    this.renderStage1Items();

    // Bind order date selector to update currentOrderData
    const orderDateInput = document.getElementById('orderDate');
    if (orderDateInput) {
      orderDateInput.addEventListener('change', (e) => {
        this.currentOrderData.order_date = e.target.value;
      });
    }
  }

  bindStage1Events() {
    // Populate datalist with all products
    this.populateProductsList();

    // Exit button
    const exitBtn = document.getElementById('exitStageBtn');
    exitBtn?.addEventListener('click', async () => {
      // Save data before exiting
      await this.saveCurrentStageState(true);
      this.selectedCustomerId = this.currentOrderData.customer_id;
      this.refreshOrdersData();
    });

    const searchInput = document.getElementById('productSearch');

    const addBtn = document.getElementById('addProductBtn');
    addBtn?.addEventListener('click', () => {
      const productName = searchInput?.value.trim();
      const product = this.products.find(p => p.name.toLowerCase() === productName.toLowerCase());
      if (product) {
        this.handleAddProduct(product);
        searchInput.value = '';
      } else {
        this.showNotification('Product not found', 'error');
      }
    });

    const visionAssistBtn = document.getElementById('stage1VisionAssistBtn');
    visionAssistBtn?.addEventListener('click', () => {
      if (!window.AIVisionService) return this.showNotification('AI Vision Service not loaded', 'error');
      
      window.AIVisionService.requestScan({ mode: 'order_stage1' })
        .then((data) => {
          if (!data || !data.product_name) return;
          // Search catalog for matched product ID or name
          let matchedProduct = null;
          if (data.product_id) {
            matchedProduct = this.products.find(p => String(p.id) === String(data.product_id));
          }
          if (!matchedProduct && data.product_name) {
            matchedProduct = this.products.find(p => p.name.toLowerCase().includes(data.product_name.toLowerCase()));
          }

          if (matchedProduct) {
            this.handleAddProduct(matchedProduct);
            this.showNotification(`✓ AI Matched: ${matchedProduct.name}`, 'success');
          } else {
            this.showNotification(`Extracted label text: ${data.product_name}`, 'info');
            if (searchInput) searchInput.value = data.product_name;
          }
        }).catch(err => log.debug('Scan error', err));
    });

    const notesArea = document.getElementById('orderNotes');
    notesArea?.addEventListener('change', (e) => {
      this.currentOrderData.order_notes = e.target.value;
    });

    const completeBtn = document.getElementById('completeStage1Btn');
    completeBtn?.addEventListener('click', async () => {
      const saved = await this.saveCurrentStageState(true);
      if (!saved) return;
      
      this.currentOrderData.current_stage = 'stage2';
      await this.saveOrder(true);
      this.currentStage = 'stage2';
      this.renderCurrentStage();
      this.showNotification('✓ Stage 1 complete', 'success');
    });
  }

  handleAddProduct(product) {
    // Check if product has variants or batches that require selection
    const hasMultipleVariants = product.variants && Array.isArray(product.variants) && product.variants.length > 1;
    const hasMultipleBatches = product.batches && Array.isArray(product.batches) && product.batches.length > 1;
    
    // If product has multiple variants or batches, show selection modal
    if (hasMultipleVariants || hasMultipleBatches) {
      this.showVariantBatchSelectionModal(product);
    } else {
      // Otherwise, add directly with default values
      this.addProductToOrder(product, 
        product.variants?.[0]?.id, 
        product.batches?.[0]?.id
      );
    }
  }

  showVariantBatchSelectionModal(product) {
    const variants = product.variants || [];
    const batches = product.batches || [];
    
    // Helper function to get batches for a specific variant
    const getBatchesForVariant = (variantId) => {
      return batches.filter(b => !b.variant_id || b.variant_id === variantId);
    };
    
    let modalHTML = `
      <div style="padding: 24px;">
        <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 900; color: #000000;">SELECT OPTIONS</h2>
        <p style="margin: 0 0 20px 0; font-size: 12px; color: #666666;">Product: ${product.name}</p>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
    `;
    
    // Add variant selector if multiple variants exist
    if (variants.length > 1) {
      modalHTML += `
        <div>
          <label style="display: block; font-size: 11px; font-weight: 700; color: #000000; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">📦 SELECT VARIANT</label>
          <select id="variantSelect" style="width: 100%; padding: 10px 12px; border: 1px solid #333333; border-radius: 2px; font-size: 11px; font-family: 'Courier New', monospace; background: #ffffff; color: #000000;">
            <option value="">-- Select Variant --</option>
            ${variants.map((v) => `
              <option value="${v.id}">${v.pack_size_value || v.name || 'Variant'} ${v.pack_size_type || ''}</option>
            `).join('')}
          </select>
        </div>
      `;
    } else if (variants.length === 1) {
      modalHTML += `<input type="hidden" id="variantSelect" value="${variants[0].id}" />`;
    }
    
    // Add batch selector container (will be populated dynamically)
    modalHTML += `
      <div id="batchContainer">
        <div>
          <label style="display: block; font-size: 11px; font-weight: 700; color: #000000; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">🏷️ SELECT BATCH</label>
          <select id="batchSelect" style="width: 100%; padding: 10px 12px; border: 1px solid #333333; border-radius: 2px; font-size: 11px; font-family: 'Courier New', monospace; background: #ffffff; color: #000000;">
            <option value="">-- Select a variant first --</option>
          </select>
        </div>
      </div>
    `;
    
    modalHTML += `
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px;">
          <button id="cancelSelectBtn" style="padding: 8px 16px; background: #ffffff; color: #000000; border: 2px solid #000000; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">CANCEL</button>
          <button id="confirmSelectBtn" style="padding: 8px 16px; background: #000000; color: #ffffff; border: 2px solid #000000; border-radius: 2px; cursor: pointer; font-size: 11px; font-weight: 700; transition: all 0.2s;">✓ ADD TO ORDER</button>
        </div>
      </div>
    `;
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'variantBatchModal';
    modal.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: #ffffff;
      border-radius: 4px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
    `;
    modalContent.innerHTML = modalHTML;
    
    modal.appendChild(modalContent);
    this.viewContainer.appendChild(modal);
    
    // Event handlers
    const variantSelect = document.getElementById('variantSelect');
    const batchSelect = document.getElementById('batchSelect');
    const cancelBtn = document.getElementById('cancelSelectBtn');
    const confirmBtn = document.getElementById('confirmSelectBtn');
    
    // Handle variant selection change and populate batches dynamically
    const batchContainer = document.getElementById('batchContainer');
    const updateBatchOptions = (selectedVariantId) => {
      const filteredBatches = selectedVariantId ? getBatchesForVariant(parseInt(selectedVariantId)) : getBatchesForVariant(variants[0]?.id);
      
      // Clear batch options
      batchSelect.innerHTML = '';
      
      if (filteredBatches.length === 0) {
        batchContainer.style.display = 'none';
        batchSelect.innerHTML = '<option value="">No batches available</option>';
        batchSelect.disabled = true;
      } else if (filteredBatches.length === 1) {
        // Auto-select if only 1 batch - hide batch selector since there's nothing to choose
        batchContainer.style.display = 'none';
        batchSelect.innerHTML = `<option value="${filteredBatches[0].id}" selected>Batch: ${filteredBatches[0].batch_no} | Exp: ${filteredBatches[0].exp_date || 'N/A'} | MRP: ₹${filteredBatches[0].mrp || 0}</option>`;
        batchSelect.disabled = true;
      } else {
        // Show batch selector if multiple batches
        batchContainer.style.display = 'block';
        batchSelect.innerHTML = '<option value="">-- Select Batch --</option>' + 
          filteredBatches.map((b) => `
            <option value="${b.id}">
              Batch: ${b.batch_no} | Exp: ${b.exp_date || 'N/A'} | MRP: ₹${b.mrp || 0}
            </option>
          `).join('');
        batchSelect.disabled = false;
      }
    };
    
    // Initial setup - if single variant, populate batches
    if (variants.length === 1) {
      updateBatchOptions(variants[0].id);
      variantSelect.value = variants[0].id;
    } else {
      // If multiple variants, hide batch container until one is selected
      batchContainer.style.display = 'none';
    }
    
    // Listen to variant changes
    if (variantSelect && variantSelect.tagName === 'SELECT') {
      variantSelect.addEventListener('change', (e) => {
        updateBatchOptions(e.target.value);
      });
    }
    
    cancelBtn?.addEventListener('click', () => {
      modal.remove();
    });
    
    confirmBtn?.addEventListener('click', () => {
      let variantId = null;
      let batchId = null;
      
      // Get variant ID
      if (variantSelect) {
        const val = variantSelect.value || variantSelect.getAttribute('value');
        variantId = val ? parseInt(val) : null;
      }
      
      // Get batch ID
      if (batchSelect) {
        const val = batchSelect.value || batchSelect.getAttribute('value');
        batchId = val ? parseInt(val) : null;
      }
      
      // If no selection made for required fields, show error
      if ((variants.length > 1 && !variantId) || !batchId) {
        this.showNotification('Please select variant and batch', 'error');
        return;
      }
      
      this.addProductToOrder(product, variantId, batchId);
      modal.remove();
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  addProductToOrder(product, variantId, batchId) {
    // Get variant and batch details from product
    const variant = variantId ? product.variants?.find(v => v.id === variantId) : product.variants?.[0];
    const batch = batchId ? product.batches?.find(b => b.id === batchId) : (variant?.batches?.[0] || product.batches?.[0]);
    
    // Get price from batch MRP
    const price = batch?.mrp || variant?.price || product.mrp || 0;
    
    // Check if product already exists in order
    const finalVariantId = variantId || variant?.id || null;
    const finalBatchId = batchId || batch?.id || null;
    
    const existing = this.currentOrderData.items.find(i => 
      i.product_id === product.id && 
      i.variant_id === finalVariantId && 
      i.batch_id === finalBatchId
    );
    
    if (existing) {
      existing.qty++;
      this.showNotification(`✓ ${product.name} quantity increased`, 'success');
    } else {
      this.currentOrderData.items.push({
        product_id: product.id,
        product_name: product.name,
        variant_id: finalVariantId,
        batch_id: finalBatchId,
        pack_size_value: variant?.pack_size_value,
        pack_size_type: variant?.pack_size_type,
        batch_no: batch?.batch_no,
        mrp: batch?.mrp || price,
        price: price,
        qty: 1
      });
      this.showNotification(`✓ ${product.name} added`, 'success');
    }
    
    this.renderStage1Items();
  }

  populateProductsList() {
    const datalist = document.getElementById('productsList');
    if (!datalist) return;

    datalist.innerHTML = '';
    
    this.products.forEach(product => {
      if (product && product.name) {
        const option = document.createElement('option');
        option.value = product.name;
        datalist.appendChild(option);
      }
    });
  }

  renderStage1SearchResults() {
    const container = document.getElementById('searchResults');
    if (!container) return;

    const rawInput = document.getElementById('productSearch')?.value || '';
    const searchTerm = rawInput.toLowerCase().trim();
    
    // If no search term, show all products
    // If search term exists, sort matching products first, then non-matching
    let displayProducts = this.products;
    let matchedIdSet = new Set();
    
    if (searchTerm) {
      let matching = [];
      let nonMatching = [];

      // Fast-Path: Rust WebAssembly typo-tolerant fuzzy search
      if (typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded()) {
        try {
          matching = window.SuiteCoreBridge.searchCatalog(rawInput, this.products, {
            min_score: 25.0,
            limit: this.products.length
          });
          matchedIdSet = new Set(matching.map(m => String(m.id)));
          nonMatching = this.products.filter(p => !matchedIdSet.has(String(p.id)));
        } catch (err) {
          log.warn('[NewOrder] WASM fuzzy search fallback:', err);
        }
      }

      if (!matching.length) {
        matching = this.products.filter(p => 
          p.name.toLowerCase().includes(searchTerm)
        );
        matchedIdSet = new Set(matching.map(m => String(m.id)));
        nonMatching = this.products.filter(p => 
          !p.name.toLowerCase().includes(searchTerm)
        );
      }
      displayProducts = [...matching, ...nonMatching];
    }

    if (!displayProducts.length) {
      container.innerHTML = '<div style="padding:12px; color:#999; font-size:11px;">No products available</div>';
      return;
    }

    container.innerHTML = displayProducts.map(p => {
      const isMatching = !searchTerm || matchedIdSet.has(String(p.id)) || p.name.toLowerCase().includes(searchTerm);
      const highlightStyle = isMatching && searchTerm ? 'background-color:#fff3cd; font-weight:600;' : '';
      return `
        <div style="padding:10px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; cursor:pointer; ${highlightStyle}" class="search-product" data-product-id="${p.id}">
          <div style="flex:1;">
            <div style="font-weight:600; color:#333;">${p.name}</div>
            <div style="font-size:10px; color:#666;">₹${p.mrp || 0}</div>
          </div>
          <button style="padding:4px 8px; background:#0066cc; color:#fff; border:none; border-radius:2px; cursor:pointer; font-size:10px; margin-left:8px;">ADD</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.search-product').forEach((item) => {
      const btn = item.querySelector('button');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const productId = item.dataset.productId;
        const product = this.products.find(p => p.id == productId);
        if (product) {
          const existing = this.currentOrderData.items.find(i => i.product_id === product.id);
          if (existing) {
            existing.qty++;
          } else {
            this.currentOrderData.items.push({
              product_id: product.id,
              product_name: product.name,
              price: product.mrp || 0,
              qty: 1
            });
          }
          this.renderStage1Items();
          document.getElementById('productSearch').value = '';
          this.renderStage1SearchResults();
        }
      });
    });
  }

  renderStage1Recommendations() {
    const container = document.getElementById('recommendations');
    if (!container) return;

    container.innerHTML = '<div style="color:#999; font-size:11px;">Loading recommendations...</div>';

    // Get reliable customer name for history lookup
    const customer = this.customers.find(c => c.id === this.currentOrderData.customer_id);
    const customerName = customer?.name || this.currentOrderData.customer_name;

    if (!customerName || customerName === 'Unknown') {
      container.innerHTML = '<div style="color:#999; font-size:11px;">Select a customer to see recommendations</div>';
      return;
    }

    this.getCustomerBillItems(customerName).then(billItems => {
      const updatedContainer = document.getElementById('recommendations');
      if (!updatedContainer) return;

      if (!billItems || !billItems.length) {
        updatedContainer.innerHTML = '<div style="color:#999; font-size:11px;">No purchase history</div>';
        return;
      }

      const patterns = this.analyzePurchasePatterns(billItems);
      if (!patterns.length) {
        updatedContainer.innerHTML = '<div style="color:#999; font-size:11px;">No recommendations</div>';
        return;
      }

      updatedContainer.innerHTML = patterns.map(p => `
        <div style="padding:10px; border-bottom:1px solid #d0e8ff; cursor:pointer; background:#fff; margin-bottom:4px; border-radius:2px;" class="recommend-product" data-product-id="${p.productId}" data-product-name="${p.name}">
          <div style="font-weight:600; color:#0066cc;">${p.name}</div>
          <div style="font-size:10px; color:#666;">Bought ${p.frequency}x · Last ${p.daysSinceLast}d ago</div>
        </div>
      `).join('');

      updatedContainer.querySelectorAll('.recommend-product').forEach(item => {
        item.addEventListener('click', () => {
          const productId = item.dataset.productId;
          const productName = item.dataset.productName;
          const product = this.products.find(p => p.id == productId);
          if (product) {
            this.handleAddProduct(product);
          }
        });
      });
    }).catch(err => {
      log.error('Error loading recommendations:', err);
      const container = document.getElementById('recommendations');
      if (container) container.innerHTML = '<div style="color:#c00; font-size:11px;">Error loading</div>';
    });
  }

  renderStage1Items() {
    const container = document.getElementById('orderItems');
    if (!container) return;

    if (!this.currentOrderData.items || !this.currentOrderData.items.length) {
      container.innerHTML = '<div style="color:#999; font-size:11px;">No items added</div>';
      return;
    }

    const total = this.currentOrderData.items.reduce((s, i) => {
      const price = i.price || i.unit_price || 0;
      const qty = i.qty || i.quantity || 0;
      return s + (price * qty);
    }, 0);
    this.currentOrderData.total_amount = total;

    container.innerHTML = `
      <div style="font-size:11px;">
        ${this.currentOrderData.items.map((item, idx) => {
          const price = item.price || item.unit_price || 0;
          const qty = item.qty || item.quantity || 0;
          const itemTotal = price * qty;
          const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
          const batchDisplay = item.batch_no || 'N/A';
          return `
          <div style="padding:10px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
              <div style="font-weight:600;">${item.product_name || 'Unknown'}</div>
              ${variantDisplay ? `<div style="font-size:9px; color:#0066cc; margin:2px 0;">Variant: ${variantDisplay}</div>` : ''}
              <div style="font-size:9px; color:#666; margin:2px 0;">Batch: ${batchDisplay}</div>
              <div style="font-size:10px; color:#666; margin:2px 0;">₹${price}</div>
            </div>
            <div style="display:flex; gap:4px; align-items:center;">
              <button class="qty-minus" data-idx="${idx}" style="padding:4px 6px; background:#f0f0f0; border:1px solid #ddd; border-radius:2px; cursor:pointer; font-size:10px;">−</button>
              <input type="number" class="qty-input" data-idx="${idx}" value="${qty}" min="1" style="width:40px; padding:4px; border:1px solid #ddd; border-radius:2px; text-align:center; font-size:11px;" />
              <button class="qty-plus" data-idx="${idx}" style="padding:4px 6px; background:#f0f0f0; border:1px solid #ddd; border-radius:2px; cursor:pointer; font-size:10px;">+</button>
              <button class="delete-item" data-idx="${idx}" style="padding:4px 6px; background:#f44; color:#fff; border:none; border-radius:2px; cursor:pointer; font-size:10px; margin-left:4px;">×</button>
            </div>
            <div style="font-weight:600; width:60px; text-align:right;">₹${itemTotal.toFixed(2)}</div>
          </div>
        `;
        }).join('')}
        <div style="padding:10px; background:#f0f0f0; border-top:2px solid #333; margin-top:8px; font-weight:600; text-align:right;">
          TOTAL: ₹${total.toFixed(2)}
        </div>
      </div>
    `;

    // Event handlers
    container.querySelectorAll('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const item = this.currentOrderData.items[idx];
        if ('qty' in item) item.qty++;
        else item.quantity++;
        this.renderStage1Items();
      });
    });

    container.querySelectorAll('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const item = this.currentOrderData.items[idx];
        const current = item.qty || item.quantity || 0;
        if (current > 1) {
          if ('qty' in item) item.qty--;
          else item.quantity--;
          this.renderStage1Items();
        }
      });
    });

    container.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const val = parseInt(input.value) || 1;
        const item = this.currentOrderData.items[idx];
        if ('qty' in item) item.qty = Math.max(1, val);
        else item.quantity = Math.max(1, val);
        this.renderStage1Items();
      });
    });

    container.querySelectorAll('.delete-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        this.currentOrderData.items.splice(idx, 1);
        this.renderStage1Items();
      });
    });
  }

  // ===== STAGE 2: QC & RECEIVE =====
  renderStage2() {
    const container = document.getElementById('stageContent');
    if (!container) return;

    // Ensure items array exists
    const items = this.currentOrderData.items || [];
    const subtotal = items.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.quantity || i.qty || 0)), 0);

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="flex:1; overflow-y:auto; padding:0; scrollbar-width:none; -ms-overflow-style:none;" class="hide-scrollbar">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-size:14px; font-weight:600;">STAGE 2: QC & RECEIVE ITEMS</h3>
              <div style="display:flex; gap:8px;">
                <button id="stage2VisionQCBtn" style="padding:6px 12px; background:#10b981; color:#fff; border:none; border-radius:3px; cursor:pointer; font-weight:700; font-size:11px; display:flex; align-items:center; gap:6px;">📷 SCAN QC ITEM</button>
                <button id="exitStageBtn" style="width:32px; height:32px; padding:0; background:#ff6b6b; color:#fff; border:none; border-radius:3px; cursor:pointer; font-size:18px; font-weight:bold; line-height:1;">✕</button>
              </div>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
              <!-- Checklist -->
              <div>
                <h4 style="font-size:11px; font-weight:600; margin-bottom:8px;">CHECKLIST</h4>
                <div style="border:1px solid #ddd; border-radius:3px; padding:12px; background:#f9f9f9; max-height:400px; overflow-y:auto;">
                  ${items.map((item, idx) => {
                    const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
                    const batchDisplay = item.batch_no || 'N/A';
                    return `
                    <div style="padding:10px; border-bottom:1px solid #ddd; display:flex; gap:10px;">
                      <input type="checkbox" class="item-check" data-idx="${idx}" ${this.currentOrderData.checklist_items && this.currentOrderData.checklist_items[idx] ? 'checked' : ''} style="margin-top:4px;" />
                      <div style="flex:1;">
                        <div style="font-weight:600;">${item.product_name || 'Unknown'}</div>
                        ${variantDisplay ? `<div style="font-size:9px; color:#0066cc; margin:2px 0;">Variant: ${variantDisplay}</div>` : ''}
                        <div style="font-size:9px; color:#666; margin:2px 0;">Batch: ${batchDisplay}</div>
                        <div style="font-size:9px; color:#000000; font-weight:600; margin:2px 0;">MRP: ₹${parseFloat(item.mrp || item.unit_price || item.price || 0).toFixed(2)}</div>
                        <div style="font-size:10px; color:#666; margin:2px 0;">Expected: ${item.qty || item.quantity || 0} units</div>
                        <input type="number" class="received-qty" data-idx="${idx}" value="${item.received_quantity || 0}" placeholder="${item.qty || item.quantity || 0}" min="0" style="width:100%; padding:4px; margin-top:6px; border:1px solid #ddd; border-radius:2px;" />
                      </div>
                    </div>
                  `;
                  }).join('')}
                </div>
              </div>

              <!-- QC Notes & Date -->
              <div>
                <div style="margin-bottom:16px;">
                  <label for="qcDate" style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">QC DATE</label>
                  <input type="date" id="qcDate" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:3px; font-size:11px;" value="${this.currentOrderData.qc_date ? this.currentOrderData.qc_date.split('T')[0] : new Date().toISOString().split('T')[0]}" />
                </div>
                <h4 style="font-size:11px; font-weight:600; margin-bottom:8px;">QC NOTES</h4>
                <textarea id="qcNotes" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:3px; min-height:160px; font-size:11px;" placeholder="Damaged items, missing qty, etc...">${this.currentOrderData.qc_notes || ''}</textarea>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-shrink:0; padding:20px; background:#ffffff; border-top:1px solid #ddd;">
          <button id="completeStage2Btn" style="flex:1; padding:12px; background:#ff9900; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">✓ COMPLETE STAGE 2 → STAGE 3</button>
          <button id="backStage1Btn" style="flex:1; padding:12px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">← BACK TO STAGE 1</button>
        </div>
      </div>
    `;

    // Smart checklist logic
    container.querySelectorAll('.item-check').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const idx = parseInt(checkbox.dataset.idx);
        const qtyInput = container.querySelector(`.received-qty[data-idx="${idx}"]`);
        if (checkbox.checked) {
          if (parseInt(qtyInput.value) === 0) {
            qtyInput.value = this.currentOrderData.items[idx].qty || this.currentOrderData.items[idx].quantity || 0;
          }
        } else {
          qtyInput.value = 0;
        }
      });
    });

    container.querySelectorAll('.received-qty').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.dataset.idx);
        const checkbox = container.querySelector(`.item-check[data-idx="${idx}"]`);
        const value = parseInt(input.value) || 0;
        checkbox.checked = value > 0;
      });
    });

    document.getElementById('stage2VisionQCBtn')?.addEventListener('click', () => {
      if (!window.AIVisionService) return this.showNotification('AI Vision Service not loaded', 'error');

      window.AIVisionService.requestScan({ mode: 'order_stage2' })
        .then((data) => {
          if (!data || !data.product_name) return;
          
          // Match against order items
          const items = this.currentOrderData.items || [];
          let targetIdx = -1;

          if (data.product_id) {
            targetIdx = items.findIndex(i => String(i.product_id) === String(data.product_id));
          }
          if (targetIdx === -1 && data.product_name) {
            targetIdx = items.findIndex(i => (i.product_name || '').toLowerCase().includes(data.product_name.toLowerCase()));
          }

          if (targetIdx !== -1) {
            const checkbox = container.querySelector(`.item-check[data-idx="${targetIdx}"]`);
            const qtyInput = container.querySelector(`.received-qty[data-idx="${targetIdx}"]`);
            
            if (checkbox && qtyInput) {
              checkbox.checked = true;
              const expectedQty = items[targetIdx].qty || items[targetIdx].quantity || 1;
              qtyInput.value = expectedQty;
              items[targetIdx].received_quantity = expectedQty;
              this.showNotification(`✓ QC Verified & Checked: ${items[targetIdx].product_name}`, 'success');
            }
          } else {
            this.showNotification(`Item '${data.product_name}' not found in this order checklist`, 'error');
          }
        }).catch(err => log.debug('QC scan error', err));
    });

    document.getElementById('exitStageBtn')?.addEventListener('click', async () => {
      await this.saveCurrentStageState(true);
      this.selectedCustomerId = this.currentOrderData.customer_id;
      this.refreshOrdersData();
      this.rerenderOrderCards();
    });

    document.getElementById('completeStage2Btn')?.addEventListener('click', async () => {
      const saved = await this.saveCurrentStageState(true, ORDER_CONSTANTS.STAGES.DELIVERY);
      if (!saved) return;
      
      this.currentOrderData.current_stage = 'stage3';
      await this.saveOrder(true);
      this.currentStage = 'stage3';
      this.renderCurrentStage();
      this.showNotification('✓ Stage 2 complete', 'success');
    });

    document.getElementById('backStage1Btn')?.addEventListener('click', async () => {
      await this.saveCurrentStageState(true);
      this.currentOrderData.current_stage = 'stage1';
      await this.saveOrder(true);
      this.currentStage = 'stage1';
      this.renderCurrentStage();
      this.showNotification('✓ Changes saved', 'success');
    });
  }

  // ===== STAGE 3: DELIVERY & BILL =====
  async getCustomerInvoices(customerId) {
    try {
      const res = await fetch(`/api/billing?customer_id=${customerId}`);
      if (res.ok) {
        const data = await res.json();
        const invoices = data.data || [];
        // Return invoices sorted by most recent first
        return invoices.sort((a, b) => new Date(b.created_at || b.bill_date || 0) - new Date(a.created_at || a.bill_date || 0));
      }
      return [];
    } catch (error) {
      log.error('Error fetching invoices:', error);
      return [];
    }
  }

  // --- INVOICE SEARCH DROPDOWN LOGIC ---
  handleInvoiceSearchInput(query) {
    if (!query || query.trim().length < 1) {
      this.renderInvoiceDropdown(this.allCustomerInvoices); // Show all if empty
      return;
    }

    const filtered = this.allCustomerInvoices.filter(inv => {
      const invNo = String(inv.invoice_no || inv.id || '').toLowerCase();
      const amount = String(inv.total_amount || '').toLowerCase();
      return invNo.includes(query.toLowerCase()) || amount.includes(query.toLowerCase());
    });

    this.renderInvoiceDropdown(filtered);
  }

  renderInvoiceDropdown(invoices) {
    const dropdown = document.getElementById('invoiceDropdown');
    if (!dropdown) return;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      dropdown.innerHTML = '<div class="search-dropdown-empty">No invoices found</div>';
      dropdown.style.display = 'block';
      this.isInvoiceDropdownOpen = true;
      this.invoiceSelectedIndex = -1;
      return;
    }

    this.isInvoiceDropdownOpen = true;
    this.invoiceSelectedIndex = -1;
    this.filteredInvoices = invoices;

    const input = document.getElementById('billRefInput');
    if (!input) return;

    // Get customer name for the Title
    const customer = this.customers?.find(c => c.id === this.currentOrderData?.customer_id);
    const customerName = customer?.name || this.currentOrderData?.customer_name || 'Customer';

    let html = '';
    let lastMonthYear = '';

    invoices.forEach((inv, idx) => {
      const invNo = inv.invoice_no || inv.id;
      const date = inv.bill_date || inv.created_at;
      const amount = parseFloat(inv.total_amount || 0).toFixed(2);
      const currentMonthYear = Utils.formatMonthYear(date);

      if (currentMonthYear !== lastMonthYear) {
        html += `<div class="dropdown-month-header">${currentMonthYear}</div>`;
        lastMonthYear = currentMonthYear;
      }

      html += `
        <div class="dropdown-item" data-index="${idx}">
          <div class="item-title">${Utils.formatDate(date)}</div>
          <div class="item-subtitle">Invoice: ${invNo} | ₹${amount}</div>
        </div>
      `;
    });

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // Position is now handled by CSS (absolute)

    // Add click listeners to items
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        const index = parseInt(item.getAttribute('data-index'));
        this.selectInvoiceFromDropdown(this.filteredInvoices[index]);
      });
    });
  }

  handleInvoiceSearchKeydown(e) {
    if (!this.isInvoiceDropdownOpen) {
      if (e.key === 'ArrowDown') {
        this.renderInvoiceDropdown(this.allCustomerInvoices);
      }
      return;
    }

    const dropdown = document.getElementById('invoiceDropdown');
    const items = dropdown.querySelectorAll('.dropdown-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.invoiceSelectedIndex = Math.min(this.invoiceSelectedIndex + 1, items.length - 1);
      this.updateInvoiceDropdownSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.invoiceSelectedIndex = Math.max(this.invoiceSelectedIndex - 1, 0);
      this.updateInvoiceDropdownSelection(items);
    } else if (e.key === 'Enter') {
      if (this.invoiceSelectedIndex >= 0) {
        e.preventDefault();
        this.selectInvoiceFromDropdown(this.filteredInvoices[this.invoiceSelectedIndex]);
      }
    } else if (e.key === 'Escape') {
      this.hideInvoiceDropdown();
    }
  }

  updateInvoiceDropdownSelection(items) {
    items.forEach((item, idx) => {
      if (idx === this.invoiceSelectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectInvoiceFromDropdown(invoice) {
    const input = document.getElementById('billRefInput');
    const invNo = invoice.invoice_no || invoice.id;
    if (input) {
      input.value = invNo;
    }
    this.currentOrderData.bill_reference = invNo;
    this.hideInvoiceDropdown();
  }

  hideInvoiceDropdown() {
    const dropdown = document.getElementById('invoiceDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      this.isInvoiceDropdownOpen = false;
      this.invoiceSelectedIndex = -1;
    }
  }

  renderStage3() {
    const container = document.getElementById('stageContent');
    if (!container) return;

    // Ensure items array exists
    const items = this.currentOrderData.items || [];
    const receivedItems = items.filter(i => {
      const rec = (i.received_quantity !== undefined && i.received_quantity !== null) ? i.received_quantity : (i.received_qty !== undefined ? i.received_qty : 0);
      return rec >= 1;
    });
    const notReceivedItems = items.filter(i => {
      const rec = (i.received_quantity !== undefined && i.received_quantity !== null) ? i.received_quantity : (i.received_qty !== undefined ? i.received_qty : 0);
      return rec < 1;
    });

    const fullSubtotal = items.reduce((s, i) => s + ((i.unit_price || i.price || 0) * (i.qty || i.quantity || 0)), 0);
    const grandTotal = receivedItems.reduce((s, i) => {
      const rec = (i.received_quantity !== undefined && i.received_quantity !== null) ? i.received_quantity : (i.received_qty !== undefined ? i.received_qty : 0);
      return s + ((i.unit_price || i.price || 0) * rec);
    }, 0);
    const notReceivedTotal = fullSubtotal - grandTotal;

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="flex:1; overflow:visible; padding:0; scrollbar-width:none; -ms-overflow-style:none;" class="hide-scrollbar">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-size:14px; font-weight:600;">STAGE 3: DELIVERY & BILLING</h3>
              <button id="exitStageBtn" style="width:32px; height:32px; padding:0; background:#ff6b6b; color:#fff; border:none; border-radius:3px; cursor:pointer; font-size:18px; font-weight:bold; line-height:1;">✕</button>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:20px;">
              <div>
                <label style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">DELIVERY DATE</label>
                <input id="deliveryDate" type="date" value="${this.currentOrderData.delivery_date ? new Date(this.currentOrderData.delivery_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:3px;" />
              </div>
              <div>
                <label style="display:block; font-size:11px; font-weight:600; margin-bottom:8px;">INVOICE # (Optional)</label>
                <div class="invoice-search-group">
                  <input id="billRefInput" type="text" value="${this.currentOrderData.bill_reference || ''}" placeholder="Search invoices..." autocomplete="off" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:3px;" />
                  <div id="invoiceDropdown" class="search-dropdown-container"></div>
                </div>
              </div>
            </div>`;

    // Fetch invoices for this customer and setup searchable dropdown
    const customerId = this.currentOrderData.customer_id;
    this.getCustomerInvoices(customerId).then(invoices => {
      this.allCustomerInvoices = invoices;
      
      const input = document.getElementById('billRefInput');
      if (input) {
        input.addEventListener('input', (e) => this.handleInvoiceSearchInput(e.target.value));
        input.addEventListener('keydown', (e) => this.handleInvoiceSearchKeydown(e));
        input.addEventListener('focus', () => {
          if (this.allCustomerInvoices.length > 0) {
            this.renderInvoiceDropdown(this.allCustomerInvoices);
          }
        });
        input.addEventListener('blur', () => {
          setTimeout(() => this.hideInvoiceDropdown(), 200);
          this.currentOrderData.bill_reference = input.value;
        });
      }
    });

    container.innerHTML += `
            <h4 style="font-size:11px; font-weight:600; margin-bottom:8px;">ITEMS RECEIVED</h4>
            <div style="border:1px solid #ddd; border-radius:3px; padding:12px; background:#f9f9f9; margin-bottom:20px; min-height: 200px; max-height:300px; overflow-y:auto;">
              ${receivedItems.length === 0 ? 
                '<div style="padding: 20px; text-align: center; color: #999; font-size: 12px; font-family: Courier New, monospace;">No items received</div>' :
                receivedItems.map(item => {
                  const qty = item.quantity || item.qty || 0;
                  const price = item.unit_price || item.price || 0;
                  const received = (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : (item.received_qty !== undefined ? item.received_qty : 0);
                  const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
                  const batchDisplay = item.batch_no || 'N/A';
                  return `
                  <div style="padding:10px; border-bottom:1px solid #ddd;">
                    <div style="display:flex; justify-content:space-between;">
                      <div style="flex:1;">
                        <div style="font-weight:600;">${item.product_name || 'Unknown'}</div>
                        ${variantDisplay ? `<div style="font-size:9px; color:#0066cc; margin:2px 0;">Variant: ${variantDisplay}</div>` : ''}
                        <div style="font-size:9px; color:#666; margin:2px 0;">Batch: ${batchDisplay}</div>
                        <div style="font-size:10px; color:#666; margin:2px 0;">Ordered: ${qty} | Received: ${received}</div>
                      </div>
                      <div style="font-weight:600; text-align:right;">₹${(price * received).toFixed(2)}</div>
                    </div>
                  </div>
                `;
                }).join('')
              }
            </div>

            ${notReceivedItems.length > 0 ? `
              <h4 style="font-size:11px; font-weight:600; margin-bottom:8px; color: #666;">🚫 ITEMS NOT RECEIVED</h4>
              <div style="border:1px solid #eee; border-radius:3px; padding:12px; background:#fafafa; margin-bottom:20px; min-height: 200px; max-height:300px; overflow-y:auto; opacity: 0.7;">
                ${notReceivedItems.map(item => {
                  const qty = item.qty || item.quantity || 0;
                  const price = item.unit_price || item.price || 0;
                  const variantDisplay = item.pack_size_value ? `${item.pack_size_value} ${item.pack_size_type || ''}`.trim() : '';
                  const batchDisplay = item.batch_no || 'N/A';
                  return `
                  <div style="padding:10px; border-bottom:1px solid #ddd;">
                    <div style="display:flex; justify-content:space-between; opacity: 0.8;">
                      <div style="flex:1;">
                        <div style="font-weight:600; color: #888;">${item.product_name || 'Unknown'}</div>
                        ${variantDisplay ? `<div style="font-size:9px; color:#aaa; margin:2px 0;">Variant: ${variantDisplay}</div>` : ''}
                        <div style="font-size:9px; color:#aaa; margin:2px 0;">Batch: ${batchDisplay}</div>
                        <div style="font-size:10px; color:#aaa; margin:2px 0;">Ordered: ${qty} | Received: 0</div>
                      </div>
                      <div style="font-weight:600; text-align:right; color: #aaa;">₹0.00</div>
                    </div>
                  </div>
                `;
                }).join('')}
              </div>
            ` : ''}

            <div style="background:#f0f0f0; padding:16px; border-radius:3px; margin-bottom:20px; border: 1px solid #ddd;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:11px; color: #666;">
                <span>Subtotal (All):</span>
                <span>₹<span id="billSubtotal">${fullSubtotal.toFixed(2)}</span></span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:11px; color: #c00;">
                <span>Not Received (-):</span>
                <span>₹<span id="notReceivedDeduct">${notReceivedTotal.toFixed(2)}</span></span>
              </div>
              <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:20px; border-top:2px solid #ddd;">
                <span style="font-size:11px; font-weight:600;">GRAND TOTAL:</span>
                <span style="font-weight:700; color:#c00; font-size:14px;">₹<span id="billGrandTotal">${grandTotal.toFixed(2)}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-shrink:0; padding:20px; background:#ffffff; border-top:1px solid #ddd;">
          <button id="completeStage3Btn" style="flex:1; padding:12px; background:#00cc00; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">✓ COMPLETE DELIVERY</button>
          <button id="backStage2Btn" style="flex:1; padding:12px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">← BACK TO STAGE 2</button>
        </div>
      </div>
    `;

    document.getElementById('exitStageBtn')?.addEventListener('click', async () => {
      await this.saveCurrentStageState(true);
      this.selectedCustomerId = this.currentOrderData.customer_id;
      this.refreshOrdersData();
      this.rerenderOrderCards();
    });

    document.getElementById('completeStage3Btn')?.addEventListener('click', async () => {
      const saved = await this.saveCurrentStageState(true, null, true);
      if (!saved) return;

      if (this.showConfirm('Complete Order?', 'Mark this order as delivered and complete?')) {
        this.currentOrderData.current_stage = 'stage3';
        this.currentOrderData.status = 'complete';
        await this.saveOrder();
        this.showNotification('✓ Order completed!', 'success');
        
        this.loadOrders().then(() => {
          const customer = this.customers.find(c => c.id === this.currentOrderData.customer_id);
          const customerName = customer?.name || this.currentOrderData.customer_name || 'Unknown';
          this.showCustomerOrders(this.selectedCustomerId, customerName);
          this.currentOrderData = null;
          this.currentOrderId = null;
        });
      }
    });


    document.getElementById('backStage2Btn')?.addEventListener('click', async () => {
      await this.saveCurrentStageState(true);
      this.currentOrderData.current_stage = 'stage2';
      await this.saveOrder(true);
      this.currentStage = 'stage2';
      this.renderCurrentStage();
      this.showNotification('✓ Changes saved', 'success');
    });
  }

  async saveOrder(skipRefresh = false) {
    if (!this.currentOrderData) {
      log.error('No order data to save');
      this.showNotification('No order to save', 'error');
      return;
    }

    const payload = {
      customer_id: this.currentOrderData.customer_id,
      order_number: this.currentOrderData.order_number,
      items: this.currentOrderData.items,
      current_stage: this.currentOrderData.current_stage,
      order_date: this.currentOrderData.order_date,
      order_notes: this.currentOrderData.order_notes,
      qc_date: this.currentOrderData.qc_date,
      qc_notes: this.currentOrderData.qc_notes,
      checklist_items: this.currentOrderData.checklist_items,
      delivery_date: this.currentOrderData.delivery_date,
      bill_reference: this.currentOrderData.bill_reference,
      discount: this.currentOrderData.discount,
      tax: this.currentOrderData.tax,
      total_amount: this.currentOrderData.total_amount,
      status: this.currentOrderData.status || 'pending'
    };

    const payloadString = JSON.stringify(payload);
    
    // Prevent redundant saves if payload hasn't changed
    // Use string check for temporary IDs (ORD-XXXX) vs numeric DB IDs
    const rawId = String(this.currentOrderData.id || '');
    const isNewOrder = rawId.startsWith('ORD-') || rawId === '';
    const numericId = parseInt(rawId);

    if (!isNewOrder && !isNaN(numericId) && this.lastSavedPayload === payloadString) {
      if (!skipRefresh) {
        await this.refreshOrdersData();
        this.selectedOrderIds = new Set();
        this.updateMultiSelectUI();
      }
      return;
    }

    try {
      if (!isNewOrder && !isNaN(numericId)) {
        const res = await fetch(`/api/billing/orders/${numericId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payloadString
        });
        if (res.ok) {
          const body = await res.json();
          if (body) {
            this.currentOrderData = { ...this.currentOrderData, ...body };
            this.lastSavedPayload = payloadString;
          }
        }
      } else {
        const res = await fetch('/api/billing/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadString
        });
        if (res.ok) {
          const body = await res.json();
          if (body && body.id) {
            this.currentOrderData = { ...this.currentOrderData, ...body, id: String(body.id) };
            this.lastSavedPayload = JSON.stringify({...payload, id: String(body.id)});
          }
        }
      }
    } catch (error) {
      log.error('Error saving:', error);
    }

    if (this.currentOrderData && this.currentOrderData.id) {
      const idx = this.orders.findIndex(o => String(o.id) === String(this.currentOrderData.id));
      if (idx >= 0) {
        this.orders[idx] = this.currentOrderData;
      } else {
        this.orders.push(this.currentOrderData);
      }
    }
    
    // Reload orders from server to ensure state is synchronized
    await this.loadOrders();
    
    // Update customer card status in sidebar (always do this for real-time updates)
    if (this.currentOrderData && this.currentOrderData.customer_id) {
      this.updateCustomerCardStatus(this.currentOrderData.customer_id);
    }
    
    // Refresh the display immediately with animations
    if (!skipRefresh) {
      await this.syncWithServer(true); // isManual=true force update
      this.selectedOrderIds = new Set();
      this.updateMultiSelectUI();
    }
  }

  async deleteOrder(orderId) {
    const order = this.orders.find(o => String(o.id) === String(orderId));
    if (!order) {
      this.showNotification('Order not found', 'error');
      return;
    }
    const orderNumber = this.generateOrderNumber(order, new Date(order.order_date || order.created_at));
    const confirmed = confirm(`Are you sure you want to delete order ${orderNumber}?\n\nThis action cannot be undone.`);
    if (!confirmed) return;
    try {
      const numericId = parseInt(orderId);
      if (!isNaN(numericId)) {
        const res = await fetch(`/api/billing/orders/${numericId}`, { method: 'DELETE' });
        if (res.ok) {
          // 1. Immediate Visual Hiding
          const card = document.querySelector(`[data-order-id="${orderId}"]`);
          if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            card.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => card.remove(), 250);
          }

          // 2. Immediate Data Update
          this.orders = this.orders.filter(o => String(o.id) !== String(orderId));
          this.updateStats();
          
          // 3. Sync sidebar and multi-select
          if (this.currentOrderData && this.currentOrderData.customer_id) {
            this.updateCustomerCardStatus(this.currentOrderData.customer_id);
          }
          this.selectedOrderIds.delete(orderId);
          this.updateMultiSelectUI();

          // 4. Background synchronization (silent refresh)
          this.syncWithServer(true);
          
          this.showNotification(`Order ${orderNumber} deleted`, 'success');
          // Close modal if open
          const modal = document.getElementById('orderModal');
          if (modal) modal.style.display = 'none';
        } else {
          this.showNotification('Failed to delete order', 'error');
        }
      }
    } catch (error) {
      log.error('Error deleting order:', error);
      this.showNotification('Error deleting order', 'error');
    }
  }

  async getCustomerBillItems(customerName) {
    try {
      const resp = await fetch(`/api/billing/customer-bill-items/${encodeURIComponent(customerName)}`);
      if (!resp.ok) return [];
      const payload = await resp.json();
      return payload.data || [];
    } catch (e) {
      log.error('Error:', e);
      return [];
    }
  }

  analyzePurchasePatterns(billItems) {
    const patterns = {};
    const now = Date.now();
    const suppressionMs = this.suppressionDays * 24 * 60 * 60 * 1000;

    billItems.forEach(item => {
      // Handle various date property names from backend (invoice_date, bill_date, created_at)
      const dateVal = item.invoice_date || item.bill_date || item.created_at || item.timestamp;
      const billDate = new Date(dateVal || new Date()).getTime();
      const daysSince = (now - billDate) / (1000 * 60 * 60 * 24);
      const key = item.product_id || item.product_name || '';
      if (!key) return;

      if (!patterns[key]) {
        patterns[key] = {
          productId: item.product_id || '',
          name: item.product_name || '',
          frequency: 0,
          daysSinceLast: 999,
          totalQty: 0,
          lastBillDate: 0,
        };
      }

      patterns[key].frequency++;
      patterns[key].totalQty += (item.qty || 1);
      patterns[key].daysSinceLast = Math.min(patterns[key].daysSinceLast, daysSince);
      patterns[key].lastBillDate = Math.max(patterns[key].lastBillDate, billDate);
    });

    const suggestions = Object.values(patterns)
      .filter(p => {
        const msSinceLast = now - p.lastBillDate;
        return msSinceLast > suppressionMs;
      })
      .map(p => ({
        ...p,
        daysSinceLast: Math.round(p.daysSinceLast),
        score: (p.frequency * 10) + (p.totalQty * 2) + (Math.max(0, 90 - p.daysSinceLast))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return suggestions;
  }

  async saveCurrentStageState(skipRefresh = true, targetStage = null, isFinalizing = false) {
    try {
      this.collectCurrentStageData(isFinalizing);

      // Check partial fulfillment warning if transitioning from QC to Delivery
      if (this.currentStage === ORDER_CONSTANTS.STAGES.QC && targetStage === ORDER_CONSTANTS.STAGES.DELIVERY) {
        const items = this.currentOrderData.items || [];
        const checklist = this.currentOrderData.checklist_items || {};
        const totalChecked = items.filter((_, idx) => checklist[idx]).length;
        
        if (totalChecked < items.length) {
          if (!confirm(`Warning: Only ${totalChecked} of ${items.length} items have passed QC. Proceed with partial fulfillment?`)) {
            return false;
          }
        }
      }

      await this.saveOrder(skipRefresh);
      return true;
    } catch (err) {
      this.showNotification(err.message, 'error');
      return false;
    }
  }

  collectCurrentStageData(isFinalizing = false) {
    if (!this.currentOrderData) return;

    // Reset status to pending only if we are modifying core items in Stage 1 or 2
    if (this.currentOrderData.status === ORDER_CONSTANTS.STATUS.COMPLETE && this.isViewMode === false) {
      if (this.currentStage === ORDER_CONSTANTS.STAGES.CREATE || this.currentStage === ORDER_CONSTANTS.STAGES.QC) {
        this.currentOrderData.status = ORDER_CONSTANTS.STATUS.PENDING;
      }
    }

    if (this.currentStage === 'stage1') {
      const orderDateInput = document.getElementById('orderDate');
      if (orderDateInput) this.currentOrderData.order_date = orderDateInput.value;
      const notesArea = document.getElementById('orderNotes');
      if (notesArea) this.currentOrderData.order_notes = notesArea.value;

      // Validation
      if (!this.currentOrderData.items || this.currentOrderData.items.length === 0) {
        throw new Error('Please add at least one product');
      }
    } else if (this.currentStage === 'stage2') {
      const qcDateInput = document.getElementById('qcDate');
      const qcNotesArea = document.getElementById('qcNotes');
      const items = this.currentOrderData.items || [];
      this.currentOrderData.checklist_items = this.currentOrderData.checklist_items || {};
      
      // Update items and checklist from inputs
      let hasValidationError = false;
      document.querySelectorAll('.received-qty').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        const val = parseInt(input.value) || 0;
        const checkbox = document.querySelector(`.item-check[data-idx="${idx}"]`);
        
        // Update checklist state
        if (checkbox) {
          this.currentOrderData.checklist_items[idx] = checkbox.checked;
          
          // Common sense validation: if ticked, qty must be > 0
          if (checkbox.checked && val === 0) {
            hasValidationError = true;
          }
        }

        if (items[idx]) {
          items[idx].received_quantity = val;
        }
      });

      if (hasValidationError) {
        throw new Error('Checked items must have a quantity greater than zero');
      }

      if (qcDateInput) {
        const dateVal = qcDateInput.value;
        const orderDate = new Date(this.currentOrderData.order_date || this.currentOrderData.created_at);
        const qcDate = new Date(dateVal);
        
        // Date validation: QC cannot be before order
        if (qcDate < orderDate) {
          throw new Error('QC date cannot be earlier than order date');
        }
        this.currentOrderData.qc_date = qcDate.toISOString();
      }
      if (qcNotesArea) this.currentOrderData.qc_notes = qcNotesArea.value;
    } else if (this.currentStage === 'stage3') {
      const deliveryDateInput = document.getElementById('deliveryDate');
      const billRefSelect = document.getElementById('billRef');

      if (deliveryDateInput && isFinalizing) {
        const dateVal = deliveryDateInput.value;
        if (!dateVal) throw new Error('Delivery date is required to complete order');
        
        const qcDate = this.currentOrderData.qc_date ? new Date(this.currentOrderData.qc_date) : null;
        const dDate = new Date(dateVal);
        
        // Date validation: Delivery cannot be before QC
        if (qcDate && dDate < qcDate) {
          throw new Error('Delivery date cannot be earlier than QC date');
        }
        this.currentOrderData.delivery_date = dDate.toISOString();
      }
      if (billRefSelect) this.currentOrderData.bill_reference = billRefSelect.value;
      
      
      // Update the total amount explicitly based on billing sum (received quantity)
      const items = this.currentOrderData.items || [];
      const subtotal = items.reduce((s, i) => {
        const rec = (i.received_quantity !== undefined && i.received_quantity !== null) ? i.received_quantity : (i.received_qty !== undefined ? i.received_qty : 0);
        return s + ((i.unit_price || i.price || 0) * rec);
      }, 0);
      this.currentOrderData.total_amount = subtotal;
    }
  }

  injectOrdersStyles() {
    if (document.getElementById('orders-module-styles')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'orders-module-styles';
    link.href = '/modules/billing/css/new-order.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }
}

window.OrdersView = OrdersView;

