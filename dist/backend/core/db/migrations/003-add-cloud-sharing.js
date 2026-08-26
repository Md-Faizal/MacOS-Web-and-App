/**
 * Migration: Add sharing columns to cloud_files
 */
module.exports = {
  up: (db) => {
    try {
      // Add share_token column if it doesn't exist
      const tableInfo = db.prepare("PRAGMA table_info(cloud_files)").all();
      const hasShareToken = tableInfo.some(col => col.name === 'share_token');
      const hasSharedAt = tableInfo.some(col => col.name === 'shared_at');

      if (!hasShareToken) {
        console.log('📦 Migration: Adding share_token to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN share_token TEXT UNIQUE").run();
      }

      if (!hasSharedAt) {
        console.log('📦 Migration: Adding shared_at to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN shared_at DATETIME").run();
      }

    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('✗ Migration failed (cloud sharing):', err.message);
      }
    }
  }
};
