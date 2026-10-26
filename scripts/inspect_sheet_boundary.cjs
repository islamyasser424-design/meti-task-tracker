const sheet1Id = "1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I";

async function inspectBoundary() {
  console.log("=== Inspecting Google Sheet 1 Boundary around row 62325-62335 ===");
  
  // 1. Get total count
  const countUrl = `https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cbCount&tq=${encodeURIComponent("select count(A)")}`;
  const countRes = await fetch(countUrl);
  const countTxt = await countRes.text();
  const countMatch = countTxt.match(/"v":(\d+)/);
  const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0;
  console.log(`GViz select count(A): ${totalCount}`);

  // Fetch 10 rows starting at offset 62325
  const query = `select * limit 10 offset 62325`;
  const url = `https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cb&tq=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const txt = await res.text();
  const prefix = "cb(";
  const s = txt.indexOf(prefix);
  const e = txt.lastIndexOf(")");
  const json = JSON.parse(txt.slice(s + prefix.length, e));
  const rows = json.table.rows || [];

  console.log(`\nFetched ${rows.length} rows starting at GViz offset 62325:`);
  for (let i = 0; i < rows.length; i++) {
    const offset = 62325 + i;
    const spreadsheetRow = offset + 2; // Row 1 is header, offset 0 is row 2
    const c = rows[i].c;
    const ts = c[0] ? (c[0].f || c[0].v) : "";
    const labeler = c[5] ? (c[5].f || c[5].v) : "";
    const taskId = c[11] ? (c[11].f || c[11].v) : "";
    const pass = c[13] ? (c[13].f || c[13].v) : "";
    console.log(`[GViz offset: ${offset} | Sheet Row #${spreadsheetRow}] TaskID: ${taskId} | Labeler: ${labeler} | Pass: ${pass} | Timestamp: ${ts}`);
  }
}

inspectBoundary().catch(console.error);
