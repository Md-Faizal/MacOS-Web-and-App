const db = require('better-sqlite3')('database/MacOS.db');
const fs = require('fs');
const path = require('path');

const docsToAdd = [
  {
    dir_id: 2,
    doc_ref_no: 'UCA/GMP/2026/01',
    title: 'Annual Schedule T Factory GMP Inspection Notice & QC Audit',
    doc_type: 'NOTICE',
    department: 'Manufacturing',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Ayush Drug Inspectorate, Odisha',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Factory GMP Inspection and QC Compliance Audit under Schedule T',
    issue_date: 'March 14, 2026',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Form 7 Licence.pdf',
    file_name: 'Form 7 Licence.pdf',
    file_size: 51104374
  },
  {
    dir_id: 2,
    doc_ref_no: 'UCA/QC/2026/02',
    title: 'Ayush Competent Technical Personnel Endorsement for Manufacturing',
    doc_type: 'CERTIFICATE',
    department: 'Manufacturing',
    direction: 'INTERNAL',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Directorate of AYUSH',
    recipient_party: 'Manufacturing QC Division',
    subject: 'Technical staff endorsement for manufacturing Ayurvedic formulations',
    issue_date: 'April 02, 2026',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/853db7fa-4993-4c99-833c-fa5f7e3011a4.pdf',
    file_name: '853db7fa-4993-4c99-833c-fa5f7e3011a4.pdf',
    file_size: 228741
  },
  {
    dir_id: 3,
    doc_ref_no: 'AYUSH/LIC/OR/2024/07',
    title: 'Ayush Drug Manufacturing Licence - Form 7 Statutory Approval',
    doc_type: 'LICENCE',
    department: 'Regulatory & Licences',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Ayush Drug Controller, Odisha',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Grant of Ayurvedic Drug Manufacturing Licence on Form 7',
    issue_date: 'June 18, 2024',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Form 7 Licence.pdf',
    file_name: 'Form 7 Licence.pdf',
    file_size: 51104374
  },
  {
    dir_id: 3,
    doc_ref_no: 'AYUSH/REN/2026/01',
    title: 'Ayush Form-1 Manufacturing Licence 5-Year Statutory Renewal Grant',
    doc_type: 'LICENCE',
    department: 'Regulatory & Licences',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Licensing Authority & Director of AYUSH',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Five-year renewal validation under Rule 153-A of Drugs and Cosmetics Rules',
    issue_date: 'September 22, 2026',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Form-1 License RENEWAL.pdf',
    file_name: 'Form-1 License RENEWAL.pdf',
    file_size: 9551243
  },
  {
    dir_id: 4,
    doc_ref_no: 'UCA/CORP/BR/2026/01',
    title: 'Board of Directors Resolution - Regulatory Signatory Authorization',
    doc_type: 'RESOLUTION',
    department: 'Legal & Corporate',
    direction: 'INTERNAL',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Board of Directors, Utkal Chemical Aushadhalaya',
    recipient_party: 'Managing Director & Legal Counsel',
    subject: 'Formal board authorization for statutory filings and licensing endorsements',
    issue_date: 'January 10, 2026',
    file_path: null,
    file_name: 'board_resolution_2026.pdf',
    file_size: 258650
  }
];

const insertStmt = db.prepare(`
  INSERT INTO company_vault_documents 
  (dir_id, doc_ref_no, title, doc_type, department, direction, status, sender_party, recipient_party, subject, issue_date, file_path, file_name, file_size)
  VALUES (@dir_id, @doc_ref_no, @title, @doc_type, @department, @direction, @status, @sender_party, @recipient_party, @subject, @issue_date, @file_path, @file_name, @file_size)
`);

docsToAdd.forEach(d => {
  const existing = db.prepare('SELECT id FROM company_vault_documents WHERE doc_ref_no = ?').get(d.doc_ref_no);
  if (!existing) {
    const res = insertStmt.run(d);
    console.log('Inserted:', d.title, 'as ID:', res.lastInsertRowid);
  } else {
    console.log('Exists:', d.doc_ref_no, 'as ID:', existing.id);
  }
});

// Link thumbnails for all documents
const allDocs = db.prepare('SELECT id, file_path, file_name FROM company_vault_documents').all();
allDocs.forEach(d => {
  const thumbPath = path.join('storage/vault/.thumbnails', `doc_${d.id}_thumb.jpg`);
  if (!fs.existsSync(thumbPath)) {
    if (d.file_name) {
      const base = path.basename(d.file_name, path.extname(d.file_name));
      const src = path.join('storage/vault/.thumbnails', base + '_thumb.jpg');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, thumbPath);
        console.log('Linked thumb for ID', d.id, 'from', src);
      }
    }
    if (!fs.existsSync(thumbPath)) {
      const fallback = path.join('storage/vault/.thumbnails', 'doc_1_thumb.jpg');
      if (fs.existsSync(fallback)) {
        fs.copyFileSync(fallback, thumbPath);
        console.log('Linked fallback thumb for ID', d.id);
      }
    }
  }
});
console.log('Done!');
