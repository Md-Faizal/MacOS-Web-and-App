const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../../database/MacOS.db'));
const { buildContactsListResponse } = require('../shared/api/contacts-contract');

const contacts = db.prepare(`
  SELECT c.*, 
         COALESCE(SUM(i.grand_total), 0) as real_total_sales,
         COALESCE(AVG(i.grand_total), 0) as real_avg_sales,
         (
           SELECT p.name 
           FROM invoice_items ii 
           JOIN products p ON ii.product_id = p.id 
           JOIN invoices inv ON ii.invoice_id = inv.id
           WHERE inv.customer_id = c.id
           GROUP BY ii.product_id 
           ORDER BY COUNT(*) DESC 
           LIMIT 1
         ) as favorite_product,
         (
           COALESCE(c.opening_balance, 0) +
           COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0) -
           COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT'), 0) -
           COALESCE((SELECT SUM(credit_amount) FROM payments WHERE customer_id = c.id AND type = 'CREDIT_NOTE'), 0)
         ) as current_due,
         (SELECT MAX(COALESCE(invoice_date, created_at)) FROM invoices WHERE customer_id = c.id) as last_bill_date,
         (SELECT MAX(COALESCE(payment_date, created_at)) FROM payments WHERE customer_id = c.id AND type = 'PAYMENT') as last_payment_date
  FROM contacts c
  LEFT JOIN invoices i ON c.id = i.customer_id
  GROUP BY c.id
  ORDER BY c.name ASC
`).all();

const response = buildContactsListResponse(contacts, 'phase5-check');

console.log('=== PHASE 5 CONTACTS CONTRACT CHECK ===');
console.log('contacts success:', response.success, 'count:', response.data.count);

const ok = response.success && response.data.count > 0;
if (!ok) {
  console.error('Phase 5 contacts contract check failed.');
  process.exit(1);
}

console.log('\nPhase 5 contacts contract checks passed.');
