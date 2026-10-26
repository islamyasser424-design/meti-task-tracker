const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'd1_backup_pre_migration.sql');
const sqlContent = fs.readFileSync(backupPath, 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sqlContent);

const liveTasks = db.prepare("SELECT id, timestamp, labeler_name, task_id, queue_name, pass FROM task_submissions WHERE source = 'Live'").all();
console.log(`Loaded ${liveTasks.length} Live tasks from D1 backup.`);

const d1TaskMap = new Map();
for (const t of liveTasks) {
  // Key by task_id and labeler
  d1TaskMap.set(`${t.task_id}|${t.labeler_name}`, t);
}

// Fetch GViz count and a sample range from Google Sheet 1
async function testSheetMatch() {
  const sheet1Id = "1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I";
  
  // 1. Get total count
  const countUrl = `https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cbCount&tq=${encodeURIComponent("select count(A)")}`;
  const countRes = await fetch(countUrl);
  const countTxt = await countRes.text();
  const countMatch = countTxt.match(/"v":(\d+)/);
  const totalRows = countMatch ? parseInt(countMatch[1], 10) : 0;
  console.log(`Total rows in Sheet 1: ${totalRows}`);

  // 2. Fetch the last 1500 rows in batches of 300
  const startOffset = Math.max(0, totalRows - 1500);
  console.log(`Scanning Sheet 1 from offset ${startOffset} to ${totalRows}...`);

  let matchedCount = 0;
  let newRowsCount = 0;
  const matchedSpreadsheetRows = [];

  for (let offset = startOffset; offset < totalRows; offset += 300) {
    const limit = Math.min(300, totalRows - offset);
    const query = `select * limit ${limit} offset ${offset}`;
    const url = `https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cb&tq=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const txt = await res.text();
    const prefix = "cb(";
    const s = txt.indexOf(prefix);
    const e = txt.lastIndexOf(")");
    if (s === -1 || e === -1) continue;
    const json = JSON.parse(txt.slice(s + prefix.length, e));
    const rows = json.table.rows || [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.c) continue;
      const vals = row.c.map(c => c ? (c.f || c.v || "") : "");
      if (vals.length < 12) continue;

      const sheetRowIndex = offset + i + 1; // 0-based offset + 1 = data row index
      const spreadsheetRowNumber = sheetRowIndex + 1; // 1-based row number including header
      const ts = String(vals[0] || "").trim();
      const lab = String(vals[5] || "").trim();
      const tid = String(vals[11] || "").trim();

      const key = `${tid}|${lab}`;
      if (d1TaskMap.has(key)) {
        matchedCount++;
        matchedSpreadsheetRows.push({
          spreadsheetRowNumber,
          offset: offset + i,
          tid,
          lab,
          d1_id: d1TaskMap.get(key).id
        });
      } else {
        newRowsCount++;
      }
    }
  }

  console.log(`Matched with D1: ${matchedCount} rows`);
  console.log(`Unmatched (New or historical not in D1): ${newRowsCount} rows`);
  if (matchedSpreadsheetRows.length > 0) {
    console.log('Earliest matched row in this scan: Sheet Row #', matchedSpreadsheetRows[0].spreadsheetRowNumber, 'offset:', matchedSpreadsheetRows[0].offset, 'd1_id:', matchedSpreadsheetRows[0].d1_id);
    console.log('Latest matched row in this scan: Sheet Row #', matchedSpreadsheetRows[matchedSpreadsheetRows.length - 1].spreadsheetRowNumber, 'offset:', matchedSpreadsheetRows[matchedSpreadsheetRows.length - 1].offset, 'd1_id:', matchedSpreadsheetRows[matchedSpreadsheetRows.length - 1].d1_id);
  }
}

testSheetMatch().catch(console.error);
