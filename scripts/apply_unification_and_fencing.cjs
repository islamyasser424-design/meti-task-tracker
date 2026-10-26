const fs = require('fs');
const path = require('path');

console.log("=== Updating Migration 0002 with Unified Checkpoint and Deterministic Keys ===");

// 1. Update backend/migrations/0002_incremental_checkpoint_sync.sql
const mig2Path = path.join(__dirname, '..', 'backend', 'migrations', '0002_incremental_checkpoint_sync.sql');
let mig2 = fs.readFileSync(mig2Path, 'utf8');

// Change baseline 62328 to 62327
mig2 = mig2.replace(
  "VALUES ('sheet1_live', '1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I', '0', 62328, 'idle');",
  "VALUES ('sheet1_live', '1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I', '0', 62327, 'idle');"
);

// Change legacy key to deterministic content fingerprint key
mig2 = mig2.replace(
  "'legacy:id_' || id",
  "'sub:' || task_id || '|' || labeler_name || '|' || timestamp || '|' || COALESCE(pass, '')"
);

fs.writeFileSync(mig2Path, mig2, 'utf8');
console.log("Updated backend/migrations/0002_incremental_checkpoint_sync.sql");

// 2. Update backend/schema.sql
const schemaPath = path.join(__dirname, '..', 'backend', 'schema.sql');
let schema = fs.readFileSync(schemaPath, 'utf8');
schema = schema.replace(
  "VALUES ('sheet1_live', '1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I', '0', 62328, 'idle');",
  "VALUES ('sheet1_live', '1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I', '0', 62327, 'idle');"
);
fs.writeFileSync(schemaPath, schema, 'utf8');
console.log("Updated backend/schema.sql");

// 3. Update backend/src/index.js
const indexPath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let indexCode = fs.readFileSync(indexPath, 'utf8');

// A: baseline s1LastSyncedRow
indexCode = indexCode.replace(
  "let s1LastSyncedRow = s1Checkpoint ? parseInt(s1Checkpoint.last_synced_row || 0, 10) : 62328;",
  "let s1LastSyncedRow = s1Checkpoint ? parseInt(s1Checkpoint.last_synced_row || 0, 10) : 62327;"
);

// B: submissionKey formula in Sheet 1
indexCode = indexCode.replace(
  "const submissionKey = `${sheet1SourceId}:row_${sheetRowIndex}`;",
  "const submissionKey = `sub:${tid}|${lab_name}|${ts}|${pas}`;"
);

// C: submissionKey formula in Sheet 2
indexCode = indexCode.replace(
  "const submissionKey = `${sheet2SourceId}:row_${sheetRowIndex}`;",
  "const submissionKey = `sub:${tid}|${lab_name}|${ts}|${pas}`;"
);

// D: Add mid-batch lock check before inserting tasks for Sheet 1
const s1PreInsertTarget = `            const nowIso = new Date().toISOString();

            if (queue) newQueues.add(queue);

            // Insert new form response idempotently using persistent submissionKey`;

const s1PreInsertReplacement = `            const nowIso = new Date().toISOString();

            // Verify lock ownership mid-batch before write
            const stillOwnedMidBatch = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
            if (!stillOwnedMidBatch) {
              throw new Error(\`Sync aborted: lock ownership lost mid-batch for \${runnerOwner}; halting writes.\`);
            }

            if (queue) newQueues.add(queue);

            // Insert new form response idempotently using persistent deterministic submissionKey`;

if (indexCode.includes(s1PreInsertTarget)) {
  indexCode = indexCode.replace(s1PreInsertTarget, s1PreInsertReplacement);
  console.log("Added mid-batch lock verification before write in Sheet 1.");
}

// E: Add mid-batch lock check before inserting tasks for Sheet 2
const s2PreInsertTarget = `            const nowIso = new Date().toISOString();

            if (queue) newQueues.add(queue);

            await db(env, \`INSERT OR IGNORE INTO task_submissions`;

const s2PreInsertReplacement = `            const nowIso = new Date().toISOString();

            // Verify lock ownership mid-batch before write
            const stillOwnedMidBatch2 = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
            if (!stillOwnedMidBatch2) {
              throw new Error(\`Sync aborted: lock ownership lost mid-batch for \${runnerOwner}; halting writes.\`);
            }

            if (queue) newQueues.add(queue);

            await db(env, \`INSERT OR IGNORE INTO task_submissions`;

if (indexCode.includes(s2PreInsertTarget)) {
  indexCode = indexCode.replace(s2PreInsertTarget, s2PreInsertReplacement);
  console.log("Added mid-batch lock verification before write in Sheet 2.");
}

fs.writeFileSync(indexPath, indexCode, 'utf8');
console.log("Updated backend/src/index.js successfully!");
