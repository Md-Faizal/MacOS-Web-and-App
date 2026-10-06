const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptInvoiceLedgerReference,
  decryptInvoiceLedgerReference
} = require('./invoice-ledger-ref');

const secret = 'test-only-stable-secret-that-is-long-enough';

test('encrypts compact invoice/customer references and decrypts them', () => {
  const encrypted = encryptInvoiceLedgerReference(42, 9876, secret);
  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+$/);
  assert.ok(encrypted.length < 80);
  assert.deepEqual(decryptInvoiceLedgerReference(encrypted, secret), {
    customerId: '42',
    invoiceId: '9876'
  });
});

test('uses a fresh nonce for each generated reference', () => {
  const first = encryptInvoiceLedgerReference(42, 9876, secret);
  const second = encryptInvoiceLedgerReference(42, 9876, secret);
  assert.notEqual(first, second);
  assert.deepEqual(decryptInvoiceLedgerReference(second, secret), {
    customerId: '42',
    invoiceId: '9876'
  });
});

test('rejects tampered references and incorrect secrets', () => {
  const encrypted = encryptInvoiceLedgerReference(42, 9876, secret);
  const token = encrypted.slice(-1) === 'A' ? 'B' : 'A';
  assert.throws(() => decryptInvoiceLedgerReference(`${encrypted.slice(0, -1)}${token}`, secret));
  assert.throws(() => decryptInvoiceLedgerReference(encrypted, 'different-long-enough-secret-value'));
});

test('rejects invalid IDs and weak or missing secrets', () => {
  assert.throws(() => encryptInvoiceLedgerReference(0, 9876, secret), /positive integer/);
  assert.throws(() => encryptInvoiceLedgerReference(42, 9876, 'short'), /INVOICE_LEDGER_QR_SECRET/);
  assert.throws(() => encryptInvoiceLedgerReference(42, 9876, 'generate-a-stable-secret-with-over-32-chars'), /randomly generated secret/);
});
