/**
 * Compliance Department Business Logic & Data Access Handlers
 * Governs Staff Master, KYC Vault, Statutory Compliances, Deadlines, SOPs & AI
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
let vaultAi = null;
try {
  vaultAi = require('./vault-ai');
} catch (e) {
  console.warn('[Compliance] vault-ai require fallback:', e.message);
}
let SuiteCoreBridge = null;
try {
  SuiteCoreBridge = require(path.resolve(__dirname, '../../../../frontend/shared/suite_core_bridge.js'));
} catch (e) {
  console.warn('[Compliance] SuiteCoreBridge require fallback:', e.message);
}

module.exports = function createHandlers(db) {
  return {
    initDatabase() {
      // 1. Staff Master
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_staff (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          emp_code TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL,
          department TEXT NOT NULL DEFAULT 'General',
          designation TEXT NOT NULL DEFAULT 'Staff',
          role_type TEXT NOT NULL DEFAULT 'Worker',
          phone TEXT,
          email TEXT,
          date_of_birth DATE,
          joining_date DATE,
          blood_group TEXT,
          emergency_contact TEXT,
          address TEXT,
          is_schedule_t_technical INTEGER DEFAULT 0,
          technical_reg_no TEXT,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS staff_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          staff_id INTEGER NOT NULL,
          doc_type TEXT NOT NULL,
          doc_name TEXT NOT NULL,
          doc_number TEXT,
          issue_date DATE,
          expiry_date DATE,
          file_name TEXT,
          file_type TEXT,
          file_data TEXT,
          verification_status TEXT DEFAULT 'PENDING',
          verified_by TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (staff_id) REFERENCES company_staff(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS company_compliances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'STATUTORY_DRUG',
          license_number TEXT,
          issuing_authority TEXT,
          issue_date DATE,
          expiry_date DATE,
          renewal_frequency TEXT DEFAULT 'Annually',
          officer_in_charge TEXT,
          statutory_rule_ref TEXT,
          status TEXT DEFAULT 'ACTIVE',
          file_name TEXT,
          file_data TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS compliance_deadlines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'GENERAL',
          deadline_date DATE NOT NULL,
          reminder_days INTEGER DEFAULT 30,
          priority TEXT DEFAULT 'HIGH',
          status TEXT DEFAULT 'PENDING',
          completed_at DATETIME,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS internal_policies_sops (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'SOP_MANUFACTURING',
          code_number TEXT UNIQUE,
          department TEXT DEFAULT 'All',
          version TEXT DEFAULT 'v1.0',
          effective_date DATE,
          review_deadline DATE,
          status TEXT DEFAULT 'ACTIVE',
          summary TEXT,
          file_name TEXT,
          file_data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Company Holy Bible Vault: Virtual Directory Hierarchy
        CREATE TABLE IF NOT EXISTS vault_directories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_id INTEGER,
          name TEXT NOT NULL,
          department TEXT NOT NULL DEFAULT 'General',
          slug TEXT NOT NULL,
          icon TEXT DEFAULT '📁',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (parent_id) REFERENCES vault_directories(id) ON DELETE CASCADE
        );

        -- Company Holy Bible Vault: Document Master Records
        CREATE TABLE IF NOT EXISTS company_vault_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dir_id INTEGER,
          doc_ref_no TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          doc_type TEXT NOT NULL DEFAULT 'LETTER',
          department TEXT NOT NULL DEFAULT 'General',
          direction TEXT NOT NULL DEFAULT 'INTERNAL', -- 'INTERNAL', 'INWARD', 'OUTWARD'
          status TEXT NOT NULL DEFAULT 'DRAFT',        -- 'DRAFT', 'PENDING_APPROVAL', 'SEALED_OFFICIAL', 'ARCHIVED'
          sender_party TEXT,
          recipient_party TEXT,
          subject TEXT,
          issue_date DATE,
          dispatch_mode TEXT,                          -- 'SPEED_POST', 'REGISTERED_AD', 'EMAIL', 'HAND_DELIVERY'
          tracking_consignment_no TEXT,
          content_json TEXT,                           -- Structured content (salutation, body paragraphs, clauses, variables)
          signatory_name TEXT,
          signatory_title TEXT,
          signatory_reg_no TEXT,
          verification_hash TEXT,                      -- Cryptographic SHA-256 Digest
          is_watermarked INTEGER DEFAULT 1,
          retention_period_years INTEGER DEFAULT 5,
          is_legal_hold INTEGER DEFAULT 0,
          created_by TEXT DEFAULT 'Admin',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dir_id) REFERENCES vault_directories(id) ON DELETE SET NULL
        );

        -- Paper Trail & Causality Linkage Graph
        CREATE TABLE IF NOT EXISTS document_paper_trails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_doc_id INTEGER NOT NULL,
          child_doc_id INTEGER NOT NULL,
          link_relation TEXT NOT NULL DEFAULT 'REPLIED_WITH', -- 'TRIGGERED_BY', 'REPLIED_WITH', 'ATTACHED_AS_EVIDENCE', 'SUPERSEDES'
          matter_thread_name TEXT,                            -- e.g. 'AYUSH Inspection 2026/Notice 4B'
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (parent_doc_id) REFERENCES company_vault_documents(id) ON DELETE CASCADE,
          FOREIGN KEY (child_doc_id) REFERENCES company_vault_documents(id) ON DELETE CASCADE
        );
      `);

      // Ensure Vault AI columns and FTS5 virtual table exist
      try {
        const tableInfo = db.prepare('PRAGMA table_info(company_vault_documents)').all();
        const cols = new Set(tableInfo.map(c => c.name));
        if (!cols.has('ai_summary')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN ai_summary TEXT').run();
        if (!cols.has('tags')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN tags TEXT').run();
        if (!cols.has('suggested_dir_id')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN suggested_dir_id INTEGER').run();
        if (!cols.has('extracted_text')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN extracted_text TEXT').run();
        if (!cols.has('ai_processed_at')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN ai_processed_at DATETIME').run();

        db.prepare(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vault_doc_fts USING fts5(
            doc_id UNINDEXED,
            title,
            doc_ref_no,
            department,
            tags,
            ai_summary,
            extracted_text
          );
        `).run();
      } catch (schemaErr) {
        console.warn('[Compliance] Vault AI schema check note:', schemaErr.message);
      }

      // Seed core statutory licenses if table is empty
      const count = db.prepare('SELECT COUNT(*) as c FROM company_compliances').get().c;
      if (count === 0) {
        const seedLicenses = [
          {
            title: 'AYUSH Drug Manufacturing License (Form 25D)',
            category: 'STATUTORY_DRUG',
            license_number: 'OR-02/AYUR',
            issuing_authority: 'State Licensing Authority, Directorate of AYUSH, Odisha',
            issue_date: '2022-04-01',
            expiry_date: '2027-03-31',
            renewal_frequency: '5 Years',
            officer_in_charge: 'Managing Director & Chief Chemist',
            statutory_rule_ref: 'Drugs & Cosmetics Rules 1945, Rule 154',
            status: 'ACTIVE',
            notes: 'Covers Asava, Arishta, Churna, Taila, and Gutika classical dosage forms.'
          },
          {
            title: 'Schedule T GMP Compliance Certificate',
            category: 'STATUTORY_DRUG',
            license_number: 'GMP/AYUR/2023/118',
            issuing_authority: 'Ayush Drug Controller Inspection Board',
            issue_date: '2023-08-15',
            expiry_date: '2026-08-14',
            renewal_frequency: '3 Years',
            officer_in_charge: 'Quality Assurance Head',
            statutory_rule_ref: 'Part I & II, Schedule T (Good Manufacturing Practices)',
            status: 'ACTIVE',
            notes: 'Sanitation, Batch Records, retention samples, and manufacturing plant audit.'
          },
          {
            title: 'Factory License (Odisha Directorate of Factories & Boilers)',
            category: 'LABOR_SAFETY',
            license_number: 'FAC/CUTTACK/2021/892',
            issuing_authority: 'Directorate of Factories & Boilers, Govt of Odisha',
            issue_date: '2025-01-01',
            expiry_date: '2026-12-31',
            renewal_frequency: 'Annually',
            officer_in_charge: 'Factory Manager',
            statutory_rule_ref: 'Factories Act 1948, Section 6',
            status: 'ACTIVE',
            notes: 'Annual renewal and boiler safety certificate.'
          },
          {
            title: 'State Pollution Control Board (Consent to Operate - CTO)',
            category: 'ENVIRONMENTAL',
            license_number: 'SPCB/CTO/IND/2023/4521',
            issuing_authority: 'Odisha State Pollution Control Board',
            issue_date: '2023-04-01',
            expiry_date: '2028-03-31',
            renewal_frequency: '5 Years',
            officer_in_charge: 'Environmental Compliance In-Charge',
            statutory_rule_ref: 'Water (Prevention of Pollution) Act 1974 & Air Act 1981',
            status: 'ACTIVE',
            notes: 'Effluent treatment plant and air emission norms.'
          },
          {
            title: 'Fire Safety Certificate / NOC',
            category: 'LABOR_SAFETY',
            license_number: 'FIRE/NOC/2024/774',
            issuing_authority: 'Odisha Fire & Emergency Services',
            issue_date: '2024-06-01',
            expiry_date: '2027-05-31',
            renewal_frequency: '3 Years',
            officer_in_charge: 'Safety Officer',
            statutory_rule_ref: 'Odisha Fire Prevention and Fire Safety Rules 2017',
            status: 'ACTIVE',
            notes: 'Hydrant tests, extinguisher maintenance, fire drills.'
          },
          {
            title: 'Goods & Services Tax Registration (GSTIN)',
            category: 'TAX_FINANCIAL',
            license_number: '21AAACU1234F1Z8',
            issuing_authority: 'Central Board of Indirect Taxes & Customs',
            issue_date: '2017-07-01',
            expiry_date: null,
            renewal_frequency: 'Permanent / Monthly Returns',
            officer_in_charge: 'Chief Financial Officer',
            statutory_rule_ref: 'CGST Act 2017',
            status: 'ACTIVE',
            notes: 'Active GST registration, monthly GSTR-1 and GSTR-3B filings.'
          }
        ];

        const insertStmt = db.prepare(`
          INSERT INTO company_compliances 
          (title, category, license_number, issuing_authority, issue_date, expiry_date, renewal_frequency, officer_in_charge, statutory_rule_ref, status, notes)
          VALUES (@title, @category, @license_number, @issuing_authority, @issue_date, @expiry_date, @renewal_frequency, @officer_in_charge, @statutory_rule_ref, @status, @notes)
        `);

        seedLicenses.forEach(l => insertStmt.run(l));

        // Create initial deadlines from licenses
        const deadlineStmt = db.prepare(`
          INSERT INTO compliance_deadlines (entity_type, entity_id, title, category, deadline_date, priority)
          VALUES ('COMPANY_LICENSE', ?, ?, ?, ?, 'HIGH')
        `);

        const inserted = db.prepare('SELECT id, title, category, expiry_date FROM company_compliances WHERE expiry_date IS NOT NULL').all();
        inserted.forEach(row => {
          deadlineStmt.run(row.id, `Renewal: ${row.title}`, row.category, row.expiry_date);
        });
      }

      // Seed sample staff if empty
      const staffCount = db.prepare('SELECT COUNT(*) as c FROM company_staff').get().c;
      if (staffCount === 0) {
        const seedStaff = [
          {
            emp_code: 'EMP-001',
            full_name: 'Dr. Debabrata Mishra',
            department: 'Manufacturing',
            designation: 'Chief Ayurvedic Medical Officer',
            role_type: 'Technical Person',
            phone: '+91 94370 12345',
            email: 'dr.mishra@utkalchemical.com',
            joining_date: '2018-02-01',
            blood_group: 'B+',
            emergency_contact: 'Mrs. Mishra (+91 94370 99999)',
            address: 'Madhupatna, Cuttack, Odisha',
            is_schedule_t_technical: 1,
            technical_reg_no: 'BAMS-OR-4521',
            status: 'ACTIVE'
          },
          {
            emp_code: 'EMP-002',
            full_name: 'Vaidya Ananya Tripathy',
            department: 'Quality Assurance',
            designation: 'Quality Control Head & Analytical Chemist',
            role_type: 'Technical Person',
            phone: '+91 98610 23456',
            email: 'ananya.t@utkalchemical.com',
            joining_date: '2020-07-15',
            blood_group: 'O+',
            emergency_contact: 'S. Tripathy (+91 98610 88888)',
            address: 'Link Road, Cuttack, Odisha',
            is_schedule_t_technical: 1,
            technical_reg_no: 'M.Sc Chem / QC-784',
            status: 'ACTIVE'
          },
          {
            emp_code: 'EMP-003',
            full_name: 'Ramesh Chandra Barik',
            department: 'Manufacturing',
            designation: 'Senior Boiler & Extraction Operator',
            role_type: 'Worker',
            phone: '+91 91240 34567',
            email: null,
            joining_date: '2021-11-10',
            blood_group: 'A+',
            emergency_contact: 'Son (+91 91240 77777)',
            address: 'Jagatpur Industrial Estate, Cuttack',
            is_schedule_t_technical: 0,
            technical_reg_no: null,
            status: 'ACTIVE'
          },
          {
            emp_code: 'EMP-004',
            full_name: 'Priyanka Senapati',
            department: 'Billing & Accounts',
            designation: 'Senior Accountant & Compliance Coordinator',
            role_type: 'Staff',
            phone: '+91 99370 45678',
            email: 'priyanka@utkalchemical.com',
            joining_date: '2022-03-01',
            blood_group: 'AB+',
            emergency_contact: 'Father (+91 99370 66666)',
            address: 'Badambadi, Cuttack',
            is_schedule_t_technical: 0,
            technical_reg_no: null,
            status: 'ACTIVE'
          }
        ];

        const insertStaffStmt = db.prepare(`
          INSERT INTO company_staff 
          (emp_code, full_name, department, designation, role_type, phone, email, joining_date, blood_group, emergency_contact, address, is_schedule_t_technical, technical_reg_no, status)
          VALUES (@emp_code, @full_name, @department, @designation, @role_type, @phone, @email, @joining_date, @blood_group, @emergency_contact, @address, @is_schedule_t_technical, @technical_reg_no, @status)
        `);

        seedStaff.forEach(s => insertStaffStmt.run(s));
      }

      // Seed initial Vault directories if empty
      const dirCount = db.prepare('SELECT COUNT(*) as c FROM vault_directories').get().c;
      if (dirCount === 0) {
        const seedDirs = [
          { name: 'HR & Personnel Orders', department: 'HR & Personnel', slug: 'hr-personnel', icon: '👥' },
          { name: 'Manufacturing & QC Dossiers', department: 'Manufacturing', slug: 'mfg-qc', icon: '🏭' },
          { name: 'Statutory Licences & Ayush Drug Control', department: 'Regulatory & Licences', slug: 'statutory-licences', icon: '🏛️' },
          { name: 'Legal, Corporate & Board Governance', department: 'Legal & Corporate', slug: 'legal-corporate', icon: '⚖️' },
          { name: 'Official Inward Notices & Summons', department: 'Inward & Outward Register', slug: 'inward-notices', icon: '📥' },
          { name: 'Official Outward Dispatches & Replies', department: 'Inward & Outward Register', slug: 'outward-dispatches', icon: '📤' }
        ];

        const insertDirStmt = db.prepare(`
          INSERT INTO vault_directories (name, department, slug, icon)
          VALUES (@name, @department, @slug, @icon)
        `);
        seedDirs.forEach(d => insertDirStmt.run(d));
      }

      // Seed initial Vault documents if empty
      const docCount = db.prepare('SELECT COUNT(*) as c FROM company_vault_documents').get().c;
      if (docCount === 0) {
        const hrDir = db.prepare("SELECT id FROM vault_directories WHERE slug = 'hr-personnel'").get()?.id || 1;
        const outDir = db.prepare("SELECT id FROM vault_directories WHERE slug = 'outward-dispatches'").get()?.id || 6;
        const inDir = db.prepare("SELECT id FROM vault_directories WHERE slug = 'inward-notices'").get()?.id || 5;

        const seedDocs = [
          {
            dir_id: hrDir,
            doc_ref_no: 'UCA/HR/2026/001',
            title: 'Appointment Letter - Chief Ayurvedic Medical Officer',
            doc_type: 'APPOINTMENT_LETTER',
            department: 'HR & Personnel',
            direction: 'INTERNAL',
            status: 'SEALED_OFFICIAL',
            recipient_party: 'Dr. Debabrata Mishra (EMP-001)',
            subject: 'Appointment as Chief Ayurvedic Medical Officer under Rule 157 Schedule T',
            issue_date: '2018-02-01',
            signatory_name: 'Director of Operations',
            signatory_title: 'Managing Director, Utkal Chemical Aushadhalaya',
            signatory_reg_no: 'CORP-DIR-042',
            verification_hash: '9a84f32e185c1840bb8e9324d08123ca41bfe1298823101c03994ab2d4885832'
          },
          {
            dir_id: inDir,
            doc_ref_no: 'INW/AYUSH-OD/2026/089',
            title: 'Annual Schedule T Factory GMP Inspection Notice',
            doc_type: 'STATUTORY_NOTICE',
            department: 'Regulatory & Licences',
            direction: 'INWARD',
            status: 'SEALED_OFFICIAL',
            sender_party: 'Directorate of AYUSH, Govt of Odisha',
            recipient_party: 'Utkal Chemical Aushadhalaya',
            subject: 'Routine Inspection under Rule 157 & Schedule T Compliance for Year 2026-27',
            issue_date: '2026-09-15',
            dispatch_mode: 'SPEED_POST',
            tracking_consignment_no: 'ED982341908IN',
            verification_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
          },
          {
            dir_id: outDir,
            doc_ref_no: 'UCA/REG/2026/014',
            title: 'Compliance Reply & Submission of Form 48 Clinical Health Dossiers',
            doc_type: 'COMPLIANCE_REPLY',
            department: 'Regulatory & Licences',
            direction: 'OUTWARD',
            status: 'SEALED_OFFICIAL',
            sender_party: 'Utkal Chemical Aushadhalaya',
            recipient_party: 'Drug Controller & Licensing Authority, Directorate of AYUSH',
            subject: 'Submission of Annual GMP & Rule 158 Personnel Medical Fitness Certificates (Form 48)',
            issue_date: '2026-09-28',
            dispatch_mode: 'SPEED_POST',
            tracking_consignment_no: 'SP774910234IN',
            signatory_name: 'Dr. Debabrata Mishra',
            signatory_title: 'Chief Ayurvedic Medical Officer (In-Charge)',
            signatory_reg_no: 'BAMS-OR-4521',
            verification_hash: '4f2910ba779dcb6185bb811efca4421b93f20817c093a89047192802d847921a'
          }
        ];

        const insertDocStmt = db.prepare(`
          INSERT INTO company_vault_documents 
          (dir_id, doc_ref_no, title, doc_type, department, direction, status, sender_party, recipient_party, subject, issue_date, dispatch_mode, tracking_consignment_no, signatory_name, signatory_title, signatory_reg_no, verification_hash)
          VALUES (@dir_id, @doc_ref_no, @title, @doc_type, @department, @direction, @status, @sender_party, @recipient_party, @subject, @issue_date, @dispatch_mode, @tracking_consignment_no, @signatory_name, @signatory_title, @signatory_reg_no, @verification_hash)
        `);
        seedDocs.forEach(doc => {
          insertDocStmt.run({
            dir_id: doc.dir_id || null,
            doc_ref_no: doc.doc_ref_no,
            title: doc.title,
            doc_type: doc.doc_type || 'LETTER',
            department: doc.department || 'General',
            direction: doc.direction || 'INTERNAL',
            status: doc.status || 'DRAFT',
            sender_party: doc.sender_party || null,
            recipient_party: doc.recipient_party || null,
            subject: doc.subject || null,
            issue_date: doc.issue_date || null,
            dispatch_mode: doc.dispatch_mode || null,
            tracking_consignment_no: doc.tracking_consignment_no || null,
            signatory_name: doc.signatory_name || null,
            signatory_title: doc.signatory_title || null,
            signatory_reg_no: doc.signatory_reg_no || null,
            verification_hash: doc.verification_hash || null
          });
        });

        // Create paper trail linkage: Inward notice (doc 2) -> Outward compliance reply (doc 3)
        try {
          db.prepare(`
            INSERT INTO document_paper_trails (parent_doc_id, child_doc_id, link_relation, matter_thread_name, notes)
            VALUES (2, 3, 'REPLIED_WITH', 'AYUSH GMP Inspection 2026', 'Official submission of Form 48 staff records in response to inspection notice')
          `).run();
        } catch (_) {}
      }
    },

    // 1. Executive "God's Eye" Overview
    getOverview: (req, res) => {
      try {
        const totalStaff = db.prepare('SELECT COUNT(*) as c FROM company_staff').get().c;
        const activeStaff = db.prepare("SELECT COUNT(*) as c FROM company_staff WHERE status = 'ACTIVE'").get().c;
        const technicalPersons = db.prepare('SELECT COUNT(*) as c FROM company_staff WHERE is_schedule_t_technical = 1 AND status = \'ACTIVE\'').get().c;

        const totalLicenses = db.prepare('SELECT COUNT(*) as c FROM company_compliances').get().c;
        const activeLicenses = db.prepare("SELECT COUNT(*) as c FROM company_compliances WHERE status = 'ACTIVE'").get().c;

        // Expiring licenses within 60 days
        const expiringLicenses = db.prepare(`
          SELECT id, title, license_number, expiry_date, category,
                 CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) as days_remaining
          FROM company_compliances 
          WHERE expiry_date IS NOT NULL 
            AND julianday(expiry_date) >= julianday('now')
            AND julianday(expiry_date) <= julianday('now', '+60 days')
          ORDER BY expiry_date ASC
        `).all();

        // Expired licenses
        const expiredLicenses = db.prepare(`
          SELECT id, title, license_number, expiry_date, category,
                 CAST((julianday('now') - julianday(expiry_date)) AS INTEGER) as days_overdue
          FROM company_compliances 
          WHERE expiry_date IS NOT NULL AND julianday(expiry_date) < julianday('now')
          ORDER BY expiry_date ASC
        `).all();

        // Deadlines summary
        const pendingDeadlines = db.prepare(`
          SELECT id, title, category, deadline_date, priority,
                 CAST((julianday(deadline_date) - julianday('now')) AS INTEGER) as days_remaining
          FROM compliance_deadlines
          WHERE status = 'PENDING'
          ORDER BY deadline_date ASC
          LIMIT 10
        `).all();

        // Department breakdown
        const depts = db.prepare(`
          SELECT department, COUNT(*) as count 
          FROM company_staff 
          GROUP BY department 
          ORDER BY count DESC
        `).all();

        // KYC Completion Stats
        const totalDocs = db.prepare('SELECT COUNT(*) as c FROM staff_documents').get().c;
        const verifiedDocs = db.prepare("SELECT COUNT(*) as c FROM staff_documents WHERE verification_status = 'VERIFIED'").get().c;
        const pendingDocs = db.prepare("SELECT COUNT(*) as c FROM staff_documents WHERE verification_status = 'PENDING'").get().c;

        // Health Score (0 - 100)
        let score = 100;
        if (expiredLicenses.length > 0) score -= Math.min(40, expiredLicenses.length * 15);
        if (expiringLicenses.length > 0) score -= Math.min(20, expiringLicenses.length * 5);
        if (pendingDocs > 5) score -= 10;
        score = Math.max(20, Math.min(100, score));

        res.json({
          success: true,
          healthScore: score,
          metrics: {
            totalStaff,
            activeStaff,
            technicalPersons,
            totalLicenses,
            activeLicenses,
            expiringSoonCount: expiringLicenses.length,
            expiredCount: expiredLicenses.length,
            pendingDeadlinesCount: pendingDeadlines.length,
            totalDocs,
            verifiedDocs,
            pendingDocs
          },
          expiringLicenses,
          expiredLicenses,
          pendingDeadlines,
          departmentBreakdown: depts
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 2. Staff Directory CRUD
    getStaffList: (req, res) => {
      try {
        const { department, role_type, status, q } = req.query;
        let query = 'SELECT s.*, (SELECT COUNT(*) FROM staff_documents d WHERE d.staff_id = s.id) as document_count FROM company_staff s WHERE 1=1';
        const params = [];

        if (department) {
          query += ' AND s.department = ?';
          params.push(department);
        }
        if (role_type) {
          query += ' AND s.role_type = ?';
          params.push(role_type);
        }
        if (status) {
          query += ' AND s.status = ?';
          params.push(status);
        }
        if (q) {
          query += ' AND (s.full_name LIKE ? OR s.emp_code LIKE ? OR s.phone LIKE ? OR s.designation LIKE ?)';
          const term = `%${q.trim()}%`;
          params.push(term, term, term, term);
        }

        query += ' ORDER BY s.emp_code ASC';
        const staff = db.prepare(query).all(...params);
        res.json({ success: true, staff });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getStaffById: (req, res) => {
      try {
        const { id } = req.params;
        const staff = db.prepare('SELECT * FROM company_staff WHERE id = ?').get(id);
        if (!staff) return res.status(404).json({ error: 'Staff member not found' });

        const documents = db.prepare('SELECT * FROM staff_documents WHERE staff_id = ? ORDER BY created_at DESC').all(id);
        res.json({ success: true, staff: { ...staff, documents } });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getNextEmployeeCode: (req, res) => {
      try {
        const rows = db.prepare('SELECT emp_code FROM company_staff WHERE emp_code IS NOT NULL').all();
        const existingCodes = rows.map(r => r.emp_code);
        let nextCode = 'EMP-001';
        if (SuiteCoreBridge && typeof SuiteCoreBridge.generateNextEmployeeCode === 'function') {
          nextCode = SuiteCoreBridge.generateNextEmployeeCode(existingCodes, {
            prefix: 'EMP',
            separator: '-',
            padding: 3
          });
        } else {
          let maxSeq = 0;
          for (const c of existingCodes) {
            const m = String(c).match(/(\d+)$/);
            if (m) {
              const num = parseInt(m[1], 10);
              if (num > maxSeq) maxSeq = num;
            }
          }
          nextCode = `EMP-${String(maxSeq + 1).padStart(3, '0')}`;
        }
        res.json({ success: true, employee_code: nextCode });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createStaff: (req, res) => {
      try {
        let {
          emp_code, full_name, department, designation, role_type,
          phone, email, date_of_birth, joining_date, blood_group,
          emergency_contact, address, is_schedule_t_technical, technical_reg_no, user_id
        } = req.body;

        if (!full_name || !full_name.trim()) {
          return res.status(400).json({ error: 'Full Name is required' });
        }

        // Auto-generate employee code via Rust core if not provided
        if (!emp_code || !emp_code.trim()) {
          const rows = db.prepare('SELECT emp_code FROM company_staff WHERE emp_code IS NOT NULL').all();
          const existingCodes = rows.map(r => r.emp_code);
          if (SuiteCoreBridge && typeof SuiteCoreBridge.generateNextEmployeeCode === 'function') {
            emp_code = SuiteCoreBridge.generateNextEmployeeCode(existingCodes, {
              prefix: 'EMP',
              separator: '-',
              padding: 3
            });
          } else {
            let maxSeq = 0;
            for (const c of existingCodes) {
              const m = String(c).match(/(\d+)$/);
              if (m) {
                const num = parseInt(m[1], 10);
                if (num > maxSeq) maxSeq = num;
              }
            }
            emp_code = `EMP-${String(maxSeq + 1).padStart(3, '0')}`;
          }
        }

        const info = db.prepare(`
          INSERT INTO company_staff 
          (emp_code, full_name, department, designation, role_type, phone, email, date_of_birth, 
           joining_date, blood_group, emergency_contact, address, is_schedule_t_technical, 
           technical_reg_no, user_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(
          emp_code.trim(),
          full_name.trim(),
          department || 'General',
          designation || 'Staff',
          role_type || 'Worker',
          phone || null,
          email || null,
          date_of_birth || null,
          joining_date || new Date().toISOString().split('T')[0],
          blood_group || null,
          emergency_contact || null,
          address || null,
          is_schedule_t_technical ? 1 : 0,
          technical_reg_no || null,
          user_id || null
        );

        // Auto-sync with technical_staff if marked as Schedule T approved person
        if (is_schedule_t_technical) {
          try {
            db.prepare(`
              INSERT INTO technical_staff (name, role, qualification, registration_no, phone, email)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              full_name.trim(),
              designation || 'Approved Technical Person (AYUSH)',
              'BAMS / Chemist',
              technical_reg_no || 'REG-PENDING',
              phone || null,
              email || null
            );
          } catch (_) {}
        }

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateStaff: (req, res) => {
      try {
        const { id } = req.params;
        const {
          full_name, department, designation, role_type, phone, email,
          date_of_birth, joining_date, blood_group, emergency_contact,
          address, is_schedule_t_technical, technical_reg_no, status, user_id
        } = req.body;

        db.prepare(`
          UPDATE company_staff SET
            full_name = COALESCE(?, full_name),
            department = COALESCE(?, department),
            designation = COALESCE(?, designation),
            role_type = COALESCE(?, role_type),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            date_of_birth = COALESCE(?, date_of_birth),
            joining_date = COALESCE(?, joining_date),
            blood_group = COALESCE(?, blood_group),
            emergency_contact = COALESCE(?, emergency_contact),
            address = COALESCE(?, address),
            is_schedule_t_technical = COALESCE(?, is_schedule_t_technical),
            technical_reg_no = COALESCE(?, technical_reg_no),
            status = COALESCE(?, status),
            user_id = COALESCE(?, user_id),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          full_name, department, designation, role_type, phone, email,
          date_of_birth, joining_date, blood_group, emergency_contact,
          address, is_schedule_t_technical, technical_reg_no, status, user_id, id
        );

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteStaff: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM company_staff WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 3. Worker KYC & Document Vault
    getStaffDocuments: (req, res) => {
      try {
        const { id } = req.params;
        const docs = db.prepare('SELECT * FROM staff_documents WHERE staff_id = ? ORDER BY created_at DESC').all(id);
        res.json({ success: true, documents: docs });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    uploadStaffDocument: (req, res) => {
      try {
        const { id } = req.params; // staff_id
        const {
          doc_type, doc_name, doc_number, issue_date, expiry_date,
          file_name, file_type, file_data, verification_status, notes
        } = req.body;

        if (!doc_type || !doc_name) {
          return res.status(400).json({ error: 'Document type and name are required' });
        }

        const info = db.prepare(`
          INSERT INTO staff_documents 
          (staff_id, doc_type, doc_name, doc_number, issue_date, expiry_date, file_name, file_type, file_data, verification_status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, doc_type, doc_name, doc_number || null, issue_date || null,
          expiry_date || null, file_name || null, file_type || null,
          file_data || null, verification_status || 'PENDING', notes || null
        );

        // Auto-register deadline if document has an expiry date (e.g. Medical Fitness, Driving License)
        if (expiry_date) {
          const staff = db.prepare('SELECT full_name FROM company_staff WHERE id = ?').get(id);
          db.prepare(`
            INSERT INTO compliance_deadlines (entity_type, entity_id, title, category, deadline_date, priority)
            VALUES ('STAFF_DOC', ?, ?, 'STAFF_KYC', ?, 'MEDIUM')
          `).run(info.lastInsertRowid, `${doc_name} Expiry: ${staff?.full_name || 'Staff'}`, expiry_date);
        }

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateDocumentStatus: (req, res) => {
      try {
        const { docId } = req.params;
        const { verification_status, verified_by, notes } = req.body;

        db.prepare(`
          UPDATE staff_documents SET
            verification_status = COALESCE(?, verification_status),
            verified_by = COALESCE(?, verified_by),
            notes = COALESCE(?, notes)
          WHERE id = ?
        `).run(verification_status, verified_by, notes, docId);

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteStaffDocument: (req, res) => {
      try {
        const { docId } = req.params;
        db.prepare('DELETE FROM staff_documents WHERE id = ?').run(docId);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 4. Statutory & Corporate Compliances / Licenses
    getLicenses: (req, res) => {
      try {
        const { category, status } = req.query;
        let query = 'SELECT *, CAST((julianday(expiry_date) - julianday(\'now\')) AS INTEGER) as days_remaining FROM company_compliances WHERE 1=1';
        const params = [];

        if (category) {
          query += ' AND category = ?';
          params.push(category);
        }
        if (status) {
          query += ' AND status = ?';
          params.push(status);
        }

        query += ' ORDER BY expiry_date ASC';
        const licenses = db.prepare(query).all(...params);
        res.json({ success: true, licenses });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getLicenseById: (req, res) => {
      try {
        const { id } = req.params;
        const lic = db.prepare('SELECT * FROM company_compliances WHERE id = ?').get(id);
        if (!lic) return res.status(404).json({ error: 'License not found' });
        res.json({ success: true, license: lic });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createLicense: (req, res) => {
      try {
        const {
          title, category, license_number, issuing_authority,
          issue_date, expiry_date, renewal_frequency, officer_in_charge,
          statutory_rule_ref, file_name, file_data, notes
        } = req.body;

        if (!title) return res.status(400).json({ error: 'License Title is required' });

        const info = db.prepare(`
          INSERT INTO company_compliances 
          (title, category, license_number, issuing_authority, issue_date, expiry_date, renewal_frequency, officer_in_charge, statutory_rule_ref, file_name, file_data, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          title.trim(), category || 'STATUTORY_DRUG', license_number || null,
          issuing_authority || null, issue_date || null, expiry_date || null,
          renewal_frequency || 'Annually', officer_in_charge || null,
          statutory_rule_ref || null, file_name || null, file_data || null, notes || null
        );

        if (expiry_date) {
          db.prepare(`
            INSERT INTO compliance_deadlines (entity_type, entity_id, title, category, deadline_date, priority)
            VALUES ('COMPANY_LICENSE', ?, ?, ?, ?, 'HIGH')
          `).run(info.lastInsertRowid, `Renewal: ${title}`, category || 'STATUTORY_DRUG', expiry_date);
        }

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateLicense: (req, res) => {
      try {
        const { id } = req.params;
        const {
          title, category, license_number, issuing_authority,
          issue_date, expiry_date, renewal_frequency, officer_in_charge,
          statutory_rule_ref, status, file_name, file_data, notes
        } = req.body;

        db.prepare(`
          UPDATE company_compliances SET
            title = COALESCE(?, title),
            category = COALESCE(?, category),
            license_number = COALESCE(?, license_number),
            issuing_authority = COALESCE(?, issuing_authority),
            issue_date = COALESCE(?, issue_date),
            expiry_date = COALESCE(?, expiry_date),
            renewal_frequency = COALESCE(?, renewal_frequency),
            officer_in_charge = COALESCE(?, officer_in_charge),
            statutory_rule_ref = COALESCE(?, statutory_rule_ref),
            status = COALESCE(?, status),
            file_name = COALESCE(?, file_name),
            file_data = COALESCE(?, file_data),
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title, category, license_number, issuing_authority, issue_date,
          expiry_date, renewal_frequency, officer_in_charge, statutory_rule_ref,
          status, file_name, file_data, notes, id
        );

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteLicense: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM company_compliances WHERE id = ?').run(id);
        db.prepare("DELETE FROM compliance_deadlines WHERE entity_type = 'COMPANY_LICENSE' AND entity_id = ?").run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 5. Deadlines & Renewal Timeline
    getDeadlines: (req, res) => {
      try {
        const { status } = req.query;
        let query = `
          SELECT *, 
                 CAST((julianday(deadline_date) - julianday('now')) AS INTEGER) as days_remaining
          FROM compliance_deadlines
          WHERE 1=1
        `;
        const params = [];
        if (status) {
          query += ' AND status = ?';
          params.push(status);
        }
        query += ' ORDER BY deadline_date ASC';
        const deadlines = db.prepare(query).all(...params);
        res.json({ success: true, deadlines });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createDeadline: (req, res) => {
      try {
        const { title, category, deadline_date, priority, notes } = req.body;
        if (!title || !deadline_date) {
          return res.status(400).json({ error: 'Title and Deadline Date are required' });
        }

        const info = db.prepare(`
          INSERT INTO compliance_deadlines (entity_type, title, category, deadline_date, priority, notes)
          VALUES ('MANUAL', ?, ?, ?, ?, ?)
        `).run(title.trim(), category || 'GENERAL', deadline_date, priority || 'HIGH', notes || null);

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateDeadlineStatus: (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body; // 'COMPLETED' or 'PENDING'
        const completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;

        db.prepare(`
          UPDATE compliance_deadlines SET status = ?, completed_at = ? WHERE id = ?
        `).run(status, completedAt, id);

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteDeadline: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM compliance_deadlines WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 6. Internal Policies, SOPs & Governance
    getSops: (req, res) => {
      try {
        const { department, category } = req.query;
        let query = 'SELECT * FROM internal_policies_sops WHERE 1=1';
        const params = [];
        if (department) {
          query += ' AND (department = ? OR department = \'All\')';
          params.push(department);
        }
        if (category) {
          query += ' AND category = ?';
          params.push(category);
        }
        query += ' ORDER BY code_number ASC';
        const sops = db.prepare(query).all(...params);
        res.json({ success: true, sops });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createSop: (req, res) => {
      try {
        const { title, category, code_number, department, version, effective_date, review_deadline, summary, file_name, file_data } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        const info = db.prepare(`
          INSERT INTO internal_policies_sops 
          (title, category, code_number, department, version, effective_date, review_deadline, summary, file_name, file_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          title.trim(), category || 'SOP_MANUFACTURING', code_number || null,
          department || 'All', version || 'v1.0', effective_date || null,
          review_deadline || null, summary || null, file_name || null, file_data || null
        );

        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateSop: (req, res) => {
      try {
        const { id } = req.params;
        const { title, category, code_number, department, version, effective_date, review_deadline, status, summary, file_name, file_data } = req.body;

        db.prepare(`
          UPDATE internal_policies_sops SET
            title = COALESCE(?, title),
            category = COALESCE(?, category),
            code_number = COALESCE(?, code_number),
            department = COALESCE(?, department),
            version = COALESCE(?, version),
            effective_date = COALESCE(?, effective_date),
            review_deadline = COALESCE(?, review_deadline),
            status = COALESCE(?, status),
            summary = COALESCE(?, summary),
            file_name = COALESCE(?, file_name),
            file_data = COALESCE(?, file_data)
          WHERE id = ?
        `).run(title, category, code_number, department, version, effective_date, review_deadline, status, summary, file_name, file_data, id);

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteSop: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM internal_policies_sops WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 7. AI Document Vision & Compliance Advisor
    scanDocumentAi: async (req, res) => {
      try {
        const { image_base64, document_category } = req.body;
        if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

        try {
          const genAI = new GoogleGenerativeAI('AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8');
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

          let prompt = 'Inspect this document image and return valid JSON with { "document_type": string, "document_number": string, "name_on_doc": string, "issue_date": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD", "issuing_authority": string, "confidence_summary": string }';
          if (document_category === 'KYC') {
            prompt = 'Identify if this is Aadhaar, PAN Card, Voter ID, Driving License, or Passport. Extract and return JSON: { "doc_type": "AADHAAR"|"PAN"|"DRIVING_LICENSE"|"VOTER_ID"|"OTHER", "doc_number": string, "full_name": string, "dob": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD", "address": string }';
          } else if (document_category === 'STATUTORY_LICENSE') {
            prompt = 'Extract official regulatory details from this statutory license photo. Return JSON: { "license_title": string, "license_number": string, "issuing_authority": string, "issue_date": "YYYY-MM-DD", "expiry_date": "YYYY-MM-DD", "statutory_act_rule": string }';
          }

          const cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, '');
          const result = await model.generateContent([
            prompt,
            { inlineData: { data: cleanBase64, mimeType: 'image/jpeg' } }
          ]);

          const rawText = result.response.text();
          let parsedJson = null;
          try {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedJson = JSON.parse(jsonMatch[0]);
          } catch (_) {}

          res.json({ success: true, text: rawText, extracted: parsedJson });
        } catch (apiErr) {
          res.json({ success: false, error: apiErr.message, fallback: 'Document scan offline. Please input details manually.' });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getComplianceAdvice: async (req, res) => {
      try {
        const { question, topic } = req.body;
        if (!question) return res.status(400).json({ error: 'Question is required' });

        try {
          const genAI = new GoogleGenerativeAI('AIzaSyDUAiHHjq0TZMUfi602inE0FVu2dJShoa8');
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

          const systemPrompt = `You are an elite Statutory Compliance & Corporate Governance AI Advisor for an Indian Ayurvedic Pharmaceutical Manufacturing Company (Utkal Chemical Aushadhalaya, Estd 1952).
You are an expert in:
1. Schedule T (Good Manufacturing Practices) under Drugs & Cosmetics Rules 1945.
2. Form 25D & Form 26D Ayurvedic Drug Manufacturing Licenses & renewals.
3. Factory Act 1948, Boiler safety, Fire Safety NOCs, and State Pollution Control Board (OSPCB CTO/CTE).
4. Worker safety, mandatory employee KYC, medical fitness certificates, EPF, and ESIC compliance.
Provide sharp, legal-grade, highly structured, practical step-by-step guidance.`;

          const result = await model.generateContent(`${systemPrompt}\n\nUser Question (${topic || 'General Compliance'}):\n${question}`);
          res.json({ success: true, answer: result.response.text() });
        } catch (apiErr) {
          res.json({
            success: true,
            answer: `[Offline Compliance Knowledge Base]\nFor "${question}":\n- Check mandatory Schedule T Rule 157 Approved Technical Person requirements.\n- Verify validity of Form 25D Drug License with State Licensing Authority.\n- Ensure all factory workers handling medicinal herbs have valid annual Form 48 Medical Fitness Certificates.\n(Live AI Advisor offline: ${apiErr.message})`
          });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. Company Holy Bible Vault & Paper Trail Indexer
    // ─────────────────────────────────────────────────────────────────────────────
    getVaultDirectories: (req, res) => {
      try {
        const dirs = db.prepare(`
          SELECT d.*, 
            (SELECT COUNT(*) FROM company_vault_documents doc WHERE doc.dir_id = d.id) as doc_count 
          FROM vault_directories d
          ORDER BY d.id ASC
        `).all();
        res.json({ success: true, directories: dirs });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createVaultDirectory: (req, res) => {
      try {
        const { name, department, icon, parent_id } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Directory name is required' });
        const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const info = db.prepare(`
          INSERT INTO vault_directories (name, department, slug, icon, parent_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(name.trim(), department || 'General', slug, icon || '📁', parent_id || null);
        res.status(201).json({ success: true, id: info.lastInsertRowid });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateVaultDirectory: (req, res) => {
      try {
        const { id } = req.params;
        const { name, department, icon } = req.body;
        db.prepare(`
          UPDATE vault_directories 
          SET name = COALESCE(?, name), department = COALESCE(?, department), icon = COALESCE(?, icon)
          WHERE id = ?
        `).run(name?.trim() || null, department || null, icon || null, id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteVaultDirectory: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM vault_directories WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getVaultDocuments: (req, res) => {
      try {
        const { dir_id, direction, status, q, thread_name } = req.query;
        let query = `
          SELECT doc.*, d.name as directory_name,
            (SELECT COUNT(*) FROM document_paper_trails t WHERE t.parent_doc_id = doc.id OR t.child_doc_id = doc.id) as trail_count
          FROM company_vault_documents doc
          LEFT JOIN vault_directories d ON d.id = doc.dir_id
          WHERE 1=1
        `;
        const params = [];
        if (dir_id) {
          query += ' AND doc.dir_id = ?';
          params.push(dir_id);
        }
        if (direction) {
          query += ' AND doc.direction = ?';
          params.push(direction);
        }
        if (status) {
          query += ' AND doc.status = ?';
          params.push(status);
        }
        if (q) {
          query += ' AND (doc.doc_ref_no LIKE ? OR doc.title LIKE ? OR doc.subject LIKE ? OR doc.sender_party LIKE ? OR doc.recipient_party LIKE ?)';
          const term = `%${q.trim()}%`;
          params.push(term, term, term, term, term);
        }

        query += ' ORDER BY doc.id DESC';
        const docs = db.prepare(query).all(...params);
        res.json({ success: true, documents: docs });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getNextDocRef: (req, res) => {
      try {
        const { dept_code, company_prefix, year } = req.query;
        const rows = db.prepare('SELECT doc_ref_no FROM company_vault_documents WHERE doc_ref_no IS NOT NULL').all();
        const existingRefs = rows.map(r => r.doc_ref_no);
        let nextRef = 'UCA/GEN/2026/0001';
        const cfg = {
          company_prefix: company_prefix || 'UCA',
          department_code: dept_code || 'GEN',
          year: year || '2026',
          padding: 4
        };

        if (SuiteCoreBridge && typeof SuiteCoreBridge.generateNextCompanyDocRef === 'function') {
          nextRef = SuiteCoreBridge.generateNextCompanyDocRef(existingRefs, cfg);
        } else {
          nextRef = `${cfg.company_prefix}/${cfg.department_code}/${cfg.year}/0001`;
        }
        res.json({ success: true, doc_ref_no: nextRef });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    createVaultDocument: (req, res) => {
      try {
        let {
          dir_id, doc_ref_no, title, doc_type, department, direction, status,
          sender_party, recipient_party, subject, issue_date, dispatch_mode,
          tracking_consignment_no, content_json, signatory_name, signatory_title,
          signatory_reg_no, is_watermarked, retention_period_years, parent_trail_doc_id, link_relation,
          file_path, file_name, file_size
        } = req.body;

        if (!title || !title.trim()) {
          return res.status(400).json({ error: 'Document title is required' });
        }

        if (!doc_ref_no || !doc_ref_no.trim()) {
          const rows = db.prepare('SELECT doc_ref_no FROM company_vault_documents').all();
          const existingRefs = rows.map(r => r.doc_ref_no);
          const deptCode = (department || 'GEN').substring(0, 3).toUpperCase();
          doc_ref_no = SuiteCoreBridge?.generateNextCompanyDocRef
            ? SuiteCoreBridge.generateNextCompanyDocRef(existingRefs, { company_prefix: 'UCA', department_code: deptCode, year: '2026', padding: 4 })
            : `UCA/${deptCode}/2026/${String(rows.length + 1).padStart(4, '0')}`;
        }

        // Generate SHA-256 Digest
        const crypto = require('crypto');
        const hashPayload = `${doc_ref_no}|${title}|${subject || ''}|${issue_date || ''}|${Date.now()}`;
        const verification_hash = crypto.createHash('sha256').update(hashPayload).digest('hex');

        const info = db.prepare(`
          INSERT INTO company_vault_documents 
          (dir_id, doc_ref_no, title, doc_type, department, direction, status, sender_party, recipient_party, 
           subject, issue_date, dispatch_mode, tracking_consignment_no, content_json, signatory_name, 
           signatory_title, signatory_reg_no, verification_hash, is_watermarked, retention_period_years,
           file_path, file_name, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          dir_id || null,
          doc_ref_no.trim(),
          title.trim(),
          doc_type || 'LETTER',
          department || 'General',
          direction || 'INTERNAL',
          status || 'DRAFT',
          sender_party || null,
          recipient_party || null,
          subject || null,
          issue_date || new Date().toISOString().split('T')[0],
          dispatch_mode || null,
          tracking_consignment_no || null,
          typeof content_json === 'object' ? JSON.stringify(content_json) : (content_json || null),
          signatory_name || null,
          signatory_title || null,
          signatory_reg_no || null,
          verification_hash,
          is_watermarked !== undefined ? (is_watermarked ? 1 : 0) : 1,
          retention_period_years || 5,
          file_path || null,
          file_name || null,
          file_size || null
        );

        const newDocId = info.lastInsertRowid;

        // Auto-link paper trail if parent specified
        if (parent_trail_doc_id) {
          try {
            db.prepare(`
              INSERT INTO document_paper_trails (parent_doc_id, child_doc_id, link_relation, notes)
              VALUES (?, ?, ?, ?)
            `).run(parent_trail_doc_id, newDocId, link_relation || 'REPLIED_WITH', 'Created via Sandbox Document Editor');
          } catch (_) {}
        }

        // Trigger asynchronous background AI extraction, summarization & auto-tagging
        if (vaultAi) {
          setImmediate(async () => {
            try {
              await vaultAi.analyzeDocument(db, newDocId);
            } catch (aiErr) {
              console.warn('[Compliance Vault] Post-create AI analysis warning:', aiErr.message);
            }
          });
        }

        res.status(201).json({ success: true, id: newDocId, doc_ref_no, verification_hash });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    updateVaultDocument: (req, res) => {
      try {
        const { id } = req.params;
        const {
          title, doc_type, department, direction, status, sender_party, recipient_party,
          subject, issue_date, dispatch_mode, tracking_consignment_no, content_json,
          signatory_name, signatory_title, signatory_reg_no, is_watermarked, dir_id
        } = req.body;

        db.prepare(`
          UPDATE company_vault_documents
          SET title = COALESCE(?, title),
              doc_type = COALESCE(?, doc_type),
              department = COALESCE(?, department),
              direction = COALESCE(?, direction),
              status = COALESCE(?, status),
              sender_party = COALESCE(?, sender_party),
              recipient_party = COALESCE(?, recipient_party),
              subject = COALESCE(?, subject),
              issue_date = COALESCE(?, issue_date),
              dispatch_mode = COALESCE(?, dispatch_mode),
              tracking_consignment_no = COALESCE(?, tracking_consignment_no),
              content_json = COALESCE(?, content_json),
              signatory_name = COALESCE(?, signatory_name),
              signatory_title = COALESCE(?, signatory_title),
              signatory_reg_no = COALESCE(?, signatory_reg_no),
              is_watermarked = COALESCE(?, is_watermarked),
              dir_id = COALESCE(?, dir_id),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title || null, doc_type || null, department || null, direction || null, status || null,
          sender_party || null, recipient_party || null, subject || null, issue_date || null,
          dispatch_mode || null, tracking_consignment_no || null,
          typeof content_json === 'object' ? JSON.stringify(content_json) : (content_json || null),
          signatory_name || null, signatory_title || null, signatory_reg_no || null,
          is_watermarked !== undefined ? (is_watermarked ? 1 : 0) : null,
          dir_id || null, id
        );

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deleteVaultDocument: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('DELETE FROM company_vault_documents WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Sandbox Batch Operations: Move, Copy, Delete, Seal
    batchVaultOperation: (req, res) => {
      try {
        const { action, doc_ids, target_dir_id } = req.body;
        if (!Array.isArray(doc_ids) || doc_ids.length === 0) {
          return res.status(400).json({ error: 'No documents selected' });
        }

        if (action === 'MOVE') {
          if (!target_dir_id) return res.status(400).json({ error: 'Target directory ID required for MOVE' });
          const stmt = db.prepare('UPDATE company_vault_documents SET dir_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
          doc_ids.forEach(id => stmt.run(target_dir_id, id));
          return res.json({ success: true, count: doc_ids.length });
        }

        if (action === 'DELETE') {
          const stmt = db.prepare('DELETE FROM company_vault_documents WHERE id = ?');
          doc_ids.forEach(id => stmt.run(id));
          return res.json({ success: true, count: doc_ids.length });
        }

        if (action === 'SEAL') {
          const stmt = db.prepare("UPDATE company_vault_documents SET status = 'SEALED_OFFICIAL', is_watermarked = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
          doc_ids.forEach(id => stmt.run(id));
          return res.json({ success: true, count: doc_ids.length });
        }

        if (action === 'CLONE') {
          const rows = db.prepare('SELECT doc_ref_no FROM company_vault_documents').all();
          let existingRefs = rows.map(r => r.doc_ref_no);
          const selectStmt = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?');
          const insertStmt = db.prepare(`
            INSERT INTO company_vault_documents 
            (dir_id, doc_ref_no, title, doc_type, department, direction, status, sender_party, recipient_party, 
             subject, issue_date, dispatch_mode, tracking_consignment_no, content_json, signatory_name, 
             signatory_title, signatory_reg_no, verification_hash, is_watermarked)
            VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `);

          const crypto = require('crypto');
          const clonedIds = [];
          doc_ids.forEach(id => {
            const original = selectStmt.get(id);
            if (original) {
              const deptCode = (original.department || 'GEN').substring(0, 3).toUpperCase();
              const newRef = SuiteCoreBridge?.generateNextCompanyDocRef
                ? SuiteCoreBridge.generateNextCompanyDocRef(existingRefs, { company_prefix: 'UCA', department_code: deptCode, year: '2026', padding: 4 })
                : `UCA/${deptCode}/2026/${Date.now().toString().slice(-4)}`;
              existingRefs.push(newRef);
              const hash = crypto.createHash('sha256').update(newRef + Date.now()).digest('hex');

              const result = insertStmt.run(
                original.dir_id,
                newRef,
                `Copy of ${original.title}`,
                original.doc_type,
                original.department,
                original.direction,
                original.sender_party,
                original.recipient_party,
                original.subject,
                new Date().toISOString().split('T')[0],
                original.dispatch_mode,
                null,
                original.content_json,
                original.signatory_name,
                original.signatory_title,
                original.signatory_reg_no,
                hash
              );
              clonedIds.push(result.lastInsertRowid);
            }
          });
          return res.json({ success: true, cloned_ids: clonedIds });
        }

        res.status(400).json({ error: 'Unsupported batch action' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Paper Trail Linkage Endpoints
    getUnifiedTimeline: (req, res) => {
      try {
        // 1. Fetch all documents in chronological sequence
        const docs = db.prepare(`
          SELECT 
            d.id, d.dir_id, d.doc_ref_no, d.title, d.doc_type, d.department, d.direction,
            d.issue_date, d.status, d.file_name, d.file_size, d.signatory_name,
            d.verification_hash, d.created_at
          FROM company_vault_documents d
          ORDER BY d.issue_date ASC, d.id ASC
        `).all();

        // 2. Fetch all causality links
        const links = db.prepare(`
          SELECT 
            t.id, t.parent_doc_id, t.child_doc_id, t.link_relation,
            t.matter_thread_name, t.notes, t.created_at
          FROM document_paper_trails t
          ORDER BY t.id ASC
        `).all();

        // 3. Compute distinct matters and group memberships
        const mattersMap = new Map();
        links.forEach(l => {
          const matterName = l.matter_thread_name || 'General Statutory Matter';
          if (!mattersMap.has(matterName)) {
            mattersMap.set(matterName, {
              name: matterName,
              docIds: new Set(),
              linkCount: 0,
              earliestDate: null,
              latestDate: null
            });
          }
          const m = mattersMap.get(matterName);
          m.docIds.add(l.parent_doc_id);
          m.docIds.add(l.child_doc_id);
          m.linkCount++;
        });

        // 4. Compute lanes for nodes:
        // Lane 0: Sacred Spine / Core Trunk (Foundational Licenses, Board Resolutions, Regulatory Appointments)
        // Lane 1: Regulatory Proceedings (Inward Inspection Notices, Outward Formal Replies, Renewal Grants)
        // Lane 2: Evidence & KYC Dossiers (Identity Credentials, Academic Degrees, Form 48 Clinical Health, Technical Endorsements)
        const docsMap = new Map(docs.map(d => [d.id, d]));
        
        const nodes = docs.map(d => {
          let lane = 0; // Default Lane: Sacred Spine
          const text = `${d.title || ''} ${d.doc_ref_no || ''} ${d.category || ''}`.toLowerCase();
          
          if (d.direction === 'INWARD' || text.includes('notice') || text.includes('reply') || text.includes('inspection') || text.includes('renewal')) {
            lane = 1; // Regulatory Inward / Outward Proceeding
          } else if (text.includes('aadhaar') || text.includes('pan') || text.includes('qualification') || text.includes('degree') || text.includes('evidence') || text.includes('form 48') || text.includes('endorsement')) {
            lane = 2; // Evidence & KYC Dossiers
          } else if (text.includes('licence') || text.includes('license') || text.includes('resolution') || text.includes('constitution') || text.includes('appointment')) {
            lane = 0; // Sacred Spine
          }

          // Gather which matters this doc belongs to
          const docMatters = [];
          for (const [mName, mData] of mattersMap.entries()) {
            if (mData.docIds.has(d.id)) docMatters.push(mName);
          }

          return {
            ...d,
            lane,
            matters: docMatters
          };
        });

        // Calculate turnaround days for each link
        const enrichedLinks = links.map(l => {
          const parent = docsMap.get(l.parent_doc_id);
          const child = docsMap.get(l.child_doc_id);
          let turnaroundDays = null;
          if (parent?.issue_date && child?.issue_date) {
            const pDate = new Date(parent.issue_date);
            const cDate = new Date(child.issue_date);
            if (!isNaN(pDate) && !isNaN(cDate)) {
              const diffMs = cDate.getTime() - pDate.getTime();
              turnaroundDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            }
          }
          return {
            ...l,
            turnaround_days: turnaroundDays
          };
        });

        const mattersList = Array.from(mattersMap.values()).map(m => ({
          name: m.name,
          docCount: m.docIds.size,
          linkCount: m.linkCount,
          docIds: Array.from(m.docIds)
        }));

        res.json({
          success: true,
          nodes,
          links: enrichedLinks,
          matters: mattersList
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    getDocumentPaperTrail: (req, res) => {
      try {
        const { id } = req.params;
        const currentDoc = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?').get(id);
        if (!currentDoc) return res.status(404).json({ error: 'Document not found' });

        // Upstream documents (what triggered this document)
        const parents = db.prepare(`
          SELECT t.id as trail_id, t.link_relation, t.matter_thread_name, t.notes, d.*
          FROM document_paper_trails t
          JOIN company_vault_documents d ON d.id = t.parent_doc_id
          WHERE t.child_doc_id = ?
        `).all(id);

        // Downstream documents (what replied or attached to this document)
        const children = db.prepare(`
          SELECT t.id as trail_id, t.link_relation, t.matter_thread_name, t.notes, d.*
          FROM document_paper_trails t
          JOIN company_vault_documents d ON d.id = t.child_doc_id
          WHERE t.parent_doc_id = ?
        `).all(id);

        res.json({ success: true, current: currentDoc, parents, children });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    linkDocumentPaperTrail: (req, res) => {
      try {
        const { parent_doc_id, child_doc_id, link_relation, matter_thread_name, notes } = req.body;
        if (!parent_doc_id || !child_doc_id) {
          return res.status(400).json({ error: 'Both parent and child document IDs are required' });
        }
        if (Number(parent_doc_id) === Number(child_doc_id)) {
          return res.status(400).json({ error: 'Cannot link a document to itself' });
        }

        // Cycle check: verify parent_doc_id is not already a descendant of child_doc_id
        const visited = new Set();
        const queue = [Number(child_doc_id)];
        let hasCycle = false;
        while (queue.length > 0) {
          const curr = queue.shift();
          if (curr === Number(parent_doc_id)) {
            hasCycle = true;
            break;
          }
          if (!visited.has(curr)) {
            visited.add(curr);
            const nextChildren = db.prepare('SELECT child_doc_id FROM document_paper_trails WHERE parent_doc_id = ?').all(curr);
            nextChildren.forEach(c => queue.push(c.child_doc_id));
          }
        }
        if (hasCycle) {
          return res.status(400).json({ error: 'Circular causality dependency detected. Action blocked.' });
        }

        const existing = db.prepare('SELECT id FROM document_paper_trails WHERE parent_doc_id = ? AND child_doc_id = ?').get(parent_doc_id, child_doc_id);
        let id;
        if (existing) {
          db.prepare('UPDATE document_paper_trails SET link_relation = ?, matter_thread_name = ?, notes = ? WHERE id = ?')
            .run(link_relation || 'REPLIED_WITH', matter_thread_name || null, notes || null, existing.id);
          id = existing.id;
        } else {
          const info = db.prepare(`
            INSERT INTO document_paper_trails (parent_doc_id, child_doc_id, link_relation, matter_thread_name, notes)
            VALUES (?, ?, ?, ?, ?)
          `).run(parent_doc_id, child_doc_id, link_relation || 'REPLIED_WITH', matter_thread_name || null, notes || null);
          id = info.lastInsertRowid;
        }
        res.status(201).json({ success: true, id });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    deletePaperTrailLink: (req, res) => {
      try {
        const { trailId } = req.params;
        db.prepare('DELETE FROM document_paper_trails WHERE id = ?').run(trailId);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Render & Export Document via Rust Letterhead Engine
    renderVaultDocumentPdf: (req, res) => {
      try {
        const { id } = req.params;
        const doc = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?').get(id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        let parsedContent = {};
        try {
          if (doc.content_json) parsedContent = JSON.parse(doc.content_json);
        } catch (_) {}

        // Serve real file if attached
        const filePath = doc.file_path || parsedContent.file_path;
        if (filePath) {
          const path = require('path');
          const fs = require('fs');
          const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '../../../../', filePath);
          if (fs.existsSync(resolved)) {
            const fileName = (doc.file_name || parsedContent.file_name || path.basename(resolved)).replace(/[/\\?%*:|"<>]/g, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            return fs.createReadStream(resolved).pipe(res);
          }
        }

        const payload = {
          doc_ref_no: doc.doc_ref_no,
          title: doc.title,
          date: doc.issue_date || 'October 16, 2026',
          department: doc.department || 'General',
          recipient_name: parsedContent.recipient_name || doc.recipient_party || '',
          recipient_title: parsedContent.recipient_title || '',
          recipient_address: parsedContent.recipient_address || '',
          subject: doc.subject || parsedContent.subject || doc.title,
          salutation: parsedContent.salutation || 'Dear Sir / Madam,',
          paragraphs: parsedContent.paragraphs || [
            doc.subject || 'Official company document issued under Utkal Chemical Aushadhalaya governance.',
            'Please find the attached formal statutory record and references.'
          ],
          terms_clauses: parsedContent.terms_clauses || [],
          signatory_name: doc.signatory_name || 'Authorized Signatory',
          signatory_title: doc.signatory_title || 'Designated Authority',
          signatory_reg_no: doc.signatory_reg_no || '',
          is_watermarked: doc.status === 'DRAFT' || doc.is_watermarked === 1,
          watermark_text: doc.status === 'DRAFT' ? 'DRAFT - NOT FOR REGULATORY RELEASE' : '',
          matter_thread_ref: doc.tracking_consignment_no || '',
          verification_hash: doc.verification_hash || ''
        };

        if (SuiteCoreBridge && typeof SuiteCoreBridge.renderLetterheadPdf === 'function') {
          const result = SuiteCoreBridge.renderLetterheadPdf(payload);
          const pdfBuffer = Buffer.from(result.pdf_base64, 'base64');
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          res.setHeader('Content-Disposition', `inline; filename="${doc.doc_ref_no.replace(/[/\\?%*:|"<>]/g, '_')}.pdf"`);
          return res.send(pdfBuffer);
        } else {
          return res.status(500).json({ error: 'Rust SuiteCoreBridge PDF renderer unavailable' });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // Get rendered document thumbnail image (page 1)
    getVaultDocumentThumbnail: (req, res) => {
      try {
        const { id } = req.params;
        const doc = db.prepare('SELECT * FROM company_vault_documents WHERE id = ?').get(id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const path = require('path');
        const fs = require('fs');
        const rootDir = path.resolve(__dirname, '../../../../');
        const thumbDir = path.join(rootDir, 'storage/vault/.thumbnails');
        if (!fs.existsSync(thumbDir)) {
          fs.mkdirSync(thumbDir, { recursive: true });
        }

        const thumbFile = path.join(thumbDir, `doc_${id}_thumb.jpg`);
        if (fs.existsSync(thumbFile)) {
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return fs.createReadStream(thumbFile).pipe(res);
        }

        // Generate on the fly if PDF exists
        let filePath = doc.file_path;
        if (doc.content_json) {
          try {
            const p = JSON.parse(doc.content_json);
            if (p.file_path) filePath = p.file_path;
          } catch (_) {}
        }

        if (filePath) {
          const resolvedPdf = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
          if (fs.existsSync(resolvedPdf)) {
            const { execSync } = require('child_process');
            try {
              execSync(`python -c "import fitz; doc=fitz.open(r'''${resolvedPdf}'''); page=doc.load_page(0); pix=page.get_pixmap(dpi=100); pix.save(r'''${thumbFile}''', jpg_quality=85)"`, {
                stdio: 'ignore',
                timeout: 5000
              });
              if (fs.existsSync(thumbFile)) {
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return fs.createReadStream(thumbFile).pipe(res);
              }
            } catch (e) {
              console.error('Failed to generate thumbnail for doc', id, e.message);
            }
          }
        }

        return res.status(404).json({ error: 'Thumbnail not available' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    // 9. Document Vault AI Services
    analyzeDocumentAi: async (req, res) => {
      try {
        const { id } = req.params;
        if (!vaultAi) return res.status(503).json({ error: 'Vault AI engine unavailable' });
        const result = await vaultAi.analyzeDocument(db, id);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    autoSortDocument: (req, res) => {
      try {
        const { id } = req.params;
        if (!vaultAi) return res.status(503).json({ error: 'Vault AI engine unavailable' });
        const result = vaultAi.autoSortDocument(db, id);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    autoSortAllPending: (req, res) => {
      try {
        if (!vaultAi) return res.status(503).json({ error: 'Vault AI engine unavailable' });
        const result = vaultAi.autoSortAllPending(db);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    chatWithDocument: async (req, res) => {
      try {
        const { id } = req.params;
        const { question, history } = req.body;
        if (!question || !question.trim()) {
          return res.status(400).json({ error: 'Question is required' });
        }
        if (!vaultAi) return res.status(503).json({ error: 'Vault AI engine unavailable' });
        const result = await vaultAi.chatWithDocument(db, id, question.trim(), history || []);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    searchVaultAi: (req, res) => {
      try {
        const { q, limit } = req.query;
        if (!q || !q.trim()) {
          return res.json({ success: true, results: [] });
        }
        if (!vaultAi) return res.status(503).json({ error: 'Vault AI engine unavailable' });
        const results = vaultAi.searchVaultFts(db, q.trim(), Number(limit) || 12);
        res.json({ success: true, count: results.length, results });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};
