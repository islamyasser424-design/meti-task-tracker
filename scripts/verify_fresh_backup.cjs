const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

console.log('=== Verifying Fresh D1 Backup Restoration ===');
const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_fresh_pre_deploy.sql');
const testDbPath = path.join(__dirname, '..', 'backups', 'test_fresh_restore.db');

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

assert.ok(fs.existsSync(backupPath), "Fresh backup file must exist");
const sql = fs.readFileSync(backupPath, 'utf8');
console.log(`Backup size: ${sql.length} bytes`);

const db = new DatabaseSync(testDbPath);
db.exec(sql);
console.log("SQL executed into clean SQLite database successfully.");

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
console.log("Restored tables:", tables);

const taskCount = db.prepare("SELECT count(*) as cnt FROM task_submissions").get().cnt;
const userCount = db.prepare("SELECT count(*) as cnt FROM dashboard_users").get().cnt;
const queueCount = db.prepare("SELECT count(*) as cnt FROM custom_queues").get().cnt;

console.log(`- task_submissions: ${taskCount} records`);
console.log(`- dashboard_users: ${userCount} records`);
console.log(`- custom_queues: ${queueCount} records`);

assert.strictEqual(taskCount, 1267, "Must have exactly 1267 tasks restored");
assert.strictEqual(userCount, 5, "Must have 5 dashboard users");
assert.strictEqual(queueCount, 27, "Must have 27 custom queues");

db.close();
fs.unlinkSync(testDbPath);

console.log("=== FRESH BACKUP RESTORATION VERIFICATION: 100% SUCCESS ===");
