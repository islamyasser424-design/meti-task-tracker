// Opt-in, dedicated meti-bench-* database only. Never run against archives/live.
import { args, loadEnv, connect, migration, fail } from "./common.mjs";
import { hashPassword, randomToken } from "../src/security.mjs";
import { TaskService } from "../src/tasks.mjs";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
const a = args({
  env: { type: "string" },
  database: { type: "string" },
  samples: { type: "string", default: "100" },
  output: { type: "string", default: "private/measure-turso.json" },
});
try {
  await loadEnv(a.env);
  const n = Number(a.samples);
  if (
    !/^meti-bench-[a-z0-9-]+$/.test(a.database) ||
    !Number.isSafeInteger(n) ||
    n < 1 ||
    n > 1000
  )
    throw new Error(
      "Dedicated benchmark database and 1..1000 samples required",
    );
  const host = new URL(process.env.LIVE_DB_URL?.replace(/^libsql:/, "https:"))
    .hostname;
  if (!host.startsWith(a.database + "-"))
    throw new Error("URL does not match dedicated benchmark database name");
  const org = process.env.TURSO_ORG,
    token = process.env.TURSO_MANAGEMENT_TOKEN;
  if (!/^[\w-]+$/.test(org) || !token)
    throw new Error("Missing management credentials");
  const usage = async () => {
    const r = await fetch(
      `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}/databases/${encodeURIComponent(a.database)}/usage`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error("Usage API failed");
    const value = (await r.json()).database?.total;
    if (
      !Number.isFinite(value?.rows_read) ||
      !Number.isFinite(value?.rows_written)
    )
      throw new Error("Unknown usage shape");
    return value;
  };
  const db = connect("LIVE_DB");
  try {
    await migration(db, "live");
    const user = {
      id: randomUUID(),
      username: `bench-${randomUUID()}`,
      display_name: "Synthetic benchmark",
      role: "admin",
    };
    await db.execute({
      sql: "INSERT INTO meti_users(id,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
      args: [
        user.id,
        user.username,
        user.display_name,
        await hashPassword(randomToken(), process.env.AUTH_PEPPER),
        user.role,
      ],
    });
    // Management counters are asynchronous; record raw before/after and mark
    // inconclusive rather than report a false zero when they have not caught up.
    const before = await usage(),
      started = new Date().toISOString(),
      svc = new TaskService(db);
    let retries = 0;
    for (let i = 0; i < n; i++) {
      const id = String(100000000000 + i),
        key = randomUUID(),
        body = {
          occurred_at: new Date().toISOString(),
          shift: "Morning",
          unit: "Synthetic",
          pc_no: "01",
          qtc_name: "",
          task_id: id,
          task_link: `https://labeling.robot.car/#/do/SellIvandar/queue/synthetic/id/${id}`,
          pass: "FP",
          stage: "Lidar Stage",
          modality: "Lidar",
          queue_name: "synthetic",
          object_count: 3,
        };
      await svc.create(body, key, user);
      if (i % 20 === 0) {
        await svc.create(body, key, user);
        retries++;
      }
    }
    const baseline = await svc.list(
      new URL("https://benchmark.invalid/api/tasks?limit=50"),
      user,
    );
    await svc.list(
      new URL(
        `https://benchmark.invalid/api/tasks/changes?cursor=${Math.max(0, baseline.changes_cursor - 10)}&limit=100`,
      ),
      user,
      { changes: true },
    );
    await svc.report(
      user,
      new URL("https://benchmark.invalid/api/reports/summary"),
    );
    let after = await usage();
    for (let i = 0; i < 6 && after.rows_written <= before.rows_written; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      after = await usage();
    }
    const conclusive = after.rows_written > before.rows_written;
    const result = {
      started,
      finished: new Date().toISOString(),
      isolated_database: a.database,
      samples: n,
      retries,
      source:
        "official Turso database Usage API; includes any other traffic on this dedicated database and may include delayed setup traffic",
      before,
      after,
      measured_delta: conclusive
        ? {
            rows_read: after.rows_read - before.rows_read,
            rows_written: after.rows_written - before.rows_written,
          }
        : null,
      conclusive,
      limitations:
        "Wait for counters to settle, repeat in a quiet isolated database and compare Stats before using this as a per-request cost. No rows were deleted.",
    };
    await mkdir(dirname(a.output), { recursive: true, mode: 0o700 });
    await writeFile(a.output, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
    if (!conclusive) process.exitCode = 2;
  } finally {
    db.close();
  }
} catch (e) {
  fail(e);
}
