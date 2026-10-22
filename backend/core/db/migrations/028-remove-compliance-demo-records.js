function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function up(db) {
  if (!tableExists(db, 'company_compliances')) return;
  const seededRecords = [
    ['AYUSH Drug Manufacturing License (Form 25D)', 'OR-02/AYUR', '2022-04-01', '2027-03-31'],
    ['Schedule T GMP Compliance Certificate', 'GMP/AYUR/2023/118', '2023-08-15', '2026-08-14'],
    ['Factory License (Odisha Directorate of Factories & Boilers)', 'FAC/CUTTACK/2021/892', '2025-01-01', '2026-12-31'],
    ['State Pollution Control Board (Consent to Operate - CTO)', 'SPCB/CTO/IND/2023/4521', '2023-04-01', '2028-03-31'],
    ['Fire Safety Certificate / NOC', 'FIRE/NOC/2024/774', '2024-06-01', '2027-05-31']
  ];
  const findRecord = db.prepare(`
    SELECT id, title, expiry_date FROM company_compliances
    WHERE title = ? AND license_number = ? AND issue_date = ? AND expiry_date = ?
  `);
  const removeSeedRenewals = db.prepare(`
    DELETE FROM compliance_deadlines
    WHERE entity_type = 'COMPANY_LICENSE' AND entity_id = ? AND title = ? AND deadline_date = ?
  `);
  const removeRecord = db.prepare('DELETE FROM company_compliances WHERE id = ?');

  const purgeSeeds = db.transaction(() => {
    for (const [title, licenseNumber, issueDate, expiryDate] of seededRecords) {
      const record = findRecord.get(title, licenseNumber, issueDate, expiryDate);
      if (!record) continue;
      if (tableExists(db, 'compliance_deadlines')) {
        removeSeedRenewals.run(record.id, `Renewal: ${record.title}`, record.expiry_date);
      }
      removeRecord.run(record.id);
    }
  });
  purgeSeeds();
}

module.exports = { up };
