const express = require('express');
const { createCalendarService } = require('./service');
const createPermissions = require('../auth/engine/permissions');

function createCalendarRouter(db) {
  const router = express.Router();
  const service = createCalendarService(db);
  const permissions = createPermissions(db);

  router.get('/', permissions.requirePermission('calendar', 'can_view'), service.getEvents);
  router.post('/', permissions.requirePermission('calendar', 'can_create'), service.createEvent);
  router.get('/range/:startDate/:endDate', permissions.requirePermission('calendar', 'can_view'), service.getEventsByDateRange);
  router.get('/:id', permissions.requirePermission('calendar', 'can_view'), service.getEvent);
  router.put('/:id', permissions.requirePermission('calendar', 'can_edit'), service.updateEvent);
  router.delete('/:id', permissions.requirePermission('calendar', 'can_delete'), service.deleteEvent);

  return router;
}

module.exports = { createCalendarRouter };
