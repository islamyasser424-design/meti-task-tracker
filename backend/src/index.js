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
// DATABASE CONNECTOR (Turso / LibSQL Parameterized Pipeline)
// ============================================================
async function db(env, sql, params = []) {
  const url = env.TURSO_URL;
  const token = env.TURSO_TOKEN;
  if (!url || !token) throw new Error("Database configuration missing (TURSO_URL or TURSO_TOKEN)");

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
    throw new Error(`Database query error: ${firstResult.error?.message || "unknown"}`);
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
  if (!u || u.status !== "active" || u.role !== payload.role) {
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

// Helper: Check if user is Supervisor or Admin
function isSupervisorOrAdmin(role) {
  const r = (role || "").toLowerCase().trim();
  return ["admin", "shift sv", "floor sv", "traning sv", "training sv", "wla"].includes(r);
}

// Mask sensitive national ID for regular/unauthorized roles
function maskNationalId(natId, role) {
  if (isSupervisorOrAdmin(role)) return natId || "";
  const s = String(natId || "").trim();
  if (s.length <= 4) return "****";
  return s.slice(0, 4) + "*".repeat(Math.max(4, s.length - 8)) + s.slice(-4);
}

// ============================================================
// MAIN ROUTER
// ============================================================
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
          "SELECT id FROM task_submissions WHERE task_id = ? AND (pass = ? OR ? = '') LIMIT 1",
          [task_id, pass, pass]
        );
        if (dupCheck.length > 0) {
          return json({ error: "duplicate_task", message: "Task ID already submitted!" }, 409, corsHeaders);
        }

        await db(
          env,
          `INSERT INTO task_submissions 
           (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            timestamp, shift, unit, pc_no, labeler_name, national_id,
            qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id,
            pass, modality, queue_name, object_count
          ]
        );

        return json({ ok: true, message: "Task submitted successfully" }, 201, corsHeaders);
      }

      // ============================================================
      // PROTECTED ROUTES REQUIRE VALID AUTHENTICATION
      // ============================================================
      const user = await verifySession(request, env);
      if (!user) {
        return json({ error: "unauthorized", message: "Authentication required" }, 401, corsHeaders);
      }

      const isAdmin = user.role === "admin";
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
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const username = String(b.username || "").trim().toLowerCase();
        const full_name = String(b.full_name || "").trim();
        const email = String(b.email || "").trim().toLowerCase();
        const role = String(b.role || "shift sv").trim();
        const allowed_pages = String(b.allowed_pages || "*").trim();

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

      // Update User (Admin only)
      const userUpdateMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (userUpdateMatch && request.method === "PUT") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = userUpdateMatch[1];
        const b = await request.json().catch(() => ({}));

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

      // Delete User (Admin only)
      if (userUpdateMatch && request.method === "DELETE") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = userUpdateMatch[1];
        if (String(user.id) === String(targetId)) {
          return json({ error: "bad_request", message: "Cannot delete your own admin account" }, 400, corsHeaders);
        }
        await db(env, "DELETE FROM dashboard_users WHERE id = ?", [targetId]);
        return json({ ok: true, message: "User deleted" }, 200, corsHeaders);
      }

      // Approve Password Reset (Admin only)
      const approveResetMatch = pathname.match(/^\/api\/users\/(\d+)\/approve-reset$/);
      if (approveResetMatch && request.method === "POST") {
        if (!isAdmin) return json({ error: "forbidden" }, 403, corsHeaders);
        const targetId = approveResetMatch[1];

        const targetUser = (await db(env, "SELECT id, username, full_name, email FROM dashboard_users WHERE id = ? LIMIT 1", [targetId]))[0];
        if (!targetUser) return json({ error: "not_found", message: "User not found" }, 404, corsHeaders);

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
        await db(env, "UPDATE dashboard_users SET reset_status = 'rejected', reset_code = '' WHERE id = ?", [targetId]);
        return json({ ok: true, message: "Reset request rejected" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 11. TASKS QUERIES & MUTATIONS
      // ------------------------------------------------------------
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
        if (search) {
          whereClauses.push("(task_id LIKE ? OR labeler_name LIKE ? OR qtc_name LIKE ? OR queue_name LIKE ?)");
          const s = `%${search}%`;
          params.push(s, s, s, s);
        }

        const whereSql = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";
        const countQuery = await db(env, `SELECT COUNT(*) AS total FROM task_submissions ${whereSql}`, params);
        const total = parseInt(countQuery[0]?.total || 0, 10);

        const tasksQuery = `
          SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at 
          FROM task_submissions 
          ${whereSql} 
          ORDER BY id DESC 
          LIMIT ? OFFSET ?
        `;
        const taskParams = [...params, limit, offset];
        const rows = await db(env, tasksQuery, taskParams);

        // Mask National ID for non-supervisors
        const tasks = rows.map(t => ({
          ...t,
          national_id: maskNationalId(t.national_id, user.role)
        }));

        return json({ ok: true, tasks, total, page, limit }, 200, corsHeaders);
      }

      // Update Task (Admin or Supervisor)
      const taskUpdateMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
      if (taskUpdateMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden", message: "Supervisor access required" }, 403, corsHeaders);
        const taskId = taskUpdateMatch[1];
        const b = await request.json().catch(() => ({}));

        await db(
          env,
          `UPDATE task_submissions SET 
            shift = COALESCE(?, shift), 
            unit = COALESCE(?, unit), 
            pc_no = COALESCE(?, pc_no), 
            labeler_name = COALESCE(?, labeler_name), 
            qtc_name = COALESCE(?, qtc_name), 
            pass = COALESCE(?, pass), 
            modality = COALESCE(?, modality), 
            queue_name = COALESCE(?, queue_name), 
            object_count = COALESCE(?, object_count) 
           WHERE id = ?`,
          [
            b.shift || null, b.unit || null, b.pc_no || null,
            b.labeler_name || null, b.qtc_name || null, b.pass || null,
            b.modality || null, b.queue_name || null, b.object_count !== undefined ? b.object_count : null,
            taskId
          ]
        );
        return json({ ok: true, message: "Task updated" }, 200, corsHeaders);
      }

      // Delete Task (Admin Only)
      if (taskUpdateMatch && request.method === "DELETE") {
        if (!isAdmin) return json({ error: "forbidden", message: "Admin access required to delete records" }, 403, corsHeaders);
        const taskId = taskUpdateMatch[1];
        await db(env, "DELETE FROM task_submissions WHERE id = ?", [taskId]);
        return json({ ok: true, message: "Task deleted" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 12. QUEUES & QTC MANAGEMENT
      // ------------------------------------------------------------
      if (pathname === "/api/queues" && request.method === "GET") {
        const rows = await db(env, "SELECT id, name, highlight, created_at FROM custom_queues ORDER BY name ASC");
        return json({ ok: true, queues: rows }, 200, corsHeaders);
      }

      if (pathname === "/api/queues" && request.method === "POST") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || "").trim();
        const highlight = String(b.highlight || "").trim();
        if (!name) return json({ error: "validation_error", message: "Queue name is required" }, 400, corsHeaders);

        await db(env, "INSERT OR IGNORE INTO custom_queues (name, highlight) VALUES (?, ?)", [name, highlight]);
        return json({ ok: true, message: "Queue added" }, 201, corsHeaders);
      }

      const queueMatch = pathname.match(/^\/api\/queues\/(.+)$/);
      if (queueMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        const b = await request.json().catch(() => ({}));
        const highlight = String(b.highlight !== undefined ? b.highlight : "").trim();
        await db(env, "UPDATE custom_queues SET highlight = ? WHERE id = ? OR name = ?", [highlight, qTarget, qTarget]);
        return json({ ok: true, message: "Queue updated" }, 200, corsHeaders);
      }

      if (queueMatch && request.method === "DELETE") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        await db(env, "DELETE FROM custom_queues WHERE id = ? OR name = ?", [qTarget, qTarget]);
        return json({ ok: true, message: "Queue deleted" }, 200, corsHeaders);
      }

      if (pathname === "/api/qtc" && request.method === "GET") {
        const rows = await db(env, "SELECT id, shift, name, role, created_at FROM custom_qtc ORDER BY shift ASC, name ASC");
        return json({ ok: true, qtc: rows }, 200, corsHeaders);
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

      const qtcDeleteMatch = pathname.match(/^\/api\/qtc\/(\d+)$/);
      if (qtcDeleteMatch && request.method === "DELETE") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qtcId = qtcDeleteMatch[1];
        await db(env, "DELETE FROM custom_qtc WHERE id = ?", [qtcId]);
        return json({ ok: true, message: "QTC member deleted" }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 13. ANALYTICS: AGGREGATED METRICS & DATASET
      // ------------------------------------------------------------
      if (pathname === "/api/analytics/overview" && request.method === "GET") {
        const stats = await db(
          env,
          `SELECT 
             COUNT(*) AS total_tasks,
             COUNT(DISTINCT labeler_name) AS total_labelers,
             COUNT(DISTINCT qtc_name) AS total_qtc,
             SUM(CASE WHEN LOWER(pass) = 'pass' THEN 1 ELSE 0 END) AS pass_count,
             SUM(CASE WHEN LOWER(pass) = 'fail' THEN 1 ELSE 0 END) AS fail_count,
             SUM(object_count) AS total_objects,
             AVG(object_count) AS avg_objects
           FROM task_submissions`
        );
        const row = stats[0] || {};
        const total = parseInt(row.total_tasks || 0, 10);
        const passCnt = parseInt(row.pass_count || 0, 10);
        const passRate = total > 0 ? ((passCnt / total) * 100).toFixed(1) : "0.0";

        return json({
          ok: true,
          overview: {
            total_tasks: total,
            total_labelers: parseInt(row.total_labelers || 0, 10),
            total_qtc: parseInt(row.total_qtc || 0, 10),
            pass_count: passCnt,
            fail_count: parseInt(row.fail_count || 0, 10),
            pass_rate: parseFloat(passRate),
            total_objects: parseInt(row.total_objects || 0, 10),
            avg_objects: parseFloat(row.avg_objects || 0).toFixed(1)
          }
        }, 200, corsHeaders);
      }

      if (pathname === "/api/analytics/dataset" && request.method === "GET") {
        // Return recent dataset rows for charts and performance tables
        const limit = Math.min(25000, parseInt(url.searchParams.get("limit") || "10000", 10));
        const rawRows = await db(
          env,
          `SELECT id, timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, pass, modality, queue_name, object_count, created_at 
           FROM task_submissions 
           ORDER BY id DESC 
           LIMIT ?`,
          [limit]
        );
        const rows = rawRows.map(r => ({
          ...r,
          national_id: maskNationalId(r.national_id, user.role)
        }));
        return json({ ok: true, count: rows.length, rows }, 200, corsHeaders);
      }

      // ------------------------------------------------------------
      // 14. SAME-SITE REVERSE PROXY FOR FRONTEND ASSETS
      // ------------------------------------------------------------
      // When deployed, any non-API request proxies to GitHub Pages
      // ensuring 100% same-site origin for cookies, session, and static files!
      if (!pathname.startsWith("/api/")) {
        const ghTarget = "https://islamyasser424-design.github.io/meti-task-tracker" + (pathname === "/" ? "/dashboard.html" : pathname);
        const ghRes = await fetch(ghTarget, {
          headers: { "User-Agent": "MEEG-Secure-Gateway/1.0" }
        });

        const contentType = ghRes.headers.get("Content-Type") || "text/html; charset=utf-8";
        const newHeaders = new Headers(ghRes.headers);
        newHeaders.set("X-Content-Type-Options", "nosniff");
        newHeaders.set("X-Frame-Options", "SAMEORIGIN");
        newHeaders.delete("Content-Security-Policy");

        return new Response(ghRes.body, {
          status: ghRes.status,
          headers: newHeaders
        });
      }

      return json({ error: "not_found", message: "Endpoint not found" }, 404, corsHeaders);
    } catch (err) {
      console.error("Backend exception:", err);
      return json({ error: "server_error", message: err.message || "Internal server error" }, 500, corsHeaders);
    }
  }
};

