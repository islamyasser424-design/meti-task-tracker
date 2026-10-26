-- Migration 0001: MEEG Cloudflare D1 Optimization & Delta Sync Schema
-- Resolves /api/queues is_hidden error and enables lightweight cursor-based delta updates

-- 1. Fix missing is_hidden column in custom_queues
ALTER TABLE custom_queues ADD COLUMN is_hidden INTEGER DEFAULT 0;

-- 2. Add updated_at column to task_submissions for delta change tracking
ALTER TABLE task_submissions ADD COLUMN updated_at TEXT;

-- 3. Create tombstone table to track any deleted tasks for delta sync
CREATE TABLE IF NOT EXISTS deleted_tasks (
  task_id TEXT PRIMARY KEY,
  deleted_at TEXT DEFAULT (datetime('now'))
);

-- 4. High-performance covering indexes for delta sync and common filter queries
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON task_submissions(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_tasks_queue ON task_submissions(queue_name);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON task_submissions(source);
CREATE INDEX IF NOT EXISTS idx_tasks_pass ON task_submissions(pass);
CREATE INDEX IF NOT EXISTS idx_tasks_modality ON task_submissions(modality);

-- 5. Track Google Sheets sync telemetry & health status
CREATE TABLE IF NOT EXISTS sync_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync_time TEXT,
  new_rows_count INTEGER DEFAULT 0,
  updated_rows_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  error_message TEXT DEFAULT ''
);
INSERT OR IGNORE INTO sync_meta (id, last_sync_time, new_rows_count, updated_rows_count, status, error_message)
VALUES (1, datetime('now'), 0, 0, 'idle', '');
