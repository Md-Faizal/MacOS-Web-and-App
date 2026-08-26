/**
 * Migration: Add security columns to cloud_sharing
 */
module.exports = {
  up: (db) => {
    try {
      const tableInfo = db.prepare("PRAGMA table_info(cloud_files)").all();
      const hasSharePassword = tableInfo.some(col => col.name === 'share_password');
      const hasShareExpiresAt = tableInfo.some(col => col.name === 'share_expires_at');

      if (!hasSharePassword) {
        console.log('📦 Migration: Adding share_password to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN share_password TEXT").run();
      }

      if (!hasShareExpiresAt) {
        console.log('📦 Migration: Adding share_expires_at to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN share_expires_at DATETIME").run();
      }

    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('✗ Migration failed (cloud sharing security):', err.message);
      }
    }
  }
};
