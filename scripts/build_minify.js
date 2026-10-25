const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function build() {
  console.log('🚀 Starting METI production build & minification...');
  const root = path.join(__dirname, '..');
  const dist = path.join(root, 'dist');

  if (!fs.existsSync(dist)) {
    fs.mkdirSync(dist, { recursive: true });
  }

  // 1. Minify analytics-engine.js
  const engineSrc = fs.readFileSync(path.join(root, 'analytics-engine.js'), 'utf8');
  console.log(`📦 Minifying analytics-engine.js (${(engineSrc.length / 1024).toFixed(1)} KB)...`);
  const engineMin = await minify(engineSrc, {
    compress: {
      defaults: false,
      drop_debugger: true,
      dead_code: true
    },
    mangle: false,
    format: {
      comments: false
    }
  });
  if (engineMin.error) throw engineMin.error;
  const engineDist = path.join(dist, 'analytics-engine.min.js');
  fs.writeFileSync(engineDist, engineMin.code, 'utf8');
  const engineSaved = (((engineSrc.length - engineMin.code.length) / engineSrc.length) * 100).toFixed(1);
  console.log(`  ✓ Written dist/analytics-engine.min.js (${(engineMin.code.length / 1024).toFixed(1)} KB, saved ${engineSaved}%)`);

  // 2. Minify dashboard-ui.js
  const uiSrc = fs.readFileSync(path.join(root, 'dashboard-ui.js'), 'utf8');
  console.log(`📦 Minifying dashboard-ui.js (${(uiSrc.length / 1024).toFixed(1)} KB)...`);
  const uiMin = await minify(uiSrc, {
    compress: {
      defaults: false,
      drop_debugger: true,
      dead_code: true
    },
    mangle: false,
    format: {
      comments: false
    }
  });
  if (uiMin.error) throw uiMin.error;
  const uiDist = path.join(dist, 'dashboard-ui.min.js');
  fs.writeFileSync(uiDist, uiMin.code, 'utf8');
  const uiSaved = (((uiSrc.length - uiMin.code.length) / uiSrc.length) * 100).toFixed(1);
  console.log(`  ✓ Written dist/dashboard-ui.min.js (${(uiMin.code.length / 1024).toFixed(1)} KB, saved ${uiSaved}%)`);

  // 3. Minify dashboard-ui.css
  const cssSrc = fs.readFileSync(path.join(root, 'dashboard-ui.css'), 'utf8');
  console.log(`🎨 Minifying dashboard-ui.css (${(cssSrc.length / 1024).toFixed(1)} KB)...`);
  const cssMin = cssSrc
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/\s+/g, ' ')             // collapse whitespace
    .replace(/\s*([\{\}:;,])\s*/g, '$1') // remove space around separators
    .replace(/;}/g, '}')              // remove trailing semicolon
    .trim();
  const cssDist = path.join(dist, 'dashboard-ui.min.css');
  fs.writeFileSync(cssDist, cssMin, 'utf8');
  const cssSaved = (((cssSrc.length - cssMin.length) / cssSrc.length) * 100).toFixed(1);
  console.log(`  ✓ Written dist/dashboard-ui.min.css (${(cssMin.length / 1024).toFixed(1)} KB, saved ${cssSaved}%)`);

  console.log('✅ Build completed successfully!');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
