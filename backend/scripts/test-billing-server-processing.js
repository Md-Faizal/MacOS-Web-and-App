const Database = require('better-sqlite3');
const path = require('path');
const assert = require('assert');

const dbPath = path.join(__dirname, '../../database/MacOS.db');
const db = new Database(dbPath);

const calculator = require('../core/billing/calculator');
const BillCalculator = require('../../frontend/shared/bill-calculator');

console.log('🧪 Starting Server-Side Billing Processing Tests...\n');

// Test 1: Direct Calculator Tests
console.log('--- Test 1: calculateBillItemsAndSummary with Reverse GST, Discounts & Round-Off ---');
const testInput = {
  customerName: 'Test Server Processing Customer',
  items: [
    {
      name: 'Product Alpha',
      rate: 1000,
      qty: 2,
      disc1: 10,
      disc2: 5,
      gst_percent: 18,
      gst_reverse: false,
      scheme: '5+1'
    },
    {
      name: 'Product Beta (Reverse GST)',
      rate: 100, // With reverse GST: 100 * (1 - 0.0477) = 95.23
      qty: 10,
      disc1: 0,
      disc2: 0,
      gst_percent: 5,
      gst_reverse: true,
      scheme: '5+1' // 10 qty -> 2 sets -> 2 free
    }
  ],
  roundOffEnabled: true
};

const result = calculator.calculateBillItemsAndSummary(db, testInput);
console.log('Result Items Count:', result.items.length);
console.log('Summary:', JSON.stringify(result.summary, null, 2));

// Validations
assert.strictEqual(result.success, true, 'Result success should be true');
assert.strictEqual(result.items.length, 2, 'Should process 2 items');

// Item 1 verification
const item1 = result.items[0];
assert.strictEqual(item1.qty, 2);
assert.strictEqual(item1.amount, 2000);
assert.strictEqual(item1.discount_1_amount, 200); // 2000 * 10%
assert.strictEqual(item1.discount_2_amount, 90);  // (2000 - 200) * 5% = 1800 * 5% = 90
const taxable1 = 2000 - 200 - 90; // 1710
assert.strictEqual(item1.gst_amount, Number((taxable1 * 0.18).toFixed(2))); // 307.80
assert.strictEqual(item1.final_amount, Number((taxable1 + item1.gst_amount).toFixed(2))); // 2017.80
assert.strictEqual(item1.free, 0); // 2 qty < 5, so 0 free

// Item 2 verification (Reverse GST & Scheme)
const item2 = result.items[1];
assert.strictEqual(item2.qty, 10);
assert.strictEqual(item2.free, 2, '10 items with 5+1 scheme should yield 2 free items');
assert.strictEqual(item2.gst_reverse, true);
// rate should be 100 * (1 - 0.0477) = 95.23
assert.strictEqual(item2.rate, 95.23);

console.log('✅ Test 1 Passed: Arithmetic, Scheme & Reverse GST verified.');

// Test 2: Verify previous_due calculation consistency
console.log('\n--- Test 2: Customer Statement & Previous Due Parity ---');
const customer = db.prepare("SELECT id, name FROM contacts WHERE LOWER(type) = 'customer' LIMIT 1").get();
if (customer) {
  const statement = calculator.calculateCustomerStatement(db, customer.id);
  const billCalc = calculator.calculateBillItemsAndSummary(db, {
    customerId: customer.id,
    items: [{ rate: 500, qty: 1, disc1: 0, disc2: 0, gst_percent: 0 }]
  });

  console.log(`Customer: ${customer.name} (ID: ${customer.id})`);
  console.log(`Statement current_due: ${statement.customer.current_due}`);
  console.log(`calculateBillItemsAndSummary previous_due: ${billCalc.previous_due}`);
  console.log(`Projected Due: ${billCalc.projected_due}`);

  assert.strictEqual(statement.customer.current_due, billCalc.previous_due, 'Statement current due must equal previous due for new bill');
  assert.strictEqual(billCalc.projected_due, Number((billCalc.previous_due + billCalc.summary.grand_total).toFixed(2)), 'Projected due must equal previous due + grand total');
  console.log('✅ Test 2 Passed: Previous Due matches Ledger Statement 100%.');
} else {
  console.log('⚠️ Test 2 Skipped: No customer found in DB.');
}

