import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("index.html");
let html = fs.readFileSync(filePath, "utf8");

// 1. Patch apiFetch with timeout
const oldApiFetch = `function apiFetch(endpoint, options) {
  options = options || {};
  var url = endpoint.startsWith("http") ? endpoint : (API_BASE + endpoint);
  var headers = Object.assign({
    "Content-Type": "application/json"
  }, options.headers || {});

  var token = getAuthToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = "Bearer " + token;
  }

  return fetch(url, Object.assign({}, options, {
    headers: headers,
    credentials: "include"
  }));
}`;

const newApiFetch = `function apiFetch(endpoint, options) {
  options = options || {};
  var url = endpoint.startsWith("http") ? endpoint : (API_BASE + endpoint);
  var headers = Object.assign({
    "Content-Type": "application/json"
  }, options.headers || {});

  var token = getAuthToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = "Bearer " + token;
  }

  // Network timeout safeguard (default 20 seconds)
  var controller = (typeof AbortController !== "undefined" && !options.signal) ? new AbortController() : null;
  var timeoutId = null;
  if (controller) {
    options.signal = controller.signal;
    var timeoutMs = options.timeout || 20000;
    timeoutId = setTimeout(function() {
      try { controller.abort(); } catch(e) {}
    }, timeoutMs);
  }

  return fetch(url, Object.assign({}, options, {
    headers: headers,
    credentials: "include"
  })).finally(function() {
    if (timeoutId) clearTimeout(timeoutId);
  });
}`;

// 2. Patch doSubmit with safe json parsing and existing data passing
const oldDoSubmitFetch = `  apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(taskBody)
  })
  .then(function(res) {
    return res.json().then(function(data) {
      if (res.status === 409) {
        btn.disabled = false;
        btn.textContent = "\\u2714\\u00a0 Submit Task";
        showDbDupDialog(payload.taskId, new Date(), null);
        return;
      }
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit task");
      }
      onSuccess();
    });
  })
  .catch(function(err) {
    onError(err);
  });`;

const newDoSubmitFetch = `  apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(taskBody)
  })
  .then(function(res) {
    return res.json().catch(function() { return {}; }).then(function(data) {
      if (res.status === 409) {
        btn.disabled = false;
        btn.textContent = "\\u2714\\u00a0 Submit Task";
        var existingTs = (data && data.existing && data.existing.timestamp) ? data.existing.timestamp : new Date();
        showDbDupDialog(payload.taskId, existingTs, null, data && data.existing);
        return;
      }
      if (!res.ok) {
        throw new Error(data.message || ("Failed to submit task (HTTP " + res.status + ")"));
      }
      onSuccess();
    });
  })
  .catch(function(err) {
    onError(err);
  });`;

// 3. Add showDbDupDialog and closeDbDupDialog definition
const dupDialogFuncs = `
function showDbDupDialog(taskId, date, time, existing) {
  var overlay = document.getElementById("dbDupOverlay");
  if (!overlay) return;
  var tidEl = document.getElementById("dbDupTaskId");
  var dtEl = document.getElementById("dbDupDate");
  var tmEl = document.getElementById("dbDupTime");

  if (tidEl) tidEl.textContent = taskId || "—";

  var parsedDate = date ? new Date(date) : new Date();
  var isValidDate = !isNaN(parsedDate.getTime());

  if (dtEl) {
    dtEl.textContent = isValidDate ? parsedDate.toLocaleDateString("en-CA") : (date || "—");
  }
  if (tmEl) {
    tmEl.textContent = isValidDate ? parsedDate.toLocaleTimeString("en-US", { hour12: false }) : (time || "—");
  }

  overlay.classList.add("show");
}

function closeDbDupDialog() {
  var overlay = document.getElementById("dbDupOverlay");
  if (overlay) overlay.classList.remove("show");
}

var _dbDupOkBtn = document.getElementById("dbDupOkBtn");
if (_dbDupOkBtn) {
  _dbDupOkBtn.addEventListener("click", closeDbDupDialog);
}
var _dbDupOverlay = document.getElementById("dbDupOverlay");
if (_dbDupOverlay) {
  _dbDupOverlay.addEventListener("click", function(e) {
    if (e.target === _dbDupOverlay) closeDbDupDialog();
  });
}
`;

// Replace apiFetch
if (html.includes(oldApiFetch.replace(/\n/g, "\r\n"))) {
  html = html.replace(oldApiFetch.replace(/\n/g, "\r\n"), newApiFetch.replace(/\n/g, "\r\n"));
} else if (html.includes(oldApiFetch)) {
  html = html.replace(oldApiFetch, newApiFetch);
} else {
  console.warn("Could not match oldApiFetch");
}

// Replace doSubmitFetch
if (html.includes(oldDoSubmitFetch.replace(/\n/g, "\r\n"))) {
  html = html.replace(oldDoSubmitFetch.replace(/\n/g, "\r\n"), newDoSubmitFetch.replace(/\n/g, "\r\n"));
} else if (html.includes(oldDoSubmitFetch)) {
  html = html.replace(oldDoSubmitFetch, newDoSubmitFetch);
} else {
  console.warn("Could not match oldDoSubmitFetch");
}

// Add dupDialogFuncs right after closeAdminModal
const targetClose = `function closeAdminModal() {
  document.getElementById("adminModal").classList.remove("show");
}`;

if (html.includes(targetClose.replace(/\n/g, "\r\n"))) {
  html = html.replace(targetClose.replace(/\n/g, "\r\n"), targetClose.replace(/\n/g, "\r\n") + dupDialogFuncs.replace(/\n/g, "\r\n"));
} else if (html.includes(targetClose)) {
  html = html.replace(targetClose, targetClose + dupDialogFuncs);
} else {
  console.warn("Could not match targetClose");
}

fs.writeFileSync(filePath, html, "utf8");
console.log("Successfully patched index.html with timeout, duplicate dialog, and resilient submission handling.");
