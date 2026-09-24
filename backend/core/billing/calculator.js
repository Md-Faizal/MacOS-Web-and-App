/**
 * Centralized Billing & Dashboard Calculation Engine
 *
 * Implements server-authoritative calculations for:
 * 1. FIFO debt settlement & remaining invoice balances
 * 2. Key Dashboard Metrics (Total Billed, Collected, Due, Overdue, Collection Rate)
 * 3. Order fulfillment & delivery metrics
 * 4. Receivables aging breakdown (0-30, 31-60, 61+ days)
 * 5. Top performing products and customers
 * 6. Overdue bill reminders
 * 7. Sales metrics (monthly, quarterly, yearly trends)
 *
 * Designed to ensure 100% mathematical parity between Web and Android Native apps.
 */

const SuiteCoreBridge = require('../../../frontend/shared/suite_core_bridge');

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const parts = String(dateStr).split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  }
  return null;
}

function getDateRangeForPreset(preset = 'all', customStart = null, customEnd = null) {
  const now = new Date();
  let startDate = null;
  let endDate = null;
  let rangeText = 'All Time';

  switch (String(preset || 'all').toLowerCase()) {
    case 'this-month':
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      rangeText = 'This Month';
      break;
    case 'last-month':
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      rangeText = 'Last Month';
      break;
    case 'this-quarter':
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
      rangeText = 'This Quarter';
      break;
    }
    case 'this-year':
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      rangeText = 'This Year';
      break;
    case 'custom':
      startDate = customStart ? parseDate(customStart) : null;
      endDate = customEnd ? parseDate(customEnd) : null;
      rangeText = 'Custom Range';
      break;
    case 'all':
    default:
      startDate = null;
      endDate = null;
      rangeText = 'All Time';
      break;
  }
  return { startDate, endDate, rangeText };
}

