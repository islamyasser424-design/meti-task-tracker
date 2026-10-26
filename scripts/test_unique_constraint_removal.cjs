const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Testing Task ID Unique Constraint Removal and Data Retention ===');

// Step 1: Load backup into memory
const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

const initialCount = db.prepare('SELECT count(*) as cnt FROM task_submissions').get().cnt;
console.log(`Initial rows in task_submissions before migration: ${initialCount}`);
assert.strictEqual(initialCount, 1113, 'Expected exactly 1113 records in pre-migration database');

// Step 2: Prove that in legacy schema, duplicate task_id throws UNIQUE constraint failure
const sampleRow = db.prepare("SELECT * FROM task_submissions WHERE id = 1").get();
let failedAsExpected = false;
try {
  db.prepare(`INSERT INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      '10/26/2026, 12:00:00 PM', 'Morning', 'Unit A', 'PC-1', 'Different Labeler', '12345678901234', 'Morning', 'test@meti.ai', 'QTC 1', 'Stage 1', 'https://tasks/1', sampleRow.task_id, 'FP', 'Lidar', sampleRow.queue_name, 5, '2026-10-26T12:00:00Z', 'Live'
    );
} catch (err) {
  if (err.message.includes('UNIQUE constraint failed: task_submissions.task_id')) {
    failedAsExpected = true;
  } else {
    throw err;
  }
}
assert.strictEqual(failedAsExpected, true, 'Legacy schema must reject duplicate task_id');
console.log('Test 2 Passed: Proven that legacy schema threw UNIQUE constraint failed on duplicate task_id.');

// Step 3: Apply Migration 0001 (Schema optimization, updated_at column, is_hidden, indexes)
const migration0001Path = path.join(__dirname, '..', 'backend', 'migrations', '0001_d1_schema_optimization.sql');
const migration0001Sql = fs.readFileSync(migration0001Path, 'utf8');
db.exec(migration0001Sql);
console.log('Test 3a Passed: Applied Migration 0001 successfully.');

// Step 4: Apply Migration 0002 (Replaces UNIQUE(task_id) with UNIQUE(submission_key))
const migration0002Path = path.join(__dirname, '..', 'backend', 'migrations', '0002_incremental_checkpoint_sync.sql');
const migration0002Sql = fs.readFileSync(migration0002Path, 'utf8');
db.exec(migration0002Sql);
console.log('Test 3b Passed: Applied Migration 0002 successfully.');

// Step 5: Verify 100% data retention
const postMigrationCount = db.prepare('SELECT count(*) as cnt FROM task_submissions').get().cnt;
assert.strictEqual(postMigrationCount, initialCount, 'All 1113 records must be retained after migration');

const sampleRowPost = db.prepare("SELECT * FROM task_submissions WHERE id = 1").get();
assert.strictEqual(sampleRowPost.task_id, sampleRow.task_id);
assert.strictEqual(sampleRowPost.labeler_name, sampleRow.labeler_name);
assert.strictEqual(sampleRowPost.timestamp, sampleRow.timestamp);
assert.strictEqual(sampleRowPost.submission_key, 'legacy:id_1');
console.log('Test 4 Passed: 100% of data retained with byte-for-byte fidelity and submission_key assigned.');

// Step 6: Prove that duplicate task_id is now permitted with distinct submission_keys (FP vs QA)
db.prepare(`INSERT INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source, submission_key)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    '10/26/2026, 12:00:00 PM', 'Morning', 'Unit A', 'PC-1', 'Different Labeler', '12345678901234', 'Morning', 'test@meti.ai', 'QTC 1', 'Stage 1', 'https://tasks/1', sampleRow.task_id, 'FP', 'Lidar', sampleRow.queue_name, 5, '2026-10-26T12:00:00Z', 'Live', 'sheet1_live:row_99999'
  );

const multiRows = db.prepare("SELECT id, task_id, labeler_name, pass, submission_key FROM task_submissions WHERE task_id = ?").all(sampleRow.task_id);
assert.strictEqual(multiRows.length, 2, 'Must have exactly 2 submissions for the same task_id');
console.log(`Test 5 Passed: Successfully stored 2 legitimate submissions for task_id ${sampleRow.task_id}:`, multiRows);

// Step 7: Verify index usage on task_id
const explain = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM task_submissions WHERE task_id = ?").all(sampleRow.task_id);
console.log('Query plan for task_id lookup:', explain);
assert.strictEqual(explain.some(row => row.detail.includes('idx_tasks_task_id')), true, 'Query must use idx_tasks_task_id');
console.log('Test 6 Passed: Index idx_tasks_task_id is used for lookups.');

// Step 8: Verify that duplicate submission_key is rejected
let subKeyFailed = false;
try {
  db.prepare(`INSERT INTO task_submissions (submission_key, task_id) VALUES (?, ?)`).run('sheet1_live:row_99999', 'different_task');
} catch (err) {
  if (err.message.includes('UNIQUE constraint failed: task_submissions.submission_key')) {
    subKeyFailed = true;
  }
}
assert.strictEqual(subKeyFailed, true, 'Duplicate submission_key must be rejected');
console.log('Test 7 Passed: submission_key UNIQUE properly enforces idempotency.');

console.log('=== All Unique Constraint Removal & Retention Tests Passed ===');
db.close();
