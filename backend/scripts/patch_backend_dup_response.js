import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/index.js");
let code = fs.readFileSync(filePath, "utf8");

const oldStr = `        // Check for duplicate task ID and pass
        const dupCheck = await db(
          env,
          "SELECT id FROM task_submissions WHERE task_id = ? AND (pass = ? OR ? = '') LIMIT 1",
          [task_id, pass, pass]
        );
        if (dupCheck.length > 0) {
          return json({ error: "duplicate_task", message: "Task ID already submitted!" }, 409, corsHeaders);
        }`;

const newStr = `        // Check for duplicate task ID and pass
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
        }`;

const oldCRLF = oldStr.replace(/\n/g, "\r\n");
const newCRLF = newStr.replace(/\n/g, "\r\n");

if (code.includes(oldCRLF)) {
  code = code.replace(oldCRLF, newCRLF);
  fs.writeFileSync(filePath, code, "utf8");
  console.log("Updated with CRLF");
} else if (code.includes(oldStr)) {
  code = code.replace(oldStr, newStr);
  fs.writeFileSync(filePath, code, "utf8");
  console.log("Updated with LF");
} else {
  console.error("Target string not found in src/index.js");
  process.exit(1);
}
