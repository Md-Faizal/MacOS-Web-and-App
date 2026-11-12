/**
 * test-plant-fulfillment.js
 * Comprehensive automated verification test for Plant Order Fulfillment & Manifest System
 */

const Database = require('better-sqlite3');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { schema } = require('../core/db/schema-master');
const createManifestHandlers = require('../core/orders/manifest-handlers');

console.log('🧪 Starting Plant Order Fulfillment & Live Manifest Test Suite...\n');

// Use in-memory SQLite database for isolated test execution
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');

// Execute master schema
db.exec(schema);
console.log('✓ Step 1: Database master schema executed successfully');

// Verify plant_manifests and plant_manifest_orders tables exist
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
assert(tables.includes('plant_manifests'), 'plant_manifests table should exist');
assert(tables.includes('plant_manifest_orders'), 'plant_manifest_orders table should exist');
console.log('✓ Step 2: plant_manifests and plant_manifest_orders tables confirmed in SQLite');

// Verify order_items and orders have new plant fulfillment columns
const orderItemCols = db.prepare(`PRAGMA table_info(order_items)`).all().map(c => c.name);
['plant_status', 'packed_quantity', 'packed_batch_id', 'packed_batch_no', 'packed_expiry', 'plant_notes', 'last_known_quantity'].forEach(col => {
  assert(orderItemCols.includes(col), `order_items should have column ${col}`);
});
const orderCols = db.prepare(`PRAGMA table_info(orders)`).all().map(c => c.name);
['share_token', 'plant_status', 'plant_submitted_at', 'plant_notes', 'plant_cases'].forEach(col => {
  assert(orderCols.includes(col), `orders should have column ${col}`);
});
console.log('✓ Step 3: Schema columns for plant tracking verified on orders and order_items');

// Seed test master data: contacts, products, variants, batches
db.prepare(`
  INSERT INTO contacts (id, name, type) VALUES (1, 'Apex Medicos', 'Customer'), (2, 'Care Pharmacy', 'Customer')
`).run();

db.prepare(`INSERT INTO categories (id, name) VALUES (1, 'Classical Medicine')`).run();

db.prepare(`
  INSERT INTO products (id, name, category_id) VALUES (10, 'SARIBADI SALASA', 1), (20, 'LABANGADI MODAK', 1)
`).run();

db.prepare(`
  INSERT INTO variants (id, product_id, pack_size_value, pack_size_type)
  VALUES (101, 10, '450', 'ML'), (201, 20, '100', 'GM')
`).run();

db.prepare(`
  INSERT INTO batches (id, variant_id, batch_no, mrp, exp_date)
  VALUES (1001, 101, '03/021', 140, '12/26'),
         (1002, 101, '01/019', 140, '08/25'),
         (2001, 201, '07/021', 100, '05/27')
`).run();

// Seed 2 orders
db.prepare(`
  INSERT INTO orders (id, order_number, customer_id, current_stage, status, total_amount)
  VALUES (1, 'ORD-260001', 1, 'stage1', 'pending', 1400),
         (2, 'ORD-260002', 2, 'stage1', 'pending', 1000)
`).run();

// Seed order items
db.prepare(`
  INSERT INTO order_items (id, order_id, product_id, variant_id, batch_id, quantity, unit_price, line_total)
  VALUES (1, 1, 10, 101, 1001, 10, 140, 1400),
         (2, 2, 20, 201, 2001, 10, 100, 1000)
`).run();
console.log('✓ Step 4: Seed data (contacts, products, batches, orders) inserted');

// Initialize handlers
const manifestHandlers = createManifestHandlers(db);

// Mock req and res
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

// -------------------------------------------------------------
// Test 1: Create a new plant manifest for Order 1
// -------------------------------------------------------------
let manifestRes = createMockRes();
manifestHandlers.createOrAppendManifest({
  body: { order_ids: [1], title: 'Test Dispatch Batch 1' },
  get: () => 'localhost:3000',
  protocol: 'http',
  user: { id: 'test_admin' }
}, manifestRes);

