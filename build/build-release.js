/**
 * SnapPhrase Release Builder (Cloud-Drive Safe + Auto-Update Metadata)
 * - Auto-syncs GitHub owner/repo from GITHUB_REPOSITORY or `git remote get-url origin` when available
 * - Builds Electron packages in a local OS temp staging directory to prevent EPERM rename locks
 * - Verifies that no personal bausteine.ini or snapphrase-ui.json / satztresor-ui.json is bundled inside app.asar
 * - Copies finished installers, .blockmap delta maps, and latest.yml into ./dist while removing stale versions
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(projectRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const pkgVersion = pkg.version;
const finalDistDir = path.join(projectRoot, 'dist');
const stageDir = path.join(os.tmpdir(), 'snapphrase-dist-stage');

function detectGitHubSlug() {
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.includes('/')) {
    return process.env.GITHUB_REPOSITORY.trim();
  }
  try {
    const gitRes = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (gitRes.status === 0 && gitRes.stdout) {
      const url = gitRes.stdout.trim();
      const match = url.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
    }
  } catch (e) {}
  return '';
}

const detectedSlug = detectGitHubSlug();
if (detectedSlug) {
  const [owner, repo] = detectedSlug.split('/');
  const curPub = Array.isArray(pkg.build?.publish) ? pkg.build.publish[0] : null;
  if (!curPub || curPub.owner !== owner || curPub.repo !== repo) {
    pkg.build = pkg.build || {};
    pkg.build.publish = [{ provider: 'github', owner, repo, releaseType: 'release' }];
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[SnapPhrase Build] Auto-synced GitHub publish target: ${owner}/${repo}`);
  }
}

const rawArgs = process.argv.slice(2);
const shouldPublish = rawArgs.includes('--publish');
const targets = rawArgs.filter((a) => !a.startsWith('--'));
if (targets.length === 0) {
  targets.push('nsis', 'portable');
}

if (shouldPublish) {
  const curPub = Array.isArray(pkg.build?.publish) ? pkg.build.publish[0] : null;
  if (!curPub || !curPub.owner || curPub.owner === 'DEIN-GITHUB-NAME') {
    console.error('[SnapPhrase Build] Bitte zuerst GitHub-Repo setzen: npm run repo -- <name>/<repo>');
    process.exit(1);
  }
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('[SnapPhrase Build] Zum direkten Veröffentlichen fehlt die Umgebungsvariable GH_TOKEN.');
    process.exit(1);
  }
}

console.log(`[SnapPhrase Build] Preparing local staging directory: ${stageDir}`);
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
  '--publish',
  shouldPublish ? 'always' : 'never',
  `--config.directories.output=${stageDir}`,
];

console.log(
  `[SnapPhrase Build] Running: electron-builder --win ${targets.join(' ')} --publish ${shouldPublish ? 'always' : 'never'}`
);
const res = spawnSync(process.execPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (res.status !== 0) {
  console.error(`[SnapPhrase Build] Build failed with exit code ${res.status}`);
  process.exit(res.status || 1);
}

// Security Gate: Inspect app.asar header to guarantee no personal bausteine.ini or UI config was packaged
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
    if (
      headerJson.files &&
      (headerJson.files['bausteine.ini'] ||
        headerJson.files['snapphrase-ui.json'] ||
        headerJson.files['satztresor-ui.json'])
    ) {
      console.error('[SnapPhrase Build] SECURITY ABORT: personal data/config file was found in app.asar!');
      process.exit(1);
    }
    console.log('[SnapPhrase Build] Security check passed: No personal bausteine.ini or UI config in app.asar.');
  } finally {
    fs.closeSync(fd);
  }
}

if (!fs.existsSync(finalDistDir)) {
  fs.mkdirSync(finalDistDir, { recursive: true });
} else {
  // Remove stale installer/portable artifacts from older versions or old brand names so dist/ stays unambiguous
  for (const existing of fs.readdirSync(finalDistDir)) {
    const ext = path.extname(existing).toLowerCase();
    const isStaleVersion = !existing.includes(`-${pkgVersion}.`) || existing.toLowerCase().startsWith('satztresor-');
    if (['.exe', '.appx', '.msix', '.blockmap'].includes(ext) && isStaleVersion) {
      try {
        fs.rmSync(path.join(finalDistDir, existing), { force: true });
        console.log(`[SnapPhrase Build] Removed outdated artifact: dist/${existing}`);
      } catch (e) {}
    }
  }
}

const copyExts = ['.exe', '.appx', '.msix', '.blockmap'];
const exactCopyFiles = new Set(['latest.yml']);
const builtFiles = fs.readdirSync(stageDir);
let copiedCount = 0;

for (const file of builtFiles) {
  const ext = path.extname(file).toLowerCase();
  if (copyExts.includes(ext) || exactCopyFiles.has(file.toLowerCase())) {
    const src = path.join(stageDir, file);
    const dest = path.join(finalDistDir, file);
    fs.copyFileSync(src, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
    console.log(`[SnapPhrase Build] Ready: dist/${file} (${sizeMb} MB)`);
    copiedCount++;
  }
}

// Clean up temp staging directory to save disk space
try {
  fs.rmSync(stageDir, { recursive: true, force: true });
} catch (e) {}

console.log(`[SnapPhrase Build] Done! ${copiedCount} artifact(s) copied to ./dist`);
