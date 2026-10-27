const assert = require('node:assert/strict');
const test = require('node:test');

const wasmCalls = { lines: 0, summaries: 0 };
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

global.window = {
  SuiteCoreBridge: {
    isWasmLoaded: () => true,
    calcLineItemFast(rate, qty, disc1, disc2, gstTotal, gstReverse) {
      wasmCalls.lines += 1;
      const effectiveRate = gstReverse ? rate * (1 - 0.0477) : rate;
      const amount = effectiveRate * qty;
      const discount_1_amount = amount * (disc1 / 100);
      const discount_2_amount = (amount - discount_1_amount) * (disc2 / 100);
      const taxable = amount - discount_1_amount - discount_2_amount;
      const gst_amount = taxable * (gstTotal / 100);
      return {
        amount,
        discount_1_amount,
        discount_2_amount,
        gst_amount,
        sgst_amount: gst_amount / 2,
        cgst_amount: gst_amount / 2,
        final_amount: taxable + gst_amount
      };
    },
    calculateBillSummary(items) {
      wasmCalls.summaries += 1;
      const total_amount = items.reduce((sum, item) => sum + item.amount, 0);
      const total_discount = items.reduce((sum, item) => sum + item.discount_1_amount + item.discount_2_amount, 0);
      const total_gst = items.reduce((sum, item) => sum + item.gst_amount, 0);
      const total_sgst = items.reduce((sum, item) => sum + item.sgst_amount, 0);
      const total_cgst = items.reduce((sum, item) => sum + item.cgst_amount, 0);
      const subtotal_unrounded = total_amount - total_discount + total_gst;
      const grand_total = Math.round(subtotal_unrounded);
      const round_off = round2(grand_total - subtotal_unrounded);
      return {
        subtotal: round2(subtotal_unrounded),
        total_amount: round2(total_amount),
        total_discount: round2(total_discount),
        total_gst: round2(total_gst),
        total_sgst: round2(total_sgst),
        total_cgst: round2(total_cgst),
        round_off,
        grand_total
      };
    }
  }
};

const BillCalculator = require('../../../shared/bill-calculator.js');
window.BillCalculator = BillCalculator;

test('estimates use invoice WASM line and summary calculations', async () => {
  const { default: EstimateEditor } = await import('./new-estimate.js');
  const editor = Object.create(EstimateEditor.prototype);
  const estimate = editor.prepareSavedEstimate({
    estimate_no: 'EST-TEST-001',
    products: [{
      rate: 100,
      qty: 5,
      dis1: 10,
      dis2: 5,
      gstTotal: 0,
      scheme: '5+1',
      amount: 500,
      discount_amount: 0,
      free: 0,
      final_amt: 500
    }]
  });

  assert.equal(wasmCalls.lines, 2);
  assert.equal(wasmCalls.summaries, 1);
  assert.equal(estimate.products[0].discount_amount, 72.5);
  assert.equal(estimate.products[0].free, 1);
  assert.equal(estimate.products[0].final_amt, 427.5);
  assert.equal(estimate.total_discount, 72.5);
  assert.equal(estimate.grand_total, 428);
});

test('importOrderIntoEstimate correctly imports order items into estimate products', async () => {
  const { default: EstimateEditor } = await import('./new-estimate.js');
  const editor = Object.create(EstimateEditor.prototype);
  editor.currentEstimateProducts = [];
  editor.allContacts = [{ id: 42, name: 'Acme Corp', phone: '9876543210' }];
  editor.cachedProducts = [
    { id: 101, name: 'Amoxicillin 500mg', mrp: 120, rate: 100, pack_value: '10', pack_type: 'TAB', batch_no: 'B123', is_gold: 1 }
  ];
  editor.viewContainer = {
    querySelector: (selector) => {
      if (selector === '#estCustomerName') return { value: 'Acme Corp' };
      return null;
    }
  };
  editor.showNotification = () => {};
  editor.renderProductList = () => {};
  editor.updateEstimateSummary = () => {};

  // Mock global.fetch for preference lookup
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/api/billing/preference')) {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          data: { disc1: 10, disc2: 5, tax: 5, scheme: '5+1', gst_reverse: false }
        })
      };
    }
    return { ok: false };
  };

  try {
    const testOrder = {
      id: 999,
      order_number: 'ORD-999',
      customer_id: 42,
      customer_name: 'Acme Corp',
      current_stage: 'stage1',
      items: [
        {
          product_id: 101,
          product_name: 'Amoxicillin 500mg',
          quantity: 6,
          unit_price: 100,
          mrp: 120,
          batch_no: 'B123'
        }
      ]
    };

    // Mock document.createElement and body for loading overlay
    const originalDocument = global.document;
    global.document = {
      createElement: () => ({ style: {}, remove: () => {} }),
      body: { appendChild: () => {}, removeChild: () => {} },
      getElementById: () => null
    };

    await editor.importOrderIntoEstimate(testOrder);

    assert.equal(editor.currentEstimateProducts.length, 1);
    const importedItem = editor.currentEstimateProducts[0];
    assert.equal(importedItem.name, 'Amoxicillin 500mg');
    assert.equal(importedItem.qty, 6);
    assert.equal(importedItem.mrp, 120);
    assert.equal(importedItem.rate, 100);
    assert.equal(importedItem.dis1, 10);
    assert.equal(importedItem.dis2, 5);
    assert.equal(importedItem.gstTotal, 5);
    assert.equal(importedItem.is_gold, 1);
    assert.ok(importedItem.final_amt > 0);
  } finally {
    global.fetch = originalFetch;
    delete global.document;
  }
});

