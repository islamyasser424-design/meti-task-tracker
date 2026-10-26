async function testLiveAPI() {
  const baseUrl = "https://meeg-secure-api.islamyasser424.workers.dev";
  console.log("=== Testing Live Production Cloudflare Worker Endpoints ===");
  console.log(`URL: ${baseUrl}\n`);

  // 1. Health check
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    console.log(`1. GET /api/health: HTTP ${res.status}`);
    const data = await res.json();
    console.log("   Payload:", data);
  } catch (e) {
    console.log("1. /api/health error:", e.message);
  }

  // 2. Queues check (previously was failing with HTTP 500 no such column is_hidden)
  try {
    const res = await fetch(`${baseUrl}/api/queues`);
    console.log(`\n2. GET /api/queues: HTTP ${res.status}`);
    const data = await res.json();
    console.log(`   Success: ${data.ok}, Queues count: ${data.queues ? data.queues.length : 0}`);
    if (data.queues && data.queues.length > 0) {
      console.log("   Sample queue:", data.queues[0]);
    }
  } catch (e) {
    console.log("2. /api/queues error:", e.message);
  }
}

testLiveAPI().catch(console.error);
