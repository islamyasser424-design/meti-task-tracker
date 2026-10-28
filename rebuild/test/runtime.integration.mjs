import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runtime } from "./runtime.mjs";
import { task } from "./helpers.mjs";

test("actual Worker + SQLite Durable Object + libSQL HTTP: login → commit → dashboard → retry", async () => {
  const r = await runtime();
  try {
    const call = async (
      path,
      { method = "GET", body, session, key, headers = {} } = {},
    ) => {
      const response = await fetch(r.origin + path, {
        method,
        headers: {
          ...(body
            ? { "Content-Type": "application/json", Origin: r.origin }
            : {}),
          ...(session
            ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
            : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: response.status, data, headers: response.headers };
    };
    const assets = await call("/");
    assert.equal(assets.status, 200);
    assert.match(
      assets.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    assert.equal((await call("/api/me")).status, 401);
    const login = async (username) => {
      const response = await call("/api/auth/login", {
        method: "POST",
        body: { username, password: r.f.password },
      });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return {
        cookie: response.headers.get("set-cookie").split(";")[0],
        csrf: response.data.csrf_token,
      };
    };
    const alpha = await login("alpha"),
      manager = await login("manager"),
      bravo = await login("bravo");
    const initial = await call("/api/tasks?source=new", { session: manager });
    assert.equal(initial.data.tasks.length, 0);
    const before = r.hrana.metrics.requests;
    for (let i = 0; i < 20; i++)
      assert.equal(
        (await call("/api/tasks/version", { session: manager })).status,
        200,
      );
    assert.equal(
      r.hrana.metrics.requests,
      before,
      "Version polling does not send database HTTP requests",
    );
    const body = task(),
      key = randomUUID(),
      saved = await call("/api/tasks", {
        method: "POST",
        body,
        session: alpha,
        key,
      });
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    assert.equal(saved.data.summary.task_count, 1);
    const retry = await call("/api/tasks", {
      method: "POST",
      body,
      session: alpha,
      key,
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.data.task.id, saved.data.task.id);
    const changes = await call(
      `/api/tasks/changes?cursor=${initial.data.changes_cursor}`,
      { session: manager },
    );
    assert.equal(changes.status, 200);
    assert.equal(changes.data.tasks.length, 1);
    assert.equal(changes.data.summary.object_count, 7);
    assert.equal(
      (await call("/api/tasks/changes?cursor=0", { session: bravo })).data.tasks
        .length,
      0,
    );
    assert.equal(
      (await call("/api/archive/2025", { session: alpha })).status,
      403,
    );
    assert.equal(
      (
        await call("/api/tasks", {
          method: "POST",
          body,
          session: alpha,
          key: randomUUID(),
          headers: { "X-CSRF-Token": "" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/auth/logout", {
          method: "POST",
          body: {},
          session: alpha,
        })
      ).status,
      200,
    );
    assert.equal((await call("/api/me", { session: alpha })).status, 401);
    console.log(
      "workerd runtime, durable SQLite state, scrypt and official libSQL HTTP path verified",
    );
  } finally {
    await r.close();
  }
});
