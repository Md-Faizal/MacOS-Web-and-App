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

let SuiteCoreBridge = null;
if (typeof require !== 'undefined') {
  try {
    SuiteCoreBridge = require('./suite_core_bridge');
  } catch (_) {}
} else if (typeof window !== 'undefined' && window.SuiteCoreBridge) {
  SuiteCoreBridge = window.SuiteCoreBridge;
}

// Browser asynchronous WebAssembly auto-loader with fallback
if (typeof window !== 'undefined') {
  const loadWasmBrowser = async () => {
    if (SuiteCoreBridge && SuiteCoreBridge.isWasmLoaded()) return true;
    const urls = ['/suite_core.wasm', '/shared/suite_core.wasm', '/public/suite_core.wasm'];
    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const bytes = await resp.arrayBuffer();
          const { instance } = await WebAssembly.instantiate(bytes, {});
          const memory = instance.exports.memory;
          SuiteCoreBridge = {
            isWasmLoaded: () => true,
            calcLineItemFast: (rate, qty, disc1, disc2, gst, gstReverse = false) => {
              const exports = instance.exports;
              if (!exports.calc_line_item_fast) return null;
              const outPtr = exports.suite_alloc(56);
              const code = exports.calc_line_item_fast(
                rate, qty, disc1, disc2, gst, gstReverse ? 1 : 0, outPtr
              );
              if (code !== 0) {
                exports.suite_dealloc(outPtr, 56);
                return null;
              }
              const floatView = new Float64Array(memory.buffer, outPtr, 7);
              const res = {
                amount: floatView[0],
                discount_1_amount: floatView[1],
                discount_2_amount: floatView[2],
                gst_amount: floatView[3],
                sgst_amount: floatView[4],
                cgst_amount: floatView[5],
                final_amount: floatView[6]
              };
              exports.suite_dealloc(outPtr, 56);
              return res;
            }
          };
          window.SuiteCoreBridge = SuiteCoreBridge;
          if (typeof console !== 'undefined' && console.log) {
            console.log('[LOAD] bill-calculator.js: WebAssembly Core Initialized in Browser (WASM Accelerated: YES)');
          }
          return true;
        }
      } catch (_) {}
    }
    return false;
  };
  loadWasmBrowser();
}

if (typeof console !== 'undefined' && console.log) {
  const isAccelerated = SuiteCoreBridge && SuiteCoreBridge.isWasmLoaded();
  console.log(`[LOAD] bill-calculator.js starting (WASM Accelerated: ${isAccelerated ? 'YES' : 'INITIALIZING IN BROWSER'})...`);
}

class BillCalculator {
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

