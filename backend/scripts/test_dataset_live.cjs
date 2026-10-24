const fs = require('fs');
const path = require('path');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

async function testDatasetLive() {
  const res = await fetch(env.TURSO_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.TURSO_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        type: 'execute',
        stmt: {
          sql: "SELECT id, timestamp, shift, unit, qtc_name, labeler_name FROM task_submissions WHERE source = 'Live' OR source IS NULL ORDER BY id DESC LIMIT 25000"
        }
      }]
    })
  });
  const data = await res.json();
  const rows = data.results[0].response.result.rows;
  console.log('Fetched rows count:', rows.length);
  
  // Count by dates
  const dateCounts = {};
  rows.forEach(r => {
    const ts = r[1].value;
    const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const d = m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : ts.slice(0, 10);
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });

  console.log('Recent Dates in Dataset:');
  const sortedDates = Object.keys(dateCounts).sort().reverse().slice(0, 10);
  sortedDates.forEach(d => console.log(`  ${d}: ${dateCounts[d]} tasks`));
}

testDatasetLive().catch(console.error);
