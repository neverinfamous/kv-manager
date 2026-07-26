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
  current_key TEXT, -- Currently processing key name
  percentage REAL DEFAULT 0, -- Progress percentage (0-100)
  started_at DATETIME,
  completed_at DATETIME,
  user_email TEXT,
  metadata TEXT -- JSON object for operation-specific data (e.g., namespace IDs for batch operations)
);

CREATE INDEX idx_bulk_jobs_status ON bulk_jobs(status, started_at DESC);

-- Job audit events (for tracking job lifecycle events)
CREATE TABLE job_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'started', 'progress_25', 'progress_50', 'progress_75', 'completed', 'failed', 'cancelled'
  user_email TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON object with event-specific data (processed_keys, error_count, percentage, error_message, etc.)
  FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
);


CREATE INDEX idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
CREATE INDEX idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

-- Webhooks for external notifications
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhooks_enabled ON webhooks(enabled);

-- Namespace colors for visual organization
CREATE TABLE namespace_colors (
  namespace_id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX idx_namespace_colors_updated ON namespace_colors(updated_at DESC);

-- Key colors for visual organization
CREATE TABLE key_colors (
  namespace_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  color TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  PRIMARY KEY (namespace_id, key_name)
);

CREATE INDEX idx_key_colors_namespace ON key_colors(namespace_id);
CREATE INDEX idx_key_colors_updated ON key_colors(updated_at DESC);

-- Monitoring threshold configuration per namespace
CREATE TABLE monitoring_thresholds (
  namespace_id TEXT PRIMARY KEY,
  storage_bytes_threshold INTEGER,
  operation_rate_threshold INTEGER,
  latency_p99_threshold_ms REAL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX idx_monitoring_thresholds_enabled ON monitoring_thresholds(enabled);

-- Monitoring state tracking for alert cooldown and breach detection
CREATE TABLE monitoring_state (
  namespace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  consecutive_failures INTEGER DEFAULT 0,
  is_breached INTEGER DEFAULT 0,
  last_alert_at DATETIME,
  last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (namespace_id, event_type)
);

