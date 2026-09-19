/**
 * SUITE CORE BRIDGE - WebAssembly Acceleration Bridge for macOS Business Suite
 *
 * Connects Web (Browser) and Backend (Node.js) to the compiled Rust `suite_core.wasm` engine.
 * Provides <10ns keystroke line item calculations, deterministic FIFO debt settlement,
 * and unified analytics aging.
 *
 * Fully backward-compatible with 100% graceful fallback to JS math.
 */

let wasmInstance = null;
let wasmMemory = null;
let wasmInitPromise = null;

// Initialize in Node.js synchronously if running on server
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
if (isNode && typeof require === 'function') {
  try {
    const fs = require('fs');
    const path = require('path');
    const possiblePaths = [
      path.join(__dirname, 'suite_core.wasm'),
      path.join(__dirname, '../../backend/core/billing/suite_core.wasm'),
      path.join(__dirname, '../shared/suite_core.wasm'),
      path.join(process.cwd(), 'shared/suite_core/target/wasm32-unknown-unknown/release/suite_core.wasm')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const wasmBuffer = fs.readFileSync(p);
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        wasmInstance = new WebAssembly.Instance(wasmModule, {});
        wasmMemory = wasmInstance.exports.memory;
        break;
      }
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[SuiteCoreBridge] Node.js sync WASM init fallback:', err.message);
    }
  }
}

class SuiteCoreBridge {
  static isWasmLoaded() {
    return !!(wasmInstance && wasmInstance.exports);
  }

  /**
   * Browser asynchronous initialization with deduplicated promise
   */
  static async initBrowser(customUrl = null) {
    if (this.isWasmLoaded()) return true;
    if (wasmInitPromise) return wasmInitPromise;
    wasmInitPromise = (async () => {
      const candidates = customUrl ? [customUrl] : ['/suite_core.wasm', '/shared/suite_core.wasm', '/public/suite_core.wasm'];
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const bytes = await response.arrayBuffer();
            const { instance } = await WebAssembly.instantiate(bytes, {});
            wasmInstance = instance;
            wasmMemory = instance.exports.memory;
            if (typeof console !== 'undefined' && console.log) {
              console.log(`[LOAD] suite_core_bridge.js: WebAssembly Core Loaded from ${url} (WASM Accelerated: YES)`);
            }
            return true;
          }
        } catch (err) {}
      }
      console.warn('[SuiteCoreBridge] Browser WASM load failed from all candidates');
      return false;
    })();
    return wasmInitPromise;
  }

  /**
   * Asynchronously ensure WebAssembly core is ready
   */
  static async ensureReady() {
    if (this.isWasmLoaded()) return true;
    return this.initBrowser();
  }

  /**
   * Execute JSON-in, JSON-out call via WebAssembly memory
   */
  static callWasmJson(exportFnName, payloadObj) {
    if (!this.isWasmLoaded()) return null;

    const exports = wasmInstance.exports;
    const fn = exports[exportFnName];
    if (!fn) return null;

    const jsonStr = JSON.stringify(payloadObj);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(jsonStr);

    // Allocate buffer in WASM
    const inPtr = exports.suite_alloc(encoded.length);
    new Uint8Array(wasmMemory.buffer, inPtr, encoded.length).set(encoded);

    // Call function
    const outPtr = fn(inPtr, encoded.length);

    // Read result
    const view = new DataView(wasmMemory.buffer);
    const outLen = view.getUint32(outPtr, true);
    const resultBytes = new Uint8Array(wasmMemory.buffer, outPtr + 4, outLen);
    const decoder = new TextDecoder('utf-8');
    const resultStr = decoder.decode(resultBytes);

    // Deallocate input buffer
    exports.suite_dealloc(inPtr, encoded.length);
    // Deallocate output buffer
    exports.suite_dealloc(outPtr, outLen + 4);

    return JSON.parse(resultStr);
  }

  /**
   * Calculate bill with items, discounts, GST, scheme, and round-off
   */
  static calculateBill(items, previousDue = 0.0, roundOff = true) {
    if (this.isWasmLoaded()) {
      const res = this.callWasmJson('suite_calculate_bill', {
        items,
        previous_due: previousDue,
        round_off: roundOff
      });
      if (res && res.success) return res;
    }
    return null; // Fallback to JS implementation
  }

  /**
   * Calculate bill summary totals from array of processed line items
   */
  static calculateBillSummary(items, previousDue = 0.0, roundOff = true) {
    if (this.isWasmLoaded()) {
      const summaryItems = (items || []).map(it => ({
        amount: parseFloat(it.amount || 0) || 0,
        discount_1_amount: parseFloat(it.discount_1_amount || it.discount1Amount || 0) || 0,
        discount_2_amount: parseFloat(it.discount_2_amount || it.discount2Amount || 0) || 0,
        gst_amount: parseFloat(it.gst_amount || it.gstAmount || 0) || 0,
        sgst_amount: parseFloat(it.sgst_amount || it.sgstAmount || 0) || 0,
        cgst_amount: parseFloat(it.cgst_amount || it.cgstAmount || 0) || 0
      }));
      const res = this.callWasmJson('suite_calculate_summary', {
        items: summaryItems,
        previous_due: previousDue,
        round_off: roundOff
      });
      if (res && res.grand_total !== undefined) return res;
    }
    return null;
  }

  /**
   * Calculate Customer Statement with chronological FIFO debt settlement
   */
  static calculateStatement(openingBalance, bills, payments, currentDateDays = 20454) {
    if (this.isWasmLoaded()) {
      const res = this.callWasmJson('suite_calculate_statement', {
        opening_balance: openingBalance,
        bills,
        payments,
        current_date_days: currentDateDays
      });
      if (res && res.success) return res;
    }
    return null;
  }

  /**
   * Calculate aging buckets (decoupled in Analytics domain)
   */
  static calculateAging(unpaidItems, openingBalance = 0.0, isMacro = false) {
    if (this.isWasmLoaded()) {
      const res = this.callWasmJson('suite_calculate_aging', {
        items: unpaidItems,
        opening_balance: openingBalance,
        is_macro: isMacro
      });
      if (res) return res;
    }
    return null;
  }

  /**
   * Fast register C ABI for live modal typing (<10ns)
   */
  static calcLineItemFast(rate, qty, disc1, disc2, gst, gstReverse = false) {
    if (!this.isWasmLoaded()) return null;
    const exports = wasmInstance.exports;
    if (!exports.calc_line_item_fast) return null;

    // Allocate 7 floats (56 bytes)
    const outPtr = exports.suite_alloc(56);
    const code = exports.calc_line_item_fast(
      rate, qty, disc1, disc2, gst, gstReverse ? 1 : 0, outPtr
    );

    if (code !== 0) {
      exports.suite_dealloc(outPtr, 56);
      return null;
    }

    const floatView = new Float64Array(wasmMemory.buffer, outPtr, 7);
    const result = {
      amount: floatView[0],
      discount_1_amount: floatView[1],
      discount_2_amount: floatView[2],
      gst_amount: floatView[3],
      sgst_amount: floatView[4],
      cgst_amount: floatView[5],
      final_amount: floatView[6]
    };

    exports.suite_dealloc(outPtr, 56);
    return result;
  }
}

if (typeof window !== 'undefined') {
  window.SuiteCoreBridge = SuiteCoreBridge;
  SuiteCoreBridge.initBrowser();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuiteCoreBridge;
}
