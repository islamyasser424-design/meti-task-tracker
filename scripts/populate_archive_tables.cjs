const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'backend', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}

const tursoUrl = env.TURSO_URL || process.env.TURSO_URL;
const tursoToken = env.TURSO_TOKEN || process.env.TURSO_TOKEN;

async function executeSql(sqlList) {
  const requests = sqlList.map(sql => ({
    type: 'execute',
    stmt: { sql }
  }));

  const res = await fetch(tursoUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tursoToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  return await res.json();
}

async function populate() {
  console.log('Populating archive_2026 and archive_2025 tables from task_submissions...');
  await executeSql([
    `INSERT OR IGNORE INTO archive_2026 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
     SELECT timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, 'Archive 2026'
     FROM task_submissions WHERE source = 'Archive 2026';`,

    `INSERT OR IGNORE INTO archive_2025 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
     SELECT timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, 'Archive 2025'
     FROM task_submissions WHERE source = 'Archive 2025';`
  ]);

  const counts = await executeSql([
    "SELECT count(*) FROM archive_2026",
    "SELECT count(*) FROM archive_2025"
  ]);

  console.log('archive_2026 count:', counts.results[0].response.result.rows[0][0].value);
  console.log('archive_2025 count:', counts.results[1].response.result.rows[0][0].value);
}

populate().catch(console.error);
