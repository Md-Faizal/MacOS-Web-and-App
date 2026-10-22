const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const createComplianceHandlers = require('../departments/compliance/engine/handlers');
const createComplianceRoutes = require('../departments/compliance/engine/routes');
const linkMigration = require('../core/db/migrations/027-compliance-record-links');
const demoCleanupMigration = require('../core/db/migrations/028-remove-compliance-demo-records');

async function run() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const handlers = createComplianceHandlers(db);
  handlers.initDatabase();
  linkMigration.up(db);
  linkMigration.up(db);
  const seededLicenseId = Number(db.prepare(`
    INSERT INTO company_compliances (title, license_number, issue_date, expiry_date)
    VALUES (?, ?, ?, ?)
  `).run(
    'AYUSH Drug Manufacturing License (Form 25D)',
    'OR-02/AYUR',
    '2022-04-01',
    '2027-03-31'
  ).lastInsertRowid);
  db.prepare(`
    INSERT INTO compliance_deadlines (entity_type, entity_id, title, deadline_date)
    VALUES ('COMPANY_LICENSE', ?, ?, ?)
  `).run(seededLicenseId, 'Renewal: AYUSH Drug Manufacturing License (Form 25D)', '2027-03-31');
  const completedSeedLicenseId = Number(db.prepare(`
    INSERT INTO company_compliances (title, license_number, issue_date, expiry_date)
    VALUES (?, ?, ?, ?)
  `).run(
    'Schedule T GMP Compliance Certificate',
    'GMP/AYUR/2023/118',
    '2023-08-15',
    '2026-08-14'
  ).lastInsertRowid);
  db.prepare(`
    INSERT INTO compliance_deadlines (entity_type, entity_id, title, deadline_date, status)
    VALUES ('COMPANY_LICENSE', ?, ?, ?, 'COMPLETED')
  `).run(completedSeedLicenseId, 'Renewal: Schedule T GMP Compliance Certificate', '2026-08-14');
  const ownerLicenseId = Number(db.prepare(`
    INSERT INTO company_compliances (title, license_number)
    VALUES (?, ?)
  `).run('Owner-entered license', 'OWNER-123').lastInsertRowid);
  demoCleanupMigration.up(db);
  demoCleanupMigration.up(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM company_compliances').get().count, 1);
  assert.ok(db.prepare('SELECT id FROM company_compliances WHERE id = ?').get(ownerLicenseId));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM compliance_deadlines').get().count, 0);
  db.prepare('DELETE FROM company_compliances WHERE id = ?').run(ownerLicenseId);

  const staffId = Number(db.prepare(
    'INSERT INTO company_staff (emp_code, full_name) VALUES (?, ?)'
  ).run('CONTRACT-STAFF-001', 'Contract Test Staff').lastInsertRowid);
  const documentId = Number(db.prepare(
    'INSERT INTO company_vault_documents (doc_ref_no, title) VALUES (?, ?)'
  ).run('CONTRACT/VAULT/001', 'Contract Evidence').lastInsertRowid);

  const router = express.Router();
  createComplianceRoutes(router, handlers);
  const app = express();
  app.use(express.json());
  app.use('/api/compliance', router);
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/compliance`;
    const request = async (path, method = 'GET', body) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
      });
      return { response, payload: await response.json() };
    };

    const options = await request('/vault/document-options');
    assert.equal(options.response.status, 200);
    assert.equal(options.payload.documents[0].id, documentId);

    const createdDeadline = await request('/deadlines', 'POST', {
      title: 'Contract deadline',
      deadline_date: '2030-05-12',
      category: 'Internal',
      priority: 'medium',
      staff_id: staffId,
      vault_document_id: documentId
    });
    assert.equal(createdDeadline.response.status, 201);
    const deadlineId = createdDeadline.payload.id;

    let deadlines = await request('/deadlines');
    assert.equal(deadlines.response.status, 200);
    let deadline = deadlines.payload.deadlines.find(item => item.id === deadlineId);
    assert.equal(deadline.linked_staff_name, 'Contract Test Staff');
    assert.equal(deadline.vault_document_title, 'Contract Evidence');

    assert.equal((await request(`/deadlines/${deadlineId}`, 'PUT', {
      title: 'Updated contract deadline',
      deadline_date: '2030-05-13',
      priority: 'HIGH'
    })).response.status, 200);
    assert.equal((await request(`/deadlines/${deadlineId}/status`, 'PATCH', {
      status: 'COMPLETED'
    })).response.status, 200);
    assert.equal((await request(`/deadlines/${deadlineId}/status`, 'PATCH', {
      status: 'INVALID'
    })).response.status, 400);
    assert.equal((await request('/deadlines', 'POST', {
      title: 'Invalid date',
      deadline_date: '2030-02-30'
    })).response.status, 400);
    assert.equal((await request('/deadlines', 'POST', {
      title: 'Invalid link',
      deadline_date: '2030-02-28',
      staff_id: 99999
    })).response.status, 400);

    const createdLicense = await request('/licenses', 'POST', {
      title: 'Contract license',
      category: 'GENERAL',
      expiry_date: '2031-08-09',
      linked_staff_id: staffId,
      vault_document_id: documentId
    });
    assert.equal(createdLicense.response.status, 201);
    const licenseId = createdLicense.payload.id;
    deadlines = await request('/deadlines');
    let renewals = deadlines.payload.deadlines.filter(item =>
      item.entity_type === 'COMPANY_LICENSE' && item.entity_id === licenseId
    );
    assert.equal(renewals.length, 1);
    assert.equal(renewals[0].vault_document_title, 'Contract Evidence');

    assert.equal((await request(`/licenses/${licenseId}`, 'PUT', {
      title: 'Updated contract license',
      expiry_date: '2032-01-11',
      linked_staff_id: null,
      vault_document_id: null
    })).response.status, 200);
    deadlines = await request('/deadlines');
    renewals = deadlines.payload.deadlines.filter(item =>
      item.entity_type === 'COMPANY_LICENSE' && item.entity_id === licenseId
    );
    assert.equal(renewals[0].title, 'Renewal: Updated contract license');
    assert.equal(renewals[0].deadline_date, '2032-01-11');
    assert.equal(renewals[0].staff_id, null);

    db.prepare('DELETE FROM company_staff WHERE id = ?').run(staffId);
    db.prepare('DELETE FROM company_vault_documents WHERE id = ?').run(documentId);
    deadlines = await request('/deadlines');
    deadline = deadlines.payload.deadlines.find(item => item.id === deadlineId);
    assert.equal(deadline.staff_id, null);
    assert.equal(deadline.vault_document_id, null);

    const overview = await request('/overview');
    assert.equal(overview.response.status, 200);
    assert.equal(overview.payload.metrics.totalLicenses, 1);
    assert.equal(overview.payload.metrics.pendingDeadlinesCount, 1);
    assert.ok(Array.isArray(overview.payload.recordedActivity));

    assert.equal((await request(`/deadlines/${deadlineId}`, 'DELETE')).response.status, 200);
    assert.equal((await request(`/licenses/${licenseId}`, 'DELETE')).response.status, 200);
    assert.equal((await request(`/deadlines/${deadlineId}`, 'DELETE')).response.status, 404);
    console.log('Compliance workspace API and migration contracts passed.');
  } finally {
    server.close();
    db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
