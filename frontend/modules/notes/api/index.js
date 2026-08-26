const express = require('express');
const createHandlers = require('./handlers');
const createRoutes = require('./routes');

const router = express.Router();

let db;
let isInitialized = false;

function initializeDatabase(globalDb) {
  try {
    if (globalDb) {
      db = globalDb;
      console.log('✓ Notes using centralized database');
    } else {
      throw new Error('Centralized database not initialized');
    }

    try {
      // Create handlers with database instance
      const handlers = createHandlers(db);
      
      // Register routes on the router
      createRoutes(router, handlers);
      
      isInitialized = true;
    } catch (err) {
      console.error('✗ Failed to mount notes routes:', err.message);
      console.error('  Stack:', err.stack);
      throw err;
    }
  } catch (error) {
    console.error('✗ Error initializing Notes App:', error.message);
    console.error('  Stack:', error.stack);
    throw error;
  }
}

// Health check endpoint (on different path to avoid overriding getNotes)
router.get('/health', (req, res) => {
  try {
    const hasDb = !!db;
    const tableExists = hasDb ? db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'").get() : null;
    const noteCount = hasDb && tableExists ? db.prepare("SELECT COUNT(*) as count FROM notes").get() : null;
    
    res.json({ 
      status: 'running', 
      name: 'Notes App',
      initialized: isInitialized,
      database: {
        connected: hasDb,
        path: hasDb ? 'MacOS.db' : 'not connected',
        notesTable: {
          exists: !!tableExists,
          recordCount: noteCount?.count || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

// Debug endpoint - show all notes in database
router.get('/debug/all', (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const notes = db.prepare('SELECT * FROM notes').all();
    const tableInfo = db.prepare("PRAGMA table_info(notes)").all();
    
    res.json({
      total: notes.length,
      columns: tableInfo.map(col => `${col.name}(${col.type})`),
      notes: notes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  initializeDatabase,
  getDatabase: () => db
};

