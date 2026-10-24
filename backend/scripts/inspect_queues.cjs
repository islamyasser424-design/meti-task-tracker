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
      requests: [{ type: 'execute', stmt: { sql: "SELECT id, name, highlight, is_hidden FROM custom_queues LIMIT 25" } }]
    })
  });
  const data = await res.json();
  const rows = data.results[0].response.result.rows;
  console.table(rows.map(r => ({
    id: r[0].value,
    name: r[1].value,
    highlight: r[2].value,
    is_hidden: r[3]?.value
  })));
}

main().catch(console.error);
