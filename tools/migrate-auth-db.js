const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/MacOS.db');

if (!fs.existsSync(dbPath)) {
    console.error(`✗ Database not found at ${dbPath}`);
    process.exit(1);
}

const db = new Database(dbPath);

console.log('🚀 Starting Auth Migration...');

try {
    // 1. Create the new auth_credentials table
    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_credentials (
            id TEXT PRIMARY KEY,
            user_role TEXT DEFAULT 'admin',
            password_hash TEXT,
            password_hint TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✓ Created auth_credentials table');

    // 2. Fetch existing data from app_settings
    const getHash = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get('admin_password_hash');
    const getHint = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get('admin_password_hint');

    if (getHash) {
        // 3. Insert into new table
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO auth_credentials (id, user_role, password_hash, password_hint)
            VALUES (?, ?, ?, ?)
        `);
        insertStmt.run('admin_auth', 'admin', getHash.setting_value, getHint ? getHint.setting_value : null);
        console.log('✓ Migrated existing admin credentials');

        // 4. (Optional) Cleanup app_settings - keeping it for now to avoid breaking existing code until backend is updated
        // db.prepare('DELETE FROM app_settings WHERE setting_key IN (?, ?)').run('admin_password_hash', 'admin_password_hint');
        // console.log('✓ Cleaned up old credentials from app_settings');
    } else {
        console.log('ℹ No existing credentials found in app_settings. Skipping data copy.');
    }

    console.log('✅ Migration completed successfully!');
} catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
} finally {
    db.close();
}
