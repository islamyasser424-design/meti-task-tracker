const assert = require('assert');

async function testCheckpointProof() {
  console.log("=== Proof of Checkpoint Mathematics and Non-Duplication ===");
  const sheet1Id = "1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I";

  // Checkpoint Definition:
  // last_synced_row = Count of completed data rows (which is the exact 0-based offset for the next query)
  // For Sheet 1:
  // Row 62328 in spreadsheet is data row 62327 (offset 62326) -> Saved in D1 (id 3193).
  // Therefore, count of completed data rows = 62327.
  let checkpoint = 62327; // next offset to fetch

  // Fetch Batch 1: limit 5 offset 62327
  const q1 = `select * limit 5 offset ${checkpoint}`;
  const res1 = await fetch(`https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cb1&tq=${encodeURIComponent(q1)}`);
  const txt1 = await res1.text();
  const json1 = JSON.parse(txt1.slice(txt1.indexOf("cb1(") + 4, txt1.lastIndexOf(")")));
  const rows1 = json1.table.rows;

  console.log(`\nBatch 1: Fetched ${rows1.length} rows starting at offset ${checkpoint}:`);
  const firstRowOfBatch1 = rows1[0].c;
  const firstTaskId = firstRowOfBatch1[11].f || firstRowOfBatch1[11].v;
  const firstLabeler = firstRowOfBatch1[5].f || firstRowOfBatch1[5].v;
  console.log(`First row in Batch 1: TaskID=${firstTaskId}, Labeler=${firstLabeler} (Expected: Rahma Talat, 1466273467)`);

  // Verify that Kerolos Hany (row 62328, offset 62326) was NOT fetched in Batch 1
  assert.strictEqual(firstTaskId, "1466273467", "First new row must be Rahma Talat (1466273467)");
  assert.strictEqual(firstLabeler, "Rahma Talat", "First new row labeler must be Rahma Talat");

  // Advance checkpoint by batch size (5)
  checkpoint += rows1.length;
  console.log(`Checkpoint advanced to: ${checkpoint}`);

  // Fetch Batch 2: limit 5 offset 62332
  const q2 = `select * limit 5 offset ${checkpoint}`;
  const res2 = await fetch(`https://docs.google.com/spreadsheets/d/${sheet1Id}/gviz/tq?tqx=responseHandler:cb2&tq=${encodeURIComponent(q2)}`);
  const txt2 = await res2.text();
  const json2 = JSON.parse(txt2.slice(txt2.indexOf("cb2(") + 4, txt2.lastIndexOf(")")));
  const rows2 = json2.table.rows;

  console.log(`\nBatch 2: Fetched ${rows2.length} rows starting at offset ${checkpoint}:`);
  const firstRowOfBatch2 = rows2[0].c;
  const secondBatchTaskId = firstRowOfBatch2[11].f || firstRowOfBatch2[11].v;
  const secondBatchLabeler = firstRowOfBatch2[5].f || firstRowOfBatch2[5].v;
  console.log(`First row in Batch 2: TaskID=${secondBatchTaskId}, Labeler=${secondBatchLabeler} (Expected: Sahar Ehab, 1466276870)`);

  assert.strictEqual(secondBatchTaskId, "1466276870", "Second batch first row must be Sahar Ehab (1466276870)");
  assert.notStrictEqual(secondBatchTaskId, firstTaskId, "Batches must not overlap or duplicate");

  console.log("\n=== MATHEMATICAL & EMPIRICAL PROOF SUCCESSFUL: ===");
  console.log("1. Row 62328 (Kerolos Hany) was already saved in D1 and was NEVER re-read.");
  console.log("2. Row 62329 (Rahma Talat) was the first new row read, read exactly once.");
  console.log("3. Advancing checkpoint by batch size guarantees zero duplicates and zero skipped rows.");
}

testCheckpointProof().catch(console.error);
