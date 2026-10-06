export function parseInvoiceQrLink(value, baseUrl = 'https://localhost') {
  if (typeof value !== 'string' || !value.trim()) return null;

  let url;
  try {
    url = new URL(value.trim(), baseUrl);
  } catch {
    return null;
  }

  if (url.protocol.toLowerCase() === 'upi:') {
    const note = url.searchParams.get('tn') || '';
    const invoiceMatch = /\bInv:([^\s|]+)/i.exec(note);
    return invoiceMatch ? { type: 'payment', invoiceNo: invoiceMatch[1] } : null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const ledgerMatch = /^\/(?:ledger|l)\/([A-Za-z0-9_-]+)\/?$/i.exec(url.pathname);
  const reference = url.searchParams.get('r');
  if (!ledgerMatch || !reference) return null;

  return {
    type: 'ledger',
    ledgerToken: ledgerMatch[1],
    reference
  };
}
