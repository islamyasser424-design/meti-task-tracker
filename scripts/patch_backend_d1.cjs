const fs = require('fs');

let content = fs.readFileSync('backend/src/index.js', 'utf8');

// 1. Patch db() function
const oldDbFn = `async function db(env, sql, params = []) {
  const url = env.TURSO_URL;
  const token = env.TURSO_TOKEN;
  if (!url || !token) throw new Error("Database configuration missing (TURSO_URL or TURSO_TOKEN)");

  const endpoint = url.replace(/\\/v2\\/pipeline\\/?$/, "").replace(/\\/$/, "") + "/v2/pipeline";
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
    throw new Error(\`Database service HTTP \${res.status}: \${errText}\`);
  }

  const data = await res.json();
  const firstResult = data.results?.[0];
  if (!firstResult) throw new Error("Database returned empty result");
  if (firstResult.type === "error") {
    throw new Error(\`Database query error: \${firstResult.error?.message || "unknown"}\`);
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
}`;

const newDbFn = `async function db(env, sql, params = []) {
  // 1. Cloudflare D1 Native Edge Database (100% Free, High Limits, Sub-ms Speed)
  if (env.DB) {
    try {
      const stmt = params.length > 0 ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
      const isSelect = /^\\s*(SELECT|WITH|PRAGMA|EXPLAIN)\\b/i.test(sql);
      if (isSelect) {
        const { results } = await stmt.all();
        return results || [];
      } else {
        const info = await stmt.run();
        return info;
      }
    } catch (d1Err) {
      console.error("[D1 Query Error]:", d1Err.message || d1Err, "SQL:", sql);
      throw d1Err;
    }
  }

  // 2. Fallback to Turso / LibSQL pipeline
  const url = env.TURSO_URL;
  const token = env.TURSO_TOKEN;
  if (!url || !token) throw new Error("Database configuration missing (D1 or TURSO)");

  const endpoint = url.replace(/\\/v2\\/pipeline\\/?$/, "").replace(/\\/$/, "") + "/v2/pipeline";
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
    throw new Error(\`Database service HTTP \${res.status}: \${errText}\`);
  }

  const data = await res.json();
  const firstResult = data.results?.[0];
  if (!firstResult) throw new Error("Database returned empty result");
  if (firstResult.type === "error") {
    throw new Error(\`Database query error: \${firstResult.error?.message || "unknown"}\`);
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
}`;

content = content.replace(oldDbFn, newDbFn);

// 2. Patch batch execution in syncGoogleSheetsToTurso
const oldBatch = `  // Execute statements in batches of 50
  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 50) {
      const batch = stmts.slice(i, i + 50);
      await fetch(env.TURSO_URL, {
        method: "POST",
        headers: { "Authorization": \`Bearer \${env.TURSO_TOKEN}\`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: batch })
      });
    }
  }

  // Sync custom queues in a single batch request
  if (newQueues.size > 0) {
    const queueBatch = Array.from(newQueues).map(q => ({
      type: "execute",
      stmt: {
        sql: "INSERT OR IGNORE INTO custom_queues (name, highlight, created_at) VALUES (?, 'Live', datetime('now'))",
        args: [{ type: "text", value: q }]
      }
    }));
    await fetch(env.TURSO_URL, {
      method: "POST",
      headers: { "Authorization": \`Bearer \${env.TURSO_TOKEN}\`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: queueBatch })
    }).catch(e => console.warn("Queue batch sync error:", e));
  }`;

const newBatch = `  // Execute statements in batches of 50
  if (stmts.length > 0) {
    if (env.DB) {
      for (let i = 0; i < stmts.length; i += 50) {
        const batch = stmts.slice(i, i + 50);
        const d1Batch = batch.map(s => {
          const rawArgs = (s.stmt.args || []).map(a => a.value !== undefined ? a.value : null);
          return env.DB.prepare(s.stmt.sql).bind(...rawArgs);
        });
        await env.DB.batch(d1Batch).catch(e => console.warn("D1 batch sync error:", e));
      }
    } else {
      for (let i = 0; i < stmts.length; i += 50) {
        const batch = stmts.slice(i, i + 50);
        await fetch(env.TURSO_URL, {
          method: "POST",
          headers: { "Authorization": \`Bearer \${env.TURSO_TOKEN}\`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: batch })
        });
      }
    }
  }

  // Sync custom queues in a single batch request
  if (newQueues.size > 0) {
    if (env.DB) {
      const d1QBatch = Array.from(newQueues).map(q =>
        env.DB.prepare("INSERT OR IGNORE INTO custom_queues (name, highlight, created_at) VALUES (?, 'Live', datetime('now'))").bind(q)
      );
      await env.DB.batch(d1QBatch).catch(e => console.warn("D1 Queue batch sync error:", e));
    } else {
      const queueBatch = Array.from(newQueues).map(q => ({
        type: "execute",
        stmt: {
          sql: "INSERT OR IGNORE INTO custom_queues (name, highlight, created_at) VALUES (?, 'Live', datetime('now'))",
          args: [{ type: "text", value: q }]
        }
      }));
      await fetch(env.TURSO_URL, {
        method: "POST",
        headers: { "Authorization": \`Bearer \${env.TURSO_TOKEN}\`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: queueBatch })
      }).catch(e => console.warn("Queue batch sync error:", e));
    }
  }`;

content = content.replace(oldBatch, newBatch);

fs.writeFileSync('backend/src/index.js', content, 'utf8');
console.log('backend/src/index.js patched with D1 support!');
