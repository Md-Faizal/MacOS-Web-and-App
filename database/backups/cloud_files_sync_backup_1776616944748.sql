CREATE TABLE "cloud_files" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  path TEXT NOT NULL,
  space TEXT DEFAULT 'personal',
  share_token TEXT UNIQUE,
  share_password TEXT,
  share_expires_at DATETIME,
  shared_at DATETIME,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, share_download_limit INTEGER, share_download_count INTEGER DEFAULT 0, thumbnail_path TEXT)