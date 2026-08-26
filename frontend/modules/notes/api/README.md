# Notes App

A simple note-taking application with support for text and images.

## Overview

The Notes App provides basic CRUD operations for notes with optional image attachments.

## Endpoints

### List Notes
```
GET /api/notes
```

Returns all notes sorted by creation date (newest first).

### Get Single Note
```
GET /api/notes/:id
```

Returns a specific note by ID.

### Create Note
```
POST /api/notes
Content-Type: application/json

{
  "id": "note_123",
  "title": "Note Title",
  "content": "Note content text",
  "images": ["image1.jpg", "image2.png"]
}
```

### Update Note
```
PUT /api/notes/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content",
  "images": ["image1.jpg"]
}
```

### Delete Note
```
DELETE /api/notes/:id
```

## Data Structure

```
id           TEXT PRIMARY KEY
title        TEXT NOT NULL
content      TEXT
images_json  TEXT (JSON array)
created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Image Handling

Images are stored as a JSON array of filenames within the note:

```json
{
  "id": "note_123",
  "title": "My Note",
  "content": "Note content",
  "images_json": "[\"image1.jpg\", \"image2.png\"]"
}
```

When retrieved, the `images` field is automatically parsed from JSON.

## Example Usage

```javascript
// Create a note with images
const note = {
  id: "note_001",
  title: "Meeting Notes",
  content: "Discussion points from the meeting...",
  images: ["meeting-photo-1.jpg", "meeting-photo-2.jpg"]
};

// POST /api/notes

// Update note
const update = {
  title: "Meeting Notes - Revised",
  content: "Updated discussion points...",
  images: ["meeting-photo-1.jpg"]
};

// PUT /api/notes/note_001
```

## Features

- Create notes with title and content
- Attach multiple images to notes
- Update existing notes
- Delete notes
- Automatic timestamps
- Sorted retrieval

## Integration

Notes are stored in the shared database and accessible via simple REST endpoints. Images are referenced by filename within the notes.
