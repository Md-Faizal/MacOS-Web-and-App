module.exports = function(db) {
  return {
    getEvents: (req, res) => {
      try {
        const stmt = db.prepare('SELECT * FROM calendar_events ORDER BY date ASC, time ASC');
        const events = stmt.all();
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getEventsByDateRange: (req, res) => {
      try {
        const { startDate, endDate } = req.params;
        const stmt = db.prepare('SELECT * FROM calendar_events WHERE date BETWEEN ? AND ? ORDER BY date ASC');
        const events = stmt.all(startDate, endDate);
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getEvent: (req, res) => {
      try {
        const { id } = req.params;
        const stmt = db.prepare('SELECT * FROM calendar_events WHERE id = ?');
        const event = stmt.get(id);
        if (!event) return res.status(404).json({ error: 'Event not found' });
        res.json(event);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    createEvent: (req, res) => {
      try {
        const { id, title, date, time, duration, description, category } = req.body;
        if (!title || !date) return res.status(400).json({ error: 'title and date required' });

        const stmt = db.prepare(`
          INSERT INTO calendar_events (id, title, date, time, duration, description, category, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);
        stmt.run(id, title, date, time || null, duration || null, description || null, category || null);
        res.json({ id, title, date, time, duration, description, category });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateEvent: (req, res) => {
      try {
        const { id } = req.params;
        const { title, date, time, duration, description, category } = req.body;

        const stmt = db.prepare(`
          UPDATE calendar_events SET 
            title = ?, 
            date = ?, 
            time = ?, 
            duration = ?,
            description = ?,
            category = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `);
        stmt.run(title, date, time, duration, description, category, id);

        const updated = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
        res.json(updated);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteEvent: (req, res) => {
      try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM calendar_events WHERE id = ?');
        stmt.run(id);
        res.json({ success: true, id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
};
