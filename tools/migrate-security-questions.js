const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/MacOS.db');

if (!fs.existsSync(dbPath)) {
    console.error(`✗ Database not found at ${dbPath}`);
    process.exit(1);
}

const db = new Database(dbPath);

console.log('🚀 Migrating Auth Credentials for Security Questions...');

try {
    // Add new columns to auth_credentials
    db.exec(`
        ALTER TABLE auth_credentials ADD COLUMN security_question TEXT;
    `);
    db.exec(`
        ALTER TABLE auth_credentials ADD COLUMN security_answer_hash TEXT;
    `);
    console.log('✓ Added security_question and security_answer_hash columns');

    console.log('✅ Migration completed successfully!');
} catch (error) {
    if (error.message.includes('duplicate column name')) {
        console.log('ℹ Columns already exist. Skipping.');
    } else {
        console.error('✗ Migration failed:', error.message);
        process.exit(1);
    }
} finally {
    db.close();
}
