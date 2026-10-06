import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QR_SCAN_ATTEMPT_DELAY_MS,
  QR_SCAN_REARM_DELAY_MS,
  QR_SCAN_SUCCESS_DELAY_MS,
  shouldRearmRepeatedQr
} from './qr-scan-policy.mjs';

test('re-arms the same QR promptly after it leaves the camera view', () => {
  assert.equal(shouldRearmRepeatedQr(1000, 1299), false);
  assert.equal(shouldRearmRepeatedQr(1000, 1300), true);
});

test('uses short QR-only decode intervals for responsive scanning', () => {
  assert.ok(QR_SCAN_ATTEMPT_DELAY_MS <= 120);
  assert.ok(QR_SCAN_SUCCESS_DELAY_MS <= 120);
  assert.ok(QR_SCAN_REARM_DELAY_MS <= 350);
});
