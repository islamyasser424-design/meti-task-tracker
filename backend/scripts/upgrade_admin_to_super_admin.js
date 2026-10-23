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

console.log("Updating User ID 1 (admin) to role 'super admin' in Turso Database...");

const updateRes = await fetch(localEnv.TURSO_URL, {
  method: "POST",
  headers: { "Authorization": "Bearer " + localEnv.TURSO_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({
    requests: [
      { type: "execute", stmt: { sql: "UPDATE dashboard_users SET role = 'super admin' WHERE id = 1 AND username = 'admin'" } },
      { type: "execute", stmt: { sql: "SELECT id, username, full_name, role, email, status FROM dashboard_users ORDER BY id ASC" } }
    ]
  })
});

const d = await updateRes.json();
if (d.results && d.results[0]?.type === "ok") {
  console.log("UPDATE executed successfully!");
  const rows = d.results[1]?.response?.result?.rows || [];
  console.log(`Current users in database (${rows.length}):`);
  rows.forEach(r => {
    console.log(`ID: ${r[0]?.value} | User: ${r[1]?.value} | Name: ${r[2]?.value} | Role: ${r[3]?.value} | Status: ${r[5]?.value}`);
  });
} else {
  console.error("Error updating user:", JSON.stringify(d));
}
