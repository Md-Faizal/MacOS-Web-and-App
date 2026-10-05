const assert = require('assert');
const express = require('express');
const Database = require('better-sqlite3');
const notesDepartment = require('../departments/notes');

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
    );
    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE note_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL,
      image_data TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const permission = db.prepare(`
    INSERT INTO user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
    VALUES (?, 'notes', ?, ?, ?, ?)
  `);
  permission.run('viewer', 1, 0, 0, 0);
  const notes = notesDepartment.create(db);
  notes.initializeDatabase();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.get('x-test-user');
    req.user = id ? { id, role: 'worker' } : null;
    next();
  });
  app.use('/api/notes', notes.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/notes`;

  try {
    const deniedStream = await fetch(`${baseUrl}/events`, { headers: { 'x-test-user': 'no-access' } });
    assert.strictEqual(deniedStream.status, 403, 'worker without Notes view permission cannot subscribe');

    const deniedWrite = await fetch(`${baseUrl}/sample/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'viewer' },
      body: JSON.stringify({ title: 'Synthetic', content: 'Not allowed' })
    });
    assert.strictEqual(deniedWrite.status, 403, 'view-only worker cannot stream note edits');

    const allowedList = await fetch(baseUrl, { headers: { 'x-test-user': 'viewer' } });
    assert.strictEqual(allowedList.status, 200, 'worker with Notes view permission can load Notes');
    console.log('Notes realtime permission checks passed.');
  } finally {
    server.close();
    db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});