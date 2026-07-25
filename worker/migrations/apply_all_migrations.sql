-- Combined Migration Script
-- Date: 2025-11-13
-- Description: Applies all migrations required for the latest version of KV Manager
-- This script is idempotent and safe to run multiple times

-- ============================================================================
-- Migration 001: Add job_audit_events table
-- ============================================================================

-- Create job_audit_events table for tracking job lifecycle events
CREATE TABLE IF NOT EXISTS job_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'started', 'progress_25', 'progress_50', 'progress_75', 'completed', 'failed', 'cancelled'
  user_email TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON object with event-specific data (processed_keys, error_count, percentage, error_message, etc.)
  FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

-- ============================================================================
-- Migration 002: Add progress tracking columns to bulk_jobs
-- ============================================================================

-- Note: SQLite will error if columns already exist, but that's safe to ignore
-- Add current_key column (stores the currently processing key name)
ALTER TABLE bulk_jobs ADD COLUMN current_key TEXT;

-- Add percentage column (stores progress percentage 0-100)
ALTER TABLE bulk_jobs ADD COLUMN percentage REAL DEFAULT 0;

-- ============================================================================
-- Migration 003: Add metadata column to bulk_jobs
-- ============================================================================

-- Add metadata column (stores job-specific metadata in JSON format)
-- Used for batch operations to store array of namespace IDs and other operation-specific data
ALTER TABLE bulk_jobs ADD COLUMN metadata TEXT;

-- ============================================================================
-- Migration 007: Add monitoring threshold tables
-- ============================================================================

-- Monitoring threshold configuration per namespace
CREATE TABLE IF NOT EXISTS monitoring_thresholds (
  namespace_id TEXT PRIMARY KEY,
  storage_bytes_threshold INTEGER,
  operation_rate_threshold INTEGER,
  latency_p99_threshold_ms REAL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitoring_thresholds_enabled ON monitoring_thresholds(enabled);

-- Monitoring state tracking for alert cooldown and breach detection
CREATE TABLE IF NOT EXISTS monitoring_state (
  namespace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  consecutive_failures INTEGER DEFAULT 0,
  is_breached INTEGER DEFAULT 0,
  last_alert_at DATETIME,
  last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (namespace_id, event_type)
);


