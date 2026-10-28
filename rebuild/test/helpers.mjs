import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { migration } from "../scripts/common.mjs";
import { MetiApp } from "../src/app.mjs";
import { hashPassword, randomToken } from "../src/security.mjs";

export class MemoryState {
  constructor() {
    this.values = new Map();
  }
  async get(key) {
    const v = this.values.get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }
  async putIfAbsent(key, value) {
    if (!this.values.has(key)) await this.put(key, value);
  }
  async putIfChanged(key, value) {
    if (JSON.stringify(await this.get(key)) !== JSON.stringify(value))
      await this.put(key, value);
  }
  async delete(key) {
    this.values.delete(key);
  }
  async revokeUser(id) {
    for (const [k, v] of this.values)
      if (v?.user?.id === id) this.values.delete(k);
  }
}
export function task(overrides = {}) {
  return {
    occurred_at: new Date().toISOString(),
    shift: "Morning",
    unit: "Unit A",
    pc_no: "01",
    qtc_name: "",
    task_link:
      "https://labeling.robot.car/#/do/SellIvandar/queue/synthetic/id/001234567890",
    task_id: "001234567890",
    pass: "FP",
    stage: "Lidar Stage",
    modality: "Lidar",
    queue_name: "synthetic",
    object_count: 7,
    ...overrides,
  };
}
export async function fixture({
  clock = { now: Date.now() },
  cutover = "2026-01-01T00:00:00.000Z",
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "meti-tests-")),
    clients = [];
  const stats = { calls: 0, statements: 0, queries: [] };
  const paths = {
    live: join(dir, "live.db"),
    2025: join(dir, "2025.db"),
    2026: join(dir, "2026.db"),
  };
  const databases = {};
  for (const key of ["live", "2025", "2026"]) {
    const client = createClient({ url: `file:${paths[key]}`, concurrency: 1 });
    clients.push(client);
    await migration(client, key === "live" ? "live" : "archive");
    databases[key] = new Proxy(client, {
      get(target, prop) {
        if (["execute", "batch"].includes(prop))
          return async (...args) => {
            stats.calls++;
            const stmts = prop === "batch" ? args[0] : [args[0]];
            stats.statements += stmts.length;
            stats.queries.push(
              ...stmts.map((s) =>
                typeof s === "string" ? { sql: s, args: [] } : s,
              ),
            );
            return target[prop](...args);
          };
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  await databases.live.execute({
    sql: "UPDATE meti_live_config SET opened_at=?",
    args: [cutover],
  });
  const password = randomToken(),
    pepper = randomToken(),
    hash = await hashPassword(password, pepper);
  const users = {};
  for (const [name, role] of [
    ["alpha", "operator"],
    ["bravo", "operator"],
    ["manager", "supervisor"],
    ["admin", "admin"],
  ]) {
    const u = {
      id: randomUUID(),
      username: name,
      display_name: `Synthetic ${name}`,
      role,
      active: 1,
      auth_version: 1,
    };
    users[name] = u;
    await databases.live.execute({
      sql: "INSERT INTO meti_users(id,username,display_name,password_hash,role) VALUES(?,?,?,?,?)",
      args: [u.id, name, u.display_name, hash, role],
    });
  }
  const env = { AUTH_PEPPER: pepper, APP_ENV: "test" },
    state = new MemoryState();
  const makeApp = () =>
    new MetiApp({ databases, state, env, now: () => clock.now });
  let app = makeApp();
  const call = async (
    path,
    { method = "GET", body, session, key, headers = {} } = {},
  ) => {
    const response = await app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(!["GET", "HEAD"].includes(method)
            ? { Origin: "http://localhost" }
            : {}),
          ...(session
            ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
            : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  };
  const login = async (username = "alpha") => {
    const r = await call("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    if (r.status !== 200) throw new Error(`Login failed: ${r.status}`);
    return {
      cookie: r.headers.get("set-cookie").split(";")[0],
      csrf: r.data.csrf_token,
    };
  };
  return {
    databases,
    users,
    password,
    env,
    state,
    stats,
    paths,
    dir,
    clock,
    makeApp,
    get app() {
      return app;
    },
    restart() {
      app = makeApp();
    },
    call,
    login,
    async close() {
      for (const c of clients) c.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
