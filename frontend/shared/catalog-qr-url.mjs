const LOCAL_HOSTS = new Set(['localhost', '0.0.0.0', '[::1]']);

export function resolveCatalogQrBaseUrl(currentOrigin, configuredBaseUrl = '') {
  const configured = String(configuredBaseUrl || '').trim();
  const current = String(currentOrigin || '').trim();
  const baseUrl = configured || current;
  if (!baseUrl) throw new Error('Configure the public app URL before generating QR labels.');

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('The public app URL for QR labels is invalid.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTS.has(hostname) || hostname.startsWith('127.');
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('QR labels require an HTTPS public app URL.');
  }
  if (isLocal) {
    if (configured) throw new Error('The QR label app URL cannot point to a local host.');
    throw new Error('Set VITE_PUBLIC_APP_URL to the public app URL before generating QR labels from a local server.');
  }
  if (parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('The QR label app URL must be an origin without a path, credentials, query, or fragment.');
  }

  return parsed.origin;
}

export function createCatalogProductQrUrl(baseUrl, productId) {
  return new URL(`/public/product/${encodeURIComponent(productId)}`, baseUrl).toString();
}

export function createCatalogBatchQrUrl(baseUrl, batchNo, productId = null, variantId = null, batchId = null) {
  const url = new URL(`/public/batch/${encodeURIComponent(batchNo)}`, baseUrl);
  if (productId !== null && productId !== undefined) url.searchParams.set('sku', String(productId));
  if (variantId !== null && variantId !== undefined) url.searchParams.set('variant_id', String(variantId));
  if (batchId !== null && batchId !== undefined) url.searchParams.set('batch_id', String(batchId));
  return url.toString();
}
