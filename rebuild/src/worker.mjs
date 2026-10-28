import { DurableObject } from "cloudflare:workers";
import { MetiApp, HEADERS } from "./app.mjs";
import { createDatabases } from "./db.mjs";

export class DurableState {
  constructor(sql) {
    this.sql = sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS coordinator_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER,user_id TEXT)",
    );
    sql.exec(
      "CREATE INDEX IF NOT EXISTS coordinator_expiry ON coordinator_state(expires)",
    );
    sql.exec(
      "CREATE INDEX IF NOT EXISTS coordinator_user ON coordinator_state(user_id)",
    );
  }
  async get(key) {
    const row = this.sql
      .exec("SELECT value FROM coordinator_state WHERE key=?", key)
      .toArray()[0];
    return row ? JSON.parse(row.value) : undefined;
  }
  async put(key, value) {
    this.sql.exec(
      "INSERT INTO coordinator_state(key,value,expires,user_id) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires,user_id=excluded.user_id",
      key,
      JSON.stringify(value),
      value?.expires ?? value?.until ?? null,
      value?.user?.id ?? null,
    );
  }
  async putIfAbsent(key, value) {
    if ((await this.get(key)) === undefined) await this.put(key, value);
  }
  async putIfChanged(key, value) {
    if (JSON.stringify(await this.get(key)) !== JSON.stringify(value))
      await this.put(key, value);
  }
  async delete(key) {
    this.sql.exec("DELETE FROM coordinator_state WHERE key=?", key);
  }
  async revokeUser(id) {
    this.sql.exec("DELETE FROM coordinator_state WHERE user_id=?", id);
  }
  cleanup() {
    this.sql.exec(
      "DELETE FROM coordinator_state WHERE key IN (SELECT key FROM coordinator_state WHERE expires<? LIMIT 500)",
      Date.now(),
    );
  }
}
export class MetiCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = new DurableState(ctx.storage.sql);
    const databases = createDatabases(env, (metric) =>
      console.log(JSON.stringify({ event: "database_usage", ...metric })),
    );
    this.app = new MetiApp({ databases, state: this.state, env });
  }
  async fetch(request) {
    this.state.cleanup();
    return this.app.fetch(request);
  }
}
export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url),
      path = requestUrl.pathname;
    if (requestUrl.protocol !== "https:" && env.APP_ENV !== "test") {
      requestUrl.protocol = "https:";
      return Response.redirect(requestUrl, 308);
    }
    if (path.startsWith("/api/"))
      return env.METI.get(env.METI.idFromName("meti-v1")).fetch(request);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(HEADERS))
      if (key !== "Content-Type" && key !== "Vary") headers.set(key, value);
    if (path.endsWith(".css") || path.endsWith(".js"))
      headers.set("Cache-Control", "public, max-age=300");
    return new Response(response.body, { status: response.status, headers });
  },
};
