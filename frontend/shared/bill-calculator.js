/**
 * BILL CALCULATOR - Shared calculation logic for all billing pages
 * 
 * This module provides consistent calculation logic for:
 * - Creating new bills
 * - Editing existing bills
 * - Calculating line item totals
 * - Calculating bill summary totals
 * - Exporting bill data
 * 
 * Key features:
 * - Consistent discount handling (percentage vs monetary)
 * - Proper tax calculation on discounted amounts
 * - SGST/CGST split handling
 * - Rounding to nearest rupee
 * - Audit trail (stores calculated amounts for verification)
 */

function getSuiteCoreBridge() {
  if (typeof window !== 'undefined' && window.SuiteCoreBridge) {
    return window.SuiteCoreBridge;
  }
  if (typeof require === 'function') {
    try {
      return require('./suite_core_bridge');
    } catch (_) {}
  }
  return null;
}

// Browser asynchronous WebAssembly initialization via SuiteCoreBridge
if (typeof window !== 'undefined') {
  if (window.SuiteCoreBridge && typeof window.SuiteCoreBridge.initBrowser === 'function') {
    window.SuiteCoreBridge.initBrowser().then(loaded => {
      if (loaded && typeof console !== 'undefined' && console.log) {
        console.log('[LOAD] bill-calculator.js: SuiteCore WebAssembly Accelerated (WASM: YES)');
      }
    });
  }
}

class BillCalculator {
  static getBridge() {
    return getSuiteCoreBridge();
  }

  static isWasmLoaded() {
    const bridge = getSuiteCoreBridge();
    return !!(bridge && bridge.isWasmLoaded());
  }

  static async ensureReady() {
    const bridge = getSuiteCoreBridge();
    if (bridge && typeof bridge.ensureReady === 'function') {
      return await bridge.ensureReady();
    }
    return bridge ? bridge.isWasmLoaded() : false;
  }

  /**
   * Calculate details for a single product line item
   * 
   * @param {Object} product - Product with: rate, qty, disc1, disc2, sgst, cgst, gstTotal, scheme
   * @returns {Object} Calculated values: amount, discount_1_amount, discount_2_amount, gst_amount, final_amount
   */
  static calculateLineItem(product) {
    // Normalize input values
    let rate = parseFloat(product.mrp || product.rate || 0) || 0;
    const qty = parseInt(product.qty || 1) || 1;
    const disc1Percent = parseFloat(product.disc1 || product.discount_1_percent || 0) || 0;
    const disc2Percent = parseFloat(product.disc2 || product.discount_2_percent || 0) || 0;
    const gstReverse = product.gst_reverse || false;

    // Resolve tax percentages cleanly and robustly
    let gstTotal = 0;
    let sgstPercent = 0;
    let cgstPercent = 0;

    if (product.gstTotal !== undefined && product.gstTotal !== null && !isNaN(product.gstTotal)) {
      gstTotal = parseFloat(product.gstTotal) || 0;
      sgstPercent = gstTotal / 2;
      cgstPercent = gstTotal / 2;
    } else if (product.gst_percent !== undefined && product.gst_percent !== null && !isNaN(product.gst_percent)) {
      gstTotal = parseFloat(product.gst_percent) || 0;
      sgstPercent = gstTotal / 2;
      cgstPercent = gstTotal / 2;
    } else if (product.sgst !== undefined || product.cgst !== undefined || product.sgst_percent !== undefined || product.cgst_percent !== undefined) {
      const s = parseFloat(product.sgst || product.sgst_percent || 0) || 0;
      const c = parseFloat(product.cgst || product.cgst_percent || 0) || 0;
      sgstPercent = s;
      cgstPercent = c > 0 ? c : s;
      gstTotal = sgstPercent + cgstPercent;
    }

    const bridge = getSuiteCoreBridge();
    if (!bridge || !bridge.isWasmLoaded()) {
      throw new Error('[BillCalculator] SuiteCore WebAssembly engine is not loaded. Cannot execute financial calculation.');
    }

    const fast = bridge.calcLineItemFast(rate, qty, disc1Percent, disc2Percent, gstTotal, gstReverse);
    if (!fast) {
      throw new Error('[BillCalculator] SuiteCore WebAssembly calculation returned null');
    }

    const effectiveRate = gstReverse ? (rate * (1 - 0.0477)) : rate;
    const discountedRate = effectiveRate * (1 - disc1Percent / 100);
    const amountAfterDisc2 = fast.amount - fast.discount_1_amount - fast.discount_2_amount;

    return {
      rate: parseFloat(effectiveRate.toFixed(2)),
      discounted_rate: parseFloat(discountedRate.toFixed(2)),
      qty: qty,
      amount: parseFloat(fast.amount.toFixed(2)),
      discount_1_percent: disc1Percent,
      discount_1_amount: parseFloat(fast.discount_1_amount.toFixed(2)),
      discount_2_percent: disc2Percent,
      discount_2_amount: parseFloat(fast.discount_2_amount.toFixed(2)),
      gst_percent: gstTotal,
      gst_amount: parseFloat(fast.gst_amount.toFixed(2)),
      sgst_amount: parseFloat(fast.sgst_amount.toFixed(2)),
      cgst_amount: parseFloat(fast.cgst_amount.toFixed(2)),
      final_amount: parseFloat(fast.final_amount.toFixed(2)),
      gst_reverse: gstReverse,
      disc1: parseFloat(fast.discount_1_amount.toFixed(2)),
      disc2: parseFloat(fast.discount_2_amount.toFixed(2)),
      discountedAmount: parseFloat(amountAfterDisc2.toFixed(2)),
      sgstValue: parseFloat(fast.sgst_amount.toFixed(2)),
      cgstValue: parseFloat(fast.cgst_amount.toFixed(2)),
      finalAmount: parseFloat(fast.final_amount.toFixed(2)),
      lineTotal: parseFloat(fast.final_amount.toFixed(2))
    };
  }

