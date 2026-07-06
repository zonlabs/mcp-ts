const fs = require('fs');
const path = require('path');

const pkgDir = path.resolve(__dirname, '..', 'node_modules', '@mcp-ts', 'sdk');
const srcDir = path.resolve(__dirname, '..', '..', 'mcp-ts');

if (!fs.existsSync(srcDir)) {
  console.log('[resolve-local-pkg] mcp-ts source not found at', srcDir);
  process.exit(0);
}

const srcDist = path.join(srcDir, 'packages', 'sdk', 'dist');
const srcPkg  = path.join(srcDir, 'packages', 'sdk', 'package.json');

if (!fs.existsSync(srcDist)) {
  console.log('[resolve-local-pkg] mcp-ts dist not found — run `npm run build` in mcp-ts first');
  process.exit(0);
}

// Ensure the target directory exists
fs.mkdirSync(pkgDir, { recursive: true });

// Always overwrite dist and package.json with the latest build
fs.cpSync(srcDist, path.join(pkgDir, 'dist'), { recursive: true, force: true });
fs.copyFileSync(srcPkg, path.join(pkgDir, 'package.json'));

console.log('[resolve-local-pkg] Synced mcp-ts dist → mcp-client/node_modules/@mcp-ts/sdk');
console.log('[resolve-local-pkg] Restart mcp-client dev server to apply changes.');
