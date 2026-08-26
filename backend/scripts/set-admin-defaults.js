const DatabaseManager = require('../core/db/database-manager');
const db = DatabaseManager.initialize();

db.prepare(`
  UPDATE users 
  SET full_name = 'Mohammad Faizal', email = 'fazztronic@gmail.com', google_email = 'fazztronic@gmail.com' 
  WHERE role = 'owner' OR id = 'admin_auth'
`).run();

try {
  db.prepare(`
    UPDATE user_profile 
    SET full_name = 'Mohammad Faizal', email_id = 'fazztronic@gmail.com', google_email = 'fazztronic@gmail.com' 
    WHERE id = 'admin_auth'
  `).run();
} catch (e) {}

const admin = db.prepare("SELECT id, full_name, email, role, status FROM users WHERE role = 'owner' OR id = 'admin_auth'").get();
console.log('✓ Admin user verified in database:', admin);
process.exit(0);