  /**
   * Calculate bill summary totals from array of line items
   * 
   * @param {Array} items - Array of calculated line items
   * @returns {Object} Bill summary: subtotal, total_discount, total_gst, round_off, grand_total
   */
  static calculateBillSummary(items) {
    const bridge = getSuiteCoreBridge();
    if (!bridge || !bridge.isWasmLoaded()) {
      throw new Error('[BillCalculator] SuiteCore WebAssembly engine is not loaded. Cannot execute financial calculation.');
    }
    const summary = bridge.calculateBillSummary(items, 0.0, true);
    if (!summary) {
      throw new Error('[BillCalculator] SuiteCore WebAssembly calculateBillSummary returned null');
    }
    return {
      subtotal: summary.subtotal,
      total_amount: summary.total_amount,
      total_discount: summary.total_discount,
      total_gst: summary.total_gst,
      total_sgst: summary.total_sgst,
      total_cgst: summary.total_cgst,
      round_off: summary.round_off,
      grand_total: summary.grand_total,
      discountTotal: summary.discountTotal,
      taxTotal: summary.taxTotal,
      grandTotal: summary.grandTotal,
      roundOff: summary.roundOff
    };
  }

  /**
   * Calculate free items based on scheme (e.g., "5+1" means buy 5, get 1 free)
   * 
   * @param {number} qty - Quantity ordered
   * @param {string} scheme - Scheme format (e.g., "5+1", "10+2")
   * @returns {number} Free items count
   */
  static calculateFreeItems(qty, scheme) {
    if (!scheme || scheme === '') return 0;

    const parts = scheme.split('+');
    if (parts.length !== 2) return 0;

    const itemsRequired = parseInt(parts[0]) || 0;
    const freeItems = parseInt(parts[1]) || 0;

    if (itemsRequired === 0) return 0;

    // Calculate how many complete sets of itemsRequired fit into qty
    const completeSets = Math.floor(qty / itemsRequired);
    return completeSets * freeItems;
  }

