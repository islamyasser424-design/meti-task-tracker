const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../src/index.js');
let code = fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Fix queue sync batch
const oldQueueSync = `  // Sync custom queues
  for (const q of newQueues) {
    await db(env, "INSERT OR IGNORE INTO custom_queues (queue_name, description) VALUES (?, 'Auto-synced from Google Sheets')", [q]).catch(() => {});
  }`;

const newQueueSync = `  // Sync custom queues in a single batch request
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

if (code.includes(oldQueueSync)) {
  code = code.replace(oldQueueSync, newQueueSync);
  console.log('Successfully replaced queue sync batch!');
} else {
  console.log('Queue sync target not found');
}

// 2. Fix dataset limit cap
const oldLimit = `const limitParam = parseInt(url.searchParams.get("limit") || "60000", 10);
        const limit = Math.min(100000, Math.max(1, isNaN(limitParam) ? 60000 : limitParam));`;

const newLimit = `const limitParam = parseInt(url.searchParams.get("limit") || "20000", 10);
        const limit = Math.min(25000, Math.max(1, isNaN(limitParam) ? 20000 : limitParam));`;

if (code.includes(oldLimit)) {
  code = code.replace(oldLimit, newLimit);
  console.log('Successfully replaced dataset limit cap!');
} else {
  console.log('Dataset limit target not found');
}

fs.writeFileSync(targetPath, code, 'utf8');
console.log('Done patching backend!');
