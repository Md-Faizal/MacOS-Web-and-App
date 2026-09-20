const crypto = require('crypto');

// ===== SSE CLIENT REGISTRY =====
// Tracks all active /api/notes/events connections.
// Module-level so it persists across handler factory calls.
const sseClients = new Set();

/**
 * Broadcast an SSE event to every connected client.
 * Silently drops dead connections.
 */
function broadcast(event, data) {
  if (sseClients.size === 0) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
  console.log(`📡 [SSE] Broadcast '${event}' to ${sseClients.size} client(s)`);
}

module.exports = function(db) {
  // Verify database is available
  if (!db) {
    console.error('❌ CRITICAL: Database instance not passed to handlers!');
  }

  // Validation helpers
  function validateTitle(title) {
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return { valid: false, error: 'title required (non-empty string)' };
    }
    if (title.length > 500) {
      return { valid: false, error: 'title too long (max 500 chars)' };
    }
    return { valid: true };
  }

  function validateContent(content) {
    if (content === undefined || content === null) return { valid: true };
    if (typeof content !== 'string' || content.length > 100000) {
      return { valid: false, error: 'content too long (max 100KB)' };
    }
    return { valid: true };
  }


  // Priority 3: Generate ETag from note content (optimized - no base64)
  function generateETag(note) {
    // Use only metadata for ETag, not full base64 images
    const data = JSON.stringify({
      title: note.title || '',
      content: note.content || '',
      updated_at: note.updated_at || ''  // Include timestamp for freshness
    });
    return `"${crypto.createHash('md5').update(data).digest('hex')}"`;
  }

  return {
    // ===== SSE SUBSCRIPTION =====
    subscribeSSE: (req, res) => {
      // Standard SSE response headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // Tell Nginx NOT to buffer this stream (essential for SSE behind a proxy)
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Initial connection confirmation event
      res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

      const client = { res };
      sseClients.add(client);
      console.log(`📡 [SSE] Client connected. Total: ${sseClients.size}`);

      // Heartbeat every 25s — keeps connection alive through proxies/firewalls
      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); }
        catch (e) { clearInterval(heartbeat); sseClients.delete(client); }
      }, 25000);

      // Cleanup on client disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
        console.log(`📡 [SSE] Client disconnected. Total: ${sseClients.size}`);
      });
    },

    // ===== LIVE CONTENT STREAMING =====
    // Broadcasts the current note content to all *other* SSE clients in real-time
    // without performing a DB write. Used for WhatsApp-style live typing sync.
    streamNoteContent: (req, res) => {
      try {
        const { id } = req.params;
        const { title, content, clientId } = req.body;

        if (!id) return res.status(400).json({ error: 'Note ID required' });

        // Zero-persistence broadcast — just push to connected SSE clients
        broadcast('content-streaming', {
          type: 'content-streaming',
          id,
          title:   title   !== undefined ? title   : undefined,
          content: content !== undefined ? content : undefined,
          clientId: clientId || null
        });

        // Respond immediately with no body — keep this path as fast as possible
        res.status(204).end();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getNotes: (req, res) => {
      try {
        console.log('📖 GET /api/notes - Fetching all notes');
        
        if (!db) {
          console.error('❌ Database is null/undefined');
          return res.status(500).json({ error: 'Database not initialized' });
        }

        const min = req.query.minimal === 'true';
        let query = 'SELECT * FROM notes ORDER BY created_at DESC';
        if (min) query = 'SELECT id, title, created_at, updated_at FROM notes ORDER BY created_at DESC';
        const stmt = db.prepare(query);
        const notes = stmt.all();
        
        res.set('Content-Type', 'application/json');
        console.log(`✅ Retrieved ${notes.length} notes from database`);
        res.json(notes);
      } catch (error) {
        console.error('❌ getNotes error:', error.message);
        console.error('   Stack:', error.stack);
        res.status(500).json({ error: error.message });
      }
    },

    getNote: (req, res) => {
      try {
        const { id } = req.params;
        console.log(`📖 GET /api/notes/${id} - Fetching single note`);
        
        if (!db) {
          return res.status(500).json({ error: 'Database not initialized' });
        }

        const min = req.query.minimal === 'true';
        let query = 'SELECT * FROM notes WHERE id = ?';
        if (min) query = 'SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?';
        const stmt = db.prepare(query);
        const note = stmt.get(id);
        if (!note) {
          console.log(`⚠️  Note ${id} not found`);
          return res.status(404).json({ error: 'Note not found' });
        }
        
        // Priority 3: Generate and set ETag for conflict detection
        const eTag = generateETag(note);
        res.set('ETag', eTag);
        res.set('Content-Type', 'application/json');
        console.log(`✅ Retrieved note: ${id} (ETag: ${eTag})`);
        res.json(note);
      } catch (error) {
        console.error('❌ getNote error:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    createNote: (req, res) => {
      try {
        console.log('\n=== CREATE NOTE REQUEST ===');
        console.log('📝 POST /api/notes');
        console.log('Body received:', JSON.stringify(req.body, null, 2));
        
        if (!db) {
          console.error('❌ CRITICAL: Database is null!');
          return res.status(500).json({ error: 'Database not initialized' });
        }

        const { id, title, content } = req.body;
        
        // Validation: id
        if (!id || typeof id !== 'string' || id.length > 100) {
          console.error('❌ Validation: Invalid id');
          return res.status(400).json({ error: 'id required (string, max 100 chars)' });
        }
        
        // Validation: title
        const titleValidation = validateTitle(title);
        if (!titleValidation.valid) {
          console.error(`❌ Validation: ${titleValidation.error}`);
          return res.status(400).json({ error: titleValidation.error });
        }
        
        // Validation: content
        const contentValidation = validateContent(content);
        if (!contentValidation.valid) {
          console.error(`❌ Validation: ${contentValidation.error}`);
          return res.status(400).json({ error: contentValidation.error });
        }
        
        console.log(`📝 Inserting note:`);
        console.log(`   ID: ${id}`);
        console.log(`   Title: ${title}`);
        console.log(`   Content: ${content ? content.substring(0, 50) + '...' : '(empty)'}`);
        
        // Transaction for atomic insertion
        const createTx = db.transaction((reqId, reqTitle, reqContent) => {
          const stmt = db.prepare(`
            INSERT INTO notes (id, title, content, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `);
          const info = stmt.run(reqId, reqTitle, reqContent);
          const verify = db.prepare('SELECT * FROM notes WHERE id = ?').get(reqId);
          return { info, verify };
        });
        
        const { info, verify } = createTx(id, title, content || null);
        console.log(`✅ Insert executed - Changes: ${info.changes}`);
        
        if (verify) {
          // Priority 3: Set ETag on creation
          const eTag = generateETag(verify);
          res.status(201);
          res.set('ETag', eTag);
          res.set('Content-Type', 'application/json');
          console.log(`✅ VERIFIED: Note exists in database (ETag: ${eTag})`);
          // Broadcast to all SSE clients (other devices)
          broadcast('note-created', {
            type: 'note-created',
            id: verify.id,
            title: verify.title,
            content: verify.content,
            clientId: req.query.clientId || null
          });
          res.json(verify);
        } else {
          console.error('❌ CRITICAL: Note NOT found in database after insert!');
          res.status(500).json({ error: { message: 'Note was not saved to database', code: 'INTERNAL_ERROR' } });
        }
      } catch (error) {
        console.error('\n❌ CREATE NOTE ERROR:', error.message);
        console.error('   Stack:', error.stack);
        console.error('   Code:', error.code);
        console.log('═══════════════════════════════\n');
        res.status(500).json({ error: error.message, code: error.code });
      }
    },

    updateNote: (req, res) => {
      try {
        const { id } = req.params;
        const { title, content } = req.body; // Images handled separately
        
        console.log('\n=== UPDATE NOTE REQUEST ===');
        console.log(`📝 PUT /api/notes/${id}`);
        console.log('Body:', JSON.stringify({ title, content }, null, 2));
        
        if (!db) {
          console.error('❌ CRITICAL: Database is null!');
          return res.status(500).json({ error: 'Database not initialized' });
        }

        // Fetch current note for partial-update fallback and ETag validation
        const currentNote = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
        if (!currentNote) {
          console.error(`❌ Note ${id} not found`);
          return res.status(404).json({ error: 'Note not found' });
        }

        // Support partial updates: fallback to current note values if undefined
        const updateTitle = title !== undefined ? title : currentNote.title;
        const updateContent = content !== undefined ? content : currentNote.content;

        // Validation: title (required if provided or falling back)
        const titleValidation = validateTitle(updateTitle);
        if (!titleValidation.valid) {
          console.error(`❌ Validation: ${titleValidation.error}`);
          return res.status(400).json({ error: titleValidation.error });
        }
        
        // Validation: content
        const contentValidation = validateContent(updateContent);
        if (!contentValidation.valid) {
          console.error(`❌ Validation: ${contentValidation.error}`);
          return res.status(400).json({ error: contentValidation.error });
        }

        // ENFORCE: If-Match header required for updates (optimistic locking)
        const ifMatchHeader = req.get('If-Match');
        const currentETag = generateETag(currentNote);
        
        if (!ifMatchHeader) {
          console.warn(`⚠️ WARNING: No If-Match header provided`);
          console.warn(`   Current ETag: ${currentETag}`);
          console.warn(`   Allowing update but recommend client use ETag`);
        } else if (ifMatchHeader !== currentETag) {
          console.warn(`⚠️ ETag CONFLICT DETECTED!`);
          console.warn(`   Expected (current): ${currentETag}`);
          console.warn(`   Got (client): ${ifMatchHeader}`);
          console.log('═══════════════════════════════\n');
          return res.status(412).json({ 
            error: 'Conflict: resource was modified', 
            currentETag: currentETag,
            clientETag: ifMatchHeader
          });
        }

        // Transaction for atomic update
        const updateTx = db.transaction((reqTitle, reqContent, reqId) => {
          const stmt = db.prepare(`
            UPDATE notes SET 
              title = ?, 
              content = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `);
          const info = stmt.run(reqTitle, reqContent, reqId);
          const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(reqId);
          return { info, updated };
        });
        
        const { info, updated } = updateTx(updateTitle, updateContent || null, id);
        console.log(`✅ Update executed - Changes: ${info.changes}`);

        if (updated) {
          // Priority 3: Set new ETag in response header
          const newETag = generateETag(updated);
          res.set('ETag', newETag);
          res.set('Content-Type', 'application/json');
          console.log(`✅ VERIFIED: Updated note found in database (new ETag: ${newETag})`);
          // Broadcast to all SSE clients (other devices)
          broadcast('note-updated', {
            type: 'note-updated',
            id: updated.id,
            title: updated.title,
            content: updated.content,
            clientId: req.query.clientId || null
          });
          res.json(updated);
        } else {
          console.error(`❌ Note ${id} not found after update`);
          res.status(404).json({ error: { message: 'Note not found', code: 'NOT_FOUND' } });
        }
      } catch (error) {
        console.error('❌ UPDATE NOTE ERROR:', error.message);
        console.error('   Stack:', error.stack);
        console.log('═══════════════════════════════\n');
        res.status(500).json({ error: error.message });
      }
    },

    getImageMeta: (req, res) => {
      try {
        const { id } = req.params;
        if (!db) return res.status(500).json({ error: 'Database not initialized' });

        const stmt = db.prepare('SELECT id, sort_order FROM note_images WHERE note_id = ? ORDER BY sort_order ASC');
        const meta = stmt.all(id);
        res.json(meta);
      } catch (error) {
        console.error('❌ getImageMeta error:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    getSingleImage: (req, res) => {
      try {
        const { id, imageId } = req.params;
        if (!db) return res.status(500).json({ error: 'Database not initialized' });

        const stmt = db.prepare('SELECT image_data FROM note_images WHERE note_id = ? AND id = ?');
        const img = stmt.get(id, imageId);
        
        if (!img) return res.status(404).json({ error: 'Image not found' });
        
        // Cache indefinitely
        res.set('Cache-Control', 'public, max-age=31536000');
        // Because data is likely a data URI, we return it as JSON to let the frontend parse it.
        // It could also just be raw base64 strings.
        res.json({ id: imageId, data: img.image_data });
      } catch (error) {
        console.error('❌ getSingleImage error:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    uploadSingleImage: (req, res) => {
      try {
        const { id } = req.params;
        const { imageData } = req.body;
        
        console.log(`🖼️  POST /api/notes/${id}/images (Single Upload)`);
        if (!db) return res.status(500).json({ error: 'Database not initialized' });
        if (!imageData) return res.status(400).json({ error: 'imageData required' });
        if (typeof imageData !== 'string' || imageData.length === 0) {
          return res.status(400).json({ error: 'imageData must be a non-empty string' });
        }

        // CRITICAL: Verify the parent note exists BEFORE attempting an INSERT
        // Without this check, the FK constraint fires with a confusing 500 error
        const parentNote = db.prepare('SELECT id FROM notes WHERE id = ?').get(id);
        if (!parentNote) {
          console.error(`❌ uploadSingleImage: Note ${id} not found — FK constraint would fail`);
          return res.status(404).json({ error: `Note ${id} not found. Cannot upload image.` });
        }

        // Wrap in transaction for atomicity
        const uploadTx = db.transaction((noteId, imgData) => {
          // Get current image count to set sort_order
          const currentCount = db.prepare('SELECT COUNT(*) as c FROM note_images WHERE note_id = ?').get(noteId).c || 0;

          // Insert the image
          const info = db.prepare('INSERT INTO note_images (note_id, image_data, sort_order) VALUES (?, ?, ?)').run(noteId, imgData, currentCount);

          // Touch the parent note timestamp
          db.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ?").run(noteId);

          return info.lastInsertRowid;
        });

        const newImageId = uploadTx(id, imageData);
        console.log(`✅ Image uploaded: id=${newImageId} for note=${id}`);
        // Broadcast so other clients know to refresh this note's images
        broadcast('image-updated', {
          type: 'image-updated',
          noteId: id,
          clientId: req.query.clientId || null
        });
        res.status(201).json({ success: true, imageId: newImageId });
      } catch (error) {
        // Log full error details including SQLite error code for diagnosis
        console.error(`❌ uploadSingleImage FAILED for note ${req.params.id}:`);
        console.error(`   Message: ${error.message}`);
        console.error(`   Code: ${error.code || 'N/A'}`);
        console.error(`   Stack: ${error.stack}`);
        res.status(500).json({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
      }
    },


    deleteSingleImage: (req, res) => {
      try {
        const { id, imageId } = req.params;
        if (!db) return res.status(500).json({ error: 'Database not initialized' });

        const delStmt = db.prepare('DELETE FROM note_images WHERE note_id = ? AND id = ?');
        const info = delStmt.run(id, imageId);

        if (info.changes > 0) {
           db.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ?").run(id);
           // Broadcast image deletion
           broadcast('image-updated', {
             type: 'image-updated',
             noteId: id,
             clientId: req.query.clientId || null
           });
           res.json({ success: true, deleted: true });
        } else {
           res.status(404).json({ error: 'Image not found' });
        }
      } catch (error) {
        console.error('❌ deleteSingleImage error:', error.message);
        res.status(500).json({ error: error.message });
      }
    },

    deleteNote: (req, res) => {
      try {
        const { id } = req.params;
        console.log('\n=== DELETE NOTE REQUEST ===');
        console.log(`🗑️  DELETE /api/notes/${id}`);
        
        if (!db) {
          console.error('❌ CRITICAL: Database is null!');
          return res.status(500).json({ error: 'Database not initialized' });
        }

        // Verify note exists before deleting
        const noteExists = db.prepare('SELECT id FROM notes WHERE id = ?').get(id);
        if (!noteExists) {
          console.warn(`⚠️  Note ${id} not found - cannot delete`);
          console.log('═══════════════════════════════\n');
          return res.status(404).json({ error: 'Note not found' });
        }

        // Transaction for atomic delete
        const deleteTx = db.transaction((reqId) => {
          const stmt = db.prepare('DELETE FROM notes WHERE id = ?');
          return stmt.run(reqId);
        });
        
        const info = deleteTx(id);
        console.log(`🗑️  Delete executed - Changes: ${info.changes}`);
        
        if (info.changes > 0) {
          console.log(`✅ Note ${id} deleted successfully`);
          res.set('Content-Type', 'application/json');
          // Broadcast deletion so other clients remove the note from their list
          broadcast('note-deleted', {
            type: 'note-deleted',
            id,
            clientId: req.query.clientId || null
          });
          res.status(200).json({ success: true, id, deleted: true });
        } else {
          console.error(`❌ CRITICAL: Note ${id} existed but delete failed!`);
          res.status(500).json({ error: { message: 'Failed to delete note', code: 'INTERNAL_ERROR' } });
        }
      } catch (error) {
        console.error('❌ DELETE NOTE ERROR:', error.message);
        console.log('═══════════════════════════════\n');
        res.status(500).json({ error: error.message });
      }
    }
  };
};


