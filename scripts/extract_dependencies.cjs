const fs = require('fs');
const path = require('path');

function extractFromText(text) {
  const ids = new Set();
  const classes = new Set();
  const dataAttrs = new Set();

  // getElementById("...")
  for (const m of text.matchAll(/getElementById\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    ids.add(m[1]);
  }

  // querySelector("#..."), querySelector("....")
  for (const m of text.matchAll(/querySelector(?:All)?\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const sel = m[1];
    // extract #id
    for (const idM of sel.matchAll(/#([a-zA-Z0-9_\-]+)/g)) {
      ids.add(idM[1]);
    }
    // extract .class
    for (const clsM of sel.matchAll(/\.([a-zA-Z0-9_\-]+)/g)) {
      classes.add(clsM[1]);
    }
    // extract [data-...]
    for (const datM of sel.matchAll(/\[(data-[a-zA-Z0-9_\-]+)/g)) {
      dataAttrs.add(datM[1]);
    }
  }

  // classList.add / remove / toggle / contains
  for (const m of text.matchAll(/classList\.(?:add|remove|toggle|contains)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    classes.add(m[1]);
  }

  // getAttribute('data-...') / dataset.xxx
  for (const m of text.matchAll(/getAttribute\s*\(\s*["'](data-[a-zA-Z0-9_\-]+)["']\s*\)/g)) {
    dataAttrs.add(m[1]);
  }
  for (const m of text.matchAll(/dataset\.([a-zA-Z0-9_]+)/g)) {
    dataAttrs.add('data-' + m[1].replace(/([A-Z])/g, '-$1').toLowerCase());
  }

  return {
    ids: Array.from(ids).sort(),
    classes: Array.from(classes).sort(),
    dataAttrs: Array.from(dataAttrs).sort()
  };
}

// 1. Dashboard page: dashboard.html + dashboard-ui.js + analytics-engine.js
const dashHtml = fs.readFileSync('dashboard.html', 'utf8');
const dashJs = fs.readFileSync('dashboard-ui.js', 'utf8');
const analyticsJs = fs.readFileSync('analytics-engine.js', 'utf8');
const dashDeps = extractFromText(dashHtml + '\n' + dashJs + '\n' + analyticsJs);

// 2. Index page: index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const indexDeps = extractFromText(indexHtml);

// 3. Analytics page: analytics.html
const analyticsHtml = fs.readFileSync('analytics.html', 'utf8');
const analyticsDeps = extractFromText(analyticsHtml + '\n' + dashJs);

// 4. Health page: health.html
const healthHtml = fs.readFileSync('health.html', 'utf8');
const healthDeps = extractFromText(healthHtml);

let md = `# JavaScript Dependencies Inventory (Safety Net)

This document is the verified safety net of all DOM element IDs, classes, and data attributes accessed by client-side JavaScript.
**Strict Rule:** No ID, class, or data attribute listed here may be renamed or removed during the UI/UX redesign.

---

## 1. dashboard.html (+ dashboard-ui.js & analytics-engine.js)

### Critical IDs (${dashDeps.ids.length})
${dashDeps.ids.map(id => `- \`#${id}\``).join('\n')}

### Critical Classes (${dashDeps.classes.length})
${dashDeps.classes.map(c => `- \`.${c}\``).join('\n')}

### Data Attributes (${dashDeps.dataAttrs.length})
${dashDeps.dataAttrs.map(d => `- \`[${d}]\``).join('\n')}

---

## 2. index.html (Annotator Terminal & Submission Form)

### Critical IDs (${indexDeps.ids.length})
${indexDeps.ids.map(id => `- \`#${id}\``).join('\n')}

### Critical Classes (${indexDeps.classes.length})
${indexDeps.classes.map(c => `- \`.${c}\``).join('\n')}

### Data Attributes (${indexDeps.dataAttrs.length})
${indexDeps.dataAttrs.map(d => `- \`[${d}]\``).join('\n')}

---

## 3. analytics.html (Analytics & Reporting Suite)

### Critical IDs (${analyticsDeps.ids.length})
${analyticsDeps.ids.map(id => `- \`#${id}\``).join('\n')}

### Critical Classes (${analyticsDeps.classes.length})
${analyticsDeps.classes.length > 0 ? analyticsDeps.classes.map(c => `- \`.${c}\``).join('\n') : '- *(None directly queried)*'}

### Data Attributes (${analyticsDeps.dataAttrs.length})
${analyticsDeps.dataAttrs.length > 0 ? analyticsDeps.dataAttrs.map(d => `- \`[${d}]\``).join('\n') : '- *(None directly queried)*'}

---

## 4. health.html (System Diagnostic Monitor)

### Critical IDs (${healthDeps.ids.length})
${healthDeps.ids.map(id => `- \`#${id}\``).join('\n')}

### Critical Classes (${healthDeps.classes.length})
${healthDeps.classes.length > 0 ? healthDeps.classes.map(c => `- \`.${c}\``).join('\n') : '- *(None directly queried)*'}

### Data Attributes (${healthDeps.dataAttrs.length})
${healthDeps.dataAttrs.length > 0 ? healthDeps.dataAttrs.map(d => `- \`[${d}]\``).join('\n') : '- *(None directly queried)*'}
`;

fs.writeFileSync('JS-DEPENDENCIES.md', md, 'utf8');
console.log('JS-DEPENDENCIES.md generated successfully!');
console.log(`Dashboard IDs: ${dashDeps.ids.length}, Classes: ${dashDeps.classes.length}`);
console.log(`Index IDs: ${indexDeps.ids.length}, Classes: ${indexDeps.classes.length}`);
console.log(`Analytics IDs: ${analyticsDeps.ids.length}, Classes: ${analyticsDeps.classes.length}`);
console.log(`Health IDs: ${healthDeps.ids.length}, Classes: ${healthDeps.classes.length}`);
