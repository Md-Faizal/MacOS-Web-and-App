module.exports = {
  up: (db) => {
    try {
      // Check if column exists first
      const info = db.prepare("PRAGMA table_info(cloud_files)").all();
      const hasThumb = info.some(col => col.name === 'thumbnail_path');
      
      if (!hasThumb) {
        console.log('  ⚙️  Migration: Adding thumbnail_path to cloud_files');
        db.prepare("ALTER TABLE cloud_files ADD COLUMN thumbnail_path TEXT").run();
      }
    } catch (err) {
      console.error('  ✗ Migration failed (006-add-cloud-thumbnails):', err.message);
    }
  }
};