    if (SuiteCoreBridge && SuiteCoreBridge.isWasmLoaded()) {
      try {
        const fast = SuiteCoreBridge.calcLineItemFast(rate, qty, disc1Percent, disc2Percent, gstTotal, gstReverse);
        if (fast) {
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
      } catch (_) {}
    }

    if (typeof console !== 'undefined') {
      console.log(`📐 BillCalculator.calculateLineItem:`, {
        rate, qty, disc1Percent, disc2Percent, sgstPercent, cgstPercent, gstTotal, gstReverse
      });
    }

    // **GST REVERSE LOGIC**: If gst_reverse is enabled, apply 4.77% reduction to MRP first
    // 4.77% represents the true GST component embedded in 5% GST: 5% ÷ (1 + 5%) = 0.0477
    // CRITICAL: Keep full precision - only round final amounts, not intermediate values!
    let baseRate = rate;
    if (gstReverse) {
      baseRate = rate * (1 - 0.0477); // Full precision - NO rounding yet!
      if (typeof console !== 'undefined') {
        console.log(`💰 GST Reverse Applied: MRP ${rate} → Base Rate ${baseRate.toFixed(2)} (removed 4.77%)`);
      }
      rate = baseRate; // Use baseRate for further calculations
    }

    // Step 1: Calculate base amount = rate × qty (keep full precision)
    const amount = rate * qty;

    // Step 2: Calculate Discount 1 (as percentage on base amount) - keep full precision
    const discount_1_amount = amount * (disc1Percent / 100);
    const amountAfterDisc1 = amount - discount_1_amount;
    
    // Calculate the discounted rate (rate after discount 1)
    const discounted_rate = rate * (1 - disc1Percent / 100);

    // Step 3: Calculate Discount 2 (as percentage on amount after discount 1) - keep full precision
    const discount_2_amount = amountAfterDisc1 * (disc2Percent / 100);
    const amountAfterDisc2 = amountAfterDisc1 - discount_2_amount;

    // Step 4: Calculate tax amounts on discounted amount - keep full precision
    let gst_amount = 0;
    let sgst_amount = 0;
    let cgst_amount = 0;

    if (gstTotal > 0) {
      gst_amount = amountAfterDisc2 * (gstTotal / 100);
      sgst_amount = amountAfterDisc2 * (sgstPercent / 100);
      cgst_amount = amountAfterDisc2 * (cgstPercent / 100);
    }

    // Step 5: Calculate final amount = discounted amount + tax (keep full precision until final rounding)
    const final_amount_unrounded = amountAfterDisc2 + gst_amount;

    if (typeof console !== 'undefined') {
      console.log(`📊 BillCalculator.RESULT:`, {
        sgst_amount: sgst_amount.toFixed(2), cgst_amount: cgst_amount.toFixed(2), gst_amount: gst_amount.toFixed(2), final_amount: final_amount_unrounded.toFixed(2), amountAfterDisc2: amountAfterDisc2.toFixed(2)
      });
    }

    // NOW round all values for storage and display
    return {
      // Source data for audit trail
      rate: parseFloat(rate.toFixed(2)),
      discounted_rate: parseFloat(discounted_rate.toFixed(2)),
      qty: qty,
      
      // Calculated amounts for display and storage - ROUNDED
      amount: parseFloat(amount.toFixed(2)),
      discount_1_percent: disc1Percent,
      discount_1_amount: parseFloat(discount_1_amount.toFixed(2)),
      discount_2_percent: disc2Percent,
      discount_2_amount: parseFloat(discount_2_amount.toFixed(2)),
      gst_percent: gstTotal,
      gst_amount: parseFloat(gst_amount.toFixed(2)),
      sgst_amount: parseFloat(sgst_amount.toFixed(2)),
      cgst_amount: parseFloat(cgst_amount.toFixed(2)),
      final_amount: parseFloat(final_amount_unrounded.toFixed(2)),
      gst_reverse: gstReverse,
      
      // For backward compatibility
      disc1: parseFloat(discount_1_amount.toFixed(2)),
      disc2: parseFloat(discount_2_amount.toFixed(2)),
      discountedAmount: parseFloat(amountAfterDisc2.toFixed(2)),
      sgstValue: parseFloat(sgst_amount.toFixed(2)),
      cgstValue: parseFloat(cgst_amount.toFixed(2)),
      finalAmount: parseFloat(final_amount_unrounded.toFixed(2)),
      lineTotal: parseFloat(final_amount_unrounded.toFixed(2))
    };
  }

  /**
   * Calculate bill summary totals from array of line items
   * 
   * @param {Array} items - Array of calculated line items
   * @returns {Object} Bill summary: subtotal, total_discount, total_gst, round_off, grand_total
   */
  static calculateBillSummary(items) {
    // Keep full precision during summation - NO rounding until the end
    let total_amount = 0;
    let total_discount = 0;
    let total_gst = 0;
    let total_sgst = 0;
    let total_cgst = 0;

    // Sum all line items with full precision
    items.forEach(item => {
      // Parse values but don't round them
      total_amount += parseFloat(item.amount || 0) || 0;
      total_discount += parseFloat(item.discount_1_amount || 0) || 0;
      total_discount += parseFloat(item.discount_2_amount || 0) || 0;
      total_gst += parseFloat(item.gst_amount || 0) || 0;
      total_sgst += parseFloat(item.sgst_amount || 0) || 0;
      total_cgst += parseFloat(item.cgst_amount || 0) || 0;
    });

    // Calculate grand total BEFORE rounding
    const subtotal_unrounded = total_amount - total_discount + total_gst;

    // Round to nearest rupee only at the very end
    const grand_total = Math.round(subtotal_unrounded);
    const round_off = parseFloat((grand_total - subtotal_unrounded).toFixed(2));

    // NOW round all individual amounts for storage
    return {
      subtotal: parseFloat(subtotal_unrounded.toFixed(2)),
      total_amount: parseFloat(total_amount.toFixed(2)),
      total_discount: parseFloat(total_discount.toFixed(2)),
      total_gst: parseFloat(total_gst.toFixed(2)),
      total_sgst: parseFloat(total_sgst.toFixed(2)),
      total_cgst: parseFloat(total_cgst.toFixed(2)),
      round_off: round_off,
      grand_total: grand_total
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
