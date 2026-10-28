import { args, loadEnv, connect, fail } from "./common.mjs";
import { readFile } from "node:fs/promises";
import { importArchive } from "./archive-import.mjs";
const a = args({
  year: { type: "string" },
  file: { type: "string" },
  source: { type: "string" },
  page: { type: "string" },
  rows: { type: "string" },
  columns: { type: "string" },
  mapping: { type: "string" },
  env: { type: "string" },
  local: { type: "boolean" },
  tsv: { type: "boolean" },
});
try {
  if (!["2025", "2026"].includes(a.year)) throw new Error("Invalid year");
  await loadEnv(a.env);
  const db = connect(`ARCHIVE_${a.year}`, { local: a.local });
  try {
    const result = await importArchive({
      db,
      path: a.file,
      source: a.source,
      pageName: a.page,
      expectedRows: Number(a.rows),
      expectedColumns: Number(a.columns),
      mapping: a.mapping ? JSON.parse(await readFile(a.mapping, "utf8")) : null,
      delimiter: a.tsv ? "\t" : ",",
    });
    console.log(JSON.stringify(result));
  } finally {
    db.close();
  }
} catch (e) {
  fail(e);
}
