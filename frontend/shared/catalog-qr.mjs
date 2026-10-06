function decodePathSegment(value) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

export function parseCatalogQr(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  let url;
  try {
    url = new URL(value.trim(), 'https://catalog-qr.invalid');
  } catch {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean).map(decodePathSegment);
  const publicIndex = segments.findIndex(segment => segment.toLowerCase() === 'public');
  if (publicIndex < 0) return null;

  const resource = segments[publicIndex + 1]?.toLowerCase();
  if (resource === 'product' && segments[publicIndex + 2]) {
    return { type: 'product', identifier: segments[publicIndex + 2] };
  }
  if (resource === 'batch' && segments[publicIndex + 2]) {
    return {
      type: 'batch',
      identifier: segments[publicIndex + 2],
      productId: url.searchParams.get('sku') || url.searchParams.get('product_id'),
      variantId: url.searchParams.get('variant_id'),
      batchId: url.searchParams.get('batch_id') || url.searchParams.get('batch')
    };
  }
  if (resource && resource !== 'catalog') {
    return { type: 'product', identifier: segments[publicIndex + 1] };
  }

  return null;
}

function normalized(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function sameId(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined &&
    String(left) === String(right);
}

export function resolveCatalogQr(products, value) {
  return diagnoseCatalogQr(products, value).match;
}

export function diagnoseCatalogQr(products, value) {
  const parsed = typeof value === 'string' ? parseCatalogQr(value) : value;
  if (!parsed) return { match: null, reason: 'invalid' };
  if (!Array.isArray(products) || products.length === 0) {
    return { match: null, reason: 'catalog_unavailable' };
  }

  if (parsed.type === 'product') {
    const exactId = products.find(product => sameId(product?.id, parsed.identifier));
    if (exactId) return { match: { type: 'product', product: exactId }, reason: null };

    const identifier = normalized(parsed.identifier);
    const matches = products.filter(product =>
      [product?.sku, product?.sku_code, product?.product_code]
        .some(candidate => normalized(candidate) === identifier)
    );
    if (matches.length > 1) return { match: null, reason: 'ambiguous' };
    if (matches.length === 0) return { match: null, reason: 'not_found' };
    return { match: { type: 'product', product: matches[0] }, reason: null };
  }

  if (parsed.type !== 'batch') return { match: null, reason: 'invalid' };
  const batchNumber = normalized(parsed.identifier);
  const matches = [];

  for (const product of products) {
    if (parsed.productId && !sameId(product?.id, parsed.productId)) continue;
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    for (const variant of variants) {
      if (parsed.variantId && !sameId(variant?.id, parsed.variantId)) continue;
      const batches = Array.isArray(variant?.batches) ? variant.batches : [];
      for (const batch of batches) {
        const batchIdMatches = parsed.batchId && sameId(batch?.id, parsed.batchId);
        if (batchIdMatches || (!parsed.batchId && normalized(batch?.batch_no ?? batch?.batchNo) === batchNumber)) {
          matches.push({ type: 'batch', product, variant, batch });
        }
      }
    }

    const batches = Array.isArray(product?.batches) ? product.batches : [];
    for (const batch of batches) {
      const batchIdMatches = parsed.batchId && sameId(batch?.id, parsed.batchId);
      if (!batchIdMatches && (parsed.batchId || normalized(batch?.batch_no ?? batch?.batchNo) !== batchNumber)) continue;
      const variant = variants.find(candidate => sameId(candidate.id, batch.variant_id));
      if (!matches.some(match => sameId(match.batch?.id, batch.id) && sameId(match.product?.id, product.id))) {
        matches.push({ type: 'batch', product, variant: variant || null, batch });
      }
    }
  }

  if (matches.length > 1) return { match: null, reason: 'ambiguous_batch' };
  if (matches.length === 0) return { match: null, reason: 'not_found' };
  return { match: matches[0], reason: null };
}

export function catalogQrFailureMessage(reason) {
  switch (reason) {
    case 'catalog_unavailable':
      return 'The product catalog is not loaded. Refresh the catalog and scan again.';
    case 'ambiguous_batch':
      return 'This batch QR contains only a batch number shared by multiple products. Reprint that batch label to include its product, variant, and batch IDs.';
    case 'ambiguous':
      return 'This product code matches multiple catalog entries. Use a product QR with a unique product ID.';
    case 'invalid':
      return 'This QR does not contain a supported product or batch catalog link.';
    default:
      return 'QR decoded, but its product or batch was not found in the loaded catalog. Refresh the catalog; reprint only if this is a legacy batch label without IDs.';
  }
}
