async function triggerProductionSync() {
  const baseUrl = "https://meeg-secure-api.islamyasser424.workers.dev";
  console.log("=== Triggering Production Live Sync via /api/sync-sheets ===");

  const token = "meeg_internal_sync_secure_token_2026";
  const startTime = Date.now();

  const res = await fetch(`${baseUrl}/api/sync-sheets`, {
    method: "POST",
    headers: {
      "x-sync-token": token,
      "Content-Type": "application/json"
    }
  });

  const duration = Date.now() - startTime;
  console.log(`Response status: HTTP ${res.status} (took ${duration}ms)`);
  const data = await res.json();
  console.log("Response payload:", data);
}

triggerProductionSync().catch(console.error);
