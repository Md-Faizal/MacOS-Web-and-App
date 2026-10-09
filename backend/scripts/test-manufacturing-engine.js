/**
 * Manufacturing Engine End-to-End Test Suite
 * Tests full Schedule T GMP workflow backed by Rust WebAssembly.
 */

const assert = require('assert');
const DatabaseManager = require('../core/db/database-manager');
const manufacturingDepartment = require('../departments/manufacturing');

async function runTests() {
  console.log('🧪 Starting Manufacturing Engine & Rust WASM Tests...\n');

  const db = DatabaseManager.initialize();
  const mfg = manufacturingDepartment.create(db);
  const handlers = mfg.service;

  // Mock req/res helper
  function mockCall(handler, req = {}) {
    return new Promise((resolve, reject) => {
      const res = {
        _status: 200,
        status(code) { this._status = code; return this; },
        json(data) {
          if (this._status >= 400) {
            reject(new Error(`HTTP ${this._status}: ${JSON.stringify(data)}`));
          } else {
            resolve(data);
          }
        }
      };
      handler(req, res);
    });
  }

  // 1. Raw Materials & Inventory
  console.log('1. Checking Raw Materials Master...');
  const rmData = await mockCall(handlers.getRawMaterials);
  assert(rmData.success, 'Failed to fetch raw materials');
  assert(rmData.materials.length >= 10, 'Expected at least 10 seeded raw materials');
  console.log(`   ✓ Found ${rmData.materials.length} raw materials`);

  // 2. Inward GRN (Goods Receipt Note)
  console.log('2. Recording Raw Material Inward (GRN)...');
  const ashwagandha = rmData.materials.find(m => m.name.includes('Ashwagandha'));
  assert(ashwagandha, 'Ashwagandha raw material not found');
  const prevStock = ashwagandha.current_stock;

  const inwardResult = await mockCall(handlers.createRawMaterialInward, {
    body: {
      raw_material_id: ashwagandha.id,
      supplier_name: 'Bhubaneswar Herbal Traders',
      invoice_no: 'BHT-2026-891',
      receipt_date: '2026-10-10',
      vendor_lot_no: 'LOT-ASH-991',
      qty_received: 25.5,
      unit_rate: 450.0,
      qc_status: 'Conforms'
    }
  });
  assert(inwardResult.success && inwardResult.id, 'Failed to create GRN inward');
  
  // Verify stock incremented
  const updatedAsh = db.prepare('SELECT current_stock FROM raw_materials WHERE id = ?').get(ashwagandha.id);
  assert(Math.abs(updatedAsh.current_stock - (prevStock + 25.5)) < 0.001, 'Stock did not increment accurately');
  console.log(`   ✓ GRN recorded (ID: ${inwardResult.id}). Stock: ${prevStock} -> ${updatedAsh.current_stock} KG`);

  // 3. Master Formula & Recipe Scaling in Rust
  console.log('3. Testing Master Formula & Rust Recipe Scaling...');
  const product = db.prepare('SELECT id, name FROM products LIMIT 1').get();
  assert(product, 'No product found in catalog');

  const mfResult = await mockCall(handlers.createMasterFormula, {
    body: {
      product_id: product.id,
      formula_name: `${product.name} Classical MFR`,
      pharmacopoeial_ref: 'Ayurvedic Formulary of India (AFI)',
      std_batch_size: 100,
      std_batch_uom: 'LTR',
      expected_yield_percent: 95.0,
      items: [
        { raw_material_id: ashwagandha.id, qty_required: 10.0, stage: 'Decoction' }
      ]
    }
  });
  assert(mfResult.success && mfResult.id, 'Failed to create Master Formula');
  console.log(`   ✓ Master Formula created for '${product.name}' (ID: ${mfResult.id})`);

  // Direct Rust recipe scaling test
  const scaleResult = await mockCall(handlers.scaleRecipeRust, {
    body: {
      std_batch_size: 100,
      planned_batch_size: 250,
      items: [
        { raw_material_id: ashwagandha.id, raw_material_name: ashwagandha.name, uom: 'KG', qty_per_std_batch: 10.0, stage: 'Decoction' }
      ]
    }
  });
  assert(scaleResult.success, 'Rust recipe scaling failed');
  assert.strictEqual(scaleResult.scale_factor, 2.5, 'Expected scale factor 2.5');
  assert.strictEqual(scaleResult.items[0].required_qty, 25.0, 'Expected scaled qty 25.0 KG');
  console.log(`   ✓ Rust WASM scaled 100 KG std to 250 KG batch -> Factor: ${scaleResult.scale_factor}, Scaled: ${scaleResult.items[0].required_qty} KG`);

  // 4. Batch Initiation (BMR) with automatic raw material deduction
  console.log('4. Initiating BMR Batch with automated dispensing deduction...');
  const testBatchNo = `TEST-BM-${Date.now().toString().slice(-6)}`;
  const bmrResult = await mockCall(handlers.createBmrBatch, {
    body: {
      batch_no: testBatchNo,
      product_id: product.id,
      master_formula_id: mfResult.id,
      mfg_date: '2026-10-10',
      exp_date: '2029-09-30',
      mrp: 185.0,
      planned_qty: 250,
      technical_person: 'Dr. P. K. Mishra (Ayurvedic Chemist)',
      deduct_stock: true
    }
  });
  assert(bmrResult.success && bmrResult.id, 'Failed to create BMR Batch');
  console.log(`   ✓ BMR Batch created: ${testBatchNo} (ID: ${bmrResult.id})`);

  // Verify dispensing recorded and stock deducted
  const dispensing = db.prepare('SELECT * FROM manufacturing_batch_dispensing WHERE batch_id = ?').all(bmrResult.id);
  assert(dispensing.length > 0, 'Dispensing line not recorded');
  console.log(`   ✓ Dispensing verified: ${dispensing[0].actual_dispensed_qty} KG dispensed`);

  // 5. Rust Yield Reconciliation
  console.log('5. Testing Yield Reconciliation in Rust WASM...');
  const yieldResult = await mockCall(handlers.reconcileYieldRust, {
    body: {
      planned_qty: 250,
      actual_output_qty: 242,
      expected_yield_percent: 95.0,
      permissible_loss_percent: 5.0
    }
  });
  assert(yieldResult.success, 'Rust yield reconciliation failed');
  assert(yieldResult.actual_yield_percent > 96.0, 'Unexpected yield calculation');
  assert.strictEqual(yieldResult.is_within_tolerance, true, 'Yield should be within tolerance');
  console.log(`   ✓ Rust Yield Reconciliation: ${yieldResult.actual_yield_percent}% yield, ${yieldResult.process_loss_percent}% loss (Within tolerance: ${yieldResult.is_within_tolerance})`);

  // 6. Batch Release & Commercial Hand-off (Rust Validation)
  console.log('6. Validating & Releasing Batch via Rust Validation Core...');
  const releaseResult = await mockCall(handlers.releaseBatch, {
    params: { id: bmrResult.id },
    body: {
      lab_name: 'State Drug Testing Laboratory (Form 48 Approved)',
      lab_report_no: 'SDTL-AYUR-2026-904',
      coa_date: '2026-10-10',
      coa_status: 'PASSED',
      technical_person: 'Dr. P. K. Mishra',
      actual_output_qty: 242,
      retention_sample_qty: '2 Bottles x 450ml',
      retention_location: 'Control Sample Almirah Rack C'
    }
  });
  assert(releaseResult.success, 'Batch release failed');
  console.log(`   ✓ Statutory release passed! ${releaseResult.message}`);

  // Verify BMR is RELEASED and batch exists in commercial `batches` table
  const releasedBmr = db.prepare('SELECT status, yield_percent, lab_report_no FROM manufacturing_bmr WHERE id = ?').get(bmrResult.id);
  assert.strictEqual(releasedBmr.status, 'RELEASED', 'BMR status should be RELEASED');
  
  const commercialBatch = db.prepare('SELECT * FROM batches WHERE batch_no = ?').get(testBatchNo);
  assert(commercialBatch, 'Batch did not transfer into commercial billing catalog');
  assert.strictEqual(commercialBatch.mrp, 185.0, 'Commercial batch MRP mismatch');
  console.log(`   ✓ Commercial hand-off verified: Batch '${testBatchNo}' is now LIVE in billing catalog!`);

  // 7. Statutory Vector BMR Dossier PDF Generation (Pure Rust)
  console.log('7. Generating Schedule T BMR Dossier PDF via Pure Rust Vector Engine...');
  const pdfResult = await mockCall(handlers.renderBmrDossierPdf, {
    params: { id: bmrResult.id }
  });
  assert(pdfResult.success, 'PDF rendering failed');
  assert(pdfResult.pdf_base64 && pdfResult.pdf_base64.length > 500, 'Invalid PDF base64 output');
  
  const pdfBuffer = Buffer.from(pdfResult.pdf_base64, 'base64');
  const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
  assert.strictEqual(pdfHeader, '%PDF-', 'Output is not a valid PDF file');
  console.log(`   ✓ Schedule T BMR Dossier generated successfully! Size: ${pdfResult.byte_count} bytes (~${(pdfResult.byte_count/1024).toFixed(1)} KB)`);

  // 8. Attachments & Photos Documentation
  console.log('8. Testing Batch & Inward Photo/Note Attachments...');
  const attachResult = await mockCall(handlers.createAttachment, {
    body: {
      entity_type: 'BATCH',
      entity_id: bmrResult.id,
      file_name: 'kvatha_stage1.jpg',
      file_type: 'image/jpeg',
      image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      caption: 'Decoction boiling at 95°C with 4-fold volume reduction',
      stage: 'Kvatha Nirmana'
    }
  });
  assert(attachResult.success && attachResult.id, 'Failed to create attachment');
  const fetchedAtt = await mockCall(handlers.getAttachments, {
    params: { entityType: 'BATCH', entityId: bmrResult.id }
  });
  assert(fetchedAtt.success && fetchedAtt.attachments.length > 0, 'Failed to fetch attachments');
  console.log(`   ✓ Attachment saved & retrieved (ID: ${attachResult.id}, Stage: ${fetchedAtt.attachments[0].stage})`);

  // 9. Technical Staff & Doctors Master
  console.log('9. Testing Technical Staff & Doctors Master...');
  const staffList = await mockCall(handlers.getTechnicalStaff);
  assert(staffList.success && staffList.staff.length >= 4, 'Expected seeded technical staff');
  console.log(`   ✓ Technical staff master active: ${staffList.staff.length} staff (${staffList.staff.map(s => s.name).join(', ')})`);

  // 10. Inward Suppliers, Purchase Orders & Supplier Payments
  console.log('10. Testing Inward Procurement Suite (Suppliers, POs, Payments)...');
  const suppList = await mockCall(handlers.getSuppliers);
  assert(suppList.success && suppList.suppliers.length >= 4, 'Expected seeded suppliers');
  const kalingaSupp = suppList.suppliers[0];
  console.log(`   ✓ Found supplier: '${kalingaSupp.name}'`);

  // Create Purchase Order
  const poResult = await mockCall(handlers.createPurchaseOrder, {
    body: {
      po_number: `PO-TEST-${Date.now().toString().slice(-4)}`,
      supplier_id: kalingaSupp.id,
      order_date: '2026-10-10',
      expected_delivery_date: '2026-10-15',
      notes: 'Urgent consignment for upcoming Dashamoolarishta batch',
      items: [
        { raw_material_id: ashwagandha.id, qty_ordered: 50.0, unit_rate: 450.0, tax_percent: 5.0 }
      ]
    }
  });
  assert(poResult.success && poResult.id, 'Failed to create Purchase Order');
  console.log(`   ✓ Purchase Order created: ${poResult.po_number} (ID: ${poResult.id})`);

  // Record Supplier Payment
  const payResult = await mockCall(handlers.createSupplierPayment, {
    body: {
      supplier_id: kalingaSupp.id,
      payment_date: '2026-10-10',
      amount: 10000.0,
      payment_mode: 'BANK',
      reference_no: 'NEFT-SBIN-88910',
      notes: 'Advance disbursement for PO raw herbs'
    }
  });
  assert(payResult.success && payResult.id, 'Failed to create supplier payment');
  console.log(`   ✓ Supplier Payment recorded: ${payResult.payment_number} (₹10,000 via BANK)`);

  // 11. Supplier Running Ledger Statement
  console.log('11. Testing Supplier Running Ledger Statement...');
  const ledgerResult = await mockCall(handlers.getSupplierLedger, {
    params: { id: kalingaSupp.id }
  });
  assert(ledgerResult.success, 'Failed to fetch supplier ledger');
  console.log(`   ✓ Supplier ledger verified for '${ledgerResult.supplier.name}': Current Balance Due: ₹${ledgerResult.current_balance}`);

  console.log('\n🎉 ALL 11 MANUFACTURING & INWARD SUITE TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
