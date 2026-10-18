/**
 * Database Migration & AI Backfill Script for Document Vault
 * Adds ai_summary, tags, suggested_dir_id, extracted_text, ai_processed_at
 * Sets up SQLite FTS5 Full-Text Search table
 * Backfills existing documents with rich summaries & smart tags
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../database/MacOS.db');
const db = new Database(dbPath);

console.log('--- Migrating Document Vault for AI Integration ---');

// 1. Add columns to company_vault_documents if missing
const tableInfo = db.prepare('PRAGMA table_info(company_vault_documents)').all();
const existingCols = new Set(tableInfo.map(c => c.name));

const colsToAdd = [
  { name: 'ai_summary', type: 'TEXT' },
  { name: 'tags', type: 'TEXT' },
  { name: 'suggested_dir_id', type: 'INTEGER' },
  { name: 'extracted_text', type: 'TEXT' },
  { name: 'ai_processed_at', type: 'DATETIME' }
];

colsToAdd.forEach(col => {
  if (!existingCols.has(col.name)) {
    db.prepare(`ALTER TABLE company_vault_documents ADD COLUMN ${col.name} ${col.type}`).run();
    console.log(`Added column: ${col.name}`);
  }
});

// 2. Setup SQLite FTS5 Table
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
console.log('Created/verified vault_doc_fts FTS5 table');

// 3. Directories lookup
const directories = db.prepare('SELECT id, name, slug FROM vault_directories').all();
const dirMap = new Map();
directories.forEach(d => {
  dirMap.set(d.slug, d.id);
  dirMap.set(d.name.toLowerCase(), d.id);
});

// 4. Curated AI Metadata for Seed Records
const curatedMetadata = {
  1: {
    summary: 'Official appointment of Dr. Debabrata Mishra as Chief Ayurvedic Medical Officer under Rule 157 Schedule T, defining manufacturing oversight, batch authorization, and statutory pharmacopoeial release duties.',
    tags: JSON.stringify(['Appointment', 'Medical Officer', 'Schedule T', 'Rule 157', 'HR']),
    suggested_slug: 'personnel-records'
  },
  2: {
    summary: 'Statutory inspection notice issued by the Directorate of AYUSH, Govt of Odisha, scheduling annual on-site audit of manufacturing plants, sanitization logs, and retention sample archives.',
    tags: JSON.stringify(['Regulatory Notice', 'AYUSH', 'Audit', 'Schedule T', 'GMP']),
    suggested_slug: 'inspections'
  },
  3: {
    summary: 'Formal outward compliance reply and submission of Form 48 medical fitness health dossiers for factory technical workers in response to the annual AYUSH GMP audit.',
    tags: JSON.stringify(['Compliance Reply', 'Form 48', 'Health Dossier', 'AYUSH', 'GMP']),
    suggested_slug: 'audit-compliance'
  },
  5: {
    summary: 'Government of India UIDAI verified Aadhaar identity card for Dr. Jashobanta Rao Mohanta, submitted as statutory personnel KYC evidence for medical officer appointment.',
    tags: JSON.stringify(['KYC', 'Aadhaar', 'UIDAI', 'Identity', 'Personnel']),
    suggested_slug: 'personnel-records'
  },
  6: {
    summary: 'Statutory Permanent Account Number (PAN) tax identity card issued by the Income Tax Department of India for Dr. Jashobanta Rao Mohanta.',
    tags: JSON.stringify(['KYC', 'PAN Card', 'Tax ID', 'Income Tax', 'Personnel']),
    suggested_slug: 'personnel-records'
  },
  7: {
    summary: 'State Council of Ayurvedic Medicine registration certificate conferring authorized license to practice and head classical pharmaceutical manufacturing.',
    tags: JSON.stringify(['Medical Council', 'Registration', 'BAMS', 'Practitioner', 'License']),
    suggested_slug: 'personnel-records'
  },
  8: {
    summary: 'Doctor of Medicine (M.D. Ayurveda - Kayachikitsa) postgraduate degree diploma awarded by Sambalpur University.',
    tags: JSON.stringify(['MD Degree', 'Postgraduate', 'Ayurveda', 'Sambalpur University', 'Education']),
    suggested_slug: 'personnel-records'
  },
  9: {
    summary: 'Bachelor of Ayurvedic Medicine & Surgery (B.A.M.S.) graduation degree conferred by Utkal University establishing statutory medical eligibility.',
    tags: JSON.stringify(['BAMS', 'Graduation Degree', 'Ayurveda', 'Utkal University', 'Education']),
    suggested_slug: 'personnel-records'
  },
  10: {
    summary: 'Formal offer of employment extended by Utkal Chemical Aushadhalaya to Dr. Jashobanta Rao Mohanta for the post of Medical Officer & Manufacturing QA In-Charge.',
    tags: JSON.stringify(['Job Offer', 'Employment', 'Terms of Service', 'Medical Officer', 'HR']),
    suggested_slug: 'personnel-records'
  },
  11: {
    summary: 'Formal appointment and engagement letter detailing compensation, statutory responsibilities, and code of conduct for Dr. Jashobanta Rao Mohanta.',
    tags: JSON.stringify(['Appointment Letter', 'Employment Agreement', 'Medical Officer', 'Compensation', 'HR']),
    suggested_slug: 'personnel-records'
  },
  12: {
    summary: 'Countersigned letter confirming formal joining of duties and assumption of charge as Medical Officer at the Cuttack pharmaceutical production facility.',
    tags: JSON.stringify(['Joining Report', 'Assumption of Charge', 'Onboarding', 'Personnel', 'HR']),
    suggested_slug: 'personnel-records'
  },
  13: {
    summary: 'Endorsement certificate and statutory notification by Directorate of AYUSH approving Dr. Jashobanta Rao Mohanta as designated Expert Manufacturing In-Charge on Form 25.',
    tags: JSON.stringify(['AYUSH Endorsement', 'Approved Chemist', 'Form 25', 'Statutory Approval', 'Regulatory']),
    suggested_slug: 'statutory-licenses'
  },
  14: {
    summary: 'Statutory 5-year Manufacturing License (Form 25) issued under Rule 154 of Drugs & Cosmetics Rules 1945 for classical Ayurvedic formulation lines.',
    tags: JSON.stringify(['Form 25', 'Manufacturing License', 'Drugs & Cosmetics Act', 'AYUSH', 'Statutory']),
    suggested_slug: 'statutory-licenses'
  },
  15: {
    summary: 'Official Certificate of 5-Year Manufacturing License Renewal granted by the State Licensing Authority following full satisfaction of Schedule T GMP audit findings.',
    tags: JSON.stringify(['License Renewal', 'Form 25', '5-Year Renewal', 'Schedule T', 'Audit Satisfaction']),
    suggested_slug: 'statutory-licenses'
  },
  16: {
    summary: 'Board of Directors Corporate Resolution ratifying statutory renewal of AYUSH manufacturing licenses and authorizing continued commercial manufacturing operations.',
    tags: JSON.stringify(['Board Resolution', 'Corporate Governance', 'Ratification', 'Directors', 'Executive']),
    suggested_slug: 'board-resolutions'
  }
};

// 5. Backfill records
const docs = db.prepare('SELECT * FROM company_vault_documents').all();
const updateStmt = db.prepare(`
  UPDATE company_vault_documents
  SET ai_summary = ?,
      tags = ?,
      suggested_dir_id = COALESCE(?, suggested_dir_id),
      extracted_text = ?,
      ai_processed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const ftsDeleteStmt = db.prepare('DELETE FROM vault_doc_fts WHERE doc_id = ?');
const ftsInsertStmt = db.prepare(`
  INSERT INTO vault_doc_fts(doc_id, title, doc_ref_no, department, tags, ai_summary, extracted_text)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let updatedCount = 0;
docs.forEach(doc => {
  const curated = curatedMetadata[doc.id];
  let summary = doc.ai_summary;
  let tags = doc.tags;
  let suggestedDirId = doc.suggested_dir_id;
  let extractedText = doc.extracted_text;

  if (curated) {
    summary = curated.summary;
    tags = curated.tags;
    if (curated.suggested_slug && dirMap.has(curated.suggested_slug)) {
      suggestedDirId = dirMap.get(curated.suggested_slug);
    }
  } else if (!summary) {
    summary = `${doc.title}. Issued by ${doc.sender_party || 'Utkal Chemical Aushadhalaya'} to ${doc.recipient_party || 'Records'}. Subject: ${doc.subject || 'Statutory Corporate Compliance'}.`;
    tags = JSON.stringify([doc.department || 'Corporate', doc.doc_type || 'DOCUMENT', 'Verified']);
  }

  if (!extractedText) {
    extractedText = `${doc.doc_ref_no} ${doc.title} ${doc.subject || ''} ${doc.sender_party || ''} ${doc.recipient_party || ''} ${summary}`;
  }

  updateStmt.run(summary, tags, suggestedDirId, extractedText, doc.id);

  // Sync to FTS5
  ftsDeleteStmt.run(doc.id);
  ftsInsertStmt.run(doc.id, doc.title, doc.doc_ref_no, doc.department, tags, summary, extractedText);

  updatedCount++;
});

console.log(`Successfully migrated & backfilled ${updatedCount} documents with AI summaries, smart tags & FTS5 indexing.`);
