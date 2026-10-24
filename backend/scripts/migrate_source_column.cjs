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
    headers: {
      'Authorization': 'Bearer ' + env.TURSO_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: "ALTER TABLE task_submissions ADD COLUMN source TEXT DEFAULT 'Live'" } },
        { type: 'execute', stmt: { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_source ON task_submissions(source)" } },
        { type: 'execute', stmt: { sql: "CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON task_submissions(task_id)" } }
      ]
    })
  });
  const data = await res.json();
  console.log('Migration response:', JSON.stringify(data, null, 2));
}

run().catch(console.error);
