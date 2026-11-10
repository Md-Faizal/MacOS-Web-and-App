'use strict';

/**
 * test-payment-gateway.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification test suite for Customer-Facing Payment Gateway Service
 * Validates link generation, public resolution, dynamic QR creation,
 * zero-bank-API remittance submission, and ledger settlement.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const dbPath = path.resolve(__dirname, '../../database/MacOS.db');
if (!fs.existsSync(dbPath)) {
  console.log('Database file not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
const paymentGateway = require('../core/billing/payment-gateway-service');

async function runTests() {
  console.log('=================================================================');
  console.log('🧪 Starting Customer Payment Gateway Test Suite');
  console.log('=================================================================\n');

  // Step 1: Ensure Table Exists
  paymentGateway.ensurePaymentLinksTable(db);
  console.log('✓ Step 1: payment_links schema and indexes verified.');

  // Step 2: Get or create test contact
  let contact = db.prepare('SELECT id, name, phone FROM contacts LIMIT 1').get();
  let createdTestContact = false;

  if (!contact) {
    const res = db.prepare(`
      INSERT INTO contacts (name, phone, type)
      VALUES ('Test Pharmacy Gateway Customer', '9876543210', 'CUSTOMER')
    `).run();
    contact = {
      id: res.lastInsertRowid,
      name: 'Test Pharmacy Gateway Customer',
      phone: '9876543210'
    };
    createdTestContact = true;
  }
  console.log(`✓ Step 2: Test customer active: "${contact.name}" (ID: ${contact.id})`);

  // Step 3: Create Payment Link
  const testAmount = 14500.50;
  const link = paymentGateway.createPaymentLink(db, {
    customerId: contact.id,
    amount: testAmount,
    description: 'Statement Remittance Test Bill #GST-2026-TEST',
    expiresInDays: 7,
    userId: 'admin_test'
  });

  assert(link && link.link_code, 'Payment link generation failed.');
  assert.strictEqual(link.customer_id, contact.id);
  assert.strictEqual(link.amount, testAmount);
  assert(link.share_url.includes('faizal.uk/p/'), 'Share URL must use faizal.uk domain.');
  console.log(`✓ Step 3: Payment link created: ${link.share_url} (Slug: ${link.link_code})`);

  // Step 4: Resolve Public Gateway Data
  const publicData = await paymentGateway.getPublicPaymentLinkData(db, link.link_code);
  assert(publicData, 'Failed to fetch public gateway data');
  assert.strictEqual(publicData.code, link.link_code);
  assert.strictEqual(publicData.amount, testAmount);
  assert.strictEqual(publicData.customer_name, contact.name);
  assert(publicData.upi_uri.startsWith('upi://pay?'), 'Valid UPI intent URI missing.');
  assert(publicData.qr_data_url.startsWith('data:image/png;base64,'), 'Dynamic QR data URL generated.');
  assert(publicData.banking.account_number, 'Bank account number present.');
  assert(publicData.banking.ifsc, 'Bank IFSC code present.');
  console.log('✓ Step 4: Public gateway data resolved with dynamic QR and banking coordinates.');

  // Step 5: Submit Remittance Claim (Customer paid via UPI/Netbanking)
  const testUtr = '439810294821';
  const confirmResult = await paymentGateway.confirmPaymentRemittance(db, link.link_code, {
    utr: testUtr,
    amount: testAmount,
    notes: 'Transferred via Google Pay',
    payerName: 'Test Remitter'
  });

  assert(confirmResult.success, 'Remittance confirmation failed.');
  assert.strictEqual(confirmResult.confirmation.claimed_utr, testUtr);
  console.log(`✓ Step 5: Remittance claim registered with UTR: ${testUtr}`);

  // Step 6: Verify status is CLAIMED in database
  const updatedLink = db.prepare('SELECT * FROM payment_links WHERE link_code = ?').get(link.link_code);
  assert.strictEqual(updatedLink.status, 'CLAIMED');
  assert.strictEqual(updatedLink.claimed_utr, testUtr);
  console.log('✓ Step 6: Database status correctly updated to CLAIMED.');

  // Step 7: List Payment Links
  const listResult = paymentGateway.listPaymentLinks(db, { customerId: contact.id });
  assert(listResult.links.length > 0, 'No links returned in listing.');
  const listed = listResult.links.find(l => l.link_code === link.link_code);
  assert(listed, 'Created link not found in listing.');
  assert.strictEqual(listed.status, 'CLAIMED');
  console.log(`✓ Step 7: Link listing verified (Total: ${listResult.stats.total_links}, Claimed: ${listResult.stats.claimed_links})`);

  // Step 8: Settle Link into Ledger
  const settleResult = paymentGateway.settlePaymentLink(db, link.id, {
    paymentMethod: 'upi',
    notes: 'Verified against bank credit memo',
    userId: 'finance_admin'
  });

  assert(settleResult.success, 'Settlement failed.');
  assert(settleResult.payment_id, 'Payment record ID missing.');

  const settledLink = db.prepare('SELECT * FROM payment_links WHERE id = ?').get(link.id);
  assert.strictEqual(settledLink.status, 'SETTLED');
  assert.strictEqual(settledLink.settled_payment_id, settleResult.payment_id);

  const paymentRecord = db.prepare('SELECT * FROM payments WHERE id = ?').get(settleResult.payment_id);
  assert(paymentRecord, 'Formal payment record missing from payments table.');
  assert.strictEqual(paymentRecord.customer_id, contact.id);
  assert.strictEqual(paymentRecord.amount, testAmount);
  console.log(`✓ Step 8: Payment link successfully settled into payments table (Payment ID: ${settleResult.payment_id})`);

  // Step 9: Cleanup test link and payment
  db.prepare('DELETE FROM payments WHERE id = ?').run(settleResult.payment_id);
  db.prepare('DELETE FROM payment_links WHERE id = ?').run(link.id);
  if (createdTestContact) {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(contact.id);
  }
  console.log('✓ Step 9: Test records cleaned up safely.\n');

  console.log('=================================================================');
  console.log('🎉 ALL PAYMENT GATEWAY TESTS PASSED SUCCESSFULLY!');
  console.log('=================================================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
