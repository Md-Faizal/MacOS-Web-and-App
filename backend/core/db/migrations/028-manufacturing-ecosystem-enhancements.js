/**
 * Migration 028: Manufacturing Ecosystem Enhancements
 * 
 * Implements:
 * 1. Attachments & Photos for BMR batches and Inward GRN (credit-note style documentation)
 * 2. Technical Staff & Doctors Master for custom authorizers
 * 3. Inward Procurement Ecosystem:
 *    - Purchase Orders (Inward Orders) & PO Items
 *    - Supplier Payments (Inward Payments) & Ledger calculation
 *    - Seed authentic suppliers into contacts (type = 'Supplier')
 * 4. Extends raw_materials master customization
 */

module.exports = {
  version: 28,
  name: '028-manufacturing-ecosystem-enhancements',

  up(db) {
    console.log('⚙️  Running migration 028: Manufacturing Ecosystem & Inward Suite...');

    // 1. Manufacturing Attachments (Photos & Documents)
    db.exec(`
      CREATE TABLE IF NOT EXISTS manufacturing_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- 'BATCH', 'INWARD', 'FORMULA', 'SUPPLIER'
        entity_id INTEGER NOT NULL,
        file_name TEXT,
        file_type TEXT,
        image_data TEXT NOT NULL,
        caption TEXT,
        stage TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_mfg_attach_entity ON manufacturing_attachments(entity_type, entity_id);
    `);

    // 2. Technical Staff & Approved Doctors / Chemists Master
    db.exec(`
      CREATE TABLE IF NOT EXISTS technical_staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Approved Technical Person (AYUSH)',
        qualification TEXT,
        registration_no TEXT,
        phone TEXT,
        email TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed Technical Staff if empty
    const staffCount = db.prepare('SELECT COUNT(*) as count FROM technical_staff').get().count;
    if (staffCount === 0) {
      const insertStaff = db.prepare(`
        INSERT INTO technical_staff (name, role, qualification, registration_no, phone, email)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStaff.run('Dr. P. K. Mishra', 'Approved Technical Person (AYUSH)', 'BAMS, MD (Ayurveda)', 'OR-AYUR-10492', '9437012345', 'pkmishra@utkalayur.com');
      insertStaff.run('Vaidya B. C. Jena', 'Ayurvedic Chemist & Production Head', 'BAMS (Utkal)', 'OR-AYUR-08711', '9861054321', 'bcjena@utkalayur.com');
      insertStaff.run('R. K. Mohapatra', 'Quality Control In-Charge', 'M.Sc. Analytical Chemistry', 'QC-REG-4421', '9438098765', 'qc@utkalayur.com');
      insertStaff.run('K. C. Samantaray', 'Godown & Inward Manager', 'B.Sc. Botany', 'INW-MGR-102', '9777123987', 'godown@utkalayur.com');
      console.log('✓ Seeded 4 default technical staff & approved doctors');
    }

    // 3. Purchase Orders (Inward Orders)
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        po_number TEXT UNIQUE NOT NULL,
        supplier_id INTEGER NOT NULL,
        order_date DATE NOT NULL,
        expected_delivery_date DATE,
        status TEXT DEFAULT 'PLACED', -- 'DRAFT', 'PLACED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'
        total_amount REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES contacts(id)
      );

      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_order_id INTEGER NOT NULL,
        raw_material_id INTEGER NOT NULL,
        qty_ordered REAL NOT NULL,
        unit_rate REAL DEFAULT 0,
        tax_percent REAL DEFAULT 5.0,
        total_amount REAL NOT NULL,
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id)
      );
    `);

    // 4. Supplier Payments (Inward Disbursement & AP)
    db.exec(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_number TEXT UNIQUE NOT NULL,
        supplier_id INTEGER NOT NULL,
        payment_date DATE NOT NULL,
        amount REAL NOT NULL,
        payment_mode TEXT DEFAULT 'BANK', -- 'CASH', 'BANK', 'UPI', 'CHEQUE'
        reference_no TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES contacts(id)
      );
      CREATE INDEX IF NOT EXISTS idx_supp_pay_supplier ON supplier_payments(supplier_id);
    `);

    // 5. Add columns to raw_material_inward if not present
    try {
      db.exec(`ALTER TABLE raw_material_inward ADD COLUMN purchase_order_id INTEGER;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE raw_material_inward ADD COLUMN payment_status TEXT DEFAULT 'UNPAID';`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE raw_material_inward ADD COLUMN amount_paid REAL DEFAULT 0;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE raw_material_inward ADD COLUMN balance_due REAL DEFAULT 0;`);
    } catch (_) {}

    // 6. Add columns to raw_materials if not present
    try {
      db.exec(`ALTER TABLE raw_materials ADD COLUMN shelf_life_months INTEGER DEFAULT 24;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE raw_materials ADD COLUMN is_active INTEGER DEFAULT 1;`);
    } catch (_) {}
    try {
      db.exec(`ALTER TABLE raw_materials ADD COLUMN notes TEXT;`);
    } catch (_) {}

    // 7. Seed Authentic Suppliers into contacts (type = 'Supplier')
    const suppCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE type = 'Supplier'").get().count;
    if (suppCount === 0) {
      const insertSupp = db.prepare(`
        INSERT INTO contacts (name, email, phone, address, gstin, pan, type, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'Supplier', 'ACTIVE', ?)
      `);
      insertSupp.run(
        'Kalinga Herbal Co-operative Society',
        'kalingaherbs@cuttack.org',
        '9437198765',
        'Malgodown, Cuttack, Odisha - 753003',
        '21AABCK1234F1Z5',
        'AABCK1234F',
        'Primary grower co-operative for wild Dashamoola, Ashwagandha, and Triphala roots.'
      );
      insertSupp.run(
        'Dhenkanal Forest Non-Timber Producers',
        'forestproduce@dhenkanal.coop',
        '9861234567',
        'Station Bazar, Dhenkanal, Odisha - 759001',
        '21AAEFD5678J1Z2',
        'AAEFD5678J',
        'Approved government collector for pure Guda (Old Jaggery) and forest crude herbs.'
      );
      insertSupp.run(
        'Eastern Polymers & Glass Packaging',
        'orders@easternpackaging.in',
        '9438011223',
        'Industrial Estate, Balasore, Odisha - 756001',
        '21AABEP9988C1ZR',
        'AABEP9988C',
        'Manufacturer of pharmaceutical amber PET bottles 450ml, ROPP caps, and HDPE jars.'
      );
      insertSupp.run(
        'Jagannath Rasa Shodh & Minerals',
        'rasashodh@puriherbal.in',
        '9777988776',
        'Grand Road, Puri, Odisha - 752001',
        '21AAFFJ3344K1ZM',
        'AAFFJ3344K',
        'Supplier of purified mercury (Shuddha Parada), Gandhaka, and calcined mineral bhasmas.'
      );
      console.log('✓ Seeded 4 authentic herbal and packaging suppliers into contacts');
    }

    console.log('✓ Migration 028: Successfully enhanced Manufacturing Ecosystem schema.');
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS manufacturing_attachments;
      DROP TABLE IF EXISTS technical_staff;
      DROP TABLE IF EXISTS purchase_order_items;
      DROP TABLE IF EXISTS purchase_orders;
      DROP TABLE IF EXISTS supplier_payments;
    `);
  }
};
