import test from 'node:test';
import assert from 'node:assert/strict';
import { clampQcReceivedQuantity, incrementQcReceivedQuantity } from './qc-quantity.mjs';

test('each QC scan adds one unit until expected quantity is reached', () => {
  assert.equal(incrementQcReceivedQuantity(0, 3), 1);
  assert.equal(incrementQcReceivedQuantity(2, 3), 3);
  assert.equal(incrementQcReceivedQuantity(3, 3), null);
});

test('manual QC quantity is bounded by zero and expected quantity', () => {
  assert.equal(clampQcReceivedQuantity(-1, 4), 0);
  assert.equal(clampQcReceivedQuantity(2.5, 4), 2.5);
  assert.equal(clampQcReceivedQuantity(9, 4), 4);
  assert.equal(clampQcReceivedQuantity(3, Number.NaN), 0);
});
