const assert = require('assert');

async function verifyProductionE2E() {
  console.log("=== COMPREHENSIVE POST-DEPLOYMENT E2E VERIFICATION ===");
  const baseUrl = "https://meeg-secure-api.islamyasser424.workers.dev";
  console.log(`Target: ${baseUrl}\n`);

  // 1. Health check
  console.log("--- 1. Testing /api/health ---");
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.strictEqual(healthRes.status, 200, "Health check must return 200");
  const healthData = await healthRes.json();
  console.log("✓ Health check OK:", healthData);

  // 2. Admin Login
  console.log("\n--- 2. Testing Admin Login & Auth Session ---");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Meti@123456" })
  });
  assert.strictEqual(loginRes.status, 200, "Admin login must succeed");
  const loginData = await loginRes.json();
  console.log(`✓ Logged in as: ${loginData.user.username} (Role: ${loginData.user.role})`);
  assert.ok(loginData.token, "Must receive signed session token");
  const token = loginData.token;

  // 3. User verification via /api/me
  console.log("\n--- 3. Testing /api/me ---");
  const meRes = await fetch(`${baseUrl}/api/me`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  assert.strictEqual(meRes.status, 200, "/api/me must return 200");
  const meData = await meRes.json();
  console.log(`✓ Session verified for user: ${meData.user.full_name}`);

  // 4. Queues endpoint /api/queues
  console.log("\n--- 4. Testing /api/queues (is_hidden column verification) ---");
  const qRes = await fetch(`${baseUrl}/api/queues`);
  assert.strictEqual(qRes.status, 200, "/api/queues must return 200");
  const qData = await qRes.json();
  console.log(`✓ Loaded ${qData.queues.length} custom queues successfully!`);
  assert.ok(qData.queues.length >= 27, "Must have at least 27 queues");
  console.log("Sample queue:", qData.queues[0]);

  // 5. Tasks retrieval /api/tasks
  console.log("\n--- 5. Testing /api/tasks & ETag Caching ---");
  const tasksRes = await fetch(`${baseUrl}/api/tasks?limit=10`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  assert.strictEqual(tasksRes.status, 200, "/api/tasks must return 200");
  const etag = tasksRes.headers.get("ETag");
  console.log(`✓ Received ETag: ${etag}`);
  const tasksData = await tasksRes.json();
  console.log(`✓ Total tasks reported by backend: ${tasksData.total}`);
  console.log(`✓ First page tasks returned: ${tasksData.tasks.length}`);
  console.log("Sync meta attached:", tasksData.sync_meta);

  // Test conditional 304 Not Modified
  console.log("\n--- 6. Testing Conditional Request with If-None-Match ---");
  const conditionalRes = await fetch(`${baseUrl}/api/tasks?limit=10`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "If-None-Match": etag
    }
  });
  console.log(`✓ Conditional request returned: HTTP ${conditionalRes.status} (Expected 304 - ZERO rows transferred)`);
  assert.strictEqual(conditionalRes.status, 304, "Must return HTTP 304 Not Modified on matching ETag");

  // 7. Verify Task 1466273467 in live feed
  console.log("\n--- 7. Verifying Task 1466273467 (Rahma Talat) in Live Search ---");
  const searchRes = await fetch(`${baseUrl}/api/tasks?search=1466273467`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  assert.strictEqual(searchRes.status, 200, "Search query must return 200");
  const searchData = await searchRes.json();
  console.log(`Search result count for 1466273467: ${searchData.tasks.length}`);
  assert.ok(searchData.tasks.length > 0, "Task 1466273467 must be returned in search");
  const foundTask = searchData.tasks[0];
  console.log("✓ Found Task in Production API:", {
    id: foundTask.id,
    task_id: foundTask.task_id,
    labeler_name: foundTask.labeler_name,
    timestamp: foundTask.timestamp,
    pass: foundTask.pass,
    queue_name: foundTask.queue_name,
    submission_key: foundTask.submission_key
  });

  // 8. Testing Incremental Delta Endpoint /api/tasks/delta
  console.log("\n--- 8. Testing Incremental Delta Stream (/api/tasks/delta) ---");
  const cursor = (foundTask.updated_at || foundTask.timestamp) + ":" + foundTask.id;
  const deltaRes = await fetch(`${baseUrl}/api/tasks/delta?cursor=${encodeURIComponent(cursor)}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  assert.strictEqual(deltaRes.status, 200, "Delta stream must return 200");
  const deltaData = await deltaRes.json();
  console.log(`✓ Delta poll successful: ${deltaData.changes.length} changes beyond cursor, next cursor: ${deltaData.cursor}`);
  console.log("Sync meta attached in delta:", deltaData.sync_meta);

  // 9. Testing Overview Analytics Report
  console.log("\n--- 9. Testing /api/analytics/overview ---");
  const ovRes = await fetch(`${baseUrl}/api/analytics/overview`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  assert.strictEqual(ovRes.status, 200, "Analytics overview must return 200");
  const ovData = await ovRes.json();
  console.log(`✓ Analytics Overview OK (Total: ${ovData.total_submissions || ovData.total || 'OK'})`);

  console.log("\n=======================================================");
  console.log("   🎉 ALL 9 E2E POST-DEPLOYMENT CHECKS PASSED 100%!   ");
  console.log("=======================================================");
}

verifyProductionE2E().catch(err => {
  console.error("E2E Verification Failed:", err);
  process.exit(1);
});
