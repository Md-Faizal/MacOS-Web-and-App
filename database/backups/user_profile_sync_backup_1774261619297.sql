CREATE TABLE "user_profile" (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  email_id TEXT,
  profile_picture TEXT, -- Base64 encoded image or path
  google_id TEXT UNIQUE,
  google_email TEXT,
  google_name TEXT,
  google_picture TEXT,
  name_source TEXT DEFAULT 'local',
  picture_source TEXT DEFAULT 'local',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id) REFERENCES auth_credentials(id) ON DELETE CASCADE
)