-- Migration: Add current_key and percentage columns to bulk_jobs
-- Description: Add progress tracking columns that were missing from production

ALTER TABLE bulk_jobs ADD COLUMN current_key TEXT;
ALTER TABLE bulk_jobs ADD COLUMN percentage REAL DEFAULT 0;

