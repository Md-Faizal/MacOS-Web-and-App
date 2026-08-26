module.exports = {
  up: (db) => {
    try {
      // Check if column exists first
      const info = db.prepare("PRAGMA table_info(contacts)").all();
      const hasCol = info.some(col => col.name === 'disable_duplex_export');
      
      if (!hasCol) {
        console.log('  ⚙️  Migration: Adding disable_duplex_export to contacts');
        db.prepare("ALTER TABLE contacts ADD COLUMN disable_duplex_export INTEGER DEFAULT 0").run();
      }
    } catch (err) {
      console.error('  ✗ Migration failed (007-add-duplex-export-toggle):', err.message);
    }
  }
};
