import { args, loadEnv, connect, migration, fail } from "./common.mjs";
const a = args({
  target: { type: "string" },
  env: { type: "string" },
  local: { type: "boolean" },
});
try {
  if (!["live", "2025", "2026"].includes(a.target)) throw new Error("target");
  await loadEnv(a.env);
  const db = connect(
    { live: "LIVE_DB", 2025: "ARCHIVE_2025", 2026: "ARCHIVE_2026" }[a.target],
    { local: a.local },
  );
  try {
    await migration(db, a.target === "live" ? "live" : "archive");
    console.log(`Additive ${a.target} migration applied and checksummed`);
  } finally {
    db.close();
  }
} catch (e) {
  fail(e);
}
