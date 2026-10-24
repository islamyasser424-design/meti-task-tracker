const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

async function run() {
  const res = await fetch(env.TURSO_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.TURSO_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: "UPDATE custom_queues SET is_hidden = 0 WHERE is_hidden IS NULL OR is_hidden = '0' OR is_hidden = ''" } },
        { type: 'execute', stmt: { sql: "SELECT id, name, highlight, is_hidden, typeof(is_hidden) FROM custom_queues LIMIT 5" } }
      ]
    })
  });
  const data = await res.json();
  console.log('Update result:', data.results[0]);
  console.log('Rows after update:', data.results[1].response.result.rows);
}

run().catch(console.error);
