-- Apply separately to archive-2025 AND archive-2026. Raw source tables are
-- created by the importer with c001..cNNN in original column order, all TEXT.
CREATE TABLE IF NOT EXISTS meti_archive_sources (
  source_id TEXT PRIMARY KEY,
  page_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL UNIQUE,
  column_count INTEGER NOT NULL,
  expected_rows INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('importing','complete')),
  mapping_json TEXT,
  mapping_sha256 TEXT,
  dataset_start TEXT,
  dataset_end TEXT,
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS meti_archive_columns (
  source_id TEXT NOT NULL REFERENCES meti_archive_sources(source_id),
  ordinal INTEGER NOT NULL,
  technical_name TEXT NOT NULL,
  original_header TEXT NOT NULL,
  PRIMARY KEY(source_id,ordinal),
  UNIQUE(source_id,technical_name)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meti_archive_summary (
  source_id TEXT PRIMARY KEY REFERENCES meti_archive_sources(source_id),
  raw_rows INTEGER NOT NULL,
  task_count INTEGER,
  object_count INTEGER,
  metric_version TEXT,
  built_at TEXT NOT NULL
);
