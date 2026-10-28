import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFile, mkdir, access, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { args, fail } from "./common.mjs";

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export function manifest(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return tables.map(({ name }) => {
    const columns = db
        .prepare(`PRAGMA table_info(${quote(name)})`)
        .all()
        .map((c) => c.name),
      hash = createHash("sha256");
    let rows = 0;
    // Offline restore verification only. The application's API never scans all rows.
    const statement = db.prepare(
      `SELECT ${columns.map(quote).join(",")} FROM ${quote(name)} ORDER BY ${columns.map(quote).join(",")}`,
    );
    statement.setReturnArrays(true);
    for (const row of statement.iterate()) {
      hash.update(
        JSON.stringify(row, (_, v) => (typeof v === "bigint" ? String(v) : v)) +
          "\n",
      );
      rows++;
    }
    return { table: name, rows, sha256: hash.digest("hex") };
  });
}
export async function backupLocal(input, output) {
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  try {
    await access(output);
    throw new Error("Output already exists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const source = new DatabaseSync(input, { readOnly: true });
  try {
    const before = manifest(source);
    await backup(source, output);
    await chmod(output, 0o600);
    const restored = new DatabaseSync(output, { readOnly: true });
    try {
      if (
        restored.prepare("PRAGMA integrity_check").get().integrity_check !==
        "ok"
      )
        throw new Error("Restored integrity check failed");
      const after = manifest(restored);
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error("Restored values differ from source");
      return {
        restored: true,
        tables: after,
        verification: "all rows and values, not just COUNT",
      };
    } finally {
      restored.close();
    }
  } finally {
    source.close();
  }
}
export async function restoreDump(input, output) {
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  try {
    await access(output);
    throw new Error("Output already exists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const sql = await readFile(input, "utf8");
  if (/\b(?:ATTACH|DETACH|load_extension)\b/i.test(sql))
    throw new Error("Dump requires manual review before local restoration");
  const db = new DatabaseSync(output, { enableLoadExtension: false });
  try {
    db.exec(sql);
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("Dump restoration integrity failed");
    await chmod(output, 0o600);
    return {
      restored: true,
      tables: manifest(db),
      verification:
        "local integrity + content manifest; compare with source import digest before cutover",
    };
  } finally {
    db.close();
  }
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const a = args({
    file: { type: "string" },
    dump: { type: "string" },
    output: { type: "string" },
  });
  process.umask(0o077);
  try {
    if (!!a.file === !!a.dump || !a.output)
      throw new Error("Choose --file or --dump and a NEW --output");
    const output = resolve(a.output);
    const result = a.file
      ? await backupLocal(resolve(a.file), output)
      : await restoreDump(resolve(a.dump), output);
    console.log(JSON.stringify(result));
  } catch (e) {
    fail(e);
  }
}
