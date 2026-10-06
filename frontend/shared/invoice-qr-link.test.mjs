import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceQrLink } from './invoice-qr-link.mjs';

test('reads an encrypted invoice reference from the customer ledger QR link', () => {
  assert.deepEqual(
    parseInvoiceQrLink('https://mac.example/ledger/ledger-token?r=v1.encrypted-ref'),
    { type: 'ledger', ledgerToken: 'ledger-token', reference: 'v1.encrypted-ref' }
  );
});

test('reads the invoice number from the payment note on older invoice QRs', () => {
  assert.deepEqual(
    parseInvoiceQrLink('upi://pay?pa=merchant%40bank&tn=Inv%3AINV-2026-0042%20%28Bill%3A500%29'),
    { type: 'payment', invoiceNo: 'INV-2026-0042' }
  );
});

test('accepts a manually entered relative ledger URL', () => {
  assert.deepEqual(
    parseInvoiceQrLink('/ledger/ledger-token?r=v1.encrypted-ref'),
    { type: 'ledger', ledgerToken: 'ledger-token', reference: 'v1.encrypted-ref' }
  );
});

test('rejects a ledger URL without a reference and a payment note without an invoice', () => {
  assert.equal(parseInvoiceQrLink('https://mac.example/ledger/ledger-token'), null);
  assert.equal(parseInvoiceQrLink('upi://pay?pa=merchant%40bank&tn=Payment'), null);
  assert.equal(parseInvoiceQrLink('not a URL'), null);
});
