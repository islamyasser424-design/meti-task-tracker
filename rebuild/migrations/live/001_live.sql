-- ONLY new-database / isolated staging. Never run legacy D1 migrations here.
-- Additive, prefixed tables: no legacy tables are altered or dropped.
CREATE TABLE IF NOT EXISTS meti_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('operator','supervisor','admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  auth_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS meti_live_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  opened_at TEXT NOT NULL,
  archive_boundary_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(archive_boundary_confirmed IN (0,1))
);
INSERT OR IGNORE INTO meti_live_config(id,opened_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS meti_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL REFERENCES meti_users(id),
  labeler_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  business_key TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  work_date TEXT NOT NULL,
  shift TEXT NOT NULL,
  unit TEXT NOT NULL,
  pc_no TEXT NOT NULL,
  qtc_name TEXT NOT NULL DEFAULT '',
  task_link TEXT NOT NULL,
  task_id TEXT NOT NULL,
  pass TEXT NOT NULL CHECK(pass IN ('FP','QA')),
  stage TEXT NOT NULL,
  modality TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  object_count INTEGER NOT NULL CHECK(object_count BETWEEN 0 AND 1000000),
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS meti_tasks_owner_id ON meti_tasks(owner_id,id);
CREATE TABLE IF NOT EXISTS meti_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task_pk INTEGER NOT NULL UNIQUE REFERENCES meti_tasks(id),
  owner_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation='insert')
);
CREATE INDEX IF NOT EXISTS meti_changes_owner_seq ON meti_changes(owner_id,seq);
CREATE TABLE IF NOT EXISTS meti_report_totals (
  scope TEXT PRIMARY KEY,
  task_count INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO meti_report_totals(scope) VALUES('all');
CREATE TABLE IF NOT EXISTS meti_report_daily (
  scope TEXT NOT NULL,
  work_date TEXT NOT NULL,
  task_count INTEGER NOT NULL,
  object_count INTEGER NOT NULL,
  PRIMARY KEY(scope,work_date)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS meti_task_insert AFTER INSERT ON meti_tasks BEGIN
  INSERT INTO meti_changes(task_pk,owner_id,operation) VALUES(NEW.id,NEW.owner_id,'insert');
  INSERT INTO meti_report_totals(scope,task_count,object_count,version)
    VALUES('all',1,NEW.object_count,last_insert_rowid())
    ON CONFLICT(scope) DO UPDATE SET task_count=task_count+1,
      object_count=object_count+excluded.object_count,version=excluded.version;
  INSERT INTO meti_report_totals(scope,task_count,object_count,version)
    VALUES('user:'||NEW.owner_id,1,NEW.object_count,(SELECT seq FROM meti_changes WHERE task_pk=NEW.id))
    ON CONFLICT(scope) DO UPDATE SET task_count=task_count+1,
      object_count=object_count+excluded.object_count,version=excluded.version;
  INSERT INTO meti_report_daily(scope,work_date,task_count,object_count)
    VALUES('all',NEW.work_date,1,NEW.object_count)
    ON CONFLICT(scope,work_date) DO UPDATE SET task_count=task_count+1,object_count=object_count+excluded.object_count;
  INSERT INTO meti_report_daily(scope,work_date,task_count,object_count)
    VALUES('user:'||NEW.owner_id,NEW.work_date,1,NEW.object_count)
    ON CONFLICT(scope,work_date) DO UPDATE SET task_count=task_count+1,object_count=object_count+excluded.object_count;
END;
-- This first vertical slice is append-only, including for DB maintenance accounts.
CREATE TRIGGER IF NOT EXISTS meti_tasks_no_update BEFORE UPDATE ON meti_tasks BEGIN
  SELECT RAISE(ABORT,'METI tasks are append-only');
END;
CREATE TRIGGER IF NOT EXISTS meti_tasks_no_delete BEFORE DELETE ON meti_tasks BEGIN
  SELECT RAISE(ABORT,'METI tasks are append-only');
END;
