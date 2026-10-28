import { args, loadEnv, connect, fail } from "./common.mjs";
import { hashPassword } from "../src/security.mjs";
import { randomUUID } from "node:crypto";
// Read password through an environment variable (no CLI password, no logged hash).
const a = args({
  username: { type: "string" },
  name: { type: "string" },
  role: { type: "string", default: "operator" },
  env: { type: "string" },
  local: { type: "boolean" },
});
try {
  await loadEnv(a.env);
  if (
    !/^[a-z0-9._-]{3,80}$/.test(a.username) ||
    !a.name ||
    !["operator", "supervisor", "admin"].includes(a.role)
  )
    throw new Error("Invalid user");
  const password = process.env.METI_INITIAL_PASSWORD;
  delete process.env.METI_INITIAL_PASSWORD;
  const hash = await hashPassword(password, process.env.AUTH_PEPPER);
  const db = connect("LIVE_DB", { local: a.local });
  try {
    await db.execute({
      sql: "INSERT INTO meti_users(id,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
      args: [randomUUID(), a.username, a.name, hash, a.role],
    });
    console.log("User created. No password or hash printed.");
  } finally {
    db.close();
  }
} catch (e) {
  fail(e);
}
