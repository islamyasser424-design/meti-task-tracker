const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "../src/index.js");
let content = fs.readFileSync(indexPath, "utf8");

// 1. Update GET /api/queues to include is_hidden
content = content.replace(
  'SELECT id, name, highlight, created_at FROM custom_queues ORDER BY name ASC',
  'SELECT id, name, highlight, COALESCE(is_hidden, 0) AS is_hidden, created_at FROM custom_queues ORDER BY name ASC'
);

// 2. Update PUT /api/queues/(.+) to support is_hidden
const oldQueuePut = `      const queueMatch = pathname.match(/^\\/api\\/queues\\/(.+)$/);
      if (queueMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        const b = await request.json().catch(() => ({}));
        const highlight = String(b.highlight !== undefined ? b.highlight : "").trim();
        await db(env, "UPDATE custom_queues SET highlight = ? WHERE id = ? OR name = ?", [highlight, qTarget, qTarget]);
        return json({ ok: true, message: "Queue updated" }, 200, corsHeaders);
      }`;

const newQueuePut = `      const queueMatch = pathname.match(/^\\/api\\/queues\\/(.+)$/);
      if (queueMatch && request.method === "PUT") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const qTarget = decodeURIComponent(queueMatch[1]);
        const b = await request.json().catch(() => ({}));
        const highlight = b.highlight !== undefined ? String(b.highlight).trim() : null;
        const is_hidden = b.is_hidden !== undefined ? (b.is_hidden ? 1 : 0) : null;
        await db(
          env,
          "UPDATE custom_queues SET highlight = COALESCE(?, highlight), is_hidden = COALESCE(?, is_hidden) WHERE id = ? OR name = ?",
          [highlight, is_hidden, qTarget, qTarget]
        );
        return json({ ok: true, message: "Queue updated" }, 200, corsHeaders);
      }`;

if (content.includes('WHERE id = ? OR name = ?", [highlight, qTarget, qTarget]')) {
  content = content.replace(oldQueuePut.replace(/\r\n/g, "\n"), newQueuePut);
  content = content.replace(oldQueuePut, newQueuePut.replace(/\n/g, "\r\n"));
}

// 3. Add PUT /api/qtc/:id
const qtcPostBlock = `      if (pathname === "/api/qtc" && request.method === "POST") {
        if (!isSupervisor) return json({ error: "forbidden" }, 403, corsHeaders);
        const b = await request.json().catch(() => ({}));
        const shift = String(b.shift || "").trim();
        const name = String(b.name || "").trim();
        const role = String(b.role || "").trim();
        if (!shift || !name) return json({ error: "validation_error", message: "Shift and name are required" }, 400, corsHeaders);

        await db(env, "INSERT OR REPLACE INTO custom_qtc (shift, name, role) VALUES (?, ?, ?)", [shift, name, role]);
        return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);
      }`;

const qtcPutAddition = `

      const qtcUpdateMatch = pathname.match(/^\\/api\\/qtc\\/(\\d+)$/);
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
      }`;

if (!content.includes("qtcUpdateMatch")) {
  if (content.includes('return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\n      }')) {
    content = content.replace(
      'return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\n      }',
      'return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\n      }' + qtcPutAddition
    );
  } else if (content.includes('return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\r\n      }')) {
    content = content.replace(
      'return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\r\n      }',
      'return json({ ok: true, message: "QTC member added" }, 201, corsHeaders);\r\n      }' + qtcPutAddition.replace(/\n/g, "\r\n")
    );
  }
}

fs.writeFileSync(indexPath, content, "utf8");
console.log("Successfully patched backend for queue hide and QTC role update!");
