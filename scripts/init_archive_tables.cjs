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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Turso HTTP ${res.status}: ${err}`);
  }
  return await res.json();
}

async function main() {
  console.log('🚀 Initializing Archive 2026 and Archive 2025 tables in Turso...');

  const schemaStatements = [
    // 1. Archive 2026 Table
    `CREATE TABLE IF NOT EXISTS archive_2026 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      shift TEXT,
      unit TEXT,
      pc_no TEXT,
      labeler_name TEXT,
      national_id TEXT,
      qtc_shift TEXT,
      yubikey_email TEXT,
      qtc_name TEXT,
      stage TEXT,
      task_link TEXT,
      task_id TEXT,
      pass TEXT,
      modality TEXT,
      queue_name TEXT,
      object_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'Archive 2026',
      UNIQUE(task_id, pass)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_arch2026_tid ON archive_2026(task_id);`,
    `CREATE INDEX IF NOT EXISTS idx_arch2026_ts ON archive_2026(timestamp);`,
    `CREATE INDEX IF NOT EXISTS idx_arch2026_q ON archive_2026(queue_name);`,

    // 2. Archive 2025 Table
    `CREATE TABLE IF NOT EXISTS archive_2025 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      shift TEXT,
      unit TEXT,
      pc_no TEXT,
      labeler_name TEXT,
      national_id TEXT,
      qtc_shift TEXT,
      yubikey_email TEXT,
      qtc_name TEXT,
      stage TEXT,
      task_link TEXT,
      task_id TEXT,
      pass TEXT,
      modality TEXT,
      queue_name TEXT,
      object_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'Archive 2025',
      UNIQUE(task_id, pass)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_arch2025_tid ON archive_2025(task_id);`,
    `CREATE INDEX IF NOT EXISTS idx_arch2025_ts ON archive_2025(timestamp);`,
    `CREATE INDEX IF NOT EXISTS idx_arch2025_q ON archive_2025(queue_name);`,

    // 3. Update existing source names in task_submissions for clean standard naming
    `UPDATE task_submissions SET source = 'Archive 2025' WHERE source = 'ارشيف 1';`,
    `UPDATE task_submissions SET source = 'Archive 2026' WHERE source = 'ارشيف 2';`
  ];

  const res = await executeSql(schemaStatements);
  console.log('✓ Tables archive_2026 and archive_2025 created successfully!');
  console.log('✓ Updated source names in task_submissions.');

  // Check counts
  const checkRes = await executeSql([
    "SELECT source, count(*) FROM task_submissions GROUP BY source",
    "SELECT count(*) FROM archive_2026",
    "SELECT count(*) FROM archive_2025"
  ]);

  const sources = checkRes.results[0].response.result.rows.map(r => `${r[0].value || 'Live'}: ${r[1].value}`);
  console.log('Current sources in task_submissions:', sources);
}

main().catch(err => {
  console.error('Fatal setup error:', err);
  process.exit(1);
});
