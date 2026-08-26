const Database = require('better-sqlite3');
const dbPath = 'c:\\Users\\HP\\Desktop\\MacOS Project\\MacOS-Development\\database\\MacOS.db';
const db = new Database(dbPath);

try {
  // Test query with filtering
  const result = db.prepare(`
    SELECT 
      COALESCE(SUM(p.amount), 0) as payments_total,
      COALESCE(SUM(p.credit_amount), 0) as credits_total
    FROM payments p
    JOIN contacts c ON p.customer_id = c.id
    WHERE (p.type = 'PAYMENT' OR p.type = 'CREDIT_NOTE')
      AND (c.exclude_from_stats IS NULL OR c.exclude_from_stats = 0)
  `).get();
  
  // Test query WITHOUT filtering
  const resultUnfiltered = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as payments_total,
      COALESCE(SUM(credit_amount), 0) as credits_total
    FROM payments 
    WHERE type = 'PAYMENT' OR type = 'CREDIT_NOTE'
  `).get();

  console.log('Filtered Total:', result.payments_total + result.credits_total);
  console.log('Unfiltered Total:', resultUnfiltered.payments_total + resultUnfiltered.credits_total);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
