const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function build() {
  console.log('🚀 Starting METI production build & modular bundling...');
  const root = path.join(__dirname, '..');
  const dist = path.join(root, 'dist');
  const modulesDir = path.join(root, 'src', 'modules');

  if (!fs.existsSync(dist)) {
    fs.mkdirSync(dist, { recursive: true });
  }

  // 1. Bundle modular files from src/modules/ into dashboard-ui.js
  let uiSrc = '';
  if (fs.existsSync(modulesDir)) {
    const moduleFiles = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js')).sort();
    console.log(`🧩 Bundling ${moduleFiles.length} modules from src/modules/...`);
    uiSrc = moduleFiles.map(f => fs.readFileSync(path.join(modulesDir, f), 'utf8')).join('\n');
    fs.writeFileSync(path.join(root, 'dashboard-ui.js'), uiSrc, 'utf8');
    console.log(`  ✓ Assembled dashboard-ui.js (${(uiSrc.length / 1024).toFixed(1)} KB)`);
  } else {
    uiSrc = fs.readFileSync(path.join(root, 'dashboard-ui.js'), 'utf8');
  }

  // 2. Minify dashboard-ui.js -> dist/dashboard-ui.min.js
  console.log(`📦 Minifying dashboard-ui.js...`);
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

  // 3. Minify analytics-engine.js -> dist/analytics-engine.min.js
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

  // 4. Minify dashboard-ui.css -> dist/dashboard-ui.min.css
  const cssSrc = fs.readFileSync(path.join(root, 'dashboard-ui.css'), 'utf8');
  console.log(`🎨 Minifying dashboard-ui.css (${(cssSrc.length / 1024).toFixed(1)} KB)...`);
  const cssMin = cssSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([\{\}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
  const cssDist = path.join(dist, 'dashboard-ui.min.css');
  fs.writeFileSync(cssDist, cssMin, 'utf8');
  const cssSaved = (((cssSrc.length - cssMin.length) / cssSrc.length) * 100).toFixed(1);
  console.log(`  ✓ Written dist/dashboard-ui.min.css (${(cssMin.length / 1024).toFixed(1)} KB, saved ${cssSaved}%)`);

  console.log('✅ Build & bundling completed successfully!');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
