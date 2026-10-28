// Executes the actual API/domain and SQLite transactions with a virtual 8h clock.
// This reports observed operations, NOT estimated Turso billed row reads.
import { fixture, task } from "../test/helpers.mjs";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
const f = await fixture(),
  clients = [],
  base = f.clock.now;
try {
  const hash = (
    await f.databases.live.execute({
      sql: "SELECT password_hash FROM meti_users WHERE id=?",
      args: [f.users.alpha.id],
    })
  ).rows[0].password_hash;
  for (let i = 0; i < 30; i++) {
    const username = `synthetic${i}`,
      id = randomUUID(),
      role = i < 27 ? "operator" : "supervisor";
    await f.databases.live.execute({
      sql: "INSERT INTO meti_users(id,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
      args: [id, username, `Synthetic ${i}`, hash, role],
    });
    clients.push({
      id,
      role,
      session: await f.login(username),
      cursor: 0,
      version: "",
    });
  }
  // History is synthetic and written only into a temporary local fixture database.
  await f.databases.live.execute({
    sql: `WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO meti_tasks(owner_id,labeler_name,idempotency_key,request_hash,business_key,occurred_at,work_date,shift,unit,pc_no,task_link,task_id,pass,stage,modality,queue_name,object_count) SELECT ?,'Synthetic history','seed-'||x,'seed','seed-'||x,'2026-10-27T12:00:00.000Z','2026-10-27','Morning','A','01','https://labeling.robot.car/#/id/'||x,printf('%012d',x),'FP','Lidar Stage','Lidar','synthetic',1 FROM n`,
    args: [f.users.alpha.id],
  });
  for (const c of clients) {
    const r = await f.call("/api/tasks?source=new&limit=50", {
      session: c.session,
    });
    if (r.status !== 200) throw new Error("Baseline failed");
    c.cursor = r.data.changes_cursor;
    c.version = r.data.version;
  }
  const initialChanges = Number(
    (await f.databases.live.execute("SELECT total_changes() n")).rows[0].n,
  );
  f.stats.calls = 0;
  f.stats.statements = 0;
  f.stats.queries = [];
  let versions = 0,
    changeRequests = 0,
    posted = 0,
    retried = 0;
  const started = performance.now();
  for (let tick = 0; tick < 1920; tick++) {
    f.clock.now = base + tick * 15000;
    for (let i = 0; i < 27; i++)
      if ((tick + i) % 40 === 0) {
        const client = clients[i],
          body = task({ occurred_at: new Date(f.clock.now).toISOString() }),
          key = randomUUID();
        const saved = await f.call("/api/tasks", {
          method: "POST",
          body,
          key,
          session: client.session,
        });
        if (saved.status !== 201)
          throw new Error(`Synthetic save failed (${saved.status})`);
        posted++;
        if (posted % 20 === 0) {
          const retry = await f.call("/api/tasks", {
            method: "POST",
            body,
            key,
            session: client.session,
          });
          if (retry.status !== 200) throw new Error("Retry failed");
          retried++;
        }
      }
    for (const client of clients) {
      const marker = await f.call("/api/tasks/version", {
        session: client.session,
      });
      versions++;
      if (marker.status !== 200)
        throw new Error(`Version failed (${marker.status})`);
      if (marker.data.version !== client.version) {
        let data;
        do {
          const response = await f.call(
            `/api/tasks/changes?cursor=${client.cursor}&limit=100`,
            { session: client.session },
          );
          if (response.status !== 200) throw new Error("Catch-up failed");
          data = response.data;
          client.cursor = data.cursor;
          changeRequests++;
        } while (data.has_more);
        client.version = data.version;
      }
    }
  }
  const calls = f.stats.calls,
    statements = f.stats.statements,
    queries = f.stats.queries;
  const actualChanges =
    Number(
      (await f.databases.live.execute("SELECT total_changes() n")).rows[0].n,
    ) - initialChanges;
  const plans = [];
  const seen = new Set();
  for (const query of queries)
    if (/^SELECT /.test(query.sql) && !seen.has(query.sql)) {
      seen.add(query.sql);
      const plan = (
        await f.databases.live.execute({
          sql: "EXPLAIN QUERY PLAN " + query.sql,
          args: query.args,
        })
      ).rows.map((r) => r.detail);
      plans.push({ sql: query.sql, plan });
      if (plan.some((p) => /SCAN (c|t)\b|USE TEMP B-TREE/.test(p)))
        throw new Error("Unbounded task query plan");
    }
  const report = {
    measured_at: new Date().toISOString(),
    mode: "local actual API + SQLite, virtual time; not cloud billing",
    scenario: {
      users: 30,
      operators: 27,
      supervisors: 3,
      hours: 8,
      poll_seconds: 15,
      initial_live_rows: 50000,
      tasks_per_operator_hour: 6,
      workdays_per_month: 22,
      hidden_tabs: 0,
    },
    measured: {
      new_tasks: posted,
      idempotent_retries: retried,
      version_requests: versions,
      changes_requests: changeRequests,
      turso_equivalent_client_calls: calls,
      sql_statements: statements,
      sqlite_row_modifications_including_triggers: actualChanges,
      wall_ms: Math.round(performance.now() - started),
    },
    billing: {
      actual_turso_rows_read: null,
      actual_turso_rows_written: null,
      reason:
        "Cloud credentials were not supplied; use measure-turso.mjs with a dedicated meti-bench-* database. SQLite total_changes excludes index maintenance and is not a Turso billing counter.",
    },
    projections: {
      api_requests_per_workday:
        versions + changeRequests + posted + retried + 60,
      api_requests_per_22_workdays:
        (versions + changeRequests + posted + retried + 60) * 22,
      version_requests_at_100_users_per_day: (100 * 8 * 3600) / 15,
    },
    plans,
  };
  await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../.local/benchmark.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await f.close();
}
