/**
 * Seed realistic enterprise Paper Trail causality links
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/MacOS.db');
const db = new Database(dbPath);

console.log('🔗 Seeding Enterprise Paper Trail & Causality Links in MacOS.db...');

// Clear existing test trails to re-seed clean DAG
db.prepare('DELETE FROM document_paper_trails').run();

const trailsToSeed = [
  // Thread 1: AYUSH GMP Inspection & Renewal 2026
  {
    parent_doc_id: 14, // Form 7 Licence 2024
    child_doc_id: 2,   // Annual Inspection Notice
    link_relation: 'INWARD_TRIGGER',
    matter_thread_name: 'AYUSH GMP Inspection & Renewal 2026',
    notes: 'Schedule T annual inspection triggered by Ayush Directorate under Form 7 statutory licence'
  },
  {
    parent_doc_id: 2,  // Annual Inspection Notice
    child_doc_id: 3,   // Form 48 Compliance Reply
    link_relation: 'REPLIED_WITH',
    matter_thread_name: 'AYUSH GMP Inspection & Renewal 2026',
    notes: 'Formal statutory reply and Form 48 dossiers submitted within 4 business days'
  },
  {
    parent_doc_id: 3,  // Form 48 Compliance Reply
    child_doc_id: 13,  // Technical Personnel Endorsement
    link_relation: 'ATTACHED_EVIDENCE',
    matter_thread_name: 'AYUSH GMP Inspection & Renewal 2026',
    notes: 'Competent manufacturing expert verification submitted with laboratory test reports'
  },
  {
    parent_doc_id: 13, // Technical Personnel Endorsement
    child_doc_id: 15,  // Form-1 Renewal Grant
    link_relation: 'SUPERSEDES',
    matter_thread_name: 'AYUSH GMP Inspection & Renewal 2026',
    notes: '5-Year Statutory Manufacturing License Renewal granted following audit satisfaction'
  },
  {
    parent_doc_id: 15, // Form-1 Renewal Grant
    child_doc_id: 16,  // Board Resolution
    link_relation: 'AUTHORIZED_BY',
    matter_thread_name: 'AYUSH GMP Inspection & Renewal 2026',
    notes: 'Board resolution ratifying regulatory renewal and authorising continuous plant operations'
  },

  // Thread 2: Dr. Mohanta Medical Officer Onboarding & KYC
  {
    parent_doc_id: 1,  // Appointment Letter
    child_doc_id: 5,   // Aadhaar Card
    link_relation: 'ATTACHED_EVIDENCE',
    matter_thread_name: 'Dr. Mohanta Medical Officer Onboarding',
    notes: 'Government of India Aadhaar identity verification'
  },
  {
    parent_doc_id: 5,  // Aadhaar Card
    child_doc_id: 6,   // PAN & Aadhaar Dossier
    link_relation: 'ATTACHED_EVIDENCE',
    matter_thread_name: 'Dr. Mohanta Medical Officer Onboarding',
    notes: 'Income Tax Department PAN and biometric UIDAI verification dossier'
  },
  {
    parent_doc_id: 1,  // Appointment Letter
    child_doc_id: 10,  // BAMS Degree
    link_relation: 'ATTACHED_EVIDENCE',
    matter_thread_name: 'Dr. Mohanta Medical Officer Onboarding',
    notes: 'Bachelor of Ayurvedic Medicine & Surgery (BAMS) degree verified'
  },
  {
    parent_doc_id: 10, // BAMS Degree
    child_doc_id: 11,  // Practitioner Reg
    link_relation: 'AUTHORIZED_BY',
    matter_thread_name: 'Dr. Mohanta Medical Officer Onboarding',
    notes: 'Odisha State Council of Ayurvedic Medicine practitioner registration grant'
  },
  {
    parent_doc_id: 11, // Practitioner Reg
    child_doc_id: 9,   // Technical Personnel Endorsement
    link_relation: 'AUTHORIZED_BY',
    matter_thread_name: 'Dr. Mohanta Medical Officer Onboarding',
    notes: 'Official Directorate endorsement as designated factory medical supervisor'
  }
];

const insert = db.prepare(`
  INSERT INTO document_paper_trails (parent_doc_id, child_doc_id, link_relation, matter_thread_name, notes)
  VALUES (@parent_doc_id, @child_doc_id, @link_relation, @matter_thread_name, @notes)
`);

db.transaction(() => {
  for (const t of trailsToSeed) {
    insert.run(t);
  }
})();

const count = db.prepare('SELECT COUNT(*) as c FROM document_paper_trails').get().c;
console.log(`✅ Successfully seeded ${count} causality links across 2 major compliance matters.`);
