const createDesktopRouter = require('./routes');
const createClockRouter = require('../../core/widgets/clock');
const createWeatherRouter = require('../../core/widgets/weather-settings');
const createQuickNotesRouter = require('../../core/widgets/quick-notes');
const createRemindersRouter = require('../../core/widgets/reminders');

module.exports = {
  name: 'desktop',
  namespace: 'desktop',
  path: __dirname,
  description: 'Desktop state, widgets, preferences, and workspace runtime domain',
  adapterPaths: [
    '../../core/widgets/clock.js',
    '../../core/widgets/weather-settings.js',
    '../../core/widgets/quick-notes.js',
    '../../core/widgets/reminders.js'
  ],
  ownedResponsibilities: ['desktop-state', 'clock', 'weather', 'quick-notes', 'reminders'],
  create(db, authMiddleware) {
    return {
      router: createDesktopRouter(db, authMiddleware),
      clockRouter: createClockRouter(db, authMiddleware),
      weatherRouter: createWeatherRouter(db, authMiddleware),
      quickNotesRouter: createQuickNotesRouter(db, authMiddleware),
      remindersRouter: createRemindersRouter(db, authMiddleware)
    };
  }
};
