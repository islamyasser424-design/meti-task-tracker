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
        { type: 'execute', stmt: { sql: "SELECT source, count(*), min(id), max(id), min(timestamp), max(timestamp) FROM task_submissions GROUP BY source" } },
        { type: 'execute', stmt: { sql: "SELECT id, timestamp, source FROM task_submissions WHERE timestamp LIKE '%10/23/2026%' OR timestamp LIKE '%2026-10-23%' OR timestamp LIKE '%10/24/2026%' OR timestamp LIKE '%2026-10-24%' LIMIT 5" } }
      ]
    })
  });
  const data = await res.json();
  console.log('--- Sources Breakdown ---');
  console.table(data.results[0].response.result.rows.map(r => ({
    source: r[0].value,
    count: r[1].value,
    min_id: r[2].value,
    max_id: r[3].value,
    min_ts: r[4].value,
    max_ts: r[5].value
  })));

  console.log('\n--- Recent 10/23 & 10/24 rows ---');
  console.table(data.results[1].response.result.rows.map(r => ({
    id: r[0].value,
    timestamp: r[1].value,
    source: r[2].value
  })));
}

main().catch(console.error);
