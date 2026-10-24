const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

async function check() {
  const res = await fetch(env.TURSO_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.TURSO_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql: `SELECT 
                    count(*) as total,
                    count(CASE WHEN source = 'Live' THEN 1 END) as live,
                    count(CASE WHEN source = 'ارشيف 1' THEN 1 END) as arch1,
                    count(CASE WHEN source = 'ارشيف 2' THEN 1 END) as arch2
                  FROM task_submissions`
          }
        },
        {
          type: 'execute',
          stmt: {
            sql: `SELECT task_id, timestamp, shift, unit, qtc_name, queue_name, pass, source FROM task_submissions WHERE source = 'ارشيف 1' ORDER BY id DESC LIMIT 2`
          }
        }
      ]
    })
  });
  const d = await res.json();
  const row = d.results[0]?.response?.result?.rows[0];
  console.log(`DATABASE COUNTS: Total: ${row[0]?.value} | Live: ${row[1]?.value} | ارشيف 1: ${row[2]?.value} | ارشيف 2: ${row[3]?.value}`);
  const sampleRows = d.results[1]?.response?.result?.rows || [];
  sampleRows.forEach((r, idx) => {
    console.log(`Sample ${idx + 1}:`, r.map(x => x.value).join(' | '));
  });
}

check().catch(console.error);
