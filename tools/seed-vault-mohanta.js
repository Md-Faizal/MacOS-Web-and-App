const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database/MacOS.db');
const db = new Database(dbPath);

console.log('Seeding Real Documents for Dr. Jashobanta Rao Mohanta into MacOS.db...');

// 1. Ensure columns exist
const cols = db.prepare('PRAGMA table_info(company_vault_documents)').all().map(c => c.name);
if (!cols.includes('file_path')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN file_path TEXT').run();
if (!cols.includes('file_name')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN file_name TEXT').run();
if (!cols.includes('file_size')) db.prepare('ALTER TABLE company_vault_documents ADD COLUMN file_size INTEGER').run();

// 2. Clean scratch items id 7, 8 and doc id 4 if present
try {
  db.prepare('DELETE FROM company_vault_documents WHERE id = 4').run();
  db.prepare('DELETE FROM vault_directories WHERE id IN (7, 8)').run();
} catch (_) {}

// 3. Ensure Dr. Jashobanta Rao Mohanta in company_staff
let staff = db.prepare('SELECT id FROM company_staff WHERE full_name LIKE ?').get('%Jashobanta%');
let staffId = staff ? staff.id : null;
if (!staffId) {
  const info = db.prepare(`
    INSERT INTO company_staff 
    (emp_code, full_name, department, designation, role_type, phone, email, joining_date, blood_group, address, is_schedule_t_technical, technical_reg_no, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'EMP-005', 'Dr. Jashobanta Rao Mohanta', 'Manufacturing & Ayush Production',
    'Chief Ayurvedic Physician & Approved Technical Person', 'Technical Person',
    '+91 94371 88290', 'dr.jashobanta@utkalchemical.com', '2019-04-10', 'O+',
    'Badambadi, Cuttack, Odisha', 1, 'BAMS-OSCAM-6824', 'ACTIVE'
  );
  staffId = info.lastInsertRowid;
}
console.log('Staff ID:', staffId);

// 4. Create Directory: "Dr. Jashobanta Rao Mohanta" inside "HR & Personnel Orders" (parent_id: 1)
let empDir = db.prepare('SELECT id FROM vault_directories WHERE name = ? AND parent_id = 1').get('Dr. Jashobanta Rao Mohanta');
let empDirId = empDir ? empDir.id : null;
if (!empDirId) {
  const info = db.prepare(`
    INSERT INTO vault_directories (parent_id, name, department, slug, icon)
    VALUES (1, 'Dr. Jashobanta Rao Mohanta', 'HR & Personnel', 'dr-jashobanta-rao-mohanta', '🩺')
  `).run();
  empDirId = info.lastInsertRowid;
}
console.log('Employee Folder ID:', empDirId);

// 5. Create Sub-folders inside "Dr. Jashobanta Rao Mohanta"
const subfolders = [
  { name: 'KYC & Identity Dossiers', icon: '🪪', slug: 'kyc-identity' },
  { name: 'Statutory Licences & Ayush Permits', icon: '🏛️', slug: 'statutory-ayush' },
  { name: 'Medical Qualifications & Degrees', icon: '📜', slug: 'medical-qualifications' }
];

const subDirMap = {};
for (const sf of subfolders) {
  let existing = db.prepare('SELECT id FROM vault_directories WHERE name = ? AND parent_id = ?').get(sf.name, empDirId);
  if (!existing) {
    const info = db.prepare(`
      INSERT INTO vault_directories (parent_id, name, department, slug, icon)
      VALUES (?, ?, 'HR & Personnel', ?, ?)
    `).run(empDirId, sf.name, sf.slug, sf.icon);
    subDirMap[sf.name] = info.lastInsertRowid;
  } else {
    subDirMap[sf.name] = existing.id;
  }
}
console.log('Subfolders created:', subDirMap);

// 6. Documents list
const docs = [
  {
    dir_id: subDirMap['KYC & Identity Dossiers'],
    doc_ref_no: 'UCA/KYC/2026/0101',
    title: 'Government of India - Unique Identification Aadhaar Card',
    doc_type: 'CERTIFICATE',
    department: 'HR & Personnel',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'UIDAI / Government of India',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Official UIDAI Aadhaar verification card for Dr. Jashobanta Rao Mohanta',
    issue_date: '2024-03-12',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Aadhaar.pdf',
    file_name: 'Aadhaar.pdf',
    file_size: 12051416
  },
  {
    dir_id: subDirMap['KYC & Identity Dossiers'],
    doc_ref_no: 'UCA/KYC/2026/0102',
    title: 'Income Tax Department & UIDAI Verification Dossier (PAN & Aadhaar)',
    doc_type: 'CERTIFICATE',
    department: 'HR & Personnel',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Income Tax Department / NSDL',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Combined PAN and Aadhaar identity verification certificate',
    issue_date: '2024-03-15',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/pan and aadhar.pdf',
    file_name: 'pan and aadhar.pdf',
    file_size: 585844
  },
  {
    dir_id: subDirMap['Statutory Licences & Ayush Permits'],
    doc_ref_no: 'UCA/REG/2026/0201',
    title: 'Ayush Drug Manufacturing Licence - Form 7 Statutory Approval',
    doc_type: 'REGULATORY',
    department: 'Regulatory & Licences',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Directorate of AYUSH / State Licensing Authority',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Drugs and Cosmetics Act Form 7 manufacturing licence approval endorsed with approved technical personnel',
    issue_date: '2023-08-20',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Form 7 Licence.pdf',
    file_name: 'Form 7 Licence.pdf',
    file_size: 51104374
  },
  {
    dir_id: subDirMap['Statutory Licences & Ayush Permits'],
    doc_ref_no: 'UCA/REG/2026/0202',
    title: 'Ayush Form-1 Manufacturing Licence 5-Year Renewal Grant',
    doc_type: 'REGULATORY',
    department: 'Regulatory & Licences',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'State Drugs Controller & Licensing Authority (AYUSH)',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Statutory renewal certificate under Drugs and Cosmetics Rules (Form-1) for herbal and ayurvedic proprietary production',
    issue_date: '2025-01-10',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/Form-1 License RENEWAL.pdf',
    file_name: 'Form-1 License RENEWAL.pdf',
    file_size: 9551243
  },
  {
    dir_id: subDirMap['Statutory Licences & Ayush Permits'],
    doc_ref_no: 'UCA/REG/2026/0203',
    title: 'Ayush Department Inspection & Competent Personnel Endorsement',
    doc_type: 'LETTER',
    department: 'Regulatory & Licences',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Ayush Drug Inspectorate',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Official regulatory verification letter authorizing Dr. Jashobanta Rao Mohanta as designated manufacturing physician',
    issue_date: '2025-06-18',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/853db7fa-4993-4c99-833c-fa5f7e3011a4.pdf',
    file_name: '853db7fa-4993-4c99-833c-fa5f7e3011a4.pdf',
    file_size: 228741
  },
  {
    dir_id: subDirMap['Medical Qualifications & Degrees'],
    doc_ref_no: 'UCA/ACAD/2026/0301',
    title: 'Ayurvedic Medical Degree (BAMS) & Academic Transcripts',
    doc_type: 'CERTIFICATE',
    department: 'HR & Personnel',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Utkal University / Board of Ayurvedic Medicine',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Bachelor of Ayurvedic Medicine and Surgery (BAMS) degree convocation and clinical internship completion certificate',
    issue_date: '2016-06-30',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/QUALIFICATION certificates.pdf',
    file_name: 'QUALIFICATION certificates.pdf',
    file_size: 5286648
  },
  {
    dir_id: subDirMap['Medical Qualifications & Degrees'],
    doc_ref_no: 'UCA/ACAD/2026/0302',
    title: 'Odisha State Council of Ayurvedic Medicine - Practitioner Registration',
    doc_type: 'CERTIFICATE',
    department: 'HR & Personnel',
    direction: 'INWARD',
    status: 'SEALED_OFFICIAL',
    sender_party: 'Odisha State Council of Ayurvedic Medicine',
    recipient_party: 'Utkal Chemical Aushadhalaya',
    subject: 'Permanent medical practitioner registration certificate issued under State Ayurvedic Council',
    issue_date: '2017-01-15',
    file_path: 'storage/vault/dr_jashobanta_rao_mohanta/QUALIFICATION_Certificates.pdf',
    file_name: 'QUALIFICATION_Certificates.pdf',
    file_size: 293980
  }
];

for (const d of docs) {
  const existing = db.prepare('SELECT id FROM company_vault_documents WHERE doc_ref_no = ?').get(d.doc_ref_no);
  const content_json = JSON.stringify({
    file_path: d.file_path,
    file_name: d.file_name,
    file_size: d.file_size,
    subject: d.subject,
    recipient_name: d.recipient_party,
    paragraphs: [d.subject, 'Document archived in Corporate Document Vault.']
  });
  const hash = crypto.createHash('sha256').update(d.doc_ref_no + d.title + d.file_name).digest('hex');

  if (!existing) {
    db.prepare(`
      INSERT INTO company_vault_documents
      (dir_id, doc_ref_no, title, doc_type, department, direction, status, sender_party, recipient_party, subject, issue_date, file_path, file_name, file_size, content_json, verification_hash, signatory_name, signatory_title, signatory_reg_no, is_watermarked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dr. Jashobanta Rao Mohanta', 'Chief Ayurvedic Physician', 'BAMS-OSCAM-6824', 0)
    `).run(
      d.dir_id, d.doc_ref_no, d.title, d.doc_type, d.department, d.direction, d.status,
      d.sender_party, d.recipient_party, d.subject, d.issue_date, d.file_path, d.file_name,
      d.file_size, content_json, hash
    );
  } else {
    db.prepare(`
      UPDATE company_vault_documents
      SET dir_id = ?, title = ?, file_path = ?, file_name = ?, file_size = ?, content_json = ?, status = 'SEALED_OFFICIAL', is_watermarked = 0
      WHERE id = ?
    `).run(d.dir_id, d.title, d.file_path, d.file_name, d.file_size, content_json, existing.id);
  }
}

// 7. Also link staff_documents for Dr. Jashobanta
const staffDocs = [
  { doc_type: 'AADHAAR', doc_name: 'Aadhaar Card', doc_number: 'XXXX-XXXX-4821', file_name: 'Aadhaar.pdf' },
  { doc_type: 'PAN', doc_name: 'PAN & Aadhaar Dossier', doc_number: 'ABCDE1234F', file_name: 'pan and aadhar.pdf' },
  { doc_type: 'DRUG_LICENSE', doc_name: 'Ayush Form 7 Drug Licence', doc_number: 'OR-02/AYUR/FORM7', file_name: 'Form 7 Licence.pdf' },
  { doc_type: 'DRUG_LICENSE', doc_name: 'Form-1 License Renewal', doc_number: 'OR-02/AYUR/FORM1', file_name: 'Form-1 License RENEWAL.pdf' },
  { doc_type: 'CERTIFICATE', doc_name: 'Ayurvedic Medical Degree (BAMS)', doc_number: 'BAMS-UTKAL-2016', file_name: 'QUALIFICATION certificates.pdf' },
  { doc_type: 'REGISTRATION', doc_name: 'OSCAM Practitioner Registration', doc_number: 'BAMS-OSCAM-6824', file_name: 'QUALIFICATION_Certificates.pdf' }
];

for (const sd of staffDocs) {
  const existing = db.prepare('SELECT id FROM staff_documents WHERE staff_id = ? AND doc_name = ?').get(staffId, sd.doc_name);
  if (!existing) {
    db.prepare(`
      INSERT INTO staff_documents (staff_id, doc_type, doc_name, doc_number, file_name, verification_status)
      VALUES (?, ?, ?, ?, ?, 'VERIFIED')
    `).run(staffId, sd.doc_type, sd.doc_name, sd.doc_number, sd.file_name);
  }
}

console.log('Seeding complete! Directories:', db.prepare('SELECT id, parent_id, name FROM vault_directories').all());
console.log('Total Vault Documents:', db.prepare('SELECT count(*) as c FROM company_vault_documents').get().c);
