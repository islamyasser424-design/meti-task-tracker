const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

console.log('=== Test: Lock Loss DURING Batch Execution and Atomic Fencing ===\n');

const db = new DatabaseSync(':memory:');

db.exec(`
CREATE TABLE sync_lock (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE sync_checkpoints (
  source_id TEXT PRIMARY KEY,
  last_synced_row INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE task_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  labeler_name TEXT,
  timestamp TEXT,
  pass TEXT,
  submission_key TEXT UNIQUE
);

INSERT INTO sync_checkpoints (source_id, last_synced_row) VALUES ('sheet1_live', 100);
`);

async function verifyLockOwnership(owner) {
  const nowIso = new Date().toISOString();
  const rows = db.prepare("SELECT locked_by FROM sync_lock WHERE lock_name = 'google_sheets_sync' AND locked_by = ? AND expires_at > ?").all(owner, nowIso);
  return rows && rows.length > 0;
}

// Atomic Fenced Checkpoint Update
function updateCheckpointFenced(sourceId, newRow, owner) {
  const nowIso = new Date().toISOString();
  const info = db.prepare(`
    UPDATE sync_checkpoints SET 
      last_synced_row = ?, 
      updated_at = ?
    WHERE source_id = ?
      AND EXISTS (
        SELECT 1 FROM sync_lock 
        WHERE lock_name = 'google_sheets_sync' 
          AND locked_by = ? 
          AND expires_at > ?
      )
  `).run(newRow, nowIso, sourceId, owner, nowIso);

  return info.changes > 0;
}

async function main() {
  // -----------------------------------------------------------------
  // Scenario: Worker 1 acquires lock, fetches batch, but LOSES lock mid-batch
  // -----------------------------------------------------------------
  console.log('1. Worker 1 acquires lock...');
  const now = new Date();
  const nowIso = now.toISOString();
  const expires1 = new Date(now.getTime() + 120000).toISOString();

  db.prepare("INSERT INTO sync_lock VALUES ('google_sheets_sync', 'worker-1', ?, ?)").run(nowIso, expires1);

  // Worker 1 fetches batch... (simulated delay where Worker 1 pauses)
  console.log('2. Simulating network pause where Worker 1 takes too long and lock expires...');
  // Lock expires:
  db.prepare("UPDATE sync_lock SET expires_at = ? WHERE locked_by = 'worker-1'").run(new Date(Date.now() - 1000).toISOString());

  // Worker 2 runs, purges expired lock, and acquires lock!
  console.log('3. Worker 2 runs and acquires the expired lock...');
  db.prepare("DELETE FROM sync_lock WHERE lock_name = 'google_sheets_sync' AND expires_at < ?").run(nowIso);
  const expires2 = new Date(Date.now() + 120000).toISOString();
  db.prepare("INSERT INTO sync_lock VALUES ('google_sheets_sync', 'worker-2', ?, ?)").run(nowIso, expires2);

  console.log('4. Worker 1 wakes up and attempts to commit the batch...');

  // Test 4a: Pre-insert lock verification
  const worker1StillOwned = await verifyLockOwnership('worker-1');
  console.log('   Worker 1 verifyLockOwnership result:', worker1StillOwned);
  assert.strictEqual(worker1StillOwned, false, "Worker 1 must detect that it lost lock before inserting tasks");

  // Test 4b: Even if Worker 1 bypassed the check and tried to advance checkpoint:
  console.log('5. Worker 1 attempts atomic fenced checkpoint update...');
  const checkpointAdvanced = updateCheckpointFenced('sheet1_live', 110, 'worker-1');
  console.log('   Fenced checkpoint update success:', checkpointAdvanced);
  assert.strictEqual(checkpointAdvanced, false, "Checkpoint update MUST fail (0 rows updated) because Worker 1 lost the lock");

  // Verify checkpoint remained at 100
  const finalCheckpoint = db.prepare("SELECT last_synced_row FROM sync_checkpoints WHERE source_id = 'sheet1_live'").get().last_synced_row;
  console.log('   Final checkpoint in database:', finalCheckpoint);
  assert.strictEqual(finalCheckpoint, 100, "Checkpoint must remain strictly at 100 without being corrupted");

  console.log('\n=== MID-BATCH FENCING TEST PASSED 100%: Worker 1 strictly blocked from corrupting database ===');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
