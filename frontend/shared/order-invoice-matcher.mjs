const normalizeReference = value => String(value || '').trim().toLowerCase();

function scoreInvoiceAgainstOrder(orderData, invoice, allOrders) {
  const orderItems = Array.isArray(orderData?.items) ? orderData.items : [];
  if (!orderData || !invoice || orderItems.length === 0) return null;

  const receivedItems = orderItems.filter(item => {
    const received = item.received_quantity ?? item.received_qty ?? 0;
    return Number(received) >= 1;
  });
  const grandTotal = receivedItems.reduce((sum, item) => {
    const received = Number(item.received_quantity ?? item.received_qty ?? 0);
    return sum + (Number(item.unit_price || item.price || 0) * received);
  }, 0);
  const fullSubtotal = orderItems.reduce((sum, item) => (
    sum + (Number(item.unit_price || item.price || 0) * Number(item.qty || item.quantity || 0))
  ), 0);
  const targetOrderTotal = grandTotal > 0 ? grandTotal : (Number(orderData.total_amount) || fullSubtotal);

  const orderDateRaw = orderData.delivery_date || orderData.qc_date || orderData.order_date || orderData.created_at;
  const orderDate = orderDateRaw ? new Date(orderDateRaw).getTime() : Date.now();
  const orderProducts = new Map();

  orderItems.forEach(item => {
    const productId = String(item.product_id || '').trim();
    const productName = String(item.product_name || '').trim().toLowerCase();
    const quantity = Number(item.received_quantity > 0
      ? item.received_quantity
      : (item.qty || item.quantity || 0));
    if (productId) orderProducts.set(`id:${productId}`, quantity);
    if (productName) orderProducts.set(`name:${productName}`, quantity);
  });

  const linkedInvoiceNos = new Set(
    (Array.isArray(allOrders) ? allOrders : [])
      .filter(order => order && String(order.id) !== String(orderData.id) && order.bill_reference)
      .map(order => normalizeReference(order.bill_reference))
  );
  const invoiceNo = String(invoice.invoice_no || invoice.id || '').trim();
  if (!invoiceNo || linkedInvoiceNos.has(normalizeReference(invoiceNo))) return null;

  let score = 0;
  const reasons = [];
  const invoiceTotal = Number(invoice.grand_total ?? invoice.total_amount ?? invoice.total ?? 0);
  if (targetOrderTotal > 0 && invoiceTotal > 0) {
    const difference = Math.abs(invoiceTotal - targetOrderTotal);
    if (difference < 0.05) {
      score += 40;
      reasons.push('Exact total match');
    } else if (difference <= 1.05) {
      score += 35;
      reasons.push(`Total matches within rounding (₹${difference.toFixed(2)})`);
    } else if (difference / targetOrderTotal <= 0.03) {
      score += 25;
      reasons.push('Total within 3%');
    } else if (fullSubtotal > 0 && Math.abs(invoiceTotal - fullSubtotal) <= 1.05) {
      score += 25;
      reasons.push('Subtotal match');
    }
  }

  const invoiceItems = Array.isArray(invoice.items)
    ? invoice.items
    : (Array.isArray(invoice.products) ? invoice.products : []);
  if (orderItems.length > 0 && invoiceItems.length > 0) {
    let matchedProductCount = 0;
    let matchedQuantityCount = 0;

    invoiceItems.forEach(item => {
      const productId = String(item.product_id || item.id || '').trim();
      const productName = String(item.product_name || item.name || '').trim().toLowerCase();
      const invoiceQuantity = Number(item.qty ?? item.quantity ?? 0);
      let expectedQuantity = null;

      if (productId && orderProducts.has(`id:${productId}`)) {
        expectedQuantity = orderProducts.get(`id:${productId}`);
        matchedProductCount++;
      } else if (productName && orderProducts.has(`name:${productName}`)) {
        expectedQuantity = orderProducts.get(`name:${productName}`);
        matchedProductCount++;
      }

      if (expectedQuantity !== null && expectedQuantity === invoiceQuantity) {
        matchedQuantityCount++;
      }
    });

    const itemOverlap = matchedProductCount / Math.max(orderItems.length, invoiceItems.length, 1);
    if (itemOverlap >= 0.95 && matchedQuantityCount >= matchedProductCount * 0.9) {
      score += 40;
      reasons.push(`100% items and quantities match (${matchedProductCount} items)`);
    } else if (itemOverlap >= 0.7) {
      score += 30;
      reasons.push(`${Math.round(itemOverlap * 100)}% items match`);
    } else if (itemOverlap >= 0.4) {
      score += 15;
      reasons.push('Partial items match');
    }
  }

  const invoiceDateRaw = invoice.invoice_date || invoice.bill_date || invoice.created_at;
  if (invoiceDateRaw) {
    const invoiceDate = new Date(invoiceDateRaw).getTime();
    const daysApart = Math.abs(invoiceDate - orderDate) / (1000 * 60 * 60 * 24);
    if (daysApart <= 1) {
      score += 20;
      reasons.push('Created on same date');
    } else if (daysApart <= 3) {
      score += 15;
      reasons.push('Within 3 days');
    } else if (daysApart <= 7) {
      score += 10;
      reasons.push('Within 7 days');
    } else if (daysApart <= 14) {
      score += 5;
      reasons.push('Within 14 days');
    } else if (daysApart > 45) {
      score -= 10;
    }
  }

  return score >= 45 ? { invoice, score, reasons } : null;
}

export function findBestInvoiceMatchForOrder(orderData, invoices, allOrders = []) {
  if (!orderData || !Array.isArray(invoices) || invoices.length === 0) return null;
  return invoices
    .map(invoice => scoreInvoiceAgainstOrder(orderData, invoice, allOrders))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0] || null;
}

export function findBestOrderMatchForInvoice(invoice, orders) {
  if (!invoice || !Array.isArray(orders) || orders.length === 0) return null;
  const invoiceCustomerId = String(invoice.customer_id || invoice.i_customer_id || '');
  const candidates = orders.filter(order => {
    if (!order || String(order.customer_id || '') !== invoiceCustomerId) return false;
    const linkedReference = normalizeReference(order.bill_reference);
    return !linkedReference;
  });

  return candidates
    .map(order => {
      const result = scoreInvoiceAgainstOrder(order, invoice, orders);
      return result ? { order, score: result.score, reasons: result.reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0] || null;
}
