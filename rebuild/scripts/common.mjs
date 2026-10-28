import { createClient } from "@libsql/client";
import { parseArgs } from "node:util";
import { readFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
export const root = new URL("../", import.meta.url);
export function args(options) {
  return parseArgs({ options, strict: true }).values;
}
export async function loadEnv(path) {
  if (!path) return;
  const text = await readFile(resolve(path), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
export function connect(prefix, { local = false } = {}) {
  const url = process.env[`${prefix}_URL`],
    authToken = process.env[`${prefix}_TOKEN`];
  if (!url) throw new Error(`Set ${prefix}_URL in a private environment file`);
  if (url.startsWith("file:")) {
    if (!local) throw new Error("Local databases require --local");
  } else if (!authToken || !/^https:|^libsql:/.test(url))
    throw new Error("A secure database URL and token are required");
  return createClient({ url, authToken, intMode: "number" });
}
export async function migration(db, kind) {
  // executeMultiple supports complete CREATE TRIGGER bodies; statements must not
  // be split on semicolons. New migrations carry a content checksum.
  const name = kind === "live" ? "001_live.sql" : "001_archive.sql";
  const sql = await readFile(
    new URL(`migrations/${kind}/${name}`, root),
    "utf8",
  );
  const { sha256 } = await import("../src/security.mjs");
  await db.execute(
    "CREATE TABLE IF NOT EXISTS meti_schema_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)",
  );
  const old = (
    await db.execute({
      sql: "SELECT sha256 FROM meti_schema_migrations WHERE name=?",
      args: [name],
    })
  ).rows[0];
  if (old) {
    if (old.sha256 !== sha256(sql))
      throw new Error("Migration checksum mismatch");
    return;
  }
  const tx = await db.transaction("write");
  try {
    await tx.executeMultiple(sql);
    await tx.execute({
      sql: "INSERT INTO meti_schema_migrations VALUES(?,?)",
      args: [name, sha256(sql)],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
export const privateFile = (path) => chmod(path, 0o600);
export function fail(error) {
  console.error(
    error?.safeMessage ||
      "Operation failed; check configuration and private diagnostic context. No secrets or row values were printed.",
  );
  process.exitCode = 1;
}
