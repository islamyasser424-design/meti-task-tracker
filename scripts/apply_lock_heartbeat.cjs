const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');

const lockTarget = `async function releaseDistributedLock(env, lockName = "google_sheets_sync", owner = "cron") {
  try {
    await db(env, "DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?", [lockName, owner]).catch(() => {});
  } catch (err) {
    console.warn("Failed to release distributed lock:", err.message);
  }
}`;

const lockReplacement = `async function releaseDistributedLock(env, lockName = "google_sheets_sync", owner = "cron") {
  try {
    await db(env, "DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?", [lockName, owner]).catch(() => {});
  } catch (err) {
    console.warn("Failed to release distributed lock:", err.message);
  }
}

/**
 * Verify that the lock is STILL owned by the runner and has not expired or been acquired by another worker
 */
async function verifyLockOwnership(env, lockName = "google_sheets_sync", owner = "cron") {
  try {
    const nowIso = new Date().toISOString();
    const rows = await db(
      env,
      "SELECT locked_by, expires_at FROM sync_lock WHERE lock_name = ? AND locked_by = ? AND expires_at > ?",
      [lockName, owner, nowIso]
    );
    return rows && rows.length > 0;
  } catch (err) {
    console.warn("Lock ownership verification error:", err.message);
    return false;
  }
}

/**
 * Heartbeat: Extend lock lease to prevent expiration during legitimate long-running batch syncs
 */
async function renewDistributedLock(env, lockName = "google_sheets_sync", owner = "cron", extendSeconds = 120) {
  try {
    const now = new Date();
    const newExpires = new Date(now.getTime() + extendSeconds * 1000).toISOString();
    const nowIso = now.toISOString();
    await db(
      env,
      "UPDATE sync_lock SET expires_at = ? WHERE lock_name = ? AND locked_by = ? AND expires_at > ?",
      [newExpires, lockName, owner, nowIso]
    );
    return true;
  } catch (err) {
    console.warn("Failed to renew distributed lock:", err.message);
    return false;
  }
}`;

// Normalize line endings for replacement
const isCRLF = code.includes('\r\n');
const normalizedTarget = lockTarget.replace(/\r\n/g, '\n');
const normalizedCode = code.replace(/\r\n/g, '\n');

if (!normalizedCode.includes(normalizedTarget)) {
  console.error("Lock target not found in backend/src/index.js");
  process.exit(1);
}

let updated = normalizedCode.replace(normalizedTarget, lockReplacement.replace(/\r\n/g, '\n'));

// Now add lock verification & heartbeat inside syncGoogleSheetsToD1 for Sheet 1 & Sheet 2
const s1LoopTarget = `        while (currentOffset < s1TotalRows) {
          const batchSize = Math.min(100, s1TotalRows - currentOffset);`;

const s1LoopReplacement = `        while (currentOffset < s1TotalRows) {
          // Verify lock ownership before processing batch
          const stillOwned = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
          if (!stillOwned) {
            throw new Error(\`Lock ownership lost or expired for \${runnerOwner}; aborting sync to prevent concurrent corruption.\`);
          }
          await renewDistributedLock(env, "google_sheets_sync", runnerOwner, 120);

          const batchSize = Math.min(100, s1TotalRows - currentOffset);`;

if (!updated.includes(s1LoopTarget)) {
  console.error("s1LoopTarget not found!");
  process.exit(1);
}
updated = updated.replace(s1LoopTarget, s1LoopReplacement);

const s2LoopTarget = `        while (currentOffset < s2TotalRows) {
          const batchSize = Math.min(100, s2TotalRows - currentOffset);`;

const s2LoopReplacement = `        while (currentOffset < s2TotalRows) {
          // Verify lock ownership before processing batch
          const stillOwned = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
          if (!stillOwned) {
            throw new Error(\`Lock ownership lost or expired for \${runnerOwner}; aborting sync to prevent concurrent corruption.\`);
          }
          await renewDistributedLock(env, "google_sheets_sync", runnerOwner, 120);

          const batchSize = Math.min(100, s2TotalRows - currentOffset);`;

if (!updated.includes(s2LoopTarget)) {
  console.error("s2LoopTarget not found!");
  process.exit(1);
}
updated = updated.replace(s2LoopTarget, s2LoopReplacement);

if (isCRLF) {
  updated = updated.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, updated, 'utf8');
console.log("Successfully updated backend/src/index.js with lock verification and heartbeat lease renewal!");