assert.strictEqual(manifestRes.statusCode, 200);
assert(manifestRes.body.success, 'Manifest creation should succeed');
assert(manifestRes.body.manifest.token.startsWith('PLANT-'), 'Token should start with PLANT-');
const token = manifestRes.body.manifest.token;
const manifestId = manifestRes.body.manifest.id;
console.log(`✓ Step 5: Created manifest #${manifestId} with token '${token}'`);

// Verify order was tagged with share_token and last_known_quantity set
const ord1 = db.prepare('SELECT share_token FROM orders WHERE id = 1').get();
assert.strictEqual(ord1.share_token, token);
const item1 = db.prepare('SELECT last_known_quantity FROM order_items WHERE id = 1').get();
assert.strictEqual(item1.last_known_quantity, 10);
console.log('✓ Step 6: Order 1 share_token set and item 1 last_known_quantity snapshotted');

// -------------------------------------------------------------
// Test 2: Append Order 2 to existing manifest (Combining orders)
// -------------------------------------------------------------
let appendRes = createMockRes();
manifestHandlers.createOrAppendManifest({
  body: { order_ids: [2], manifest_id: manifestId },
  get: () => 'localhost:3000',
  protocol: 'http',
  user: { id: 'test_admin' }
}, appendRes);

assert.strictEqual(appendRes.statusCode, 200);
assert.strictEqual(appendRes.body.manifest.version, 2, 'Version should increment to 2 when order appended');
const linkedOrders = db.prepare('SELECT order_id FROM plant_manifest_orders WHERE manifest_id = ?').all(manifestId);
assert.strictEqual(linkedOrders.length, 2, 'Manifest should now link 2 orders');
console.log('✓ Step 7: Order 2 combined into manifest; version bumped to 2');

// -------------------------------------------------------------
// Test 3: Public Retrieval of Manifest Data
// -------------------------------------------------------------
let publicGetRes = createMockRes();
manifestHandlers.getPublicManifestData({ params: { token } }, publicGetRes);

assert.strictEqual(publicGetRes.statusCode, 200);
assert.strictEqual(publicGetRes.body.orders.length, 2, 'Should return both linked orders');
const pubItem1 = publicGetRes.body.orders[0].items[0];
assert.strictEqual(pubItem1.product_name, 'SARIBADI SALASA');
assert.strictEqual(pubItem1.requested_batch.batch_no, '03/021');
assert(pubItem1.available_batches.length >= 2, 'Should provide alternate batches for variant');
console.log('✓ Step 8: Public manifest returned items with requested batch and alternate warehouse batches');

// -------------------------------------------------------------
// Test 4: In-Flight Change Diffing (Quantity edited by billing office)
// -------------------------------------------------------------
db.prepare('UPDATE order_items SET quantity = 25 WHERE id = 1').run();

let publicDiffRes = createMockRes();
manifestHandlers.getPublicManifestData({ params: { token } }, publicDiffRes);
assert.strictEqual(publicDiffRes.body.diffs.length, 1, 'Should detect 1 diff in order item');
assert.strictEqual(publicDiffRes.body.diffs[0].diffBadge, 'modified');
assert(publicDiffRes.body.diffs[0].diffText.includes('10 ➔ 25'), 'Diff text should indicate quantity increase');
console.log(`✓ Step 9: In-flight diffing verified: '${publicDiffRes.body.diffs[0].diffText}'`);