function getWorkerContactScope(user, tableAlias = 'c') {
  if (user && user.role === 'worker') {
    const safeUserId = String(user.id || user.userId).replace(/'/g, "''");
    return `(${tableAlias}.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = '${safeUserId}') OR ${tableAlias}.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker') OR ${tableAlias}.created_by_user_id = '${safeUserId}')`;
  }
  return null;
}

/**
 * Reusable Chronological FIFO Settlement Calculator
 *
 * @param {Array} bills Array of invoice/bill records
 * @param {Array} payments Array of payment & credit note records
 * @param {Array} contacts Array of contact records (with opening_balance)
 * @returns {Object} billBalances: Map of { [billId]: remainingUnpaidAmount }
 */
function calculateBillSettlement(bills, payments, contacts) {
  const customerBills = {};
  const customerPayments = {};

  bills.forEach(b => {
    const cid = b.customer_id;
    if (!customerBills[cid]) customerBills[cid] = [];
    customerBills[cid].push(b);
  });

  payments.forEach(p => {
    const cid = p.customer_id;
    if (!customerPayments[cid]) customerPayments[cid] = [];
    customerPayments[cid].push(p);
  });

  const contactMap = {};
  contacts.forEach(c => {
    contactMap[c.id] = c;
  });

  const billBalances = {};
  const nowDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

  Object.keys(customerBills).forEach(custId => {
    const cBills = customerBills[custId];
    const cPayments = customerPayments[custId] || [];
    const contact = contactMap[custId];
    const openingBalance = contact ? Number(contact.opening_balance || 0) : 0;

    const rustBills = cBills.map(b => ({
      id: String(b.id),
      customer_id: String(b.customer_id),
      invoice_no: b.invoice_no || '',
      date: b.invoice_date || b.bill_date || b.created_at ? (parseDate(b.invoice_date || b.bill_date || b.created_at)?.toISOString().split('T')[0] || '') : '',
      due_date: b.due_date || null,
      grand_total: Number(b.grand_total !== undefined ? b.grand_total : (b.total !== undefined ? b.total : (b.total_amount || 0)))
    }));

    const rustPayments = cPayments.map(p => ({
      id: String(p.id),
      customer_id: String(p.customer_id),
      reference_no: p.reference_number || p.reference_no || 'PMT',
      date: p.payment_date || p.created_at ? (parseDate(p.payment_date || p.created_at)?.toISOString().split('T')[0] || '') : '',
      amount: Number(p.amount !== undefined && p.amount !== null && p.amount !== '' ? p.amount : (p.credit_amount || 0)),
      is_credit_note: p.type === 'CREDIT_NOTE' || Boolean(p.is_credit_note),
      payment_medium: p.payment_medium || null
    }));

    const stmt = SuiteCoreBridge.calculateStatement(openingBalance, rustBills, rustPayments, nowDays);
    if (!stmt || !stmt.fifo_result || !stmt.fifo_result.bill_settlements) {
      throw new Error('[calculateBillSettlement] SuiteCore WebAssembly calculation failed');
    }

    cBills.forEach(b => {
      const s = stmt.fifo_result.bill_settlements[String(b.id)];
      billBalances[b.id] = s ? s.remaining : Math.max(0, Number((b.grand_total || b.total || 0).toFixed(2)));
    });
  });

  return billBalances;
}

/**
 * Calculate full Dashboard Metrics from SQLite database
 *
 * @param {Object} db SQLite database instance (better-sqlite3)
 * @param {Object} user Current authenticated user from req.user
 * @param {Object} options Calculation options: { preset, startDate, endDate, customerId }
 */
function calculateDashboardMetrics(db, user, options = {}) {
  const { preset = 'all', startDate: optStart, endDate: optEnd, customerId = null } = options;
  const { startDate, endDate, rangeText } = getDateRangeForPreset(preset, optStart, optEnd);
  const now = new Date();

  // 1. Fetch Contacts
  let contactsQuery = `
    SELECT c.id, c.name, c.opening_balance, c.exclude_from_stats
    FROM contacts c
    WHERE 1=1
  `;
  const contactParams = [];
  const workerScope = getWorkerContactScope(user, 'c');
  if (workerScope) {
    contactsQuery += ` AND ${workerScope}`;
  }
  if (customerId) {
    contactsQuery += ` AND c.id = ?`;
    contactParams.push(customerId);
  }
  const allContacts = db.prepare(contactsQuery).all(...contactParams);
  const statsContacts = allContacts.filter(c => Number(c.exclude_from_stats || 0) === 0);
  const allowedContactIds = new Set(statsContacts.map(c => c.id));

  // 2. Fetch Invoices with line items
  let invoicesQuery = `
    SELECT 
      i.id, i.customer_id, i.invoice_no, i.due_date, i.total_amount, i.grand_total,
      i.total_discount, i.total_gst, i.created_at,
      c.name as customer_name, c.exclude_from_stats
    FROM invoices i
    JOIN contacts c ON i.customer_id = c.id
    WHERE 1=1
  `;
  const invoiceParams = [];
  if (workerScope) {
    invoicesQuery += ` AND ${workerScope}`;
  }
  if (customerId) {
    invoicesQuery += ` AND i.customer_id = ?`;
    invoiceParams.push(customerId);
  }
  invoicesQuery += ` ORDER BY i.created_at ASC`;
  const allInvoices = db.prepare(invoicesQuery).all(...invoiceParams);
  const statsInvoices = allInvoices.filter(i => allowedContactIds.has(i.customer_id));

  // Fetch invoice items for top product calculation
  let itemsQuery = `
    SELECT 
      ii.invoice_id, ii.product_id, COALESCE(ii.qty, 0) as quantity, COALESCE(ii.rate, 0) as unit_price,
      COALESCE(ii.final_amount, ii.amount, 0) as total,
      COALESCE(p.name, 'Product #' || ii.product_id) as product_name
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
  `;
  const allItems = db.prepare(itemsQuery).all();
  const invoiceItemsMap = {};
  allItems.forEach(item => {
    if (!invoiceItemsMap[item.invoice_id]) invoiceItemsMap[item.invoice_id] = [];
    invoiceItemsMap[item.invoice_id].push(item);
  });
  statsInvoices.forEach(inv => {
    inv.items = invoiceItemsMap[inv.id] || [];
  });

  // 3. Fetch Payments & Credit Notes
  let paymentsQuery = `
    SELECT 
      p.id, p.customer_id, p.type, p.amount, p.credit_amount, p.payment_medium,
      p.reference_number, p.payment_date, p.created_at,
      c.name as customer_name
    FROM payments p
    JOIN contacts c ON p.customer_id = c.id
    WHERE 1=1
  `;
  const paymentParams = [];
  if (workerScope) {
    paymentsQuery += ` AND ${workerScope}`;
  }
  if (customerId) {
    paymentsQuery += ` AND p.customer_id = ?`;
    paymentParams.push(customerId);
  }
  paymentsQuery += ` ORDER BY p.created_at ASC`;
  const allPayments = db.prepare(paymentsQuery).all(...paymentParams);
  const statsPayments = allPayments.filter(p => allowedContactIds.has(p.customer_id));

  // 4. Fetch Orders
  let ordersQuery = `
    SELECT 
      o.id, o.order_number, o.customer_id, o.current_stage, o.status,
      o.total_amount, o.order_date, o.delivery_date, o.bill_reference, o.created_at,
      c.name as customer_name
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    WHERE 1=1
  `;
  const orderParams = [];
  if (workerScope) {
    ordersQuery += ` AND ${workerScope}`;
  }
  if (customerId) {
    ordersQuery += ` AND o.customer_id = ?`;
    orderParams.push(customerId);
  }
  ordersQuery += ` ORDER BY o.created_at ASC`;
  const allOrders = db.prepare(ordersQuery).all(...orderParams);
  const statsOrders = allOrders.filter(o => !o.customer_id || allowedContactIds.has(o.customer_id));

  // Fetch order items
  let orderItemsQuery = `
    SELECT oi.order_id, oi.product_id, oi.quantity, oi.received_quantity, oi.unit_price as rate, oi.line_total as amount
    FROM order_items oi
  `;
  try {
    const orderItems = db.prepare(orderItemsQuery).all();
    const orderItemsMap = {};
    orderItems.forEach(item => {
      if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
      orderItemsMap[item.order_id].push(item);
    });
    statsOrders.forEach(ord => {
      ord.items = orderItemsMap[ord.id] || [];
    });
  } catch (_) {
    // If order_items table schema differs, orders array remains valid
  }

  // 5. Compute Earliest Date & Filter by Preset Range
  let earliestBillDate = null;
  statsInvoices.forEach(b => {
    const date = parseDate(b.created_at || b.due_date);
    if (date && (!earliestBillDate || date < earliestBillDate)) earliestBillDate = date;
  });

  const periodInvoices = statsInvoices.filter(b => {
    const date = parseDate(b.created_at || b.due_date);
    return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

  const periodPayments = statsPayments.filter(p => {
    const date = parseDate(p.payment_date || p.created_at);
    return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

  const periodOrders = statsOrders.filter(o => {
    const date = parseDate(o.order_date || o.created_at);
    return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

  // 6. FIFO Settlement for Overdue and Receivables Aging
  const billBalances = calculateBillSettlement(statsInvoices, statsPayments, statsContacts);

  // 7. Key Metrics Calculations
  const totalOpeningBalance = statsContacts.reduce((sum, c) => sum + Number(c.opening_balance || 0), 0);
  const activeOpeningBalance = (preset.toLowerCase() === 'all') ? totalOpeningBalance : 0;

  const totalBilled = periodInvoices.reduce((sum, b) => sum + Number(b.grand_total || b.total_amount || 0), 0) + activeOpeningBalance;

  const totalCollected = periodPayments.reduce((sum, p) => {
    if (p.type === 'CREDIT_NOTE') {
      return sum + Number(p.credit_amount || 0);
    }
    return sum + Number(p.amount || 0);
  }, 0);

  const amountDue = Math.max(0, Number((totalBilled - totalCollected).toFixed(2)));

  // Overdue calculation (beyond 30 days based on FIFO)
  let overdueAmount = 0;
  const overdueReminders = [];

  periodInvoices.forEach(bill => {
    const remaining = billBalances[bill.id] || 0;
    if (remaining > 0.01) {
      const billDate = parseDate(bill.created_at || bill.due_date);
      if (billDate) {
        const daysAgo = Math.floor((now - billDate) / (1000 * 60 * 60 * 24));
        if (daysAgo > 30) {
          overdueAmount += remaining;
          overdueReminders.push({
            billId: String(bill.id),
            referenceNo: bill.invoice_no || `INV-${bill.id}`,
            customerName: bill.customer_name || 'Unknown',
            invoiceDate: bill.created_at,
            remainingAmount: Number(remaining.toFixed(2)),
            daysOverdue: daysAgo,
            isCritical: daysAgo > 60
          });
        }
      }
    }
  });
  overdueAmount = Number(overdueAmount.toFixed(2));
  overdueReminders.sort((a, b) => b.daysOverdue - a.daysOverdue);

  // Active Customers Count
  const uniqueCustomerIds = new Set();
  periodInvoices.forEach(b => uniqueCustomerIds.add(b.customer_id));
  periodPayments.forEach(p => uniqueCustomerIds.add(p.customer_id));
  const activeCustomersCount = uniqueCustomerIds.size;

  const collectionRatePercent = totalBilled > 0
    ? Number(((totalCollected / totalBilled) * 100).toFixed(1))
    : 0.0;

  const keyMetrics = {
    totalBilled: Number(totalBilled.toFixed(2)),
    totalBillsCount: periodInvoices.length,
    totalCollected: Number(totalCollected.toFixed(2)),
    paymentsCount: periodPayments.length,
    amountDue,
    overdueAmount,
    activeCustomersCount,
    collectionRatePercent,
    rangeText
  };

  // 8. Order Metrics Calculations
  const totalOrders = periodOrders.length;
  const fulfilledOrders = periodOrders.filter(o => o.status === 'complete' || o.current_stage === 'stage3');
  const fulfilledCount = fulfilledOrders.length;
  const stage1Count = periodOrders.filter(o => o.current_stage === 'stage1').length;
  const stage2Count = periodOrders.filter(o => o.current_stage === 'stage2').length;
  const pendingCount = stage1Count + stage2Count;

  let totalOrderedQty = 0;
  let totalDeliveredQty = 0;
  let totalOrderedValue = 0;
  let totalDeliveredValue = 0;
  let totalLostValue = 0;
  let totalPaidOnOrders = 0;

  periodOrders.forEach(o => {
    let orderOrderedQty = 0;
    let orderDeliveredQty = 0;
    let orderLostVal = 0;

    if (o.items && o.items.length > 0) {
      o.items.forEach(item => {
        const qty = parseInt(item.quantity || 0, 10);
        const recQty = (o.current_stage === 'stage3' || o.status === 'complete') ? parseInt(item.received_quantity || qty, 10) : 0;
        const price = parseFloat(item.rate || item.unit_price || 0);

        orderOrderedQty += qty;
        orderDeliveredQty += recQty;
        orderLostVal += Math.max(0, qty - recQty) * price;
      });
    } else {
      orderOrderedQty = 1;
      const isDelivered = o.current_stage === 'stage3' || o.status === 'complete';
      orderDeliveredQty = isDelivered ? 1 : 0;
      const fallbackVal = parseFloat(o.total_amount || 0);
      orderLostVal = isDelivered ? 0 : fallbackVal;
    }

    totalOrderedQty += orderOrderedQty;
    totalDeliveredQty += orderDeliveredQty;
    totalLostValue += orderLostVal;

    const orderDeliveredVal = (o.current_stage === 'stage3' || o.status === 'complete') ? parseFloat(o.total_amount || 0) : 0;
    totalDeliveredValue += orderDeliveredVal;

    if (o.bill_reference) {
      const matchingBill = statsInvoices.find(b => b.invoice_no === o.bill_reference);
      if (matchingBill) {
        const remaining = billBalances[matchingBill.id] !== undefined ? billBalances[matchingBill.id] : matchingBill.grand_total;
        const paidOnOrder = Math.max(0, matchingBill.grand_total - remaining);
        totalPaidOnOrders += paidOnOrder;
      }
    }
  });

  totalOrderedValue = totalDeliveredValue + totalLostValue;
  const fulfillmentQtyRatio = totalOrderedQty > 0 ? Number(((totalDeliveredQty / totalOrderedQty) * 100).toFixed(1)) : 0.0;
  const settlementPaidRatio = totalDeliveredValue > 0 ? Number(((totalPaidOnOrders / totalDeliveredValue) * 100).toFixed(1)) : 0.0;
  const avgOrderValue = totalOrders > 0 ? Number((totalOrderedValue / totalOrders).toFixed(2)) : 0.0;

  let totalFulfillmentDays = 0;
  let countWithDeliveryDate = 0;
  fulfilledOrders.forEach(o => {
    const oDate = parseDate(o.order_date || o.created_at);
    const dDate = parseDate(o.delivery_date);
    if (oDate && dDate) {
      const diffDays = (dDate - oDate) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0) {
        totalFulfillmentDays += diffDays;
        countWithDeliveryDate++;
      }
    }
  });
  const fulfillmentSpeedDaysText = countWithDeliveryDate > 0 ? `${(totalFulfillmentDays / countWithDeliveryDate).toFixed(1)} Days` : 'N/A';

  const orderMetrics = {
    totalOrders,
    fulfilledOrdersCount: fulfilledCount,
    pendingOrdersCount: pendingCount,
    draftCount: stage1Count,
    qualityCheckCount: stage2Count,
    fulfillmentQtyRatio,
    totalDeliveredQty,
    totalOrderedQty,
    settlementPaidRatio,
    totalPaidOnOrders: Number(totalPaidOnOrders.toFixed(2)),
    totalDeliveredValue: Number(totalDeliveredValue.toFixed(2)),
    totalOrderedValue: Number(totalOrderedValue.toFixed(2)),
    avgOrderValue,
    totalLostValue: Number(totalLostValue.toFixed(2)),
    fulfillmentSpeedDaysText,
    rangeText
  };

  // 9. Receivables Aging Buckets via Rust SuiteCore Analytics Engine
  const unpaidItems = [];
  periodInvoices.forEach(bill => {
    const remaining = billBalances[bill.id] || 0;
    if (remaining > 0.01) {
      const billDate = parseDate(bill.created_at || bill.due_date);
      const daysAgo = billDate ? Math.max(0, Math.floor((now - billDate) / (1000 * 60 * 60 * 24))) : 0;
      unpaidItems.push({
        bill_id: String(bill.id),
        days_elapsed: daysAgo,
        remaining_amount: remaining
      });
    }
  });

  const rustAging = SuiteCoreBridge.calculateAging(unpaidItems, 0, true);
  if (!rustAging) {
    throw new Error('[calculateDashboardMetrics] SuiteCore WebAssembly calculateAging failed');
  }

  const receivablesAging = {
    outstanding0to30: rustAging.outstanding0to30,
    outstanding31to60: rustAging.outstanding31to60,
    outstanding61Plus: rustAging.outstanding61Plus,
    totalOutstanding: rustAging.totalOutstanding
  };

  // 10. Top Products & Top Customers
  const productMap = {};
  periodInvoices.forEach(bill => {
    const items = bill.items || [];
    items.forEach(item => {
      const name = item.product_name || 'Unknown';
      if (!productMap[name]) {
        productMap[name] = { name, quantity: 0, revenue: 0 };
      }
      productMap[name].quantity += Number(item.quantity || 0);
      productMap[name].revenue += Number(item.total || (Number(item.quantity || 0) * Number(item.unit_price || 0)));
    });
  });

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(p => ({
      name: p.name,
      quantity: Math.round(p.quantity),
      revenue: Number(p.revenue.toFixed(2))
    }));

  const customerMap = {};
  periodInvoices.forEach(bill => {
    const cId = String(bill.customer_id);
    const cName = bill.customer_name || 'Unknown';
    if (!customerMap[cId]) {
      customerMap[cId] = { id: cId, name: cName, ordersCount: 0, billed: 0, dueBalance: 0 };
    }
    customerMap[cId].billed += Number(bill.grand_total || bill.total_amount || 0);
  });

  periodOrders.forEach(order => {
    const cId = String(order.customer_id);
    const cName = order.customer_name || 'Unknown';
    if (!customerMap[cId]) {
      customerMap[cId] = { id: cId, name: cName, ordersCount: 0, billed: 0, dueBalance: 0 };
    }
    customerMap[cId].ordersCount += 1;
  });

  Object.keys(customerMap).forEach(cId => {
    const customerBillsList = statsInvoices.filter(b => String(b.customer_id) === cId);
    let customerDue = 0;
    customerBillsList.forEach(b => {
      customerDue += billBalances[b.id] || 0;
    });
    const contact = statsContacts.find(c => String(c.id) === cId);
    const opening = contact ? Number(contact.opening_balance || 0) : 0;
    if (opening > 0) {
      const paymentsTotal = statsPayments
        .filter(p => String(p.customer_id) === cId)
        .reduce((s, p) => s + Number(p.amount || p.credit_amount || 0), 0);
      const billsTotal = customerBillsList.reduce((s, b) => s + Number(b.grand_total || b.total_amount || 0), 0);
      customerDue = Math.max(0, billsTotal + opening - paymentsTotal);
    }
    customerMap[cId].dueBalance = Number(customerDue.toFixed(2));
    customerMap[cId].billed = Number(customerMap[cId].billed.toFixed(2));
  });

  const topCustomers = Object.values(customerMap)
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 5);

  // 11. Sales Metrics Summary (Monthly, Quarterly, Yearly)
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(currentMonth / 3);

  const currentMonthBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const lastMonthBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    return d && d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });

  const currentQuarterBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    return d && Math.floor(d.getMonth() / 3) === currentQuarter && d.getFullYear() === currentYear;
  });
  const lastQuarterBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    const prevQ = currentQuarter === 0 ? 3 : currentQuarter - 1;
    const prevQYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
    return d && Math.floor(d.getMonth() / 3) === prevQ && d.getFullYear() === prevQYear;
  });

  const currentYearBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    return d && d.getFullYear() === currentYear;
  });
  const lastYearBills = statsInvoices.filter(b => {
    const d = parseDate(b.created_at || b.due_date);
    return d && d.getFullYear() === currentYear - 1;
  });

  const sumBills = arr => arr.reduce((s, b) => s + Number(b.grand_total || b.total_amount || 0), 0);
  const curMonthSales = sumBills(currentMonthBills);
  const prevMonthSales = sumBills(lastMonthBills);
  const curQuarterSales = sumBills(currentQuarterBills);
  const prevQuarterSales = sumBills(lastQuarterBills);
  const curYearSales = sumBills(currentYearBills);
  const prevYearSales = sumBills(lastYearBills);

  const calcChange = (cur, prev) => prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(1)) : 0.0;

  const totalAllBillsAmount = statsInvoices.reduce((s, b) => s + Number(b.grand_total || b.total_amount || 0), 0);
  const averageBill = statsInvoices.length > 0 ? Number((totalAllBillsAmount / statsInvoices.length).toFixed(2)) : 0.0;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const curMonthLabel = `${months[currentMonth]} ${currentYear}`;
  const qStart = currentQuarter * 3;
  const curQuarterLabel = `${months[qStart]}-${months[qStart + 2]} ${currentYear}`;

  const salesMetrics = {
    monthly: {
      title: 'Monthly Sales',
      periodLabel: curMonthLabel,
      currentSales: Number(curMonthSales.toFixed(2)),
      percentageChange: calcChange(curMonthSales, prevMonthSales)
    },
    quarterly: {
      title: 'Quarterly Sales',
      periodLabel: curQuarterLabel,
      currentSales: Number(curQuarterSales.toFixed(2)),
      percentageChange: calcChange(curQuarterSales, prevQuarterSales)
    },
    yearly: {
      title: 'Yearly Sales',
      periodLabel: String(currentYear),
      currentSales: Number(curYearSales.toFixed(2)),
      percentageChange: calcChange(curYearSales, prevYearSales)
    },
    averageBill,
    avgBillChange: 0.0
  };

  return {
    success: true,
    keyMetrics,
    orderMetrics,
    receivablesAging,
    salesMetrics,
    topProducts,
    topCustomers,
    overdueReminders
  };
}

