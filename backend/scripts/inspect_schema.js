import fs from "node:fs";
import path from "node:path";

let localEnv = {};
try {
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const l of lines) {
      const match = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) localEnv[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
} catch(e) {}

const url = localEnv.TURSO_URL;
const token = localEnv.TURSO_TOKEN;

async function run() {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='task_submissions'" } },
        { type: "execute", stmt: { sql: "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='task_submissions'" } }
      ]
    })
  });
  const data = await res.json();
  console.log("TABLE DDL:");
  console.log(data.results[0]?.response?.result?.rows[0]?.[0]?.value);
  console.log("\nINDEXES:");
  const indexes = data.results[1]?.response?.result?.rows || [];
  indexes.forEach(idx => console.log(idx[0]?.value, "->", idx[1]?.value));
}

run().catch(console.error);
