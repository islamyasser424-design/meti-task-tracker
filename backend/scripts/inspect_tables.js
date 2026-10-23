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

const res = await fetch(localEnv.TURSO_URL, {
  method: "POST",
  headers: { "Authorization": "Bearer " + localEnv.TURSO_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({
    requests: [
      { type: "execute", stmt: { sql: "SELECT name, sql FROM sqlite_master WHERE type = 'table'" } }
    ]
  })
});
const d = await res.json();
const rows = d.results[0]?.response?.result?.rows || [];
rows.forEach(r => {
  console.log("--- TABLE:", r[0]?.value);
  console.log(r[1]?.value);
});
