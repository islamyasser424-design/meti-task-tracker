-- MEEG High-Performance Cloudflare D1 Schema with Comprehensive Indexing

CREATE TABLE IF NOT EXISTS dashboard_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'labeler',
  created_at TEXT,
  allowed_pages TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  recovery_pin TEXT,
  reset_status TEXT DEFAULT 'none',
  reset_code TEXT DEFAULT '',
  reset_requested_at TEXT DEFAULT '',
  email TEXT
);

CREATE TABLE IF NOT EXISTS task_submissions (
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
  task_id TEXT UNIQUE,
  pass TEXT,
  modality TEXT,
  queue_name TEXT,
  object_count INTEGER DEFAULT 0,
  stage TEXT,
  created_at TEXT,
  source TEXT DEFAULT 'Live'
);

CREATE TABLE IF NOT EXISTS archive_2025 (
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
  stage TEXT,
  task_link TEXT,
  task_id TEXT UNIQUE,
  pass TEXT,
  modality TEXT,
  queue_name TEXT,
  object_count INTEGER DEFAULT 0,
  created_at TEXT,
  source TEXT DEFAULT 'Archive 2025'
);

CREATE TABLE IF NOT EXISTS archive_2026 (
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
  stage TEXT,
  task_link TEXT,
  task_id TEXT UNIQUE,
  pass TEXT,
  modality TEXT,
  queue_name TEXT,
  object_count INTEGER DEFAULT 0,
  created_at TEXT,
  source TEXT DEFAULT 'Archive 2026'
);

CREATE TABLE IF NOT EXISTS custom_queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  highlight INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_qtc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  shift TEXT NOT NULL,
  role TEXT DEFAULT 'QTC',
  created_at TEXT
);

-- Crucial Indexes to prevent Full Table Scans and keep Row Reads under 1 row per query
CREATE INDEX IF NOT EXISTS idx_users_username ON dashboard_users(username);
CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_timestamp ON task_submissions(timestamp);
CREATE INDEX IF NOT EXISTS idx_tasks_labeler ON task_submissions(labeler_name);
CREATE INDEX IF NOT EXISTS idx_tasks_shift ON task_submissions(shift);
CREATE INDEX IF NOT EXISTS idx_a25_task_id ON archive_2025(task_id);
CREATE INDEX IF NOT EXISTS idx_a26_task_id ON archive_2026(task_id);
