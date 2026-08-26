# Calendar App

Event calendar and scheduling system for managing dates, times, and events.

## Overview

The Calendar App provides event management with date and time tracking, categories, and date range queries.

## Endpoints

### List All Events
```
GET /api/calendar
```

Returns all events sorted by date and time.

### Get Events by Date Range
```
GET /api/calendar/range/:startDate/:endDate
```

Returns events within a specific date range (inclusive).

Parameters:
- startDate: YYYY-MM-DD
- endDate: YYYY-MM-DD

### Get Single Event
```
GET /api/calendar/:id
```

### Create Event
```
POST /api/calendar
Content-Type: application/json

{
  "id": "event_123",
  "title": "Event Title",
  "date": "2024-02-15",
  "time": "10:30",
  "duration": "1 hour",
  "description": "Event description",
  "category": "Meeting"
}
```

### Update Event
```
PUT /api/calendar/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "date": "2024-02-15",
  "time": "14:00",
  "duration": "2 hours",
  "description": "Updated description",
  "category": "Meeting"
}
```

### Delete Event
```
DELETE /api/calendar/:id
```

## Data Structure

```
id           TEXT PRIMARY KEY
title        TEXT NOT NULL
date         DATE NOT NULL
time         TIME
duration     TEXT
description  TEXT
category     TEXT
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Date/Time Format

- **Date**: YYYY-MM-DD (ISO 8601)
- **Time**: HH:MM (24-hour format)
- **Duration**: Human readable string (e.g., "1 hour", "30 minutes")

## Example Usage

```javascript
// Create event
const event = {
  id: "event_001",
  title: "Team Standup",
  date: "2024-02-15",
  time: "10:30",
  duration: "30 minutes",
  description: "Daily team synchronization",
  category: "Work"
};

// POST /api/calendar

// Get events for a week
// GET /api/calendar/range/2024-02-12/2024-02-18

// Update event
const update = {
  title: "Team Standup - Updated",
  date: "2024-02-16",
  time: "11:00",
  duration: "30 minutes",
  description: "Rescheduled standup",
  category: "Work"
};

// PUT /api/calendar/event_001
```

## Categories

Recommended event categories:
- Work
- Personal
- Meeting
- Reminder
- Birthday
- Holiday
- Social
- Health

## Features

- Create events with date and time
- Set duration for events
- Categorize events
- Add descriptions
- Query events by date range
- Sort by date and time
- Update event details
- Delete events

## Practical Use Cases

1. **Meeting Scheduling** - Track all meetings with specific times
2. **Event Planning** - Manage dates and durations for events
3. **Task Scheduling** - Schedule tasks with specific times
4. **Birthday/Holiday Tracking** - Remember important dates
5. **Deadline Management** - Track project deadlines

## Integration

Events are stored in the shared database and sorted chronologically. Date range queries enable efficient calendar views and schedule planning.
