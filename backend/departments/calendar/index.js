const { createCalendarService } = require('./service');
const { createCalendarRouter } = require('./routes');

module.exports = {
  name: 'calendar',
  namespace: 'calendar',
  path: __dirname,
  description: 'Calendar event and date-range scheduling domain',
  adapterPaths: [],
  ownedResponsibilities: ['events', 'date-ranges', 'calendar-health'],
  create(db) {
    if (!db) throw new TypeError('Calendar department requires a database');
    return {
      name: 'calendar',
      compatibilityEngine: false,
      service: createCalendarService(db),
      router: createCalendarRouter(db),
      initializeDatabase() {
        db.exec(`
          CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT,
            duration TEXT,
            description TEXT,
            category TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
      },
      getDatabase() {
        return db;
      }
    };
  }
};