const Database = require('better-sqlite3');
const dbPath = 'c:\\Users\\HP\\Desktop\\MacOS Project\\MacOS-Development\\database\\MacOS.db';
const db = new Database(dbPath);

try {
  const customers = db.prepare(`
    SELECT 
      c.id,
      c.name,
      c.exclude_from_stats,
      COALESCE(l.current_due, 0) as current_due
    FROM contacts c
    LEFT JOIN ledger l ON c.id = l.customer_id
    WHERE (c.type IS NULL OR LOWER(c.type) = 'customer')
      AND (l.id IS NOT NULL OR COALESCE(c.opening_balance, 0) != 0)
    ORDER BY c.name ASC
  `).all();
  
  console.log('API-like Response:');
  console.log(JSON.stringify(customers, null, 2));
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
