const fs = require('fs');
const path = require('path');

// 1. Patch dashboard-ui.js
const uiPath = path.resolve(__dirname, '../../dashboard-ui.js');
let uiCode = fs.readFileSync(uiPath, 'utf8').replace(/\r\n/g, '\n');

const oldUiFetch = `  sheetLoadPromise=(async()=>{
     let failure;
     try{
       const token = (typeof getAuthToken === "function" ? getAuthToken() : (sessionStorage.getItem("meeg_auth_token") || ""));
       const apiBase = window.MEEG_API_URL || localStorage.getItem("meeg_api_url") || "https://meeg-secure-api.islamyasser424.workers.dev";
       const res = await (typeof apiFetch === "function" ? apiFetch("/api/analytics/dataset?limit=100000") : fetch(apiBase + "/api/analytics/dataset?limit=100000", {
         headers: token ? { "Authorization": "Bearer " + token } : {},
         credentials: "include"
       }));`;

const newUiFetch = `  sheetLoadPromise=(async()=>{
     let failure;
     try{
       if (typeof rawRows !== 'undefined' && Array.isArray(rawRows) && rawRows.length > 0) {
         return; // Data already loaded in memory
       }
       const token = (typeof getAuthToken === "function" ? getAuthToken() : (sessionStorage.getItem("meeg_auth_token") || ""));
       const apiBase = window.MEEG_API_URL || localStorage.getItem("meeg_api_url") || "https://meeg-secure-api.islamyasser424.workers.dev";
       const res = await (typeof apiFetch === "function" ? apiFetch("/api/analytics/dataset?limit=25000") : fetch(apiBase + "/api/analytics/dataset?limit=25000", {
         headers: token ? { "Authorization": "Bearer " + token } : {},
         credentials: "include"
       }));`;

if (uiCode.includes(oldUiFetch)) {
  uiCode = uiCode.replace(oldUiFetch, newUiFetch);
  console.log('Successfully patched dashboard-ui.js!');
} else {
  // Try direct replacement of the URL
  uiCode = uiCode.replace(/\/api\/analytics\/dataset\?limit=100000/g, '/api/analytics/dataset?limit=25000');
  console.log('Replaced limit in dashboard-ui.js via regex');
}
fs.writeFileSync(uiPath, uiCode, 'utf8');

// 2. Patch dashboard.html
const dashPath = path.resolve(__dirname, '../../dashboard.html');
let dashCode = fs.readFileSync(dashPath, 'utf8').replace(/\r\n/g, '\n');

// A. Initial tasks limit: 5000 -> 2000
dashCode = dashCode.replace('apiFetch("/api/tasks?limit=5000")', 'apiFetch("/api/tasks?limit=2000")');

// B. In fetchLiveData, don't schedule auto sync-sheets on every load
const oldFetchLiveData = `function fetchLiveData() {
  // 1. Instantly fetch from database to render UI in ~1s
  fetchLiveDataOnly();
  // 2. Schedule non-blocking silent Google Sheets auto-sync in background
  setTimeout(function() {
    syncGoogleSheetsClient(true);
  }, 1200);
}`;

const newFetchLiveData = `function fetchLiveData() {
  fetchLiveDataOnly();
}`;
dashCode = dashCode.replace(oldFetchLiveData, newFetchLiveData);

// C. In setInterval, poll fetchLiveDataOnly() instead of syncGoogleSheetsClient(true)
const oldInterval = `// 25-second continuous background polling for live submissions
setInterval(function() {
  if (document.getElementById('dashView').style.display !== 'none') {
    syncGoogleSheetsClient(true);
  }
}, 25000);`;

const newInterval = `// 30-second continuous background polling for live submissions
setInterval(function() {
  if (document.getElementById('dashView') && document.getElementById('dashView').style.display !== 'none' && _activeTab === 'tasks') {
    fetchLiveDataOnly();
  }
}, 30000);`;
dashCode = dashCode.replace(oldInterval, newInterval);

// D. Replace placeholder text
dashCode = dashCode.replace(
  'Loaded 5,000 of 51,845 records',
  'Loading live database records...'
);

fs.writeFileSync(dashPath, dashCode, 'utf8');
console.log('Successfully patched dashboard.html!');
