const assert = require('assert');
const express = require('express');
const Database = require('better-sqlite3');
const calendarDepartment = require('../departments/calendar');

async function run() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE user_permissions (
      user_id TEXT NOT NULL,
      module TEXT NOT NULL,
      can_view INTEGER NOT NULL DEFAULT 0,
      can_create INTEGER NOT NULL DEFAULT 0,
      can_edit INTEGER NOT NULL DEFAULT 0,
      can_delete INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, module)
    )
  `);
  const permission = db.prepare(`
    INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
    VALUES (?, 'calendar', ?, ?, ?, ?)
  `);
  permission.run('viewer', 1, 0, 0, 0);
  permission.run('editor', 1, 1, 1, 0);
  const calendar = calendarDepartment.create(db);
  calendar.initializeDatabase();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.get('x-test-user');
    req.user = id ? { id, role: 'worker' } : null;
    next();
  });
  app.use('/api/calendar', calendar.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/calendar`;

  try {
    const forbiddenRead = await fetch(baseUrl, { headers: { 'x-test-user': 'no-access' } });
    assert.strictEqual(forbiddenRead.status, 403, 'worker without view permission cannot read events');

    const viewerCreate = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'viewer' },
      body: JSON.stringify({ id: 'blocked', title: 'Blocked', date: '2026-10-05' })
    });
    assert.strictEqual(viewerCreate.status, 403, 'view-only worker cannot create events');

    const createdResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'editor' },
      body: JSON.stringify({
        id: 'range-event',
        title: 'Synthetic range event',
        date: '2026-10-05',
        time: '09:00',
        end_date: '2026-10-06',
        end_time: '10:00'
      })
    });
    assert.strictEqual(createdResponse.status, 200, 'permitted worker can create event');
    const created = await createdResponse.json();
    assert.strictEqual(created.end_date, '2026-10-06', 'end date persists');
    assert.strictEqual(created.end_time, '10:00', 'end time persists');

    const eventsResponse = await fetch(baseUrl, { headers: { 'x-test-user': 'viewer' } });
    assert.strictEqual(eventsResponse.status, 200, 'worker with view permission can read events');
    const events = await eventsResponse.json();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].id, 'range-event');
    console.log('Calendar realtime permission and persistence checks passed.');
  } finally {
    server.close();
    db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});