/**
 * Migration: Add download limit columns to cloud_files
 */
module.exports = {
  up: (db) => {
    try {
      const tableInfo = db.prepare("PRAGMA table_info(cloud_files)").all();
      const hasDownloadLimit = tableInfo.some(col => col.name === 'share_download_limit');
      const hasDownloadCount = tableInfo.some(col => col.name === 'share_download_count');

      if (!hasDownloadLimit) {
        console.log('📦 Migration: Adding share_download_limit to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN share_download_limit INTEGER").run();
      }

      if (!hasDownloadCount) {
        console.log('📦 Migration: Adding share_download_count to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN share_download_count INTEGER DEFAULT 0").run();
      }

    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('✗ Migration failed (cloud sharing limits):', err.message);
      }
    }
  }
};
