const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');

// Replace duplicate declaration
const dupTarget = `        const ifNoneMatch = request.headers.get("if-none-match");
        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {`;

const dupFix = `        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {`;

if (code.includes(dupTarget)) {
  code = code.replace(dupTarget, dupFix);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log("Fixed duplicate ifNoneMatch declaration!");
} else {
  // Try CRLF / LF variations
  const norm = code.replace(/\r\n/g, '\n');
  const normTarget = `        const ifNoneMatch = request.headers.get("if-none-match");\n        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {`;
  const normFix = `        if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {`;
  if (norm.includes(normTarget)) {
    const fixed = norm.replace(normTarget, normFix);
    fs.writeFileSync(filePath, code.includes('\r\n') ? fixed.replace(/\n/g, '\r\n') : fixed, 'utf8');
    console.log("Fixed duplicate ifNoneMatch declaration (normalized)!");
  } else {
    console.log("dupTarget not found, checking count of declarations...");
    const matches = code.match(/const ifNoneMatch =/g);
    console.log("Matches:", matches ? matches.length : 0);
  }
}
