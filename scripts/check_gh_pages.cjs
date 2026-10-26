async function checkGHPages() {
  const url = "https://islamyasser424-design.github.io/meti-task-tracker/dashboard.html";
  console.log("Checking GitHub Pages at:", url);
  const res = await fetch(url);
  console.log("HTTP status:", res.status);
  const text = await res.text();
  console.log("Page size:", text.length);
  console.log("Contains sheetsSyncStatus:", text.includes("sheetsSyncStatus"));
  console.log("Contains syncStatus:", text.includes("syncStatus"));
  console.log("Contains _cachedSyncMeta:", text.includes("_cachedSyncMeta"));
}

checkGHPages().catch(console.error);
