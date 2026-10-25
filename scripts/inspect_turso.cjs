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

async function check() {
  console.log('Connecting to Turso:', tursoUrl);
  const res = await fetch(tursoUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tursoToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: "SELECT count(*) FROM archive_2026" } },
        { type: 'execute', stmt: { sql: "SELECT count(*) FROM archive_2025" } },
        { type: 'execute', stmt: { sql: "SELECT DISTINCT source, count(*) FROM task_submissions GROUP BY source" } }
      ]
    })
  });
  const data = await res.json();
  console.log('📊 archive_2026 table rows:', data.results[0].response.result.rows[0][0].value);
  console.log('📊 archive_2025 table rows:', data.results[1].response.result.rows[0][0].value);
  console.log('📊 task_submissions source breakdown:');
  data.results[2].response.result.rows.forEach(r => {
    console.log(`   - ${r[0].value || 'Live/NULL'}: ${r[1].value} rows`);
  });
}

check().catch(console.error);
