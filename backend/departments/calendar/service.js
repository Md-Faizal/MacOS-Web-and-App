const dataBus = require('../../core/sync/data-bus');

function createCalendarService(db) {
  return {
    getEvents(req, res) {
      try {
        const events = db.prepare('SELECT * FROM calendar_events ORDER BY date ASC, time ASC').all();
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getEventsByDateRange(req, res) {
      try {
        const { startDate, endDate } = req.params;
        const events = db.prepare('SELECT * FROM calendar_events WHERE date BETWEEN ? AND ? ORDER BY date ASC').all(startDate, endDate);
        res.json(events);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getEvent(req, res) {
      try {
        const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found' });
        res.json(event);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    createEvent(req, res) {
      try {
        const { id, title, date, time, duration, description, category, end_date, end_time } = req.body;
        if (!title || !date) return res.status(400).json({ error: 'title and date required' });

        db.prepare(`
          INSERT INTO calendar_events (id, title, date, time, duration, description, category, end_date, end_time, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(id, title, date, time || null, duration || null, description || null, category || null, end_date || date, end_time || null);
        const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
        dataBus.broadcast('calendar:event', 'created', { id });
        res.json(event);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    updateEvent(req, res) {
      try {
        const { title, date, time, duration, description, category, end_date, end_time } = req.body;
        db.prepare(`
          UPDATE calendar_events SET
            title = ?, date = ?, time = ?, duration = ?, description = ?, category = ?, end_date = ?, end_time = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(title, date, time, duration, description, category, end_date || date, end_time || null, req.params.id);
        const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(req.params.id);
        if (event) dataBus.broadcast('calendar:event', 'updated', { id: req.params.id });
        res.json(event);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    deleteEvent(req, res) {
      try {
        const result = db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
        if (result.changes > 0) dataBus.broadcast('calendar:event', 'deleted', { id: req.params.id });
        res.json({ success: true, id: req.params.id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
}

module.exports = { createCalendarService };
