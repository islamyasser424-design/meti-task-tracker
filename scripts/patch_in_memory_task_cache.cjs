const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'src', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');
const isCrlf = code.includes('\r\n');

// Normalize for replacement
const normalizedCode = code.replace(/\r\n/g, '\n');

const target1 = `        const role = user ? user.role : "qt";
        const isSupervisor = isAdminOrSuper(role);
        const roleScope = isSupervisor ? "supervisor" : "standard";`;

const replacement1 = `        const role = user ? user.role : "qt";
        const isSupervisor = isAdminOrSuper(role);
        const roleScope = isSupervisor ? "supervisor" : "standard";
        const cacheKey = \`tasks:\${url.search}:\${roleScope}\`;
        const ifNoneMatch = request.headers.get("if-none-match");

        // 1. Check in-memory Worker cache (15-second TTL per roleScope & query)
        // Eliminates D1 database reads completely on repeated polls or 304 revalidations
        const cached = IN_MEMORY_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 15000)) {
          if (ifNoneMatch && etagMatches(ifNoneMatch, cached.etag)) {
            return new Response(null, {
              status: 304,
              headers: {
                "ETag": cached.etag,
                "Cache-Control": "private, no-cache, must-revalidate",
                "Vary": "Authorization, Cookie",
                ...corsHeaders
              }
            });
          }
          return new Response(cached.responseBody, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "ETag": cached.etag,
              "Cache-Control": "private, no-cache, must-revalidate",
              "Vary": "Authorization, Cookie",
              ...corsHeaders
            }
          });
        }`;

if (!normalizedCode.includes(target1)) {
  console.error("Target 1 not found!");
  process.exit(1);
}
let newCode = normalizedCode.replace(target1, replacement1);

// 2. Add cache saving
const target2 = `        // Robust ETag based on exact content payload + roleScope + source
        const etag = \`"tasks-\${sourceParam || 'all'}-\${roleScope}-\${hashContent(responseBody)}"\`;`;

const replacement2 = `        // Robust ETag based on exact content payload + roleScope + source
        const etag = \`"tasks-\${sourceParam || 'all'}-\${roleScope}-\${hashContent(responseBody)}"\`;

        // Cache response in memory to eliminate future D1 reads within 15s window
        if (IN_MEMORY_CACHE.size > 32) {
          const firstKey = IN_MEMORY_CACHE.keys().next().value;
          IN_MEMORY_CACHE.delete(firstKey);
        }
        IN_MEMORY_CACHE.set(cacheKey, { etag, responseBody, timestamp: Date.now() });`;

if (!newCode.includes(target2)) {
  console.error("Target 2 not found!");
  process.exit(1);
}
newCode = newCode.replace(target2, replacement2);

// 3. Clear cache on new tasks sync
const target3 = `            totalNewRows++;
          }

          currentOffset += rawRows.length;`;

const replacement3 = `            totalNewRows++;
          }

          if (totalNewRows > 0) {
            IN_MEMORY_CACHE.clear();
          }

          currentOffset += rawRows.length;`;

if (!newCode.includes(target3)) {
  console.error("Target 3 not found!");
  process.exit(1);
}
newCode = newCode.replace(target3, replacement3);

// Restore original line endings
if (isCrlf) {
  newCode = newCode.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, newCode, 'utf8');
console.log("Successfully patched backend/src/index.js with in-memory task caching!");
