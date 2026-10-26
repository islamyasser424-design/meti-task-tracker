const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const testDbPath = path.join(__dirname, '..', 'backups', 'test_restore.db');

console.log('=== Step 1: Checking Backup File Existence and Size ===');
if (!fs.existsSync(backupPath)) {
  console.error('Backup file not found at:', backupPath);
  process.exit(1);
}
const sqlContent = fs.readFileSync(backupPath, 'utf8');
console.log(`Backup file found: ${backupPath} (${sqlContent.length} bytes)`);

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('\n=== Step 2: Executing Backup SQL onto Clean SQLite DB ===');
const db = new DatabaseSync(testDbPath);

try {
  // Execute SQL script
  db.exec(sqlContent);
  console.log('SQL executed successfully without errors.');
} catch (err) {
  console.error('Failed to execute backup SQL:', err.message);
  process.exit(1);
}

console.log('\n=== Step 3: Verifying Restored Tables and Counts ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log('Restored tables:', tables.map(t => t.name));

const tableDetails = {};
for (const tbl of tables.map(t => t.name)) {
  const count = db.prepare(`SELECT count(*) as cnt FROM ${tbl}`).get().cnt;
  tableDetails[tbl] = count;
  console.log(`  Table [${tbl}]: ${count} records`);
}

// Check sample data integrity
const sampleTask = db.prepare("SELECT id, timestamp, labeler_name, task_id, source FROM task_submissions ORDER BY id DESC LIMIT 1").get();
console.log('\nSample latest task in restored DB:', sampleTask);

const sampleEarliestTask = db.prepare("SELECT id, timestamp, labeler_name, task_id, source FROM task_submissions ORDER BY id ASC LIMIT 1").get();
console.log('Sample earliest task in restored DB:', sampleEarliestTask);

// Task distribution by source
const sourceDistribution = db.prepare("SELECT source, count(*) as count FROM task_submissions GROUP BY source").all();
console.log('\nTask distribution by source:');
for (const row of sourceDistribution) {
  console.log(`  Source "${row.source}": ${row.count} tasks`);
}

const sampleUsers = db.prepare("SELECT id, username, role, status FROM dashboard_users LIMIT 5").all();
console.log('\nSample restored users:');
for (const u of sampleUsers) {
  console.log(`  User: ${u.username} (${u.role}, ${u.status})`);
}

const customQueuesCount = db.prepare("SELECT count(*) as cnt FROM custom_queues").get().cnt;
console.log(`\nCustom queues count: ${customQueuesCount}`);

// Clean up test DB
db.close();
fs.unlinkSync(testDbPath);

console.log('\n=== BACKUP RESTORATION VERIFICATION: 100% SUCCESS ===');
