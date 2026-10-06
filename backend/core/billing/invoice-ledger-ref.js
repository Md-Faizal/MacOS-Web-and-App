const crypto = require('crypto');

const TOKEN_PREFIX = 'v1.';
const TOKEN_AAD = Buffer.from('macos-invoice-ledger-ref:v1');

function deriveKey(secret = process.env.INVOICE_LEDGER_QR_SECRET || process.env.JWT_SECRET) {
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    /^(generate|your|replace|change-me|example|placeholder)(?:[-_\s]|$)/i.test(secret.trim())
  ) {
    throw new Error('Set INVOICE_LEDGER_QR_SECRET (recommended) or JWT_SECRET to a stable, randomly generated secret of at least 32 characters before generating invoice QR links.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encodeBase64Url(value) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid invoice reference.');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64 + '='.repeat((4 - base64.length % 4) % 4), 'base64');
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '');
  if (!/^[1-9]\d*$/.test(id)) throw new TypeError(`${fieldName} must be a positive integer.`);
  return id;
}

function encryptInvoiceLedgerReference(customerId, invoiceId, secret) {
  const normalizedCustomerId = normalizeId(customerId, 'Customer ID');
  const normalizedInvoiceId = normalizeId(invoiceId, 'Invoice ID');
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(`${normalizedCustomerId}:${normalizedInvoiceId}`, 'utf8'),
    cipher.final()
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${TOKEN_PREFIX}${encodeBase64Url(token)}`;
}

function decryptInvoiceLedgerReference(reference, secret) {
  if (typeof reference !== 'string' || !reference.startsWith(TOKEN_PREFIX)) {
    throw new Error('Invalid invoice reference.');
  }
  const token = decodeBase64Url(reference.slice(TOKEN_PREFIX.length));
  if (token.length < 29 || token.length > 128) throw new Error('Invalid invoice reference.');

  const iv = token.subarray(0, 12);
  const authTag = token.subarray(12, 28);
  const ciphertext = token.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const match = /^([1-9]\d*):([1-9]\d*)$/.exec(plaintext);
  if (!match) throw new Error('Invalid invoice reference.');
  return { customerId: match[1], invoiceId: match[2] };
}

module.exports = {
  encryptInvoiceLedgerReference,
  decryptInvoiceLedgerReference
};
