import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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

// Setup in-memory D1 test database for isolated execution
const memoryDb = new DatabaseSync(":memory:");
const schemaSql = fs.readFileSync(path.resolve(import.meta.dirname || ".", "../schema.sql"), "utf-8");
memoryDb.exec(schemaSql);

// Seed admin user, queue, and initial tasks
memoryDb.exec(`INSERT OR REPLACE INTO dashboard_users (id, username, password, full_name, role, status) 
  VALUES (1, 'admin', 'pbkdf2-sha256$100000$lQdZ-uE3FICGwjjSiUhynA$kR_e-UR7l5EKGL8uUaVzGQbP8hg-KNKMg-KR5geqOjQ', 'Islam Yasser (Super Admin)', 'admin', 'active');`);
memoryDb.exec(`INSERT OR IGNORE INTO custom_queues (id, name, highlight, is_hidden, created_at) 
  VALUES (1, 'default_queue', 'Default', 0, datetime('now'));`);
memoryDb.exec(`INSERT OR IGNORE INTO custom_qtc (id, name, shift, role, created_at)
  VALUES (1, 'Test QTC', 'Morning', 'QTC', datetime('now'));`);
memoryDb.exec(`INSERT OR IGNORE INTO archive_2026 (id, task_id, source) VALUES (1, 'arch_26_1', 'Archive 2026');`);
memoryDb.exec(`INSERT OR IGNORE INTO archive_2025 (id, task_id, source) VALUES (1, 'arch_25_1', 'Archive 2025');`);

const mockD1 = {
  prepare: (sql) => ({
    bind: (...params) => ({
      all: async () => ({ results: memoryDb.prepare(sql).all(...params) }),
      run: async () => {
        const info = memoryDb.prepare(sql).run(...params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
    }),
    all: async () => ({ results: memoryDb.prepare(sql).all() }),
    run: async () => {
      const info = memoryDb.prepare(sql).run();
      return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
    }
  })
};

const TEST_ENV = {
  DB: mockD1,
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
  });

  test("/api/me rejects unauthenticated request", async () => {
    const meReq = new Request("https://worker.local/api/me", { method: "GET" });
    const meRes = await worker.fetch(meReq, TEST_ENV);
    assert.equal(meRes.status, 401);
  });

  test("Admin can list users via /api/users", async () => {
    const usersReq = new Request("https://worker.local/api/users", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const usersRes = await worker.fetch(usersReq, TEST_ENV);
    assert.equal(usersRes.status, 200);
    const usersData = await usersRes.json();
    assert.equal(usersData.ok, true);
    assert.ok(Array.isArray(usersData.users));
    assert.ok(usersData.users.length > 0);
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
  });

  test("/api/tasks rejects unauthenticated request without token", async () => {
    const tasksReq = new Request("https://worker.local/api/tasks", { method: "GET" });
    const tasksRes = await worker.fetch(tasksReq, TEST_ENV);
    assert.equal(tasksRes.status, 401);
  });

  test("/api/analytics/overview returns aggregate KPI metrics", async () => {
    const ovReq = new Request("https://worker.local/api/analytics/overview", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const ovRes = await worker.fetch(ovReq, TEST_ENV);
    assert.equal(ovRes.status, 200);
    const ovData = await ovRes.json();
    assert.equal(ovData.ok, true);
  });

  test("/api/queues and /api/qtc return configured operational entities", async () => {
    const qReq = new Request("https://worker.local/api/queues", { method: "GET" });
    const qRes = await worker.fetch(qReq, TEST_ENV);
    assert.equal(qRes.status, 200);
    const qData = await qRes.json();
    assert.equal(qData.ok, true);
    assert.ok(Array.isArray(qData.queues));

    const qtcReq = new Request("https://worker.local/api/qtc", { method: "GET" });
    const qtcRes = await worker.fetch(qtcReq, TEST_ENV);
    assert.equal(qtcRes.status, 200);
    const qtcData = await qtcRes.json();
    assert.equal(qtcData.ok, true);
    assert.ok(Array.isArray(qtcData.qtc));
  });

  test("CORS headers returned for authorized origin", async () => {
    const req = new Request("https://worker.local/api/health", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://islamyasser424-design.github.io",
        "Access-Control-Request-Method": "POST"
      }
    });
    const res = await worker.fetch(req, TEST_ENV);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://islamyasser424-design.github.io");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });

  test("/api/archive/2026 returns records from archive_2026 table", async () => {
    const archReq = new Request("https://worker.local/api/archive/2026", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const archRes = await worker.fetch(archReq, TEST_ENV);
    assert.equal(archRes.status, 200);
    const archData = await archRes.json();
    assert.equal(archData.ok, true);
    assert.ok(Array.isArray(archData.rows));
  });

  test("/api/archive/2025 returns records from archive_2025 table", async () => {
    const archReq = new Request("https://worker.local/api/archive/2025", {
      method: "GET",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const archRes = await worker.fetch(archReq, TEST_ENV);
    assert.equal(archRes.status, 200);
    const archData = await archRes.json();
    assert.equal(archData.ok, true);
    assert.ok(Array.isArray(archData.rows));
  });

  test("PUT /api/tasks/:id is permanently disabled and returns 403", async () => {
    const editReq = new Request("https://worker.local/api/tasks/1", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ notes: "Attempted edit" })
    });
    const editRes = await worker.fetch(editReq, TEST_ENV);
    assert.equal(editRes.status, 403);
    const editData = await editRes.json();
    assert.equal(editData.error, "forbidden");
  });

  test("DELETE /api/tasks/:id is permanently disabled and returns 403", async () => {
    const delReq = new Request("https://worker.local/api/tasks/1", {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const delRes = await worker.fetch(delReq, TEST_ENV);
    assert.equal(delRes.status, 403);
    const delData = await delRes.json();
    assert.equal(delData.error, "forbidden");
  });

});
