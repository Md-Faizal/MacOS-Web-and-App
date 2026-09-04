/**
 * Migration 020: Worker Audit Badges and Settings Toggle
 * Adds created_by_user_id and last_edited_by_user_id to products, contacts, invoices, payments, orders
 * Adds show_worker_badges to Settings
 */

module.exports = {
  version: 20,
  name: '020-worker-audit-badges',
  up: (db) => {
    const hasColumn = (database, table, column) => {
      try {
        const info = database.prepare(`PRAGMA table_info(${table})`).all();
        return info.some(col => col.name === column);
      } catch (e) {
        return false;
      }
    };

    // Contacts
    if (!hasColumn(db, 'contacts', 'created_by_user_id')) {
      db.exec('ALTER TABLE contacts ADD COLUMN created_by_user_id TEXT');
    }
    if (!hasColumn(db, 'contacts', 'last_edited_by_user_id')) {
      db.exec('ALTER TABLE contacts ADD COLUMN last_edited_by_user_id TEXT');
    }

    // Products
    if (!hasColumn(db, 'products', 'created_by_user_id')) {
      db.exec('ALTER TABLE products ADD COLUMN created_by_user_id TEXT');
    }
    if (!hasColumn(db, 'products', 'last_edited_by_user_id')) {
      db.exec('ALTER TABLE products ADD COLUMN last_edited_by_user_id TEXT');
    }

    // Invoices
    if (!hasColumn(db, 'invoices', 'created_by_user_id')) {
      db.exec('ALTER TABLE invoices ADD COLUMN created_by_user_id TEXT');
    }
    if (!hasColumn(db, 'invoices', 'last_edited_by_user_id')) {
      db.exec('ALTER TABLE invoices ADD COLUMN last_edited_by_user_id TEXT');
    }

    // Payments
    if (!hasColumn(db, 'payments', 'created_by_user_id')) {
      db.exec('ALTER TABLE payments ADD COLUMN created_by_user_id TEXT');
    }
    if (!hasColumn(db, 'payments', 'last_edited_by_user_id')) {
      db.exec('ALTER TABLE payments ADD COLUMN last_edited_by_user_id TEXT');
    }

    // Orders
    if (!hasColumn(db, 'orders', 'created_by_user_id')) {
      db.exec('ALTER TABLE orders ADD COLUMN created_by_user_id TEXT');
    }
    if (!hasColumn(db, 'orders', 'last_edited_by_user_id')) {
      db.exec('ALTER TABLE orders ADD COLUMN last_edited_by_user_id TEXT');
    }

    // Settings
    if (!hasColumn(db, 'Settings', 'show_worker_badges')) {
      db.exec('ALTER TABLE Settings ADD COLUMN show_worker_badges INTEGER DEFAULT 1');
    }
  }
};
