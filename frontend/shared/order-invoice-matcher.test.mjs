import assert from 'node:assert/strict';
import test from 'node:test';
import { findBestInvoiceMatchForOrder, findBestOrderMatchForInvoice } from './order-invoice-matcher.mjs';

const order = (overrides = {}) => ({
  id: 1,
  customer_id: 8,
  order_number: 'ORD-26001',
  order_date: '2026-10-20',
  total_amount: 200,
  items: [{ product_id: 4, product_name: 'Product A', quantity: 2, unit_price: 100 }],
  ...overrides
});

const invoice = (overrides = {}) => ({
  id: 10,
  invoice_no: 'INV-26001',
  customer_id: 8,
  invoice_date: '2026-10-21',
  grand_total: 200,
  items: [{ product_id: 4, product_name: 'Product A', qty: 2 }],
  ...overrides
});

test('matches invoices by total, product quantity, and date', () => {
  const match = findBestInvoiceMatchForOrder(order(), [invoice()]);

  assert.equal(match.invoice.invoice_no, 'INV-26001');
  assert.equal(match.score, 100);
  assert.equal(match.reasons.length, 3);
});

test('suggests the best same-customer order and excludes other customers', () => {
  const olderOrder = order({ id: 2, order_number: 'ORD-OLD', order_date: '2026-10-01' });
  const foreignOrder = order({ id: 3, customer_id: 9 });
  const match = findBestOrderMatchForInvoice(invoice(), [olderOrder, foreignOrder, order()]);

  assert.equal(match.order.order_number, 'ORD-26001');
});

test('does not match an invoice already linked to a different order', () => {
  const linkedOrder = order({ id: 2, bill_reference: 'INV-26001' });

  assert.equal(findBestInvoiceMatchForOrder(order(), [invoice()], [order(), linkedOrder]), null);
  assert.equal(findBestOrderMatchForInvoice(invoice(), [linkedOrder]), null);
});
