const assert = require('assert');
const DatabaseManager = require('../core/db/database-manager');
const calendarDepartment = require('../departments/calendar');

const db = DatabaseManager.initialize();
const calendar = calendarDepartment.create(db);
calendar.initializeDatabase();
const eventId = `calendar-contract-${Date.now()}`;
db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);

function invoke(handler, request) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
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
  const create = await invoke(calendar.service.createEvent, {
    body: {
      id: eventId,
      title: 'Calendar contract event',
      date: '2026-09-20',
      time: '10:30',
      duration: '60',
      description: 'Native department test',
      category: 'test'
    }
  });
  assert.strictEqual(create.statusCode, 200);
  assert.strictEqual(create.payload.id, eventId);

  const read = await invoke(calendar.service.getEvent, { params: { id: eventId } });
  assert.strictEqual(read.payload.title, 'Calendar contract event');

  const update = await invoke(calendar.service.updateEvent, {
    params: { id: eventId },
    body: {
      title: 'Updated calendar event',
      date: '2026-09-21',
      time: '11:00',
      duration: '30',
      description: 'Updated native department test',
      category: 'verified'
    }
  });
  assert.strictEqual(update.payload.title, 'Updated calendar event');
  assert.strictEqual(update.payload.date, '2026-09-21');

  const range = await invoke(calendar.service.getEventsByDateRange, {
    params: { startDate: '2026-09-20', endDate: '2026-09-22' }
  });
  assert.ok(range.payload.some(event => event.id === eventId));

  const remove = await invoke(calendar.service.deleteEvent, { params: { id: eventId } });
  assert.deepStrictEqual(remove.payload, { success: true, id: eventId });

  const missing = await invoke(calendar.service.getEvent, { params: { id: eventId } });
  assert.strictEqual(missing.statusCode, 404);
  console.log('Calendar department CRUD contract passed.');
})().finally(() => {
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
});
