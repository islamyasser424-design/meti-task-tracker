import { createClient } from "@libsql/client/web";

// Official libSQL client handles transaction conditions, rollbacks and HTTP streams.
// Never fall back to D1, Sheets, another database or browser credentials.
export function createDatabases(env, onMetric = () => {}) {
  const build = (name, prefix) => {
    const url = env[`${prefix}_URL`],
      authToken = env[`${prefix}_TOKEN`];
    if (!url || !authToken) throw new Error(`Missing ${prefix} configuration`);
    const normalized = url.replace(/^libsql:\/\//, "https://");
    if (
      !normalized.startsWith("https://") &&
      !(
        env.APP_ENV === "test" &&
        /^http:\/\/(127\.0\.0\.1|localhost):/.test(normalized)
      )
    )
      throw new Error("Database must use HTTPS");
    const client = createClient({
      url: normalized,
      authToken,
      intMode: "number",
      fetch: async (input, init) => {
        const response = await fetch(input, {
          ...init,
          signal: AbortSignal.timeout(10000),
        });
        // libSQL may negotiate protobuf. Meter ONLY explicit server counters; never
        // substitute returned row counts. Management Usage API is authoritative.
        if (response.headers.get("content-type")?.includes("json")) {
          try {
            const data = await response.clone().json();
            let read = 0,
              written = 0,
              statements = 0;
            const visit = (value) => {
              if (!value || typeof value !== "object") return;
              if (
                Number.isFinite(value.rows_read) &&
                Number.isFinite(value.rows_written)
              ) {
                read += value.rows_read;
                written += value.rows_written;
                statements++;
              }
              for (const child of Object.values(value))
                if (typeof child === "object") visit(child);
            };
            visit(data);
            if (statements)
              onMetric({
                database: name,
                rows_read: read,
                rows_written: written,
                statements,
              });
          } catch {
            /* Metrics never alter commit acknowledgement. */
          }
        }
        return response;
      },
    });
    if (name !== "live") return client;
    // BEGIN IMMEDIATE routes a libSQL write transaction through the primary.
    // Use it even for these short SELECT-only live snapshots, so an edge replica
    // cannot acknowledge a newer DO marker while returning an older change log
    // or an outdated user role. It changes no rows by itself. Archive tokens
    // remain read-only; archives must finish replication before being exposed.
    return {
      execute: (stmt) => client.batch([stmt], "write").then((r) => r[0]),
      batch: (stmts) => client.batch(stmts, "write"),
      close: () => client.close(),
    };
  };
  const clients = {};
  return new Proxy(clients, {
    get(target, key) {
      if (!["live", "2025", "2026"].includes(key)) return undefined;
      return (target[key] ??= build(
        key,
        { live: "LIVE_DB", 2025: "ARCHIVE_2025", 2026: "ARCHIVE_2026" }[key],
      ));
    },
  });
}
