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

const checkRes = await fetch(localEnv.TURSO_URL, {
  method: "POST",
  headers: { "Authorization": "Bearer " + localEnv.TURSO_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({
    requests: [
      { type: "execute", stmt: { sql: "PRAGMA table_info(custom_queues)" } }
    ]
  })
});
const checkData = await checkRes.json();
const cols = (checkData.results[0]?.response?.result?.rows || []).map(r => r[1]?.value);
console.log("Current custom_queues columns:", cols);

if (!cols.includes("is_hidden")) {
  console.log("Adding is_hidden column to custom_queues...");
  const alterRes = await fetch(localEnv.TURSO_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer " + localEnv.TURSO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql: "ALTER TABLE custom_queues ADD COLUMN is_hidden INTEGER DEFAULT 0" } }
      ]
    })
  });
  const alterData = await alterRes.json();
  console.log("Alter response:", JSON.stringify(alterData));
} else {
  console.log("is_hidden column already exists!");
}
