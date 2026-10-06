import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCatalogBatchQrUrl,
  createCatalogProductQrUrl,
  resolveCatalogQrBaseUrl
} from './catalog-qr-url.mjs';
import { parseCatalogQr } from './catalog-qr.mjs';

test('uses a configured public HTTPS origin even when generated from localhost', () => {
  assert.equal(
    resolveCatalogQrBaseUrl('http://localhost:5173', 'https://mac.faizal.uk'),
    'https://mac.faizal.uk'
  );
});

test('rejects local QR printing without a configured public destination', () => {
  assert.throws(
    () => resolveCatalogQrBaseUrl('http://localhost:5173'),
    /Set VITE_PUBLIC_APP_URL/
  );
});

test('rejects a configured local host as a QR destination', () => {
  assert.throws(
    () => resolveCatalogQrBaseUrl('http://localhost:5173', 'https://localhost'),
    /cannot point to a local host/
  );
});

test('requires HTTPS for non-local QR destinations', () => {
  assert.throws(
    () => resolveCatalogQrBaseUrl('http://inventory.example.com'),
    /require an HTTPS/
  );
});

test('rejects a configured QR destination with an application path', () => {
  assert.throws(
    () => resolveCatalogQrBaseUrl('https://mac.faizal.uk', 'https://mac.faizal.uk/app'),
    /must be an origin/
  );
});

test('embeds stable product, variant, and batch IDs in batch URLs', () => {
  const url = new URL(createCatalogBatchQrUrl('https://mac.faizal.uk', 'LOT 10', 21, 34, 55));
  assert.equal(url.pathname, '/public/batch/LOT%2010');
  assert.equal(url.searchParams.get('sku'), '21');
  assert.equal(url.searchParams.get('variant_id'), '34');
  assert.equal(url.searchParams.get('batch_id'), '55');
});

test('builds product QR URLs with encoded identifiers', () => {
  assert.equal(
    createCatalogProductQrUrl('https://mac.faizal.uk', 'product 21'),
    'https://mac.faizal.uk/public/product/product%2021'
  );
});

test('generated batch QR URLs parse to the same stable catalog identifiers', () => {
  const url = createCatalogBatchQrUrl('https://mac.faizal.uk', 'LOT-A', 21, 34, 55);
  assert.deepEqual(parseCatalogQr(url), {
    type: 'batch',
    identifier: 'LOT-A',
    productId: '21',
    variantId: '34',
    batchId: '55'
  });
});
