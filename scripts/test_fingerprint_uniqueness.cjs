const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

const rows = db.prepare("SELECT id, task_id, labeler_name, timestamp, pass FROM task_submissions").all();
console.log(`Checking ${rows.length} rows for fingerprint uniqueness...`);

const fingerprints = new Map();
let duplicateFingerprints = 0;

for (const r of rows) {
  const fp = `${r.task_id}|${r.labeler_name}|${r.timestamp}|${r.pass || ''}`;
  if (fingerprints.has(fp)) {
    duplicateFingerprints++;
    console.log(`Duplicate fingerprint found! Row ${r.id} and Row ${fingerprints.get(fp).id}: ${fp}`);
  } else {
    fingerprints.set(fp, r);
  }
}

console.log(`Total rows: ${rows.length}`);
console.log(`Unique fingerprints: ${fingerprints.size}`);
console.log(`Duplicate fingerprints: ${duplicateFingerprints}`);
