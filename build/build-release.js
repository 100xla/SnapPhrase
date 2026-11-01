/**
 * SatzTresor Release Builder (Cloud-Drive Safe)
 * Builds Electron packages in a local OS temp staging directory to prevent EPERM rename locks
 * from cloud sync drives / antivirus, verifies that no personal
 * bausteine.ini is bundled inside app.asar, and copies the finished installers into ./dist.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const finalDistDir = path.join(projectRoot, 'dist');
const stageDir = path.join(os.tmpdir(), 'satztresor-dist-stage');

const targets = process.argv.slice(2);
if (targets.length === 0) {
  targets.push('nsis', 'portable');
}

console.log(`[SatzTresor Build] Preparing local staging directory: ${stageDir}`);
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

// Clean any stale .tmp folder in dist/ left by interrupted cloud-drive builds
const staleTmp = path.join(finalDistDir, 'win-unpacked.tmp');
if (fs.existsSync(staleTmp)) {
  try {
    fs.rmSync(staleTmp, { recursive: true, force: true });
  } catch (e) {}
}

const cliPath = path.join(projectRoot, 'node_modules', 'electron-builder', 'cli.js');
const args = [
  cliPath,
  '--win',
  ...targets,
  `--config.directories.output=${stageDir}`,
];

console.log(`[SatzTresor Build] Running: electron-builder --win ${targets.join(' ')}`);
const res = spawnSync(process.execPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (res.status !== 0) {
  console.error(`[SatzTresor Build] Build failed with exit code ${res.status}`);
  process.exit(res.status || 1);
}

// Security Gate: Inspect app.asar header to guarantee no personal bausteine.ini was packaged
const asarPath = path.join(stageDir, 'win-unpacked', 'resources', 'app.asar');
if (fs.existsSync(asarPath)) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerStrLen = sizeBuf.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerStrLen);
    fs.readSync(fd, headerBuf, 0, headerStrLen, 16);
    const headerJson = JSON.parse(headerBuf.toString('utf8'));
    if (headerJson.files && headerJson.files['bausteine.ini']) {
      console.error('[SatzTresor Build] SECURITY ABORT: bausteine.ini was found in app.asar!');
      process.exit(1);
    }
    console.log('[SatzTresor Build] Security check passed: No personal bausteine.ini in app.asar.');
  } finally {
    fs.closeSync(fd);
  }
}

if (!fs.existsSync(finalDistDir)) {
  fs.mkdirSync(finalDistDir, { recursive: true });
}

const copyExts = ['.exe', '.appx', '.msix', '.blockmap'];
const builtFiles = fs.readdirSync(stageDir);
let copiedCount = 0;

for (const file of builtFiles) {
  const ext = path.extname(file).toLowerCase();
  if (copyExts.includes(ext)) {
    const src = path.join(stageDir, file);
    const dest = path.join(finalDistDir, file);
    fs.copyFileSync(src, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[SatzTresor Build] Ready: dist/${file} (${sizeMb} MB)`);
    copiedCount++;
  }
}

// Clean up temp staging directory to save disk space
try {
  fs.rmSync(stageDir, { recursive: true, force: true });
} catch (e) {}

console.log(`[SatzTresor Build] Done! ${copiedCount} artifact(s) copied to ./dist`);
