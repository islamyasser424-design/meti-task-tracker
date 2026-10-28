// Local test fixture implementing documented Hrana HTTP v2 over REAL SQLite.
// This is never bundled/deployed; it does not claim Turso billing counters.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
const decode = (value) =>
  value.type === "null"
    ? null
    : value.type === "integer"
      ? Number(value.value)
      : value.type === "float"
        ? value.value
        : value.type === "blob"
          ? Buffer.from(value.base64, "base64")
          : value.value;
const encode = (value) =>
  value === null
    ? { type: "null" }
    : typeof value === "bigint" || Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : typeof value === "number"
        ? { type: "float", value }
        : value instanceof Uint8Array
          ? { type: "blob", base64: Buffer.from(value).toString("base64") }
          : { type: "text", value: String(value) };
export async function startHrana(paths) {
  const connections = new Map(),
    metrics = { requests: 0, statements: 0 };
  const server = createServer(async (req, res) => {
    try {
      const key = req.url.split("/")[1];
      if (!paths[key] || !req.url.endsWith("/v2/pipeline")) {
        res.writeHead(404).end();
        return;
      }
      metrics.requests++;
      let bytes = "";
      for await (const chunk of req) bytes += chunk;
      const body = JSON.parse(bytes),
        baton = body.baton || randomUUID();
      let connection = connections.get(baton);
      if (!connection) {
        const db = new DatabaseSync(paths[key]);
        db.exec("PRAGMA foreign_keys=ON");
        connection = { db, sql: new Map() };
        connections.set(baton, connection);
      }
      const { db, sql } = connection;
      const execute = (stmt) => {
        metrics.statements++;
        const text = stmt.sql ?? sql.get(stmt.sql_id),
          args = (stmt.args || []).map(decode);
        const prepared = db.prepare(text),
          cols = prepared
            .columns()
            .map((c) => ({ name: c.name, decltype: c.type ?? null }));
        let rows = [],
          affected = 0,
          last = null;
        if (cols.length) {
          prepared.setReturnArrays(true);
          rows = prepared.all(...args).map((row) => row.map(encode));
        } else {
          const result = prepared.run(...args);
          affected = Number(result.changes);
          last = String(result.lastInsertRowid);
        }
        return {
          cols,
          rows,
          affected_row_count: affected,
          last_insert_rowid: last,
        };
      };
      const results = [];
      let closed = false;
      for (const item of body.requests) {
        try {
          let response;
          if (item.type === "execute")
            response = { type: "execute", result: execute(item.stmt) };
          else if (item.type === "batch") {
            const step_results = [],
              step_errors = [];
            const check = (c) =>
              !c
                ? true
                : c.type === "ok"
                  ? step_results[c.step] !== null &&
                    step_results[c.step] !== undefined
                  : c.type === "error"
                    ? !!step_errors[c.step]
                    : c.type === "not"
                      ? !check(c.cond)
                      : c.type === "and"
                        ? c.conds.every(check)
                        : c.type === "or"
                          ? c.conds.some(check)
                          : false;
            for (const step of item.batch.steps) {
              if (!check(step.condition)) {
                step_results.push(null);
                step_errors.push(null);
                continue;
              }
              try {
                step_results.push(execute(step.stmt));
                step_errors.push(null);
              } catch (e) {
                step_results.push(null);
                step_errors.push({
                  message: e.message,
                  code: /UNIQUE constraint/.test(e.message)
                    ? "SQLITE_CONSTRAINT_UNIQUE"
                    : "SQLITE_ERROR",
                });
              }
            }
            response = { type: "batch", result: { step_results, step_errors } };
          } else if (item.type === "sequence") {
            db.exec(item.sql ?? sql.get(item.sql_id));
            response = { type: "sequence" };
          } else if (item.type === "store_sql") {
            sql.set(item.sql_id, item.sql);
            response = { type: "store_sql" };
          } else if (item.type === "close_sql") {
            sql.delete(item.sql_id);
            response = { type: "close_sql" };
          } else if (item.type === "close") {
            db.close();
            connections.delete(baton);
            closed = true;
            response = { type: "close" };
          } else throw new Error("Unsupported test protocol operation");
          results.push({ type: "ok", response });
        } catch (e) {
          results.push({
            type: "error",
            error: { message: e.message, code: "SQLITE_ERROR" },
          });
        }
      }
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(
          JSON.stringify({
            baton: closed ? null : baton,
            base_url: null,
            results,
          }),
        );
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    metrics,
    close: async () => {
      for (const { db } of connections.values()) db.close();
      await new Promise((r) => server.close(r));
    },
  };
}