/**
 * Calculate Customer Statement of Account with full FIFO settlement & ledger reconciliation
 * Matches web customer-ledger.js exactly.
 *
 * @param {Object} db SQLite database instance (better-sqlite3)
 * @param {string|number} customerId Target customer ID
 * @param {Object} user Current authenticated user from req.user
 * @param {Object} options Options: { startDate, endDate }
 */
function calculateCustomerStatement(db, customerId, user = null, options = {}) {
  // 1. Fetch customer
  const customer = db.prepare(`
    SELECT id, name, phone, email, address, gstin, opening_balance, active, exclude_from_stats
    FROM contacts
    WHERE id = ? AND (type IS NULL OR LOWER(type) = 'customer')
  `).get(customerId);

  if (!customer) {
    return { success: false, error: 'Customer not found' };
  }

  // Worker check if applicable
  if (user && user.role === 'worker') {
    const safeUserId = String(user.id || user.userId).replace(/'/g, "''");
    const hasAccess = db.prepare(`
      SELECT 1 FROM contacts c
      WHERE c.id = ? AND (
        c.id IN (SELECT contact_id FROM user_contact_access WHERE user_id = ?)
        OR c.created_by_user_id IN (SELECT id FROM users WHERE role = 'worker')
        OR c.created_by_user_id = ?
      )
    `).get(customerId, safeUserId, safeUserId);

    if (!hasAccess) {
      return { success: false, error: 'Access denied to this customer' };
    }
  }

  // 2. Fetch app settings for bank details
  let app_settings = {};
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get();
    if (tableExists) {
      const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all();
      for (const r of rows) {
        app_settings[r.setting_key] = r.setting_value;
      }
    }
  } catch (err) {
    // Ignore, fallback to bankDefaults
  }

  const bankDefaults = {
    payment_upi_id: '7749089400@hdfc',
    bank_account_holder: 'MD  FAIZAL',
    bank_account_number: '50100673684509',
    bank_ifsc: 'HDFC0000236',
    bank_branch: 'CUTTACK - ODISHA',
    bank_mmid: '9240072',
    bank_show_mmid: 'true',
    bank_account_type: 'Savings Account'
  };

  const bank = {
    upi_id: app_settings.payment_upi_id || bankDefaults.payment_upi_id,
    account_holder: app_settings.bank_account_holder || bankDefaults.bank_account_holder,
    account_number: app_settings.bank_account_number || bankDefaults.bank_account_number,
    ifsc: app_settings.bank_ifsc || bankDefaults.bank_ifsc,
    branch: app_settings.bank_branch || bankDefaults.bank_branch,
    mmid: app_settings.bank_mmid || bankDefaults.bank_mmid,
    show_mmid: app_settings.bank_show_mmid !== undefined ? String(app_settings.bank_show_mmid) : 'true',
    account_type: app_settings.bank_account_type || bankDefaults.bank_account_type
  };

  // 3. Fetch bills and payments
  const rawBills = db.prepare(`
    SELECT id, customer_id, invoice_no, invoice_date, due_date, grand_total, total_amount, previous_due, created_at, updated_at
    FROM invoices
    WHERE customer_id = ?
    ORDER BY COALESCE(invoice_date, created_at) ASC
  `).all(customerId);

  const rawPayments = db.prepare(`
    SELECT id, customer_id, reference_number, payment_date, created_at, amount, credit_amount, type, payment_medium, notes
    FROM payments
    WHERE customer_id = ?
    ORDER BY COALESCE(payment_date, created_at) ASC
  `).all(customerId);

  const openingBalance = Number(customer.opening_balance || 0);

  // 4. Run Rust SuiteCore FIFO settlement and customer statement generation
  const nowDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const rustBills = rawBills.map(b => ({
    id: String(b.id),
    customer_id: String(b.customer_id),
    invoice_no: b.invoice_no || '',
    date: b.invoice_date || b.created_at ? (parseDate(b.invoice_date || b.created_at)?.toISOString().split('T')[0] || '') : '',
    due_date: b.due_date || null,
    grand_total: Number(b.grand_total !== undefined ? b.grand_total : (b.total_amount || 0))
  }));

  const rustPayments = rawPayments.map(p => ({
    id: String(p.id),
    customer_id: String(p.customer_id),
    reference_no: p.reference_number || 'PMT',
    date: p.payment_date || p.created_at ? (parseDate(p.payment_date || p.created_at)?.toISOString().split('T')[0] || '') : '',
    amount: Number(p.type === 'CREDIT_NOTE' ? (p.credit_amount || 0) : (p.amount || 0)),
    is_credit_note: p.type === 'CREDIT_NOTE',
    payment_medium: p.payment_medium || null
  }));

  const rustStmt = SuiteCoreBridge.calculateStatement(openingBalance, rustBills, rustPayments, nowDays);
  if (!rustStmt || !rustStmt.fifo_result) {
    throw new Error('[calculateCustomerStatement] Rust SuiteCore WebAssembly calculation failed');
  }

  const settlementMap = rustStmt.fifo_result.bill_settlements;
  const paymentAllocMap = rustStmt.fifo_result.payment_allocations;
  const statementRows = rustStmt.statement_rows;
  const rustSummary = rustStmt.summary;

  // Unpaid items aging calculated via Rust Analytics Engine
  const unpaidItems = [];
  rawBills.forEach(b => {
    const sInfo = settlementMap[String(b.id)];
    if (sInfo && !sInfo.settled) {
      unpaidItems.push({
        bill_id: String(b.id),
        days_elapsed: sInfo.days,
        remaining_amount: Number(b.grand_total || b.total_amount || 0)
      });
    }
  });

  const rustAging = SuiteCoreBridge.calculateAging(unpaidItems, openingBalance, false);
  if (!rustAging) {
    throw new Error('[calculateCustomerStatement] Rust SuiteCore WebAssembly calculateAging failed');
  }

  const totalPurchases = rustSummary.total_purchases;
  const currentDue = rustSummary.current_due;
  const totalSettled = rustSummary.total_settled;
  const paidPercent = rustSummary.paid_percent;
  const totalPaid = rustSummary.total_paid;
  const totalCredits = rustSummary.total_credits;
  const totalCollected = rustSummary.total_collected;
  const ageing0to7 = rustAging.ageing_0_to_7;
  const ageing8to15 = rustAging.ageing_8_to_15;
  const ageing16to30 = rustAging.ageing_16_to_30;
  const ageingOver30 = rustAging.ageing_over_30;

  const sortedBills = [...rawBills].sort((a, b) => {
    const da = parseDate(a.invoice_date || a.created_at) || 0;
    const db = parseDate(b.invoice_date || b.created_at) || 0;
    return da - db;
  });

  const sortedPayments = [...rawPayments].sort((a, b) => {
    const da = parseDate(a.payment_date || a.created_at) || 0;
    const db = parseDate(b.payment_date || b.created_at) || 0;
    return da - db;
  });

  // 7. Enriched bills (newest first for standard display)
  const enrichedBills = [...sortedBills].reverse().map(b => {
    const sInfo = settlementMap[String(b.id)] || { settled: false, days: 0, paid: 0, remaining: Number(b.grand_total || 0), status: 'UNPAID' };
    const billAmt = Number(b.grand_total || b.total_amount || 0);
    return {
      id: b.id,
      invoice_no: b.invoice_no,
      invoiceNo: b.invoice_no,
      invoice_date: b.invoice_date || b.created_at,
      invoiceDate: b.invoice_date || b.created_at,
      due_date: b.due_date,
      created_at: b.created_at,
      amount: billAmt, // for web customer-ledger.js
      grand_total: billAmt, // for Android Bill model
      grandTotal: billAmt, // for Kotlin alias
      customer_id: customer.id,
      customerId: String(customer.id),
      customer_name: customer.name,
      customerName: customer.name,
      settled: sInfo.settled,
      is_settled: sInfo.settled,
      settlement_days: sInfo.days,
      days_overdue: sInfo.days,
      paid_amount: sInfo.paid,
      paidAmount: sInfo.paid,
      remaining_amount: sInfo.remaining,
      remainingAmount: sInfo.remaining,
      status: sInfo.status
    };
  });

  // 8. Enriched payments (newest first)
  const enrichedPayments = [...sortedPayments].reverse().map(p => {
    const aInfo = paymentAllocMap[String(p.id)] || { allocated: 0, remaining: 0, allocated_percent: 0 };
    const isCredit = p.type === 'CREDIT_NOTE';
    const amount = Number(p.amount || 0);
    const creditAmount = Number(p.credit_amount || 0);
    return {
      id: p.id,
      reference_number: p.reference_number || 'PMT',
      referenceNo: p.reference_number || 'PMT',
      payment_date: p.payment_date || p.created_at,
      paymentDate: p.payment_date || p.created_at,
      created_at: p.created_at,
      amount,
      credit_amount: creditAmount,
      creditAmount,
      type: p.type || 'PAYMENT',
      payment_medium: p.payment_medium || 'Cash',
      paymentMedium: p.payment_medium || 'Cash',
      payment_mode: p.payment_medium || 'Cash',
      paymentMode: p.payment_medium || 'Cash',
      notes: p.notes,
      customer_id: customer.id,
      customerId: String(customer.id),
      customer_name: customer.name,
      customerName: customer.name,
      allocated_amount: aInfo.allocated,
      allocatedAmount: aInfo.allocated,
      unallocated_amount: aInfo.remaining,
      unallocatedAmount: aInfo.remaining,
      allocated_percent: aInfo.allocated_percent
    };
  });

  return {
    success: true,
    customer: {
      id: customer.id,
      customerId: String(customer.id),
      name: customer.name,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      gstin: customer.gstin,
      opening_balance: openingBalance,
      openingBalance: openingBalance,
      current_due: currentDue,
      currentDue: currentDue,
      balance: currentDue,
      active: customer.active || 'ACTIVE',
      status: currentDue > 0 ? 'PENDING' : 'SETTLED'
    },
    bank,
    summary: {
      total_purchases: Number(totalPurchases.toFixed(2)),
      total_billed: Number(totalPurchases.toFixed(2)),
      total_paid: Number(totalPaid.toFixed(2)),
      total_credits: Number(totalCredits.toFixed(2)),
      total_collected: Number(totalCollected.toFixed(2)),
      current_due: currentDue,
      total_settled: Number(totalSettled.toFixed(2)),
      paid_percent: paidPercent,
      total_bills: sortedBills.length,
      total_payments: sortedPayments.length,
      ageing_0_to_7: Number(ageing0to7.toFixed(2)),
      ageing_8_to_15: Number(ageing8to15.toFixed(2)),
      ageing_16_to_30: Number(ageing16to30.toFixed(2)),
      ageing_over_30: Number(ageingOver30.toFixed(2))
    },
    stats: {
      total_bills: sortedBills.length,
      total_payments: sortedPayments.filter(p => p.type === 'PAYMENT').length,
      total_billed: Number(totalPurchases.toFixed(2)),
      total_collected: Number(totalCollected.toFixed(2))
    },
    statement_rows: statementRows,
    statementRows: statementRows,
    bills: enrichedBills,
    payments: enrichedPayments,
    settlement_map: settlementMap,
    payment_alloc_map: paymentAllocMap
  };
}

