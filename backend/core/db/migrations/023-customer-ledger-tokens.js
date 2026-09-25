/**
 * Migration 023: Customer Ledger Access Tokens
 * Adds unique random access token for every customer for short professional URLs without ID cross-search.
 */

const { generateLedgerToken } = require('../../billing/ledger-token');

function hasColumn(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some(column => column.name === columnName);
}

function up(db) {
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'").get()) {
    if (!hasColumn(db, 'contacts', 'ledger_token')) {
      db.exec('ALTER TABLE contacts ADD COLUMN ledger_token TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_ledger_token ON contacts(ledger_token)');
    }

    // Populate existing contacts that don't have a ledger_token
    const existing = db.prepare("SELECT id, ledger_token FROM contacts WHERE ledger_token IS NULL OR ledger_token = ''").all();
    if (existing.length > 0) {
      console.log(`🔑 Generating secure random ledger tokens for ${existing.length} contact(s)...`);
      const updateStmt = db.prepare('UPDATE contacts SET ledger_token = ? WHERE id = ?');
      const checkStmt = db.prepare('SELECT id FROM contacts WHERE ledger_token = ?');

      const trans = db.transaction(() => {
        for (const c of existing) {
          let token = '';
          let exists = true;
          while (exists) {
            token = generateLedgerToken(10);
            if (!checkStmt.get(token)) exists = false;
          }
          updateStmt.run(token, c.id);
        }
      });
      trans();
      console.log(`✓ Populated ${existing.length} contact ledger token(s)`);
    }
  }
}

module.exports = { up };
