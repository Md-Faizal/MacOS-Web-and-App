/**
 * 027-add-manufacturing-schema.js
 *
 * Sets up the manufacturing and Schedule T Good Manufacturing Practices (GMP)
 * schema for Utkal Chemical Aushadhalaya (OR-02/AYUR).
 *
 * Tables created:
 * 1. raw_materials: Master inventory for botanicals, minerals, excipients, and packaging.
 * 2. raw_material_inward: Goods Receipt Notes (GRN) tracking supplier lots and physical QC.
 * 3. master_formulas: Standard Bill of Materials (BoM) recipes per standard batch size.
 * 4. master_formula_items: Ingredient lines per recipe.
 * 5. manufacturing_bmr: Batch Manufacturing Records tracking active, quarantine, and released batches.
 * 6. manufacturing_batch_dispensing: Dispensing verification logs for BMR audits.
 */

function up(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS raw_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        odia_name TEXT,
        type TEXT NOT NULL DEFAULT 'Botanical Herb',
        uom TEXT NOT NULL DEFAULT 'KG',
        current_stock REAL DEFAULT 0,
        reorder_level REAL DEFAULT 10,
        storage_location TEXT DEFAULT 'Godown Rack A-1',
        hsn_code TEXT DEFAULT '1211',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS raw_material_inward (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER,
        supplier_name TEXT,
        invoice_no TEXT,
        receipt_date DATE NOT NULL,
        raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
        vendor_lot_no TEXT,
        qty_received REAL NOT NULL,
        unit_rate REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        qc_status TEXT DEFAULT 'Conforms',
        lab_report_no TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS master_formulas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id),
        formula_name TEXT NOT NULL,
        pharmacopoeial_ref TEXT DEFAULT 'AFI Part I / Classical Reference',
        std_batch_size REAL NOT NULL DEFAULT 100,
        std_batch_uom TEXT NOT NULL DEFAULT 'LTR',
        expected_yield_percent REAL DEFAULT 95.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS master_formula_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_formula_id INTEGER NOT NULL REFERENCES master_formulas(id) ON DELETE CASCADE,
        raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
        qty_required REAL NOT NULL,
        stage TEXT DEFAULT 'Decoction',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS manufacturing_bmr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_no TEXT NOT NULL UNIQUE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        variant_id INTEGER REFERENCES variants(id),
        master_formula_id INTEGER REFERENCES master_formulas(id),
        mfg_date DATE NOT NULL,
        exp_date DATE NOT NULL,
        mrp REAL NOT NULL DEFAULT 0,
        planned_qty REAL NOT NULL,
        actual_output_qty REAL DEFAULT 0,
        yield_percent REAL DEFAULT 0,
        status TEXT DEFAULT 'IN_PROCESS',
        lab_name TEXT,
        lab_report_no TEXT,
        coa_date DATE,
        coa_status TEXT DEFAULT 'PENDING',
        technical_person TEXT,
        retention_sample_qty TEXT,
        retention_location TEXT,
        released_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS manufacturing_batch_dispensing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES manufacturing_bmr(id) ON DELETE CASCADE,
        raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
        std_qty REAL NOT NULL,
        actual_dispensed_qty REAL NOT NULL,
        dispensed_by TEXT,
        dispensed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default common Ayurvedic raw materials if empty
    const count = db.prepare('SELECT count(*) as count FROM raw_materials').get().count;
    if (count === 0) {
      const seedMaterials = [
        { name: 'Dashamoola Root Mix', odia: 'ଦଶମୂଳ', type: 'Botanical Herb', uom: 'KG', stock: 120.0, reorder: 25.0, loc: 'Herb Godown A-1', hsn: '12119029' },
        { name: 'Ashwagandha Root (Withania Somnifera)', odia: 'ଅଶ୍ୱଗନ୍ଧା', type: 'Botanical Herb', uom: 'KG', stock: 85.0, reorder: 20.0, loc: 'Herb Godown A-2', hsn: '12119029' },
        { name: 'Triphala Powder Mix (Haritaki/Bibhitaki/Amalaki)', odia: 'ତ୍ରିଫଳା ଚୂର୍ଣ୍ଣ', type: 'Botanical Herb', uom: 'KG', stock: 150.0, reorder: 30.0, loc: 'Herb Godown A-3', hsn: '12119029' },
        { name: 'Guda (Purified Jaggery)', odia: 'ଗୁଡ଼', type: 'Excipient', uom: 'KG', stock: 450.0, reorder: 100.0, loc: 'Vehicle Section G-1', hsn: '17011490' },
        { name: 'Madhu (Raw Honey)', odia: 'ମହୁ', type: 'Excipient', uom: 'KG', stock: 60.0, reorder: 15.0, loc: 'Vehicle Section G-2', hsn: '04090000' },
        { name: 'Til Taila (Pure Sesame Oil)', odia: 'ରାଶି ତେଲ', type: 'Excipient', uom: 'LTR', stock: 200.0, reorder: 50.0, loc: 'Oil Tank OT-1', hsn: '15155091' },
        { name: 'Shuddha Parada (Purified Mercury)', odia: 'ଶୁଦ୍ଧ ପାରଦ', type: 'Mineral/Metal', uom: 'KG', stock: 5.0, reorder: 2.0, loc: 'Secure Vault S-1', hsn: '28054000' },
        { name: 'Shuddha Gandhaka (Purified Sulphur)', odia: 'ଶୁଦ୍ଧ ଗନ୍ଧକ', type: 'Mineral/Metal', uom: 'KG', stock: 15.0, reorder: 5.0, loc: 'Secure Vault S-2', hsn: '28020010' },
        { name: 'Amber PET Bottle 450ml with Cap', odia: '୪୫୦ମିଲି ବୋତଲ', type: 'Packaging Material', uom: 'NOS', stock: 1800.0, reorder: 500.0, loc: 'Packaging Store P-1', hsn: '39233090' },
        { name: 'High-Density HDPE Container 100g', odia: '୧୦୦ଗ୍ରାମ ଡବା', type: 'Packaging Material', uom: 'NOS', stock: 2400.0, reorder: 500.0, loc: 'Packaging Store P-2', hsn: '39233090' },
      ];

      const stmt = db.prepare(`
        INSERT INTO raw_materials (name, odia_name, type, uom, current_stock, reorder_level, storage_location, hsn_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const m of seedMaterials) {
        stmt.run(m.name, m.odia, m.type, m.uom, m.stock, m.reorder, m.loc, m.hsn);
      }
      console.log(`✓ Migration 027: Seeded ${seedMaterials.length} raw materials for Schedule T GMP`);
    }

    console.log('✓ Migration 027: Successfully created Schedule T manufacturing schema');
  } catch (err) {
    console.error('Migration 027 error:', err.message);
  }
}

module.exports = { up };
