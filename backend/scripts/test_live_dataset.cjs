const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

async function main() {
  const res = await fetch(env.TURSO_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.TURSO_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: "SELECT id, timestamp, shift, unit, qtc_name, labeler_name, source FROM task_submissions WHERE source = 'Live' OR source IS NULL ORDER BY id DESC LIMIT 5" } },
        { type: 'execute', stmt: { sql: "SELECT count(*) FROM task_submissions WHERE (source = 'Live' OR source IS NULL) AND (timestamp LIKE '%10/23/2026%' OR timestamp LIKE '%2026-10-23%')" } }
      ]
    })
  });
  const data = await res.json();
  console.log('--- Top 5 Live Submissions ---');
  console.table(data.results[0].response.result.rows.map(r => ({
    id: r[0].value,
    timestamp: r[1].value,
    shift: r[2].value,
    unit: r[3].value,
    qtc: r[4].value,
    labeler: r[5].value,
    source: r[6].value
  })));

  console.log('\n--- 10/23/2026 Live Submissions Count ---');
  console.log('Count:', data.results[1].response.result.rows[0][0].value);
}

main().catch(console.error);
