import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import worker from "../src/index.js";

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

const TEST_ENV = {
  TURSO_URL: localEnv.TURSO_URL,
  TURSO_TOKEN: localEnv.TURSO_TOKEN,
  SESSION_SECRET: localEnv.SESSION_SECRET || "meeg_super_secret_session_key_for_testing_purposes_only_32_chars!",
  ALLOWED_ORIGIN: "https://islamyasser424-design.github.io"
};

test("SUPER ADMIN PROTECTION SUITE", async (suite) => {
  // 1. Authenticate as Super Admin (user ID 1: admin)
  const loginRes = await worker.fetch(new Request("https://worker.local/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Meti@123456" })
  }), TEST_ENV);
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  const superAdminToken = loginData.token;
  assert.equal(loginData.user.role, "super admin", "User 1 must have role 'super admin'");

  // 2. Rule: Nobody can delete Super Admin ID 1
  await suite.test("Rule: Super Admin cannot be deleted by anyone (returns 403 Forbidden)", async () => {
    const delRes = await worker.fetch(new Request("https://worker.local/api/users/1", {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${superAdminToken}` }
    }), TEST_ENV);
    assert.equal(delRes.status, 403, "Must return 403 Forbidden");
    const delData = await delRes.json();
    assert.match(delData.message, /permanently protected/i);
  });

  // 3. Rule: Super Admin cannot be demoted
  await suite.test("Rule: Super Admin cannot be demoted to regular admin or supervisor", async () => {
    const demoteRes = await worker.fetch(new Request("https://worker.local/api/users/1", {
      method: "PUT",
      headers: { "Authorization": `Bearer ${superAdminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" })
    }), TEST_ENV);
    assert.equal(demoteRes.status, 403, "Must return 403 Forbidden on demoting super admin");
    const demoteData = await demoteRes.json();
    assert.match(demoteData.message, /cannot be demoted/i);
  });

  // 4. Rule: Super Admin status cannot be deactivated
  await suite.test("Rule: Super Admin status cannot be deactivated", async () => {
    const deactRes = await worker.fetch(new Request("https://worker.local/api/users/1", {
      method: "PUT",
      headers: { "Authorization": `Bearer ${superAdminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" })
    }), TEST_ENV);
    assert.equal(deactRes.status, 403, "Must return 403 Forbidden on deactivating super admin");
  });

  // 5. Rule: Super Admin can authorize another Super Admin
  let newSuperId = null;
  const testUsername = "temp_super_test_" + Date.now();
  await suite.test("Rule: Super Admin can create another Super Admin account", async () => {
    const createRes = await worker.fetch(new Request("https://worker.local/api/users", {
      method: "POST",
      headers: { "Authorization": `Bearer ${superAdminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: testUsername,
        full_name: "Test Second Super Admin",
        email: `${testUsername}@meti.ai`,
        role: "super admin"
      })
    }), TEST_ENV);
    assert.equal(createRes.status, 201, "Super Admin should successfully create another Super Admin");
    const createData = await createRes.json();
    assert.ok(createData.ok);

    // Fetch user to get ID
    const listRes = await worker.fetch(new Request("https://worker.local/api/users", {
      headers: { "Authorization": `Bearer ${superAdminToken}` }
    }), TEST_ENV);
    const listData = await listRes.json();
    const createdUser = listData.users.find(u => u.username === testUsername);
    assert.ok(createdUser, "Created super admin must exist");
    assert.equal(createdUser.role, "super admin");
    newSuperId = createdUser.id;
  });

  // 6. Rule: Super Admins cannot delete each other ("منقدرش نشيل بعض من السوبر ادمن")
  await suite.test("Rule: Super Admins CANNOT delete each other", async () => {
    assert.ok(newSuperId, "Must have valid newSuperId");
    const delSecondRes = await worker.fetch(new Request(`https://worker.local/api/users/${newSuperId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${superAdminToken}` }
    }), TEST_ENV);
    assert.equal(delSecondRes.status, 403, "Must return 403 when trying to delete another Super Admin");
    const delSecondData = await delSecondRes.json();
    assert.match(delSecondData.message, /permanently protected/i);
  });

  // Teardown: Clean up temporary test user via direct DB
  if (newSuperId) {
    await fetch(localEnv.TURSO_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + localEnv.TURSO_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "DELETE FROM dashboard_users WHERE id = " + Number(newSuperId) } }
        ]
      })
    });
    console.log("Teardown: Cleaned up temporary test user ID", newSuperId);
  }
});
