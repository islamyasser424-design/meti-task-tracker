const path = require("path");
const fs = require("fs");
const { Miniflare } = require(path.join(__dirname, "..", "backend", "node_modules", "miniflare"));

async function measureD1Metrics() {
  console.log("=== Cloudflare D1 Empirical Measurement via Miniflare (workerd) ===\n");

  const mf = new Miniflare({
    modules: true,
    script: `
      export default {
        async fetch(request, env) {
          return new Response("OK");
        }
      }
    `,
    d1Databases: ["DB"],
  });

  const db = await mf.getD1Database("DB");

  // Create base tables
  await db.prepare(`CREATE TABLE task_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    labeler_name TEXT,
    task_id TEXT,
    pass TEXT,
    submission_key TEXT UNIQUE,
    source TEXT DEFAULT 'Live'
  )`).run();

  await db.prepare(`CREATE TABLE sync_checkpoints (
    source_id TEXT PRIMARY KEY,
    spreadsheet_id TEXT NOT NULL,
    gid TEXT DEFAULT '0',
    last_synced_row INTEGER DEFAULT 0,
    last_synced_timestamp TEXT,
    last_synced_fingerprint TEXT,
    total_source_rows INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    error_message TEXT DEFAULT '',
    consecutive_failures INTEGER DEFAULT 0,
    last_attempt_at TEXT,
    last_success_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE sync_lock (
    lock_name TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE sync_meta (
    id INTEGER PRIMARY KEY,
    last_sync_time TEXT,
    new_rows_count INTEGER DEFAULT 0,
    updated_rows_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    error_message TEXT DEFAULT ''
  )`).run();

  // Initialize checkpoint
  await db.prepare("INSERT INTO sync_checkpoints (source_id, spreadsheet_id, last_synced_row) VALUES ('sheet1_live', '1g9m...', 62327)").run();

  console.log("Cloudflare D1 tables initialized successfully in workerd runtime.\n");

  // Helper to record query with exact D1 meta
  async function execQuery(label, sql, params = []) {
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql);
    const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
    if (isSelect) {
      const res = await stmt.all();
      return { label, sql, meta: res.meta, resultsCount: res.results.length };
    } else {
      const res = await stmt.run();
      return { label, sql, meta: res.meta, changes: res.meta ? res.meta.changes : 0 };
    }
  }

  // -------------------------------------------------------------
  // Part A: Idle Cycle Measurements
  // -------------------------------------------------------------
  console.log("--- Measuring IDLE CYCLE Queries in Cloudflare D1 ---");
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 120000).toISOString();
  const idleQueries = [];

  idleQueries.push(await execQuery("1. Purge Expired Locks", "DELETE FROM sync_lock WHERE lock_name = ? AND expires_at < ?", ["google_sheets_sync", nowIso]));
  idleQueries.push(await execQuery("2. Acquire Lock", "INSERT INTO sync_lock (lock_name, locked_by, acquired_at, expires_at) VALUES (?, ?, ?, ?)", ["google_sheets_sync", "cron:idle", nowIso, expiresIso]));
  idleQueries.push(await execQuery("3. Fetch Checkpoint", "SELECT last_synced_row, last_synced_timestamp, last_synced_fingerprint FROM sync_checkpoints WHERE source_id = ?", ["sheet1_live"]));
  idleQueries.push(await execQuery("4. Update Checkpoint Status", "UPDATE sync_checkpoints SET total_source_rows = ?, last_attempt_at = datetime('now'), status = 'success', error_message = '', consecutive_failures = 0, updated_at = datetime('now') WHERE source_id = ?", [62327, "sheet1_live"]));
  idleQueries.push(await execQuery("5. Sync Meta Telemetry", "INSERT INTO sync_meta (id, last_sync_time, new_rows_count, updated_rows_count, status, error_message) VALUES (1, datetime('now'), ?, 0, 'success', '') ON CONFLICT(id) DO UPDATE SET last_sync_time = excluded.last_sync_time, new_rows_count = excluded.new_rows_count, status = excluded.status", [0]));
  idleQueries.push(await execQuery("6. Release Lock", "DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?", ["google_sheets_sync", "cron:idle"]));

  console.table(idleQueries.map(q => ({
    Query: q.label,
    "meta.rows_read": q.meta.rows_read,
    "meta.rows_written": q.meta.rows_written,
    "meta.duration (ms)": q.meta.duration,
    SQL: q.sql.slice(0, 50) + "..."
  })));

  const totalIdleReads = idleQueries.reduce((sum, q) => sum + (q.meta.rows_read || 0), 0);
  const totalIdleWrites = idleQueries.reduce((sum, q) => sum + (q.meta.rows_written || 0), 0);
  console.log(`\nTotal Idle Cycle: meta.rows_read = ${totalIdleReads}, meta.rows_written = ${totalIdleWrites}`);
  console.log(`task_submissions Table: EXACTLY 0 rows_read, 0 rows_written!\n`);

  // -------------------------------------------------------------
  // Part B: Additions Cycle Measurements (10 New Rows)
  // -------------------------------------------------------------
  console.log("--- Measuring ADDITIONS CYCLE Queries (10 Rows) in Cloudflare D1 ---");
  const additionsQueries = [];

  additionsQueries.push(await execQuery("1. Purge Expired Locks", "DELETE FROM sync_lock WHERE lock_name = ? AND expires_at < ?", ["google_sheets_sync", nowIso]));
  additionsQueries.push(await execQuery("2. Acquire Lock", "INSERT INTO sync_lock (lock_name, locked_by, acquired_at, expires_at) VALUES (?, ?, ?, ?)", ["google_sheets_sync", "cron:add", nowIso, expiresIso]));
  additionsQueries.push(await execQuery("3. Fetch Checkpoint", "SELECT last_synced_row FROM sync_checkpoints WHERE source_id = ?", ["sheet1_live"]));
  additionsQueries.push(await execQuery("4. Verify Lock Ownership", "SELECT locked_by FROM sync_lock WHERE lock_name = ? AND locked_by = ? AND expires_at > ?", ["google_sheets_sync", "cron:add", nowIso]));

  for (let i = 1; i <= 10; i++) {
    const tid = "new_task_" + (62327 + i);
    const lab = "Labeler " + i;
    const ts = "10/26/2026, 6:00:00 PM";
    const pas = "FP";
    const subKey = `sub:${tid}|${lab}|${ts}|${pas}`;
    additionsQueries.push(await execQuery(`5.${i} Insert Task ${i}`, "INSERT OR IGNORE INTO task_submissions (timestamp, labeler_name, task_id, pass, submission_key, source) VALUES (?, ?, ?, ?, ?, 'Live')", [ts, lab, tid, pas, subKey]));
  }

  additionsQueries.push(await execQuery("6. Advance Checkpoint", "UPDATE sync_checkpoints SET last_synced_row = ?, status = 'success', updated_at = datetime('now') WHERE source_id = ?", [62337, "sheet1_live"]));
  additionsQueries.push(await execQuery("7. Update Sync Meta", "INSERT INTO sync_meta (id, last_sync_time, new_rows_count, updated_rows_count, status, error_message) VALUES (1, datetime('now'), ?, 0, 'success', '') ON CONFLICT(id) DO UPDATE SET last_sync_time = excluded.last_sync_time, new_rows_count = excluded.new_rows_count, status = excluded.status", [10]));
  additionsQueries.push(await execQuery("8. Release Lock", "DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?", ["google_sheets_sync", "cron:add"]));

  console.table(additionsQueries.slice(0, 8).map(q => ({
    Query: q.label,
    "meta.rows_read": q.meta.rows_read,
    "meta.rows_written": q.meta.rows_written,
    "meta.duration (ms)": q.meta.duration,
    SQL: q.sql.slice(0, 50) + "..."
  })));
  console.log("... (10 task inserts)");

  const totalAddReads = additionsQueries.reduce((sum, q) => sum + (q.meta.rows_read || 0), 0);
  const totalAddWrites = additionsQueries.reduce((sum, q) => sum + (q.meta.rows_written || 0), 0);
  console.log(`\nTotal Additions Cycle: meta.rows_read = ${totalAddReads}, meta.rows_written = ${totalAddWrites}`);

  await mf.dispose();
  console.log("\n=== Cloudflare D1 Measurement Completed Successfully ===");
}

measureD1Metrics().catch(console.error);
