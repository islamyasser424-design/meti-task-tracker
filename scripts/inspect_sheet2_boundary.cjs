const sheet2Id = "1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A";

async function inspectSheet2() {
  console.log("=== Inspecting Google Sheet 2 Boundary ===");
  const countRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheet2Id}/gviz/tq?tqx=responseHandler:cbCount&tq=${encodeURIComponent("select count(A)")}`);
  const countTxt = await countRes.text();
  const countMatch = countTxt.match(/"v":(\d+)/);
  const totalCount = countMatch ? parseInt(countMatch[1], 10) : 0;
  console.log(`Sheet 2 GViz select count(A): ${totalCount}`);

  // Fetch last 3 rows
  const start = Math.max(0, totalCount - 3);
  const q = `select * limit 3 offset ${start}`;
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheet2Id}/gviz/tq?tqx=responseHandler:cb&tq=${encodeURIComponent(q)}`);
  const txt = await res.text();
  const json = JSON.parse(txt.slice(txt.indexOf("cb(") + 3, txt.lastIndexOf(")")));
  const rows = json.table.rows;
  console.log(`Fetched last ${rows.length} rows of Sheet 2:`);
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].c;
    const tid = c[11] ? (c[11].f || c[11].v) : "";
    const lab = c[5] ? (c[5].f || c[5].v) : "";
    console.log(`[Offset ${start + i} | Sheet Row #${start + i + 2}] TaskID=${tid}, Labeler=${lab}`);
  }
}

inspectSheet2().catch(console.error);