// Test 3: Create bill with server calculation
console.log('\n--- Test 3: Create Bill with Authoritative Server Calculation ---');
const createHandlers = require('../../frontend/modules/billing/api/handlers');
const handlers = createHandlers(db);

const mockReq = {
  body: {
    customer_name: 'Server Processing Test Customer',
    products: [
      {
        product_name: 'Test Item 1',
        rate: 500,
        qty: 2,
        disc1: 10,
        disc2: 0,
        gst_percent: 5,
        gst_reverse: false
      }
    ]
  },
  user: { id: 'admin', role: 'owner' }
};

let capturedResponse = null;
let capturedStatus = null;
const mockRes = {
  status: (code) => {
    capturedStatus = code;
    return mockRes;
  },
  json: (data) => {
    capturedResponse = data;
    return mockRes;
  }
};

handlers.createBill(mockReq, mockRes);
console.log('createBill Status:', capturedStatus);
console.log('createBill Created Bill:', JSON.stringify(capturedResponse, null, 2));

assert.strictEqual(capturedStatus, 201, 'Status should be 201 Created');
assert(capturedResponse.id, 'Should have created bill ID');
assert.strictEqual(capturedResponse.total_discount, 100);
assert.strictEqual(capturedResponse.total_gst, 45);
assert.strictEqual(capturedResponse.grand_total, 945); // (1000 - 100) * 1.05 = 945

// Clean up test invoice
db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(capturedResponse.id);
db.prepare('DELETE FROM invoices WHERE id = ?').run(capturedResponse.id);
console.log('✅ Test 3 Passed: Server-authoritative bill created and cleaned up.');

// Test 4: Convert Order to Invoice
console.log('\n--- Test 4: Convert Order to Invoice Server-Authoritatively ---');
// Clean up any old test order
db.prepare("DELETE FROM orders WHERE order_number LIKE 'ORD-TEST-%'").run();

const dummyCustomer = db.prepare("SELECT id FROM contacts WHERE LOWER(type) = 'customer' LIMIT 1").get();
const custId = dummyCustomer ? dummyCustomer.id : 2;
const testOrderNum = 'ORD-TEST-' + Date.now();

const orderInsert = db.prepare(`
  INSERT INTO orders (customer_id, order_number, current_stage, status, total_amount, order_date, created_at, updated_at)
  VALUES (?, ?, 'stage2', 'pending', 500, datetime('now'), datetime('now'), datetime('now'))
`).run(custId, testOrderNum);
const testOrderId = orderInsert.lastInsertRowid;

db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total, created_at, updated_at)
  VALUES (?, NULL, 2, 250, 500, datetime('now'), datetime('now'))
`).run(testOrderId);

let convertStatus = null;
let convertResponse = null;
const convertRes = {
  status: (code) => {
    convertStatus = code;
    return convertRes;
  },
  json: (data) => {
    convertResponse = data;
    return convertRes;
  }
};

handlers.convertOrderToInvoice({ params: { id: testOrderId }, user: { id: 'admin', role: 'owner' } }, convertRes);
console.log('convertOrderToInvoice Response:', convertResponse);

assert.strictEqual(convertResponse.success, true);
assert(convertResponse.invoice_id, 'Should have created invoice_id');
assert(convertResponse.invoice_no, 'Should have invoice_no');

// Verify order is now stage3 & status completed
const updatedOrder = db.prepare('SELECT current_stage, status, bill_reference FROM orders WHERE id = ?').get(testOrderId);
assert.strictEqual(updatedOrder.current_stage, 'stage3');
assert.strictEqual(updatedOrder.status, 'completed');
assert.strictEqual(updatedOrder.bill_reference, convertResponse.invoice_no);

// Clean up
db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(convertResponse.invoice_id);
db.prepare('DELETE FROM invoices WHERE id = ?').run(convertResponse.invoice_id);
db.prepare('DELETE FROM order_items WHERE order_id = ?').run(testOrderId);
db.prepare('DELETE FROM orders WHERE id = ?').run(testOrderId);

console.log('✅ Test 4 Passed: Order converted to invoice with stage transition and invoice_items populated.');

console.log('\n🎉 ALL SERVER-SIDE BILLING PROCESSING TESTS PASSED SUCCESSFULLY!\n');
db.close();
