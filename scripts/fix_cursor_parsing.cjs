const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');

const target = `        if (cursor && cursor.includes(":")) {
          const parts = cursor.split(":");
          cursorTimestamp = parts[0];
          cursorId = parseInt(parts[1], 10) || 0;
        } else if (cursor && /^\\d+$/.test(cursor)) {
          cursorId = parseInt(cursor, 10);
        }`;

const replacement = `        if (cursor && cursor.includes(":")) {
          const lastColon = cursor.lastIndexOf(":");
          cursorTimestamp = cursor.slice(0, lastColon).trim();
          cursorId = parseInt(cursor.slice(lastColon + 1), 10) || 0;
        } else if (cursor && /^\\d+$/.test(cursor)) {
          cursorId = parseInt(cursor, 10);
        }`;

const normalizedCode = code.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');

if (!normalizedCode.includes(normalizedTarget)) {
  console.error("Target cursor parsing not found!");
  process.exit(1);
}

const updated = normalizedCode.replace(normalizedTarget, replacement.replace(/\r\n/g, '\n'));
fs.writeFileSync(filePath, code.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated, 'utf8');
console.log("Successfully fixed ISO timestamp cursor parsing with lastIndexOf(':') in backend/src/index.js");
