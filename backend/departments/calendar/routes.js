const express = require('express');
const { createCalendarService } = require('./service');

function createCalendarRouter(db) {
  const router = express.Router();
  const service = createCalendarService(db);

  router.get('/', (req, res) => {
    res.json({ status: 'running', name: 'Calendar App' });
  });
  router.get('/', service.getEvents);
  router.post('/', service.createEvent);
  router.get('/range/:startDate/:endDate', service.getEventsByDateRange);
  router.get('/:id', service.getEvent);
  router.put('/:id', service.updateEvent);
  router.delete('/:id', service.deleteEvent);

  return router;
}

module.exports = { createCalendarRouter };
