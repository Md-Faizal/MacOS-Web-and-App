const Database = require('better-sqlite3');
const path = require('path');

const dbPath = 'c:\\Users\\HP\\Desktop\\MacOS Project\\MacOS-Development\\database\\MacOS.db';
const db = new Database(dbPath);

try {
  const contacts = db.prepare('SELECT id, name, exclude_from_stats FROM contacts').all();
  console.log('Contacts in DB:');
  console.log(JSON.stringify(contacts, null, 2));
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
