import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { fixture, task } from "./helpers.mjs";
import { TaskService } from "../src/tasks.mjs";
import {
  normalizeTask,
  hashPassword,
  verifyPassword,
  reportScope,
} from "../src/security.mjs";
import { migration } from "../scripts/common.mjs";

test("real additive migrations keep unrelated data and can be reapplied", async () => {
  const f = await fixture();
  try {
    const db = f.databases.live;
    await db.execute("CREATE TABLE legacy_sentinel(value TEXT)");
    await db.execute("INSERT INTO legacy_sentinel VALUES('keep me')");
    await migration(db, "live");
    assert.equal(
      (await db.execute("SELECT value FROM legacy_sentinel")).rows[0].value,
      "keep me",
    );
  } finally {
    await f.close();
  }
});
test("confirmed save, retry, scoped dashboard, source restrictions and server-owned actor", async () => {
  const f = await fixture();
  try {
    const a = await f.login(),
      b = await f.login("bravo"),
      manager = await f.login("manager"),
      key = randomUUID(),
      body = task();
    assert.equal(
      (await f.call("/api/tasks", { method: "POST", body, key })).status,
      401,
    );
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body: { ...body, labeler_name: "spoof" },
          key,
          session: a,
        })
      ).status,
      400,
    );
    const first = await f.call("/api/tasks", {
      method: "POST",
      body,
      key,
      session: a,
    });
    assert.equal(first.status, 201);
    assert.ok(first.data.task.id);
    assert.ok(first.data.server_time);
    assert.equal(first.data.task.labeler_name, f.users.alpha.display_name);
    const replay = await f.call("/api/tasks", {
      method: "POST",
      body,
      key,
      session: a,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.task.id, first.data.task.id);
    assert.equal(replay.data.summary.task_count, 1);
    assert.equal(replay.data.summary.object_count, 7);
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body: { ...body, object_count: 10 },
          key,
          session: a,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body,
          key: randomUUID(),
          session: a,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.call("/api/tasks?source=new", { session: b })).data.tasks.length,
      0,
    );
    assert.equal(
      (await f.call("/api/tasks?source=new", { session: manager })).data.tasks
        .length,
      1,
    );
    for (const endpoint of [
      "/api/archive/2025",
      "/api/reports/summary?source=all",
      "/api/tasks/export",
    ])
      assert.equal((await f.call(endpoint, { session: a })).status, 403);
    assert.equal(
      (await f.call("/api/tasks?source=all", { session: manager })).status,
      400,
    );
    for (const method of ["PUT", "PATCH", "DELETE"])
      assert.equal(
        (
          await f.call(`/api/tasks/${first.data.task.id}`, {
            method,
            body: {},
            session: manager,
          })
        ).status,
        405,
      );
    assert.equal(
      (await f.call("/api/reports/summary?source=all", { session: manager }))
        .data.summary,
      null,
    );
    const r = await f.call("/api/reports/summary?source=new", { session: a });
    assert.equal(r.data.summary.task_count, 1);
    assert.equal(r.data.daily.length, 1);
  } finally {
    await f.close();
  }
});
test("Task ID repeats legitimately by pass, actor and occurrence, preserving leading zeros", async () => {
  const f = await fixture();
  try {
    const s = new TaskService(f.databases.live),
      body = task();
    for (const [u, b] of [
      [f.users.alpha, body],
      [f.users.alpha, { ...body, pass: "QA" }],
      [f.users.bravo, body],
      [
        f.users.alpha,
        {
          ...body,
          occurred_at: new Date(Date.parse(body.occurred_at) + 1).toISOString(),
        },
      ],
    ])
      await s.create(b, randomUUID(), u);
    const r = await s.list(
      new URL("http://localhost/api/tasks"),
      f.users.manager,
    );
    assert.equal(r.tasks.length, 4);
    assert.ok(r.tasks.every((t) => t.task_id === "001234567890"));
    assert.equal(r.summary.object_count, 28);
  } finally {
    await f.close();
  }
});
test("database concurrency across independent clients: one task, one event, exact summaries", async () => {
  const f = await fixture();
  const second = createClient({ url: `file:${f.paths.live}`, concurrency: 1 });
  try {
    const services = [
        new TaskService(f.databases.live),
        new TaskService(second),
      ],
      body = task(),
      key = randomUUID();
    const result = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        services[i % 2].create(body, key, f.users.alpha),
      ),
    );
    assert.equal(new Set(result.map((r) => r.task.id)).size, 1);
    assert.equal(result.filter((r) => !r.replayed).length, 1);
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        services[i % 2].create(
          task({
            occurred_at: new Date(
              Date.parse(body.occurred_at) + i + 1,
            ).toISOString(),
            object_count: i,
          }),
          randomUUID(),
          f.users.alpha,
        ),
      ),
    );
    assert.equal(
      (await f.databases.live.execute("SELECT COUNT(*) n FROM meti_changes"))
        .rows[0].n,
      31,
    );
    const sums = (
      await f.databases.live.execute(
        "SELECT task_count,object_count FROM meti_report_totals WHERE scope='all'",
      )
    ).rows[0];
    assert.equal(sums.task_count, 31);
    assert.equal(sums.object_count, 442);
  } finally {
    second.close();
    await f.close();
  }
});
test("failed summary update rolls back task and change log in the SAME transaction", async () => {
  const f = await fixture();
  try {
    await f.databases.live.execute(
      "CREATE TRIGGER synthetic_failure BEFORE INSERT ON meti_report_daily BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    );
    await assert.rejects(() =>
      new TaskService(f.databases.live).create(
        task(),
        randomUUID(),
        f.users.alpha,
      ),
    );
    assert.equal(
      (await f.databases.live.execute("SELECT COUNT(*) n FROM meti_tasks"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await f.databases.live.execute("SELECT COUNT(*) n FROM meti_changes"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.databases.live.execute(
          "SELECT task_count FROM meti_report_totals WHERE scope='all'",
        )
      ).rows[0].task_count,
      0,
    );
  } finally {
    await f.close();
  }
});
test("disconnect catch-up is resumable with identical timestamps and scoped indexed cursors", async () => {
  const f = await fixture();
  try {
    const svc = new TaskService(f.databases.live),
      u = f.users.alpha,
      manager = f.users.manager;
    const body = task();
    const initial = await svc.list(
      new URL("http://localhost/api/tasks"),
      manager,
    );
    assert.equal(initial.changes_cursor, 0);
    for (let i = 0; i < 11; i++)
      await svc.create(
        {
          ...body,
          task_id: String(123456789000 + i),
          task_link: `https://labeling.robot.car/#/do/SellIvandar/id/${123456789000 + i}`,
        },
        randomUUID(),
        i % 2 ? u : f.users.bravo,
      );
    let cursor = initial.changes_cursor,
      ids = [];
    for (let i = 0; i < 10; i++) {
      const page = await svc.list(
        new URL(`http://localhost/api/tasks/changes?cursor=${cursor}&limit=3`),
        manager,
        { changes: true },
      );
      ids.push(...page.tasks.map((t) => t.id));
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    assert.equal(ids.length, 11);
    assert.equal(new Set(ids).size, 11);
    const own = await svc.list(
      new URL("http://localhost/api/tasks/changes?cursor=0&limit=100"),
      u,
      { changes: true },
    );
    assert.equal(own.tasks.length, 5);
    assert.ok(own.tasks.every((t) => t.owner_id === u.id));
    const sql = f.stats.queries.findLast(
      (q) => q.sql.includes("c.seq>?") && q.sql.includes("c.owner_id=?"),
    );
    const plan = (
      await f.databases.live.execute({
        sql: "EXPLAIN QUERY PLAN " + sql.sql,
        args: sql.args,
      })
    ).rows
      .map((r) => r.detail)
      .join("\n");
    assert.match(plan, /SEARCH c USING INDEX meti_changes_owner_seq/);
    assert.doesNotMatch(plan, /SCAN (c|t)\b|USE TEMP B-TREE/);
    const snap = await svc.list(
      new URL("http://localhost/api/tasks?limit=3"),
      manager,
    );
    assert.equal(snap.tasks.length, 3);
    assert.equal(snap.changes_cursor, cursor);
    assert.equal(snap.summary.task_count, 11);
    const older = await svc.list(
      new URL(`http://localhost/api/tasks?cursor=${snap.cursor}&limit=3`),
      manager,
    );
    assert.ok(older.tasks.every((t) => t.seq < snap.cursor));
  } finally {
    await f.close();
  }
});
test("committed task survives lost invalidation, coordinator restart and retry", async () => {
  const f = await fixture();
  try {
    const session = await f.login(),
      manager = await f.login("manager");
    const old = (await f.call("/api/tasks/version", { session: manager })).data
      .version;
    const original = f.state.put.bind(f.state);
    let failed = false;
    f.state.put = async (key, value) => {
      if (key === "version:all" && !failed) {
        failed = true;
        throw new Error("Injected storage outage");
      }
      return original(key, value);
    };
    const body = task(),
      key = randomUUID();
    assert.equal(
      (await f.call("/api/tasks", { method: "POST", body, key, session }))
        .status,
      503,
    );
    f.state.put = original;
    f.restart();
    const marker = await f.call("/api/tasks/version", { session: manager });
    assert.notEqual(marker.data.version, old);
    const catchup = await f.call("/api/tasks/changes?cursor=0", {
      session: manager,
    });
    assert.equal(catchup.data.tasks.length, 1);
    assert.equal(catchup.data.summary.task_count, 1);
    const retry = await f.call("/api/tasks", {
      method: "POST",
      body,
      key,
      session,
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.data.replayed, true);
    assert.equal(retry.data.summary.task_count, 1);
  } finally {
    await f.close();
  }
});
test("idle version checks do not query Turso; other operators do not invalidate own scope", async () => {
  const f = await fixture();
  try {
    const a = await f.login(),
      b = await f.login("bravo");
    const version = (await f.call("/api/tasks/version", { session: b })).data
      .version;
    const before = f.stats.calls;
    for (let i = 0; i < 100; i++)
      assert.equal(
        (await f.call("/api/tasks/version", { session: a })).status,
        200,
      );
    assert.equal(f.stats.calls, before);
    await f.call("/api/tasks", {
      method: "POST",
      body: task(),
      key: randomUUID(),
      session: a,
    });
    assert.equal(
      (await f.call("/api/tasks/version", { session: b })).data.version,
      version,
    );
    assert.equal(
      (await f.call("/api/tasks/changes?cursor=0", { session: b })).data.tasks
        .length,
      0,
    );
  } finally {
    await f.close();
  }
});
test("CSRF, origin checks, durable rate limits, logout and permission revocation", async () => {
  const f = await fixture();
  try {
    const a = await f.login(),
      admin = await f.login("admin");
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body: task(),
          session: a,
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body: task(),
          session: a,
          headers: { "X-CSRF-Token": "" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call("/api/tasks", {
          method: "POST",
          body: task(),
          session: a,
          headers: { Origin: "" },
        })
      ).status,
      403,
    );
    const r = await f.call(`/api/admin/users/${f.users.alpha.id}`, {
      method: "PATCH",
      body: { active: false, role: "operator" },
      session: admin,
    });
    assert.equal(r.status, 200);
    assert.equal((await f.call("/api/me", { session: a })).status, 401);
    assert.equal(
      (
        await f.call("/api/auth/logout", {
          method: "POST",
          body: {},
          session: admin,
        })
      ).status,
      200,
    );
    assert.equal((await f.call("/api/me", { session: admin })).status, 401);
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await f.call("/api/auth/login", {
            method: "POST",
            body: { username: "unknown", password: randomUUID() },
          })
        ).status,
        401,
      );
    f.restart();
    assert.equal(
      (
        await f.call("/api/auth/login", {
          method: "POST",
          body: { username: "unknown", password: randomUUID() },
        })
      ).status,
      429,
    );
    const b = await f.login("bravo");
    await f.databases.live.execute({
      sql: "UPDATE meti_users SET active=0,auth_version=auth_version+1 WHERE id=?",
      args: [f.users.bravo.id],
    });
    f.clock.now += 60001;
    assert.equal((await f.call("/api/me", { session: b })).status, 401);
  } finally {
    await f.close();
  }
});
test("hashes reject plaintext; task validation prevents SQL injection and archive overlap", async () => {
  const f = await fixture();
  try {
    const password = randomUUID(),
      hash = await hashPassword(password, f.env.AUTH_PEPPER);
    assert.ok(await verifyPassword(password, hash, f.env.AUTH_PEPPER));
    assert.equal(
      await verifyPassword(password, password, f.env.AUTH_PEPPER),
      false,
    );
    assert.throws(() =>
      normalizeTask(task({ object_count: -1 }), f.users.alpha),
    );
    assert.throws(() =>
      normalizeTask(task({ task_link: "javascript:alert(1)" }), f.users.alpha),
    );
    assert.throws(() =>
      normalizeTask(task({ object_count: "10" }), f.users.alpha),
    );
    const svc = new TaskService(f.databases.live);
    await svc.create(
      task({ queue_name: "x'); DROP TABLE meti_tasks; --" }),
      randomUUID(),
      f.users.alpha,
    );
    assert.equal(
      (await f.databases.live.execute("SELECT COUNT(*) n FROM meti_tasks"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      () =>
        svc.create(
          task({ occurred_at: "2025-12-31T23:59:59.000Z" }),
          randomUUID(),
          f.users.alpha,
        ),
      (e) => e.code === "occurrence_before_live_cutover",
    );
    assert.equal(reportScope(f.users.alpha), `user:${f.users.alpha.id}`);
  } finally {
    await f.close();
  }
});
