const Database = require('better-sqlite3');
const dbPath = 'c:\\Users\\HP\\Desktop\\MacOS Project\\MacOS-Development\\database\\MacOS.db';
const db = new Database(dbPath);

try {
  const stmt = db.prepare(`
    SELECT 
      strftime('%Y-%m', i.created_at) as month,
      SUM(i.grand_total) as revenue,
      COUNT(i.id) as count
    FROM invoices i
    JOIN contacts c ON i.customer_id = c.id
    WHERE c.exclude_from_stats = 0
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `);
  const data = stmt.all();
  console.log('Success:', JSON.stringify(data, null, 2));
} catch (error) {
  console.error('Query Error:', error.message);
} finally {
  db.close();
}
