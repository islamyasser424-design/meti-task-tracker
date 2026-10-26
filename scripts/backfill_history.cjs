/**
 * Standalone Historical Backfill Engine for METI Task Tracker
 * Decoupled from 5-minute live cron to prevent timeouts and lock contention.
 * Systematically backfills historical rows (0 to 61708) from Google Sheet 1 into D1.
 * Uses deterministic submission keys: sub:task_id|labeler|timestamp|pass
 * 100% idempotent: skips existing tasks in D1 without creating duplicates.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SHEET1_ID = "1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I";
const SHEET1_GID = "0";
const BACKFILL_SOURCE_ID = "sheet1_backfill";
const TARGET_END_ROW = 62327; // Stop where live forward sync begins!

function parseGViz(text, callbackName) {
  const prefix = callbackName + "(";
  const start = text.indexOf(prefix);
  if (start === -1) return null;
  const end = text.lastIndexOf(")");
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(start + prefix.length, end));
  } catch {
    return null;
  }
}

async function fetchGVizQuery(query, callbackName = "cbBackfill") {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET1_ID}/gviz/tq?tqx=responseHandler:${callbackName}&tq=${encodeURIComponent(query)}&gid=${SHEET1_GID}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Google Sheets GViz HTTP ${res.status}`);
  const txt = await res.text();
  const obj = parseGViz(txt, callbackName);
  if (!obj || !obj.table) throw new Error("Invalid GViz response structure");
  return obj;
}

async function runBackfill(db, maxBatches = 10, batchSize = 100) {
  console.log("=== METI Historical Backfill Pipeline ===");

  // Initialize backfill checkpoint if not present
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_checkpoints (
      source_id TEXT PRIMARY KEY,
      spreadsheet_id TEXT NOT NULL,
      gid TEXT DEFAULT '0',
      last_synced_row INTEGER DEFAULT 0,
      total_source_rows INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      updated_at TEXT
    );
  `);

  let currentOffset = 0;
  const existing = db.prepare("SELECT last_synced_row FROM sync_checkpoints WHERE source_id = ?").get(BACKFILL_SOURCE_ID);
  if (existing) {
    currentOffset = existing.last_synced_row;
  }

  console.log(`Starting backfill from offset: ${currentOffset} (Target boundary: ${TARGET_END_ROW})`);
  let batchesProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (currentOffset < TARGET_END_ROW && batchesProcessed < maxBatches) {
    const fetchLimit = Math.min(batchSize, TARGET_END_ROW - currentOffset);
    console.log(`\nFetching batch ${batchesProcessed + 1}: offset ${currentOffset}, limit ${fetchLimit}...`);

    const gviz = await fetchGVizQuery(`select * limit ${fetchLimit} offset ${currentOffset}`, `cb_${currentOffset}`);
    const rows = gviz.table.rows || [];
    if (rows.length === 0) {
      console.log("No more rows returned by GViz.");
      break;
    }

    let batchInserted = 0;
    let batchSkipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.c) continue;
      const vals = row.c.map(cell => cell ? (cell.f || cell.v || "") : "");
      if (vals.length < 12) continue;

      const ts = String(vals[0] || "").trim();
      const shift = String(vals[1] || "").trim();
      const unit = String(vals[2] || "").trim();
      const qtc_name = String(vals[3] || "").trim();
      const yk_email = String(vals[4] || "").trim().toLowerCase();
      const lab_name = String(vals[5] || "").trim();
      const nat_id = String(vals[6] || "").trim();
      const pc_no = String(vals[7] || "").trim();
      const mod = String(vals[8] || "").trim();
      const queue = String(vals[9] || "").trim();
      const link = String(vals[10] || "").trim();
      const tid = String(vals[11] || "").trim();
      const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
      const pas = String(vals[13] || "QA").trim().toUpperCase();
      const stage = String(vals[14] || "").trim();

      const subKey = `sub:${tid}|${lab_name}|${ts}|${pas}`;

      const res = db.prepare(`INSERT OR IGNORE INTO task_submissions 
        (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, updated_at, source, submission_key) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Live', ?)`).run(
          ts, shift, unit, pc_no, lab_name, nat_id, shift, yk_email, qtc_name,
          stage, link, tid, pas, mod, queue, obj_cnt, ts, new Date().toISOString(), subKey
        );

      if (res.changes > 0) batchInserted++;
      else batchSkipped++;
    }

    currentOffset += rows.length;
    batchesProcessed++;
    totalInserted += batchInserted;
    totalSkipped += batchSkipped;

    // Advance backfill checkpoint atomically
    db.prepare(`INSERT INTO sync_checkpoints 
      (source_id, spreadsheet_id, gid, last_synced_row, total_source_rows, status, updated_at) 
      VALUES (?, ?, ?, ?, ?, 'in_progress', datetime('now'))
      ON CONFLICT(source_id) DO UPDATE SET
        last_synced_row = excluded.last_synced_row,
        status = 'in_progress',
        updated_at = excluded.updated_at`).run(BACKFILL_SOURCE_ID, SHEET1_ID, SHEET1_GID, currentOffset, TARGET_END_ROW);

    console.log(`Batch ${batchesProcessed} committed: +${batchInserted} inserted, ${batchSkipped} existing skipped. Checkpoint: ${currentOffset}`);
  }

  console.log(`\n=== Backfill Summary ===`);
  console.log(`Batches processed: ${batchesProcessed}`);
  console.log(`Total new rows inserted: ${totalInserted}`);
  console.log(`Total existing rows skipped: ${totalSkipped}`);
  console.log(`New backfill checkpoint offset: ${currentOffset} / ${TARGET_END_ROW}`);
}

module.exports = { runBackfill };

if (require.main === module) {
  // Test run on a temporary test DB with backup schema
  const db = new DatabaseSync(':memory:');
  const backupSql = fs.readFileSync(path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql'), 'utf8');
  db.exec(backupSql);
  const mig1 = fs.readFileSync(path.join(__dirname, '..', 'backend', 'migrations', '0001_d1_schema_optimization.sql'), 'utf8');
  const mig2 = fs.readFileSync(path.join(__dirname, '..', 'backend', 'migrations', '0002_incremental_checkpoint_sync.sql'), 'utf8');
  db.exec(mig1);
  db.exec(mig2);

  // Run 1 sample batch to verify
  runBackfill(db, 2, 50).catch(console.error);
}
