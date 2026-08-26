const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Path to your MacOS.db
const dbPath = path.join(__dirname, '../database/MacOS.db');

if (!fs.existsSync(dbPath)) {
  console.error('✗ Database file not found at:', dbPath);
  process.exit(1);
}

try {
  const db = new Database(dbPath);
  
  console.log('🔧 Attempting to reset admin password...');
  
  // Clear NEW table
  const stmt = db.prepare('UPDATE auth_credentials SET password_hash = NULL WHERE id = ?');
  const info = stmt.run('admin_auth');
  
  // Also clear OLD table just in case (cleanup)
  const oldStmt = db.prepare('DELETE FROM app_settings WHERE setting_key = ?');
  oldStmt.run('admin_password_hash');
  
  if (info.changes > 0) {
    console.log('✅ Admin password hash has been removed from the auth_credentials table.');
    console.log('👉 You will be prompted to set a NEW password on your next login attempt.');
  } else {
    console.log('⚠️  No active password found in the database. Nothing to reset.');
  }
  
  db.close();
  process.exit(0);
} catch (error) {
  console.error('✗ Failed to reset password:', error.message);
  process.exit(1);
}
