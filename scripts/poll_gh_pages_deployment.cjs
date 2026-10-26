async function pollGHPages() {
  console.log("=== Polling GitHub Pages Deployment Verification ===");
  const base = "https://islamyasser424-design.github.io/meti-task-tracker/dashboard.html";

  for (let attempt = 1; attempt <= 20; attempt++) {
    const url = `${base}?_t=${Date.now()}`;
    try {
      const res = await fetch(url, { headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" } });
      const text = await res.text();
      const hasDualIndicators = text.includes("sheetsSyncStatus") && text.includes("syncStatus");
      const hasCachedSyncMeta = text.includes("_cachedSyncMeta");

      console.log(`[Attempt ${attempt}/20] Status: ${res.status}, Length: ${text.length}, Dual Indicators: ${hasDualIndicators}, CachedMeta: ${hasCachedSyncMeta}`);

      if (hasDualIndicators && hasCachedSyncMeta) {
        console.log("\n🎉 GITHUB PAGES PRODUCTION DEPLOYMENT VERIFIED 100% LIVE!");
        return true;
      }
    } catch (e) {
      console.log(`[Attempt ${attempt}/20] Network error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 6000));
  }

  console.log("Polling timed out.");
  return false;
}

pollGHPages().catch(console.error);
