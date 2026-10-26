const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(indexPath, 'utf8');

// Add etagMatches helper after hashContent
const hashTarget = `function hashContent(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}`;

const hashReplacement = `function hashContent(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// RFC 7232 compliant ETag matcher (strips optional W/ prefix added by Cloudflare gzip/brotli proxy)
function etagMatches(clientHeader, serverEtag) {
  if (!clientHeader || !serverEtag) return false;
  const cleanClient = String(clientHeader).replace(/^W\\//i, '').replace(/^"|"$/g, '').trim();
  const cleanServer = String(serverEtag).replace(/^W\\//i, '').replace(/^"|"$/g, '').trim();
  return cleanClient === cleanServer;
}`;

let normalized = code.replace(/\r\n/g, '\n');
const nHashTarget = hashTarget.replace(/\r\n/g, '\n');

if (!normalized.includes(nHashTarget)) {
  console.error("hashTarget not found!");
  process.exit(1);
}

normalized = normalized.replace(nHashTarget, hashReplacement.replace(/\r\n/g, '\n'));

// Replace exact comparisons with etagMatches
normalized = normalized.replace(
  'if (ifNoneMatch && ifNoneMatch === cached.etag) {',
  'if (ifNoneMatch && etagMatches(ifNoneMatch, cached.etag)) {'
);

normalized = normalized.replace(
  'if (ifNoneMatch && ifNoneMatch === etag) {',
  'if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {'
);

fs.writeFileSync(indexPath, code.includes('\r\n') ? normalized.replace(/\n/g, '\r\n') : normalized, 'utf8');
console.log("Successfully added RFC 7232 ETag matching to backend/src/index.js!");