module.exports = {
  calculateDashboardMetrics,
  calculateCustomerStatement,
  calculateBillSettlement,
  calculateBillItemsAndSummary,
  getDateRangeForPreset,
  parseDate,
  isStrictlyPrior
};

/**
 * Pure chronological sequence ordering comparator for ledgers & dues
 */
function isStrictlyPrior(dateA, createdA, idA, dateB, createdB, idB) {
  const normalize = (d, c) => {
    let t = d ? new Date(d) : new Date(c);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  };

  const dayA = normalize(dateA, createdA);
  const dayB = normalize(dateB, createdB);

  if (dayA < dayB) return true;
  if (dayA > dayB) return false;

  const exactA = new Date(createdA).getTime();
  const exactB = new Date(createdB).getTime();
  if (exactA < exactB) return true;
  if (exactA > exactB) return false;

  if (idA !== undefined && idB !== undefined) return idA < idB;
  return false;
}

const BillCalculator = require('../../../frontend/shared/bill-calculator');

/**
 * Server-Authoritative Bill & Line Item Calculation Engine
 *
 * Takes raw item and customer parameters and executes exact business arithmetic:
 * - 4.77% GST reverse reduction (when enabled)
 * - Multi-tier cascading discounts (disc1, disc2)
 * - GST percentage split (SGST 50% / CGST 50% or IGST)
 * - Scheme parsing (e.g. 5+1 free items)
 * - Subtotal, discount sums, GST sums, round-off and grand total
 * - Chronological sequence-based customer previous due and projected balance
 */
