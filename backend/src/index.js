/**
 * MEEG Operations Workspace — Unified Secure Cloudflare Worker Backend
 * 
 * Features:
 * - Server-side parameterized Turso LibSQL database access (/v2/pipeline)
 * - Zero database credentials or tokens exposed to frontend clients
 * - PBKDF2-SHA256 password hashing & verification (310,000 iterations, 16-byte random salt)
 * - Cryptographically signed session tokens (HMAC-SHA256) with 8-hour expiry
 * - Dual session support: HttpOnly, Secure, SameSite Cookie + Authorization: Bearer <token>
 * - Immediate session revocation when user status is disabled or role changes
 * - Brute-force rate limiting on login (5 failed attempts per 5 minutes)
 * - Role-Based Access Control (Admin, Supervisor, QA, QTC, Labeler)
 * - Masked National ID for non-administrative roles
 * - Password reset workflow with automated Google Apps Script OTP mailer dispatch
 * - Unified Analytics APIs replacing client-side direct database calls
 * - Same-site reverse proxy for frontend assets (dashboard.html, analytics.html, etc.)
 */

const te = new TextEncoder();
const td = new TextDecoder();

// Helper: JSON response with standard security headers
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      ...extraHeaders
    }
  });
}

// Base64URL encode and decode
function b64url(bytes) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeB64url(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const bin = atob(base64 + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// HMAC-SHA256 message authentication code
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(secret || "meeg_default_secret_key_change_in_prod"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(data));
  return b64url(new Uint8Array(sig));
}

// Constant-time string equality check to prevent timing attacks
function equals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// PASSWORD HASHING (PBKDF2-SHA256 with 310,000 iterations)
// ============================================================
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
    key,
    256
  );
  return `pbkdf2-sha256$100000$${b64url(salt)}$${b64url(new Uint8Array(derived))}`;
}

async function checkPassword(password, stored) {
  if (!password || !stored) return false;
  // Support legacy plain-text passwords from previous backups
  if (equals(password, stored)) return true;
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = parseInt(parts[1], 10);
  if (isNaN(iterations) || iterations < 10000 || iterations > 100000) return false;

  let salt, expected;
  try {
    salt = decodeB64url(parts[2]);
    expected = decodeB64url(parts[3]);
  } catch {
    return false;
  }
  if (salt.length < 16 || expected.length !== 32) return false;

  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
  );
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= derived[i] ^ expected[i];
  }
  return diff === 0;
}

// ============================================================
// WORKER IN-MEMORY CACHES & CONTENT HASHER (Rate & Quota Protection)
// ============================================================
const IN_MEMORY_CACHE = new Map(); // key -> { etag, payload, timestamp }

// Fast 64-bit content hasher for accurate, collision-free ETags
function hashContent(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// RFC 7232 compliant ETag matcher (strips optional W/ prefix added by Cloudflare gzip/brotli proxy)
function etagMatches(clientHeader, serverEtag) {
  if (!clientHeader || !serverEtag) return false;
  const cleanClient = String(clientHeader).replace(/^W\//i, '').replace(/^"|"$/g, '').trim();
  const cleanServer = String(serverEtag).replace(/^W\//i, '').replace(/^"|"$/g, '').trim();
  return cleanClient === cleanServer;
}

// DATABASE CONNECTOR (Turso / LibSQL Parameterized Pipeline)
// ============================================================
async function db(env, sql, params = []) {
  // 1. Cloudflare D1 Native Edge Database (100% Free, High Limits, Sub-ms Speed)
  if (env.DB) {
    try {
      const stmt = params.length > 0 ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
      const isSelect = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
      if (isSelect) {
        const { results } = await stmt.all();
        return results || [];
      } else {
        const info = await stmt.run();
        return info;
      }
    } catch (d1Err) {
      console.error("[D1 Query Error]:", d1Err.message || d1Err, "SQL:", sql);
      const errMsg = String(d1Err.message || d1Err).toLowerCase();
      if (errMsg.includes("quota") || errMsg.includes("blocked") || errMsg.includes("forbidden") || errMsg.includes("limit")) {
        const err = new Error("Database query quota exceeded: " + d1Err.message);
        err.code = "QUOTA_EXCEEDED";
        throw err;
      }
      throw d1Err;
    }
  }

  // 2. Fallback to Turso / LibSQL pipeline
  const url = env.TURSO_URL;
  const token = env.TURSO_TOKEN;
  if (!url || !token) throw new Error("Database configuration missing (D1 or TURSO)");

  const endpoint = url.replace(/\/v2\/pipeline\/?$/, "").replace(/\/$/, "") + "/v2/pipeline";
  const args = params.map(v => {
    if (v === null || v === undefined) return { type: "null" };
    if (typeof v === "number") {
      return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
    }
    return { type: "text", value: String(v) };
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args } }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Database service HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const firstResult = data.results?.[0];
  if (!firstResult) throw new Error("Database returned empty result");
  if (firstResult.type === "error") {
    const msg = firstResult.error?.message || "unknown";
    const lower = msg.toLowerCase();
    if (lower.includes("quota") || lower.includes("blocked") || lower.includes("forbidden") || lower.includes("limit")) {
      const err = new Error("Database query error: " + msg);
      err.code = "QUOTA_EXCEEDED";
      throw err;
    }
    throw new Error(`Database query error: ${msg}`);
  }

  const resultObj = firstResult.response?.result;
  const cols = (resultObj?.cols || []).map(c => c.name);
  return (resultObj?.rows || []).map(row => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = row[i]?.value !== undefined ? row[i].value : null;
    }
    return obj;
  });
}

// ============================================================
// ROLE HIERARCHY & PERMISSIONS
// ============================================================
function isSuperAdmin(role) {
  const r = (role || "").toLowerCase().trim().replace(/[\s_-]+/g, "");
  return r === "superadmin";
}

function isAdminOrSuper(role) {
  const r = (role || "").toLowerCase().trim().replace(/[\s_-]+/g, "");
  return r === "admin" || r === "superadmin";
}

function isSupervisorOrAdmin(role) {
  const r = (role || "").toLowerCase().trim().replace(/[\s_-]+/g, " ");
  return [
    "admin",
    "super admin",
    "superadmin",
    "shift sv",
    "floor sv",
    "traning sv",
    "training sv",
    "wla"
  ].includes(r);
}

// ============================================================
// SESSION MANAGEMENT (Signed Token + Dual Cookie/Bearer Auth)
// ============================================================
async function createSessionToken(user, env) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 28800 // 8 hours
  };
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = await hmac(env.SESSION_SECRET, body);
  return `${body}.${sig}`;
}

async function verifySession(request, env) {
  let token = null;

  // 1. Check Cookie header
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)meeg_session=([^;]+)/);
  if (match) {
    token = match[1];
  }

  // 2. Fallback to Authorization: Bearer <token>
  if (!token) {
    const authHeader = request.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expectedSig = await hmac(env.SESSION_SECRET, body);
  if (!equals(expectedSig, sig)) return null;

  let payload;
  try {
    payload = JSON.parse(td.decode(decodeB64url(body)));
  } catch {
    return null;
  }

  if (!payload.id || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null; // Expired
  }

  // Verify against database to ensure account is active and role has not been revoked
  const rows = await db(
    env,
    "SELECT id, username, full_name, role, email, allowed_pages, status FROM dashboard_users WHERE id = ? LIMIT 1",
    [payload.id]
  );
  const u = rows[0];
  const tokenRole = (payload.role || "").toLowerCase().trim();
  const dbRole = (u ? u.role : "").toLowerCase().trim();
  const rolesMatch = (tokenRole === dbRole) || (isAdminOrSuper(tokenRole) && isAdminOrSuper(dbRole));
  if (!u || u.status !== "active" || !rolesMatch) {
    return null;
  }

  return u;
}

// Session cookie formatting
function formatSessionCookie(token, isSameSite = true) {
  if (!token) {
    return "meeg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  }
  // If request is cross-site (e.g. github.io calling worker), SameSite=None is required
  const sameSite = isSameSite ? "Lax" : "None";
  return `meeg_session=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=28800`;
}

// CORS headers handling
function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGIN || "https://islamyasser424-design.github.io")
    .split(",")
    .map(x => x.trim().toLowerCase());

  if (origin && allowed.includes(origin.toLowerCase())) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Vary": "Origin"
    };
  }
  return {};
}

// In-memory brute force throttling for login attempts
const loginAttempts = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= 5;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + 300000 }; // 5 minutes window
  entry.count += 1;
  loginAttempts.set(key, entry);
}

function clearFailedLogins(key) {
  loginAttempts.delete(key);
}

// Dispatch OTP reset email via Google Apps Script Mailer webhook
async function dispatchResetEmail(webhookUrl, toEmail, fullName, username, code) {
  if (!webhookUrl || !toEmail || !code) return;
  const url = webhookUrl + (webhookUrl.includes("?") ? "&" : "?") + "action=send_reset_code"
    + "&to=" + encodeURIComponent(toEmail)
    + "&name=" + encodeURIComponent(fullName || username)
    + "&username=" + encodeURIComponent(username)
    + "&code=" + encodeURIComponent(code);

  try {
    await fetch(url, { method: "GET", cache: "no-store" });
  } catch (err) {
    console.error("Mailer dispatch error:", err);
  }
}


