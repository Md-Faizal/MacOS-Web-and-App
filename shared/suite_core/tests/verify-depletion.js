const path = require('path');
const SuiteCoreBridge = require('../../../frontend/shared/suite_core_bridge.js');


console.log('====================================================');
console.log('🧪 VERIFYING RUST WASM INVENTORY DEPLETION (FEFO)');
console.log('====================================================');

console.log('Is WASM Loaded:', SuiteCoreBridge.isWasmLoaded());

const sampleBatches = [
  {
    batch_id: 'b_1',
    batch_no: 'B2027-06',
    expiry_date: '2027-06-30',
    current_stock: 50,
    mrp: 120,
    rate: 100
  },
  {
    batch_id: 'b_2',
    batch_no: 'B2026-11',
    expiry_date: '2026-11-30',
    current_stock: 10,
    mrp: 120,
    rate: 100
  },
  {
    batch_id: 'b_3',
    batch_no: 'B2027-01',
    expiry_date: '2027-01-31',
    current_stock: 20,
    mrp: 120,
    rate: 100
  }
];

const requestedQty = 25;
const result = SuiteCoreBridge.depleteInventory(requestedQty, sampleBatches);

console.log('\nInput Request:', { requestedQty, batchCount: sampleBatches.length });
console.log('Depletion Result:', JSON.stringify(result, null, 2));

if (!result.success || !result.is_fully_allocated) {
  console.error('❌ FAILED: Expected full allocation');
  process.exit(1);
}

if (result.allocated_qty !== 25 || result.unfulfilled_qty !== 0) {
  console.error('❌ FAILED: Quantities mismatch', result);
  process.exit(1);
}

if (result.allocations[0].batch_no !== 'B2026-11' || result.allocations[0].qty_deducted !== 10) {
  console.error('❌ FAILED: First batch must be earliest expiring (B2026-11)');
  process.exit(1);
}

if (result.allocations[1].batch_no !== 'B2027-01' || result.allocations[1].qty_deducted !== 15) {
  console.error('❌ FAILED: Second batch must be B2027-01 with 15 units deducted');
  process.exit(1);
}

console.log('\n✅ 100% PASS: Rust WebAssembly FEFO Inventory Depletion Verified Successfully!');
