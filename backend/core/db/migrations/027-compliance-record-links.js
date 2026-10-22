function tableExists(db, tableName) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!tableExists(db, tableName)) return;
  const columns = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name));
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function up(db) {
  addColumnIfMissing(db, 'company_compliances', 'linked_staff_id', 'INTEGER REFERENCES company_staff(id) ON DELETE SET NULL');
  addColumnIfMissing(db, 'company_compliances', 'vault_document_id', 'INTEGER REFERENCES company_vault_documents(id) ON DELETE SET NULL');
  addColumnIfMissing(db, 'compliance_deadlines', 'staff_id', 'INTEGER REFERENCES company_staff(id) ON DELETE SET NULL');
  addColumnIfMissing(db, 'compliance_deadlines', 'vault_document_id', 'INTEGER REFERENCES company_vault_documents(id) ON DELETE SET NULL');
}

module.exports = { up };