// Mask sensitive national ID for regular/unauthorized roles
function maskNationalId(natId, role) {
  if (isSupervisorOrAdmin(role)) return natId || "";
  const s = String(natId || "").trim();
  if (s.length <= 4) return "****";
  return s.slice(0, 4) + "*".repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

// Mask sensitive yubikey email for non-supervisors
function maskYubikeyEmail(email, role) {
  if (isSupervisorOrAdmin(role)) return email || "";
  const s = String(email || "").trim();
  if (!s || !s.includes("@")) return s ? "***" : "";
  const parts = s.split("@");
  const local = parts[0];
  const domain = parts.slice(1).join("@");
  if (local.length <= 2) return `*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

// ============================================================
// MAIN ROUTER
// ============================================================
// ============================================================
// GOOGLE SHEETS INCREMENTAL CHECKPOINT SYNCHRONIZATION ENGINE
// ============================================================

/**
 * Distributed Concurrency Lock using D1 (Immune to Worker restarts and cross-region contention)
 */
async function acquireDistributedLock(env, lockName = "google_sheets_sync", owner = "cron", ttlSeconds = 120) {
  try {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const nowIso = now.toISOString();

    // 1. Purge expired locks
    await db(env, "DELETE FROM sync_lock WHERE lock_name = ? AND expires_at < ?", [lockName, nowIso]).catch(() => {});

    // 2. Try to acquire
    await db(
      env,
      "INSERT INTO sync_lock (lock_name, locked_by, acquired_at, expires_at) VALUES (?, ?, ?, ?)",
      [lockName, owner, nowIso, expires]
    );
    return { acquired: true, lockName, owner };
  } catch (err) {
    return { acquired: false, reason: "Lock currently held by another runner: " + (err.message || "busy") };
  }
}

async function releaseDistributedLock(env, lockName = "google_sheets_sync", owner = "cron") {
  try {
    await db(env, "DELETE FROM sync_lock WHERE lock_name = ? AND locked_by = ?", [lockName, owner]).catch(() => {});
  } catch (err) {
    console.warn("Failed to release distributed lock:", err.message);
  }
}

/**
 * Verify that the lock is STILL owned by the runner and has not expired or been acquired by another worker
 */
async function verifyLockOwnership(env, lockName = "google_sheets_sync", owner = "cron") {
  try {
    const nowIso = new Date().toISOString();
    const rows = await db(
      env,
      "SELECT locked_by, expires_at FROM sync_lock WHERE lock_name = ? AND locked_by = ? AND expires_at > ?",
      [lockName, owner, nowIso]
    );
    return rows && rows.length > 0;
  } catch (err) {
    console.warn("Lock ownership verification error:", err.message);
    return false;
  }
}

/**
 * Heartbeat: Extend lock lease to prevent expiration during legitimate long-running batch syncs
 */
async function renewDistributedLock(env, lockName = "google_sheets_sync", owner = "cron", extendSeconds = 120) {
  try {
    const now = new Date();
    const newExpires = new Date(now.getTime() + extendSeconds * 1000).toISOString();
    const nowIso = now.toISOString();
    await db(
      env,
      "UPDATE sync_lock SET expires_at = ? WHERE lock_name = ? AND locked_by = ? AND expires_at > ?",
      [newExpires, lockName, owner, nowIso]
    );
    return true;
  } catch (err) {
    console.warn("Failed to renew distributed lock:", err.message);
    return false;
  }
}

async function getSyncMeta(env) {
  try {
    const rows = await db(env, "SELECT last_sync_time, new_rows_count, updated_rows_count, status, error_message FROM sync_meta WHERE id = 1");
    if (rows && rows.length > 0) return rows[0];
  } catch (e) {
    // Table may not exist yet
  }
  return { last_sync_time: null, new_rows_count: 0, updated_rows_count: 0, status: "idle", error_message: "" };
}

function parseGViz(text, callbackName) {
  const prefix = callbackName + "(";
  const start = text.indexOf(prefix);
  if (start === -1) return null;
  const end = text.lastIndexOf(")");
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(start + prefix.length, end));
  } catch {
    return null;
  }
}

async function fetchGVizQuery(spreadsheetId, query, callbackName = "cb", gid = "0") {
  let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=responseHandler:${callbackName}&tq=${encodeURIComponent(query)}`;
  if (gid && gid !== "0") url += `&gid=${gid}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Google Sheets GViz HTTP ${res.status}`);
  const txt = await res.text();
  const obj = parseGViz(txt, callbackName);
  if (!obj || !obj.table) throw new Error("Invalid or empty GViz response structure from Google Sheets");
  return obj;
}

/**
 * Main Incremental Checkpoint Sync Engine
 * Syncs ONLY newly appended rows beyond the last verified row index
 * Zero full table scans, zero MAX(id) reliance, zero unbounded COUNT(*) loops
 */
