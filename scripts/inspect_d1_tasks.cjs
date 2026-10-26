const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');

const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

console.log('=== Analysis of D1 Backup Tasks ===');
const liveTasks = db.prepare("SELECT id, timestamp, labeler_name, task_id, queue_name, source FROM task_submissions WHERE source = 'Live' ORDER BY id ASC").all();

console.log(`Total Live tasks in D1: ${liveTasks.length}`);
console.log('Earliest Live task in D1:', liveTasks[0]);
console.log('Latest Live task in D1:', liveTasks[liveTasks.length - 1]);

// Check min and max IDs
const idStats = db.prepare("SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(DISTINCT task_id) as distinct_tasks, COUNT(*) as total FROM task_submissions WHERE source = 'Live'").get();
console.log('Live task stats in D1:', idStats);

// Sample of 10 task_ids
console.log('Sample task_ids from beginning, middle, and end:');
console.log('First 3:', liveTasks.slice(0, 3).map(t => ({ id: t.id, task_id: t.task_id, ts: t.timestamp })));
console.log('Middle 3:', liveTasks.slice(Math.floor(liveTasks.length / 2), Math.floor(liveTasks.length / 2) + 3).map(t => ({ id: t.id, task_id: t.task_id, ts: t.timestamp })));
console.log('Last 3:', liveTasks.slice(-3).map(t => ({ id: t.id, task_id: t.task_id, ts: t.timestamp })));

db.close();
