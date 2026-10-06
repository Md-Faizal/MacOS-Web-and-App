import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogQr, resolveCatalogQr } from './catalog-qr.mjs';

const catalog = [{
  id: 42,
  name: 'Sample product',
  sku: 'SAMPLE-42',
  variants: [{
    id: 7,
    pack_size_value: '10',
    pack_size_type: 'TAB',
    batches: [{ id: 9, variant_id: 7, batch_no: 'BATCH-A', mrp: 12.5 }]
  }],
  batches: [{ id: 9, variant_id: 7, batch_no: 'BATCH-A', mrp: 12.5 }]
}];

test('parses product and batch URLs used by generated catalog tags', () => {
  assert.deepEqual(parseCatalogQr('https://shop.example/public/product/42'), {
    type: 'product',
    identifier: '42'
  });
  assert.deepEqual(parseCatalogQr('https://shop.example/public/batch/BATCH-A'), {
    type: 'batch',
    identifier: 'BATCH-A',
    productId: null,
    variantId: null,
    batchId: null
  });
});

test('resolves product IDs, SKUs, and batch numbers against the loaded catalog', () => {
  assert.equal(resolveCatalogQr(catalog, 'https://shop.example/public/product/42').product, catalog[0]);
  assert.equal(resolveCatalogQr(catalog, 'https://shop.example/public/product/SAMPLE-42').product, catalog[0]);

  const resolvedBatch = resolveCatalogQr(catalog, 'https://shop.example/public/batch/batch-a');
  assert.equal(resolvedBatch.product, catalog[0]);
  assert.equal(resolvedBatch.variant, catalog[0].variants[0]);
  assert.equal(resolvedBatch.batch, catalog[0].variants[0].batches[0]);
});

test('uses embedded product, variant, and batch IDs when batch labels repeat', () => {
  const duplicateLabel = {
    ...catalog[0],
    id: 43,
    variants: [{
      id: 8,
      pack_size_value: '20',
      pack_size_type: 'TAB',
      batches: [{ id: 10, variant_id: 8, batch_no: 'BATCH-A', mrp: 22.5 }]
    }],
    batches: [{ id: 10, variant_id: 8, batch_no: 'BATCH-A', mrp: 22.5 }]
  };

  const result = resolveCatalogQr(
    [...catalog, duplicateLabel],
    'https://shop.example/public/batch/BATCH-A?sku=43&variant_id=8&batch_id=10'
  );

  assert.equal(result.product, duplicateLabel);
  assert.equal(result.variant, duplicateLabel.variants[0]);
  assert.equal(result.batch, duplicateLabel.variants[0].batches[0]);
});

test('rejects unrelated URLs and ambiguous batch labels', () => {
  assert.equal(parseCatalogQr('https://shop.example/login'), null);
  assert.equal(resolveCatalogQr(catalog, 'https://shop.example/public/product/unknown'), null);
  assert.equal(resolveCatalogQr([...catalog, { ...catalog[0], id: 43 }], 'https://shop.example/public/batch/BATCH-A'), null);
});
