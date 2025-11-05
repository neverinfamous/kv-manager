-- Namespace tracking
CREATE TABLE namespaces (
  namespace_id TEXT PRIMARY KEY,
  namespace_title TEXT NOT NULL,
  first_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Key metadata and tags
CREATE TABLE key_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  tags TEXT, -- JSON array of tags
  custom_metadata TEXT, -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(namespace_id, key_name)
);

CREATE INDEX idx_key_metadata_namespace ON key_metadata(namespace_id);
CREATE INDEX idx_key_metadata_search ON key_metadata(key_name);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace_id TEXT NOT NULL,
  key_name TEXT,
  operation TEXT NOT NULL, -- 'create', 'update', 'delete', 'bulk_delete', etc.
  user_email TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT -- JSON object with operation details
);

CREATE INDEX idx_audit_log_namespace ON audit_log(namespace_id, timestamp DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_email, timestamp DESC);

-- Bulk operation jobs (for tracking DO operations)
CREATE TABLE bulk_jobs (
  job_id TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL, -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  total_keys INTEGER,
  processed_keys INTEGER,
  error_count INTEGER,
  started_at DATETIME,
  completed_at DATETIME,
  user_email TEXT
);

CREATE INDEX idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);

