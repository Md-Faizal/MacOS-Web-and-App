CREATE TABLE analytics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  metric_name TEXT,
  metric_value TEXT,
  metric_json TEXT,
  period TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)