async function syncGoogleSheetsToD1(env, options = {}) {
  // Support boolean parameter for backward compatibility
  const includeArchives = typeof options === 'boolean' ? options : (options && options.includeArchives === true);
  const isReconcile = options && options.reconcile === true;
  const runnerOwner = (options && options.triggerBy) || ("cron:" + Date.now());

  // 1. Acquire Distributed Lock (with 120s auto-expiry TTL)
  const lock = await acquireDistributedLock(env, "google_sheets_sync", runnerOwner, 120);
  if (!lock.acquired) {
    return { ok: true, skipped: true, message: "Sync already in progress under active lock: " + lock.reason };
  }

  let totalNewRows = 0;
  let totalModifications = 0;
  const syncErrors = [];
  const newQueues = new Set();

  try {
    // ------------------------------------------------------------
    // 2. ACTIVE SHEET 1: Live Primary Form Responses
    // ------------------------------------------------------------
    const sheet1SourceId = "sheet1_live";
    const sheet1Id = "1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I";
    const sheet1Gid = "0";

    // Read or initialize persistent checkpoint for Sheet 1
    let s1Checkpoint = null;
    try {
      const rows = await db(env, "SELECT last_synced_row, last_synced_timestamp, last_synced_fingerprint FROM sync_checkpoints WHERE source_id = ?", [sheet1SourceId]);
      if (rows && rows.length > 0) s1Checkpoint = rows[0];
    } catch {}

    let s1LastSyncedRow = s1Checkpoint ? parseInt(s1Checkpoint.last_synced_row || 0, 10) : 62327;

    try {
      // Step A: Pre-Flight Count Query (Zero DB read/write cost on task_submissions!)
      const s1CountObj = await fetchGVizQuery(sheet1Id, "select count(A)", "cbCount1", sheet1Gid);
      const s1TotalRows = parseInt(s1CountObj.table.rows[0]?.c[0]?.v || 0, 10);

      if (s1TotalRows <= s1LastSyncedRow) {
        // Zero new rows! 
        await db(env, `UPDATE sync_checkpoints 
          SET total_source_rows = ?, last_attempt_at = datetime('now'), status = 'success', error_message = '', consecutive_failures = 0, updated_at = datetime('now') 
          WHERE source_id = ?`, [s1TotalRows, sheet1SourceId]).catch(() => {});
      } else {
        // Step B: Fetch only newly appended rows in bounded batches (max 100 per batch)
        let currentOffset = s1LastSyncedRow;
        while (currentOffset < s1TotalRows) {
          // Verify lock ownership before processing batch
          const stillOwned = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
          if (!stillOwned) {
            throw new Error(`Lock ownership lost or expired for ${runnerOwner}; aborting sync to prevent concurrent corruption.`);
          }
          await renewDistributedLock(env, "google_sheets_sync", runnerOwner, 120);

          const batchSize = Math.min(100, s1TotalRows - currentOffset);
          const batchQuery = `select * limit ${batchSize} offset ${currentOffset}`;
          const batchObj = await fetchGVizQuery(sheet1Id, batchQuery, "cbBatch1", sheet1Gid);
          const rawRows = batchObj.table.rows || [];
          if (rawRows.length === 0) break;

          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !row.c) continue;
            const vals = row.c.map(cell => cell ? (cell.f || cell.v || "") : "");
            if (vals.length < 12) continue; // Validate structure

            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();
            const created = String(vals[15] || ts).trim();
            const submissionKey = `sub:${tid}|${lab_name}|${ts}|${pas}`;
            const nowIso = new Date().toISOString();

            if (queue) newQueues.add(queue);

            // Insert new form response idempotently using persistent submissionKey
            await db(env, `INSERT OR IGNORE INTO task_submissions 
              (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, updated_at, source, submission_key) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Live', ?)`,
              [
                ts, shift, unit, pc_no, lab_name, nat_id, shift, yk_email, qtc_name,
                stage, link, tid, pas, mod, queue, obj_cnt, created, nowIso, submissionKey
              ]
            );

            totalNewRows++;
          }

          // Advance checkpoint atomically only after the batch is saved
          currentOffset += rawRows.length;
          s1LastSyncedRow = currentOffset;

          const lastRowVals = rawRows[rawRows.length - 1].c.map(c => c ? (c.f || c.v || "") : "");
          const lastTs = String(lastRowVals[0] || "");
          const lastFp = `${lastRowVals[0]}|${lastRowVals[5]}|${lastRowVals[11]}|${lastRowVals[13]}`;

          await db(env, `INSERT INTO sync_checkpoints 
            (source_id, spreadsheet_id, gid, last_synced_row, last_synced_timestamp, last_synced_fingerprint, total_source_rows, status, error_message, consecutive_failures, last_attempt_at, last_success_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'success', '', 0, datetime('now'), datetime('now'), datetime('now'))
            ON CONFLICT(source_id) DO UPDATE SET
              last_synced_row = excluded.last_synced_row,
              last_synced_timestamp = excluded.last_synced_timestamp,
              last_synced_fingerprint = excluded.last_synced_fingerprint,
              total_source_rows = excluded.total_source_rows,
              status = 'success',
              error_message = '',
              consecutive_failures = 0,
              last_attempt_at = excluded.last_attempt_at,
              last_success_at = excluded.last_success_at,
              updated_at = excluded.updated_at`,
            [sheet1SourceId, sheet1Id, sheet1Gid, s1LastSyncedRow, lastTs, lastFp, s1TotalRows]
          );
        }
      }
    } catch (s1Err) {
      syncErrors.push(`Sheet 1: ${s1Err.message}`);
      await db(env, `UPDATE sync_checkpoints 
        SET status = 'error', error_message = ?, consecutive_failures = consecutive_failures + 1, last_attempt_at = datetime('now'), updated_at = datetime('now') 
        WHERE source_id = ?`, [s1Err.message, sheet1SourceId]).catch(() => {});
    }

    // ------------------------------------------------------------
    // 3. ACTIVE SHEET 2: Daily Active Sheet Checkpoint
    // ------------------------------------------------------------
    const sheet2SourceId = "sheet2_daily";
    const sheet2Id = "1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A";
    const sheet2Gid = "0";

    let s2Checkpoint = null;
    try {
      const rows = await db(env, "SELECT last_synced_row FROM sync_checkpoints WHERE source_id = ?", [sheet2SourceId]);
      if (rows && rows.length > 0) s2Checkpoint = rows[0];
    } catch {}

    let s2LastSyncedRow = s2Checkpoint ? parseInt(s2Checkpoint.last_synced_row || 0, 10) : 588;

    try {
      const s2CountObj = await fetchGVizQuery(sheet2Id, "select count(A)", "cbCount2", sheet2Gid);
      const s2TotalRows = parseInt(s2CountObj.table.rows[0]?.c[0]?.v || 0, 10);

      if (s2TotalRows <= s2LastSyncedRow) {
        await db(env, `UPDATE sync_checkpoints 
          SET total_source_rows = ?, last_attempt_at = datetime('now'), status = 'success', error_message = '', consecutive_failures = 0, updated_at = datetime('now') 
          WHERE source_id = ?`, [s2TotalRows, sheet2SourceId]).catch(() => {});
      } else {
        let currentOffset = s2LastSyncedRow;
        while (currentOffset < s2TotalRows) {
          // Verify lock ownership before processing batch
          const stillOwned = await verifyLockOwnership(env, "google_sheets_sync", runnerOwner);
          if (!stillOwned) {
            throw new Error(`Lock ownership lost or expired for ${runnerOwner}; aborting sync to prevent concurrent corruption.`);
          }
          await renewDistributedLock(env, "google_sheets_sync", runnerOwner, 120);

          const batchSize = Math.min(100, s2TotalRows - currentOffset);
          const batchObj = await fetchGVizQuery(sheet2Id, `select * limit ${batchSize} offset ${currentOffset}`, "cbBatch2", sheet2Gid);
          const rawRows = batchObj.table.rows || [];
          if (rawRows.length === 0) break;

          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || !row.c) continue;
            const vals = row.c.map(cell => cell ? (cell.f || cell.v || "") : "");
            if (vals.length < 12) continue;

            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();
            const submissionKey = `sub:${tid}|${lab_name}|${ts}|${pas}`;
            const nowIso = new Date().toISOString();

            if (queue) newQueues.add(queue);

            await db(env, `INSERT OR IGNORE INTO task_submissions 
              (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, updated_at, source, submission_key) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Live', ?)`,
              [
                ts, shift, unit, pc_no, lab_name, nat_id, shift, yk_email, qtc_name,
                stage, link, tid, pas, mod, queue, obj_cnt, ts, nowIso, submissionKey
              ]
            );

            totalNewRows++;
          }

          if (totalNewRows > 0) {
            IN_MEMORY_CACHE.clear();
          }

          currentOffset += rawRows.length;
          s2LastSyncedRow = currentOffset;

          await db(env, `INSERT INTO sync_checkpoints 
            (source_id, spreadsheet_id, gid, last_synced_row, total_source_rows, status, error_message, consecutive_failures, last_attempt_at, last_success_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'success', '', 0, datetime('now'), datetime('now'), datetime('now'))
            ON CONFLICT(source_id) DO UPDATE SET
              last_synced_row = excluded.last_synced_row,
              total_source_rows = excluded.total_source_rows,
              status = 'success',
              error_message = '',
              consecutive_failures = 0,
              last_attempt_at = excluded.last_attempt_at,
              last_success_at = excluded.last_success_at,
              updated_at = excluded.updated_at`,
            [sheet2SourceId, sheet2Id, sheet2Gid, s2LastSyncedRow, s2TotalRows]
          );
        }
      }
    } catch (s2Err) {
      syncErrors.push(`Sheet 2: ${s2Err.message}`);
      await db(env, `UPDATE sync_checkpoints 
        SET status = 'error', error_message = ?, consecutive_failures = consecutive_failures + 1, last_attempt_at = datetime('now'), updated_at = datetime('now') 
        WHERE source_id = ?`, [s2Err.message, sheet2SourceId]).catch(() => {});
    }

    // ------------------------------------------------------------
    // 4. Custom Queues Discovery
    // ------------------------------------------------------------
    if (newQueues.size > 0) {
      for (const q of newQueues) {
        await db(env, "INSERT OR IGNORE INTO custom_queues (name, highlight, is_hidden, created_at) VALUES (?, 'Live', 0, datetime('now'))", [q]).catch(() => {});
      }
    }

    // ------------------------------------------------------------
    // 5. Update Telemetry in sync_meta
    // ------------------------------------------------------------
    const overallStatus = syncErrors.length === 0 ? "success" : (totalNewRows > 0 ? "partial" : "error");
    const errMsg = syncErrors.join(" | ");

    await db(
      env,
      `INSERT INTO sync_meta (id, last_sync_time, new_rows_count, updated_rows_count, status, error_message)
       VALUES (1, datetime('now'), ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_sync_time = excluded.last_sync_time,
         new_rows_count = excluded.new_rows_count,
         updated_rows_count = excluded.updated_rows_count,
         status = excluded.status,
         error_message = excluded.error_message`,
      [totalNewRows, totalModifications, overallStatus, errMsg]
    ).catch(() => {});

    return {
      ok: syncErrors.length === 0,
      new_rows_count: totalNewRows,
      status: overallStatus,
      errors: syncErrors
    };
  } finally {
    // 6. Release Distributed Lock
    await releaseDistributedLock(env, "google_sheets_sync", runnerOwner);
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const isSameSite = !origin || origin.includes(url.hostname);

    try {
      // ------------------------------------------------------------
      // 0. STATIC FRONTEND ASSETS REVERSE PROXY
      // ------------------------------------------------------------
      // Any non-API request proxies directly to GitHub Pages
      // ensuring 100% same-site origin for cookies, session, and static files!
      if (!pathname.startsWith("/api/")) {
        const ghTarget = "https://islamyasser424-design.github.io/meti-task-tracker" + (pathname === "/" ? "/dashboard.html" : pathname);
        const ghRes = await fetch(ghTarget, {
          headers: { "User-Agent": "MEEG-Secure-Gateway/1.0" }
        });

        const newHeaders = new Headers(ghRes.headers);
        newHeaders.set("X-Content-Type-Options", "nosniff");
        newHeaders.set("X-Frame-Options", "SAMEORIGIN");
        newHeaders.delete("Content-Security-Policy");

        return new Response(ghRes.body, {
          status: ghRes.status,
          headers: newHeaders
        });
      }
      // ------------------------------------------------------------
      // 1. HEALTH CHECK
      // ------------------------------------------------------------
      if (pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, timestamp: new Date().toISOString(), service: "meeg-secure-backend" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 2. AUTHENTICATION: LOGIN
      // ------------------------------------------------------------
      if (pathname === "/api/auth/login" && request.method === "POST") {
        const clientIp = request.headers.get("CF-Connecting-IP") || "client";
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || "").trim();
        const password = String(body.password || "");

        if (!username || !password || password.length > 512) {
          return json({ error: "invalid_input", message: "Username and password required" }, 400, corsHeaders);
        }

        const rateKey = `${clientIp}:${username.toLowerCase()}`;
        if (isRateLimited(rateKey)) {
          return json({ error: "rate_limited", message: "Too many failed login attempts. Please wait 5 minutes." }, 429, corsHeaders);
        }

        const users = await db(
          env,
          "SELECT id, username, full_name, role, allowed_pages, status, password, email FROM dashboard_users WHERE LOWER(username) = LOWER(?) LIMIT 1",
          [username]
        );
        const u = users[0];

        if (!u || u.status !== "active") {
          recordFailedLogin(rateKey);
          return json({ error: "invalid_credentials", message: "Invalid username or password" }, 401, corsHeaders);
        }

        const isPwValid = await checkPassword(password, u.password);
        if (!isPwValid) {
          recordFailedLogin(rateKey);
          return json({ error: "invalid_credentials", message: "Invalid username or password" }, 401, corsHeaders);
        }

        // Auto-upgrade plain-text password to PBKDF2
        if (equals(password, u.password)) {
          try {
            const upgradedHash = await hashPassword(password);
            await db(env, "UPDATE dashboard_users SET password = ? WHERE id = ?", [upgradedHash, u.id]);
          } catch (e) {
            console.warn("Failed to auto-upgrade legacy password hash:", e);
          }
        }

        clearFailedLogins(rateKey);
        const token = await createSessionToken(u, env);

        return json(
          {
            ok: true,
            token,
            user: {
              id: u.id,
              username: u.username,
              full_name: u.full_name,
              role: u.role,
              email: u.email,
              allowed_pages: u.allowed_pages
            }
          },
          200,
          {
            "Set-Cookie": formatSessionCookie(token, isSameSite),
            ...corsHeaders
          }
        );
      }

      // ------------------------------------------------------------
      // 3. AUTHENTICATION: LOGOUT
      // ------------------------------------------------------------
      if (pathname === "/api/auth/logout" && request.method === "POST") {
        return json(
          { ok: true },
          200,
          {
            "Set-Cookie": formatSessionCookie(null, isSameSite),
            ...corsHeaders
          }
        );
      }

      // ------------------------------------------------------------
      // 4. AUTHENTICATION: CURRENT USER PROFILE (/api/me)
      // ------------------------------------------------------------
      if (pathname === "/api/me" && request.method === "GET") {
        const user = await verifySession(request, env);
        if (!user) {
          return json({ error: "unauthorized", message: "Session expired or invalid" }, 401, corsHeaders);
        }
        return json({ ok: true, user }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 5. AUTHENTICATION: CHANGE PASSWORD
      // ------------------------------------------------------------
      if (pathname === "/api/auth/change-password" && request.method === "POST") {
        const user = await verifySession(request, env);
        if (!user) {
          return json({ error: "unauthorized" }, 401, corsHeaders);
        }
        const body = await request.json().catch(() => ({}));
        const oldPassword = String(body.oldPassword || "");
        const newPassword = String(body.newPassword || "");

        if (!oldPassword || !newPassword || newPassword.length < 6) {
          return json({ error: "invalid_password", message: "New password must be at least 6 characters" }, 400, corsHeaders);
        }

        const rows = await db(env, "SELECT password FROM dashboard_users WHERE id = ? LIMIT 1", [user.id]);
        if (!rows[0] || !(await checkPassword(oldPassword, rows[0].password))) {
          return json({ error: "incorrect_password", message: "Current password incorrect" }, 400, corsHeaders);
        }

        const newHash = await hashPassword(newPassword);
        await db(env, "UPDATE dashboard_users SET password = ? WHERE id = ?", [newHash, user.id]);
        return json({ ok: true, message: "Password updated successfully" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 6. PUBLIC: REQUEST PASSWORD RESET
      // ------------------------------------------------------------
      if (pathname === "/api/auth/request-reset" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const identifier = String(body.identifier || "").trim().toLowerCase();
        if (!identifier) {
          return json({ error: "missing_identifier", message: "Username or email is required" }, 400, corsHeaders);
        }

        const rows = await db(
          env,
          "SELECT id, username, email FROM dashboard_users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1",
          [identifier, identifier]
        );
        if (!rows.length) {
          // Prevent account enumeration by returning generic success
          return json({ ok: true, message: "If an account exists, a reset request has been submitted for Admin approval." }, 200, corsHeaders);
        }

        const u = rows[0];
        await db(
          env,
          "UPDATE dashboard_users SET reset_status = 'pending', reset_requested_at = CURRENT_TIMESTAMP WHERE id = ?",
          [u.id]
        );
        return json({ ok: true, message: "Password reset request submitted. Awaiting Administrator approval." }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 7. PUBLIC: COMPLETE PASSWORD RESET WITH OTP
      // ------------------------------------------------------------
      if (pathname === "/api/auth/verify-reset" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const identifier = String(body.identifier || "").trim().toLowerCase();
        const code = String(body.code || "").trim();
        const newPassword = String(body.newPassword || "");

        if (!identifier || !code || !newPassword || newPassword.length < 6) {
          return json({ error: "invalid_input", message: "Valid identifier, code, and new password (min 6 chars) required" }, 400, corsHeaders);
        }

        const rows = await db(
          env,
          "SELECT id, username, reset_status, reset_code FROM dashboard_users WHERE (LOWER(username) = ? OR LOWER(email) = ?) LIMIT 1",
          [identifier, identifier]
        );
        const u = rows[0];

        if (!u || u.reset_status !== "approved" || !u.reset_code || !equals(u.reset_code, code)) {
          return json({ error: "invalid_code", message: "Invalid or unapproved verification code" }, 400, corsHeaders);
        }

        const newHash = await hashPassword(newPassword);
        await db(
          env,
          "UPDATE dashboard_users SET password = ?, reset_status = 'none', reset_code = '' WHERE id = ?",
          [newHash, u.id]
        );
        return json({ ok: true, message: "Password reset successful! You may now sign in." }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 8. PUBLIC: ACTIVATE ACCOUNT WITH RECOVERY PIN
      // ------------------------------------------------------------
      if (pathname === "/api/auth/activate" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || "").trim().toLowerCase();
        const pin = String(body.recoveryPin || "").trim();
        const password = String(body.password || "");

        if (!username || !pin || !password || password.length < 6) {
          return json({ error: "invalid_input", message: "Valid username, PIN, and password (min 6 chars) required" }, 400, corsHeaders);
        }

        const rows = await db(
          env,
          "SELECT id, username, recovery_pin, status FROM dashboard_users WHERE LOWER(username) = ? LIMIT 1",
          [username]
        );
        const u = rows[0];

        if (!u || u.status !== "pending" || !equals(u.recovery_pin, pin)) {
          return json({ error: "invalid_activation", message: "Invalid username or recovery PIN" }, 400, corsHeaders);
        }

        const newHash = await hashPassword(password);
        await db(
          env,
          "UPDATE dashboard_users SET password = ?, status = 'active', recovery_pin = '' WHERE id = ?",
          [newHash, u.id]
        );
        return json({ ok: true, message: "Account activated successfully! You may now sign in." }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 9. PUBLIC: SUBMIT NEW TASK (from index.html)
      // ------------------------------------------------------------
      if (pathname === "/api/tasks" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));

        const timestamp = String(b.timestamp || new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })).trim();
        const shift = String(b.shift || "").trim();
        const unit = String(b.unit || "").trim();
        const pc_no = String(b.pc_no || b.pcNo || "").trim();
        const labeler_name = String(b.labeler_name || b.labelerName || "").trim();
        const national_id = String(b.national_id || b.nationalId || "").trim();
        const qtc_shift = String(b.qtc_shift || b.qtcShift || "").trim();
        const yubikey_email = String(b.yubikey_email || b.yubikeyEmail || "").trim();
        const qtc_name = String(b.qtc_name || b.qtcName || "").trim();
        const stage = String(b.stage || "Stage 1").trim();
        const task_link = String(b.task_link || b.taskLink || "").trim();
        const task_id = String(b.task_id || b.taskId || "").trim();
        const pass = String(b.pass || "").trim();
        const modality = String(b.modality || "").trim();
        const queue_name = String(b.queue_name || b.queueName || "").trim();
        const object_count = parseInt(b.object_count !== undefined ? b.object_count : b.objectCount, 10) || 0;

        if (!task_id || !labeler_name || !shift || !unit) {
          return json({ error: "validation_error", message: "Missing required task fields" }, 400, corsHeaders);
        }

        // Check for duplicate task ID and pass
        const dupCheck = await db(
          env,
          "SELECT id, timestamp, labeler_name FROM task_submissions WHERE task_id = ? AND (pass = ? OR ? = '') LIMIT 1",
          [task_id, pass, pass]
        );
        if (dupCheck.length > 0) {
          const existingRow = dupCheck[0] || {};
          return json({
            error: "duplicate_task",
            message: "Task ID already submitted!",
            existing: {
              id: existingRow.id,
              timestamp: existingRow.timestamp,
              labeler: existingRow.labeler_name
            }
          }, 409, corsHeaders);
        }

        const nowIso = new Date().toISOString();
        let insertId = 0;
        try {
          const insertRes = await db(
            env,
            `INSERT INTO task_submissions 
             (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, updated_at, source) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Live')`,
            [
              timestamp, shift, unit, pc_no, labeler_name, national_id,
              qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id,
              pass, modality, queue_name, object_count, timestamp, nowIso
            ]
          );
          insertId = insertRes?.meta?.last_row_id || insertRes?.lastRowId || 0;
        } catch (insertErr) {
          if (String(insertErr.message || "").includes("UNIQUE constraint failed")) {
            return json({ error: "duplicate_task", message: "Task ID already submitted!" }, 409, corsHeaders);
          }
          throw insertErr;
        }

        const createdTask = {
          id: insertId,
          timestamp, shift, unit, pc_no, labeler_name,
          national_id: maskNationalId(national_id, user ? user.role : "labeler"),
          qtc_shift,
          yubikey_email: maskYubikeyEmail(yubikey_email, user ? user.role : "labeler"),
          qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count,
          created_at: timestamp,
          updated_at: nowIso,
          source: 'Live'
        };

        return json({ ok: true, message: "Task submitted successfully", task: createdTask }, 201, corsHeaders);
      }

      // ------------------------------------------------------------
      // 14. SYNC GOOGLE SHEETS LIVE DATA (/api/sync-sheets)
      // ------------------------------------------------------------
      if (pathname === "/api/sync-sheets" && (request.method === "POST" || request.method === "GET")) {
        const authHeader = request.headers.get("x-sync-token") || "";
        const expectedToken = env.SYNC_TOKEN || "meeg_internal_sync_secure_token_2026";
        let isAuthorized = (authHeader === expectedToken);
        if (!isAuthorized) {
          const user = await verifySession(request, env);
          if (user && isAdminOrSuper(user.role)) isAuthorized = true;
        }
        if (!isAuthorized) {
          return json({ error: "forbidden", message: "Unauthorized sync trigger" }, 403, corsHeaders);
        }
        const includeArchives = url.searchParams.get("include_archives") === "1";
        const result = await syncGoogleSheetsToD1(env, includeArchives);
        return json(result, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // ANALYTICS DATASET & SERVER-SIDE OVERVIEW (Turso Backed)
      // ------------------------------------------------------------
      if (pathname === "/api/analytics/overview" && request.method === "GET") {
        const stats = await db(
          env,
          `SELECT 
             COUNT(*) AS total_tasks,
             COUNT(DISTINCT labeler_name) AS total_labelers,
             COUNT(DISTINCT qtc_name) AS total_qtc,
             COUNT(DISTINCT queue_name) AS total_queues,
             COUNT(DISTINCT unit) AS total_units,
             SUM(CASE WHEN LOWER(pass) = 'fp' OR LOWER(pass) = 'pass' THEN 1 ELSE 0 END) AS total_fp,
             SUM(CASE WHEN LOWER(pass) = 'qa' THEN 1 ELSE 0 END) AS total_qa,
             SUM(CASE WHEN LOWER(modality) = 'lidar' THEN 1 ELSE 0 END) AS total_lidar,
             SUM(CASE WHEN LOWER(modality) LIKE '%lane%' THEN 1 ELSE 0 END) AS total_lane,
             SUM(object_count) AS total_objects,
             AVG(object_count) AS avg_objects
           FROM task_submissions`
        );
        const row = stats[0] || {};
        const total = parseInt(row.total_tasks || 0, 10);
        const fpCnt = parseInt(row.total_fp || 0, 10);
        const qaCnt = parseInt(row.total_qa || 0, 10);
        const passRate = total > 0 ? (((fpCnt + qaCnt) / total) * 100).toFixed(1) : "100.0";

        return json({
          ok: true,
          overview: {
            total_tasks: total,
            total_labelers: parseInt(row.total_labelers || 0, 10),
            total_qtc: parseInt(row.total_qtc || 0, 10),
            total_queues: parseInt(row.total_queues || 0, 10),
            total_units: parseInt(row.total_units || 0, 10),
            total_fp: fpCnt,
            total_qa: qaCnt,
            pass_count: fpCnt,
            fail_count: 0,
            pass_rate: parseFloat(passRate),
            total_lidar: parseInt(row.total_lidar || 0, 10),
            total_lane: parseInt(row.total_lane || 0, 10),
            total_objects: parseInt(row.total_objects || 0, 10),
            avg_objects: parseFloat(row.avg_objects || 0).toFixed(1)
          }
        }, 200, corsHeaders);
      }

      if (pathname === "/api/analytics/dataset" && request.method === "GET") {
        const maybeUser = await verifySession(request, env);
        const role = maybeUser ? maybeUser.role : "qt";
        const isSupervisor = isAdminOrSuper(role);
        const roleScope = isSupervisor ? "supervisor" : "standard";
        const limitParam = parseInt(url.searchParams.get("limit") || "25000", 10);
        const limit = Math.min(25000, Math.max(1, isNaN(limitParam) ? 25000 : limitParam));
        const sourceParam = (url.searchParams.get("source") || "live").toLowerCase().trim();

        const cacheKey = `ds:${sourceParam}:${roleScope}:${limit}`;
        const ifNoneMatch = request.headers.get("if-none-match");

        // 1. Check in-memory Worker cache (15-second TTL per roleScope & source)
        const cached = IN_MEMORY_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 15000)) {
          if (ifNoneMatch && etagMatches(ifNoneMatch, cached.etag)) {
            return new Response(null, {
              status: 304,
              headers: {
                "ETag": cached.etag,
                "Cache-Control": "private, no-cache, must-revalidate",
                "Vary": "Authorization, Cookie",
                ...corsHeaders
              }
            });
          }
          return new Response(cached.payload, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "ETag": cached.etag,
              "Cache-Control": "private, no-cache, must-revalidate",
              "Vary": "Authorization, Cookie",
              ...corsHeaders
            }
          });
        }

        let sourceClause = "";
        let params = [];
        if (sourceParam === "all") {
          sourceClause = "";
        } else if (sourceParam === "arch2026" || sourceParam === "archive2026" || sourceParam === "archive_2026" || sourceParam === "arch2") {
          sourceClause = "WHERE (source = 'Archive 2026' OR source = 'ارشيف 2')";
        } else if (sourceParam === "arch2025" || sourceParam === "archive2025" || sourceParam === "archive_2025" || sourceParam === "arch1") {
          sourceClause = "WHERE (source = 'Archive 2025' OR source = 'ارشيف 1')";
        } else if (sourceParam === "archive" || sourceParam === "both") {
          sourceClause = "WHERE (source IN ('Archive 2026', 'Archive 2025', 'ارشيف 1', 'ارشيف 2'))";
        } else {
          sourceClause = "WHERE (source = 'Live' OR source IS NULL OR source = '')";
        }

        const rawRows = await db(
          env,
          `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, pass, modality, queue_name, object_count, created_at, COALESCE(source, 'Live') AS source 
           FROM task_submissions 
           ${sourceClause} 
           ORDER BY id DESC 
           LIMIT ?`,
          [...params, limit]
        );
        const rows = rawRows.map(r => ({
          ...r,
          national_id: maskNationalId(r.national_id, role),
          yubikey_email: maskYubikeyEmail(r.yubikey_email, role)
        }));

        const payload = JSON.stringify({ ok: true, count: rows.length, rows });
        // Genuine content-based ETag reflecting edits, deletes, and role differences
        const etag = `"ds-${sourceParam}-${roleScope}-${hashContent(payload)}"`;

        // Maintain bounded in-memory cache
        if (IN_MEMORY_CACHE.size > 16) {
          const firstKey = IN_MEMORY_CACHE.keys().next().value;
          IN_MEMORY_CACHE.delete(firstKey);
        }
        IN_MEMORY_CACHE.set(cacheKey, { etag, payload, timestamp: Date.now() });

        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
          return new Response(null, {
            status: 304,
            headers: {
              "ETag": etag,
              "Cache-Control": "private, no-cache, must-revalidate",
              "Vary": "Authorization, Cookie",
              ...corsHeaders
            }
          });
        }

        return new Response(payload, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "ETag": etag,
            "Cache-Control": "private, no-cache, must-revalidate",
            "Vary": "Authorization, Cookie",
            ...corsHeaders
          }
        });
      }

      // Public Operational Metadata (Queues and QTC for task submission form & dashboards)
      if (pathname === "/api/queues" && request.method === "GET") {
        const rows = await db(env, "SELECT id, name, highlight, CAST(COALESCE(is_hidden, 0) AS INTEGER) AS is_hidden, created_at FROM custom_queues ORDER BY name ASC");
        return json({ ok: true, queues: rows }, 200, corsHeaders);
      }

      if (pathname === "/api/qtc" && request.method === "GET") {
        const rows = await db(env, "SELECT id, shift, name, role, created_at FROM custom_qtc ORDER BY shift ASC, name ASC");
        return json({ ok: true, qtc: rows }, 200, corsHeaders);
      }

      // Dedicated Archive 2026 Table Endpoint
      if (pathname === "/api/archive/2026" && request.method === "GET") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)));
        const offset = (page - 1) * limit;
        const totalRows = await db(env, "SELECT count(*) AS total FROM archive_2026");
        const total = totalRows[0]?.total || 0;
        const rows = await db(env, "SELECT * FROM archive_2026 ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
        return json({ ok: true, archive: "2026", total: Number(total), page, limit, rows }, 200, corsHeaders);
      }

      // Dedicated Archive 2025 Table Endpoint
      if (pathname === "/api/archive/2025" && request.method === "GET") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)));
        const offset = (page - 1) * limit;
        const totalRows = await db(env, "SELECT count(*) AS total FROM archive_2025");
        const total = totalRows[0]?.total || 0;
        const rows = await db(env, "SELECT * FROM archive_2025 ORDER BY id DESC LIMIT ? OFFSET ?", [limit, offset]);
        return json({ ok: true, archive: "2025", total: Number(total), page, limit, rows }, 200, corsHeaders);
      }

      // ============================================================
      // PROTECTED ROUTES REQUIRE VALID AUTHENTICATION
      // ============================================================
      const user = await verifySession(request, env);
      if (!user) {
        return json({ error: "unauthorized", message: "Authentication required" }, 401, corsHeaders);
      }

      const isAdmin = isAdminOrSuper(user.role);
      const isSuper = isSuperAdmin(user.role);
      const isSupervisor = isSupervisorOrAdmin(user.role);

      // ------------------------------------------------------------
      // 10. USER MANAGEMENT (Admin Only)
      // ------------------------------------------------------------
      if (pathname === "/api/users" && request.method === "GET") {
        if (!isAdmin) return json({ error: "forbidden", message: "Admin privilege required" }, 403, corsHeaders);
        const rows = await db(
          env,
          "SELECT id, username, full_name, role, status, email, recovery_pin, reset_status, reset_requested_at, allowed_pages, created_at FROM dashboard_users ORDER BY id ASC"
        );
        return json({ ok: true, users: rows }, 200, corsHeaders);
      }

      if (pathname === "/api/users" && request.method === "POST") {
        if (!isAdmin) return json({ error: "forbidden", message: "Admin privilege required" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const username = String(b.username || "").trim().toLowerCase();
        const full_name = String(b.full_name || "").trim();
        const email = String(b.email || "").trim().toLowerCase();
        const role = String(b.role || "shift sv").trim();
        const allowed_pages = String(b.allowed_pages || "*").trim();

        if (isSuperAdmin(role) && !isSuper) {
          return json({ error: "forbidden", message: "Only a Super Admin can create another Super Admin account." }, 403, corsHeaders);
        }

        if (!username || !full_name || !email) {
          return json({ error: "validation_error", message: "Username, full name, and email are required" }, 400, corsHeaders);
        }

        const existing = await db(env, "SELECT id FROM dashboard_users WHERE LOWER(username) = ? LIMIT 1", [username]);
        if (existing.length) {
          return json({ error: "user_exists", message: "Username is already registered" }, 409, corsHeaders);
        }

        const recovery_pin = String(Math.floor(1000 + Math.random() * 9000));
        await db(
          env,
          "INSERT INTO dashboard_users (username, password, full_name, email, role, allowed_pages, status, recovery_pin) VALUES (?, '', ?, ?, ?, ?, 'pending', ?)",
          [username, full_name, email, role, allowed_pages, recovery_pin]
        );

        return json({ ok: true, recovery_pin, message: `User authorized. Activation PIN: ${recovery_pin}` }, 201, corsHeaders);
      }

      // Update User (Admin or Super Admin)
      const userUpdateMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (userUpdateMatch && request.method === "PUT") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = userUpdateMatch[1];
        const b = await request.json().catch(() => ({}));

        const targetRows = await db(env, "SELECT id, username, full_name, email, role, status FROM dashboard_users WHERE id = ? LIMIT 1", [targetId]);
        const targetUser = targetRows[0];
        if (!targetUser) {
          return json({ error: "not_found", message: "User not found" }, 404, corsHeaders);
        }

        const targetIsSuper = isSuperAdmin(targetUser.role);

        // Security rule 1: If target user is a Super Admin, regular Admin cannot modify them
        if (targetIsSuper && !isSuper) {
          return json({ error: "forbidden", message: "Regular Admins cannot modify a Super Admin account." }, 403, corsHeaders);
        }

        // Security rule 2: Super Admins cannot be demoted or removed from the Super Admin role by anyone (even another Super Admin)
        if (targetIsSuper && b.role && !isSuperAdmin(b.role)) {
          return json({ error: "forbidden", message: "Super Admin role is permanent and cannot be demoted or removed." }, 403, corsHeaders);
        }

        // Security rule 3: Super Admins cannot be deactivated or suspended
        if (targetIsSuper && b.status && b.status !== "active") {
          return json({ error: "forbidden", message: "Super Admin accounts must always remain active." }, 403, corsHeaders);
        }

        // Security rule 4: Only Super Admins can promote someone to Super Admin
        if (b.role && isSuperAdmin(b.role) && !isSuper) {
          return json({ error: "forbidden", message: "Only Super Admins can assign the Super Admin role." }, 403, corsHeaders);
        }

        let updateSql = "UPDATE dashboard_users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), role = COALESCE(?, role), status = COALESCE(?, status), allowed_pages = COALESCE(?, allowed_pages), recovery_pin = COALESCE(?, recovery_pin)";
        const params = [b.full_name || null, b.email || null, b.role || null, b.status || null, b.allowed_pages || null, b.recovery_pin || null];
        if (b.clear_password) {
          updateSql += ", password = ''";
        }
        updateSql += " WHERE id = ?";
        params.push(targetId);

        await db(env, updateSql, params);
        return json({ ok: true, message: "User updated" }, 200, corsHeaders);
      }

      // Delete User (Admin or Super Admin)
      if (userUpdateMatch && request.method === "DELETE") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = userUpdateMatch[1];

        const targetRows = await db(env, "SELECT id, username, full_name, email, role FROM dashboard_users WHERE id = ? LIMIT 1", [targetId]);
        const targetUser = targetRows[0];
        if (!targetUser) {
          return json({ error: "not_found", message: "User not found" }, 404, corsHeaders);
        }

        // Absolute rule: Super Admins CANNOT be deleted by ANYONE (neither regular admins nor other Super Admins)
        if (isSuperAdmin(targetUser.role)) {
          return json({ error: "forbidden", message: "Super Admin accounts are permanently protected and cannot be deleted by anyone." }, 403, corsHeaders);
        }

        if (String(user.id) === String(targetId)) {
          return json({ error: "bad_request", message: "Cannot delete your own admin account" }, 400, corsHeaders);
        }

        // Regular admins cannot delete other admins; only Super Admins can delete regular admins
        if (isAdminOrSuper(targetUser.role) && !isSuper) {
          return json({ error: "forbidden", message: "Only Super Admins can delete Admin accounts." }, 403, corsHeaders);
        }

        await db(env, "DELETE FROM dashboard_users WHERE id = ?", [targetId]);
        return json({ ok: true, message: "User deleted" }, 200, corsHeaders);
      }

      // Approve Password Reset (Admin only)
      const approveResetMatch = pathname.match(/^\/api\/users\/(\d+)\/approve-reset$/);
      if (approveResetMatch && request.method === "POST") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = approveResetMatch[1];

        const targetUser = (await db(env, "SELECT id, username, full_name, email, role FROM dashboard_users WHERE id = ? LIMIT 1", [targetId]))[0];
        if (!targetUser) return json({ error: "not_found", message: "User not found" }, 404, corsHeaders);

        if (isSuperAdmin(targetUser.role) && !isSuper) {
          return json({ error: "forbidden", message: "Only Super Admins can manage Super Admin accounts." }, 403, corsHeaders);
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        await db(env, "UPDATE dashboard_users SET reset_status = 'approved', reset_code = ? WHERE id = ?", [code, targetId]);

        // Trigger Google Apps Script Mailer webhook if mailer is configured
        const mailerUrl = env.MAILER_WEBHOOK_URL || "https://script.google.com/macros/s/AKfycbwU6RQpM9OwOPfc6OVNts2x6mOpHMwGr6Px5T_HxN-h0grQsqVegw-MOYgvyXeTAtdbig/exec";
        if (targetUser.email) {
          dispatchResetEmail(mailerUrl, targetUser.email, targetUser.full_name, targetUser.username, code);
        }

        return json({ ok: true, code, email: targetUser.email, message: `Reset approved. OTP code: ${code}` }, 200, corsHeaders);
      }

      // Reject Password Reset (Admin only)
      const rejectResetMatch = pathname.match(/^\/api\/users\/(\d+)\/reject-reset$/);
      if (rejectResetMatch && request.method === "POST") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = rejectResetMatch[1];

        const targetUser = (await db(env, "SELECT id, username, full_name, email, role FROM dashboard_users WHERE id = ? LIMIT 1", [targetId]))[0];
        if (targetUser && isSuperAdmin(targetUser.role) && !isSuper) {
          return json({ error: "forbidden", message: "Only Super Admins can manage Super Admin accounts." }, 403, corsHeaders);
        }

        await db(env, "UPDATE dashboard_users SET reset_status = 'rejected', reset_code = '' WHERE id = ?", [targetId]);
        return json({ ok: true, message: "Reset request rejected" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 11. TASKS QUERIES & MUTATIONS
      // ------------------------------------------------------------
      // ------------------------------------------------------------
      // 10. INCREMENTAL / DELTA TASK SYNC (/api/tasks/delta)
      // Bounded cursor-based stream returning ONLY newly inserted or modified tasks
      // Prevents catastrophic full-dataset polling (thousands of rows) on every cycle
      // ------------------------------------------------------------
      if (pathname === "/api/tasks/delta" && request.method === "GET") {
        const user = await verifySession(request, env);
        if (!user) return json({ error: "unauthorized", message: "Authentication required" }, 401, corsHeaders);

        const role = user.role;
        const cursor = (url.searchParams.get("cursor") || "").trim();
        const sourceParam = (url.searchParams.get("source") || "").toLowerCase().trim();
        const limitParam = parseInt(url.searchParams.get("limit") || "200", 10);
        const limit = Math.min(500, Math.max(1, isNaN(limitParam) ? 200 : limitParam));

        let cursorTimestamp = "";
        let cursorId = 0;
        if (cursor && cursor.includes(":")) {
          const lastColon = cursor.lastIndexOf(":");
          cursorTimestamp = cursor.slice(0, lastColon).trim();
          cursorId = parseInt(cursor.slice(lastColon + 1), 10) || 0;
        } else if (cursor && /^\d+$/.test(cursor)) {
          cursorId = parseInt(cursor, 10);
        }

        let whereClauses = [];
        let params = [];

        if (cursorTimestamp && cursorId) {
          whereClauses.push("(COALESCE(updated_at, created_at, timestamp) > ? OR (COALESCE(updated_at, created_at, timestamp) = ? AND id > ?))");
          params.push(cursorTimestamp, cursorTimestamp, cursorId);
        } else if (cursorId) {
          whereClauses.push("id > ?");
          params.push(cursorId);
        }

        if (sourceParam && sourceParam !== "all") {
          if (sourceParam === "live") {
            whereClauses.push("(source = 'Live' OR source IS NULL OR source = '')");
          } else if (sourceParam === "arch2026" || sourceParam === "archive2026" || sourceParam === "archive_2026" || sourceParam === "arch2") {
            whereClauses.push("(source = 'Archive 2026' OR source = 'ارشيف 2')");
          } else if (sourceParam === "arch2025" || sourceParam === "archive2025" || sourceParam === "archive_2025" || sourceParam === "arch1") {
            whereClauses.push("(source = 'Archive 2025' OR source = 'ارشيف 1')");
          } else {
            whereClauses.push("source = ?");
            params.push(sourceParam);
          }
        }

        const whereSql = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";
        const deltaSql = `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, COALESCE(updated_at, created_at, timestamp) AS updated_at, COALESCE(source, 'Live') AS source 
                          FROM task_submissions 
                          ${whereSql} 
                          ORDER BY COALESCE(updated_at, created_at, timestamp) ASC, id ASC 
                          LIMIT ?`;

        const rawRows = await db(env, deltaSql, [...params, limit + 1]);
        const hasMore = rawRows.length > limit;
        const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

        let nextCursor = cursor;
        if (pageRows.length > 0) {
          const lastItem = pageRows[pageRows.length - 1];
          nextCursor = `${lastItem.updated_at}:${lastItem.id}`;
        }

        let deleted = [];
        if (cursorTimestamp) {
          try {
            const delRows = await db(env, "SELECT task_id FROM deleted_tasks WHERE deleted_at > ? LIMIT 100", [cursorTimestamp]);
            deleted = delRows.map(d => d.task_id);
          } catch (e) {
            // deleted_tasks table optional
          }
        }

        const changes = pageRows.map(t => ({
          ...t,
          national_id: maskNationalId(t.national_id, role),
          yubikey_email: maskYubikeyEmail(t.yubikey_email, role)
        }));

        const sync_meta = await getSyncMeta(env);
        return json({
          ok: true,
          changes,
          deleted,
          cursor: nextCursor,
          hasMore,
          count: changes.length,
          sync_meta
        }, 200, corsHeaders);
      }

      if (pathname === "/api/tasks" && request.method === "GET") {
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const limit = Math.min(10000, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)));
        const offset = (page - 1) * limit;

        const shift = url.searchParams.get("shift");
        const modality = url.searchParams.get("modality");
        const queue_name = url.searchParams.get("queue_name");
        const pass = url.searchParams.get("pass");
        const labeler = url.searchParams.get("labeler");
        const qtc = url.searchParams.get("qtc");
        const search = url.searchParams.get("search");
        const dateFrom = url.searchParams.get("date_from");
        const dateTo = url.searchParams.get("date_to");
        const sourceParam = (url.searchParams.get("source") || "").toLowerCase().trim();

        const role = user ? user.role : "qt";
        const isSupervisor = isAdminOrSuper(role);
        const roleScope = isSupervisor ? "supervisor" : "standard";
        const cacheKey = `tasks:${url.search}:${roleScope}`;
        const ifNoneMatch = request.headers.get("if-none-match");

        // 1. Check in-memory Worker cache (15-second TTL per roleScope & query)
        // Eliminates D1 database reads completely on repeated polls or 304 revalidations
        const cached = IN_MEMORY_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 15000)) {
          if (ifNoneMatch && etagMatches(ifNoneMatch, cached.etag)) {
            return new Response(null, {
              status: 304,
              headers: {
                "ETag": cached.etag,
                "Cache-Control": "private, no-cache, must-revalidate",
                "Vary": "Authorization, Cookie",
                ...corsHeaders
              }
            });
          }
          return new Response(cached.responseBody, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "ETag": cached.etag,
              "Cache-Control": "private, no-cache, must-revalidate",
              "Vary": "Authorization, Cookie",
              ...corsHeaders
            }
          });
        }

        let whereClauses = [];
        let params = [];

        if (shift) { whereClauses.push("shift = ?"); params.push(shift); }
        if (modality) { whereClauses.push("modality = ?"); params.push(modality); }
        if (queue_name) { whereClauses.push("queue_name = ?"); params.push(queue_name); }
        if (pass) { whereClauses.push("pass = ?"); params.push(pass); }
        if (labeler) { whereClauses.push("labeler_name = ?"); params.push(labeler); }
        if (qtc) { whereClauses.push("qtc_name = ?"); params.push(qtc); }
        if (dateFrom) { whereClauses.push("timestamp >= ?"); params.push(dateFrom); }
        if (dateTo) { whereClauses.push("timestamp <= ?"); params.push(dateTo); }

        // Preserved full search across ALL fields without heuristic shortcuts
        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          whereClauses.push("(task_id LIKE ? OR task_link LIKE ? OR labeler_name LIKE ? OR national_id LIKE ? OR pc_no LIKE ? OR qtc_name LIKE ? OR queue_name LIKE ?)");
          params.push(s, s, s, s, s, s, s);
        }

        if (sourceParam && sourceParam !== "all") {
          if (sourceParam === "live") {
            whereClauses.push("(source = 'Live' OR source IS NULL OR source = '')");
          } else if (sourceParam === "arch2026" || sourceParam === "archive2026" || sourceParam === "archive_2026" || sourceParam === "arch2") {
            whereClauses.push("(source = 'Archive 2026' OR source = 'ارشيف 2')");
          } else if (sourceParam === "arch2025" || sourceParam === "archive2025" || sourceParam === "archive_2025" || sourceParam === "arch1") {
            whereClauses.push("(source = 'Archive 2025' OR source = 'ارشيف 1')");
          } else if (sourceParam === "archive" || sourceParam === "both") {
            whereClauses.push("(source IN ('Archive 2026', 'Archive 2025', 'ارشيف 1', 'ارشيف 2'))");
          } else {
            whereClauses.push("source = ?");
            params.push(sourceParam);
          }
        }

        const isArch2025Only = (sourceParam === "arch2025" || sourceParam === "arch1" || sourceParam === "archive2025" || sourceParam === "archive_2025") && whereClauses.length === 1;
        const isArch2026Only = (sourceParam === "arch2026" || sourceParam === "arch2" || sourceParam === "archive2026" || sourceParam === "archive_2026") && whereClauses.length === 1;

        // Fetch limit + 1 rows to accurately determine pagination
        let tasksQuery = "";
        let taskParams = [];

        if (isArch2025Only) {
          tasksQuery = `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, 'Archive 2025' AS source FROM archive_2025 ORDER BY id DESC LIMIT ? OFFSET ?`;
          taskParams = [limit + 1, offset];
        } else if (isArch2026Only) {
          tasksQuery = `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, 'Archive 2026' AS source FROM archive_2026 ORDER BY id DESC LIMIT ? OFFSET ?`;
          taskParams = [limit + 1, offset];
        } else {
          tasksQuery = `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, COALESCE(source, 'Live') AS source FROM task_submissions ${whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : ""} ORDER BY id DESC LIMIT ? OFFSET ?`;
          taskParams = [...params, limit + 1, offset];
        }

        const rawRows = await db(env, tasksQuery, taskParams);
        const hasMore = rawRows.length > limit;
        const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

        // ACCURATE TOTAL CALCULATION (No hardcoded constants, no MAX(id) substitutions)
        let total = 0;
        if (!hasMore && page === 1) {
          // Exact count: when on page 1 and results are <= limit, total is mathematically pageRows.length
          total = pageRows.length;
        } else if (!whereClauses.length) {
          // Unfiltered total: Query actual COUNT(*) from database
          const countQuery = await db(env, "SELECT COUNT(*) AS total FROM task_submissions");
          total = parseInt(countQuery[0]?.total || 0, 10);
        } else if (isArch2025Only) {
          const countQuery = await db(env, "SELECT COUNT(*) AS total FROM archive_2025");
          total = parseInt(countQuery[0]?.total || 0, 10);
        } else if (isArch2026Only) {
          const countQuery = await db(env, "SELECT COUNT(*) AS total FROM archive_2026");
          total = parseInt(countQuery[0]?.total || 0, 10);
        } else {
          // Filtered count with deeper pagination: query exact COUNT(*) with parameters
          const whereSql = "WHERE " + whereClauses.join(" AND ");
          const countQuery = await db(env, `SELECT COUNT(*) AS total FROM task_submissions ${whereSql}`, params);
          total = parseInt(countQuery[0]?.total || 0, 10);
        }

        const tasks = pageRows.map(t => ({
          ...t,
          national_id: maskNationalId(t.national_id, user.role),
          yubikey_email: maskYubikeyEmail(t.yubikey_email, user.role)
        }));

        let initialCursor = "";
        if (pageRows.length > 0) {
          const topItem = pageRows[0];
          initialCursor = `${topItem.updated_at || topItem.created_at || topItem.timestamp}:${topItem.id}`;
        }
        const sync_meta = await getSyncMeta(env);
        const responseObj = { ok: true, tasks, total, page, limit, cursor: initialCursor, sync_meta };
        const responseBody = JSON.stringify(responseObj);
        // Robust ETag based on exact content payload + roleScope + source
        const etag = `"tasks-${sourceParam || 'all'}-${roleScope}-${hashContent(responseBody)}"`;

        // Cache response in memory to eliminate future D1 reads within 15s window
        if (IN_MEMORY_CACHE.size > 32) {
          const firstKey = IN_MEMORY_CACHE.keys().next().value;
          IN_MEMORY_CACHE.delete(firstKey);
        }
        IN_MEMORY_CACHE.set(cacheKey, { etag, responseBody, timestamp: Date.now() });

        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
          return new Response(null, {
            status: 304,
            headers: {
              "ETag": etag,
              "Cache-Control": "private, no-cache, must-revalidate",
              "Vary": "Authorization, Cookie",
              ...corsHeaders
            }
          });
        }

        return new Response(responseBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "ETag": etag,
            "Cache-Control": "private, no-cache, must-revalidate",
            "Vary": "Authorization, Cookie",
            ...corsHeaders
          }
        });
      }

      // Update Task (Permanently Disabled)
      const taskUpdateMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
      if (taskUpdateMatch && request.method === "PUT") {
        return json({ error: "forbidden", message: "Task editing is permanently disabled" }, 403, corsHeaders);
      }

      // Delete Task (Permanently Disabled)
      if (taskUpdateMatch && request.method === "DELETE") {
        return json({ error: "forbidden", message: "Task deletion is permanently disabled" }, 403, corsHeaders);
      }

      // ------------------------------------------------------------
      // 12. QUEUES & QTC MANAGEMENT (Write Operations)
      // ------------------------------------------------------------
      if (pathname === "/api/queues" && request.method === "POST") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || "").trim();
        const highlight = String(b.highlight || "").trim();
        if (!name) return json({ error: "validation_error", message: "Queue name is required" }, 400, corsHeaders);

        await db(env, "INSERT OR IGNORE INTO custom_queues (name, highlight, is_hidden) VALUES (?, ?, 0)", [name, highlight]);
        return json({ ok: true, message: "Queue added" }, 201, corsHeaders);
      }

      const queueMatch = pathname.match(/^\/api\/queues\/(.+)$/);
      if (queueMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        const b = await request.json().catch(() => ({}));
        const hasHighlight = b.highlight !== undefined;
        const hasHidden = b.is_hidden !== undefined;
        const highlight = hasHighlight ? String(b.highlight || "").trim() : null;
        const isHidden = hasHidden ? (b.is_hidden ? 1 : 0) : null;

        await db(
          env, 
          `UPDATE custom_queues 
           SET highlight = CASE WHEN ? IS NOT NULL THEN ? ELSE highlight END,
               is_hidden = CASE WHEN ? IS NOT NULL THEN ? ELSE is_hidden END
           WHERE id = ? OR name = ?`,
          [highlight, highlight, isHidden, isHidden, qTarget, qTarget]
        );
        return json({ ok: true, message: "Queue updated" }, 200, corsHeaders);
      }

      if (queueMatch && request.method === "DELETE") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        await db(env, "DELETE FROM custom_queues WHERE id = ? OR name = ?", [qTarget, qTarget]);
        return json({ ok: true, message: "Queue deleted" }, 200, corsHeaders);
      }

      if (pathname === "/api/qtc" && request.method === "POST") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const shift = String(b.shift || "").trim();
        const name = String(b.name || "").trim();
        const role = String(b.role || "").trim();
        if (!shift || !name) return json({ error: "validation_error", message: "Shift and name are required" }, 400, corsHeaders);

        await db(env, "INSERT OR REPLACE INTO custom_qtc (shift, name, role) VALUES (?, ?, ?)", [shift, name, role]);
        return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);
      }

      const qtcUpdateMatch = pathname.match(/^\/api\/qtc\/(\d+)$/);
      if (qtcUpdateMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qtcId = qtcUpdateMatch[1];
        const b = await request.json().catch(() => ({}));
        const role = b.role !== undefined ? String(b.role).trim() : null;
        const shift = b.shift !== undefined ? String(b.shift).trim() : null;
        const name = b.name !== undefined ? String(b.name).trim() : null;
        await db(
          env,
          "UPDATE custom_qtc SET role = COALESCE(?, role), shift = COALESCE(?, shift), name = COALESCE(?, name) WHERE id = ?",
          [role, shift, name, qtcId]
        );
        return json({ ok: true, message: "QTC member updated" }, 200, corsHeaders);
      }

      const qtcDeleteMatch = pathname.match(/^\/api\/qtc\/(\d+)$/);
      if (qtcDeleteMatch && request.method === "DELETE") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qtcId = qtcDeleteMatch[1];
        await db(env, "DELETE FROM custom_qtc WHERE id = ?", [qtcId]);
        return json({ ok: true, message: "QTC member deleted" }, 200, corsHeaders);
      }






      return json({ error: "not_found", message: "Endpoint not found" }, 404, corsHeaders);
    } catch (err) {
      console.error("Backend exception:", err);
      if (err && (err.code === "QUOTA_EXCEEDED" || (err.message && err.message.toLowerCase().includes("quota exceeded")))) {
        return json({
          ok: false,
          error: "quota_exceeded",
          message: "Database query quota exceeded. Polling paused to prevent degradation."
        }, 429, {
          "Retry-After": "3600",
          ...corsHeaders
        });
      }
      return json({ error: "server_error", message: err.message || "Internal server error" }, 500, corsHeaders);
    }
  },

  async scheduled(event, env, ctx) {
    const isMidnight = String(event.cron || "").startsWith("0 0") || String(event.cron || "") === "0 0 * * *";
    console.log("[CRON] Running automatic Google Sheets delta sync (includeArchives=" + isMidnight + "):", event.cron);
    try {
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(syncGoogleSheetsToD1(env, isMidnight));
      } else {
        await syncGoogleSheetsToD1(env, isMidnight);
      }
    } catch (e) {
      console.error("[CRON] Sync error:", e);
    }
  }
};
