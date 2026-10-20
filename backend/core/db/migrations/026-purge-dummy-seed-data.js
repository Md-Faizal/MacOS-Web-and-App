/**
 * 026-purge-dummy-seed-data.js
 *
 * Purges mock/dummy test records previously seeded into compliance and vault tables:
 * 1. Dummy staff: 'Dr. Debabrata Mishra' (EMP-001), 'Vaidya Ananya Tripathy' (EMP-002),
 *    'Ramesh Chandra Barik' (EMP-003), 'Priyanka Senapati' (EMP-004).
 * 2. Dummy vault documents: 'UCA/HR/2026/001' (Appointment Letter with fake CORP-DIR-042),
 *    'INW/AYUSH-OD/2026/089', 'UCA/REG/2026/014', 'UCA/CORP/BR/2026/01' (Board Resolution),
 *    and scratch test letters ('dgdg', 'sfdsfdsafdsadf').
 * 3. Dummy licenses: '21AAACU1234F1Z8' (fake GSTIN).
 * 4. Cleans associated paper trails and FTS entries.
 */

function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function up(db) {
  // 1. Purge dummy vault documents
  if (tableExists(db, 'company_vault_documents')) {
    try {
      const dummyRefs = [
        'UCA/HR/2026/001',
        'INW/AYUSH-OD/2026/089',
        'UCA/REG/2026/014',
        'UCA/CORP/BR/2026/01'
      ];

      const dummyDocs = db.prepare(`
        SELECT id FROM company_vault_documents
        WHERE doc_ref_no IN (${dummyRefs.map(() => '?').join(',')})
           OR signatory_reg_no = 'CORP-DIR-042'
           OR signatory_name = 'Director of Operations'
           OR title IN ('dgdg', 'sfdsfdsafdsadf')
           OR doc_ref_no LIKE 'UCA/GEN/%'
      `).all(...dummyRefs);

      for (const d of dummyDocs) {
        if (tableExists(db, 'document_paper_trails')) {
          db.prepare('DELETE FROM document_paper_trails WHERE parent_doc_id = ? OR child_doc_id = ?').run(d.id, d.id);
        }
        if (tableExists(db, 'vault_doc_fts')) {
          try { db.prepare('DELETE FROM vault_doc_fts WHERE doc_id = ?').run(d.id); } catch (_) {}
        }
        db.prepare('DELETE FROM company_vault_documents WHERE id = ?').run(d.id);
      }
      if (dummyDocs.length > 0) {
        console.log(`✓ Purged ${dummyDocs.length} dummy/test company vault documents`);
      }
    } catch (err) {
      console.warn('⚠️ Vault documents cleanup warning:', err.message);
    }
  }

  // 2. Purge dummy staff
  if (tableExists(db, 'company_staff')) {
    try {
      const dummyCodes = ['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004'];
      const dummyNames = [
        'Dr. Debabrata Mishra',
        'Vaidya Ananya Tripathy',
        'Ramesh Chandra Barik',
        'Priyanka Senapati'
      ];

      const dummyStaff = db.prepare(`
        SELECT id FROM company_staff
        WHERE emp_code IN (${dummyCodes.map(() => '?').join(',')})
           OR full_name IN (${dummyNames.map(() => '?').join(',')})
      `).all(...dummyCodes, ...dummyNames);

      for (const s of dummyStaff) {
        if (tableExists(db, 'staff_documents')) {
          db.prepare('DELETE FROM staff_documents WHERE staff_id = ?').run(s.id);
        }
        db.prepare('DELETE FROM company_staff WHERE id = ?').run(s.id);
      }
      if (dummyStaff.length > 0) {
        console.log(`✓ Purged ${dummyStaff.length} dummy company staff records`);
      }
    } catch (err) {
      console.warn('⚠️ Staff cleanup warning:', err.message);
    }
  }

  // 3. Purge dummy compliance licenses
  if (tableExists(db, 'company_compliances')) {
    try {
      const dummyLicenses = db.prepare(`
        SELECT id FROM company_compliances
        WHERE license_number = '21AAACU1234F1Z8'
      `).all();

      for (const l of dummyLicenses) {
        if (tableExists(db, 'compliance_deadlines')) {
          db.prepare("DELETE FROM compliance_deadlines WHERE entity_type = 'COMPANY_LICENSE' AND entity_id = ?").run(l.id);
        }
        db.prepare('DELETE FROM company_compliances WHERE id = ?').run(l.id);
      }
      if (dummyLicenses.length > 0) {
        console.log(`✓ Purged ${dummyLicenses.length} dummy compliance license records`);
      }
    } catch (err) {
      console.warn('⚠️ Compliance license cleanup warning:', err.message);
    }
  }
}

module.exports = { up };
