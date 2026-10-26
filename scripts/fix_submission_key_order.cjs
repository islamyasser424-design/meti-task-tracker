const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(indexPath, 'utf8');

// Normalize line endings
const isCRLF = code.includes('\r\n');
let normalized = code.replace(/\r\n/g, '\n');

// 1. Fix Sheet 1
const s1Bad = `            const sheetRowIndex = currentOffset + i + 1; // 1-based row number
            const submissionKey = \`sub:\${tid}|\${lab_name}|\${ts}|\${pas}\`;

            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();
            const created = String(vals[15] || ts).trim();`;

const s1Good = `            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();
            const created = String(vals[15] || ts).trim();
            const submissionKey = \`sub:\${tid}|\${lab_name}|\${ts}|\${pas}\`;`;

if (!normalized.includes(s1Bad)) {
  console.error("s1Bad not found!");
  process.exit(1);
}
normalized = normalized.replace(s1Bad, s1Good);

// 2. Fix Sheet 2
const s2Bad = `            const sheetRowIndex = currentOffset + i + 1;
            const submissionKey = \`sub:\${tid}|\${lab_name}|\${ts}|\${pas}\`;

            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();`;

const s2Good = `            const ts = String(vals[0] || "").trim();
            const shift = String(vals[1] || "").trim();
            const unit = String(vals[2] || "").trim();
            const qtc_name = String(vals[3] || "").trim();
            const yk_email = String(vals[4] || "").trim().toLowerCase();
            const lab_name = String(vals[5] || "").trim();
            const nat_id = String(vals[6] || "").trim();
            const pc_no = String(vals[7] || "").trim();
            const mod = String(vals[8] || "").trim();
            const queue = String(vals[9] || "").trim();
            const link = String(vals[10] || "").trim();
            const tid = String(vals[11] || "").trim();
            const obj_cnt = parseInt(vals[12] || 0, 10) || 0;
            const pas = String(vals[13] || "QA").trim().toUpperCase();
            const stage = String(vals[14] || "").trim();
            const submissionKey = \`sub:\${tid}|\${lab_name}|\${ts}|\${pas}\`;`;

if (!normalized.includes(s2Bad)) {
  console.error("s2Bad not found!");
  process.exit(1);
}
normalized = normalized.replace(s2Bad, s2Good);

fs.writeFileSync(indexPath, isCRLF ? normalized.replace(/\n/g, '\r\n') : normalized, 'utf8');
console.log("Successfully fixed submissionKey order in backend/src/index.js!");
