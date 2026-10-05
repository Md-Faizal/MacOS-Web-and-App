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
            end_date TEXT,
            end_time TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        const columns = new Set(db.pragma('table_info(calendar_events)').map(column => column.name));
        if (!columns.has('end_date')) db.exec('ALTER TABLE calendar_events ADD COLUMN end_date TEXT');
        if (!columns.has('end_time')) db.exec('ALTER TABLE calendar_events ADD COLUMN end_time TEXT');
      },
      getDatabase() {
        return db;
      }
    };
  }
};