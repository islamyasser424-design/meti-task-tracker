const https = require('https');

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('=== TRACING GOOGLE SHEETS SYNC DELAY & TASK LIFECYCLE ===\n');

  // 1. Fetch latest 5 rows from Sheet 1
  const q1 = "select * order by A desc limit 5";
  const url1 = 'https://docs.google.com/spreadsheets/d/1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I/gviz/tq?tqx=out:json&tq=' + encodeURIComponent(q1);
  const res1 = await fetchJson(url1);
  const jsonStr1 = res1.body.substring(res1.body.indexOf('{'), res1.body.lastIndexOf('}') + 1);
  const parsed1 = JSON.parse(jsonStr1);

  console.log('--- [STAGE 1] Latest Google Sheet 1 Tasks ---');
  const sheetRows = parsed1.table.rows.map(r => r.c.map(c => c ? (c.f || c.v) : ''));
  sheetRows.forEach((r, idx) => {
    console.log(`Row #${idx+1}: Timestamp="${r[0]}" | Shift="${r[1]}" | Labeler="${r[5]}" | TID="${r[11]}" | Link="${r[10]}"`);
  });

  // Pick target task
  const targetTask = sheetRows[0];
  const targetTid = String(targetTask[11]).trim();
  const targetTimestamp = String(targetTask[0]).trim();
  const targetLabeler = String(targetTask[5]).trim();

  console.log(`\nTARGET TASK FOR LIFECYCLE TRACE:`);
  console.log(`- Task ID: ${targetTid}`);
  console.log(`- Sheet Timestamp: "${targetTimestamp}"`);
  console.log(`- Labeler: "${targetLabeler}"`);

  // Check Sheet 2 as well
  const q2 = "select * order by A desc limit 3";
  const url2 = 'https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A/gviz/tq?tqx=out:json&tq=' + encodeURIComponent(q2);
  const res2 = await fetchJson(url2);
  const jsonStr2 = res2.body.substring(res2.body.indexOf('{'), res2.body.lastIndexOf('}') + 1);
  const parsed2 = JSON.parse(jsonStr2);
  console.log('\n--- [STAGE 1B] Latest Google Sheet 2 (Daily Active) Tasks ---');
  const sheet2Rows = parsed2.table.rows.map(r => r.c.map(c => c ? (c.f || c.v) : ''));
  sheet2Rows.forEach((r, idx) => {
    console.log(`Row #${idx+1}: Timestamp="${r[0]}" | Shift="${r[1]}" | Labeler="${r[5]}" | TID="${r[11]}"`);
  });
}

run().catch(console.error);
