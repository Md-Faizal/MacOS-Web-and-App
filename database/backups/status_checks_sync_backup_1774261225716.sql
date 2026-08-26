CREATE TABLE status_checks (
  id TEXT PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  details TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
)