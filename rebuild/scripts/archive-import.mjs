import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { csvRows } from "./csv.mjs";
import { sha256, isIsoDay } from "../src/security.mjs";
import { safeTable } from "../src/archive.mjs";

async function fileHash(path) {
  const h = createHash("sha256");
  for await (const b of createReadStream(path)) h.update(b);
  return h.digest("hex");
}
function mappingCheck(mapping, width) {
  if (!mapping) return;
  if (
    mapping.metric_version !== "submission-v1" ||
    mapping.row_semantics !== "one-row-per-submission" ||
    mapping.timestamp_format !== "iso8601"
  )
    throw new Error("Unapproved metric mapping");
  for (const key of ["object_count", "occurred_at"])
    if (
      !/^c\d{3}$/.test(mapping[key]) ||
      Number(mapping[key].slice(1)) < 1 ||
      Number(mapping[key].slice(1)) > width
    )
      throw new Error("Mapping column out of range");
}
function mapRow(row, mapping) {
  const count = row[Number(mapping.object_count.slice(1)) - 1],
    date = row[Number(mapping.occurred_at.slice(1)) - 1];
  if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)))
    throw new Error("Object count needs an explicit parsing rule");
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(
      date,
    ) ||
    !Number.isFinite(Date.parse(date)) ||
    !isIsoDay(date.slice(0, 10))
  )
    throw new Error("Timestamp needs an explicit parsing rule");
  return { objects: Number(count), date: new Date(date).toISOString() };
}
export async function importArchive({
  db,
  path,
  source,
  pageName,
  expectedRows,
  expectedColumns,
  mapping = null,
  delimiter = ",",
  batchSize = 100,
  failAfterBatches = Infinity,
}) {
  if (
    !/^[a-zA-Z0-9._-]{1,100}$/.test(source) ||
    !pageName ||
    !Number.isSafeInteger(expectedRows) ||
    expectedRows < 1 ||
    !Number.isSafeInteger(expectedColumns) ||
    expectedColumns < 1 ||
    expectedColumns > 100
  )
    throw new Error("Invalid import manifest");
  const fingerprint = await fileHash(path),
    table = safeTable(`meti_raw_${sha256(source).slice(0, 24)}`);
  mappingCheck(mapping, expectedColumns);
  const columns = Array.from(
    { length: expectedColumns },
    (_, i) => `c${String(i + 1).padStart(3, "0")}`,
  );
  const mappingJson = mapping ? JSON.stringify(mapping) : null;
  let meta = (
    await db.execute({
      sql: "SELECT file_sha256,expected_rows,column_count,imported_rows,status,mapping_sha256 FROM meti_archive_sources WHERE source_id=?",
      args: [source],
    })
  ).rows[0];
  if (
    meta &&
    (meta.file_sha256 !== fingerprint ||
      meta.expected_rows !== expectedRows ||
      meta.column_count !== expectedColumns)
  )
    throw new Error(
      "Existing source differs; do not replace an imported archive",
    );
  if (
    mapping &&
    meta?.mapping_sha256 &&
    meta.mapping_sha256 !== sha256(mappingJson)
  )
    throw new Error("Mapping is frozen; use a reviewed migration to change it");
  if (
    meta?.status === "complete" &&
    (!mapping || meta.mapping_sha256 === sha256(mappingJson))
  )
    return {
      source,
      rows: Number(meta.imported_rows),
      columns: expectedColumns,
      file_sha256: fingerprint,
      verified: true,
      already_imported: true,
      compatible: !!meta.mapping_sha256,
    };
  let n = 0,
    headers,
    buffer = [],
    batches = 0,
    objects = 0,
    minDate = null,
    maxDate = null;
  const expectedDigest = createHash("sha256");
  const flush = async () => {
    if (!buffer.length) return;
    const statements = buffer.map(({ sourceRow, values }) => ({
      sql: `INSERT INTO ${table}(source_row,${columns.join(",")}) VALUES(${Array(
        expectedColumns + 1,
      )
        .fill("?")
        .join(",")}) ON CONFLICT(source_row) DO NOTHING`,
      args: [sourceRow, ...values],
    }));
    statements.push({
      sql: "UPDATE meti_archive_sources SET imported_rows=MAX(imported_rows,?) WHERE source_id=? AND file_sha256=?",
      args: [n, source, fingerprint],
    });
    await db.batch(statements, "write");
    buffer = [];
    batches++;
    if (batches >= failAfterBatches)
      throw new Error("Injected interruption after a committed batch");
  };
  for await (const row of csvRows(path, delimiter)) {
    if (!headers) {
      headers = row;
      if (headers.length !== expectedColumns)
        throw new Error("Header width differs from manifest");
      if (!meta) {
        await db.batch(
          [
            {
              sql: "INSERT INTO meti_archive_sources(source_id,page_name,file_sha256,table_name,column_count,expected_rows,status) VALUES(?,?,?,?,?,?,?)",
              args: [
                source,
                pageName,
                fingerprint,
                table,
                expectedColumns,
                expectedRows,
                "importing",
              ],
            },
            {
              sql: `CREATE TABLE ${table}(source_row INTEGER PRIMARY KEY CHECK(source_row>=2),${columns.map((c) => c + " TEXT NOT NULL").join(",")})`,
            },
            ...headers.map((title, i) => ({
              sql: "INSERT INTO meti_archive_columns(source_id,ordinal,technical_name,original_header) VALUES(?,?,?,?)",
              args: [source, i + 1, columns[i], title],
            })),
          ],
          "write",
        );
        meta = { imported_rows: 0 };
      }
      continue;
    }
    n++;
    if (n > expectedRows || row.length !== expectedColumns)
      throw new Error("Archive row count or width differs from manifest");
    expectedDigest.update(JSON.stringify(row) + "\n");
    if (mapping) {
      const m = mapRow(row, mapping);
      objects += m.objects;
      if (!Number.isSafeInteger(objects)) throw new Error("Aggregate overflow");
      minDate = !minDate || m.date < minDate ? m.date : minDate;
      maxDate = !maxDate || m.date > maxDate ? m.date : maxDate;
    }
    if (n > Number(meta.imported_rows))
      buffer.push({ sourceRow: n + 1, values: row });
    if (buffer.length >= batchSize) await flush();
  }
  await flush();
  if (n !== expectedRows)
    throw new Error("Archive row count differs from manifest");
  // Verification is intentionally one full scan at import time, never on a dashboard refresh.
  const count = Number(
    (await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,
  );
  if (count !== n) throw new Error("Stored count differs from source");
  const storedDigest = createHash("sha256");
  let cursor = 0,
    verified = 0;
  while (true) {
    const r = await db.execute({
      sql: `SELECT source_row,${columns.join(",")} FROM ${table} WHERE source_row>? ORDER BY source_row LIMIT 200`,
      args: [cursor],
    });
    if (!r.rows.length) break;
    for (const row of r.rows) {
      if (Number(row.source_row) !== verified + 2)
        throw new Error("Source row sequence mismatch");
      storedDigest.update(JSON.stringify(columns.map((c) => row[c])) + "\n");
      verified++;
      cursor = Number(row.source_row);
    }
  }
  if (
    verified !== n ||
    storedDigest.digest("hex") !== expectedDigest.digest("hex")
  )
    throw new Error("Stored values differ from source");
  const now = new Date().toISOString();
  await db.batch(
    [
      {
        sql: "INSERT INTO meti_archive_summary(source_id,raw_rows,task_count,object_count,metric_version,built_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET raw_rows=excluded.raw_rows,task_count=excluded.task_count,object_count=excluded.object_count,metric_version=excluded.metric_version,built_at=excluded.built_at",
        args: [
          source,
          n,
          mapping ? n : null,
          mapping ? objects : null,
          mapping?.metric_version ?? null,
          now,
        ],
      },
      {
        sql: "UPDATE meti_archive_sources SET imported_rows=?,status='complete',mapping_json=?,mapping_sha256=?,dataset_start=?,dataset_end=?,verified_at=? WHERE source_id=?",
        args: [
          n,
          mappingJson,
          mappingJson ? sha256(mappingJson) : null,
          minDate,
          maxDate,
          now,
          source,
        ],
      },
    ],
    "write",
  );
  return {
    source,
    rows: n,
    columns: expectedColumns,
    file_sha256: fingerprint,
    verified: true,
    compatible: !!mapping,
    resumed_from: Number(meta.imported_rows),
  };
}