  /**
   * Convert stored data (from database) to frontend format
   * Used when loading bills for editing
   * 
   * @param {Object} dbItem - Line item from database
   * @returns {Object} Frontend-formatted product object
   */
  static dbToFrontend(dbItem) {
    // Get discount values from database
    const disc1Percent = parseFloat(dbItem.discount_1_percent || 0) || 0;
    const disc2Percent = parseFloat(dbItem.discount_2_percent || 0) || 0;

    // Get the RELIABLE percentage from database (this is always correct)
    const gstTotal = parseFloat(dbItem.gst_percent || 0) || 0;
    const discountedAmount = (dbItem.rate * dbItem.qty) - parseFloat(dbItem.discount_1_amount || 0) - parseFloat(dbItem.discount_2_amount || 0);
    
    // IMPORTANT: Don't trust stored sgst_amount/cgst_amount - they may have been calculated wrong
    // Instead, just split the gst_percent 50/50 (standard GST rule)
    // The gst_percent is the reliable value that was stored correctly
    const sgstPercent = gstTotal / 2;
    const cgstPercent = gstTotal / 2;

    return {
      id: dbItem.id,
      product_id: dbItem.product_id,
      name: dbItem.product_name || 'Unknown',
      product_name: dbItem.product_name || 'Unknown',
      pack: dbItem.pack_value,
      pack_value: dbItem.pack_value,
      pack_type: dbItem.pack_type,
      batch: dbItem.batch_no,
      batch_no: dbItem.batch_no,
      exp: dbItem.exp_date,
      exp_date: dbItem.exp_date,
      qty: parseInt(dbItem.qty) || 1,
      quantity: parseInt(dbItem.qty) || 1,
      free: parseInt(dbItem.free) || 0,
      mrp: parseFloat(dbItem.mrp) || 0,
      rate: parseFloat(dbItem.rate) || 0,
      scheme: dbItem.scheme || '',
      disc1: disc1Percent,
      disc2: disc2Percent,
      discount_1_percent: disc1Percent,
      discount_2_percent: disc2Percent,
      sgst: sgstPercent,
      cgst: cgstPercent,
      gstTotal: gstTotal,
      gst_percent: gstTotal,
      gst_reverse: dbItem.gst_reverse || false,
      // Also include calculated amounts for reference
      amount: parseFloat(dbItem.amount) || 0,
      final_amount: parseFloat(dbItem.final_amount) || 0
    };
  }

  /**
   * Convert frontend format to API/database format
   * Used when saving bills
   * 
   * @param {Object} frontendProduct - Product from frontend
   * @returns {Object} API-formatted product object ready for database
   */
  static frontendToDb(frontendProduct) {
    // Calculate line item details
    const lineCalc = this.calculateLineItem(frontendProduct);

    return {
      product_id: frontendProduct.product_id,
      product_name: frontendProduct.product_name || frontendProduct.name,
      variant_id: frontendProduct.variant_id,
      batch_id: frontendProduct.batch_id,
      pack_value: frontendProduct.pack_value || frontendProduct.pack,
      pack_type: frontendProduct.pack_type,
      batch_no: frontendProduct.batch_no || frontendProduct.batch,
      exp_date: frontendProduct.exp_date || frontendProduct.exp,
      qty: parseInt(frontendProduct.qty) || 1,
      scheme: frontendProduct.scheme || null,
      free: parseInt(frontendProduct.free) || 0,
      mrp: parseFloat(frontendProduct.mrp) || 0,
      rate: parseFloat(frontendProduct.rate) || 0,
      amount: lineCalc.amount,
      discount_1_percent: lineCalc.discount_1_percent,
      discount_1_amount: lineCalc.discount_1_amount,
      discount_2_percent: lineCalc.discount_2_percent,
      discount_2_amount: lineCalc.discount_2_amount,
      gst_percent: lineCalc.gst_percent,
      gst_amount: lineCalc.gst_amount,
      sgst_amount: lineCalc.sgst_amount,
      cgst_amount: lineCalc.cgst_amount,
      final_amount: lineCalc.final_amount,
      gst_reverse: frontendProduct.gst_reverse || false
    };
  }

  /**
   * Get customer preferences from product (for saving to customer_item_memory)
   * 
   * @param {Object} product - Product with customer preferences
   * @param {number} customerId - Customer ID
   * @param {number} productId - Product ID
   * @returns {Object} Customer preferences object
   */
  static getCustomerPreferences(product, customerId, productId) {
    return {
      customer_id: customerId,
      product_id: productId,
      discount_1: parseFloat(product.disc1 || product.discount_1_percent || 0) || 0,
      discount_2: parseFloat(product.disc2 || product.discount_2_percent || 0) || 0,
      scheme: product.scheme || null,
      tax_percent: parseFloat(product.gstTotal || product.gst_percent || 0) || 0,
      gst_reverse: product.gst_reverse || false
    };
  }
}

// Export to global scope for browser usage
if (typeof window !== 'undefined') {
  window.BillCalculator = BillCalculator;
  if (typeof console !== 'undefined' && console.log) {
    console.log('[LOAD] BillCalculator exported to window');
  }
}

// For Node.js/CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BillCalculator;
}
