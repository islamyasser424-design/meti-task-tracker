const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

console.log('=== Behavioral Test: Lock Expiry, Contention, and Ownership Loss ===');

const db = new DatabaseSync(':memory:');

// Create tables
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
`);

// Implement exact backend functions
async function runQuery(sql, params = []) {
  const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql);
  if (isSelect) {
    return db.prepare(sql).all(...params);
  } else {
    return db.prepare(sql).run(...params);
  }
}

const mockEnv = {
  DB: {
    prepare: (sql) => ({
      bind: (...params) => ({
        all: async () => ({ results: db.prepare(sql).all(...params) }),
        run: async () => db.prepare(sql).run(...params)
      }),
      all: async () => ({ results: db.prepare(sql).all() }),
      run: async () => db.prepare(sql).run()
    })
  }
};

async function acquireLock(owner, ttlSeconds) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  // 1. Purge expired locks
  db.prepare("DELETE FROM sync_lock WHERE lock_name = ? AND expires_at < ?").run("google_sheets_sync", nowIso);

  // 2. Try to acquire
  try {
    db.prepare("INSERT INTO sync_lock (lock_name, locked_by, acquired_at, expires_at) VALUES (?, ?, ?, ?)").run("google_sheets_sync", owner, nowIso, expires);
    return { acquired: true, owner };
  } catch (err) {
    return { acquired: false, reason: "Lock currently held by another runner" };
  }
}

async function verifyLock(owner) {
  const nowIso = new Date().toISOString();
  const rows = db.prepare("SELECT locked_by, expires_at FROM sync_lock WHERE lock_name = ? AND locked_by = ? AND expires_at > ?").all("google_sheets_sync", owner, nowIso);
  return rows && rows.length > 0;
}

async function renewLock(owner, extendSeconds = 120) {
  const now = new Date();
  const newExpires = new Date(now.getTime() + extendSeconds * 1000).toISOString();
  const nowIso = now.toISOString();
  const info = db.prepare("UPDATE sync_lock SET expires_at = ? WHERE lock_name = ? AND locked_by = ? AND expires_at > ?").run(newExpires, "google_sheets_sync", owner, nowIso);
  return info.changes > 0;
}

async function releaseLock(owner) {
  db.prepare("DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?").run("google_sheets_sync", owner);
}

async function main() {
  // -------------------------------------------------------------
  // Test Scenario 1: Worker 1 acquires lock, Worker 2 is rejected
  // -------------------------------------------------------------
  console.log('\n--- Scenario 1: Active lock prevents concurrent execution ---');
  const lock1 = await acquireLock('worker-1', 120);
  assert.strictEqual(lock1.acquired, true, 'Worker 1 must acquire the lock');

  const lock2 = await acquireLock('worker-2', 120);
  assert.strictEqual(lock2.acquired, false, 'Worker 2 must be rejected while lock is active');
  console.log('Passed: Worker 2 was safely rejected while Worker 1 held lock.');

  // -------------------------------------------------------------
  // Test Scenario 2: Worker 1 takes > 120s (simulated by setting expiry in past)
  // Worker 2 acquires lock; Worker 1 attempts to commit and is blocked
  // -------------------------------------------------------------
  console.log('\n--- Scenario 2: Lock expires; Worker 2 acquires; Worker 1 is fenced from advancing ---');
  // Simulate 120s passing: update expires_at to 1 second in the past
  const pastDate = new Date(Date.now() - 5000).toISOString();
  db.prepare("UPDATE sync_lock SET expires_at = ? WHERE locked_by = 'worker-1'").run(pastDate);

  // Worker 2 tries to run
  const lock2AfterExpiry = await acquireLock('worker-2', 120);
  assert.strictEqual(lock2AfterExpiry.acquired, true, 'Worker 2 must acquire expired lock');
  console.log('Worker 2 successfully acquired expired lock.');

  // Worker 1 now attempts to verify lock before advancing checkpoint
  const worker1StillOwned = await verifyLock('worker-1');
  assert.strictEqual(worker1StillOwned, false, 'Worker 1 must detect that it lost lock ownership');

  let worker1AdvancedCheckpoint = false;
  if (worker1StillOwned) {
    worker1AdvancedCheckpoint = true;
  } else {
    console.log('Worker 1 aborted execution safely because verifyLock returned false.');
  }
  assert.strictEqual(worker1AdvancedCheckpoint, false, 'Worker 1 must NOT advance checkpoint after losing lock');
  console.log('Passed: Worker 1 was fenced and prevented from corrupting checkpoint.');

  // -------------------------------------------------------------
  // Test Scenario 3: Legitimate long-running job keeps extending lease via heartbeat
  // -------------------------------------------------------------
  console.log('\n--- Scenario 3: Heartbeat lease renewal prevents premature expiry ---');
  const renewed = await renewLock('worker-2', 120);
  assert.strictEqual(renewed, true, 'Heartbeat renewal must succeed for current lock owner');

  const activeLock = db.prepare("SELECT locked_by, expires_at FROM sync_lock WHERE lock_name = 'google_sheets_sync'").get();
  const expiresTime = new Date(activeLock.expires_at).getTime();
  assert.ok(expiresTime > Date.now() + 100000, 'Expires at must be ~120s in future');
  console.log('Passed: Heartbeat lease renewal extended lock successfully.');

  // Clean up
  await releaseLock('worker-2');
  const remaining = db.prepare("SELECT count(*) as cnt FROM sync_lock").get().cnt;
  assert.strictEqual(remaining, 0, 'Lock must be fully cleared on release');
  console.log('Passed: Lock released cleanly.');

  console.log('\n=== All Lock Concurrency and Expiry Tests Passed 100% ===');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
