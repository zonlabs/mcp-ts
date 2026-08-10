const fs = require('fs');
const path = require('path');

const pkgDir = path.resolve(__dirname, '..', 'node_modules', '@mcp-ts', 'sdk');
const srcDir = path.resolve(__dirname, '..', '..', 'mcp-ts');

if (!fs.existsSync(srcDir)) {
  console.log('[resolve-local-pkg] mcp-ts source not found at', srcDir);
  process.exit(0);
}

const srcDist = path.join(srcDir, 'packages', 'sdk', 'dist');
const srcPkg = path.join(srcDir, 'packages', 'sdk', 'package.json');
const destDist = path.join(pkgDir, 'dist');
const destPkg = path.join(pkgDir, 'package.json');

if (!fs.existsSync(srcDist)) {
  console.log('[resolve-local-pkg] mcp-ts dist not found - run `npm run build` in mcp-ts first');
  process.exit(0);
}

fs.mkdirSync(pkgDir, { recursive: true });

const sameDist =
  fs.existsSync(destDist) &&
  fs.realpathSync.native(srcDist) === fs.realpathSync.native(destDist);
const samePkg =
  fs.existsSync(destPkg) &&
  fs.realpathSync.native(srcPkg) === fs.realpathSync.native(destPkg);

if (!sameDist) {
  fs.cpSync(srcDist, destDist, { recursive: true, force: true });
}

if (!samePkg) {
  fs.copyFileSync(srcPkg, destPkg);
}

console.log('[resolve-local-pkg] Synced mcp-ts dist -> mcp-client/node_modules/@mcp-ts/sdk');
console.log('[resolve-local-pkg] Restart mcp-client dev server to apply changes.');
