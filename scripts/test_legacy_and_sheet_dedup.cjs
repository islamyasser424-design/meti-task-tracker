const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Test: Cross-Source Deduplication & Legitimate Multi-Submission Preservation ===\n');

const db = new DatabaseSync(':memory:');

// Execute migrations to set up schema
const backupSql = fs.readFileSync(path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql'), 'utf8');
db.exec(backupSql);

// Custom Migration 0002 logic with deterministic content key
db.exec(`
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

-- Populate submission_key deterministically from content fingerprint
INSERT INTO task_submissions_v2 (id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, task_link, task_id, pass, modality, queue_name, object_count, stage, created_at, updated_at, source, submission_key)
SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, task_link, task_id, pass, modality, queue_name, object_count, stage, created_at, created_at, source,
  'sub:' || task_id || '|' || labeler_name || '|' || timestamp || '|' || COALESCE(pass, '')
FROM task_submissions;

DROP TABLE task_submissions;
ALTER TABLE task_submissions_v2 RENAME TO task_submissions;

CREATE INDEX idx_tasks_task_id ON task_submissions(task_id);
CREATE UNIQUE INDEX idx_tasks_sub_key ON task_submissions(submission_key);
`);

console.log('Migration completed with deterministic submission keys.');

// Scenario 1: Existing legacy row in D1: Kerolos Hany (id 3193, task_id 1466329775)
const legacyRow = db.prepare("SELECT * FROM task_submissions WHERE task_id = '1466329775'").get();
console.log('Legacy row in D1:', { id: legacyRow.id, task_id: legacyRow.task_id, labeler: legacyRow.labeler_name, key: legacyRow.submission_key });

// Now, simulate a sync or backfill from Google Sheet that encounters Kerolos Hany's row:
// The sync script derives the submission key using the exact same formula:
function getSubmissionKey(tid, lab, ts, pass) {
  return `sub:${tid}|${lab}|${ts}|${pass || ''}`;
}

const syncKeyForKerolos = getSubmissionKey(legacyRow.task_id, legacyRow.labeler_name, legacyRow.timestamp, legacyRow.pass);
console.log('Sync computed key for Kerolos:', syncKeyForKerolos);
assert.strictEqual(syncKeyForKerolos, legacyRow.submission_key, "Keys must match perfectly!");

// Attempt to insert this row from sheet via INSERT OR IGNORE
const insertResult = db.prepare(`INSERT OR IGNORE INTO task_submissions 
  (timestamp, labeler_name, task_id, pass, submission_key, source) 
  VALUES (?, ?, ?, ?, ?, 'Live')`).run(
    legacyRow.timestamp, legacyRow.labeler_name, legacyRow.task_id, legacyRow.pass, syncKeyForKerolos
  );

console.log('Insert changes for duplicate row:', insertResult.changes);
assert.strictEqual(insertResult.changes, 0, "Duplicate insert must be ignored (0 rows inserted)");

const rowsCountAfterDuplicate = db.prepare("SELECT count(*) as cnt FROM task_submissions WHERE task_id = '1466329775'").get().cnt;
assert.strictEqual(rowsCountAfterDuplicate, 1, "Must still have exactly 1 record for Kerolos");
console.log('Test 1 Passed: Duplicate row from sheet ignored, zero duplicate created!');

// Scenario 2: A different legitimate submission for the same task_id (e.g. QA review by an auditor)
const qaKey = getSubmissionKey(legacyRow.task_id, 'Sarah Auditor', '10/26/2026, 5:30:00 PM', 'QA');
const qaInsert = db.prepare(`INSERT OR IGNORE INTO task_submissions 
  (timestamp, labeler_name, task_id, pass, submission_key, source) 
  VALUES (?, ?, ?, ?, ?, 'Live')`).run(
    '10/26/2026, 5:30:00 PM', 'Sarah Auditor', legacyRow.task_id, 'QA', qaKey
  );

console.log('Insert changes for legitimate QA review:', qaInsert.changes);
assert.strictEqual(qaInsert.changes, 1, "Legitimate multi-submission must be inserted");

const multiSubmissions = db.prepare("SELECT id, task_id, labeler_name, pass, submission_key FROM task_submissions WHERE task_id = '1466329775'").all();
console.log('Submissions for task 1466329775 now:', multiSubmissions);
assert.strictEqual(multiSubmissions.length, 2, "Must have both legitimate submissions preserved!");
console.log('Test 2 Passed: Multiple legitimate submissions for the same Task ID preserved!');

console.log('\n=== ALL DEDUPLICATION & MULTI-SUBMISSION TESTS PASSED 100% ===');