// -------------------------------------------------------------
// Test 5: Plant Worker Fulfillment Submission
// -------------------------------------------------------------
let submitRes = createMockRes();
manifestHandlers.submitPublicManifestData({
  params: { token },
  body: {
    cases_count: 2,
    plant_notes: 'Packed in 2 heavy corrugated boxes via ARC Transport',
    items: [
      {
        order_item_id: 1,
        plant_status: 'partial',
        packed_quantity: 15, // Packed 15 out of 25
        packed_batch_id: 1002, // Swapped to older batch 01/019
        packed_batch_no: '01/019',
        packed_expiry: '08/25',
        plant_notes: 'Only 15 available in rack B'
      },
      {
        order_item_id: 2,
        plant_status: 'available',
        packed_quantity: 10, // Full
        packed_batch_id: 2001,
        packed_batch_no: '07/021',
        packed_expiry: '05/27',
        plant_notes: 'Full quantity checked'
      }
    ]
  }
}, submitRes);

assert.strictEqual(submitRes.statusCode, 200);
assert(submitRes.body.success, 'Fulfillment submission should succeed');

// Verify order_items were updated
const savedItem1 = db.prepare('SELECT * FROM order_items WHERE id = 1').get();
assert.strictEqual(savedItem1.plant_status, 'partial');
assert.strictEqual(savedItem1.packed_quantity, 15);
assert.strictEqual(savedItem1.received_quantity, 15, 'received_quantity must match packed_quantity for QC');
assert.strictEqual(savedItem1.packed_batch_no, '01/019', 'packed_batch_no should reflect swapped batch');

// Verify order stage advanced to stage2 (QC) and plant notes recorded
const updatedOrd1 = db.prepare('SELECT * FROM orders WHERE id = 1').get();
assert.strictEqual(updatedOrd1.current_stage, 'stage2', 'Order 1 stage should advance to stage2');
assert.strictEqual(updatedOrd1.plant_status, 'submitted');
assert.strictEqual(updatedOrd1.plant_cases, 2);
assert(updatedOrd1.plant_notes.includes('ARC Transport'));
console.log('✓ Step 10: Fulfillment saved: packed_quantity=15, batch swapped to 01/019, advanced to Stage 2 (QC)');

// -------------------------------------------------------------
// Test 6: Settlement Lock (Read-Only after delivery / complete)
// -------------------------------------------------------------
db.prepare("UPDATE orders SET current_stage = 'stage3', status = 'complete' WHERE id IN (1, 2)").run();

let lockedGetRes = createMockRes();
manifestHandlers.getPublicManifestData({ params: { token } }, lockedGetRes);
assert.strictEqual(lockedGetRes.body.manifest.is_locked, true, 'Manifest must be locked when orders settled');

// Attempting submit on locked manifest should be rejected with 403
let rejectSubmitRes = createMockRes();
manifestHandlers.submitPublicManifestData({
  params: { token },
  body: { items: [], cases_count: 1 }
}, rejectSubmitRes);
assert.strictEqual(rejectSubmitRes.statusCode, 403, 'Submission on locked manifest must return 403 Forbidden');
console.log('✓ Step 11: Settlement lock verified: public link is read-only and modifications rejected');

// -------------------------------------------------------------
// Test 7: Dashboard Manifest Listing
// -------------------------------------------------------------
let dashRes = createMockRes();
manifestHandlers.getManifests({ query: { status: 'all' }, get: () => 'localhost:3000', protocol: 'http' }, dashRes);
assert.strictEqual(dashRes.statusCode, 200);
assert.strictEqual(dashRes.body.manifests.length, 1);
const dashM = dashRes.body.manifests[0];
assert.strictEqual(dashM.orders.length, 2);
assert.strictEqual(dashM.progress.total_items, 2);
assert.strictEqual(dashM.progress.checked_items, 2);
assert.strictEqual(dashM.progress.partial, 1);
assert.strictEqual(dashM.progress.available, 1);
console.log('✓ Step 12: Dashboard listing verified with live progress stats (1 full | 1 partial | 0 out)');

console.log('\n======================================================');
console.log('🎉 ALL 12 PLANT FULFILLMENT & MANIFEST TESTS PASSED!');
console.log('======================================================\n');
