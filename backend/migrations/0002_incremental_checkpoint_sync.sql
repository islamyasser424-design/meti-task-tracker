-- Migration 0002: Persistent Source Checkpoints, Distributed Locking & Legitimate Multi-Response Preservation
-- Replaces restrictive UNIQUE(task_id) with UNIQUE(submission_key) to preserve legitimate multiple submissions per task

-- 1. Create Persistent Source Checkpoints Table
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  source_id TEXT PRIMARY KEY,               -- e.g. 'sheet1_live', 'sheet2_daily'
  spreadsheet_id TEXT NOT NULL,
  gid TEXT DEFAULT '0',
  last_synced_row INTEGER DEFAULT 0,       -- 0-based offset or row number in Google Sheet
  last_synced_timestamp TEXT,              -- timestamp text of the last successfully synced row
  last_synced_fingerprint TEXT,            -- signature of the last successfully synced row
  total_source_rows INTEGER DEFAULT 0,     -- total rows reported by sheet on last cycle
  status TEXT DEFAULT 'idle',               -- 'idle', 'in_progress', 'success', 'error'
  error_message TEXT DEFAULT '',
  consecutive_failures INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  last_success_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Initialize checkpoints for the active sheets (Setting baseline to proven existing saved rows)
INSERT OR IGNORE INTO sync_checkpoints (source_id, spreadsheet_id, gid, last_synced_row, status)
VALUES ('sheet1_live', '1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I', '0', 62327, 'idle');

INSERT OR IGNORE INTO sync_checkpoints (source_id, spreadsheet_id, gid, last_synced_row, status)
VALUES ('sheet2_daily', '1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A', '0', 588, 'idle');

-- 2. Create Distributed Database Lock Table
CREATE TABLE IF NOT EXISTS sync_lock (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,                  -- identifier e.g. 'cron:scheduled', 'manual:admin'
  acquired_at TEXT NOT NULL,                -- ISO timestamp
  expires_at TEXT NOT NULL                  -- ISO timestamp
);

-- 3. Migrate task_submissions to allow multiple legitimate responses per task_id
-- Replaces UNIQUE(task_id) with indexed task_id and UNIQUE(submission_key)
CREATE TABLE IF NOT EXISTS task_submissions_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  shift TEXT,
  unit TEXT,
  pc_no TEXT,
  labeler_name TEXT,
  national_id TEXT,
  qtc_shift TEXT,
  yubikey_email TEXT,
  qtc_name TEXT,
  task_link TEXT,
  task_id TEXT,
  pass TEXT,
  modality TEXT,
  queue_name TEXT,
  object_count INTEGER DEFAULT 0,
  stage TEXT,
  created_at TEXT,
  updated_at TEXT,
  source TEXT DEFAULT 'Live',
  submission_key TEXT UNIQUE
);

INSERT INTO task_submissions_v2 (id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, task_link, task_id, pass, modality, queue_name, object_count, stage, created_at, updated_at, source, submission_key)
SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, task_link, task_id, pass, modality, queue_name, object_count, stage, created_at, updated_at, source, 'sub:' || COALESCE(task_id, id) || '|' || COALESCE(labeler_name, '') || '|' || COALESCE(timestamp, created_at, id) || '|' || COALESCE(pass, '')
FROM task_submissions;

DROP TABLE task_submissions;
ALTER TABLE task_submissions_v2 RENAME TO task_submissions;

-- Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_timestamp ON task_submissions(timestamp);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON task_submissions(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_tasks_labeler ON task_submissions(labeler_name);
CREATE INDEX IF NOT EXISTS idx_tasks_shift ON task_submissions(shift);
CREATE INDEX IF NOT EXISTS idx_tasks_queue ON task_submissions(queue_name);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON task_submissions(source);
CREATE INDEX IF NOT EXISTS idx_tasks_pass ON task_submissions(pass);
CREATE INDEX IF NOT EXISTS idx_tasks_modality ON task_submissions(modality);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_submission_key ON task_submissions(submission_key);
