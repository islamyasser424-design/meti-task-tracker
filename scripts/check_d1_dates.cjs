const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

const liveTasks = db.prepare("SELECT id, timestamp, labeler_name, task_id, queue_name FROM task_submissions WHERE source = 'Live'").all();
console.log(`Total live tasks in D1: ${liveTasks.length}`);

// Look at the timestamps in D1
const timestamps = liveTasks.map(t => t.timestamp);
const dates = new Set();
for (const ts of timestamps) {
  // Format is either MM/DD/YYYY or YYYY-MM-DD
  const m = ts.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/) || ts.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) dates.add(m[1]);
  else dates.add(ts.slice(0, 10));
}
console.log('Distinct dates in D1 Live tasks:', Array.from(dates));
