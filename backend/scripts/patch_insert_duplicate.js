import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/index.js");
let code = fs.readFileSync(filePath, "utf8");

const oldBlock = `        await db(
          env,
          \`INSERT INTO task_submissions 
           (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
          [
            timestamp, shift, unit, pc_no, labeler_name, national_id,
            qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id,
            pass, modality, queue_name, object_count
          ]
        );`;

const newBlock = `        try {
          await db(
            env,
            \`INSERT INTO task_submissions 
             (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
            [
              timestamp, shift, unit, pc_no, labeler_name, national_id,
              qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id,
              pass, modality, queue_name, object_count
            ]
          );
        } catch (insertErr) {
          if (String(insertErr.message || "").includes("UNIQUE constraint failed")) {
            return json({ error: "duplicate_task", message: "Task ID already submitted!" }, 409, corsHeaders);
          }
          throw insertErr;
        }`;

// Handle both CRLF and LF
const oldBlockCRLF = oldBlock.replace(/\n/g, "\r\n");
const newBlockCRLF = newBlock.replace(/\n/g, "\r\n");

if (code.includes(oldBlockCRLF)) {
  code = code.replace(oldBlockCRLF, newBlockCRLF);
  fs.writeFileSync(filePath, code, "utf8");
  console.log("Replaced with CRLF");
} else if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync(filePath, code, "utf8");
  console.log("Replaced with LF");
} else {
  console.error("Could not find oldBlock in src/index.js");
  process.exit(1);
}
