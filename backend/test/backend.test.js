import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import worker from "../src/index.js";

// Load local .env if present
let localEnv = {};
try {
  const envPath = path.resolve(import.meta.dirname || ".", "../.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const l of lines) {
      const match = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) localEnv[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
} catch(e) {}

const TEST_ENV = {
  TURSO_URL: process.env.TURSO_URL || localEnv.TURSO_URL || "https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline",
  TURSO_TOKEN: process.env.TURSO_TOKEN || localEnv.TURSO_TOKEN || "",
  SESSION_SECRET: process.env.SESSION_SECRET || localEnv.SESSION_SECRET || "test_secret_key_meeg_dev_2026",
  ALLOWED_ORIGIN: "https://islamyasser424-design.github.io"
};

describe("MEEG Secure Backend Comprehensive Test Suite", () => {

  let adminToken = "";

  test("Health check endpoint returns ok", async () => {
    const req = new Request("https://worker.local/api/health", { method: "GET" });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.service, "meeg-secure-backend");
  });

  test("Login rejects invalid credentials", async () => {
    const req = new Request("https://worker.local/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "WrongPassword123!" })
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, "invalid_credentials");
  });

  test("Login succeeds with migrated PBKDF2 hash for admin", async () => {
    const req = new Request("https://worker.local/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Meti@123456" })
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.user.username, "admin");
    assert.ok(["admin", "super admin"].includes(data.user.role));
    assert.ok(data.token, "Expected session token in response");
    adminToken = data.token;

    // Check Set-Cookie header
    const cookieHeader = res.headers.get("Set-Cookie");
    assert.ok(cookieHeader, "Expected Set-Cookie header");
    assert.ok(cookieHeader.includes("meeg_session="));
    assert.ok(cookieHeader.includes("HttpOnly"));
    assert.ok(cookieHeader.includes("Secure"));
  });

  test("/api/me endpoint verifies authenticated session via Bearer token", async () => {
    const meReq = new Request("https://worker.local/api/me", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const meRes = await worker.fetch(meReq, TEST_ENV);
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.ok, true);
    assert.equal(meData.user.username, "admin");
    assert.ok(["admin", "super admin"].includes(meData.user.role));
  });

  test("/api/me rejects unauthenticated request", async () => {
    const req = new Request("https://worker.local/api/me", { method: "GET" });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 401);
  });

  test("Admin can list users via /api/users", async () => {
    const req = new Request("https://worker.local/api/users", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.users));
    assert.ok(data.users.length > 0);
    // Ensure password hashes are never exposed in user listings
    for (const u of data.users) {
      assert.equal(u.password, undefined);
    }
  });

  test("/api/tasks endpoint returns paginated tasks for authenticated user", async () => {
    const tasksReq = new Request("https://worker.local/api/tasks?limit=5", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const tasksRes = await worker.fetch(tasksReq, TEST_ENV);
    assert.equal(tasksRes.status, 200);
    const tasksData = await tasksRes.json();
    assert.equal(tasksData.ok, true);
    assert.ok(Array.isArray(tasksData.tasks));
    assert.ok(tasksData.tasks.length <= 5);
    assert.ok(tasksData.total > 0, "Total count should be positive");
  });

  test("/api/tasks rejects unauthenticated request without token", async () => {
    const unauthReq = new Request("https://worker.local/api/tasks?limit=5", {
      method: "GET"
    });
    const res = await worker.fetch(unauthReq, TEST_ENV);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.error, "unauthorized");
  });

  test("/api/analytics/overview returns aggregate KPI metrics", async () => {
    const overviewReq = new Request("https://worker.local/api/analytics/overview", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const overviewRes = await worker.fetch(overviewReq, TEST_ENV);
    assert.equal(overviewRes.status, 200);
    const data = await overviewRes.json();
    assert.equal(data.ok, true);
    assert.ok(data.overview.total_tasks > 0);
    assert.ok(data.overview.pass_count >= 0);
    assert.ok(data.overview.pass_rate >= 0);
  });

  test("/api/tasks rejects duplicate task submission", async () => {
    const payload = {
      timestamp: "2026-10-21 12:00:00",
      shift: "Shift 1",
      unit: "Unit 1",
      pc_no: "PC-01",
      labeler_name: "Test Labeler",
      national_id: "29801010000000",
      task_id: "DUPLICATE_TEST_ID_" + Date.now(),
      task_link: "https://example.com/task/1",
      pass: "Pass",
      modality: "2D",
      queue_name: "Default Queue",
      object_count: 5
    };

    const res1 = await worker.fetch(new Request("https://worker.local/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), TEST_ENV);
    assert.equal(res1.status, 201);

    const res2 = await worker.fetch(new Request("https://worker.local/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), TEST_ENV);
    assert.equal(res2.status, 409);
    const data2 = await res2.json();
    assert.equal(data2.error, "duplicate_task");

    // Clean up created test row immediately to ensure database remains 100% clean
    await fetch(TEST_ENV.TURSO_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + TEST_ENV.TURSO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "DELETE FROM task_submissions WHERE task_id = ?", args: [{ type: "text", value: payload.task_id }] } }
        ]
      })
    });
  });

  test("/api/queues and /api/qtc return configured operational entities", async () => {
    const qReq = new Request("https://worker.local/api/queues", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const qRes = await worker.fetch(qReq, TEST_ENV);
    assert.equal(qRes.status, 200);
    const qData = await qRes.json();
    assert.equal(qData.ok, true);
    assert.ok(qData.queues.length > 0);

    const qtcReq = new Request("https://worker.local/api/qtc", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const qtcRes = await worker.fetch(qtcReq, TEST_ENV);
    assert.equal(qtcRes.status, 200);
    const qtcData = await qtcRes.json();
    assert.equal(qtcData.ok, true);
    assert.ok(qtcData.qtc.length > 0);
  });

  test("CORS headers returned for authorized origin", async () => {
    const req = new Request("https://worker.local/api/health", {
      method: "OPTIONS",
      headers: { "Origin": "https://islamyasser424-design.github.io" }
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://islamyasser424-design.github.io");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });

  test("/api/archive/2026 returns records from archive_2026 table", async () => {
    const req = new Request("https://worker.local/api/archive/2026?limit=5", {
      method: "GET"
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.archive, "2026");
    assert.ok(data.total > 0, "Total in archive_2026 should be positive");
    assert.ok(Array.isArray(data.rows));
  });

  test("/api/archive/2025 returns records from archive_2025 table", async () => {
    const req = new Request("https://worker.local/api/archive/2025?limit=5", {
      method: "GET"
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.archive, "2025");
    assert.ok(data.total > 0, "Total in archive_2025 should be positive");
    assert.ok(Array.isArray(data.rows));
  });

  test("Logout clears session cookie", async () => {
    const req = new Request("https://worker.local/api/auth/logout", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 200);
    const cookie = res.headers.get("Set-Cookie");
    assert.ok(cookie.includes("Max-Age=0"));
  });

  test("PUT /api/tasks/:id is permanently disabled and returns 403", async () => {
    const req = new Request("https://worker.local/api/tasks/1", {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ labeler_name: "Hacker" })
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, "forbidden");
    assert.equal(data.message, "Task editing is permanently disabled");
  });

  test("DELETE /api/tasks/:id is permanently disabled and returns 403", async () => {
    const req = new Request("https://worker.local/api/tasks/1", {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${adminToken}`
      }
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, "forbidden");
    assert.equal(data.message, "Task deletion is permanently disabled");
  });

});