function calculateBillItemsAndSummary(db, { customerId, customerName, items = [], roundOffEnabled = true, invoiceDate = null, user = null }) {
  // 1. Resolve customer
  let finalCustomerId = customerId;
  let customerRecord = null;
  if (!finalCustomerId && customerName) {
    customerRecord = db.prepare('SELECT * FROM contacts WHERE name = ? COLLATE NOCASE').get(customerName);
    if (customerRecord) finalCustomerId = customerRecord.id;
  } else if (finalCustomerId) {
    customerRecord = db.prepare('SELECT * FROM contacts WHERE id = ?').get(finalCustomerId);
  }

  // 2. Compute sequence-based previous due for customer
  let openingBalance = 0;
  let previousDue = 0;
  let customerInfo = null;

  if (customerRecord) {
    openingBalance = Number(customerRecord.opening_balance || 0);
    const thisInvoiceDate = invoiceDate || null;
    const thisInvoiceCreated = new Date().toISOString();

    const allInvoices = db.prepare(`
      SELECT id, invoice_no, grand_total, invoice_date, created_at FROM invoices
      WHERE customer_id = ?
    `).all(customerRecord.id);

    const allPayments = db.prepare(`
      SELECT id, reference_number, amount, payment_date, created_at FROM payments
      WHERE customer_id = ? AND type = 'PAYMENT'
    `).all(customerRecord.id);

    const allCredits = db.prepare(`
      SELECT id, reference_number, credit_amount, payment_date, created_at FROM payments
      WHERE customer_id = ? AND type = 'CREDIT_NOTE'
    `).all(customerRecord.id);

    const priorInvoiceTotal = allInvoices
      .filter(inv => isStrictlyPrior(inv.invoice_date, inv.created_at, inv.id, thisInvoiceDate, thisInvoiceCreated, undefined))
      .reduce((sum, inv) => sum + Number(inv.grand_total || 0), 0);

    const totalPayments = allPayments
      .filter(p => isStrictlyPrior(p.payment_date, p.created_at, p.id, thisInvoiceDate, thisInvoiceCreated, undefined))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const totalCredits = allCredits
      .filter(c => isStrictlyPrior(c.payment_date, c.created_at, c.id, thisInvoiceDate, thisInvoiceCreated, undefined))
      .reduce((sum, c) => sum + Number(c.credit_amount || 0), 0);

    previousDue = Number((openingBalance + priorInvoiceTotal - (totalPayments + totalCredits)).toFixed(2));

    customerInfo = {
      id: customerRecord.id,
      name: customerRecord.name,
      phone: customerRecord.phone || '',
      opening_balance: openingBalance,
      previous_due: previousDue,
      current_due: previousDue
    };
  }

  // 3. Process line items using BillCalculator
  const processedItems = (items || []).map((rawItem, idx) => {
    let productId = rawItem.product_id || rawItem.productId || null;
    let productName = rawItem.product_name || rawItem.productName || rawItem.name || '';
    let variantId = rawItem.variant_id || rawItem.variantId || null;
    let batchId = rawItem.batch_id || rawItem.batchId || null;
    let packValue = rawItem.pack_value || rawItem.packValue || rawItem.pack || '';
    let packType = rawItem.pack_type || rawItem.packType || '';
    let batchNo = rawItem.batch_no || rawItem.batchNo || rawItem.batch || '';
    let expDate = rawItem.exp_date || rawItem.expDate || rawItem.exp || '';

    // If productId is missing but productName is given, look up in DB
    if (!productId && productName) {
      const prod = db.prepare('SELECT id, name FROM products WHERE name = ? COLLATE NOCASE').get(productName);
      if (prod) {
        productId = prod.id;
        productName = prod.name;
      }
    } else if (productId && !productName) {
      const prod = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId);
      if (prod) productName = prod.name;
    }

    // Lookup variant if needed
    if (productId && !variantId && packValue && packType) {
      const v = db.prepare('SELECT id FROM variants WHERE product_id = ? AND pack_size_value = ? AND pack_size_type = ?').get(productId, packValue, packType);
      if (v) variantId = v.id;
    }

    // Lookup batch if needed
    if (!batchId && batchNo) {
      if (variantId) {
        const b = db.prepare('SELECT id, exp_date, mrp FROM batches WHERE variant_id = ? AND batch_no = ?').get(variantId, batchNo);
        if (b) {
          batchId = b.id;
          if (!expDate) expDate = b.exp_date;
        }
      } else if (productId) {
        const b = db.prepare('SELECT b.id, b.exp_date, b.mrp FROM batches b JOIN variants v ON b.variant_id = v.id WHERE v.product_id = ? AND b.batch_no = ?').get(productId, batchNo);
        if (b) {
          batchId = b.id;
          if (!expDate) expDate = b.exp_date;
        }
      }
    }

    const calculated = BillCalculator.calculateLineItem({
      rate: rawItem.rate !== undefined ? rawItem.rate : (rawItem.mrp || rawItem.price || 0),
      mrp: rawItem.mrp !== undefined ? rawItem.mrp : (rawItem.rate || 0),
      qty: rawItem.qty !== undefined ? rawItem.qty : (rawItem.quantity || 1),
      disc1: rawItem.disc1 !== undefined ? rawItem.disc1 : (rawItem.discount_1_percent || rawItem.discount1Percent || 0),
      disc2: rawItem.disc2 !== undefined ? rawItem.disc2 : (rawItem.discount_2_percent || rawItem.discount2Percent || 0),
      gst_percent: rawItem.gst_percent !== undefined ? rawItem.gst_percent : (rawItem.gstPercent || rawItem.gstTotal || 0),
      gstTotal: rawItem.gstTotal !== undefined ? rawItem.gstTotal : (rawItem.gst_percent || rawItem.gstPercent || 0),
      sgst: rawItem.sgst !== undefined ? rawItem.sgst : (rawItem.sgst_percent || 0),
      cgst: rawItem.cgst !== undefined ? rawItem.cgst : (rawItem.cgst_percent || 0),
      gst_reverse: Boolean(rawItem.gst_reverse !== undefined ? rawItem.gst_reverse : rawItem.gstReverse)
    });

    const freeCount = BillCalculator.calculateFreeItems(
      Number(rawItem.qty !== undefined ? rawItem.qty : (rawItem.quantity || 1)),
      rawItem.scheme || ''
    );

    return {
      index: idx,
      product_id: productId,
      productId: productId ? String(productId) : null,
      product_name: productName || 'Product',
      productName: productName || 'Product',
      variant_id: variantId,
      variantId: variantId ? String(variantId) : null,
      batch_id: batchId,
      batchId: batchId ? String(batchId) : null,
      pack_value: packValue,
      pack_type: packType,
      batch_no: batchNo,
      exp_date: expDate,
      scheme: rawItem.scheme || '',
      free: freeCount,
      rate: calculated.rate,
      discounted_rate: calculated.discounted_rate,
      qty: calculated.qty,
      quantity: calculated.qty,
      amount: calculated.amount,
      discount_1_percent: calculated.discount_1_percent,
      discount_1_amount: calculated.discount_1_amount,
      discount_2_percent: calculated.discount_2_percent,
      discount_2_amount: calculated.discount_2_amount,
      gst_percent: calculated.gst_percent,
      gst_amount: calculated.gst_amount,
      sgst_amount: calculated.sgst_amount,
      cgst_amount: calculated.cgst_amount,
      final_amount: calculated.final_amount,
      gst_reverse: calculated.gst_reverse,
      finalAmount: calculated.final_amount,
      discount1Percent: calculated.discount_1_percent,
      discount1Amount: calculated.discount_1_amount,
      discount2Percent: calculated.discount_2_percent,
      discount2Amount: calculated.discount_2_amount,
      gstPercent: calculated.gst_percent,
      gstAmount: calculated.gst_amount
    };
  });

  // 4. Summary calculation
  const rawSummary = BillCalculator.calculateBillSummary(processedItems);
  let finalGrandTotal = rawSummary.grand_total;
  let finalRoundOff = rawSummary.round_off;

  if (roundOffEnabled === false) {
    finalGrandTotal = Number(rawSummary.subtotal.toFixed(2));
    finalRoundOff = 0;
  }

  const summary = {
    subtotal: rawSummary.subtotal,
    total_amount: rawSummary.total_amount,
    total_discount: rawSummary.total_discount,
    total_gst: rawSummary.total_gst,
    total_sgst: rawSummary.total_sgst,
    total_cgst: rawSummary.total_cgst,
    round_off: finalRoundOff,
    grand_total: finalGrandTotal,
    discountTotal: rawSummary.total_discount,
    taxTotal: rawSummary.total_gst,
    grandTotal: finalGrandTotal,
    roundOff: finalRoundOff
  };

  const projectedDue = Number((previousDue + finalGrandTotal).toFixed(2));

  return {
    success: true,
    customer: customerInfo,
    items: processedItems,
    summary,
    previous_due: previousDue,
    projected_due: projectedDue,
    projectedDue
  };
}
