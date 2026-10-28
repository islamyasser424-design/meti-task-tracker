import {
  HttpError,
  readJson,
  sha256,
  randomToken,
  digestKey,
  verifyPassword,
  reportScope,
  requireAdmin,
} from "./security.mjs";
import { TaskService } from "./tasks.mjs";
import { ArchiveService } from "./archive.mjs";

export const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  Vary: "Cookie",
  "X-Frame-Options": "DENY",
};
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...headers },
  });
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  display_name: user.display_name,
  role: user.role,
});
const USER_SELECT =
  "SELECT id,username,display_name,role,active,auth_version FROM meti_users WHERE id=?";

// One coordinator handles all API requests. Queue includes pending-marker recovery
// so no event can race a commit or read a stale version after a crash.
export class MetiApp {
  constructor({ databases, state, env, now = () => Date.now() }) {
    this.databases = databases;
    this.state = state;
    this.env = env;
    this.now = now;
    this.tasks = new TaskService(databases.live, {
      now: () => new Date(this.now()),
    });
    this.archives = new ArchiveService(databases);
    this.cache = new Map();
    this.queue = Promise.resolve();
    this.queueDepth = 0;
  }
  fetch(request) {
    if (this.queueDepth >= 100)
      return Promise.resolve(
        json({ error: "service_busy" }, 503, { "Retry-After": "15" }),
      );
    this.queueDepth++;
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.catch(() => {});
    return result.finally(() => this.queueDepth--);
  }
  cookie(value = "", age = 28800) {
    const secure = this.env.APP_ENV === "test" ? "" : "Secure; ";
    const name =
      this.env.APP_ENV === "test" ? "meti_session" : "__Host-meti_session";
    return `${name}=${value}; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=${age}`;
  }
  async recover() {
    let meta = await this.state.get("meta");
    if (!meta) {
      meta = { epoch: randomToken(), dirty: false };
      await this.state.put("meta", meta);
      return meta;
    }
    if (meta.dirty) {
      // A previous commit outcome may be unknown. The durable Turso log remains
      // authoritative. New epoch invalidates every scope once, without scanning it.
      await this.databases.live.execute(
        "SELECT version FROM meti_report_totals WHERE scope='all'",
      );
      meta.epoch = randomToken();
      meta.dirty = false;
      this.cache.clear();
      await this.state.put("meta", meta);
    }
    return meta;
  }
  async version(user) {
    const meta = await this.recover();
    return `${meta.epoch}:${(await this.state.get(`version:${reportScope(user)}`)) || 0}`;
  }
  async authenticate(request) {
    const name =
      this.env.APP_ENV === "test" ? "meti_session" : "__Host-meti_session";
    const token = (request.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    if (!token || !/^[\w-]{43}$/.test(token))
      throw new HttpError(401, "authentication_required");
    const key = `session:${sha256(token)}`,
      session = await this.state.get(key);
    if (!session || session.expires <= this.now())
      throw new HttpError(401, "session_expired");
    // Permissions cached for at most 60s; API admin changes revoke immediately.
    if (session.checked + 60000 <= this.now()) {
      const user = (
        await this.databases.live.execute({
          sql: USER_SELECT,
          args: [session.user.id],
        })
      ).rows[0];
      if (
        !user ||
        !Number(user.active) ||
        Number(user.auth_version) !== Number(session.user.auth_version)
      ) {
        await this.state.delete(key);
        throw new HttpError(401, "session_revoked");
      }
      session.user = { ...user };
      session.checked = this.now();
      await this.state.put(key, session);
    }
    return { key, session, user: session.user };
  }
  async login(request) {
    const b = await readJson(request),
      username =
        typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
    if (
      !/^[a-z0-9._-]{3,80}$/.test(username) ||
      typeof b.password !== "string" ||
      b.password.length > 256
    )
      throw new HttpError(401, "invalid_credentials");
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const keys = [
      ["ip", ip, 30],
      ["account", username, 5],
      ["global", "all", 120],
    ];
    for (const [kind, value, max] of keys) {
      const key = `limit:${kind}:${digestKey(this.env.AUTH_PEPPER, value)}`,
        entry = await this.state.get(key);
      if (entry && entry.until > this.now() && entry.count >= max)
        throw new HttpError(429, "login_rate_limited", "Try again later", {
          "Retry-After": String(Math.ceil((entry.until - this.now()) / 1000)),
        });
    }
    // Reserve attempt BEFORE any expensive hash or remote database call. Persistent
    // coordinator storage shares limits across isolates and process restarts.
    for (const [kind, value] of keys) {
      const key = `limit:${kind}:${digestKey(this.env.AUTH_PEPPER, value)}`,
        old = await this.state.get(key);
      await this.state.put(
        key,
        old && old.until > this.now()
          ? { ...old, count: old.count + 1 }
          : { count: 1, until: this.now() + 300000 },
      );
    }
    const row = (
      await this.databases.live.execute({
        sql: "SELECT id,username,display_name,password_hash,role,active,auth_version FROM meti_users WHERE username=? COLLATE NOCASE",
        args: [username],
      })
    ).rows[0];
    // Fixed valid dummy hash gives unknown accounts the same KDF work.
    const dummy =
      "scrypt-v1$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const correct = await verifyPassword(
      b.password,
      row?.password_hash || dummy,
      this.env.AUTH_PEPPER,
    );
    if (!row || !Number(row.active) || !correct)
      throw new HttpError(401, "invalid_credentials");
    const user = { ...row };
    delete user.password_hash;
    const token = randomToken(),
      csrf = randomToken();
    await this.state.put(`session:${sha256(token)}`, {
      user,
      csrf,
      expires: this.now() + 28800000,
      checked: this.now(),
    });
    // Keep account throttling in the same 5-minute window even after success.
    return json({ user: publicUser(user), csrf_token: csrf }, 200, {
      "Set-Cookie": this.cookie(token),
    });
  }
  async handle(request) {
    try {
      if (!this.env.AUTH_PEPPER || this.env.AUTH_PEPPER.length < 32)
        throw new HttpError(503, "server_not_configured");
      const url = new URL(request.url),
        path = url.pathname,
        method = request.method;
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new HttpError(403, "origin_denied");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw new HttpError(403, "origin_denied");
      if (!["GET", "HEAD"].includes(method) && origin !== url.origin)
        throw new HttpError(403, "same_origin_required");
      if (method === "OPTIONS")
        throw new HttpError(403, "cross_origin_not_supported");
      if (path === "/api/auth/login" && method === "POST")
        return await this.login(request);
      const { key, session, user } = await this.authenticate(request);
      if (
        !["GET", "HEAD"].includes(method) &&
        request.headers.get("x-csrf-token") !== session.csrf
      )
        throw new HttpError(403, "csrf_required");
      if (path === "/api/auth/logout" && method === "POST") {
        await this.state.delete(key);
        return json({ ok: true }, 200, { "Set-Cookie": this.cookie("", 0) });
      }
      if (path === "/api/me" && method === "GET")
        return json({ user: publicUser(user), csrf_token: session.csrf });
      if (path === "/api/tasks/version" && method === "GET")
        return json({
          version: await this.version(user),
          poll_after_ms: 15000,
        });
      if (path === "/api/tasks" && method === "POST") {
        const body = await readJson(request),
          idem = request.headers.get("idempotency-key");
        const meta = await this.recover();
        await this.state.put("meta", { ...meta, dirty: true });
        this.cache.clear();
        const saved = await this.tasks.create(body, idem, user);
        await this.state.put(
          `version:all`,
          Math.max(
            Number(saved.task.seq),
            Number((await this.state.get("version:all")) || 0),
          ),
        );
        await this.state.put(
          `version:user:${user.id}`,
          Math.max(
            Number(saved.task.seq),
            Number((await this.state.get(`version:user:${user.id}`)) || 0),
          ),
        );
        await this.state.put("meta", { ...meta, dirty: false });
        return json(
          { ...saved, version: await this.version(user) },
          saved.replayed ? 200 : 201,
        );
      }
      if (path === "/api/tasks" && method === "GET") {
        await this.recover();
        return json({
          ...(await this.tasks.list(url, user)),
          version: await this.version(user),
        });
      }
      if (path === "/api/tasks/changes" && method === "GET") {
        await this.recover();
        return json({
          ...(await this.tasks.list(url, user, { changes: true })),
          version: await this.version(user),
        });
      }
      if (
        /^\/api\/tasks\/\d+$/.test(path) &&
        ["PUT", "PATCH", "DELETE"].includes(method)
      )
        throw new HttpError(405, "tasks_are_append_only");
      if (path === "/api/tasks/export" && method === "GET") {
        const data = await this.tasks.export(url, user);
        const fields = [
          "id",
          "task_id",
          "labeler_name",
          "occurred_at",
          "pass",
          "stage",
          "modality",
          "queue_name",
          "object_count",
        ];
        // Quoting alone does not stop spreadsheet formula injection.
        const cell = (v) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@\-\t\r]/, "'$&")
            .replaceAll('"', '""') +
          '"';
        const csv = [
          fields.join(","),
          ...data.tasks.map((t) => fields.map((k) => cell(t[k])).join(",")),
        ].join("\r\n");
        return new Response(csv, {
          headers: {
            ...HEADERS,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="meti-tasks-page.csv"',
            "X-Next-Cursor": String(data.cursor ?? ""),
          },
        });
      }
      const archive = path.match(/^\/api\/archive\/(2025|2026)$/);
      if (archive && method === "GET")
        return json(await this.archives.list(archive[1], url, user));
      if (path === "/api/reports/summary" && method === "GET") {
        const source = url.searchParams.get("source") || "new";
        const version = await this.version(user),
          cacheKey = `${user.id}:${user.role}:${url.search}:${version}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.until > this.now()) return json(cached.data);
        let data;
        if (source === "new") data = await this.tasks.report(user, url);
        else if (["2025", "2026"].includes(source))
          data = await this.archives.report(source, user);
        else if (source === "all")
          data = await this.archives.all(
            await this.tasks.report(user, url),
            user,
          );
        else throw new HttpError(400, "invalid_source");
        data.version = version;
        if (this.cache.size >= 128)
          this.cache.delete(this.cache.keys().next().value);
        this.cache.set(cacheKey, { data, until: this.now() + 30000 });
        return json(data);
      }
      const target = path.match(/^\/api\/admin\/users\/([\w-]+)$/);
      if (target && method === "PATCH") {
        requireAdmin(user);
        const b = await readJson(request);
        if (
          Object.keys(b).some((k) => !["role", "active"].includes(k)) ||
          !["operator", "supervisor", "admin"].includes(b.role) ||
          typeof b.active !== "boolean" ||
          target[1] === user.id
        )
          throw new HttpError(400, "invalid_user_update");
        const result = await this.databases.live.execute({
          sql: "UPDATE meti_users SET role=?,active=?,auth_version=auth_version+1 WHERE id=?",
          args: [b.role, b.active ? 1 : 0, target[1]],
        });
        if (!result.rowsAffected) throw new HttpError(404, "user_not_found");
        await this.state.revokeUser(target[1]);
        this.cache.clear();
        return json({ ok: true });
      }
      throw new HttpError(404, "not_found");
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.code, message: error.message },
          error.status,
          error.headers,
        );
      // Never send SQL, provider errors, bound parameters, credentials or PII to logs/client.
      const quota = /BLOCKED|QUOTA/.test(String(error.code));
      return json(
        {
          error: quota ? "database_quota_exceeded" : "service_unavailable",
          message: "Request not confirmed. Retry the same submission key.",
        },
        503,
        { "Retry-After": quota ? "3600" : "15" },
      );
    }
  }
}
