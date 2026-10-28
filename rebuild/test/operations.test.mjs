import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, task } from "./helpers.mjs";
import { backupLocal } from "../scripts/backup.mjs";
import { TaskService } from "../src/tasks.mjs";
import { randomUUID } from "node:crypto";
import { evaluateUsage, orgUsage } from "../scripts/monitor.mjs";
import { isIsoDay } from "../src/security.mjs";
test("report date validation rejects normalized invalid dates", async () => {
  assert.equal(isIsoDay("2026-02-30"), false);
  assert.equal(isIsoDay("2028-02-29"), true);
  const f = await fixture();
  try {
    const session = await f.login();
    const r = await f.call(
      "/api/reports/summary?source=new&from=2026-02-30&to=2026-02-30",
      { session },
    );
    assert.equal(r.status, 400);
  } finally {
    await f.close();
  }
});
test("independent backup restores every table and value without modifying source", async () => {
  const f = await fixture();
  try {
    await new TaskService(f.databases.live).create(
      task(),
      randomUUID(),
      f.users.alpha,
    );
    const result = await backupLocal(
      f.paths.live,
      join(f.dir, "independent.sqlite"),
    );
    assert.equal(result.restored, true);
    assert.equal(result.tables.find((t) => t.table === "meti_tasks").rows, 1);
    assert.equal(
      (await f.databases.live.execute("SELECT COUNT(*) n FROM meti_tasks"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      () => backupLocal(f.paths.live, join(f.dir, "independent.sqlite")),
      /already exists/,
    );
  } finally {
    await f.close();
  }
});
test("monitor evaluates account-wide billed counters and fails closed on unknown API shape", async () => {
  const checks = evaluateUsage({
    rows_read: 350000000,
    rows_written: 100,
    storage_bytes: 1000,
  });
  assert.equal(checks[0].alert, true);
  assert.equal(checks[1].alert, false);
  const usage = await orgUsage({
    org: "synthetic",
    token: randomUUID(),
    fetcher: async () =>
      Response.json({
        organization: {
          usage: { rows_read: 99, rows_written: 4, storage_bytes: 22 },
        },
      }),
  });
  assert.equal(usage.rows_read, 99);
  await assert.rejects(() =>
    orgUsage({
      org: "synthetic",
      token: randomUUID(),
      fetcher: async () => Response.json({}),
    }),
  );
});
