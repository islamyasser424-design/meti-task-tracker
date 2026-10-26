const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'turso_backup_1792648860.json');
if (fs.existsSync(backupPath)) {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log("Timestamp:", data.timestamp);
  console.log("Task Submissions Meta:", data.task_submissions_meta);
  if (data.tables) {
    for (const [name, rows] of Object.entries(data.tables)) {
      console.log(`Table '${name}': ${Array.isArray(rows) ? rows.length : typeof rows} rows`);
    }
  }
} else {
  console.log("File not found:", backupPath);
}
