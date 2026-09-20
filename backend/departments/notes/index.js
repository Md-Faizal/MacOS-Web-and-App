const express = require('express');
const createHandlers = require('./native/handlers');
const createRoutes = require('./native/routes');

module.exports = {
  name: 'notes',
  namespace: 'notes',
  path: __dirname,
  description: 'Notes, note images, and note activity domain',
  adapterPaths: [],
  ownedResponsibilities: ['notes', 'note-images', 'note-streaming'],
  create(db) {
    if (!db) throw new TypeError('Notes department requires a database');
    const router = express.Router();
    const service = createHandlers(db);
    let initialized = false;

    router.get('/health', (req, res) => {
      try {
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'").get();
        const noteCount = tableExists ? db.prepare('SELECT COUNT(*) as count FROM notes').get() : null;
        res.json({
          status: 'running',
          name: 'Notes App',
          initialized,
          database: {
            connected: true,
            path: 'MacOS.db',
            notesTable: { exists: !!tableExists, recordCount: noteCount?.count || 0 }
          }
        });
      } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
      }
    });

    router.get('/debug/all', (req, res) => {
      try {
        const notes = db.prepare('SELECT * FROM notes').all();
        const tableInfo = db.prepare('PRAGMA table_info(notes)').all();
        res.json({ total: notes.length, columns: tableInfo.map(column => `${column.name}(${column.type})`), notes });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return {
      name: 'notes',
      compatibilityEngine: false,
      router,
      service,
      initializeDatabase() {
        createRoutes(router, service);
        initialized = true;
      },
      getDatabase() {
        return db;
      }
    };
  }
};