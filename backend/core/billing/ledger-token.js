/**
 * Customer Ledger Token Generator and Resolver
 * Provides unguessable, professional short URL tokens for customer statement sharing.
 */

const crypto = require('crypto');

// Clean alphabet avoiding easily confused characters (no 0, O, 1, I, l)
const TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

function generateLedgerToken(length = 10) {
  const bytes = crypto.randomBytes(length * 2);
  let token = '';
  for (let i = 0; i < bytes.length && token.length < length; i++) {
    const idx = bytes[i] % TOKEN_ALPHABET.length;
    token += TOKEN_ALPHABET[idx];
  }
  return token;
}

function getOrCreateCustomerLedgerToken(db, customerId) {
  if (!db || !customerId) return null;
  
  try {
    const row = db.prepare('SELECT id, ledger_token FROM contacts WHERE id = ?').get(customerId);
    if (!row) return null;
    
    if (row.ledger_token && typeof row.ledger_token === 'string' && row.ledger_token.trim().length >= 6) {
      return row.ledger_token.trim();
    }

    let token = '';
    let exists = true;
    const checkStmt = db.prepare('SELECT id FROM contacts WHERE ledger_token = ?');
    
    while (exists) {
      token = generateLedgerToken();
      if (!checkStmt.get(token)) exists = false;
    }

    db.prepare('UPDATE contacts SET ledger_token = ? WHERE id = ?').run(token, customerId);
    return token;
  } catch (err) {
    console.error('[LedgerToken] Error resolving token for customer:', customerId, err.message);
    return null;
  }
}

function findCustomerByLedgerToken(db, token) {
  if (!db || !token) return null;
  const clean = String(token).trim();
  if (!clean) return null;
  
  try {
    return db.prepare('SELECT * FROM contacts WHERE ledger_token = ?').get(clean);
  } catch (err) {
    console.error('[LedgerToken] Error finding customer by token:', err.message);
    return null;
  }
}

module.exports = {
  generateLedgerToken,
  getOrCreateCustomerLedgerToken,
  findCustomerByLedgerToken
};
