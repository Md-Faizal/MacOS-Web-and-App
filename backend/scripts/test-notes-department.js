const assert = require('assert');
const DatabaseManager = require('../core/db/database-manager');
const notesDepartment = require('../departments/notes');

const db = DatabaseManager.initialize();
const notes = notesDepartment.create(db);
notes.initializeDatabase();
const noteId = `notes-contract-${Date.now()}`;
db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);

function invoke(handler, request = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      headers: {},
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, headers: this.headers, payload });
      },
      end() {
        resolve({ statusCode: this.statusCode, headers: this.headers, payload: null });
      }
    };
    try {
      handler(request, response);
    } catch (error) {
      reject(error);
    }
  });
}

(async () => {
  const created = await invoke(notes.service.createNote, {
    body: { id: noteId, title: 'Native notes contract', content: 'Initial content' },
    query: {}
  });
  assert.strictEqual(created.statusCode, 201);
  assert.strictEqual(created.payload.id, noteId);
  assert.ok(created.headers.ETag);

  const fetched = await invoke(notes.service.getNote, { params: { id: noteId }, query: {} });
  assert.strictEqual(fetched.payload.content, 'Initial content');

  const updated = await invoke(notes.service.updateNote, {
    params: { id: noteId },
    body: { title: 'Updated native notes', content: 'Updated content' },
    query: {},
    get(name) { return name === 'If-Match' ? fetched.headers.ETag : undefined; }
  });
  assert.strictEqual(updated.payload.title, 'Updated native notes');

  const image = await invoke(notes.service.uploadSingleImage, {
    params: { id: noteId },
    body: { imageData: 'data:image/png;base64,contract' },
    query: {}
  });
  assert.strictEqual(image.statusCode, 201);
  assert.ok(image.payload.imageId);

  const imageMeta = await invoke(notes.service.getImageMeta, { params: { id: noteId } });
  assert.strictEqual(imageMeta.payload.length, 1);

  const deleted = await invoke(notes.service.deleteNote, { params: { id: noteId }, query: {} });
  assert.deepStrictEqual(deleted.payload, { success: true, id: noteId, deleted: true });

  const missing = await invoke(notes.service.getNote, { params: { id: noteId }, query: {} });
  assert.strictEqual(missing.statusCode, 404);
  console.log('Notes department CRUD, ETag, and image contract passed.');
})().finally(() => {
  db.prepare('DELETE FROM note_images WHERE note_id = ?').run(noteId);
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
});
