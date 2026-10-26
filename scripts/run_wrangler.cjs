const { spawnSync } = require('child_process');
const path = require('path');

const wranglerBin = path.join(__dirname, '..', 'backend', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const args = process.argv.slice(2);

console.log(`[Wrangler Runner] Executing: node ${wranglerBin} ${args.join(' ')}`);

const result = spawnSync(process.execPath, [wranglerBin, ...args], {
  cwd: path.join(__dirname, '..', 'backend'),
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status || 0);
